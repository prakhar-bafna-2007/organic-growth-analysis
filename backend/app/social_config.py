"""Owner → platform → account map for the cross-platform dashboard.

Windsor has no concept of an "owner" — it just exposes whatever accounts are
connected under the API key. This file is where you group those accounts under
a person/brand and give each a friendly label.

To wire up a real account:
  • YouTube  — set `channel_id` to the channel's UC… id (visible on the live
    channel and returned by Windsor as `channel_id`). Leave it None for a
    placeholder card that shows "not connected yet".
  • Instagram — set `account_id` once you connect an Instagram account in
    Windsor. All Instagram accounts are placeholders until the connector is live.

Everything here is public metadata (labels, channel ids) — no secrets.
"""

from __future__ import annotations

from typing import Any

OWNERS: list[dict[str, Any]] = [
    {
        "id": "aditya-kachave",
        "name": "Aditya Kachave",
        "accounts": {
            "youtube": [
                {
                    "id": "yt-aditya-kachave",
                    "label": "Aditya Kachave",
                    "channel_id": "UCkZyATqruBa-0XFO3tksGgw",
                },
                {"id": "yt-build-with-aditya", "label": "Build with Aditya", "channel_id": None},
                {"id": "yt-think-with-kachave", "label": "Think with Kachave", "channel_id": None},
            ],
            "instagram": [
                {
                    "id": "ig-aditya-kachave",
                    "label": "@theadityakachave",
                    "account_id": "17841458560249205",
                },
            ],
        },
    },
    {
        "id": "aditya-goenka",
        "name": "Aditya Goenka",
        "accounts": {
            "youtube": [
                {"id": "yt-aditya-goenka", "label": "Aditya Goenka", "channel_id": None},
            ],
            "instagram": [
                {"id": "ig-aditya-goenka", "label": "@aditya.goenka", "account_id": None},
            ],
        },
    },
    {
        "id": "be10x",
        "name": "Be10x",
        "accounts": {
            "youtube": [
                {
                    "id": "yt-be10x-labs",
                    "label": "Be10x Labs",
                    "channel_id": "UCK_6a8U242tel2f8yL9pauQ",
                },
            ],
            "instagram": [
                {"id": "ig-be10x", "label": "@be10x", "account_id": None},
            ],
        },
    },
]

PLATFORMS = ["youtube", "instagram"]


def public_config() -> dict[str, Any]:
    """Owner/account structure for the frontend, with a `connected` flag derived
    from whether the account has a live Windsor identifier yet."""
    owners = []
    for owner in OWNERS:
        accounts = {}
        for platform, items in owner["accounts"].items():
            id_key = "channel_id" if platform == "youtube" else "account_id"
            accounts[platform] = [
                {
                    "id": a["id"],
                    "label": a["label"],
                    "ref": a.get(id_key),
                    "connected": bool(a.get(id_key)),
                }
                for a in items
            ]
        owners.append({"id": owner["id"], "name": owner["name"], "accounts": accounts})
    return {"owners": owners, "platforms": PLATFORMS}


def channel_id_for(account_id: str) -> str | None:
    """Resolve a config account id (e.g. 'yt-aditya-kachave') to its Windsor
    channel_id, or None if it's a placeholder / unknown."""
    for owner in OWNERS:
        for a in owner["accounts"].get("youtube", []):
            if a["id"] == account_id:
                return a.get("channel_id")
    return None


def instagram_account_id_for(config_id: str) -> str | None:
    """Resolve a config account id (e.g. 'ig-aditya-kachave') to its Windsor
    Instagram account_id, or None if it's a placeholder / unknown."""
    for owner in OWNERS:
        for a in owner["accounts"].get("instagram", []):
            if a["id"] == config_id:
                return a.get("account_id")
    return None
