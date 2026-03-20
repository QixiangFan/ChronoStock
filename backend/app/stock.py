"""
yfinance wrapper — fetches OHLC bars, company info, and fundamentals.

We always fetch the full available history (period="max") and store it as one
file per ticker. Range filtering happens in main.py after reading from cache.
"""
from datetime import datetime, timezone
import yfinance as yf
from .models import OHLCBar, StockMeta


def fetch_bars(ticker: str) -> list[OHLCBar]:
    """Fetch the complete available price history for a ticker."""
    df = yf.download(ticker, period="max", auto_adjust=True, progress=False, multi_level_index=False)

    if df.empty:
        raise ValueError(f"No data returned for {ticker}")

    bars: list[OHLCBar] = []
    for ts, row in df.iterrows():
        bars.append(
            OHLCBar(
                time=ts.strftime("%Y-%m-%d"),
                open=round(float(row["Open"]), 2),
                high=round(float(row["High"]), 2),
                low=round(float(row["Low"]), 2),
                close=round(float(row["Close"]), 2),
                volume=int(row["Volume"]),
            )
        )
    return bars


def _unix_to_date(ts) -> str | None:
    """Convert a unix timestamp (int) to a YYYY-MM-DD string."""
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc).strftime("%Y-%m-%d")
    except Exception:
        return None


def fetch_info(ticker: str) -> tuple[str, StockMeta]:
    """
    Single yfinance call that returns (companyName, StockMeta).
    Avoids calling .info twice.
    """
    info = yf.Ticker(ticker).info

    company_name = info.get("longName") or info.get("shortName") or ticker.upper()

    # Analyst recommendation → human-readable label
    ANALYST_MAP = {
        "strong_buy": "Strong Buy",
        "buy": "Buy",
        "hold": "Hold",
        "underperform": "Underperform",
        "sell": "Sell",
    }
    analyst_raw = info.get("recommendationKey", "")
    analyst = ANALYST_MAP.get(analyst_raw)

    meta = StockMeta(
        marketCap=info.get("marketCap"),
        revenue=info.get("totalRevenue"),
        netIncome=info.get("netIncomeToCommon"),
        eps=info.get("trailingEps"),
        sharesOutstanding=info.get("sharesOutstanding"),
        peRatio=info.get("trailingPE"),
        forwardPE=info.get("forwardPE"),
        dividendRate=info.get("dividendRate"),
        dividendYield=info.get("dividendYield"),
        exDividendDate=_unix_to_date(info.get("exDividendDate")),
        volume=info.get("volume"),
        previousClose=info.get("previousClose"),
        dayLow=info.get("dayLow"),
        dayHigh=info.get("dayHigh"),
        weekLow52=info.get("fiftyTwoWeekLow"),
        weekHigh52=info.get("fiftyTwoWeekHigh"),
        beta=info.get("beta"),
        analystRating=analyst,
        priceTarget=info.get("targetMeanPrice"),
        earningsDate=_unix_to_date(info.get("earningsTimestamp")),
    )

    return company_name, meta


def search_tickers(query: str) -> list[dict]:
    results = []
    try:
        hits = yf.Search(query, max_results=6).quotes
        for h in hits:
            sym = h.get("symbol", "")
            name = h.get("longname") or h.get("shortname") or sym
            if sym:
                results.append({"ticker": sym, "companyName": name})
    except Exception:
        pass
    return results
