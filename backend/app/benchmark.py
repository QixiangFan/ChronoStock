"""
API endpoint benchmark suite — pytest-benchmark.

Usage:
  pytest app/benchmark.py -v
  pytest app/benchmark.py -v --benchmark-sort=mean
  pytest app/benchmark.py -v --benchmark-compare
"""
import os

import pytest
from fastapi.testclient import TestClient
from app.main import app

TICKER = os.environ.get("TICKER", "AAPL").upper()

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def warmup():
    # Cold pass — populates cache, not measured
    client.get("/health")
    client.get("/api/trending")
    client.get(f"/api/prices?tickers={TICKER}")
    client.get(f"/api/stock/{TICKER}")
    client.get(f"/api/news/{TICKER}")
    client.get(f"/api/earnings/{TICKER}")
    client.get(f"/api/sec/{TICKER}")
    client.get(f"/api/search?q={TICKER}")


def test_health(benchmark):
    benchmark(client.get, "/health")


def test_trending(benchmark):
    benchmark(client.get, "/api/trending")


def test_prices(benchmark):
    benchmark(client.get, f"/api/prices?tickers={TICKER}")


def test_stock(benchmark):
    benchmark(client.get, f"/api/stock/{TICKER}")


def test_news(benchmark):
    benchmark(client.get, f"/api/news/{TICKER}")


def test_earnings(benchmark):
    benchmark(client.get, f"/api/earnings/{TICKER}")


def test_sec(benchmark):
    benchmark(client.get, f"/api/sec/{TICKER}")


def test_search(benchmark):
    benchmark(client.get, f"/api/search?q={TICKER}")
