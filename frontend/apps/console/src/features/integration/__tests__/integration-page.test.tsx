import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ApiKeyRecord, IntegrationData, UpdateApiKeyInput } from "@/data/contracts";
import { IntegrationPage } from "../pages/integration-page";

const { getIntegration, listApiKeyGroups, listApiKeys, listPlaygroundModels, updateApiKey } =
  vi.hoisted(() => ({
    getIntegration: vi.fn(),
    listApiKeyGroups: vi.fn(),
    listApiKeys: vi.fn(),
    listPlaygroundModels: vi.fn(),
    updateApiKey: vi.fn(),
  }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children?: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/data/repository", () => ({
  repository: {
    mode: "live",
    getIntegration,
    listApiKeyGroups,
    listApiKeys,
    listPlaygroundModels,
    updateApiKey,
  },
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

beforeEach(() => {
  getIntegration.mockReset();
  listApiKeyGroups.mockReset();
  listApiKeys.mockReset();
  listPlaygroundModels.mockReset();
  updateApiKey.mockReset();
  getIntegration.mockResolvedValue(integrationFixture());
  listApiKeyGroups.mockResolvedValue([
    { value: "priority", description: "Priority routing", ratio: 1 },
  ]);
  listApiKeys.mockResolvedValue([activeKey]);
  listPlaygroundModels.mockResolvedValue([
    { id: "xiaomi/mimo-v2.5-pro", label: "MiMo V2.5 Pro", group: "priority" },
    { id: "blocked-model", label: "Blocked model", group: "priority" },
  ]);
  updateApiKey.mockImplementation(async (input: UpdateApiKeyInput) => ({
    ...activeKey,
    ...input,
  }));
});

describe("IntegrationPage", () => {
  test("generates exact first-request code from the live environment and key policy", async () => {
    renderIntegrationPage();

    expect(await screen.findByText("Production key")).toBeVisible();
    await waitFor(() => expect(listPlaygroundModels).toHaveBeenCalledWith("priority"));

    const code = document.querySelector("pre code")?.textContent ?? "";
    expect(code).toContain("http://127.0.0.1:4173/v1/chat/completions");
    expect(code).toContain('"model":"xiaomi/mimo-v2.5-pro"');
    expect(code).not.toContain("api.example.com");
    expect(code).not.toContain("gpt-5");
    expect(screen.queryByText("Blocked model")).not.toBeInTheDocument();
    expect(screen.getByText("API environment reachable")).toBeVisible();
    expect(screen.getAllByText("Ready")).toHaveLength(3);
  });

  test("does not generate copyable production code without an active key", async () => {
    listApiKeys.mockResolvedValue([{ ...activeKey, status: "disabled" }]);

    renderIntegrationPage();

    expect(await screen.findByText("An active API key is required")).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy code" })).toBeDisabled();
    expect(listPlaygroundModels).not.toHaveBeenCalled();
    expect(screen.getByText("Needs attention")).toBeVisible();
  });

  test("reports reachability without inventing an operational health state", async () => {
    getIntegration.mockResolvedValue(integrationFixture());

    renderIntegrationPage();

    expect(await screen.findByText("Reachable")).toBeVisible();
    expect(screen.queryByText("Operational")).not.toBeInTheDocument();
  });

  test("does not present a failed integration contract as an empty endpoint catalog", async () => {
    getIntegration.mockRejectedValue(new Error("offline"));

    renderIntegrationPage();

    expect(await screen.findByText("Unable to load integration environment")).toBeVisible();
    expect(screen.queryByText("No endpoints available")).not.toBeInTheDocument();
    expect(screen.queryByText("First request")).not.toBeInTheDocument();
  });

  test("preserves the endpoint table structure while integration data is loading", async () => {
    let resolveIntegration!: (value: IntegrationData) => void;
    getIntegration.mockReturnValue(
      new Promise((resolve) => {
        resolveIntegration = resolve;
      }),
    );

    renderIntegrationPage();

    expect(screen.getByRole("columnheader", { name: "Endpoint" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Capability" })).toBeInTheDocument();
    expect(screen.getAllByLabelText("Loading")).toHaveLength(3);
    expect(screen.queryByText("No endpoints available")).not.toBeInTheDocument();

    await act(async () => {
      resolveIntegration(integrationFixture());
    });
    expect(await screen.findByText("/v1/chat/completions")).toBeVisible();
  });

  test("keeps an unavailable API key check distinct from having no active key", async () => {
    listApiKeys.mockRejectedValue(new Error("offline"));

    renderIntegrationPage();

    expect(await screen.findByText("Check unavailable")).toBeVisible();
    expect(screen.getByText("Unable to load API keys")).toBeVisible();
    expect(screen.queryByText("An active API key is required")).not.toBeInTheDocument();
  });

  test("keeps the last usable key and model visible when a background refresh fails", async () => {
    listApiKeys.mockRejectedValue(new Error("temporary key refresh failure"));
    listPlaygroundModels.mockRejectedValue(new Error("temporary model refresh failure"));

    renderIntegrationPage((queryClient) => {
      queryClient.setQueryData(["api-keys"], [activeKey]);
      queryClient.setQueryData(
        ["playground-models", "priority"],
        [{ id: "xiaomi/mimo-v2.5-pro", label: "MiMo V2.5 Pro", group: "priority" }],
      );
    });

    expect(await screen.findByText("Production key")).toBeVisible();
    await waitFor(() => expect(listApiKeys).toHaveBeenCalled());
    await waitFor(() => expect(listPlaygroundModels).toHaveBeenCalled());
    expect(screen.queryByText("Unable to load API keys")).not.toBeInTheDocument();
    expect(screen.queryByText("Unable to load permitted models")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy code" })).toBeEnabled();
  });

  test("edits the selected key without leaving the integration workflow", async () => {
    renderIntegrationPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit settings" }));
    const editDialog = await screen.findByRole("dialog", { name: "Edit API key" });
    fireEvent.change(within(editDialog).getByLabelText("Name"), {
      target: { value: "Production gateway" },
    });
    const saveButton = within(editDialog).getByRole("button", { name: "Save changes" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(updateApiKey.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ id: 42, name: "Production gateway", group: "priority" }),
      ),
    );
  });

  test("deduplicates key updates and releases the lock after a failed save", async () => {
    let rejectUpdate!: (reason: Error) => void;
    updateApiKey
      .mockImplementationOnce(
        () =>
          new Promise<ApiKeyRecord>((_resolve, reject) => {
            rejectUpdate = reject;
          }),
      )
      .mockImplementationOnce(async (input: UpdateApiKeyInput) => ({ ...activeKey, ...input }));
    renderIntegrationPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit settings" }));
    const editDialog = await screen.findByRole("dialog", { name: "Edit API key" });
    fireEvent.change(within(editDialog).getByLabelText("Name"), {
      target: { value: "Production gateway" },
    });
    const saveButton = within(editDialog).getByRole("button", { name: "Save changes" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    act(() => {
      saveButton.click();
      saveButton.click();
    });

    await waitFor(() => expect(updateApiKey).toHaveBeenCalledTimes(1));
    await act(async () => rejectUpdate(new Error("offline")));
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(updateApiKey).toHaveBeenCalledTimes(2));
  });
});

function renderIntegrationPage(configure?: (queryClient: QueryClient) => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  configure?.(queryClient);
  return render(
    <QueryClientProvider client={queryClient}>
      <IntegrationPage />
    </QueryClientProvider>,
  );
}

const activeKey: ApiKeyRecord = {
  id: 42,
  name: "Production key",
  maskedKey: "sk-live-••••1234",
  status: "active",
  createdAt: 1,
  lastUsedAt: null,
  expiresAt: null,
  unlimitedQuota: false,
  remainingQuotaUsd: 20,
  usedQuotaUsd: 1,
  group: "priority",
  environment: "production",
  allowedModels: ["xiaomi/mimo-v2.5-pro"],
  allowedIps: [],
};

function integrationFixture(overrides: Partial<IntegrationData> = {}): IntegrationData {
  return {
    baseUrl: "http://127.0.0.1:4173/v1/",
    apiVersion: null,
    region: null,
    serviceStatus: "reachable",
    endpoints: [
      {
        name: "Chat Completions",
        method: "POST",
        path: "/v1/chat/completions",
        description: "OpenAI-compatible text and multimodal chat.",
      },
    ],
    ...overrides,
  };
}
