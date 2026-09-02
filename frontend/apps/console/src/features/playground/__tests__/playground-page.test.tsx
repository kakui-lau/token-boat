import { useRef, type ComponentType, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ApiKeyRecord } from "@/data/contracts";
import { PlaygroundPage } from "../pages/playground-page";
import { getPlaygroundStorageKey } from "../playground-local-storage";

const {
  listApiKeys,
  listPlaygroundModels,
  copilotKitProps,
  copilotChatProps,
  copilotMountSequence,
  agentSubscriber,
  suggestionConfigs,
} = vi.hoisted(() => ({
  listApiKeys: vi.fn(),
  listPlaygroundModels: vi.fn(),
  copilotKitProps: vi.fn(),
  copilotChatProps: vi.fn(),
  copilotMountSequence: { current: 0 },
  agentSubscriber: {
    current: null as null | {
      onRunFinishedEvent?(input: { outcome: "success"; result: unknown }): void;
      onRunErrorEvent?(input: { event: { message: string } }): void;
      onRunFailed?(input: { error: Error }): void;
      onRunFinalized?(input: {
        messages: Array<{ id: string; role: string; content: unknown }>;
      }): void;
      onRunInitialized?(input: {
        messages: Array<{ id: string; role: string; content: unknown }>;
      }): unknown;
      onTextMessageStartEvent?(): void;
    },
  },
  suggestionConfigs: vi.fn(),
}));

vi.mock("@/app/session/session-context", () => ({
  useSession: () => ({
    session: { accessToken: "session-access-token", user: { id: 12 } },
  }),
}));

vi.mock("@/data/repository", () => ({
  repository: {
    mode: "live",
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
  CopilotChatAssistantMessage: Object.assign(
    ({
      additionalToolbarItems,
      message,
    }: {
      additionalToolbarItems?: ReactNode;
      message: { content?: string };
    }) => (
      <div data-testid="assistant-message">
        {message.content}
        {additionalToolbarItems}
      </div>
    ),
    {},
  ),
  CopilotKit: (props: {
    children: ReactNode;
    headers: Record<string, string>;
    properties: Record<string, unknown>;
    runtimeUrl: string;
    useSingleEndpoint: boolean;
  }) => {
    const instanceIdRef = useRef("");
    if (!instanceIdRef.current) {
      copilotMountSequence.current += 1;
      instanceIdRef.current = String(copilotMountSequence.current);
    }
    copilotKitProps(props);
    return (
      <div data-copilot-instance={instanceIdRef.current} data-runtime-url={props.runtimeUrl}>
        {props.children}
      </div>
    );
  },
  CopilotChatInput: ({ onSubmitMessage }: { onSubmitMessage?(value: string): void }) => (
    <button onClick={() => onSubmitMessage?.("Test prompt")} type="button">
      Submit mock message
    </button>
  ),
  CopilotChatSuggestionView: Object.assign(
    ({ className }: { className?: string }) => <div className={className}>Suggestions</div>,
    {},
  ),
  CopilotChat: (props: {
    agentId: string;
    input: ComponentType<{ onSubmitMessage?(value: string): void }>;
    labels: Record<string, string>;
    messageView?: {
      assistantMessage?: ComponentType<{
        additionalToolbarItems?: ReactNode;
        message: { id: string; role: "assistant"; content: string };
        messages: Array<{ id: string; role: "assistant"; content: string }>;
      }>;
    };
    threadId: string;
  }) => {
    copilotChatProps(props);
    const Input = props.input;
    const AssistantMessage = props.messageView?.assistantMessage;
    const assistant = { id: "assistant-live", role: "assistant" as const, content: "Reply" };
    return (
      <>
        <textarea
          aria-label="Copilot chat input"
          data-thread-id={props.threadId}
          placeholder={props.labels.chatInputPlaceholder}
        />
        {AssistantMessage ? <AssistantMessage message={assistant} messages={[assistant]} /> : null}
        <Input onSubmitMessage={() => undefined} />
      </>
    );
  },
  useAgent: () => ({
    agent: {
      messages: [],
      subscribe: (subscriber: (typeof agentSubscriber)["current"]) => {
        agentSubscriber.current = subscriber;
        return { unsubscribe: vi.fn() };
      },
    },
    isReady: true,
  }),
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
  remainingQuotaUsd: 24,
  usedQuotaUsd: 1,
  group: "default",
  environment: "development",
  allowedModels: ["gpt-5"],
  allowedIps: [],
};

beforeEach(() => {
  window.localStorage.clear();
  listApiKeys.mockReset();
  listPlaygroundModels.mockReset();
  copilotKitProps.mockReset();
  copilotChatProps.mockReset();
  copilotMountSequence.current = 0;
  agentSubscriber.current = null;
  suggestionConfigs.mockReset();
  listApiKeys.mockResolvedValue([activeKey]);
  window.localStorage.setItem(
    getPlaygroundStorageKey(12),
    JSON.stringify({
      version: 1,
      conversations: [
        {
          id: "thread-existing",
          title: "Existing conversation",
          apiKeyId: 7,
          group: "default",
          model: "gpt-5",
          messages: [],
          createdAt: 1,
          updatedAt: 2,
        },
      ],
    }),
  );
  listPlaygroundModels.mockResolvedValue([
    { id: "gpt-5", label: "GPT-5", group: "default" },
    { id: "blocked-model", label: "Blocked model", group: "default" },
  ]);
});

describe("PlaygroundPage", () => {
  test("does not mount the Copilot runtime before a local conversation exists", async () => {
    window.localStorage.clear();
    renderPlayground();

    expect(await screen.findByText("Start a conversation")).toBeInTheDocument();
    expect(copilotKitProps).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: "New chat" })[0]!);
    expect(await screen.findByRole("textbox", { name: "Copilot chat input" })).toBeInTheDocument();
    expect(copilotKitProps).toHaveBeenCalledTimes(1);
  });

  test("renders CopilotChat with the active key's permitted model", async () => {
    renderPlayground();

    const configuration = screen.getByRole("group", { name: "Playground configuration" });
    expect(await screen.findByRole("combobox", { name: "Select API key" })).toHaveTextContent(
      "Development key",
    );
    expect(await screen.findByRole("combobox", { name: "Select a model" })).toHaveTextContent(
      "GPT-5",
    );
    expect(screen.queryByText("Blocked model")).not.toBeInTheDocument();
    expect(screen.getByText("$24.00 remaining")).toBeInTheDocument();
    expect(configuration).toBeInTheDocument();
    expect(await screen.findByRole("textbox", { name: "Copilot chat input" })).toHaveAttribute(
      "placeholder",
      "Message the selected model…",
    );
    expect(copilotChatProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        agentId: "token-boat-playground",
        threadId: "thread-existing",
        throttleMs: 50,
      }),
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
          localMessages: [],
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

  test("saves finalized Copilot messages in browser-local history", async () => {
    renderPlayground();

    await screen.findByRole("textbox", { name: "Copilot chat input" });
    fireEvent.click(screen.getByRole("button", { name: "Submit mock message" }));
    act(() => {
      agentSubscriber.current?.onRunFinalized?.({
        messages: [
          { id: "user-local", role: "user", content: "Keep this in my browser" },
          { id: "assistant-local", role: "assistant", content: "Saved locally" },
          { id: "system-hidden", role: "system", content: "Do not persist this" },
        ],
      });
    });

    await waitFor(() => {
      const serialized = window.localStorage.getItem(getPlaygroundStorageKey(12));
      expect(serialized).toContain("Keep this in my browser");
      expect(serialized).toContain("Saved locally");
      expect(serialized).not.toContain("Do not persist this");
    });
    expect(copilotKitProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ properties: expect.objectContaining({ localMessages: [] }) }),
    );
  });

  test("shows a stable inline error when a model run fails", async () => {
    renderPlayground();

    await screen.findByRole("textbox", { name: "Copilot chat input" });
    act(() => {
      agentSubscriber.current?.onRunErrorEvent?.({
        event: { message: "upstream returned no visible assistant content" },
      });
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Request failed");
    expect(screen.getByRole("alert")).toHaveTextContent("Try again without leaving this page.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("upstream");
  });

  test("restores browser-local messages when CopilotKit initializes the thread", async () => {
    window.localStorage.setItem(
      getPlaygroundStorageKey(12),
      JSON.stringify({
        version: 1,
        conversations: [
          {
            id: "thread-existing",
            title: "Saved conversation",
            apiKeyId: 7,
            group: "default",
            model: "gpt-5",
            messages: [
              { id: "user-saved", role: "user", content: "Saved prompt" },
              { id: "assistant-saved", role: "assistant", content: "Saved reply" },
            ],
            createdAt: 1,
            updatedAt: 2,
          },
        ],
      }),
    );
    renderPlayground();

    await screen.findByRole("textbox", { name: "Copilot chat input" });
    expect(agentSubscriber.current?.onRunInitialized?.({ messages: [] })).toEqual({
      messages: [
        { id: "user-saved", role: "user", content: "Saved prompt" },
        { id: "assistant-saved", role: "assistant", content: "Saved reply" },
      ],
    });
  });

  test("shows and persists exact reply usage returned by the Playground runtime", async () => {
    renderPlayground();

    await screen.findByRole("textbox", { name: "Copilot chat input" });
    act(() => {
      agentSubscriber.current?.onRunFinishedEvent?.({
        outcome: "success",
        result: {
          messageId: "assistant-live",
          model: "gpt-5",
          inputTokens: 14,
          outputTokens: 230,
          latencyMs: 10_741,
        },
      });
    });
    act(() => {
      agentSubscriber.current?.onRunFinalized?.({
        messages: [
          { id: "user-live", role: "user", content: "Hello" },
          { id: "assistant-live", role: "assistant", content: "Reply" },
        ],
      });
    });

    const assistantMessage = await screen.findByTestId("assistant-message");
    expect(assistantMessage).toHaveTextContent("gpt-5");
    expect(assistantMessage).toHaveTextContent("Input: 14");
    expect(assistantMessage).toHaveTextContent("Output: 230");
    expect(assistantMessage).toHaveTextContent("10,741 ms");
    await waitFor(() => {
      expect(window.localStorage.getItem(getPlaygroundStorageKey(12))).toContain(
        '"inputTokens":14',
      );
    });
  });

  test("creates a browser-local thread with an isolated CopilotKit provider", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000002");
    renderPlayground();

    await screen.findByRole("textbox", { name: "Copilot chat input" });
    const firstInstance = document
      .querySelector("[data-copilot-instance]")
      ?.getAttribute("data-copilot-instance");
    expect(firstInstance).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "New chat" })[0]!);

    await waitFor(() => {
      expect(
        document.querySelector("[data-copilot-instance]")?.getAttribute("data-copilot-instance"),
      ).not.toBe(firstInstance);
    });
    expect(screen.getByRole("textbox", { name: "Copilot chat input" })).toHaveAttribute(
      "data-thread-id",
      "00000000000040008000000000000002",
    );
    expect(window.localStorage.getItem(getPlaygroundStorageKey(12))).toContain(
      "00000000000040008000000000000002",
    );
  });

  test("retries configuration loading without replacing the chat page", async () => {
    listPlaygroundModels.mockRejectedValueOnce(new Error("Model catalog unavailable"));
    renderPlayground();

    expect(await screen.findByText("Unable to load Playground")).toBeInTheDocument();
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
    fireEvent.click(screen.getAllByRole("button", { name: "New chat" })[0]!);
    await screen.findByRole("textbox", { name: "Copilot chat input" });
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
