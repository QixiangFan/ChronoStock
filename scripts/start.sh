#!/usr/bin/env bash
# Start ChronoStock Redis + backend + frontend in one command.
# Usage: bash scripts/start.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "ChronoStock Dev Server"
echo "----------------------"

# ── Activate conda env ────────────────────────────────────────────────────────
CONDA_BASE="$(conda info --base 2>/dev/null || true)"
if [ -z "$CONDA_BASE" ]; then
  echo "ERROR: conda not found. Install conda first."
  exit 1
fi
source "$CONDA_BASE/etc/profile.d/conda.sh"

if ! conda activate chronostock 2>/dev/null; then
  echo "ERROR: conda environment 'chronostock' not found. Run bash scripts/setup.sh first."
  exit 1
fi
echo "conda env 'chronostock' activated."

# ── Check .env ────────────────────────────────────────────────────────────────
if [ ! -f "$ROOT/backend/.env" ]; then
  echo "WARNING: backend/.env not found -- copying from .env.example."
  cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
  echo "  Edit backend/.env and set JWT_SECRET_KEY before using auth features."
fi

# ── Redis ─────────────────────────────────────────────────────────────────────
if command -v redis-server &>/dev/null; then
  echo "Starting Redis on localhost:6379..."
  redis-server "$ROOT/backend/redis.conf" --daemonize no &
  REDIS_PID=$!
  sleep 0.5
  if ! kill -0 "$REDIS_PID" 2>/dev/null; then
    echo "ERROR: Redis failed to start."
    exit 1
  fi
  echo "Redis running (pid $REDIS_PID)."
else
  echo "WARNING: redis-server not found -- skipping Redis. Cache will fall back to local files."
  REDIS_PID=""
fi

# ── Backend ───────────────────────────────────────────────────────────────────
echo "Starting backend on http://localhost:8000..."
cd "$ROOT/backend"
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!

sleep 1

# ── Frontend ──────────────────────────────────────────────────────────────────
echo "Starting frontend on http://localhost:3000..."
cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "All servers running. Press Ctrl+C to stop."
echo ""

# ── Cleanup on Ctrl+C / exit ──────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "Stopping servers..."
  kill "$BACKEND_PID"  2>/dev/null || true
  kill "$FRONTEND_PID" 2>/dev/null || true
  [ -n "$REDIS_PID" ] && kill "$REDIS_PID" 2>/dev/null || true
  wait "$BACKEND_PID"  2>/dev/null || true
  wait "$FRONTEND_PID" 2>/dev/null || true
  [ -n "$REDIS_PID" ] && wait "$REDIS_PID" 2>/dev/null || true
  echo "Done."
}
trap cleanup INT TERM

wait
