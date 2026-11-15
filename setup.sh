#!/usr/bin/env bash
set -e

echo "=== 1. Setting up Python Virtual Environment (backend/venv) ==="
python3 -m venv backend/venv
./backend/venv/bin/pip install --upgrade pip
./backend/venv/bin/pip install -r backend/requirements.txt

echo "=== 2. Downloading & Extracting CesiumJS into frontend/cesium ==="
mkdir -p frontend/cesium
cd frontend/cesium

# Download latest CesiumJS package from github
set -e
REPO="CesiumGS/cesium"
API_URL="https://github.com"
echo "Fetching latest Cesium release info..."

# Fetch the download URL for the Cesium-*.zip file
DOWNLOAD_URL=$(curl -s "$API_URL" | grep -oE "https://github.com[^\"]+/Cesium-[0-9.]+\.zip" | head -n 1)

if [ -z "$DOWNLOAD_URL" ]; then
    echo "Error: Could not find the latest release download URL."
    exit 1
fi

FILENAME=$(basename "$DOWNLOAD_URL")
echo "Downloading $FILENAME from $DOWNLOAD_URL..."
curl -L -o "$FILENAME" "$DOWNLOAD_URL"
echo "Download complete: $FILENAME"
mv $FILENAME cesium.zip

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
