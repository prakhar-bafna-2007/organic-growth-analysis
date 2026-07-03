# Social Analytics Dashboard — Onboarding & Architecture Playbook

This is the templatized process for the cross-platform (YouTube + Instagram)
analytics dashboard. **Onboarding a new account is a one-file config change** —
every new channel/account renders in the exact same format as the existing
ones. This doc is the runbook + the hard-won Windsor gotchas that make it work.

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

**The single source of truth for "who owns what" is
[`backend/app/social_config.py`](../backend/app/social_config.py).** Windsor has
no concept of an "owner" — it just exposes connected accounts — so this file is
where we group accounts under a person/brand. Everything else (cards, stats,
drill-in) is generated from it.

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

### Step B — Find the account's Windsor identifier
Run this (replace the key if it rotated — it lives in repo-root `.env` as
`WINDSOR_API_KEY`):

```bash
# YouTube — list connected channels + their channel_id
curl -s "https://connectors.windsor.ai/youtube?api_key=$WINDSOR_API_KEY&date_from=2026-06-01&date_to=2026-06-30&fields=channel_id,channel_title&_renderer=json"

# Instagram — list connected accounts + their account_id
curl -s "https://connectors.windsor.ai/instagram?api_key=$WINDSOR_API_KEY&date_from=2026-06-03&date_to=2026-06-30&fields=account_id,username&_renderer=json"
```

- YouTube identifier = **`channel_id`** (looks like `UCkZyATqruBa-0XFO3tksGgw`).
- Instagram identifier = **`account_id`** (17-digit, e.g. `17841458560249205`).

### Step C — Add it to `social_config.py`
Edit the `OWNERS` list. Put the account under the right owner (add a new owner
dict if needed). Set the identifier — that's what flips `connected` to true:

```python
# YouTube account
{"id": "yt-<slug>", "label": "Channel Name", "channel_id": "UC..."}

# Instagram account
{"id": "ig-<slug>", "label": "@username", "account_id": "17841..."}
```

A placeholder (not yet connected) card is just the same entry with the
identifier set to `None`.

### Step D — Restart the API (dev: it auto-reloads)
Done. The new card appears on the hub with live stats and drills into a full
dashboard in the standard format. **No frontend changes, no new routes.**

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
| [`social_config.py`](../backend/app/social_config.py) | Owner → account map (the file you edit to onboard) |
| [`routes/social.py`](../backend/app/routes/social.py) | `GET /api/social/config` |
| [`routes/windsor.py`](../backend/app/routes/windsor.py) | YouTube: `/api/youtube/accounts`, `/api/youtube/dashboard?channel_id=` |
| [`routes/instagram.py`](../backend/app/routes/instagram.py) | Instagram: `/api/instagram/accounts`, `/api/instagram/dashboard?account_id=&granularity=` |
| [`windsor_client.py`](../backend/app/windsor_client.py) | Shared Windsor fetch + license-retry |

**Adding a whole new platform** (e.g. TikTok/LinkedIn) is the only non-trivial
case: mirror `instagram.py` (its own connector + field set + aggregation
rules), add a platform tab + detail page, and add it to the config's platform
list. Adding *accounts* to existing platforms is just §2.
