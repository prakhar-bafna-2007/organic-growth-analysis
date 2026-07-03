# Social Analytics Dashboard

A standalone cross-platform analytics dashboard for **YouTube** and **Instagram**,
powered by [Windsor.ai](https://windsor.ai). Pick an owner/brand, a platform, see
a flashcard per connected account, and drill into a full dashboard for each.

- **YouTube** — subscribers, views, watch time, engagement KPIs, and a day/week/
  month trend chart with date presets.
- **Instagram** — views, reach, shares and saves as **week-over-week /
  month-over-month** comparisons (reach is correctly deduplicated).

## Stack
- **Backend:** FastAPI proxy over the Windsor connector API (keeps the API key
  server-side). Routes: `/api/social/config`, `/api/youtube/*`, `/api/instagram/*`.
- **Frontend:** React + Vite + Tailwind.

## Setup
```bash
# 1. Backend deps (Python 3.10+)
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt

# 2. Frontend deps
npm run install:frontend        # or: cd frontend && npm install

# 3. Windsor API key
cp .env.example .env            # then paste your key into WINDSOR_API_KEY

# 4. Run both (API :8010, web :5174)
npm install                     # root, for `concurrently`
npm run dev
```
Open http://localhost:5174.

## Onboarding a new account
Everything is driven by **`backend/app/social_config.py`** — connect the account
in Windsor, grab its `channel_id` (YouTube) / `account_id` (Instagram), and add
an entry under the right owner. See [`docs/DASHBOARD_ONBOARDING.md`](docs/DASHBOARD_ONBOARDING.md).
