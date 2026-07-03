import { useId, useMemo, useRef, useState } from "react";

export interface TrendPoint {
  date: string;
  value: number;
  /** Optional pre-formatted axis/tooltip label (e.g. "Wk Jun 23", "Jun 2026").
   *  Falls back to a day format derived from `date` when omitted. */
  label?: string;
}

interface Props {
  points: TrendPoint[];
  /** Hex accent for the line + area gradient. */
  color: string;
  /** Formatter for the tooltip / axis values. */
  format?: (n: number) => string;
  height?: number;
}

const W = 720; // viewBox width; scales responsively via width:100%
const PAD = { top: 16, right: 16, bottom: 26, left: 16 };

function niceDate(iso: string): string {
  // "2026-06-30" -> "Jun 30"
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TrendChart({
  points,
  color,
  format = (n) => n.toLocaleString(),
  height = 220,
}: Props) {
  const gradId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const H = height;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const { path, area, coords } = useMemo(() => {
    if (points.length === 0) {
      return { path: "", area: "", coords: [] as { x: number; y: number }[], max: 0 };
    }
    const maxV = Math.max(...points.map((p) => p.value), 1);
    const n = points.length;
    const xAt = (i: number) =>
      PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const yAt = (v: number) => PAD.top + innerH - (v / maxV) * innerH;

    const cs = points.map((p, i) => ({ x: xAt(i), y: yAt(p.value) }));
    const line = cs.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
    const baseY = PAD.top + innerH;
    const areaPath =
      cs.length > 0
        ? `${line} L${cs[cs.length - 1].x},${baseY} L${cs[0].x},${baseY} Z`
        : "";
    return { path: line, area: areaPath, coords: cs, max: maxV };
  }, [points, innerW, innerH]);

  // Evenly-spaced x-axis tick indices — every point when there are few, thinned
  // out so labels never overlap when there are many (e.g. 30 daily points).
  const tickIndices = useMemo(() => {
    const n = points.length;
    if (n === 0) return [];
    const maxTicks = 8;
    const step = Math.max(1, Math.ceil(n / maxTicks));
    const idx: number[] = [];
    for (let i = 0; i < n; i += step) idx.push(i);
    if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
    return idx;
  }, [points.length]);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (points.length === 0 || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    // nearest index
    let best = 0;
    let bestD = Infinity;
    coords.forEach((c, i) => {
      const d = Math.abs(c.x - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  }

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl bg-surface/50 text-sm text-muted"
        style={{ height: H }}
      >
        No data in this range.
      </div>
    );
  }

  const hoverPt = hover !== null ? coords[hover] : null;
  const hoverData = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        style={{ display: "block", touchAction: "none" }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* horizontal gridlines at 0 / 50 / 100% */}
        {[0, 0.5, 1].map((t) => {
          const y = PAD.top + innerH - t * innerH;
          return (
            <line
              key={t}
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y}
              y2={y}
              stroke="rgba(239,255,227,0.06)"
              strokeWidth={1}
            />
          );
        })}

        <path d={area} fill={`url(#${gradId})`} />
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* last-point marker */}
        {coords.length > 0 && (
          <circle
            cx={coords[coords.length - 1].x}
            cy={coords[coords.length - 1].y}
            r={3.5}
            fill={color}
          />
        )}

        {/* hover guide + dot */}
        {hoverPt && (
          <>
            <line
              x1={hoverPt.x}
              x2={hoverPt.x}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke={color}
              strokeOpacity={0.4}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={hoverPt.x} cy={hoverPt.y} r={4} fill={color} />
          </>
        )}
      </svg>

      {/* x-axis ticks (HTML overlay so text isn't distorted by preserveAspectRatio) */}
      <div className="relative mt-1.5 h-4 text-[11px] text-muted">
        {tickIndices.map((i) => {
          const leftPct = (coords[i].x / W) * 100;
          const isFirst = i === 0;
          const isLast = i === points.length - 1;
          return (
            <span
              key={i}
              className="absolute top-0 whitespace-nowrap"
              style={{
                left: `${leftPct}%`,
                transform: isFirst
                  ? "translateX(0)"
                  : isLast
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
              }}
            >
              {points[i].label ?? niceDate(points[i].date)}
            </span>
          );
        })}
      </div>

      {/* tooltip */}
      {hoverData && hoverPt && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg bg-elevated px-2.5 py-1.5 text-center shadow-lg ring-1 ring-white/10"
          style={{
            left: `${(hoverPt.x / W) * 100}%`,
            top: 0,
          }}
        >
          <div className="text-[10px] uppercase tracking-wider text-muted">
            {hoverData.label ?? niceDate(hoverData.date)}
          </div>
          <div className="text-sm font-semibold" style={{ color }}>
            {format(hoverData.value)}
          </div>
        </div>
      )}
    </div>
  );
}
