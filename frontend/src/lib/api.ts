import type {
  InstagramAccountSummary,
  InstagramDashboard,
  SocialConfig,
  YoutubeAccountSummary,
  YoutubeDashboard,
  YoutubePreset,
} from "./types";

const API_BASE = "/api";

async function detailError(res: Response, fallback: string): Promise<never> {
  let detail = `${fallback} (${res.status})`;
  try {
    const body = (await res.json()) as { detail?: string };
    if (body.detail) detail = body.detail;
  } catch {
    // keep default
  }
  throw new Error(detail);
}

export async function fetchSocialConfig(): Promise<SocialConfig> {
  const res = await fetch(`${API_BASE}/social/config`);
  if (!res.ok) throw new Error(`Failed to load config: ${res.status}`);
  return res.json();
}

// ── YouTube ─────────────────────────────────────────────────────────────────
export async function fetchYoutubeAccounts(): Promise<{
  accounts: YoutubeAccountSummary[];
  window_days: number;
}> {
  const res = await fetch(`${API_BASE}/youtube/accounts`);
  if (!res.ok) await detailError(res, "Failed to load accounts");
  return res.json();
}

export async function fetchYoutubeDashboard(
  preset: YoutubePreset,
  channelId?: string
): Promise<YoutubeDashboard> {
  const q = new URLSearchParams({ preset });
  if (channelId) q.set("channel_id", channelId);
  const res = await fetch(`${API_BASE}/youtube/dashboard?${q.toString()}`);
  if (!res.ok) await detailError(res, "Failed to load dashboard");
  return res.json();
}

// ── Instagram ───────────────────────────────────────────────────────────────
export async function fetchInstagramAccounts(): Promise<{
  accounts: InstagramAccountSummary[];
  window_days: number;
}> {
  const res = await fetch(`${API_BASE}/instagram/accounts`);
  if (!res.ok) await detailError(res, "Failed to load Instagram accounts");
  return res.json();
}

export async function fetchInstagramDashboard(
  accountId: string,
  granularity: "week" | "month"
): Promise<InstagramDashboard> {
  const res = await fetch(
    `${API_BASE}/instagram/dashboard?account_id=${encodeURIComponent(
      accountId
    )}&granularity=${granularity}`
  );
  if (!res.ok) await detailError(res, "Failed to load Instagram dashboard");
  return res.json();
}
