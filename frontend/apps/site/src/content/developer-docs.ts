import type { SiteLocale } from "@/content/site-copy";

export type RelayEndpoint = {
  description: Record<SiteLocale, string>;
  method: "GET" | "POST";
  path: string;
};

// This curated public index is contract-tested against docs/openapi/relay.json.
export const relayEndpoints: RelayEndpoint[] = [
  {
    path: "/v1/models",
    method: "GET",
    description: {
      zh: "列出当前可访问模型",
      en: "List models available to the API key",
      ja: "API キーで利用できるモデルを一覧表示",
      ko: "API 키로 이용 가능한 모델 목록",
      "zh-TW": "列出目前 API Key 可存取的模型",
    },
  },
  {
    path: "/v1/responses",
    method: "POST",
    description: {
      zh: "Responses API，适合工具与多轮工作流",
      en: "Responses API for tools and multi-turn workflows",
      ja: "ツールと複数ターンのワークフロー向け Responses API",
      ko: "도구 및 멀티턴 워크플로를 위한 Responses API",
      "zh-TW": "適合工具與多輪工作流程的 Responses API",
    },
  },
  {
    path: "/v1/chat/completions",
    method: "POST",
    description: {
      zh: "OpenAI 兼容对话补全",
      en: "OpenAI-compatible chat completions",
      ja: "OpenAI 互換チャット補完",
      ko: "OpenAI 호환 채팅 완성",
      "zh-TW": "OpenAI 相容對話補全",
    },
  },
  {
    path: "/v1/messages",
    method: "POST",
    description: {
      zh: "Anthropic Messages 兼容端点",
      en: "Anthropic Messages-compatible endpoint",
      ja: "Anthropic Messages 互換エンドポイント",
      ko: "Anthropic Messages 호환 엔드포인트",
      "zh-TW": "Anthropic Messages 相容端點",
    },
  },
  {
    path: "/v1/embeddings",
    method: "POST",
    description: {
      zh: "生成文本嵌入向量",
      en: "Create text embeddings",
      ja: "テキスト埋め込みを生成",
      ko: "텍스트 임베딩 생성",
      "zh-TW": "建立文字嵌入向量",
    },
  },
  {
    path: "/v1/images/generations",
    method: "POST",
    description: {
      zh: "提交图像生成请求",
      en: "Submit an image generation request",
      ja: "画像生成リクエストを送信",
      ko: "이미지 생성 요청 제출",
      "zh-TW": "提交圖像生成請求",
    },
  },
  {
    path: "/v1/audio/speech",
    method: "POST",
    description: {
      zh: "文本转语音",
      en: "Text to speech",
      ja: "テキスト読み上げ",
      ko: "텍스트 음성 변환",
      "zh-TW": "文字轉語音",
    },
  },
  {
    path: "/v1/audio/transcriptions",
    method: "POST",
    description: {
      zh: "音频转录",
      en: "Audio transcription",
      ja: "音声文字起こし",
      ko: "오디오 전사",
      "zh-TW": "音訊轉錄",
    },
  },
  {
    path: "/v1/videos",
    method: "POST",
    description: {
      zh: "提交视频生成任务",
      en: "Submit a video generation task",
      ja: "動画生成タスクを送信",
      ko: "비디오 생성 작업 제출",
      "zh-TW": "提交影片生成任務",
    },
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
