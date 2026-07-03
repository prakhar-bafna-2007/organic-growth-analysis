// Shared time-bucketing helpers for period-over-period comparisons.
// Weeks/months are ROLLING windows anchored to the latest available date and
// stepped backwards, so the most recent period is always a full N days (no
// partial "this week" stub) — matching how the YouTube trend chart buckets.

export type Granularity = "week" | "month";

export const STRIDE: Record<Granularity, number> = { week: 7, month: 30 };

export interface Period {
  start: string; // ISO date of the window start
  end: string; // ISO date of the window end
  label: string; // e.g. "24–30 Jun"
  values: Record<string, number>; // metric -> total in the window
}

/** Whole days between two ISO dates (b - a). */
export function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((db - da) / 86_400_000);
}

/** Add days using LOCAL date parts (avoids the UTC round-trip off-by-one in
 *  positive-offset zones like IST). */
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Compact date-range label, e.g. "24–30 Jun" or "31 May – 6 Jun". */
export function rangeLabel(startISO: string, endISO: string): string {
  const s = new Date(startISO + "T00:00:00");
  const e = new Date(endISO + "T00:00:00");
  const sMon = s.toLocaleDateString(undefined, { month: "short" });
  const eMon = e.toLocaleDateString(undefined, { month: "short" });
  if (sMon === eMon) return `${s.getDate()}–${e.getDate()} ${eMon}`;
  return `${s.getDate()} ${sMon} – ${e.getDate()} ${eMon}`;
}

/** Roll a daily series into rolling week/month periods (oldest → newest),
 *  summing each metric within the window. */
export function bucketPeriods(
  ts: Array<Record<string, number | string>>,
  metrics: string[],
  granularity: Granularity,
  latestISO: string | null
): Period[] {
  const L = latestISO || (ts.length ? String(ts[ts.length - 1].date) : null);
  if (!L) return [];
  const stride = STRIDE[granularity];

  const buckets = new Map<number, Record<string, number>>();
  for (const row of ts) {
    const back = daysBetween(String(row.date), L);
    if (back < 0) continue;
    const idx = Math.floor(back / stride);
    const acc = buckets.get(idx) ?? Object.fromEntries(metrics.map((m) => [m, 0]));
    for (const m of metrics) acc[m] += Number(row[m] ?? 0);
    buckets.set(idx, acc);
  }

  return [...buckets.entries()]
    .sort((a, b) => b[0] - a[0]) // oldest first
    .map(([idx, values]) => {
      const end = addDays(L, -idx * stride);
      const start = addDays(L, -(idx * stride + stride - 1));
      return { start, end, label: rangeLabel(start, end), values };
    });
}

/** Percentage change from `prev` to `curr`; null when there's no baseline. */
export function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / prev) * 100;
}
