import {
  AIRPLANE_ICON_URI,
  headingToCesiumRotation,
  createAirportWeatherBadgeUri,
  feetToMeters
} from "./map_layers.js";
import { drawVerticalProfile } from "./chart_renderer.js";
import { renderTelemetryCard } from "./hud_card_renderer.js";

export function renderLiveTraffic(sources, flights) {
  sources.traffic.entities.removeAll();

  (flights || []).slice(0, 120).forEach(f => {
    if (!f.lat || !f.lon) return;
    const cs = f.callsign || f.id || "UNKNOWN";
    sources.traffic.entities.add({
      name: cs,
      properties: { entityType: "AIRCRAFT", ...f },
      position: Cesium.Cartesian3.fromDegrees(f.lon, f.lat, feetToMeters(f.alt)),
      billboard: {
        image: AIRPLANE_ICON_URI,
        width: 22,
        height: 22,
        rotation: headingToCesiumRotation(f.track),
        alignedAxis: Cesium.Cartesian3.UNIT_Z
      },
      label: {
        text: cs,
        font: "11px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -16),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1800000)
      }
    });
  });
}

export function renderPathAndCard(sources, data, labelTitle, subtitleHtml, hazardCount, clearExisting = true) {
  if (clearExisting) sources.forecast.entities.removeAll();

  // Amber Ribbon: Direct / Current Projected Trajectory
  const predCoords = data.predicted_trajectory.flatMap(p => [p.lon, p.lat, feetToMeters(p.alt_ft)]);
  sources.forecast.entities.add({
    polyline: {
      positions: Cesium.Cartesian3.fromDegreesArrayHeights(predCoords),
      width: 5,
      material: Cesium.Color.ORANGE
    }
  });

  // Green Ribbon: 3D Lateral + Vertical Safe Corridor
  const safeCoords = data.recommended_safe_path.flatMap(p => [p.lon, p.lat, feetToMeters(p.safe_alt_ft)]);
  sources.forecast.entities.add({
    polyline: {
      positions: Cesium.Cartesian3.fromDegreesArrayHeights(safeCoords),
      width: 6,
      material: Cesium.Color.LIMEGREEN
    }
  });

  // Red Dots: Predicted Hazard Intersections
  data.predicted_trajectory.forEach(p => {
    if (p.hazards && p.hazards.length > 0) {
      sources.forecast.entities.add({
        position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, feetToMeters(p.alt_ft)),
        point: { pixelSize: 12, color: Cesium.Color.RED, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 }
      });
    }
  });

  renderTelemetryCard(labelTitle, subtitleHtml, hazardCount);
  drawVerticalProfile(data.predicted_trajectory, data.recommended_safe_path);
}

export function renderAirportWeatherBadges(sources, originObj, destObj) {
  const ow = originObj.weather || {};
  const dw = destObj.weather || {};

  sources.forecast.entities.add({
    position: Cesium.Cartesian3.fromDegrees(originObj.lon, originObj.lat, 1200),
    billboard: {
      image: createAirportWeatherBadgeUri("DEP", ow),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      scale: 0.95
    }
  });

  sources.forecast.entities.add({
    position: Cesium.Cartesian3.fromDegrees(destObj.lon, destObj.lat, 1200),
    billboard: {
      image: createAirportWeatherBadgeUri("ARR", dw),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      scale: 0.95
    }
  });
}

export function renderAlternateAirports(sources, alternates) {
  if (!alternates || alternates.length === 0) return;

  const catColors = {
    VFR: Cesium.Color.LIMEGREEN,
    MVFR: Cesium.Color.DEEPSKYBLUE,
    IFR: Cesium.Color.RED,
    LIFR: Cesium.Color.MAGENTA
  };

  alternates.forEach(alt => {
    const markerColor = catColors[alt.flight_cat] || Cesium.Color.CYAN;

    sources.forecast.entities.add({
      name: alt.icao,
      position: Cesium.Cartesian3.fromDegrees(alt.lon, alt.lat, feetToMeters(alt.elev_ft || 500)),
      point: {
        pixelSize: 10,
        color: markerColor,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2
      },
      label: {
        text: `${alt.icao} (${alt.detour_dist_nm}NM)\n[${alt.flight_cat}]`,
        font: "11px sans-serif",
        fillColor: Cesium.Color.CYAN,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -18),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2200000)
      }
    });

    if (alt.nearest_wp) {
      sources.forecast.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights([
            alt.nearest_wp.lon,
            alt.nearest_wp.lat,
            feetToMeters(alt.nearest_wp.alt_ft),
            alt.lon,
            alt.lat,
            feetToMeters(alt.elev_ft || 500)
          ]),
          width: 2.5,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.CYAN.withAlpha(0.85),
            dashLength: 14.0
          })
        }
      });
    }
  });
}
