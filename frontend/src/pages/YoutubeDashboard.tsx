import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Eye,
  ThumbsUp,
  MessageCircle,
  Share2,
  Users,
  UserPlus,
  UserMinus,
  Clock,
  Youtube,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import clsx from "clsx";
import type { YoutubeDashboard as Dash, YoutubePreset } from "../lib/types";
import { fetchYoutubeDashboard } from "../lib/api";
import { TrendChart, type TrendPoint } from "../components/TrendChart";
import { Dropdown } from "../components/Dropdown";

// ── Metric metadata ──────────────────────────────────────────────────────────
// Drives KPI cards, chart toggles, labels and formatting. Only metrics the
// backend reports as available are ever rendered.
type Fmt = (n: number) => string;

const compact: Fmt = (n) =>
  new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
const full: Fmt = (n) => Math.round(n).toLocaleString();
const oneDp: Fmt = (n) => n.toFixed(1);
// Watch time comes from Windsor in minutes; YouTube reports it in hours.
const hours: Fmt = (n) => {
  const h = n / 60;
  return h < 10 ? h.toFixed(1) : Math.round(h).toLocaleString();
};

interface MetricMeta {
  key: string;
  label: string;
  icon: typeof Eye;
  color: string;
  fmt: Fmt;
  chartable: boolean; // makes sense as a daily timeseries
  /** Optional micro-caption shown under the KPI value (e.g. to flag a metric
   *  that isn't scoped to the selected date range). */
  note?: string;
}

const ACCENT = "#3EFF9E"; // brand emerald, used for charts

// NOTE: `subscriber_count` is intentionally NOT here — it's the channel's
// current total (not date-range scoped), so it's shown in the header instead of
// the range-scoped KPI grid.
const METRICS: MetricMeta[] = [
  { key: "views", label: "Views", icon: Eye, color: "#3EFF9E", fmt: compact, chartable: true },
  { key: "subscribers_gained", label: "Subs gained", icon: UserPlus, color: "#B07CFF", fmt: compact, chartable: true },
  { key: "subscribers_lost", label: "Subs lost", icon: UserMinus, color: "#FF5C5C", fmt: compact, chartable: true },
  { key: "estimated_minutes_watched", label: "Watch time (hrs)", icon: Clock, color: "#FFB84D", fmt: hours, chartable: true },
  { key: "likes", label: "Likes", icon: ThumbsUp, color: "#3EFF9E", fmt: compact, chartable: true },
  { key: "comments", label: "Comments", icon: MessageCircle, color: "#5EE1FF", fmt: compact, chartable: true },
  { key: "shares", label: "Shares", icon: Share2, color: "#B07CFF", fmt: compact, chartable: true },
  { key: "engaged_views", label: "Engaged views", icon: Eye, color: "#3EFF9E", fmt: compact, chartable: true },
  { key: "average_view_duration", label: "Avg view (s)", icon: Clock, color: "#FFB84D", fmt: oneDp, chartable: false },
  { key: "average_view_percentage", label: "Avg viewed %", icon: Eye, color: "#5EE1FF", fmt: oneDp, chartable: false },
];

const PRESETS: { key: YoutubePreset; label: string }[] = [
  { key: "last_7d", label: "7 days" },
  { key: "last_30d", label: "30 days" },
  { key: "last_90d", label: "90 days" },
  { key: "this_year", label: "This year" },
  { key: "all_time", label: "All time" },
];

function fmtDay(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Whole days between two ISO dates (b - a). */
function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((db - da) / 86_400_000);
}

// ── Chart granularity ────────────────────────────────────────────────────────
type Granularity = "day" | "week" | "month";

const GRANULARITIES: { key: Granularity; label: string }[] = [
  { key: "day", label: "Day over day" },
  { key: "week", label: "Week over week" },
  { key: "month", label: "Month over month" },
];

const BUCKET_NOUN: Record<Granularity, string> = {
  day: "days",
  week: "weeks",
  month: "months",
};

// How many recent buckets the trend chart shows per granularity. The chart is
// independent of the KPI date-range selector so that "week/month over week/
// month" always renders a multi-point comparison trend, never a single dot.
const LOOKBACK: Record<Granularity, number> = {
  day: 30,
  week: 13,
  month: 18,
};

const STRIDE: Record<Granularity, number> = { day: 1, week: 7, month: 30 };

function addDays(iso: string, n: number): string {
  // Build the result from LOCAL date parts. Round-tripping through
  // toISOString() (UTC) shifts the date back a day in positive-UTC-offset
  // zones like IST, which would push every bucket label off by one.
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Compact date-range label, e.g. "24–30 Jun" or "31 May – 6 Jun". */
function rangeLabel(startISO: string, endISO: string): string {
  const s = new Date(startISO + "T00:00:00");
  const e = new Date(endISO + "T00:00:00");
  const sMon = s.toLocaleDateString(undefined, { month: "short" });
  const eMon = e.toLocaleDateString(undefined, { month: "short" });
  if (sMon === eMon) return `${s.getDate()}–${e.getDate()} ${eMon}`;
  return `${s.getDate()} ${sMon} – ${e.getDate()} ${eMon}`;
}

/** Roll the daily timeseries into buckets, summing the chosen metric. All
 *  chartable metrics are additive, so a plain sum is correct.
 *
 *  Week/Month buckets are ROLLING windows anchored to the latest available
 *  date (`latestISO`) and stepped backwards — NOT calendar weeks/months. This
 *  keeps the most recent bucket a full N-day period (e.g. the "current week" is
 *  the latest date minus 6 days), so period-over-period comparison is fair
 *  instead of pitting a full week against a 2-day stub. */
function bucketize(
  ts: Array<Record<string, number | string>>,
  key: string,
  g: Granularity,
  latestISO: string | null
): TrendPoint[] {
  if (g === "day") {
    return ts.map((row) => ({
      date: String(row.date),
      value: Number(row[key] ?? 0),
      label: dayLabel(String(row.date)),
    }));
  }

  const stride = STRIDE[g];
  const L = latestISO || (ts.length ? String(ts[ts.length - 1].date) : null);
  if (!L) return [];

  // index 0 = window [L-(stride-1) .. L], index 1 = the stride days before, …
  const sums = new Map<number, number>();
  for (const row of ts) {
    const back = daysBetween(String(row.date), L); // L - date, in days
    if (back < 0) continue;
    const idx = Math.floor(back / stride);
    sums.set(idx, (sums.get(idx) ?? 0) + Number(row[key] ?? 0));
  }

  return [...sums.entries()]
    .sort((a, b) => b[0] - a[0]) // oldest bucket first
    .map(([idx, v]) => {
      const end = addDays(L, -idx * stride);
      const start = addDays(L, -(idx * stride + stride - 1));
      return { date: start, value: v, label: rangeLabel(start, end) };
    });
}

export function YoutubeDashboard() {
  const { channelId } = useParams<{ channelId: string }>();
  const [preset, setPreset] = useState<YoutubePreset>("last_30d");
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartKey, setChartKey] = useState<string>("views");
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [chartRaw, setChartRaw] = useState<Dash | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // KPI cards + freshness follow the top date-range selector.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchYoutubeDashboard(preset, channelId)
      .then((d) => {
        if (!alive) return;
        setData(d);
        // Ensure the selected chart metric exists in this dataset.
        if (!d.metric_fields.includes(chartKey)) {
          const firstChartable = METRICS.find(
            (m) => m.chartable && d.metric_fields.includes(m.key)
          );
          if (firstChartable) setChartKey(firstChartable.key);
        }
      })
      .catch((e: unknown) =>
        alive ? setError(e instanceof Error ? e.message : "Failed to load") : null
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, reloadTick, channelId]);

  // The trend chart pulls the full history once (independent of the KPI range)
  // so any granularity can show a proper multi-period trend.
  useEffect(() => {
    let alive = true;
    fetchYoutubeDashboard("all_time", channelId)
      .then((d) => alive && setChartRaw(d))
      .catch(() => {
        /* KPI fetch already surfaces load errors */
      });
    return () => {
      alive = false;
    };
  }, [reloadTick, channelId]);

  const available = useMemo(
    () =>
      METRICS.filter((m) => data?.metric_fields.includes(m.key)).filter(
        (m) => (data?.kpis[m.key] ?? 0) !== 0 || m.key === "views"
      ),
    [data]
  );

  const chartableMetrics = useMemo(
    () => METRICS.filter((m) => m.chartable && data?.metric_fields.includes(m.key)),
    [data]
  );

  const chartMeta = METRICS.find((m) => m.key === chartKey);
  const chartPoints: TrendPoint[] = useMemo(() => {
    if (!chartRaw) return [];
    const all = bucketize(
      chartRaw.timeseries,
      chartKey,
      granularity,
      chartRaw.latest_available
    );
    return all.slice(-LOOKBACK[granularity]);
  }, [chartRaw, chartKey, granularity]);

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-10">
      {/* header */}
      <div className="flex items-center justify-between gap-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-offwhite"
        >
          <ArrowLeft className="h-4 w-4" />
          All accounts
        </Link>
        <button
          onClick={() => setReloadTick((t) => t + 1)}
          disabled={loading}
          className="btn-ghost text-xs"
          title="Refresh"
        >
          <RefreshCw className={clsx("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-neon-red/10 text-neon-red">
            <Youtube className="h-6 w-6" />
          </span>
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-muted">
              YouTube Analytics
            </div>
            <h1 className="mt-1 font-display text-3xl font-semibold leading-tight">
              {data?.account_name || "Channel dashboard"}
            </h1>
            {data && (data.kpis.subscriber_count ?? 0) > 0 && (
              <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted">
                <Users className="h-4 w-4 text-neon-cyan" />
                <span className="font-semibold text-offwhite">
                  {full(data.kpis.subscriber_count)}
                </span>
                subscribers
                <span className="text-muted/60">· all-time total</span>
              </div>
            )}
          </div>
        </div>

        {/* preset selector */}
        <div className="flex flex-wrap gap-1 rounded-full bg-card p-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={clsx(
                "rounded-full px-3.5 py-1.5 text-xs font-medium transition-all",
                preset === p.key
                  ? "bg-neon-emerald text-deepspace"
                  : "text-muted hover:text-offwhite"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {/* covered range + data-freshness caption */}
      {data && data.window?.from && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="text-offwhite/70">
            {fmtDay(data.window.from)} – {fmtDay(data.window.to)}
          </span>
          {data.latest_available && (
            <>
              <span aria-hidden>·</span>
              <span>data synced through {fmtDay(data.latest_available)}</span>
              {daysBetween(data.latest_available, data.today) > 0 && (
                <span className="rounded-full bg-neon-amber/10 px-2 py-0.5 text-[10px] text-neon-amber">
                  Windsor lags {daysBetween(data.latest_available, data.today)} day
                  {daysBetween(data.latest_available, data.today) !== 1 ? "s" : ""} behind YouTube
                </span>
              )}
            </>
          )}
        </div>
      )}

      {/* error */}
      {error && (
        <div className="mt-8 flex items-start gap-3 rounded-xl bg-neon-red/10 px-4 py-3 text-sm text-neon-red">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Couldn't load your YouTube stats</div>
            <div className="mt-0.5 text-neon-red/80">{error}</div>
          </div>
        </div>
      )}

      {/* loading skeleton */}
      {loading && !data && (
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      )}

      {/* KPI cards */}
      {data && (
        <>
          <section
            className={clsx(
              "mt-8 grid grid-cols-2 gap-4 md:grid-cols-4",
              loading && "opacity-60"
            )}
          >
            {available.map((m) => {
              const Icon = m.icon;
              return (
                <div
                  key={m.key}
                  className="rounded-2xl bg-card p-4 ring-1 ring-white/5 transition-colors hover:ring-white/10"
                >
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <Icon className="h-3.5 w-3.5" style={{ color: m.color }} />
                    {m.label}
                  </div>
                  <div
                    className="mt-2 font-display text-2xl font-semibold tabular-nums"
                    title={full(data.kpis[m.key] ?? 0)}
                  >
                    {m.fmt(data.kpis[m.key] ?? 0)}
                  </div>
                  {m.note && (
                    <div className="mt-0.5 text-[10px] text-muted/70">{m.note}</div>
                  )}
                </div>
              );
            })}
          </section>

          {/* growth chart */}
          <section className="mt-6 rounded-2xl bg-card p-5 ring-1 ring-white/5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">
                  Growth over time
                </h2>
                <p className="text-xs text-muted">
                  {chartMeta?.label} ·{" "}
                  {GRANULARITIES.find((g) => g.key === granularity)?.label} · last{" "}
                  {chartPoints.length} {BUCKET_NOUN[granularity]}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Dropdown
                  value={granularity}
                  options={GRANULARITIES}
                  onChange={setGranularity}
                />
                <div className="flex flex-wrap gap-1">
                  {chartableMetrics.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setChartKey(m.key)}
                      className={clsx(
                        "rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                        chartKey === m.key
                          ? "bg-elevated text-offwhite ring-1 ring-white/15"
                          : "text-muted hover:text-offwhite"
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5">
              {chartRaw ? (
                <TrendChart
                  points={chartPoints}
                  color={chartMeta?.color ?? ACCENT}
                  format={chartMeta?.fmt ?? compact}
                />
              ) : (
                <div className="h-[220px] animate-pulse rounded-xl bg-surface/50" />
              )}
            </div>
          </section>

          {data.row_count === 0 && !error && (
            <p className="mt-6 text-center text-sm text-muted">
              Windsor returned no rows for this range. Try a wider range, or check
              that your YouTube connection in Windsor has finished its first sync.
            </p>
          )}
        </>
      )}
    </div>
  );
}
