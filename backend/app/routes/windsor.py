"""YouTube stats dashboard — Windsor.ai proxy.

The Windsor connector API key stays server-side; the frontend only ever talks
to these endpoints. We fetch daily-grain rows for the requested date range,
then aggregate them into headline KPIs plus a per-day timeseries the dashboard
charts.

Windsor's YouTube connector exposes different field sets depending on whether
the account is connected via public data or YouTube Analytics, so we request a
generous superset and gracefully drop any field the API rejects.
"""

from __future__ import annotations

import asyncio
import datetime
import logging
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query

from .. import config

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/youtube", tags=["youtube"])

WINDSOR_URL = "https://connectors.windsor.ai/youtube"

# How many trailing days a fixed-window preset covers. `this_year` / `all_time`
# are handled specially (calendar-year / full history). We DON'T use Windsor's
# fuzzy `date_preset` presets: they anchor to "today" and, because Windsor lags
# ~2-3 days behind YouTube, resolve to a short window that starts a day late —
# which is exactly why "last 7 days" undercounted vs YouTube Studio. Instead we
# request explicit dates and anchor the window to the latest day Windsor
# actually has data for, so a 7-day window is a full 7 days of real data that
# reconciles with Studio once its sync catches up.
FIXED_WINDOWS: dict[str, int] = {
    "last_7d": 7,
    "last_30d": 30,
    "last_90d": 90,
}
SPECIAL_PRESETS = {"this_year", "all_time"}
PRESETS = set(FIXED_WINDOWS) | SPECIAL_PRESETS

# Buffer of extra days to over-fetch for fixed windows, so that after we anchor
# to the latest available date we still have a full N-day window in hand even
# with Windsor's sync lag.
_LAG_BUFFER_DAYS = 7
# Earliest date we'll ask for on "all time" — the connector clamps to the
# channel's actual history anyway.
_EPOCH = datetime.date(2005, 1, 1)

# Field names verified against the live Windsor YouTube connector. When only
# `date`/`account_name` are requested as dimensions, Windsor pre-aggregates to
# one row per day. Ordered core-first so the fallback keeps fields that almost
# always exist.
CORE_FIELDS = [
    "date",
    "account_name",
    "channel_id",
    "channel_title",
    "views",
    "likes",
    "comments",
    "estimated_minutes_watched",
    "subscribers_gained",
    "subscriber_count",
]

# Dimension fields that identify the row rather than being metrics to aggregate.
DIMENSION_FIELDS = {"date", "account_name", "channel_id", "channel_title"}
EXTENDED_FIELDS = CORE_FIELDS + [
    "shares",
    "dislikes",
    "subscribers_lost",
    "engaged_views",
    "red_views",
    "average_view_duration",
    "average_view_percentage",
]

# Metrics that accumulate over the range (summed).
ADDITIVE_METRICS = [
    "views",
    "likes",
    "comments",
    "shares",
    "dislikes",
    "estimated_minutes_watched",
    "subscribers_gained",
    "subscribers_lost",
    "engaged_views",
    "red_views",
]
# `subscriber_count` is the channel's current total, repeated on every row —
# take the latest, never sum.
SNAPSHOT_METRICS = ["subscriber_count"]
# Rates: aggregated as a views-weighted average so the range figure is correct.
AVERAGE_METRICS = ["average_view_duration", "average_view_percentage"]


def _num(value: Any) -> float:
    """Best-effort numeric coercion; blanks / non-numeric -> 0.0."""
    if value is None or value == "":
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


# The Windsor connector intermittently returns a "license expired" sentinel
# even on an active plan (observed right after a plan upgrade, while it
# propagates). Real data is available on most attempts, so we retry a few times
# before concluding the license is genuinely inactive.
_LICENSE_RETRIES = 4
_LICENSE_RETRY_DELAY = 0.6  # seconds


async def _windsor_get(
    fields: list[str], date_from: datetime.date, date_to: datetime.date
) -> list[dict[str, Any]]:
    """Call the Windsor YouTube connector for an explicit date range and return
    its `data` rows.

    Raises HTTPException / _WindsorError with a user-readable message on failure.
    Retries transparently through transient "license expired" sentinel responses.
    """
    params = {
        "api_key": config.WINDSOR_API_KEY,
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "fields": ",".join(fields),
        "_renderer": "json",
    }
    async with httpx.AsyncClient(timeout=40) as client:
        for attempt in range(_LICENSE_RETRIES):
            resp = await client.get(WINDSOR_URL, params=params)

            # Windsor signals bad field names / auth via an `error` key,
            # sometimes with a 200. Surface that so the fallback can react.
            try:
                body = resp.json()
            except ValueError:
                raise HTTPException(
                    status_code=502,
                    detail=f"Windsor returned a non-JSON response ({resp.status_code}).",
                )

            if isinstance(body, dict) and body.get("error"):
                raise _WindsorError(str(body["error"]), resp.status_code)
            if resp.status_code != 200:
                raise _WindsorError(f"HTTP {resp.status_code}", resp.status_code)

            data = (body.get("data") if isinstance(body, dict) else body) or []
            if not _license_expired(data):
                return data

            log.warning(
                "Windsor returned license-expired sentinel (attempt %d/%d)",
                attempt + 1,
                _LICENSE_RETRIES,
            )
            if attempt < _LICENSE_RETRIES - 1:
                await asyncio.sleep(_LICENSE_RETRY_DELAY)

    # Every attempt hit the sentinel — treat as genuinely inactive.
    raise HTTPException(
        status_code=402,
        detail=(
            "Windsor.ai returned no data (license/trial inactive). If you just "
            "upgraded, give it a minute and refresh. Otherwise renew at "
            "https://windsor.ai/pricing — your channel connections and this "
            "dashboard will keep working once it's active again."
        ),
    )


def _license_expired(rows: list[dict[str, Any]]) -> bool:
    """Windsor signals an expired license/trial by returning a single sentinel
    row (HTTP 200, no `error` key) with a "License expired" message stuffed into
    the text fields and zeros everywhere else."""
    if not rows:
        return False
    blob = " ".join(str(v) for v in rows[0].values()).lower()
    return "license expired" in blob or "windsor.ai/pricing" in blob


class _WindsorError(Exception):
    def __init__(self, message: str, status: int) -> None:
        super().__init__(message)
        self.status = status


async def _fetch_rows(
    date_from: datetime.date, date_to: datetime.date
) -> tuple[list[dict[str, Any]], list[str]]:
    """Fetch daily rows for a date range, degrading the field list if Windsor
    rejects the extended set. Returns (rows, fields_that_worked)."""
    for fields in (EXTENDED_FIELDS, CORE_FIELDS):
        try:
            rows = await _windsor_get(fields, date_from, date_to)
            return rows, fields
        except _WindsorError as exc:
            log.warning("Windsor rejected %d fields (%s); trying smaller set", len(fields), exc)
            last = exc
    # Both attempts failed — the error is about auth / the connection, not fields.
    raise HTTPException(
        status_code=502,
        detail=f"Windsor error: {last}",  # type: ignore[possibly-undefined]
    )


def _aggregate(rows: list[dict[str, Any]], present_fields: list[str]) -> dict[str, Any]:
    """Collapse rows into KPIs + a sorted daily timeseries.

    Windsor usually returns one row per day already, but we aggregate anyway so
    the result is correct even if the grain is finer. Additive metrics are
    summed; `subscriber_count` takes the latest snapshot; average rates use a
    views-weighted mean so the range figure isn't skewed by low-traffic days.
    """
    metric_fields = [f for f in present_fields if f not in DIMENSION_FIELDS]

    # Per-date accumulators.
    sums: dict[str, dict[str, float]] = {}
    snaps: dict[str, dict[str, float]] = {}
    # Weighted-average numerator/denominator, per date and global.
    wnum: dict[str, dict[str, float]] = {}
    wden: dict[str, dict[str, float]] = {}

    account_name = ""
    channel_title = ""
    for row in rows:
        date = str(row.get("date", "")).strip()
        account_name = account_name or str(row.get("account_name", "") or "")
        channel_title = channel_title or str(row.get("channel_title", "") or "")
        if not date:
            continue
        s = sums.setdefault(date, {f: 0.0 for f in metric_fields})
        weight = _num(row.get("views"))
        for f in metric_fields:
            val = _num(row.get(f))
            if f in SNAPSHOT_METRICS:
                if val:
                    snaps.setdefault(date, {})[f] = val
            elif f in AVERAGE_METRICS:
                wnum.setdefault(date, {}).setdefault(f, 0.0)
                wden.setdefault(date, {}).setdefault(f, 0.0)
                wnum[date][f] += val * weight
                wden[date][f] += weight
            else:
                s[f] += val

    def day_value(date: str, f: str) -> float:
        if f in SNAPSHOT_METRICS:
            return snaps.get(date, {}).get(f, 0.0)
        if f in AVERAGE_METRICS:
            den = wden.get(date, {}).get(f, 0.0)
            return wnum.get(date, {}).get(f, 0.0) / den if den else 0.0
        return sums.get(date, {}).get(f, 0.0)

    timeseries = [
        {"date": date, **{f: round(day_value(date, f), 2) for f in metric_fields}}
        for date in sorted(sums)
    ]

    kpis: dict[str, float] = {}
    for f in metric_fields:
        if f in SNAPSHOT_METRICS:
            latest = next(
                (snaps[d][f] for d in sorted(snaps, reverse=True) if snaps[d].get(f)),
                0.0,
            )
            kpis[f] = round(latest, 2)
        elif f in AVERAGE_METRICS:
            num = sum(wnum[d].get(f, 0.0) for d in wnum)
            den = sum(wden[d].get(f, 0.0) for d in wden)
            kpis[f] = round(num / den, 2) if den else 0.0
        else:
            kpis[f] = round(sum(sums[d][f] for d in sums), 2)

    return {
        "account_name": account_name,
        "channel_title": channel_title,
        "kpis": kpis,
        "timeseries": timeseries,
        "metric_fields": metric_fields,
    }


def _fetch_range(preset: str, today: datetime.date) -> tuple[datetime.date, datetime.date]:
    """The date range we ask Windsor for. Fixed windows over-fetch by a buffer
    so we can anchor to the latest available day afterwards."""
    if preset in FIXED_WINDOWS:
        span = FIXED_WINDOWS[preset] - 1 + _LAG_BUFFER_DAYS
        return today - datetime.timedelta(days=span), today
    if preset == "this_year":
        return datetime.date(today.year, 1, 1), today
    return _EPOCH, today  # all_time


def _require_key() -> None:
    if not config.WINDSOR_API_KEY:
        raise HTTPException(
            status_code=503,
            detail=(
                "WINDSOR_API_KEY is not set. Add it to the repo-root .env file "
                "and restart the API."
            ),
        )


def _filter_channel(
    rows: list[dict[str, Any]], channel_id: str | None
) -> list[dict[str, Any]]:
    """Keep only rows for one channel. Windsor returns every connected channel
    under the key, so we filter here. A no-op when only one channel exists."""
    if not channel_id:
        return rows
    return [r for r in rows if str(r.get("channel_id", "")) == channel_id]


@router.get("/dashboard")
async def dashboard(
    preset: str = Query("last_30d", description="One of: " + ", ".join(sorted(PRESETS))),
    channel_id: str | None = Query(None, description="Windsor channel_id to scope to"),
) -> dict[str, Any]:
    """Everything the dashboard needs in a single call: KPIs, timeseries, the
    covered date range, data freshness, and which metrics are available.

    Fixed-window presets ("last 7/30/90 days") are anchored to the latest day
    Windsor actually has data for — not to "today" — so each window is a full N
    days of real data and reconciles with YouTube Studio for the same dates.

    When `channel_id` is given, the result is scoped to that one channel.
    """
    _require_key()
    if preset not in PRESETS:
        raise HTTPException(status_code=400, detail=f"Unknown preset: {preset}")

    today = datetime.date.today()
    fetch_from, fetch_to = _fetch_range(preset, today)
    rows, present_fields = await _fetch_rows(fetch_from, fetch_to)
    rows = _filter_channel(rows, channel_id)

    dates = sorted({str(r.get("date", "")).strip() for r in rows if r.get("date")})
    latest = dates[-1] if dates else None

    # Anchor fixed windows to the latest available day and trim to exactly N days.
    window_from = fetch_from.isoformat()
    window_to = latest or fetch_to.isoformat()
    if latest:
        window_to = latest
        if preset in FIXED_WINDOWS:
            keep_from = datetime.date.fromisoformat(latest) - datetime.timedelta(
                days=FIXED_WINDOWS[preset] - 1
            )
            window_from = keep_from.isoformat()
            rows = [
                r
                for r in rows
                if str(r.get("date", "")).strip() >= window_from
            ]
        else:
            window_from = dates[0]

    result = _aggregate(rows, present_fields)
    result["preset"] = preset
    result["channel_id"] = channel_id
    result["row_count"] = len(rows)
    result["window"] = {"from": window_from, "to": window_to}
    result["latest_available"] = latest
    result["today"] = today.isoformat()
    return result


@router.get("/accounts")
async def accounts() -> dict[str, Any]:
    """Summary stats for every YouTube channel connected under the Windsor key,
    keyed by channel_id. Powers the account flashcards on the hub. Stats cover
    the last 30 available days; `subscriber_count` is the current total."""
    _require_key()
    today = datetime.date.today()
    fetch_from = today - datetime.timedelta(days=29 + _LAG_BUFFER_DAYS)
    rows, _ = await _fetch_rows(fetch_from, today)

    # Group by channel, anchored to each channel's own latest available day.
    by_channel: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        cid = str(r.get("channel_id", "")).strip()
        if cid:
            by_channel.setdefault(cid, []).append(r)

    out = []
    for cid, crows in by_channel.items():
        dates = sorted({str(r.get("date", "")).strip() for r in crows if r.get("date")})
        latest = dates[-1] if dates else None
        window_rows = crows
        if latest:
            keep_from = (
                datetime.date.fromisoformat(latest) - datetime.timedelta(days=29)
            ).isoformat()
            window_rows = [r for r in crows if str(r.get("date", "")).strip() >= keep_from]
        out.append(
            {
                "channel_id": cid,
                "channel_title": next(
                    (str(r.get("channel_title") or "") for r in crows if r.get("channel_title")),
                    "",
                ),
                "subscriber_count": round(
                    max((_num(r.get("subscriber_count")) for r in crows), default=0.0)
                ),
                "views": round(sum(_num(r.get("views")) for r in window_rows)),
                "subscribers_gained": round(
                    sum(_num(r.get("subscribers_gained")) for r in window_rows)
                ),
                "watch_minutes": round(
                    sum(_num(r.get("estimated_minutes_watched")) for r in window_rows)
                ),
                "latest_available": latest,
            }
        )
    return {"accounts": out, "window_days": 30}
