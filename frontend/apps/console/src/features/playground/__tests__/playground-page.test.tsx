import { useRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ApiKeyRecord } from "@/data/contracts";
import { PlaygroundPage } from "../pages/playground-page";

const { listApiKeys, listPlaygroundModels, copilotKitProps, copilotChatProps, suggestionConfigs } =
  vi.hoisted(() => ({
    listApiKeys: vi.fn(),
    listPlaygroundModels: vi.fn(),
    copilotKitProps: vi.fn(),
    copilotChatProps: vi.fn(),
    suggestionConfigs: vi.fn(),
  }));

vi.mock("@/app/session/session-context", () => ({
  useSession: () => ({ session: { accessToken: "session-access-token" } }),
}));

vi.mock("@/data/repository", () => ({
  repository: {
    listApiKeys,
    listPlaygroundModels,
  },
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ children }: { children: ReactNode }) => <a href="/api-keys">{children}</a>,
  };
});

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotKit: (props: {
    children: ReactNode;
    headers: Record<string, string>;
    properties: Record<string, unknown>;
    runtimeUrl: string;
    useSingleEndpoint: boolean;
  }) => {
    const instanceId = useRef(crypto.randomUUID()).current;
    copilotKitProps(props);
    return (
      <div data-copilot-instance={instanceId} data-runtime-url={props.runtimeUrl}>
        {props.children}
      </div>
    );
  },
  CopilotChat: (props: { agentId: string; labels: Record<string, string> }) => {
    copilotChatProps(props);
    return (
      <textarea aria-label="Copilot chat input" placeholder={props.labels.chatInputPlaceholder} />
    );
  },
  useConfigureSuggestions: (config: unknown) => suggestionConfigs(config),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, values?: Record<string, string | number>) => {
      if (!values) return key;
      return Object.entries(values).reduce(
        (label, [name, value]) => label.replace(`{{${name}}}`, String(value)),
        key,
      );
    },
  }),
}));

const activeKey: ApiKeyRecord = {
  id: 7,
  name: "Development key",
  maskedKey: "sk-test-••••1234",
  status: "active",
  createdAt: 1,
  lastUsedAt: null,
  expiresAt: null,
  unlimitedQuota: false,
  remainingQuota: 2400,
  usedQuota: 100,
  group: "default",
  environment: "development",
  allowedModels: ["gpt-5"],
  allowedIps: [],
};

beforeEach(() => {
  listApiKeys.mockReset();
  listPlaygroundModels.mockReset();
  copilotKitProps.mockReset();
  copilotChatProps.mockReset();
  suggestionConfigs.mockReset();
  listApiKeys.mockResolvedValue([activeKey]);
  listPlaygroundModels.mockResolvedValue([
    { id: "gpt-5", label: "GPT-5", group: "default" },
    { id: "blocked-model", label: "Blocked model", group: "default" },
  ]);
});

describe("PlaygroundPage", () => {
  test("renders CopilotChat with the active key's permitted model", async () => {
    renderPlayground();

    const configuration = screen.getByRole("complementary", { name: "Playground configuration" });
    expect(await screen.findByRole("combobox", { name: "Select API key" })).toHaveTextContent(
      "Development key",
    );
    expect(await screen.findByRole("combobox", { name: "Select a model" })).toHaveTextContent(
      "GPT-5",
    );
    expect(screen.queryByText("Blocked model")).not.toBeInTheDocument();
    expect(screen.getByText("2,400 quota remaining")).toBeInTheDocument();
    expect(configuration).toBeInTheDocument();
    expect(await screen.findByRole("textbox", { name: "Copilot chat input" })).toHaveAttribute(
      "placeholder",
      "Message the selected model…",
    );
    expect(copilotChatProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ agentId: "token-boat-playground", throttleMs: 50 }),
    );
  });

  test("passes authenticated model settings to the CopilotKit runtime", async () => {
    renderPlayground();

    await screen.findByRole("textbox", { name: "Copilot chat input" });
    expect(copilotKitProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        headers: { Authorization: "Bearer session-access-token" },
        properties: {
          apiKeyId: 7,
          group: "default",
          maxTokens: 1024,
          model: "gpt-5",
          systemPrompt: "You are a helpful assistant.",
          temperature: 0.7,
        },
        runtimeUrl: "/pg/copilotkit",
        useSingleEndpoint: false,
      }),
    );
  });

  test("registers localized starter suggestions for the selected agent", async () => {
    renderPlayground();

    await screen.findByRole("textbox", { name: "Copilot chat input" });
    expect(suggestionConfigs).toHaveBeenLastCalledWith({
      available: "before-first-message",
      consumerAgentId: "token-boat-playground",
      suggestions: [
        {
          message: "Explain the strengths and limitations of this model.",
          title: "Explore model capabilities",
        },
        {
          message: "Create a concise implementation plan for a production feature.",
          title: "Draft an implementation plan",
        },
        {
          message: "Review a code snippet for correctness, security, and maintainability.",
          title: "Review code quality",
        },
      ],
    });
  });

  test("starts a fresh CopilotKit chat instance from New chat", async () => {
    renderPlayground();

    await screen.findByRole("textbox", { name: "Copilot chat input" });
    const firstInstance = document
      .querySelector("[data-copilot-instance]")
      ?.getAttribute("data-copilot-instance");
    expect(firstInstance).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "New chat" }));

    await waitFor(() => {
      expect(
        document.querySelector("[data-copilot-instance]")?.getAttribute("data-copilot-instance"),
      ).not.toBe(firstInstance);
    });
  });

  test("retries configuration loading without replacing the chat page", async () => {
    listPlaygroundModels.mockRejectedValueOnce(new Error("Model catalog unavailable"));
    renderPlayground();

    expect(await screen.findByText("Unable to load Playground configuration")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("combobox", { name: "Select a model" })).toHaveTextContent(
      "GPT-5",
    );
    expect(listPlaygroundModels).toHaveBeenCalledTimes(2);
  });

  test("preselects a permitted model passed from the model catalog", async () => {
    listApiKeys.mockResolvedValue([
      activeKey,
      {
        ...activeKey,
        id: 8,
        name: "Unrestricted production key",
        allowedModels: [],
      },
    ]);
    listPlaygroundModels.mockResolvedValue([
      { id: "gpt-5", label: "GPT-5", group: "default" },
      { id: "claude-sonnet", label: "Claude Sonnet", group: "default" },
    ]);

    renderPlayground("claude-sonnet");

    expect(await screen.findByRole("combobox", { name: "Select a model" })).toHaveTextContent(
      "Claude Sonnet",
    );
    expect(screen.getByRole("combobox", { name: "Select API key" })).toHaveTextContent(
      "Unrestricted production key",
    );
    expect(copilotKitProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({ apiKeyId: 8, model: "claude-sonnet" }),
      }),
    );
  });

  test("does not mount the AI runtime when no active API key exists", async () => {
    listApiKeys.mockResolvedValue([]);
    renderPlayground();

    expect(await screen.findByText("An active API key is required")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Copilot chat input" })).not.toBeInTheDocument();
    expect(copilotKitProps).not.toHaveBeenCalled();
  });
});

function renderPlayground(initialModel?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PlaygroundPage initialModel={initialModel} />
    </QueryClientProvider>,
  );
}
