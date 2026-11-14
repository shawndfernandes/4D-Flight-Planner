import { fetchFlightForecast, fetchPointToPointRoute } from "./api_client.js";
import {
  renderPathAndCard,
  renderAirportWeatherBadges,
  renderAlternateAirports
} from "./route_renderer.js";

export function getMaxAlternates() {
  const el = document.getElementById("maxAlternatesInput");
  const val = parseInt(el ? el.value : "6", 10);
  return Number.isFinite(val) ? Math.max(0, Math.min(25, val)) : 6;
}

function buildAlternatesHtml(alternates) {
  if (!alternates || alternates.length === 0) {
    return `<div style="margin-top:4px; color:#94a3b8;"><strong>En-Route Alternates:</strong> None found in corridor</div>`;
  }
  const items = alternates
    .map(
      a =>
        `<span style="display:inline-block; margin:2px 4px 2px 0; padding:2px 5px; background:#0f172a; border:1px solid #334155; border-radius:4px; font-size:10.5px;"><strong>${a.icao}</strong> (${a.detour_dist_nm}NM · ${a.flight_cat})</span>`
    )
    .join("");
  return `<div style="margin-top:6px;"><strong>En-Route Diversion Airports (${alternates.length}):</strong><div style="margin-top:2px;">${items}</div></div>`;
}

export async function runFlightForecast(viewer, sources, onRouteComputed) {
  const callsign = document.getElementById("callsignInput").value.trim();
  const status = document.getElementById("statusText");
  if (!callsign) return;

  const maxAlt = getMaxAlternates();
  status.innerText = `Computing 4D forecast & ${maxAlt} alternates for ${callsign}...`;
  try {
    const data = await fetchFlightForecast(callsign, maxAlt);
    if (onRouteComputed) onRouteComputed(data);

    const hazardCount = data.predicted_trajectory.filter(p => p.hazards && p.hazards.length > 0).length;
    const f = data.flight;
    const safeWps = data.recommended_safe_path || [];
    const recAlt = safeWps.length > 0 ? safeWps[safeWps.length - 1].safe_alt_ft : f.alt;
    const windSign = data.wind_delta_min > 0 ? `+${data.wind_delta_min}` : `${data.wind_delta_min}`;

    const subtitle = `
      <div><strong>Type:</strong> ${f.type || "N/A"} | <strong>Reg:</strong> ${f.reg || "N/A"} | <strong>Hdg:</strong> ${Math.round(f.track)}°</div>
      <div><strong>Current Alt:</strong> ${f.alt.toLocaleString()} ft | <strong>Recommended:</strong> ${recAlt.toLocaleString()} ft</div>
      <div><strong>Lateral Detour:</strong> ${data.lateral_detour_nm} NM | <strong>Winds Aloft ETA:</strong> ${windSign} min</div>
      ${buildAlternatesHtml(data.alternate_airports)}
    `;

    renderPathAndCard(sources, data, `${f.callsign || f.id} — Live 4D Forecast`, subtitle, hazardCount, true);
    renderAlternateAirports(sources, data.alternate_airports);

    viewer.flyTo(sources.forecast.entities, {
      offset: new Cesium.HeadingPitchRange(0.0, Cesium.Math.toRadians(-45.0), 850000)
    });
    status.innerText = `${callsign}: 4D path + ${data.alternate_airports?.length || 0} diversion airports plotted.`;
    viewer.scene.requestRender();
  } catch (err) {
    status.innerText = `Could not forecast ${callsign} (aircraft may not be airborne).`;
    console.error("Forecast error:", err);
  }
}

export async function runPointToPointRoute(viewer, sources, onRouteComputed) {
  const orig = document.getElementById("originInput").value.trim();
  const dest = document.getElementById("destInput").value.trim();
  const status = document.getElementById("statusText");
  if (!orig || !dest) return;

  const maxAlt = getMaxAlternates();
  status.innerText = `Planning safe 3D route + ${maxAlt} alternates: ${orig} -> ${dest}...`;
  try {
    const data = await fetchPointToPointRoute(orig, dest, maxAlt);
    if (onRouteComputed) onRouteComputed(data);

    sources.forecast.entities.removeAll();
    renderAirportWeatherBadges(sources, data.origin, data.destination);

    const hazardCount = data.predicted_trajectory.filter(p => p.hazards && p.hazards.length > 0).length;
    const safeWps = data.recommended_safe_path || [];
    const cruiseRec = safeWps.length > 2 ? safeWps[Math.floor(safeWps.length / 2)].safe_alt_ft : 34000;
    const windSign = data.wind_delta_min > 0 ? `+${data.wind_delta_min}` : `${data.wind_delta_min}`;
    const ow = data.origin.weather || {};
    const dw = data.destination.weather || {};

    const subtitle = `
      <div><strong>Route:</strong> ${data.distance_nm} NM | <strong>Safe Cruise:</strong> ${cruiseRec.toLocaleString()} ft | <strong>Detour:</strong> ${data.lateral_detour_nm} NM (${windSign}m wind)</div>
      <div style="margin-top:4px; padding:4px 6px; background:#0f172a; border-radius:4px; font-family:monospace; font-size:10.5px;">
        <div style="color:#38bdf8;"><strong>DEP ${ow.icao} [${ow.flight_cat}]:</strong> ${ow.raw_metar}</div>
        <div style="color:#94a3b8; margin-top:2px;"><strong>TAF:</strong> ${ow.raw_taf}</div>
        <div style="color:#4ade80; margin-top:4px;"><strong>ARR ${dw.icao} [${dw.flight_cat}]:</strong> ${dw.raw_metar}</div>
        <div style="color:#94a3b8; margin-top:2px;"><strong>TAF:</strong> ${dw.raw_taf}</div>
      </div>
      ${buildAlternatesHtml(data.alternate_airports)}
    `;

    renderPathAndCard(sources, data, `Route Plan: ${orig.toUpperCase()} → ${dest.toUpperCase()}`, subtitle, hazardCount, false);
    renderAlternateAirports(sources, data.alternate_airports);

    viewer.flyTo(sources.forecast.entities, {
      offset: new Cesium.HeadingPitchRange(0.0, Cesium.Math.toRadians(-48.0), 1400000)
    });
    status.innerText = `Route ${orig.toUpperCase()} → ${dest.toUpperCase()} (${data.distance_nm} NM) + ${data.alternate_airports?.length || 0} alternates plotted.`;
    viewer.scene.requestRender();
  } catch (err) {
    status.innerText = `Could not resolve route '${orig}' -> '${dest}'.`;
    console.error("Route plan error:", err);
  }
}
