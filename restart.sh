#!/usr/bin/env bash
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

kill_port() {
  local PORT=$1
  echo "Checking for processes on port $PORT..."
  if command -v fuser >/dev/null 2>&1; then
    fuser -k -9 "${PORT}/tcp" 2>/dev/null || true
  elif command -v lsof >/dev/null 2>&1; then
    PIDS=$(lsof -ti tcp:"${PORT}" 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
      echo "Killing PIDs on port $PORT: $PIDS"
      kill -9 $PIDS 2>/dev/null || true
    fi
  fi
}

# Kill any Java, Python, or other processes holding ports 8000 and 3000
kill_port 8000
kill_port 3000
pkill -f "uvicorn main:app" 2>/dev/null || true
pkill -f "http.server 3000" 2>/dev/null || true
sleep 1

# Verify virtual environment exists
if [ ! -f "$BACKEND_DIR/venv/bin/activate" ]; then
  echo "Error: Virtual environment not found at $BACKEND_DIR/venv"
  exit 1
fi

echo "Starting FastAPI backend on http://localhost:8000 (verbose debug logging)..."
cd "$BACKEND_DIR"
source venv/bin/activate
uvicorn main:app --reload --port 8000 --log-level debug &
BACKEND_PID=$!

echo "Starting Frontend server on http://localhost:3000..."
cd "$FRONTEND_DIR"
python3 -m http.server 3000 >/dev/null 2>&1 &
FRONTEND_PID=$!

# Cleanly stop both servers when you press Ctrl+C
trap "echo ''; echo 'Shutting down backend and frontend...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true; kill_port 8000; kill_port 3000; exit 0" INT TERM

echo "=========================================================="
echo "Ports 8000 & 3000 cleared and servers started!"
echo "Frontend UI : http://localhost:3000"
echo "Backend API : http://localhost:8000/docs"
echo "Press Ctrl+C to stop both servers."
echo "=========================================================="

wait
