"""Instagram stats — Windsor.ai `instagram` connector.

Scoped to the meetup review: **views, reach, shares, saves** as week-over-week
and month-over-month comparisons.

Metric aggregation is metric-specific and this is the whole point of the route:
  • views / saves / shares are additive → summed over each period.
  • reach is *unique accounts reached* → it must NOT be summed (that double-counts
    anyone reached on multiple days). Windsor returns the correct DEDUPLICATED
    period reach when `reach` is queried WITHOUT the `date` dimension, so we fetch
    reach per period as its own query (matches Instagram's "Accounts reached").
Today's (partial) day is excluded so periods compare complete days only.
"""

from __future__ import annotations

import asyncio
import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from ..windsor_client import fetch_rows

router = APIRouter(prefix="/api/instagram", tags=["instagram"])

CONNECTOR = "instagram"
# Additive metrics come from the daily series; reach is fetched per-period.
ADDITIVE_FIELDS = ["date", "account_name", "account_id", "username", "views", "saves", "shares"]
ADDITIVE_METRICS = ["views", "saves", "shares"]

GRAN_STRIDE = {"week": 7, "month": 30}
GRAN_LOOKBACK = {"week": 13, "month": 6}
_HISTORY_DAYS = 200


def _num(value: Any) -> float:
    if value is None or value == "":
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _for_account(rows: list[dict[str, Any]], account_id: str) -> list[dict[str, Any]]:
    return [r for r in rows if str(r.get("account_id", "")) == account_id]


def _exclude_today(rows: list[dict[str, Any]], today: datetime.date) -> list[dict[str, Any]]:
    """Drop the current, in-progress day — Instagram's stats for today are
    incomplete, which would make the current week/month look artificially low."""
    today_iso = today.isoformat()
    return [r for r in rows if str(r.get("date", "")).strip() < today_iso]


async def _period_reach(
    account_id: str, start: datetime.date, end: datetime.date
) -> float | None:
    """Deduplicated unique reach for one period — `reach` with no `date` field."""
    try:
        rows = await fetch_rows(CONNECTOR, ["account_id", "reach"], start, end)
    except HTTPException:
        return None
    for r in rows:
        if str(r.get("account_id", "")) == account_id:
            return round(_num(r.get("reach")))
    return round(_num(rows[0].get("reach"))) if rows else None


@router.get("/accounts")
async def accounts() -> dict[str, Any]:
    """Per-account 30-day views / reach / saves / shares for the hub cards.
    Reach is the deduplicated 30-day figure (matches Instagram)."""
    today = datetime.date.today()
    start = today - datetime.timedelta(days=30)
    rows = _exclude_today(
        await fetch_rows(CONNECTOR, ADDITIVE_FIELDS, start, today), today
    )
    # Deduplicated reach per account (one query, no date dimension).
    try:
        reach_rows = await fetch_rows(CONNECTOR, ["account_id", "reach"], start, today)
    except HTTPException:
        reach_rows = []
    reach_by_account = {
        str(r.get("account_id", "")): round(_num(r.get("reach"))) for r in reach_rows
    }

    by_account: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        aid = str(r.get("account_id", "")).strip()
        if aid:
            by_account.setdefault(aid, []).append(r)

    out = []
    for aid, arows in by_account.items():
        out.append(
            {
                "account_id": aid,
                "username": next(
                    (str(r.get("username") or "") for r in arows if r.get("username")), ""
                ),
                "views": round(sum(_num(r.get("views")) for r in arows)),
                "reach": reach_by_account.get(aid, 0),
                "saves": round(sum(_num(r.get("saves")) for r in arows)),
                "shares": round(sum(_num(r.get("shares")) for r in arows)),
            }
        )
    return {"accounts": out, "window_days": 30}


@router.get("/dashboard")
async def dashboard(
    account_id: str = Query(..., description="Windsor Instagram account_id"),
    granularity: str = Query("week", description="week | month"),
) -> dict[str, Any]:
    if granularity not in GRAN_STRIDE:
        raise HTTPException(status_code=400, detail=f"Unknown granularity: {granularity}")

    today = datetime.date.today()
    rows = _exclude_today(
        _for_account(
            await fetch_rows(
                CONNECTOR,
                ADDITIVE_FIELDS,
                today - datetime.timedelta(days=_HISTORY_DAYS),
                today,
            ),
            account_id,
        ),
        today,
    )

    by_date: dict[str, dict[str, float]] = {}
    account_name = username = ""
    for r in rows:
        d = str(r.get("date", "")).strip()
        account_name = account_name or str(r.get("account_name") or "")
        username = username or str(r.get("username") or "")
        if not d:
            continue
        bucket = by_date.setdefault(d, {m: 0.0 for m in ADDITIVE_METRICS})
        for m in ADDITIVE_METRICS:
            bucket[m] += _num(r.get(m))

    dates = sorted(by_date)
    if not dates:
        return {
            "username": username,
            "account_name": account_name,
            "account_id": account_id,
            "granularity": granularity,
            "periods": [],
            "latest_available": None,
            "today": today.isoformat(),
        }

    latest = datetime.date.fromisoformat(dates[-1])
    stride = GRAN_STRIDE[granularity]
    n = GRAN_LOOKBACK[granularity]

    # Rolling windows anchored to the latest complete day, oldest → newest.
    windows = []
    for i in range(n - 1, -1, -1):
        end = latest - datetime.timedelta(days=i * stride)
        start = end - datetime.timedelta(days=stride - 1)
        windows.append((start, end))

    def sum_window(start: datetime.date, end: datetime.date, metric: str) -> float:
        total = 0.0
        d = start
        while d <= end:
            b = by_date.get(d.isoformat())
            if b:
                total += b[metric]
            d += datetime.timedelta(days=1)
        return round(total)

    # Deduplicated reach per period, fetched concurrently.
    reaches = await asyncio.gather(
        *[_period_reach(account_id, s, e) for s, e in windows]
    )

    periods = [
        {
            "start": s.isoformat(),
            "end": e.isoformat(),
            "views": sum_window(s, e, "views"),
            "reach": reach,
            "saves": sum_window(s, e, "saves"),
            "shares": sum_window(s, e, "shares"),
        }
        for (s, e), reach in zip(windows, reaches)
    ]

    return {
        "username": username,
        "account_name": account_name,
        "account_id": account_id,
        "granularity": granularity,
        "periods": periods,
        "latest_available": dates[-1],
        "today": today.isoformat(),
    }
