"""Runtime configuration. Loads from the repo-root .env."""

import os
from pathlib import Path

from dotenv import load_dotenv

# .env lives at the repo root (one level above backend/)
REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")

# Windsor.ai connector API key — the only secret this app needs.
# Grab it from app.windsor.ai (the `api_key=...` value in your API URL).
WINDSOR_API_KEY = os.getenv("WINDSOR_API_KEY")
