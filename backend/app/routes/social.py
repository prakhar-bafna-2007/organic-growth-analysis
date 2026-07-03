"""Cross-platform hub config — the Owner → Platform → account map.

Serves the static grouping from social_config.py. Live per-account stats come
from the platform routes (e.g. /api/youtube/accounts); the frontend merges the
two by channel_id.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from .. import social_config

router = APIRouter(prefix="/api/social", tags=["social"])


@router.get("/config")
async def config() -> dict[str, Any]:
    return social_config.public_config()
