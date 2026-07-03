import type {
  AssignmentsResponse,
  InstagramAccountSummary,
  InstagramDashboard,
  Platform,
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

export async function fetchAssignments(): Promise<AssignmentsResponse> {
  const res = await fetch(`${API_BASE}/social/assignments`);
  if (!res.ok) throw new Error(`Failed to load assignments: ${res.status}`);
  return res.json();
}

export async function setAssignment(
  platform: Platform,
  ref: string,
  owner: string
): Promise<AssignmentsResponse> {
  const res = await fetch(`${API_BASE}/social/assignments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform, ref, owner }),
  });
  if (!res.ok) await detailError(res, "Failed to save assignment");
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
