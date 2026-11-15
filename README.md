# 4D Predictive Flight, Weather & Icing Avoidance Engine

Real-time 4D aviation trajectory forecasting and weather visualization engine built with FastAPI, Shapely, and CesiumJS—combining live ADS-B traffic, NOAA G-AIRMET/SIGMET hazard avoidance, multi-frame weather radar, winds-aloft ETA optimization, 3D A* detour routing, and en-route diversion airport pathfinding.

# Full Project Overview

AeroPath 4D is an interactive 3D airspace intelligence and flight-planning platform designed to visualize live air traffic alongside real-time atmospheric hazards and compute safe, fuel-efficient 3D flight corridors.

Core Capabilities

• Live Global ADS-B Airspace Tracking: Streams real-time aircraft positions, barometric altitudes, groundspeeds, and heading-rotated aircraft icons worldwide with automatic camera-panning refresh.
• 3D Extruded Aviation Weather Volumes: Renders active NOAA Aviation Weather Center G-AIRMETs (structural icing, freezing levels, turbulence, and IFR zones) and SIGMETs (convective storms) as interactive 3D airspace blocks—complete with click-to-inspect advisory cards and a Low-Power GPU Mode for 2D flat polygons.
• Multi-Source Animated Weather Radar: Overlays live multi-frame precipitation radar tiles and local surface conditions with a toggle between Weather.com (The Weather Company / global radar mosaic) and AviationWeather.gov (NOAA NEXRAD), playback animation, and real-time opacity sliders.
• 4D Kinematic Trajectory & 3D A* Safe Corridor Routing: Projects 90-minute aircraft trajectories and computes lateral + vertical A* detours that steer around storm cells, climb or descend out of icing layers, maintain traffic separation, and optimize ETAs using multi-altitude GFS winds aloft.
• Point-to-Point Route Planner & Diversion Finder: Builds Great-Circle flight plans between any two airports or cities, attaches color-coded VFR / MVFR / IFR / LIFR METAR & TAF badges, discovers configurable en-route alternate diversion airports, and exports flight plans to GPX or GeoJSON.


## Quick Setup (Installs Python `venv` & `frontend/cesium`)

```bash
chmod +x setup.sh restart.sh
./setup.sh
./restart.sh
```

Then open **`http://localhost:3000/`** in your browser.

## Project Structure

```text
flight-forecast-engine/
├── setup.sh                    # Automated installer for backend/venv and frontend/cesium
├── restart.sh                  # Launches FastAPI backend (:8000) & static frontend (:3000)
├── .gitignore                  # Excludes venv/, frontend/cesium/, .env, and __pycache__/
├── backend/
│   ├── requirements.txt        # Python dependencies (FastAPI, Uvicorn, Shapely, HTTPX)
│   ├── config.py               # Environment settings & optional TWC_API_KEY
│   ├── logger.py               # Structured backend logging
│   ├── main.py                 # FastAPI REST endpoints (/snapshot, /forecast, /route/plan)
│   ├── traffic_client.py       # Live community ADS-B client (adsb.lol / adsb.fi)
│   ├── weather_client.py       # NOAA AWC G-AIRMET, SIGMET, PIREP, METAR & TAF client
│   ├── radar_weather_client.py # Multi-frame animated radar & surface weather client
│   ├── winds_client.py         # Multi-altitude GFS winds aloft client
│   ├── trajectory_predictor.py # 90-minute 4D kinematic trajectory & hazard intersection
│   ├── safe_router.py          # 3D (lateral + vertical) A* pathfinder with winds aloft
│   ├── route_planner.py        # Great-Circle airport/city geocoder & route builder
│   └── alternates_finder.py    # En-route diversion airport & METAR scorer
└── frontend/
    ├── package.json            # Frontend dependency manifest (CesiumJS)
    ├── index.html              # Minimal HTML shell
    ├── styles.css              # HUD, slider, switch, and chart styles
    ├── hud_builder.js          # Modular HUD controls, opacity sliders & legend
    ├── map_layers.js           # CesiumJS globe, map tiles, radar animation & geometry helpers
    ├── weather_renderer.js     # 3D extruded & Low-GPU 2D AIRMET/SIGMET renderer
    ├── route_renderer.js       # Heading-rotated aircraft icons, 3D ribbons & airport badges
    ├── chart_renderer.js       # 2D vertical altitude profile & shaded hazard canvas
    ├── hud_card_renderer.js    # Interactive telemetry & weather advisory cards
    ├── export_service.js       # GPX & GeoJSON flight plan exporter
    ├── api_client.js           # Backend REST API wrapper
    ├── route_controller.js     # Forecast & point-to-point route orchestration
    └── flight_controller.js    # Main UI entrypoint & event listeners
```
