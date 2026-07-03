"""Owner-assignment API for the hub.

Accounts are discovered dynamically from Windsor (via /api/youtube/accounts and
/api/instagram/accounts); this route only stores/serves which owner each
discovered account belongs to. The frontend joins the two.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import assignments

router = APIRouter(prefix="/api/social", tags=["social"])


class AssignBody(BaseModel):
    platform: str
    ref: str  # channel_id (YouTube) / account_id (Instagram)
    owner: str  # empty string = unassign


@router.get("/assignments")
async def get_assignments() -> dict[str, Any]:
    return {"assignments": await assignments.load(), "platforms": list(assignments.PLATFORMS)}


@router.post("/assignments")
async def set_assignment(body: AssignBody) -> dict[str, Any]:
    try:
        data = await assignments.set_owner(body.platform, body.ref, body.owner)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"assignments": data, "platforms": list(assignments.PLATFORMS)}
