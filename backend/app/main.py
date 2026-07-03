"""FastAPI entrypoint for the Social Analytics Dashboard.

Run from the `backend/` directory:

    uvicorn app.main:app --reload --port 8010

In production the Vite build at `frontend/dist/` is served from `/` so one
process serves both the SPA and the API.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import REPO_ROOT, WINDSOR_API_KEY
from .routes import instagram, social, windsor

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Social Analytics Dashboard", version="1.0.0")

# Dev origin: Vite runs on 5174 for this app. In prod the SPA is same-origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup() -> None:
    if not WINDSOR_API_KEY:
        logging.warning(
            "WINDSOR_API_KEY is not set — dashboard endpoints return 503 until "
            "it's added to the repo-root .env file."
        )


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(windsor.router)
app.include_router(social.router)
app.include_router(instagram.router)


# ── Static SPA ───────────────────────────────────────────────────────────────
_DIST = REPO_ROOT / "frontend" / "dist"

if _DIST.is_dir():
    _ASSETS = _DIST / "assets"
    if _ASSETS.is_dir():
        app.mount("/assets", StaticFiles(directory=_ASSETS), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str) -> FileResponse:
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404)
        candidate = (_DIST / full_path).resolve()
        try:
            candidate.relative_to(_DIST.resolve())
        except ValueError:
            raise HTTPException(status_code=404) from None
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_DIST / "index.html")
