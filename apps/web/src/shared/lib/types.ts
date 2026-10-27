// Response shapes of the dashboard endpoints (apps/api/README.md).
export type Range = "7d" | "30d";
type Tier = "cheap" | "expensive" | "none";
export type ModelTier = "cheap" | "expensive";
export type Provider = "openai" | "anthropic" | "google" | "openai_compatible";

interface Meter {
  used: number;
  max: number;
}
export interface Usage {
  documents: Meter;
  requests_per_minute: Meter;
  requests_this_month: Meter;
}

export interface Doc {
  document_id: string;
  filename: string;
  status: "processing" | "ready" | "failed";
  error: string | null;
  chunk_count: number;
  created_at: string;
}

export interface Route {
  model_tier: Tier;
  k: number;
  escalated: boolean;
  difficulty: number;
  top_score: number;
}
interface TrySource {
  document_id: string;
  chunk_id: number;
  score: number;
  filename: string | null;
  snippet?: string;
}
export interface TryResponse {
  request_id: string;
  answer: string;
  sources: TrySource[];
  route: Route;
  usage: { tokens_in: number; tokens_out: number; latency_ms: number; cost_usd: number | null };
}

export interface ModelUsage {
  id: string;
  tier: ModelTier;
  position: number;
  provider: Provider;
  model_id: string;
  status: "connected" | "failing";
  rate_limits: Record<string, unknown> | null;
  rate_limits_seen_at: string | null;
  rate_limited_until: string | null;
  requests: number;
  tokens_in: number;
  tokens_out: number;
  failures: { error: number; timeout: number; rate_limited: number };
  backup_uses: number;
  median_latency_ms: number | null;
  cost_usd: number | null;
}
export interface ModelsUsage {
  range: Range;
  total_cost_usd: number | null;
  models: ModelUsage[];
}

export interface TenantModel {
  id: string;
  tier: ModelTier;
  position: number;
  provider: Provider;
  model_id: string;
  endpoint_url: string;
  key_hint: string;
  status: "connected" | "failing";
  input_price_per_1m: number | null;
  output_price_per_1m: number | null;
}
export type ModelsGrouped = Record<ModelTier, TenantModel[]>;

export interface Summary {
  range: Range;
  total_requests: number;
  per_day: {
    date: string;
    cheap: number;
    expensive: number;
    none: number;
    failed: number;
    cost_usd: number | null;
  }[];
  route_mix: {
    cheap: number;
    escalated: number;
    expensive_hard: number;
    none: number;
    failed: number;
  };
  latency_ms: { median: number | null; p95: number | null };
  total_cost_usd: number | null;
  by_model: ModelUsage[];
}
export interface UnansweredGroup<T> {
  total: number;
  items: T[];
}
export interface Unanswered {
  range: Range;
  threshold: number;
  no_match: UnansweredGroup<{
    id: string;
    query: string;
    top_score: number | null;
    tier: Tier;
    time: string;
  }>;
  not_found: UnansweredGroup<{
    id: string;
    query: string;
    top_score: number | null;
    tier: Tier;
    model: { provider: string; model_id: string } | null;
    difficulty: number | null;
    escalated: boolean;
    time: string;
  }>;
}

export interface RequestRow {
  id: string;
  time: string;
  query: string;
  tier: Tier | null;
  k: number | null;
  escalated: boolean | null;
  latency_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  status: string;
}
export interface RequestsPage {
  items: RequestRow[];
  next_cursor: string | null;
}
export interface RequestDetail {
  id: string;
  time: string;
  query: string;
  status: string;
  route: {
    tier: Tier | null;
    k: number | null;
    escalated: boolean | null;
    difficulty: number | null;
    top_score: number | null;
  };
  usage: {
    tokens_in: number | null;
    tokens_out: number | null;
    latency_ms: number | null;
    cost_usd: number | null;
  };
  feedback: number | null;
  api_key: { id: string; name: string | null; start: string | null; prefix: string | null } | null;
  sources: {
    document_id: string;
    chunk_id: number;
    score: number;
    filename: string | null;
    document_deleted: boolean;
    passage: string | null;
  }[];
}
