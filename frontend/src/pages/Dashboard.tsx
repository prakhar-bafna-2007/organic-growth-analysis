import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, Youtube, Instagram, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import type {
  Assignments,
  DiscoveredAccount,
  InstagramAccountSummary,
  Platform,
  YoutubeAccountSummary,
} from "../lib/types";
import {
  fetchAssignments,
  fetchInstagramAccounts,
  fetchYoutubeAccounts,
  setAssignment,
} from "../lib/api";
import { Dropdown } from "../components/Dropdown";
import { AccountCard } from "../components/AccountCard";

const PLATFORM_TABS: { key: Platform; label: string; icon: typeof Youtube }[] = [
  { key: "youtube", label: "YouTube", icon: Youtube },
  { key: "instagram", label: "Instagram", icon: Instagram },
];

const UNASSIGNED = "__unassigned__";
const emptyAssignments: Assignments = { youtube: {}, instagram: {} };

export function Dashboard() {
  const [assignments, setAssignments] = useState<Assignments | null>(null);
  const [yt, setYt] = useState<YoutubeAccountSummary[]>([]);
  const [ig, setIg] = useState<InstagramAccountSummary[]>([]);
  const [platform, setPlatform] = useState<Platform>("youtube");
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetchAssignments()
      .then((r) => setAssignments(r.assignments))
      .catch(() => setAssignments(emptyAssignments));
    fetchYoutubeAccounts()
      .then((r) => setYt(r.accounts))
      .catch((e: unknown) => setNotice(e instanceof Error ? e.message : "Couldn't load YouTube stats."));
    fetchInstagramAccounts()
      .then((r) => setIg(r.accounts))
      .catch(() => setIg([]));
  }, []);

  // Join discovered Windsor accounts with their owner assignment.
  const accounts: DiscoveredAccount[] = useMemo(() => {
    const a = assignments ?? emptyAssignments;
    const ytA: DiscoveredAccount[] = yt.map((x) => ({
      platform: "youtube",
      ref: x.channel_id,
      label: x.channel_title || x.channel_id,
      owner: a.youtube[x.channel_id] ?? null,
      yt: x,
    }));
    const igA: DiscoveredAccount[] = ig.map((x) => ({
      platform: "instagram",
      ref: x.account_id,
      label: x.username ? `@${x.username}` : x.account_id,
      owner: a.instagram[x.account_id] ?? null,
      ig: x,
    }));
    return [...ytA, ...igA];
  }, [yt, ig, assignments]);

  // Owner names come from assignments — dynamic, no hardcoded list.
  const ownerNames = useMemo(() => {
    const a = assignments ?? emptyAssignments;
    const names = new Set<string>([
      ...Object.values(a.youtube),
      ...Object.values(a.instagram),
    ]);
    return [...names].sort((x, y) => x.localeCompare(y));
  }, [assignments]);

  const unassignedCount = accounts.filter((x) => !x.owner).length;

  // Options for the owner selector: owners + an Unassigned bucket when needed.
  const ownerOptions = useMemo(() => {
    const opts = ownerNames.map((o) => ({ key: o, label: o }));
    if (unassignedCount > 0)
      opts.push({ key: UNASSIGNED, label: `Unassigned (${unassignedCount})` });
    return opts;
  }, [ownerNames, unassignedCount]);

  // Default / keep the owner selection valid as data loads and changes.
  useEffect(() => {
    if (ownerOptions.length === 0) return;
    const valid = ownerOptions.some((o) => o.key === ownerFilter);
    if (!valid) setOwnerFilter(ownerOptions[0].key);
  }, [ownerOptions, ownerFilter]);

  const shown = accounts.filter((x) => {
    if (x.platform !== platform) return false;
    return ownerFilter === UNASSIGNED ? !x.owner : x.owner === ownerFilter;
  });

  async function assign(acc: DiscoveredAccount, owner: string) {
    try {
      const r = await setAssignment(acc.platform, acc.ref, owner);
      setAssignments(r.assignments);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Couldn't save assignment.");
    }
  }

  const loading = assignments === null;

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-neon-emerald/10 text-neon-emerald">
            <LayoutGrid className="h-6 w-6" />
          </span>
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-muted">
              Social Analytics
            </div>
            <h1 className="mt-1 font-display text-3xl font-semibold leading-tight">
              Cross-platform dashboard
            </h1>
          </div>
        </div>

        {ownerOptions.length > 0 && ownerFilter && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Owner</span>
            <Dropdown
              value={ownerFilter}
              options={ownerOptions}
              onChange={setOwnerFilter}
              className="min-w-[170px]"
            />
          </div>
        )}
      </header>

      {/* platform tabs */}
      <div className="mt-6 flex w-fit gap-1 rounded-full bg-card p-1">
        {PLATFORM_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setPlatform(t.key)}
              className={clsx(
                "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-all",
                platform === t.key
                  ? "bg-elevated text-offwhite ring-1 ring-white/10"
                  : "text-muted hover:text-offwhite"
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {notice && (
        <div className="mt-6 flex items-start gap-3 rounded-xl bg-neon-amber/10 px-4 py-3 text-sm text-neon-amber">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Heads up</div>
            <div className="mt-0.5 text-neon-amber/80">{notice}</div>
          </div>
        </div>
      )}

      {unassignedCount > 0 && ownerFilter !== UNASSIGNED && (
        <button
          onClick={() => setOwnerFilter(UNASSIGNED)}
          className="mt-6 flex w-full items-center gap-2 rounded-xl bg-neon-amber/10 px-4 py-2.5 text-left text-sm text-neon-amber transition-colors hover:bg-neon-amber/15"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {unassignedCount} account{unassignedCount !== 1 ? "s" : ""} newly discovered from
          Windsor need an owner — click to assign.
        </button>
      )}

      {/* account cards */}
      {loading ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="mt-8 text-sm text-muted">
          No {platform} accounts{" "}
          {ownerFilter === UNASSIGNED ? "are unassigned" : `for ${ownerFilter}`}.
        </p>
      ) : (
        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((acc) => (
            <AccountCard
              key={`${acc.platform}:${acc.ref}`}
              label={acc.label}
              platform={acc.platform}
              href={`/${acc.platform}/${acc.ref}`}
              summary={acc.yt}
              igSummary={acc.ig}
              assign={{
                current: acc.owner,
                owners: ownerNames,
                onAssign: (owner) => assign(acc, owner),
              }}
            />
          ))}
        </section>
      )}
    </div>
  );
}
