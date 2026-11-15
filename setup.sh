#!/usr/bin/env bash
set -e

echo "=== 1. Setting up Python Virtual Environment (backend/venv) ==="
python3 -m venv backend/venv
./backend/venv/bin/pip install --upgrade pip
./backend/venv/bin/pip install -r backend/requirements.txt

echo "=== 2. Downloading & Extracting CesiumJS into frontend/cesium ==="

# Download latest CesiumJS package from github
chmod +x setup_cesium.sh restart.sh
./setup_cesium.sh

echo "=== 3. Creating default .env if missing ==="
if [ ! -f backend/.env ]; then
  cat << 'ENVEOF' > backend/.env
TRAFFIC_PROVIDER=community
DEFAULT_CENTER_LAT=40.09
DEFAULT_CENTER_LON=-83.02
DEFAULT_RADIUS_NM=250
TWC_API_KEY=
ENVEOF
fi

echo "Setup complete! Run ./restart.sh to start the backend and frontend servers."
