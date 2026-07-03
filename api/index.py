"""Vercel serverless entry point.

Vercel's Python runtime serves the ASGI ``app`` exposed here. `vercel.json`
rewrites route every ``/api/*`` request to this function; the Vite frontend is
served as static files from ``frontend/dist``. The FastAPI app's own static-SPA
block stays inert here (no ``frontend/dist`` inside the function bundle).
"""

import sys
from pathlib import Path

# Make the backend package (`app`) importable from within the function bundle.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.main import app  # noqa: E402  (re-exported as the ASGI app for Vercel)

__all__ = ["app"]
