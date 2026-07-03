import { Link } from "react-router-dom";
import { Youtube, Instagram, ArrowRight } from "lucide-react";
import clsx from "clsx";
import type {
  InstagramAccountSummary,
  Platform,
  YoutubeAccountSummary,
} from "../lib/types";
import { OwnerAssign } from "./OwnerAssign";

const compact = (n: number) =>
  new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
const hours = (min: number) => {
  const h = min / 60;
  return h < 10 ? h.toFixed(1) : compact(Math.round(h));
};

interface Props {
  label: string;
  platform: Platform;
  href: string;
  summary?: YoutubeAccountSummary;
  igSummary?: InstagramAccountSummary;
  assign: { current: string | null; owners: string[]; onAssign: (o: string) => void };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 font-display text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function AccountCard({ label, platform, href, summary, igSummary, assign }: Props) {
  const Icon = platform === "youtube" ? Youtube : Instagram;
  const accent = platform === "youtube" ? "text-neon-red" : "text-neon-violet";
  const accentBg = platform === "youtube" ? "bg-neon-red/10" : "bg-neon-violet/10";

  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-white/5 transition-all hover:ring-white/15">
      <Link to={href} className="group block">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <span
              className={clsx(
                "flex h-9 w-9 items-center justify-center rounded-lg",
                accentBg,
                accent
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="truncate font-display text-base font-semibold text-offwhite">
                {label}
              </div>
              <div className="text-xs capitalize text-muted">{platform}</div>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-offwhite" />
        </div>

        {summary && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="Subscribers" value={compact(summary.subscriber_count)} />
            <Stat label="Views · 30d" value={compact(summary.views)} />
            <Stat label="Subs gained · 30d" value={`+${compact(summary.subscribers_gained)}`} />
            <Stat label="Watch hrs · 30d" value={hours(summary.watch_minutes)} />
          </div>
        )}
        {igSummary && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="Views · 30d" value={compact(igSummary.views)} />
            <Stat label="Reach · 30d" value={compact(igSummary.reach)} />
            <Stat label="Saves · 30d" value={compact(igSummary.saves)} />
            <Stat label="Shares · 30d" value={compact(igSummary.shares)} />
          </div>
        )}
      </Link>

      <div className="mt-4 flex items-center gap-2 border-t border-white/5 pt-3 text-[11px] text-muted">
        <span>Owner</span>
        <OwnerAssign
          current={assign.current}
          owners={assign.owners}
          onAssign={assign.onAssign}
        />
      </div>
    </div>
  );
}
