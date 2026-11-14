# 4D Predictive Flight, Weather & Icing Avoidance Engine

Real-time 3D aviation trajectory forecasting, NOAA G-AIRMET/SIGMET hazard avoidance, multi-frame weather radar, winds-aloft ETA optimization, and en-route diversion airport pathfinding built with **FastAPI**, **Shapely**, and **CesiumJS**.

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
