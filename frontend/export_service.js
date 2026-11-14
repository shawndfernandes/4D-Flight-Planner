function triggerDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportFlightPlanGeoJSON(routeData) {
  if (!routeData || !routeData.recommended_safe_path || routeData.recommended_safe_path.length === 0) {
    alert("Generate a flight forecast or point-to-point route first.");
    return;
  }

  const safeWps = routeData.recommended_safe_path;
  const title = routeData.flight
    ? `${routeData.flight.callsign || "FLIGHT"}_4D_SAFE`
    : `${routeData.origin?.weather?.icao || "ORIG"}_TO_${routeData.destination?.weather?.icao || "DEST"}`;

  const features = [
    {
      type: "Feature",
      properties: {
        name: title,
        type: "Safe 3D Ice/Storm-Free Corridor",
        lateral_detour_nm: routeData.lateral_detour_nm || 0,
        wind_delta_min: routeData.wind_delta_min || 0
      },
      geometry: {
        type: "LineString",
        coordinates: safeWps.map(wp => [wp.lon, wp.lat, Math.round((wp.safe_alt_ft || 0) * 0.3048)])
      }
    }
  ];

  (routeData.alternate_airports || []).forEach(alt => {
    features.push({
      type: "Feature",
      properties: {
        icao: alt.icao,
        name: alt.name,
        role: "En-Route Alternate Airport",
        detour_dist_nm: alt.detour_dist_nm,
        flight_category: alt.flight_cat,
        metar: alt.raw_metar
      },
      geometry: {
        type: "Point",
        coordinates: [alt.lon, alt.lat, Math.round((alt.elev_ft || 0) * 0.3048)]
      }
    });
  });

  const geojson = {
    type: "FeatureCollection",
    features
  };

  triggerDownload(`${title}.geojson`, JSON.stringify(geojson, null, 2), "application/geo+json");
}

export function exportFlightPlanGPX(routeData) {
  if (!routeData || !routeData.recommended_safe_path || routeData.recommended_safe_path.length === 0) {
    alert("Generate a flight forecast or point-to-point route first.");
    return;
  }

  const safeWps = routeData.recommended_safe_path;
  const title = routeData.flight
    ? `${routeData.flight.callsign || "FLIGHT"}_4D_SAFE`
    : `${routeData.origin?.weather?.icao || "ORIG"}_TO_${routeData.destination?.weather?.icao || "DEST"}`;

  const rtePts = safeWps
    .map((wp, idx) => {
      const eleMeters = ((wp.safe_alt_ft || 0) * 0.3048).toFixed(1);
      return `    <rtept lat="${wp.lat}" lon="${wp.lon}"><ele>${eleMeters}</ele><name>WP${idx + 1}_FL${Math.round((wp.safe_alt_ft || 0) / 100)}</name></rtept>`;
    })
    .join("\n");

  const altWpts = (routeData.alternate_airports || [])
    .map(alt => {
      const eleMeters = ((alt.elev_ft || 0) * 0.3048).toFixed(1);
      return `  <wpt lat="${alt.lat}" lon="${alt.lon}"><ele>${eleMeters}</ele><name>${alt.icao}</name><desc>ALTN (${alt.detour_dist_nm}NM - ${alt.flight_cat})</desc></wpt>`;
    })
    .join("\n");

  const gpxXml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="4D Predictive Flight &amp; Icing Pathfinder" xmlns="http://topografix.com">
  <metadata><name>${title}</name></metadata>
${altWpts}
  <rte>
    <name>${title}</name>
${rtePts}
  </rte>
</gpx>`;

  triggerDownload(`${title}.gpx`, gpxXml, "application/gpx+xml");
}
