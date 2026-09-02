// Static route inventory captured from the public pricing catalog. Runtime details still come
// from /api/pricing, so no price or availability value is baked into the generated page.
export const publicModelIds = [
  "anthropic/claude-fable-5",
  "anthropic/claude-haiku-4-5-20251001",
  "anthropic/claude-opus-4-8",
  "anthropic/claude-opus-5",
  "anthropic/claude-sonnet-4-6",
  "anthropic/claude-sonnet-5",
  "bytedance/seedance-2.0",
  "bytedance/seedance-2.0-fast-upscale",
  "bytedance/seedance-2.0-upscale",
  "bytedance/seedance-2.5-upscale",
  "byteplus/seedance-2.0",
  "byteplus/seedance-2.0-ep",
  "byteplus/seedance-2.0-fast",
  "byteplus/seedance-2.0-fast-ep",
  "byteplus/seedance-2.0-fast-hc",
  "byteplus/seedance-2.0-hc",
  "byteplus/seedance-2.0-mini",
  "byteplus/seedance-2.0-mini-ep",
  "byteplus/seedance-2.0-mini-hc",
  "deepseek/deepseek-v4-flash",
  "deepseek/deepseek-v4-pro",
  "google/gemini-2.5-pro",
  "google/gemini-3-flash-preview",
  "google/gemini-3-pro-image-preview",
  "google/gemini-3.1-flash-image-preview",
  "google/gemini-3.1-pro-preview",
  "minimax/minimax-m3",
  "moonshotai/kimi-k3",
  "openai/gpt-5.4",
  "openai/gpt-5.4-mini",
  "openai/gpt-5.4-nano",
  "openai/gpt-5.5",
  "openai/gpt-5.6-luna",
  "openai/gpt-5.6-sol",
  "openai/gpt-5.6-terra",
  "openai/gpt-image-2",
  "xiaomi/mimo-v2.5-pro",
  "z-ai/glm-5.1",
  "z-ai/glm-5.2",
  "z-ai/glm-5.3",
] as const;

export function modelPath(locale: "en" | "zh", modelId: string): string {
  return `${locale === "en" ? "/en" : ""}/models/${modelId}`;
}

export function modelDisplayName(modelId: string): string {
  return modelId.split("/").at(-1)?.replaceAll("-", " ") ?? modelId;
}
