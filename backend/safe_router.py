import heapq
import itertools
import math
from typing import List, Dict, Any, Tuple
from shapely.geometry import shape, Point
from trajectory_predictor import parse_fl_feet, EARTH_RADIUS_NM
from winds_client import WindsAloftClient

CANDIDATE_ALTITUDES = list(range(6000, 44000, 2000))
LATERAL_OFFSETS_DEG = [-20.0, -10.0, 0.0, 10.0, 20.0]


def offset_coordinate(lat_deg: float, lon_deg: float, bearing_deg: float, dist_nm: float) -> Tuple[float, float]:
    """Move from (lat, lon) along bearing_deg by dist_nm nautical miles."""
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    brg = math.radians(bearing_deg)
    ang = dist_nm / EARTH_RADIUS_NM

    p_lat = math.asin(
        math.sin(lat) * math.cos(ang) + math.cos(lat) * math.sin(ang) * math.cos(brg)
    )
    p_lon = lon + math.atan2(
        math.sin(brg) * math.sin(ang) * math.cos(lat),
        math.cos(ang) - math.sin(lat) * math.sin(p_lat),
    )
    return round(math.degrees(p_lat), 5), round(math.degrees(p_lon), 5)


def compute_safe_3d_path(
    projected_points: List[Dict[str, Any]],
    icing_geojson: Dict[str, Any],
    storm_geojson: Dict[str, Any],
    traffic_flights: List[Dict[str, Any]],
    wind_profile: Dict[int, Tuple[float, float]] = None,
    base_track_deg: float = 0.0,
    gspeed_kt: float = 450.0,
) -> Dict[str, Any]:
    """
    True 3D (lat, lon, alt) A* pathfinder with lateral storm avoidance and winds aloft.
    """
    wind_profile = wind_profile or {}
    icing_vols = []
    for f in icing_geojson.get("features", []):
        if f.get("geometry"):
            props = f.get("properties") or {}
            base_ft = parse_fl_feet(props.get("base"), default_fl=0)
            top_ft = parse_fl_feet(props.get("top"), default_fl=450)
            icing_vols.append((shape(f["geometry"]), base_ft, top_ft))

    storm_vols = []
    for f in storm_geojson.get("features", []):
        if f.get("geometry"):
            props = f.get("properties") or {}
            top_ft = parse_fl_feet(props.get("top"), default_fl=500)
            storm_vols.append((shape(f["geometry"]).buffer(0.35), top_ft))

    def cell_hazard_cost(lat: float, lon: float, alt: int) -> float:
        pt = Point(lon, lat)
        cost = 0.0
        for poly, top in storm_vols:
            if alt <= top and poly.contains(pt):
                cost += 12000.0
        for poly, base, top in icing_vols:
            if base <= alt <= top and poly.contains(pt):
                cost += 2500.0
        for tf in traffic_flights:
            tf_alt = int(tf.get("alt") or 0)
            if abs(tf_alt - alt) < 1500:
                d_lat = abs(float(tf["lat"]) - lat)
                d_lon = abs(float(tf["lon"]) - lon)
                if math.hypot(d_lat, d_lon) < 0.15:
                    cost += 1500.0
        return cost

    n_steps = len(projected_points)
    if n_steps == 0:
        return {"waypoints": [], "wind_delta_min": 0.0, "lateral_detour_nm": 0.0}

    first_wp = next(iter(projected_points))
    start_alt = min(CANDIDATE_ALTITUDES, key=lambda a: abs(a - first_wp["alt_ft"]))

    tie_breaker = itertools.count()
    # State: (cum_cost, tie_id, step, curr_lat, curr_lon, curr_alt, curr_offset_deg, path)
    pq = [(0.0, next(tie_breaker), 0, first_wp["lat"], first_wp["lon"], start_alt, 0.0, [])]
    visited = {}

    step_dist_nm = max(5.0, gspeed_kt * (5.0 / 60.0))

    while pq:
        cum_cost, _, step, c_lat, c_lon, c_alt, c_off, path = heapq.heappop(pq)
        state_key = (step, c_alt, c_off)
        if state_key in visited and visited[state_key] <= cum_cost:
            continue
        visited[state_key] = cum_cost

        orig_wp = projected_points[step]
        wind_comp = WindsAloftClient.compute_wind_component(
            (base_track_deg + c_off) % 360.0, c_alt, wind_profile
        )

        new_path = path + [{
            "t_min": orig_wp["t_min"],
            "lat": c_lat,
            "lon": c_lon,
            "safe_alt_ft": c_alt,
            "original_alt_ft": orig_wp["alt_ft"],
            "lateral_offset_deg": c_off,
            "tailwind_kt": wind_comp,
        }]

        if step == n_steps - 1:
            avg_wind = sum(w["tailwind_kt"] for w in new_path) / max(1, len(new_path))
            eff_gs = max(100.0, gspeed_kt + avg_wind)
            total_dist = step_dist_nm * (n_steps - 1)
            orig_min = (n_steps - 1) * 5.0
            wind_adj_min = (total_dist / eff_gs) * 60.0
            max_offset = max(abs(w["lateral_offset_deg"]) for w in new_path)
            detour_nm = round(total_dist * (1.0 / math.cos(math.radians(max_offset)) - 1.0), 1)
            return {
                "waypoints": new_path,
                "wind_delta_min": round(wind_adj_min - orig_min, 1),
                "lateral_detour_nm": detour_nm,
            }

        for next_off in LATERAL_OFFSETS_DEG:
            if step >= n_steps - 4 and abs(next_off) > abs(c_off):
                continue
            if abs(next_off - c_off) > 10.0:
                continue

            heading = (base_track_deg + next_off) % 360.0
            n_lat, n_lon = offset_coordinate(c_lat, c_lon, heading, step_dist_nm)

            for next_alt in CANDIDATE_ALTITUDES:
                alt_change = abs(next_alt - c_alt)
                if alt_change > 4000:
                    continue

                wind_bonus = WindsAloftClient.compute_wind_component(heading, next_alt, wind_profile)
                step_cost = (
                    cell_hazard_cost(n_lat, n_lon, next_alt)
                    + (alt_change * 0.05)
                    + (abs(next_off) * 12.0)
                    - (wind_bonus * 1.5)
                )
                heapq.heappush(
                    pq,
                    (cum_cost + step_cost, next(tie_breaker), step + 1, n_lat, n_lon, next_alt, next_off, new_path),
                )

    return {"waypoints": [], "wind_delta_min": 0.0, "lateral_detour_nm": 0.0}
