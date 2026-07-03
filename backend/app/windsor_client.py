"""Shared Windsor.ai connector client.

A thin generic fetch used by the platform routes (Instagram today; YouTube has
its own copy with field-fallback logic). Centralises the two Windsor quirks:
JSON-with-an-`error`-key responses, and the intermittent "license expired"
sentinel that appears during plan transitions (retried transparently).
"""

from __future__ import annotations

import asyncio
import datetime
import logging
from typing import Any

import httpx
from fastapi import HTTPException

from . import config

log = logging.getLogger(__name__)

BASE_URL = "https://connectors.windsor.ai"
_LICENSE_RETRIES = 4
_LICENSE_RETRY_DELAY = 0.6  # seconds


def license_expired(rows: list[dict[str, Any]]) -> bool:
    """Windsor signals an expired/inactive license by returning a single
    sentinel row (HTTP 200, no `error` key) with a "License expired" message in
    the text fields and zeros elsewhere."""
    if not rows:
        return False
    blob = " ".join(str(v) for v in rows[0].values()).lower()
    return "license expired" in blob or "windsor.ai/pricing" in blob


async def fetch_rows(
    connector: str,
    fields: list[str],
    date_from: datetime.date,
    date_to: datetime.date,
) -> list[dict[str, Any]]:
    """GET one connector for an explicit date range and return its `data` rows.

    Raises HTTPException with a user-readable message on failure (including a
    402 when every attempt hits the license sentinel).
    """
    if not config.WINDSOR_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="WINDSOR_API_KEY is not set. Add it to the repo-root .env file.",
        )

    params = {
        "api_key": config.WINDSOR_API_KEY,
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "fields": ",".join(fields),
        "_renderer": "json",
    }
    url = f"{BASE_URL}/{connector}"

    async with httpx.AsyncClient(timeout=40) as client:
        for attempt in range(_LICENSE_RETRIES):
            resp = await client.get(url, params=params)
            try:
                body = resp.json()
            except ValueError:
                raise HTTPException(
                    status_code=502,
                    detail=f"Windsor returned a non-JSON response ({resp.status_code}).",
                )

            if isinstance(body, dict) and body.get("error"):
                # Field/metric-level errors (e.g. Instagram's 30-day metric
                # limits) are the caller's to interpret — surface the message.
                raise HTTPException(status_code=422, detail=str(body["error"]))
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=502, detail=f"Windsor HTTP {resp.status_code}"
                )

            data = (body.get("data") if isinstance(body, dict) else body) or []
            if not license_expired(data):
                return data

            log.warning(
                "Windsor %s returned license-expired sentinel (attempt %d/%d)",
                connector,
                attempt + 1,
                _LICENSE_RETRIES,
            )
            if attempt < _LICENSE_RETRIES - 1:
                await asyncio.sleep(_LICENSE_RETRY_DELAY)

    raise HTTPException(
        status_code=402,
        detail=(
            "Windsor.ai returned no data (license/trial inactive). If you just "
            "upgraded, give it a minute and refresh. Otherwise renew at "
            "https://windsor.ai/pricing."
        ),
    )
