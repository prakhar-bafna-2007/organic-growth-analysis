import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, Youtube, Instagram, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import type {
  InstagramAccountSummary,
  Platform,
  SocialConfig,
  YoutubeAccountSummary,
} from "../lib/types";
import {
  fetchInstagramAccounts,
  fetchSocialConfig,
  fetchYoutubeAccounts,
} from "../lib/api";
import { Dropdown } from "../components/Dropdown";
import { AccountCard } from "../components/AccountCard";

const PLATFORM_TABS: { key: Platform; label: string; icon: typeof Youtube }[] = [
  { key: "youtube", label: "YouTube", icon: Youtube },
  { key: "instagram", label: "Instagram", icon: Instagram },
];

export function Dashboard() {
  const [config, setConfig] = useState<SocialConfig | null>(null);
  const [ytAccounts, setYtAccounts] = useState<YoutubeAccountSummary[]>([]);
  const [igAccounts, setIgAccounts] = useState<InstagramAccountSummary[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>("youtube");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetchSocialConfig()
      .then((c) => {
        setConfig(c);
        setOwnerId((prev) => prev ?? c.owners[0]?.id ?? null);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load")
      );
    // Live YouTube stats are best-effort — cards still render (without numbers)
    // if this fails, but we surface the reason (e.g. an expired Windsor license).
    fetchYoutubeAccounts()
      .then((r) => setYtAccounts(r.accounts))
      .catch((e: unknown) => {
        setYtAccounts([]);
        setNotice(e instanceof Error ? e.message : "Couldn't load live stats.");
      });
    fetchInstagramAccounts()
      .then((r) => setIgAccounts(r.accounts))
      .catch(() => setIgAccounts([]));
  }, []);

  const owner = useMemo(
    () => config?.owners.find((o) => o.id === ownerId) ?? null,
    [config, ownerId]
  );
  const accounts = owner?.accounts[platform] ?? [];
  const summaryByChannel = useMemo(() => {
    const m = new Map<string, YoutubeAccountSummary>();
    ytAccounts.forEach((a) => m.set(a.channel_id, a));
    return m;
  }, [ytAccounts]);
  const igByAccount = useMemo(() => {
    const m = new Map<string, InstagramAccountSummary>();
    igAccounts.forEach((a) => m.set(a.account_id, a));
    return m;
  }, [igAccounts]);
  const noneConnected = accounts.length > 0 && accounts.every((a) => !a.connected);

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

        {/* owner selector */}
        {config && config.owners.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Owner</span>
            <Dropdown
              value={ownerId ?? config.owners[0].id}
              options={config.owners.map((o) => ({ key: o.id, label: o.name }))}
              onChange={setOwnerId}
              className="min-w-[160px]"
            />
          </div>
        )}
      </header>

      {/* platform tabs */}
      <div className="mt-6 flex gap-1 rounded-full bg-card p-1 w-fit">
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

      {error && (
        <div className="mt-8 flex items-start gap-3 rounded-xl bg-neon-red/10 px-4 py-3 text-sm text-neon-red">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {notice && (
        <div className="mt-6 flex items-start gap-3 rounded-xl bg-neon-amber/10 px-4 py-3 text-sm text-neon-amber">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Live stats unavailable</div>
            <div className="mt-0.5 text-neon-amber/80">{notice}</div>
          </div>
        </div>
      )}

      {/* account cards */}
      {config && (
        <section className="mt-6">
          {accounts.length === 0 ? (
            <p className="text-sm text-muted">
              No {platform} accounts configured for {owner?.name}.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {accounts.map((a) => {
                const summary =
                  platform === "youtube" && a.ref
                    ? summaryByChannel.get(a.ref)
                    : undefined;
                const igSummary =
                  platform === "instagram" && a.ref
                    ? igByAccount.get(a.ref)
                    : undefined;
                const href =
                  a.connected && a.ref ? `/${platform}/${a.ref}` : undefined;
                return (
                  <AccountCard
                    key={a.id}
                    label={a.label}
                    platform={platform}
                    connected={a.connected}
                    summary={summary}
                    igSummary={igSummary}
                    href={href}
                  />
                );
              })}
            </div>
          )}

          {platform === "instagram" && noneConnected && (
            <p className="mt-5 text-xs text-muted">
              No Instagram accounts connected for {owner?.name} yet. Add one in
              Windsor and these cards will light up with live stats.
            </p>
          )}
        </section>
      )}

      {!config && !error && (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      )}
    </div>
  );
}
