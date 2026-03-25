#!/usr/bin/env bash
# Usage: bash scripts/setup.sh
set -e

sudo apt-get install -y redis-server

CONDA_BASE="$(conda info --base 2>/dev/null || true)"
if [ -z "$CONDA_BASE" ]; then
  echo "ERROR: conda not found. Install conda first."
  exit 1
fi
source "$CONDA_BASE/etc/profile.d/conda.sh"

conda create -n chronostock python=3.12 -y
conda activate chronostock
pip install --upgrade pip
pip install -r backend/requirements.txt

cp -n backend/.env.example backend/.env
