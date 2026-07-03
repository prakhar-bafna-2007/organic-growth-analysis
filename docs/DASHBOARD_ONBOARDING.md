# Social Analytics Dashboard — Onboarding & Architecture Playbook

This is the templatized process for the cross-platform (YouTube + Instagram)
analytics dashboard. **Accounts are discovered automatically from Windsor** —
connect an account there, refresh the app, and it appears (initially under
"Unassigned"); one click assigns it to an owner. No code changes, no redeploys.
This doc is the runbook + the hard-won Windsor gotchas that make it work.

---

## 1. How the dashboard is structured

```
Owner   (Aditya Kachave · Aditya Goenka · Be10x …)      ← dropdown
  └─ Platform   (YouTube | Instagram)                    ← tabs
       └─ Account flashcards (one per connected account) ← hub grid
            └─ click → the detailed dashboard for that account
```

- **Hub** — `/` ([frontend/src/pages/Dashboard.tsx](../frontend/src/pages/Dashboard.tsx))
- **YouTube detail** — `/youtube/:channelId` ([YoutubeDashboard.tsx](../frontend/src/pages/YoutubeDashboard.tsx))
- **Instagram detail** — `/instagram/:accountId` ([InstagramDashboard.tsx](../frontend/src/pages/InstagramDashboard.tsx))

**Accounts are discovered dynamically** — the hub lists whatever the Windsor
connectors return (`/api/youtube/accounts`, `/api/instagram/accounts`). Windsor
has no concept of an "owner", so the only stored bit is a small
**account → owner** map ([`backend/app/assignments.py`](../backend/app/assignments.py)),
persisted in Vercel KV / Upstash Redis in prod (a local JSON file in dev). A
newly discovered account with no assignment shows under **"Unassigned"** until
someone picks an owner from the card's dropdown.

---

## 2. Onboarding a NEW account (the templatized steps)

### Step A — Connect it in Windsor (windsor.ai)
1. Add the data source (**YouTube** or **Instagram Insights** connector).
   - Instagram requires a **Business/Creator** account linked to a **Facebook
     Page**, with all permissions granted.
2. **CRITICAL: select EVERY account you want in the connector.** The Windsor
   `/youtube` endpoint only returns the accounts *ticked* in its UI. If only one
   is selected, the API returns just that one (and silently ignores a
   `channel_id` filter). After connecting, confirm "N accounts selected".
3. Make sure the Windsor plan is active (a lapsed trial returns a "license
   expired" sentinel — see §4).

### Step B — Refresh the dashboard, then assign the owner
That's it — no code. The new account **auto-appears** on the hub under
**Unassigned** (an amber banner flags it). Open its card's **owner dropdown** and
either pick an existing owner or type a new one. Done — it's grouped, remembered,
and renders in the standard format. Reassigning/unassigning is the same dropdown.

> The account's `channel_id`/`account_id` and display name all come from Windsor
> automatically; nothing to look up or paste. (If you ever need the raw id, e.g.
> for the seed map, `GET /api/youtube/accounts` or `/api/instagram/accounts`
> returns them.)

### Prod persistence — one-time setup
Owner assignments persist in **Vercel KV / Upstash Redis** because Vercel's
filesystem is read-only. Create a store in the Vercel dashboard (Storage → create
Upstash Redis → connect to the project); it auto-injects `KV_REST_API_URL` /
`KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` / `_TOKEN`), which
[`assignments.py`](../backend/app/assignments.py) reads. Without it the app still
runs, but shows the seeded grouping read-only (assignments won't save in prod).
The seed lives in `assignments.py` (`SEED`).

---

## 3. What each dashboard shows (the fixed format)

### YouTube (`YoutubeDashboard.tsx`)
- **Header:** channel name + **Total subscribers** (all-time snapshot, not
  date-scoped).
- **KPI cards** (scoped to the date-range selector): Views, Subs gained, Subs
  lost, Watch time (hrs), Likes, Comments, Shares, Engaged views, Avg view (s),
  Avg viewed %.
- **Date presets:** 7 / 30 / 90 days · This year · All time.
- **Trend chart:** granularity dropdown (Day / Week / Month over month),
  independent of the KPI range, always a multi-period trend; x-axis shows dated
  ticks; a "data synced through …" freshness note (YouTube lags ~2–3 days).

### Instagram (`InstagramDashboard.tsx`) — the meetup format
- Focused on **Views, Reach, Saves, Shares** only.
- **Week-over-week / Month-over-month** toggle.
- This-period vs last-period **comparison cards** (with ▲/▼ % delta), a **trend
  chart** (metric toggle), and a **period comparison table** (each recent
  week/month with totals + deltas).

---

## 4. Windsor gotchas that the code depends on (don't relearn these)

**Auth:** `WINDSOR_API_KEY` in repo-root `.env` (gitignored). An upgrade can
rotate the key — if data stops, re-check the key in the Windsor dashboard.

**Multi-account:** one key returns ALL *selected* accounts, tagged by
`channel_id` (YT) / `account_id` (IG); we filter server-side. Select every
account in the Windsor UI.

**License / trial expiry:** a lapsed plan returns HTTP 200 with a single
sentinel row — text fields say *"Uh-oh! License expired. Buy here:
windsor.ai/pricing"*, metrics 0. The backend detects this and, because it also
appears intermittently during plan upgrades, **retries** before surfacing a 402
("license inactive"). The hub shows an amber notice. Renewing fixes it with no
code change. (See [windsor_client.py](../backend/app/windsor_client.py).)

**Date handling:**
- Windsor's fuzzy `date_preset` values are unreliable (`maximum`/`all_time`
  don't exist; presets anchor to "today" and, with data lag, produce short,
  day-late windows). We use explicit `date_from`/`date_to` and anchor windows to
  the **latest day that actually has data**.
- YouTube data lags ~2–3 days. Instagram returns **today** but it's partial, so
  the IG backend **excludes today** for fair complete-period comparisons.

**YouTube fields** (verified): `date, account_name, channel_id, channel_title,
views, likes, comments, shares, dislikes, estimated_minutes_watched,
average_view_duration, average_view_percentage, subscribers_gained,
subscribers_lost, subscriber_count, engaged_views, red_views`.
- Total subscribers = **`subscriber_count`** (NOT `subscribers`); it's a current
  snapshot repeated on every row → take latest, never sum.
- Watch time is in **minutes** (`estimated_minutes_watched`) → convert to hours.
- Wrong field names 400 with "Unexpected field(s): {…}" listing every bad one —
  handy for discovery: throw a big candidate list, subtract the rejected set.

**Instagram fields** (verified): `date, account_name, account_id, username,
views, reach, likes, comments, saves, shares, total_interactions,
accounts_engaged, follower_count, followers_count`.
- **`views`** exists and is populated (unified metric). `impressions` /
  `profile_views` come back null — don't use them.
- **Reach is UNIQUE accounts — NEVER sum daily reach** (double-counts). Windsor
  returns the correct deduplicated period reach when you query `reach` *without*
  the `date` field (e.g. 30-day reach = 57,258, matching Instagram; summing
  daily gives ~74.7k, wrong). The IG backend fetches dedup reach **per period**.
  Views/saves/shares ARE additive (summed daily views = exact match, 121,782).
  Caveat: `reach,views` together with no date returns reach=null — query reach
  alone.
- **Total followers** = `followers_count` (snapshot, query alone). **New
  followers** = `follower_count` (daily), but Instagram caps this metric to the
  **last 30 days**. (Both currently omitted from the IG dashboard per user's
  "views & reach only" scope.)

**Metric aggregation rule of thumb:** counts (views, likes, comments, shares,
saves, watch time, subs gained) are **additive → sum**. Unique-audience metrics
(reach, accounts_engaged) must be fetched as a **deduplicated period value**.
Snapshots (subscriber_count, followers_count) → take the latest, never sum.

---

## 5. Backend map

| File | Role |
|------|------|
| [`assignments.py`](../backend/app/assignments.py) | account → owner map + persistence (KV in prod, file in dev); `SEED` |
| [`routes/social.py`](../backend/app/routes/social.py) | GET/POST `/api/social/assignments` |
| [`routes/social.py`](../backend/app/routes/social.py) | `GET /api/social/config` |
| [`routes/windsor.py`](../backend/app/routes/windsor.py) | YouTube: `/api/youtube/accounts`, `/api/youtube/dashboard?channel_id=` |
| [`routes/instagram.py`](../backend/app/routes/instagram.py) | Instagram: `/api/instagram/accounts`, `/api/instagram/dashboard?account_id=&granularity=` |
| [`windsor_client.py`](../backend/app/windsor_client.py) | Shared Windsor fetch + license-retry |

**Adding a whole new platform** (e.g. TikTok/LinkedIn) is the only non-trivial
case: mirror `instagram.py` (its own connector + field set + aggregation
rules), add a platform tab + detail page, and add it to the config's platform
list. Adding *accounts* to existing platforms is just §2.
