#!/usr/bin/env bash
# Usage: bash scripts/benchmark.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ── Activate conda env ────────────────────────────────────────────────────────
CONDA_BASE="$(conda info --base 2>/dev/null || true)"
if [ -z "$CONDA_BASE" ]; then
  echo "ERROR: conda not found."
  exit 1
fi
source "$CONDA_BASE/etc/profile.d/conda.sh"

if ! conda activate chronostock 2>/dev/null; then
  echo "ERROR: conda environment 'chronostock' not found."
  exit 1
fi

# ── Start Redis ───────────────────────────────────────────────────────────────
REDIS_PID=""
if command -v redis-server &>/dev/null; then
  if sudo lsof -i :6379 &>/dev/null; then
    echo "Redis already running on port 6379."
  else
    echo "Starting Redis..."
    redis-server "$ROOT/backend/redis.conf" --daemonize no &
    REDIS_PID=$!
    sleep 0.5
    if ! kill -0 "$REDIS_PID" 2>/dev/null; then
      echo "ERROR: Redis failed to start."
      exit 1
    fi
    echo "Redis running (pid $REDIS_PID)."
  fi
else
  echo "WARNING: redis-server not found."
fi

# ── Run benchmark ─────────────────────────────────────────────────────────────
cd "$ROOT/backend"
python -m app.benchmark cache --compare local redis

# ── Stop Redis if we started it ───────────────────────────────────────────────
if [ -n "$REDIS_PID" ]; then
  echo "Stopping Redis..."
  kill "$REDIS_PID" 2>/dev/null || true
  wait "$REDIS_PID" 2>/dev/null || true
fi
