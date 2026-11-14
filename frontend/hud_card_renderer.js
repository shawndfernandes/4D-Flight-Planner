export function renderWeatherVolumeCard(props) {
  const card = document.getElementById("aircraftCard");
  if (!card || !props) return;

  const isSigmet = props.advisoryCategory === "SIGMET";
  card.style.display = "block";
  card.style.borderLeftColor = isSigmet ? "#ef4444" : "#38bdf8";

  const baseFl = props.baseFt === 0 ? "SFC" : `FL${Math.round(props.baseFt / 100)} (${props.baseFt.toLocaleString()} ft)`;
  const topFl = `FL${Math.round(props.topFt / 100)} (${props.topFt.toLocaleString()} ft)`;

  card.innerHTML = `
    <div style="display:flex; justify-content:space-between; font-weight:700; font-size:13px; margin-bottom:4px;">
      <span style="color:${isSigmet ? "#fca5a5" : "#7dd3fc"};">${props.advisoryCategory}: ${props.hazard}</span>
      <span style="padding:1px 6px; border-radius:4px; background:${isSigmet ? "#991b1b" : "#0369a1"}; font-size:11px;">${props.severity}</span>
    </div>
    <div><strong>Altitude Layer:</strong> ${baseFl} → ${topFl}</div>
    <div><strong>Valid Window:</strong> ${props.validTime}</div>
    <div style="margin-top:4px; padding:4px 6px; background:#0f172a; border-radius:4px; font-family:monospace; font-size:10.5px; color:#cbd5e1; max-height:70px; overflow-y:auto;">
      ${props.dueTo}
    </div>
  `;
}

export function renderTelemetryCard(labelTitle, subtitleHtml, hazardCount) {
  const card = document.getElementById("aircraftCard");
  if (!card) return;

  card.style.display = "block";
  card.style.borderLeftColor = hazardCount > 0 ? "#ef4444" : "#22c55e";
  card.innerHTML = `
    <div style="font-weight:700; font-size:13px; margin-bottom:4px;">${labelTitle}</div>
    ${subtitleHtml}
    <div style="margin-top:4px; color:${hazardCount > 0 ? "#fca5a5" : "#86efac"};">
      <strong>Hazards Along Direct Path:</strong> ${hazardCount > 0 ? `${hazardCount} icing/storm intersections avoided` : "Clear air corridor"}
    </div>
  `;
}
