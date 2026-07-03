"""Owner-assignment store.

Maps a Windsor-discovered account (channel_id / account_id) to an owner name.
Accounts themselves are discovered dynamically from Windsor; this store only
records the human-knowledge part: which owner/brand each account belongs to.

Persistence is environment-aware:
  • Production (Vercel, read-only filesystem) → Upstash Redis / Vercel KV over
    REST (env vars KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN).
  • Local dev → a JSON file (backend/assignments.json, gitignored).

Shape: {"youtube": {channel_id: owner}, "instagram": {account_id: owner}}.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import httpx

_KV_URL = os.getenv("KV_REST_API_URL") or os.getenv("UPSTASH_REDIS_REST_URL")
_KV_TOKEN = os.getenv("KV_REST_API_TOKEN") or os.getenv("UPSTASH_REDIS_REST_TOKEN")
_KEY = "owner_assignments"
_LOCAL = Path(__file__).resolve().parents[1] / "assignments.json"

PLATFORMS = ("youtube", "instagram")

# Seed so the accounts already onboarded stay grouped on first run. New accounts
# discovered from Windsor start out unassigned.
SEED: dict[str, dict[str, str]] = {
    "youtube": {
        "UCkZyATqruBa-0XFO3tksGgw": "Aditya Kachave",
        "UCK_6a8U242tel2f8yL9pauQ": "Be10x",
    },
    "instagram": {
        "17841458560249205": "Aditya Kachave",
    },
}


def _empty() -> dict[str, dict[str, str]]:
    return {p: {} for p in PLATFORMS}


def _normalize(data: Any) -> dict[str, dict[str, str]]:
    out = _empty()
    if isinstance(data, dict):
        for p in PLATFORMS:
            v = data.get(p)
            if isinstance(v, dict):
                out[p] = {str(k): str(val) for k, val in v.items() if val}
    return out


async def _kv_command(cmd: list[Any]) -> Any:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(
            str(_KV_URL),
            headers={"Authorization": f"Bearer {_KV_TOKEN}"},
            json=cmd,
        )
    r.raise_for_status()
    return r.json().get("result")


async def load() -> dict[str, dict[str, str]]:
    """Return the current assignment map, seeding on first use."""
    if _KV_URL and _KV_TOKEN:
        raw = await _kv_command(["GET", _KEY])
        if raw is None:
            await _kv_command(["SET", _KEY, json.dumps(SEED)])
            return _normalize(SEED)
        try:
            return _normalize(json.loads(raw))
        except (TypeError, ValueError):
            return _empty()

    # Local file fallback. On a read-only filesystem (e.g. Vercel without KV)
    # writes fail — we still serve the seed in-memory rather than crash.
    if _LOCAL.exists():
        try:
            return _normalize(json.loads(_LOCAL.read_text()))
        except (OSError, ValueError):
            return _normalize(SEED)
    try:
        _LOCAL.write_text(json.dumps(SEED, indent=2))
    except OSError:
        pass
    return _normalize(SEED)


async def _save(data: dict[str, dict[str, str]]) -> None:
    if _KV_URL and _KV_TOKEN:
        await _kv_command(["SET", _KEY, json.dumps(data)])
        return
    try:
        _LOCAL.write_text(json.dumps(data, indent=2))
    except OSError:
        # Read-only filesystem without a KV store configured — the change can't
        # persist. (Add Vercel KV / Upstash Redis env vars to enable saving.)
        pass


async def set_owner(platform: str, ref: str, owner: str) -> dict[str, dict[str, str]]:
    """Assign `ref` (channel_id/account_id) to `owner`. An empty owner unassigns."""
    if platform not in PLATFORMS:
        raise ValueError(f"Unknown platform: {platform}")
    data = await load()
    owner = owner.strip()
    if owner:
        data[platform][ref] = owner
    else:
        data[platform].pop(ref, None)
    await _save(data)
    return data
