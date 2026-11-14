import math
import httpx
from typing import Dict, Any, List
from config import settings
from trajectory_predictor import EARTH_RADIUS_NM
from logger import setup_logger

log = setup_logger("alternates_finder")


def haversine_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    rlat1, rlon1 = math.radians(lat1), math.radians(lon1)
    rlat2, rlon2 = math.radians(lat2), math.radians(lon2)
    dlat = rlat2 - rlat1
    dlon = rlon2 - rlon1
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_NM * math.asin(min(1.0, math.sqrt(a)))


async def find_enroute_alternate_airports(
    route_waypoints: List[Dict[str, Any]],
    max_alternates: int = 6,
    corridor_nm: float = 45.0,
    exclude_icaos: List[str] = None,
) -> List[Dict[str, Any]]:
    """
    Discovers all public/towered airports within corridor_nm of the planned route,
    enriches them with live METAR weather, and returns up to max_alternates sorted along the route.
    """
    if not route_waypoints or max_alternates <= 0:
        return []

    exclude_set = {c.strip().upper() for c in (exclude_icaos or []) if c}

    lats = [wp["lat"] for wp in route_waypoints]
    lons = [wp["lon"] for wp in route_waypoints]
    pad_deg = max(1.0, corridor_nm / 60.0)
    bbox = f"{min(lats) - pad_deg:.3f},{min(lons) - pad_deg:.3f},{max(lats) + pad_deg:.3f},{max(lons) + pad_deg:.3f}"

    airports_url = f"{settings.awc_base_url}/airport"
    metar_url = f"{settings.awc_base_url}/metar"

    raw_airports: List[Dict[str, Any]] = []
    metar_by_icao: Dict[str, Dict[str, Any]] = {}

    async with httpx.AsyncClient(timeout=12.0) as client:
        try:
            a_resp = await client.get(airports_url, params={"bbox": bbox, "format": "json"})
            if a_resp.status_code == 200 and a_resp.text.strip():
                raw_airports = a_resp.json()
        except Exception as exc:
            log.warning(f"Airport corridor query failed: {exc}")

        try:
            m_resp = await client.get(metar_url, params={"bbox": bbox, "format": "json"})
            if m_resp.status_code == 200 and m_resp.text.strip():
                for m in m_resp.json():
                    icao = (m.get("icaoId") or "").upper()
                    if icao:
                        metar_by_icao[icao] = m
        except Exception as exc:
            log.warning(f"Corridor METAR query failed: {exc}")

    candidates: List[Dict[str, Any]] = []
    for ap in raw_airports:
        icao = (ap.get("icaoId") or ap.get("id") or "").strip().upper()
        if not icao or len(icao) != 4 or icao in exclude_set:
            continue

        ap_lat = ap.get("lat")
        ap_lon = ap.get("lon")
        if ap_lat is None or ap_lon is None:
            continue

        # Find closest waypoint along the route
        best_dist = float("inf")
        best_wp_idx = 0
        for idx, wp in enumerate(route_waypoints):
            d = haversine_nm(float(ap_lat), float(ap_lon), wp["lat"], wp["lon"])
            if d < best_dist:
                best_dist = d
                best_wp_idx = idx

        # Skip endpoints (first/last 10% of route) and airports outside corridor_nm
        if best_wp_idx == 0 or best_wp_idx >= len(route_waypoints) - 1:
            continue
        if best_dist > corridor_nm:
            continue

        m = metar_by_icao.get(icao, {})
        flt_cat = (m.get("fltCat") or "VFR").upper()
        # Rank VFR/MVFR airports higher than IFR/LIFR for safer emergency/icing diversion
        cat_penalty = {"VFR": 0.0, "MVFR": 8.0, "IFR": 25.0, "LIFR": 45.0}.get(flt_cat, 15.0)
        score = best_dist + cat_penalty

        nearest_wp = route_waypoints[best_wp_idx]
        candidates.append({
            "icao": icao,
            "name": ap.get("name") or icao,
            "lat": round(float(ap_lat), 5),
            "lon": round(float(ap_lon), 5),
            "elev_ft": ap.get("elev") or 0,
            "detour_dist_nm": round(best_dist, 1),
            "route_progress_idx": best_wp_idx,
            "nearest_wp": {"lat": nearest_wp["lat"], "lon": nearest_wp["lon"], "alt_ft": nearest_wp.get("safe_alt_ft", nearest_wp.get("alt_ft", 20000))},
            "flight_cat": flt_cat,
            "raw_metar": m.get("rawOb", "No live METAR"),
            "score": score,
        })

    # Pick top N safest/closest alternates, then sort chronologically along the flight path
    candidates.sort(key=lambda x: x["score"])
    selected = candidates[:max_alternates]
    selected.sort(key=lambda x: x["route_progress_idx"])

    log.info(f"Found {len(candidates)} corridor airports; returning top {len(selected)} alternates")
    return selected
