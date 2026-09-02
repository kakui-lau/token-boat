export type PublicModelFamily =
  | "audio"
  | "chat"
  | "embedding"
  | "image"
  | "reasoning"
  | "unknown"
  | "video";

export type PublicModelPrice = {
  amount: number;
  currency: string;
  qualifier: "from" | null;
  unit: "million_tokens" | "request" | "second";
};

export type PublicPriceComponent = {
  amount: number;
  component: string;
  currency: string;
  operation: string | null;
  quality: string | null;
  resolution: string | null;
  tier: string | null;
  unit: string;
  unitSize: number | null;
  upperBound: string | null;
  withAudio: string | null;
};

export type PublicPricingModel = {
  available: boolean;
  availabilityStatus: string | null;
  billingMode: string | null;
  contextLength: number | null;
  description: string | null;
  endpoints: string[];
  family: PublicModelFamily;
  id: string;
  inputPrice: PublicModelPrice | null;
  maxOutputTokens: number | null;
  limitsSourceUrl: string | null;
  limitsVerifiedAt: number | null;
  outputPrice: PublicModelPrice | null;
  priceComponents: PublicPriceComponent[];
  priceStructure: string | null;
  pricingSource: string | null;
  provider: string | null;
  tags: string[];
};

type PriceSelection = {
  amount: number;
  qualifier: "from" | null;
  unit: PublicModelPrice["unit"];
};

const inputComponents = [
  "token_input",
  "image_token_input",
  "audio_token_input",
  "image_input",
  "audio_input",
  "video_input",
  "character_input",
] as const;

const outputComponents = [
  "token_output",
  "image_token_output",
  "audio_token_output",
  "video_output",
  "request",
  "generated_item",
  "image_output",
  "audio_output",
  "character_output",
] as const;

export function parsePublicPricingEnvelope(value: unknown): PublicPricingModel[] {
  const envelope = asRecord(value);
  const vendorNames = new Map<number, string>();
  for (const rawVendor of asArray(envelope.vendors)) {
    const vendor = asRecord(rawVendor);
    const id = readNumber(vendor.id);
    const name = readString(vendor.name);
    if (id !== null && Number.isInteger(id) && name) vendorNames.set(id, name);
  }

  const models: PublicPricingModel[] = [];
  for (const rawModel of asArray(envelope.data)) {
    const model = asRecord(rawModel);
    const id = readString(model.model_name);
    if (!id) continue;
    const vendorId = readNumber(model.vendor_id);
    const summary = selectPublicSummary(model);
    const currency = summary ? readString(summary.currency) : null;
    const input = summary ? selectPrice(summary, inputComponents) : null;
    const output = summary ? selectPrice(summary, outputComponents) : null;
    const tags = readTags(model.tags);
    const vendorName = vendorId !== null ? vendorNames.get(vendorId) : undefined;

    models.push({
      available:
        model.available !== false && readString(model.availability_status) !== "unavailable",
      availabilityStatus: readString(model.availability_status),
      billingMode: summary ? readString(summary.billing_mode) : null,
      contextLength: readPositiveNumber(model.context_length),
      description: readString(model.description),
      endpoints: readStringArray(model.supported_endpoint_types),
      family: inferFamily(id, tags),
      id,
      inputPrice: input && currency ? { ...input, currency } : null,
      maxOutputTokens: readPositiveNumber(model.max_output_tokens),
      limitsSourceUrl: readHttpUrl(model.limits_source_url),
      limitsVerifiedAt: readPositiveNumber(model.limits_verified_at),
      outputPrice: output && currency ? { ...output, currency } : null,
      priceComponents: summary && currency ? readPriceComponents(summary, currency) : [],
      priceStructure: summary ? readString(summary.price_structure) : null,
      pricingSource: readString(model.pricing_source),
      provider: vendorName ?? readString(model.provider) ?? readString(model.owner_by),
      tags,
    });
  }

  return models.sort((left, right) => left.id.localeCompare(right.id));
}

function readPriceComponents(
  summary: Record<string, unknown>,
  currency: string,
): PublicPriceComponent[] {
  return asArray(summary.items)
    .map(asRecord)
    .map((item) => ({
      amount: readNumber(item.amount),
      component: readString(item.component),
      currency,
      operation: readString(item.operation),
      quality: readString(item.quality),
      resolution: readString(item.resolution),
      tier: readString(item.tier),
      unit: readString(item.unit),
      unitSize: readPositiveNumber(item.unit_size),
      upperBound: readString(item.upper_bound),
      withAudio: readString(item.with_audio),
    }))
    .filter(
      (item): item is PublicPriceComponent =>
        item.amount !== null && item.amount >= 0 && item.component !== null && item.unit !== null,
    );
}

function selectPublicSummary(model: Record<string, unknown>): Record<string, unknown> | null {
  const lowestPrice = asRecord(model.lowest_price);
  if (asArray(lowestPrice.items).length > 0) return lowestPrice;

  const officialPrice = asRecord(model.official_price);
  if (asArray(officialPrice.items).length > 0) return officialPrice;
  return null;
}

function selectPrice(
  summary: Record<string, unknown>,
  components: readonly string[],
): PriceSelection | null {
  const items = asArray(summary.items).map(asRecord);
  for (const component of components) {
    const candidates = items
      .filter((item) => readString(item.component) === component)
      .map((item) => ({
        amount: readNumber(item.amount),
        unit: normalizeUnit(readString(item.unit)),
      }))
      .filter(
        (candidate): candidate is { amount: number; unit: PublicModelPrice["unit"] } =>
          candidate.amount !== null && candidate.amount >= 0 && candidate.unit !== null,
      );
    if (candidates.length === 0) continue;
    const selected = candidates.reduce((lowest, candidate) =>
      candidate.amount < lowest.amount ? candidate : lowest,
    );
    return {
      amount: selected.amount,
      qualifier: candidates.length > 1 ? "from" : null,
      unit: selected.unit,
    };
  }
  return null;
}

function normalizeUnit(unit: string | null): PublicModelPrice["unit"] | null {
  if (unit === "token") return "million_tokens";
  if (unit === "second") return "second";
  if (unit === "request" || unit === "item") return "request";
  return null;
}

function inferFamily(id: string, tags: string[]): PublicModelFamily {
  const searchable = `${id} ${tags.join(" ")}`.toLowerCase();
  if (/reason|推理|thinking/.test(searchable)) return "reasoning";
  if (/embedding|嵌入|rerank/.test(searchable)) return "embedding";
  if (/video|视频/.test(searchable)) return "video";
  if (/image|图片|图像/.test(searchable)) return "image";
  if (/audio|speech|voice|音频|语音/.test(searchable)) return "audio";
  if (/chat|文本|代码|language/.test(searchable)) return "chat";
  return "unknown";
}

function readTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0,
    );
  }
  const tags = readString(value);
  if (!tags) return [];
  return tags
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function readStringArray(value: unknown): string[] {
  return asArray(value)
    .map(readString)
    .filter((item): item is string => item !== null);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  const number =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function readPositiveNumber(value: unknown): number | null {
  const number = readNumber(value);
  return number !== null && number > 0 ? number : null;
}

function readHttpUrl(value: unknown): string | null {
  const candidate = readString(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
