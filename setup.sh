#!/usr/bin/env bash
set -e

echo "=== 1. Setting up Python Virtual Environment (backend/venv) ==="
python3 -m venv backend/venv
./backend/venv/bin/pip install --upgrade pip
./backend/venv/bin/pip install -r backend/requirements.txt

echo "=== 2. Downloading & Extracting CesiumJS into frontend/cesium ==="
mkdir -p frontend/cesium
cd frontend/cesium
curl -L -o cesium.zip "https://github.com"
python3 -m zipfile -e cesium.zip .
mv Build/Cesium/* .
rm -rf Build Apps ThirdParty cesium.zip index.html server.cjs package.json LICENSE.md CHANGES.md README.md
cd ../..

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
