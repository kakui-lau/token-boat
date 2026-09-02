export type RelayEndpoint = {
  description: { en: string; zh: string };
  method: "GET" | "POST";
  path: string;
};

// This curated public index is contract-tested against docs/openapi/relay.json.
export const relayEndpoints: RelayEndpoint[] = [
  {
    path: "/v1/models",
    method: "GET",
    description: { zh: "列出当前可访问模型", en: "List models available to the API key" },
  },
  {
    path: "/v1/responses",
    method: "POST",
    description: {
      zh: "Responses API，适合工具与多轮工作流",
      en: "Responses API for tools and multi-turn workflows",
    },
  },
  {
    path: "/v1/chat/completions",
    method: "POST",
    description: { zh: "OpenAI 兼容对话补全", en: "OpenAI-compatible chat completions" },
  },
  {
    path: "/v1/messages",
    method: "POST",
    description: {
      zh: "Anthropic Messages 兼容端点",
      en: "Anthropic Messages-compatible endpoint",
    },
  },
  {
    path: "/v1/embeddings",
    method: "POST",
    description: { zh: "生成文本嵌入向量", en: "Create text embeddings" },
  },
  {
    path: "/v1/images/generations",
    method: "POST",
    description: { zh: "提交图像生成请求", en: "Submit an image generation request" },
  },
  {
    path: "/v1/audio/speech",
    method: "POST",
    description: { zh: "文本转语音", en: "Text to speech" },
  },
  {
    path: "/v1/audio/transcriptions",
    method: "POST",
    description: { zh: "音频转录", en: "Audio transcription" },
  },
  {
    path: "/v1/videos",
    method: "POST",
    description: { zh: "提交视频生成任务", en: "Submit a video generation task" },
  },
];

export const quickstartCode = {
  curl: `export TOKEN_BOAT_API_KEY="your_api_key"
export MODEL_ID="choose_from_the_model_catalog"

curl https://tokenboat.com/v1/chat/completions \\
  -H "Authorization: Bearer $TOKEN_BOAT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "'"$MODEL_ID"'",
    "messages": [{"role": "user", "content": "Hello from Token Boat"}]
  }'`,
  python: `from openai import OpenAI
import os

client = OpenAI(
    api_key=os.environ["TOKEN_BOAT_API_KEY"],
    base_url="https://tokenboat.com/v1",
)

response = client.chat.completions.create(
    model=os.environ["MODEL_ID"],
    messages=[{"role": "user", "content": "Hello from Token Boat"}],
)
print(response.choices[0].message.content)`,
  javascript: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.TOKEN_BOAT_API_KEY,
  baseURL: "https://tokenboat.com/v1",
});

const response = await client.chat.completions.create({
  model: process.env.MODEL_ID,
  messages: [{ role: "user", content: "Hello from Token Boat" }],
});
console.log(response.choices[0].message.content);`,
  streaming: `const stream = await client.chat.completions.create({
  model: process.env.MODEL_ID,
  messages: [{ role: "user", content: "Stream a short answer" }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`,
};
