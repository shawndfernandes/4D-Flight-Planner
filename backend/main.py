from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import asyncio

from traffic_client import UnifiedTrafficClient
from weather_client import AviationWeatherClient
from winds_client import WindsAloftClient
from radar_weather_client import RadarAndSurfaceWeatherClient
from trajectory_predictor import project_4d_trajectory, score_trajectory_hazards
from safe_router import compute_safe_3d_path
from route_planner import resolve_location, build_great_circle_waypoints
from alternates_finder import find_enroute_alternate_airports
from config import settings
from logger import setup_logger

log = setup_logger("api_main")

app = FastAPI(title="4D Predictive Flight & Safe Altitude Engine")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

traffic = UnifiedTrafficClient()
weather = AviationWeatherClient()
winds = WindsAloftClient()
radar_wx = RadarAndSurfaceWeatherClient()


@app.get("/api/airspace/snapshot")
async def get_airspace_snapshot(
    lat: float = Query(settings.default_center_lat),
    lon: float = Query(settings.default_center_lon),
    radius_nm: int = Query(settings.default_radius_nm, ge=50, le=500),
    wx_provider: str = Query("weather_com"),
):
    flights, icing, storms, pireps, radar_cfg, local_wx = await asyncio.gather(
        traffic.community.get_live_flights(lat=lat, lon=lon, radius_nm=radius_nm),
        weather.get_icing_gairmets(),
        weather.get_convective_sigmets(),
        weather.get_pireps(),
        radar_wx.get_live_radar_config(provider=wx_provider),
        radar_wx.get_local_surface_weather(lat=lat, lon=lon, provider=wx_provider),
    )
    active_source = next(iter(flights))["source"] if flights else "none"
    return {
        "data_source": active_source,
        "flights": flights[:250],
        "icing_geojson": icing,
        "storms_geojson": storms,
        "pireps": pireps[:100],
        "radar_config": radar_cfg,
        "surface_weather": local_wx,
    }


@app.get("/api/flight/{callsign}/forecast")
async def get_flight_predictive_forecast(
    callsign: str,
    max_alternates: int = Query(5, ge=0, le=25),
):
    flight = await traffic.get_flight_by_callsign(callsign)
    if not flight:
        raise HTTPException(
            status_code=404,
            detail=f"Active airborne flight '{callsign}' not found on community ADS-B feeds.",
        )

    icing, storms, nearby_traffic, wind_profile = await asyncio.gather(
        weather.get_icing_gairmets(),
        weather.get_convective_sigmets(),
        traffic.get_live_flights(lat=flight["lat"], lon=flight["lon"]),
        winds.get_wind_profile(lat=flight["lat"], lon=flight["lon"]),
    )

    projected = project_4d_trajectory(flight, horizon_min=90, step_min=5)
    scored_forecast = score_trajectory_hazards(projected, icing, storms)
    route_result = compute_safe_3d_path(
        scored_forecast,
        icing,
        storms,
        nearby_traffic,
        wind_profile=wind_profile,
        base_track_deg=flight.get("track", 0.0),
        gspeed_kt=flight.get("gspeed", 450.0),
    )

    alternates = await find_enroute_alternate_airports(
        route_result["waypoints"] or scored_forecast,
        max_alternates=max_alternates,
        corridor_nm=50.0,
    )

    return {
        "flight": flight,
        "predicted_trajectory": scored_forecast,
        "recommended_safe_path": route_result["waypoints"],
        "wind_delta_min": route_result["wind_delta_min"],
        "lateral_detour_nm": route_result["lateral_detour_nm"],
        "alternate_airports": alternates,
    }


@app.get("/api/route/plan")
async def plan_point_to_point_route(
    origin: str = Query(..., description="Origin airport ICAO/IATA or city name"),
    destination: str = Query(..., description="Destination airport ICAO/IATA or city name"),
    cruise_alt: int = Query(34000, ge=6000, le=43000),
    max_alternates: int = Query(6, ge=0, le=25),
):
    orig_loc, dest_loc = await asyncio.gather(
        resolve_location(origin),
        resolve_location(destination),
    )
    if not orig_loc or not dest_loc:
        raise HTTPException(status_code=404, detail="Could not resolve origin or destination airport/city.")

    gc_waypoints, total_nm, bearing = build_great_circle_waypoints(
        orig_loc, dest_loc, cruise_alt_ft=cruise_alt, gspeed_kt=460.0
    )
    mid_lat = (orig_loc["lat"] + dest_loc["lat"]) / 2.0
    mid_lon = (orig_loc["lon"] + dest_loc["lon"]) / 2.0

    icing, storms, nearby_traffic, wind_profile, orig_wx, dest_wx = await asyncio.gather(
        weather.get_icing_gairmets(),
        weather.get_convective_sigmets(),
        traffic.get_live_flights(lat=mid_lat, lon=mid_lon),
        winds.get_wind_profile(lat=mid_lat, lon=mid_lon),
        weather.get_nearest_metar_taf(orig_loc["lat"], orig_loc["lon"], icao_hint=origin),
        weather.get_nearest_metar_taf(dest_loc["lat"], dest_loc["lon"], icao_hint=destination),
    )

    scored_gc = score_trajectory_hazards(gc_waypoints, icing, storms)
    route_result = compute_safe_3d_path(
        scored_gc,
        icing,
        storms,
        nearby_traffic,
        wind_profile=wind_profile,
        base_track_deg=bearing,
        gspeed_kt=460.0,
    )

    alternates = await find_enroute_alternate_airports(
        route_result["waypoints"] or scored_gc,
        max_alternates=max_alternates,
        corridor_nm=50.0,
        exclude_icaos=[orig_wx.get("icao"), dest_wx.get("icao"), origin, destination],
    )

    orig_name = ", ".join(orig_loc["name"]) if isinstance(orig_loc["name"], list) else orig_loc["name"]
    dest_name = ", ".join(dest_loc["name"]) if isinstance(dest_loc["name"], list) else dest_loc["name"]

    return {
        "origin": {**orig_loc, "name": orig_name, "weather": orig_wx},
        "destination": {**dest_loc, "name": dest_name, "weather": dest_wx},
        "distance_nm": total_nm,
        "initial_bearing": bearing,
        "predicted_trajectory": scored_gc,
        "recommended_safe_path": route_result["waypoints"],
        "wind_delta_min": route_result["wind_delta_min"],
        "lateral_detour_nm": route_result["lateral_detour_nm"],
        "alternate_airports": alternates,
    }
