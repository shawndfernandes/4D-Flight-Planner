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
