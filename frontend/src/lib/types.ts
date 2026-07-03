// Mirror of the backend response shapes. Keep in sync by hand.

// ── Cross-platform hub ──────────────────────────────────────────────────────
export type Platform = "youtube" | "instagram";

// Accounts are discovered from Windsor; this map only records which owner each
// discovered account (by channel_id / account_id) is assigned to.
export type Assignments = Record<Platform, Record<string, string>>;

export interface AssignmentsResponse {
  assignments: Assignments;
  platforms: Platform[];
}

// A discovered account joined with its owner assignment, for rendering.
export interface DiscoveredAccount {
  platform: Platform;
  ref: string; // channel_id / account_id
  label: string; // channel title / @username
  owner: string | null; // null = unassigned
  yt?: YoutubeAccountSummary;
  ig?: InstagramAccountSummary;
}

// ── YouTube ─────────────────────────────────────────────────────────────────
export type YoutubePreset =
  | "last_7d"
  | "last_30d"
  | "last_90d"
  | "this_year"
  | "all_time";

export interface YoutubeAccountSummary {
  channel_id: string;
  channel_title: string;
  subscriber_count: number;
  views: number;
  subscribers_gained: number;
  watch_minutes: number;
  latest_available: string | null;
}

export interface YoutubeDashboard {
  account_name: string;
  channel_title: string;
  preset: YoutubePreset;
  channel_id: string | null;
  row_count: number;
  metric_fields: string[];
  kpis: Record<string, number>;
  timeseries: Array<Record<string, number | string>>;
  window: { from: string; to: string };
  latest_available: string | null;
  today: string;
}

// ── Instagram ───────────────────────────────────────────────────────────────
export interface InstagramAccountSummary {
  account_id: string;
  username: string;
  views: number;
  reach: number;
  saves: number;
  shares: number;
}

export interface InstagramPeriod {
  start: string;
  end: string;
  views: number;
  reach: number | null;
  saves: number;
  shares: number;
}

export interface InstagramDashboard {
  account_name: string;
  username: string;
  account_id: string;
  granularity: "week" | "month";
  periods: InstagramPeriod[]; // oldest → newest
  latest_available: string | null;
  today: string;
}
