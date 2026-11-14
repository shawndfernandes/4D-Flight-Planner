import math
import re
from typing import List, Dict, Any
from shapely.geometry import shape, Point

EARTH_RADIUS_NM = 3440.065


def parse_fl_feet(val: Any, default_fl: int = 0) -> int:
    """Safely convert NOAA flight-level strings ('SFC', '080', 'FL240', 180) to feet."""
    if val is None:
        return default_fl * 100
    if isinstance(val, (int, float)):
        return int(val) * 100
    s = str(val).strip().upper()
    if s in ("", "SFC", "GND", "SURFACE"):
        return 0
    digits = re.sub(r"[^0-9]", "", s)
    return int(digits) * 100 if digits else default_fl * 100


def project_4d_trajectory(
    flight: Dict[str, Any], horizon_min: int = 90, step_min: int = 5
) -> List[Dict[str, Any]]:
    """Extrapolate aircraft position (lat, lon, alt, t) using spherical kinematics."""
    lat = math.radians(float(flight["lat"]))
    lon = math.radians(float(flight["lon"]))
    track = math.radians(float(flight.get("track") or 0))
    gspeed = float(flight.get("gspeed") or 450)
    alt = int(flight.get("alt") or 30000)
    vspeed = float(flight.get("vspeed") or 0)

    points = [{
        "t_min": 0,
        "lat": float(flight["lat"]),
        "lon": float(flight["lon"]),
        "alt_ft": alt,
        "hazards": [],
    }]

    for t in range(step_min, horizon_min + 1, step_min):
        dist_nm = gspeed * (t / 60.0)
        ang_dist = dist_nm / EARTH_RADIUS_NM

        p_lat = math.asin(
            math.sin(lat) * math.cos(ang_dist)
            + math.cos(lat) * math.sin(ang_dist) * math.cos(track)
        )
        p_lon = lon + math.atan2(
            math.sin(track) * math.sin(ang_dist) * math.cos(lat),
            math.cos(ang_dist) - math.sin(lat) * math.sin(p_lat),
        )
        p_alt = max(1000, min(43000, alt + (vspeed * t)))

        points.append({
            "t_min": t,
            "lat": round(math.degrees(p_lat), 5),
            "lon": round(math.degrees(p_lon), 5),
            "alt_ft": round(p_alt),
            "hazards": [],
        })
    return points


def score_trajectory_hazards(
    trajectory: List[Dict[str, Any]],
    icing_geojson: Dict[str, Any],
    storm_geojson: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Intersect predicted 4D waypoints with 3D Icing & Convective Storm volumes."""
    icing_polys = [
        (shape(f["geometry"]), f.get("properties") or {})
        for f in icing_geojson.get("features", [])
        if f.get("geometry")
    ]
    storm_polys = [
        (shape(f["geometry"]), f.get("properties") or {})
        for f in storm_geojson.get("features", [])
        if f.get("geometry")
    ]

    for wp in trajectory:
        pt = Point(wp["lon"], wp["lat"])
        alt = int(wp["alt_ft"])

        for poly, props in icing_polys:
            base_ft = parse_fl_feet(props.get("base"), default_fl=0)
            top_ft = parse_fl_feet(props.get("top"), default_fl=450)
            if base_ft <= alt <= top_ft and poly.contains(pt):
                wp["hazards"].append({
                    "type": "ICING",
                    "severity": props.get("severity", "MOD"),
                    "base_ft": base_ft,
                    "top_ft": top_ft,
                })

        for poly, props in storm_polys:
            top_ft = parse_fl_feet(props.get("top"), default_fl=500)
            if alt <= top_ft and poly.buffer(0.3).contains(pt):
                wp["hazards"].append({
                    "type": "CONVECTIVE_STORM",
                    "severity": "SEVERE",
                    "top_ft": top_ft,
                })

    return trajectory
