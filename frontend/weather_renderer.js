import {
  feetToMeters,
  extractPolygonRings,
  parseWeatherAltFeet
} from "./map_layers.js";

function computeRingCentroid(flatDegrees) {
  let sumLon = 0;
  let sumLat = 0;
  let count = 0;
  for (let i = 0; i + 1 < flatDegrees.length; i += 2) {
    sumLon += flatDegrees[i];
    sumLat += flatDegrees[i + 1];
    count++;
  }
  return count > 0 ? { lon: sumLon / count, lat: sumLat / count } : null;
}

function extractLineStringDegrees(geometry) {
  if (!geometry || geometry.type !== "LineString" || !Array.isArray(geometry.coordinates)) return null;
  const flat = [];
  for (const pair of geometry.coordinates) {
    if (Array.isArray(pair) && pair.length >= 2) {
      const [lon, lat] = pair;
      if (Number.isFinite(Number(lon)) && Number.isFinite(Number(lat))) {
        flat.push(Number(lon), Number(lat));
      }
    }
  }
  return flat.length >= 4 ? flat : null;
}

export function updateWeatherLayerOpacity(dataSource, alphaVal) {
  const alpha = Math.max(0.0, Math.min(1.0, Number(alphaVal)));
  const outlineAlpha = Math.min(1.0, alpha + 0.35);

  dataSource.entities.values.forEach(entity => {
    if (entity.polygon) {
      const baseColor = entity._baseFillColor || Cesium.Color.DEEPSKYBLUE;
      const baseEdge = entity._baseEdgeColor || Cesium.Color.CYAN;
      entity.polygon.material = baseColor.withAlpha(alpha);
      entity.polygon.outlineColor = baseEdge.withAlpha(outlineAlpha);
    }
    if (entity.wall) {
      const baseColor = entity._baseFillColor || Cesium.Color.DEEPSKYBLUE;
      const baseEdge = entity._baseEdgeColor || Cesium.Color.CYAN;
      entity.wall.material = baseColor.withAlpha(alpha);
      entity.wall.outlineColor = baseEdge.withAlpha(outlineAlpha);
    }
    if (entity.polyline) {
      const baseEdge = entity._baseEdgeColor || Cesium.Color.CYAN;
      entity.polyline.material = baseEdge.withAlpha(outlineAlpha);
    }
  });
}

export function renderWeatherVolumes(
  sources,
  data,
  opacities = { airmet: 0.22, sigmet: 0.26 },
  lowPowerMode = false
) {
  sources.icing.entities.removeAll();
  sources.storms.entities.removeAll();

  const airmetAlpha = Math.max(0.0, Math.min(1.0, Number(opacities.airmet ?? 0.22)));
  const sigmetAlpha = Math.max(0.0, Math.min(1.0, Number(opacities.sigmet ?? 0.26)));
  const meshGranularity = lowPowerMode ? 0.14 : 0.08;

  const airmetFeatures = data.icing_geojson?.features || [];
  const sigmetFeatures = data.storms_geojson?.features || [];

  // 1. Render G-AIRMETs (3D Extruded Walls OR Flat 2D Polygons in Low-Power GPU Mode)
  airmetFeatures.forEach((feat, idx) => {
    const props = feat.properties || {};
    const hazardStr = String(props.hazard || "ICE").toUpperCase();
    const baseFt = parseWeatherAltFeet(props, "base");
    const topFt = Math.max(baseFt + 5000, parseWeatherAltFeet(props, "top"));
    const topM = lowPowerMode ? 0 : Math.max(28000, feetToMeters(topFt) * 4.0);
    const labelAltM = lowPowerMode ? 1000 : topM + 4000;

    let baseFill = Cesium.Color.DEEPSKYBLUE;
    let edgeColor = Cesium.Color.CYAN;
    if (hazardStr.includes("TURB")) {
      baseFill = Cesium.Color.MEDIUMPURPLE;
      edgeColor = Cesium.Color.VIOLET;
    } else if (hazardStr.includes("IFR") || hazardStr.includes("MT_OBSC")) {
      baseFill = Cesium.Color.GOLD;
      edgeColor = Cesium.Color.ORANGE;
    }

    const commonProps = {
      entityType: "WEATHER_VOLUME",
      advisoryCategory: "G-AIRMET",
      hazard: hazardStr,
      severity: props.severity || "MODERATE",
      baseFt,
      topFt,
      validTime: props.validTime || props.expireTime || "Active Advisory",
      dueTo: props.due_to || props.rawAirmet || `${hazardStr} advisory`
    };

    const rings = extractPolygonRings(feat.geometry);
    if (rings.length > 0) {
      rings.forEach((coords, rIdx) => {
        const centroid = computeRingCentroid(coords);
        const polyConfig = {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(coords),
          height: 0,
          arcType: Cesium.ArcType.GEODESIC,
          granularity: meshGranularity,
          fill: true,
          material: baseFill.withAlpha(airmetAlpha),
          outline: true,
          outlineColor: edgeColor.withAlpha(Math.min(1.0, airmetAlpha + 0.35)),
          outlineWidth: 2
        };

        if (!lowPowerMode) {
          polyConfig.extrudedHeight = topM;
          polyConfig.closeTop = false;
          polyConfig.closeBottom = false;
        }

        const ent = sources.icing.entities.add({
          id: `airmet_poly_${idx}_${rIdx}`,
          name: `G-AIRMET ${hazardStr} (${props.tag || idx + 1})`,
          position: centroid ? Cesium.Cartesian3.fromDegrees(centroid.lon, centroid.lat, labelAltM) : undefined,
          label: centroid
            ? {
                text: `AIRMET ${hazardStr}\nFL${Math.round(baseFt / 100)}–FL${Math.round(topFt / 100)}`,
                font: "bold 11px sans-serif",
                fillColor: edgeColor,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 3,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 8500000)
              }
            : undefined,
          properties: commonProps,
          polygon: polyConfig
        });
        ent._baseFillColor = baseFill;
        ent._baseEdgeColor = edgeColor;
      });
      return;
    }

    const lineCoords = extractLineStringDegrees(feat.geometry);
    if (lineCoords) {
      const entitySpec = {
        id: `airmet_line_${idx}`,
        name: `G-AIRMET ${hazardStr} Contour`,
        properties: commonProps
      };

      if (lowPowerMode) {
        entitySpec.polyline = {
          positions: Cesium.Cartesian3.fromDegreesArray(lineCoords),
          width: 3,
          material: edgeColor.withAlpha(Math.min(1.0, airmetAlpha + 0.35))
        };
      } else {
        entitySpec.wall = {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(
            lineCoords.reduce((acc, val, i) => {
              acc.push(val);
              if (i % 2 === 1) acc.push(topM);
              return acc;
            }, [])
          ),
          material: baseFill.withAlpha(airmetAlpha),
          outline: true,
          outlineColor: edgeColor.withAlpha(Math.min(1.0, airmetAlpha + 0.35))
        };
      }

      const ent = sources.icing.entities.add(entitySpec);
      ent._baseFillColor = baseFill;
      ent._baseEdgeColor = edgeColor;
    }
  });

  // 2. Render SIGMETs (3D Extruded Walls OR Flat 2D Polygons in Low-Power GPU Mode)
  sigmetFeatures.forEach((feat, idx) => {
    const rings = extractPolygonRings(feat.geometry);
    if (!rings.length) return;
    const props = feat.properties || {};
    const baseFt = parseWeatherAltFeet(props, "base");
    const topFt = Math.max(baseFt + 8000, parseWeatherAltFeet(props, "top"));
    const topM = lowPowerMode ? 0 : Math.max(38000, feetToMeters(topFt) * 4.0);
    const labelAltM = lowPowerMode ? 1200 : topM + 5000;
    const hazardLabel = String(props.hazard || "CONVECTIVE").toUpperCase();

    const baseFill = Cesium.Color.RED;
    const edgeColor = Cesium.Color.YELLOW;

    rings.forEach((coords, rIdx) => {
      const centroid = computeRingCentroid(coords);
      const polyConfig = {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(coords),
        height: 0,
        arcType: Cesium.ArcType.GEODESIC,
        granularity: meshGranularity,
        fill: true,
        material: baseFill.withAlpha(sigmetAlpha),
        outline: true,
        outlineColor: edgeColor.withAlpha(Math.min(1.0, sigmetAlpha + 0.35)),
        outlineWidth: 2
      };

      if (!lowPowerMode) {
        polyConfig.extrudedHeight = topM;
        polyConfig.closeTop = false;
        polyConfig.closeBottom = false;
      }

      const ent = sources.storms.entities.add({
        id: `sigmet_${idx}_${rIdx}`,
        name: `SIGMET ${hazardLabel} (${props.seriesId || props.alphaChar || idx + 1})`,
        position: centroid ? Cesium.Cartesian3.fromDegrees(centroid.lon, centroid.lat, labelAltM) : undefined,
        label: centroid
          ? {
              text: `SIGMET ${hazardLabel}\nTOP FL${Math.round(topFt / 100)}`,
              font: "bold 11px sans-serif",
              fillColor: edgeColor,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 9500000)
            }
          : undefined,
        properties: {
          entityType: "WEATHER_VOLUME",
          advisoryCategory: "SIGMET",
          hazard: hazardLabel,
          severity: props.severity || "SEVERE",
          baseFt,
          topFt,
          validTime: props.validTimeTo || props.validTimeFrom || "Active SIGMET",
          dueTo: props.rawSigmet || props.rawAirSigmet || `${hazardLabel} hazard advisory`
        },
        polygon: polyConfig
      });
      ent._baseFillColor = baseFill;
      ent._baseEdgeColor = edgeColor;
    });
  });
}
