import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Instagram, AlertTriangle, ArrowUpRight, ArrowDownRight } from "lucide-react";
import clsx from "clsx";
import type { InstagramDashboard as Dash, InstagramPeriod } from "../lib/types";
import { fetchInstagramDashboard } from "../lib/api";
import { TrendChart, type TrendPoint } from "../components/TrendChart";
import { pctChange, rangeLabel } from "../lib/timeseries";

type Granularity = "week" | "month";

const compact = (n: number) =>
  new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);

interface MetricMeta {
  key: string;
  label: string;
  color: string;
}
const METRICS: MetricMeta[] = [
  { key: "views", label: "Views", color: "#5EE1FF" },
  { key: "reach", label: "Reach", color: "#3EFF9E" },
  { key: "saves", label: "Saves", color: "#B07CFF" },
  { key: "shares", label: "Shares", color: "#FFB84D" },
];

const GRAN: { key: Granularity; label: string }[] = [
  { key: "week", label: "Week over week" },
  { key: "month", label: "Month over month" },
];

function Delta({ curr, prev }: { curr: number; prev: number | undefined }) {
  const p = prev === undefined ? null : pctChange(curr, prev);
  if (p === null) return <span className="text-muted">—</span>;
  const up = p >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-0.5 font-medium",
        up ? "text-neon-emerald" : "text-neon-red"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(p).toFixed(0)}%
    </span>
  );
}

export function InstagramDashboard() {
  const { accountId } = useParams<{ accountId: string }>();
  const [data, setData] = useState<Dash | null>(null);
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [chartMetric, setChartMetric] = useState<string>("views");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    fetchInstagramDashboard(accountId, granularity)
      .then((d) => alive && setData(d))
      .catch((e: unknown) =>
        alive ? setError(e instanceof Error ? e.message : "Failed to load") : null
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [accountId, granularity]);

  const mval = (p: InstagramPeriod | undefined, key: string): number =>
    p ? Number((p as unknown as Record<string, number | null>)[key] ?? 0) : 0;

  const periods = data?.periods ?? [];
  const current = periods[periods.length - 1];
  const previous = periods[periods.length - 2];
  const periodWord = granularity === "week" ? "week" : "month";

  const chartMeta = METRICS.find((m) => m.key === chartMetric);
  const chartPoints: TrendPoint[] = periods.map((p) => ({
    date: p.start,
    value: mval(p, chartMetric),
    label: rangeLabel(p.start, p.end),
  }));

  // recent-first rows for the comparison table, each with its own prior period
  const tableRows = periods
    .map((p, i) => ({ p, prev: periods[i - 1] }))
    .reverse();

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-10">
      <div className="flex items-center justify-between gap-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-offwhite"
        >
          <ArrowLeft className="h-4 w-4" />
          All accounts
        </Link>
      </div>

      <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-neon-violet/10 text-neon-violet">
            <Instagram className="h-6 w-6" />
          </span>
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-muted">
              Instagram · Views &amp; Reach
            </div>
            <h1 className="mt-1 font-display text-3xl font-semibold leading-tight">
              {data?.username ? `@${data.username}` : "Instagram account"}
            </h1>
          </div>
        </div>

        <div className="flex gap-1 rounded-full bg-card p-1">
          {GRAN.map((g) => (
            <button
              key={g.key}
              onClick={() => setGranularity(g.key)}
              className={clsx(
                "rounded-full px-4 py-1.5 text-xs font-medium transition-all",
                granularity === g.key
                  ? "bg-neon-violet text-deepspace"
                  : "text-muted hover:text-offwhite"
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="mt-8 flex items-start gap-3 rounded-xl bg-neon-red/10 px-4 py-3 text-sm text-neon-red">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Couldn't load Instagram stats</div>
            <div className="mt-0.5 text-neon-red/80">{error}</div>
          </div>
        </div>
      )}

      {loading && !data && (
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      )}

      {data && current && (
        <>
          {/* this-period vs last-period highlight cards */}
          <section className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            {METRICS.map((m) => (
              <div key={m.key} className="rounded-2xl bg-card p-4 ring-1 ring-white/5">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
                  {m.label} · this {periodWord}
                </div>
                <div className="mt-2 font-display text-2xl font-semibold tabular-nums">
                  {compact(mval(current, m.key))}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                  <Delta
                    curr={mval(current, m.key)}
                    prev={previous ? mval(previous, m.key) : undefined}
                  />
                  vs last {periodWord}
                </div>
              </div>
            ))}
          </section>

          {/* trend chart */}
          <section className="mt-6 rounded-2xl bg-card p-5 ring-1 ring-white/5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">
                  {chartMeta?.label} per {periodWord}
                </h2>
                <p className="text-xs text-muted">
                  {GRAN.find((g) => g.key === granularity)?.label} · last{" "}
                  {periods.length} {periodWord}s
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                {METRICS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setChartMetric(m.key)}
                    className={clsx(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                      chartMetric === m.key
                        ? "bg-elevated text-offwhite ring-1 ring-white/15"
                        : "text-muted hover:text-offwhite"
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5">
              <TrendChart points={chartPoints} color={chartMeta?.color ?? "#5EE1FF"} format={compact} />
            </div>
          </section>

          {/* period-by-period comparison table */}
          <section className="mt-6 overflow-x-auto rounded-2xl bg-card p-5 ring-1 ring-white/5">
            <h2 className="mb-4 font-display text-lg font-semibold">
              {periodWord === "week" ? "Weekly" : "Monthly"} comparison
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="py-2 pr-4 font-semibold">Period</th>
                  {METRICS.map((m) => (
                    <th key={m.key} className="py-2 pr-4 text-right font-semibold">
                      {m.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {tableRows.map(({ p, prev }, i) => (
                  <tr key={p.start} className="transition-colors hover:bg-white/[0.03]">
                    <td className="whitespace-nowrap py-2.5 pr-4 text-offwhite/90">
                      {rangeLabel(p.start, p.end)}
                      {i === 0 && (
                        <span className="ml-2 rounded-full bg-neon-violet/15 px-1.5 py-0.5 text-[10px] text-neon-violet">
                          this {periodWord}
                        </span>
                      )}
                    </td>
                    {METRICS.map((m) => (
                      <td key={m.key} className="py-2.5 pr-4 text-right tabular-nums">
                        <div className="text-offwhite/90">{compact(mval(p, m.key))}</div>
                        <div className="text-[11px]">
                          <Delta
                            curr={mval(p, m.key)}
                            prev={prev ? mval(prev, m.key) : undefined}
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
