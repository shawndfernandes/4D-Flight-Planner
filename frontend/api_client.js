const API_BASE = "http://localhost:8000/api";

export async function fetchAirspaceSnapshot(lat, lon, radiusNm, wxProvider) {
  const url = `${API_BASE}/airspace/snapshot?lat=${lat}&lon=${lon}&radius_nm=${radiusNm}&wx_provider=${wxProvider}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Snapshot HTTP ${res.status}`);
  return res.json();
}

export async function fetchFlightForecast(callsign, maxAlternates) {
  const url = `${API_BASE}/flight/${encodeURIComponent(callsign)}/forecast?max_alternates=${maxAlternates}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Forecast HTTP ${res.status}`);
  return res.json();
}

export async function fetchPointToPointRoute(origin, destination, maxAlternates) {
  const url = `${API_BASE}/route/plan?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&max_alternates=${maxAlternates}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Route plan HTTP ${res.status}`);
  return res.json();
}
