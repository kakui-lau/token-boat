export type RankingPeriod = "month" | "today" | "week" | "year";

export type PublicModelRanking = {
  growthPct: number;
  modelName: string;
  previousRank: number | null;
  rank: number;
  share: number;
  totalTokens: number;
  vendor: string;
};

export type PublicVendorRanking = {
  growthPct: number;
  modelsCount: number;
  rank: number;
  share: number;
  topModel: string;
  totalTokens: number;
  vendor: string;
};

export type PublicRankingMover = {
  currentRank: number;
  growthPct: number;
  modelName: string;
  rankDelta: number;
  vendor: string;
};

export type PublicActivityBucket = {
  label: string;
  totalTokens: number;
};

export type PublicRankingsSnapshot = {
  activity: PublicActivityBucket[];
  models: PublicModelRanking[];
  topDroppers: PublicRankingMover[];
  topMovers: PublicRankingMover[];
  vendors: PublicVendorRanking[];
};

export function parsePublicRankingsEnvelope(value: unknown): PublicRankingsSnapshot | null {
  const envelope = asRecord(value);
  if (envelope.success !== true) return null;
  const data = asRecord(envelope.data);
  const models = asArray(data.models).map(parseModel).filter(isPresent);
  if (models.length === 0) return null;

  return {
    activity: parseActivity(asRecord(data.models_history).points),
    models,
    topDroppers: asArray(data.top_droppers).map(parseMover).filter(isPresent),
    topMovers: asArray(data.top_movers).map(parseMover).filter(isPresent),
    vendors: asArray(data.vendors).map(parseVendor).filter(isPresent),
  };
}

function parseModel(value: unknown): PublicModelRanking | null {
  const row = asRecord(value);
  const rank = readPositiveInteger(row.rank);
  const modelName = readString(row.model_name);
  const vendor = readString(row.vendor);
  const totalTokens = readNonNegativeNumber(row.total_tokens);
  const share = readShare(row.share);
  const growthPct = readNumber(row.growth_pct);
  if (
    rank === null ||
    !modelName ||
    !vendor ||
    totalTokens === null ||
    share === null ||
    growthPct === null
  ) {
    return null;
  }

  return {
    growthPct,
    modelName,
    previousRank: readPositiveInteger(row.previous_rank),
    rank,
    share,
    totalTokens,
    vendor,
  };
}

function parseVendor(value: unknown): PublicVendorRanking | null {
  const row = asRecord(value);
  const rank = readPositiveInteger(row.rank);
  const vendor = readString(row.vendor);
  const topModel = readString(row.top_model);
  const totalTokens = readNonNegativeNumber(row.total_tokens);
  const share = readShare(row.share);
  const growthPct = readNumber(row.growth_pct);
  const modelsCount = readNonNegativeInteger(row.models_count);
  if (
    rank === null ||
    !vendor ||
    !topModel ||
    totalTokens === null ||
    share === null ||
    growthPct === null ||
    modelsCount === null
  ) {
    return null;
  }

  return { growthPct, modelsCount, rank, share, topModel, totalTokens, vendor };
}

function parseMover(value: unknown): PublicRankingMover | null {
  const row = asRecord(value);
  const modelName = readString(row.model_name);
  const vendor = readString(row.vendor);
  const currentRank = readPositiveInteger(row.current_rank);
  const rankDelta = readInteger(row.rank_delta);
  const growthPct = readNumber(row.growth_pct);
  if (!modelName || !vendor || currentRank === null || rankDelta === null || growthPct === null) {
    return null;
  }
  return { currentRank, growthPct, modelName, rankDelta, vendor };
}

function parseActivity(value: unknown): PublicActivityBucket[] {
  const totals = new Map<string, number>();
  for (const rawPoint of asArray(value)) {
    const point = asRecord(rawPoint);
    const label = readString(point.label);
    const tokens = readNonNegativeNumber(point.tokens);
    if (!label || tokens === null) continue;
    totals.set(label, (totals.get(label) ?? 0) + tokens);
  }
  return Array.from(totals, ([label, totalTokens]) => ({ label, totalTokens }));
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readInteger(value: unknown): number | null {
  const number = readNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

function readPositiveInteger(value: unknown): number | null {
  const number = readInteger(value);
  return number !== null && number > 0 ? number : null;
}

function readNonNegativeInteger(value: unknown): number | null {
  const number = readInteger(value);
  return number !== null && number >= 0 ? number : null;
}

function readNonNegativeNumber(value: unknown): number | null {
  const number = readNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function readShare(value: unknown): number | null {
  const number = readNumber(value);
  return number !== null && number >= 0 && number <= 1 ? number : null;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
