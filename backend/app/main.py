import os
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import cache
from .auth import create_token, get_current_user, hash_password, verify_password
from .database import PH, cursor as db_cursor, get_conn, init_db
from .models import (
    EarningsDate,
    OHLCBar,
    SECFiling,
    SearchResult,
    StockNews,
    StockResponse,
    Token,
    TrendingItem,
    UserCreate,
    WatchlistItem,
)
from .stock import search_tickers

load_dotenv()

app = FastAPI(title="ChronoStock API", version="0.1.0")


@app.on_event("startup")
def startup_event():
    init_db()


ALLOWED_ORIGINS = [
    "http://localhost:3000",
    os.environ.get("FRONTEND_URL", ""),
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin for origin in ALLOWED_ORIGINS if origin],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*", "Authorization"],
)


RANGE_DAYS: dict[str, int] = {
    "1W": 7,
    "1M": 30,
    "6M": 182,
    "1Y": 365,
    "5Y": 1825,
}

TimeRange = Literal["1W", "1M", "6M", "1Y", "5Y", "ALL"]


def _filter_bars(bars: list[OHLCBar], range_key: str) -> list[OHLCBar]:
    if range_key == "ALL":
        return bars
    cutoff = (date.today() - timedelta(days=RANGE_DAYS[range_key])).isoformat()
    return [bar for bar in bars if bar.time >= cutoff]


def _cached_or_503(key: str):
    cached = cache.get(key)
    if cached is None:
        raise HTTPException(status_code=503, detail=f"Cached data not ready for {key}")
    return cached


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/stock/{ticker}", response_model=StockResponse)
def get_stock(
    ticker: str,
    range: TimeRange = Query(default="1Y"),
):
    ticker = ticker.upper()
    cached = _cached_or_503(f"stock:{ticker}")
    full = StockResponse(**{k: v for k, v in cached.items() if k != "cached_at"})

    filtered_bars = _filter_bars(full.bars, range)
    from_date = filtered_bars[0].time if filtered_bars else ""
    filtered_events = [event for event in full.events if event.time >= from_date]

    return StockResponse(
        ticker=full.ticker,
        companyName=full.companyName,
        bars=filtered_bars,
        events=filtered_events,
        meta=full.meta,
    )


@app.get("/api/earnings/{ticker}", response_model=list[EarningsDate])
def get_earnings(ticker: str):
    ticker = ticker.upper()
    cached = _cached_or_503(f"earnings:{ticker}")
    return [EarningsDate(**item) for item in cached["items"]]


@app.get("/api/news/{ticker}", response_model=list[StockNews])
def get_news(ticker: str):
    ticker = ticker.upper()
    cached = _cached_or_503(f"news:{ticker}")
    return [StockNews(**item) for item in cached["items"]]


@app.get("/api/prices", response_model=list[TrendingItem])
def prices(tickers: str = Query(description="Comma-separated list of tickers")):
    symbols = [ticker.strip().upper() for ticker in tickers.split(",") if ticker.strip()]
    if not symbols:
        return []

    results: list[TrendingItem] = []
    for symbol in symbols:
        cached = _cached_or_503(f"price:{symbol}")
        results.append(TrendingItem(**{k: v for k, v in cached.items() if k != "cached_at"}))

    order = {symbol: i for i, symbol in enumerate(symbols)}
    results.sort(key=lambda item: order.get(item.ticker, 999))
    return results


@app.get("/api/sec/{ticker}", response_model=list[SECFiling])
def get_sec_filings(ticker: str):
    ticker = ticker.upper()
    cached = _cached_or_503(f"sec:filings:{ticker}")
    return [SECFiling(**item) for item in cached["items"]]


@app.get("/api/search", response_model=list[SearchResult])
def search(q: str = Query(min_length=1)):
    return [SearchResult(**result) for result in search_tickers(q)]


@app.get("/api/trending", response_model=list[TrendingItem])
def trending():
    cached = _cached_or_503("trending")
    return [TrendingItem(**item) for item in cached["items"]]


@app.post("/auth/signup", response_model=Token)
def signup(body: UserCreate):
    conn = get_conn()
    try:
        with db_cursor(conn) as cur:
            cur.execute(
                f"SELECT id FROM users WHERE email = {PH}", (body.email,)
            )
            existing = cur.fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")

        user_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        hashed = hash_password(body.password)

        with db_cursor(conn) as cur:
            cur.execute(
                f"INSERT INTO users (id, email, hashed_password, created_at) VALUES ({PH}, {PH}, {PH}, {PH})",
                (user_id, body.email, hashed, created_at),
            )
        conn.commit()
    finally:
        conn.close()

    token = create_token(user_id=user_id, email=body.email)
    return Token(access_token=token)


@app.post("/auth/login", response_model=Token)
def login(body: UserCreate):
    conn = get_conn()
    try:
        with db_cursor(conn) as cur:
            cur.execute(
                f"SELECT id, email, hashed_password FROM users WHERE email = {PH}", (body.email,)
            )
            row = cur.fetchone()
    finally:
        conn.close()

    if not row or not verify_password(body.password, row["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_token(user_id=row["id"], email=row["email"])
    return Token(access_token=token)


@app.get("/auth/me")
def me(current_user: dict = Depends(get_current_user)):
    return {"id": current_user["sub"], "email": current_user["email"]}


@app.get("/api/watchlist", response_model=list[WatchlistItem])
def get_watchlist(current_user: dict = Depends(get_current_user)):
    conn = get_conn()
    try:
        with db_cursor(conn) as cur:
            cur.execute(
                f"SELECT ticker, added_at FROM watchlist WHERE user_id = {PH} ORDER BY added_at DESC",
                (current_user["sub"],),
            )
            rows = cur.fetchall()
    finally:
        conn.close()
    return [WatchlistItem(ticker=row["ticker"], added_at=row["added_at"]) for row in rows]


@app.post("/api/watchlist/{ticker}", status_code=204)
def add_to_watchlist(ticker: str, current_user: dict = Depends(get_current_user)):
    ticker = ticker.upper()
    added_at = datetime.now(timezone.utc).isoformat()
    conn = get_conn()
    try:
        with db_cursor(conn) as cur:
            cur.execute(
                f"INSERT INTO watchlist (user_id, ticker, added_at) VALUES ({PH}, {PH}, {PH}) ON CONFLICT DO NOTHING",
                (current_user["sub"], ticker, added_at),
            )
        conn.commit()
    finally:
        conn.close()


@app.delete("/api/watchlist/{ticker}", status_code=204)
def remove_from_watchlist(ticker: str, current_user: dict = Depends(get_current_user)):
    ticker = ticker.upper()
    conn = get_conn()
    try:
        with db_cursor(conn) as cur:
            cur.execute(
                f"DELETE FROM watchlist WHERE user_id = {PH} AND ticker = {PH}",
                (current_user["sub"], ticker),
            )
        conn.commit()
    finally:
        conn.close()
