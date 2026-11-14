import math
import httpx
from typing import Dict, Any, List, Optional, Tuple
from trajectory_predictor import EARTH_RADIUS_NM
from logger import setup_logger

log = setup_logger("route_planner")

# Fast built-in lookup for major US/Canadian hubs (fallback to OpenStreetMap Nominatim for any city/airport worldwide)
AIRPORT_COORDS: Dict[str, Tuple[float, float, str]] = {
    "KCMH": (39.9980, -82.8919, "Columbus John Glenn Intl (KCMH)"),
    "CMH": (39.9980, -82.8919, "Columbus John Glenn Intl (KCMH)"),
    "KORD": (41.9742, -87.9073, "Chicago O'Hare Intl (KORD)"),
    "ORD": (41.9742, -87.9073, "Chicago O'Hare Intl (KORD)"),
    "KJFK": (40.6413, -73.7781, "New York JFK Intl (KJFK)"),
    "JFK": (40.6413, -73.7781, "New York JFK Intl (KJFK)"),
    "KATL": (33.6407, -84.4277, "Atlanta Hartsfield-Jackson (KATL)"),
    "ATL": (33.6407, -84.4277, "Atlanta Hartsfield-Jackson (KATL)"),
    "KDFW": (32.8998, -97.0403, "Dallas/Fort Worth Intl (KDFW)"),
    "DFW": (32.8998, -97.0403, "Dallas/Fort Worth Intl (KDFW)"),
    "KDEN": (39.8561, -104.6737, "Denver Intl (KDEN)"),
    "DEN": (39.8561, -104.6737, "Denver Intl (KDEN)"),
    "KLAX": (33.9416, -118.4085, "Los Angeles Intl (KLAX)"),
    "LAX": (33.9416, -118.4085, "Los Angeles Intl (KLAX)"),
    "KMIA": (25.7959, -80.2870, "Miami Intl (KMIA)"),
    "MIA": (25.7959, -80.2870, "Miami Intl (KMIA)"),
    "KSEA": (47.4502, -122.3088, "Seattle-Tacoma Intl (KSEA)"),
    "SEA": (47.4502, -122.3088, "Seattle-Tacoma Intl (KSEA)"),
    "CYYZ": (43.6777, -79.6248, "Toronto Pearson Intl (CYYZ)"),
    "YYZ": (43.6777, -79.6248, "Toronto Pearson Intl (CYYZ)"),
    "EGLL": (51.4700, -0.4543, "London Heathrow (EGLL)"),
    "LHR": (51.4700, -0.4543, "London Heathrow (EGLL)"),
}


async def resolve_location(query: str) -> Optional[Dict[str, Any]]:
    """Resolve an airport code (KCMH/CMH) or city name ('Columbus, OH') to (lat, lon, label)."""
    clean = query.strip()
    upper = clean.upper()
    if upper in AIRPORT_COORDS:
        lat, lon, label = AIRPORT_COORDS[upper]
        return {"lat": lat, "lon": lon, "name": label}

    # Query OpenStreetMap Nominatim (free, no key) for any city or airport worldwide
    url = "https://" + "nominatim." + "openstreetmap.org/search"
    headers = {"User-Agent": "FlightForecastEngine/1.0"}
    params = {"q": clean, "format": "json", "limit": 1}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code == 200:
                results = resp.json()
                if results:
                    top = next(iter(results))
                    return {
                        "lat": round(float(top["lat"]), 5),
                        "lon": round(float(top["lon"]), 5),
                        "name": top.get("display_name", clean).split(",")[:2],
                    }
    except Exception as exc:
        log.warning(f"Geocoding error for '{clean}': {exc}")
    return None


def compute_initial_bearing(lat1_deg: float, lon1_deg: float, lat2_deg: float, lon2_deg: float) -> float:
    lat1, lon1 = math.radians(lat1_deg), math.radians(lon1_deg)
    lat2, lon2 = math.radians(lat2_deg), math.radians(lon2_deg)
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0


def build_great_circle_waypoints(
    orig: Dict[str, Any],
    dest: Dict[str, Any],
    cruise_alt_ft: int = 34000,
    gspeed_kt: float = 460.0,
    step_min: int = 5,
) -> Tuple[List[Dict[str, Any]], float, float]:
    """Generate 5-minute Great-Circle waypoints with climb/cruise/descent profile."""
    lat1, lon1 = math.radians(orig["lat"]), math.radians(orig["lon"])
    lat2, lon2 = math.radians(dest["lat"]), math.radians(dest["lon"])

    # Haversine angular distance
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    ang_dist = 2 * math.asin(min(1.0, math.sqrt(a)))
    total_nm = ang_dist * EARTH_RADIUS_NM
    bearing = compute_initial_bearing(orig["lat"], orig["lon"], dest["lat"], dest["lon"])

    if total_nm < 5.0:
        return [], 0.0, bearing

    total_min = max(15, int(round((total_nm / gspeed_kt) * 60.0)))
    n_steps = max(3, total_min // step_min)

    waypoints = []
    for i in range(n_steps + 1):
        f = i / n_steps
        if ang_dist < 1e-6:
            lat_i, lon_i = orig["lat"], orig["lon"]
        else:
            A = math.sin((1 - f) * ang_dist) / math.sin(ang_dist)
            B = math.sin(f * ang_dist) / math.sin(ang_dist)
            x = A * math.cos(lat1) * math.cos(lon1) + B * math.cos(lat2) * math.cos(lon2)
            y = A * math.cos(lat1) * math.sin(lon1) + B * math.cos(lat2) * math.sin(lon2)
            z = A * math.sin(lat1) + B * math.sin(lat2)
            lat_i = math.degrees(math.atan2(z, math.sqrt(x * x + y * y)))
            lon_i = math.degrees(math.atan2(y, x))

        # Smooth climb in first 15%, cruise, descent in last 15%
        if f < 0.15:
            alt_i = int(3000 + (cruise_alt_ft - 3000) * (f / 0.15))
        elif f > 0.85:
            alt_i = int(3000 + (cruise_alt_ft - 3000) * ((1.0 - f) / 0.15))
        else:
            alt_i = cruise_alt_ft

        waypoints.append({
            "t_min": i * step_min,
            "lat": round(lat_i, 5),
            "lon": round(lon_i, 5),
            "alt_ft": alt_i,
            "hazards": [],
        })

    return waypoints, round(total_nm, 1), round(bearing, 1)
