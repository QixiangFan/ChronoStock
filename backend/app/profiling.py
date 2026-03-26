import argparse
import cProfile
import os
import pstats
import re

APP_DIR = os.path.dirname(os.path.abspath(__file__))
REPORT_PATH = os.path.join(APP_DIR, "report.txt")
NUM_REPORT = 20


def main() -> None:
    parser = argparse.ArgumentParser(description="Profile ChronoStock backend via test requests")
    parser.add_argument("--ticker", default="AAPL", help="Ticker symbol to profile (default: AAPL)")
    args = parser.parse_args()

    ticker = args.ticker.upper()

    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app, raise_server_exceptions=False)
    profiler = cProfile.Profile()

    print(f"Profiling ticker={ticker} ...")
    profiler.enable()
    client.get("/health")
    client.get("/api/trending")
    client.get(f"/api/prices?tickers={ticker}")
    client.get(f"/api/stock/{ticker}")
    client.get(f"/api/news/{ticker}")
    client.get(f"/api/earnings/{ticker}")
    client.get(f"/api/sec/{ticker}")
    client.get(f"/api/search?q={ticker}")
    profiler.disable()

    with open(REPORT_PATH, "w", encoding="utf-8") as report:
        stats = pstats.Stats(profiler, stream=report).sort_stats("cumulative")
        stats.print_stats(re.escape(APP_DIR), NUM_REPORT)

    print(f"Report saved to {REPORT_PATH}")


if __name__ == "__main__":
    main()
