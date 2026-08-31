import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ApiKeyRecord, UpdateApiKeyInput } from "@/data/contracts";
import { ApiKeysPage } from "../pages/api-keys-page";

const {
  createApiKey,
  getApiKeysPage,
  listApiKeyGroups,
  listPlaygroundModels,
  revokeApiKey,
  setApiKeyEnabled,
  updateApiKey,
} = vi.hoisted(() => ({
  createApiKey: vi.fn(),
  getApiKeysPage: vi.fn(),
  listApiKeyGroups: vi.fn(),
  listPlaygroundModels: vi.fn(),
  revokeApiKey: vi.fn(),
  setApiKeyEnabled: vi.fn(),
  updateApiKey: vi.fn(),
}));
const { toast } = vi.hoisted(() => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/data/repository", () => ({
  repository: {
    mode: "live",
    createApiKey,
    getApiKeysPage,
    listApiKeyGroups,
    listPlaygroundModels,
    revokeApiKey,
    setApiKeyEnabled,
    updateApiKey,
  },
}));

vi.mock("sonner", () => ({ toast }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, options?: Record<string, string | number>) =>
      Object.entries(options ?? {}).reduce(
        (value, [name, replacement]) => value.replace(`{{${name}}}`, String(replacement)),
        key,
      ),
  }),
}));

beforeEach(() => {
  createApiKey.mockReset();
  getApiKeysPage.mockReset();
  listApiKeyGroups.mockReset();
  listPlaygroundModels.mockReset();
  revokeApiKey.mockReset();
  setApiKeyEnabled.mockReset();
  updateApiKey.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
  listApiKeyGroups.mockResolvedValue([
    { value: "default", description: "Default routing", ratio: 1 },
    { value: "priority", description: "Priority routing", ratio: 2 },
  ]);
  listPlaygroundModels.mockImplementation(async (group: string) =>
    group === "priority"
      ? [{ id: "priority-model", label: "priority-model", group }]
      : [
          { id: "gpt-5", label: "gpt-5", group },
          { id: "claude-sonnet-4", label: "claude-sonnet-4", group },
        ],
  );
});

describe("API key details and editing", () => {
  test("opens complete credential, quota, model, and network details from the key name", async () => {
    getApiKeysPage.mockResolvedValue({ items: [apiKeyFixture()], page: 1, pageSize: 20, total: 1 });

    renderApiKeysPage();

    fireEvent.click(await screen.findByRole("button", { name: "Production app" }));
    const sheet = await screen.findByRole("dialog", { name: "API key details" });

    expect(sheet).toHaveAttribute("data-slot", "sheet-content");
    expect(sheet).toHaveTextContent("sk-prod••••••••a82f");
    expect(sheet).toHaveTextContent("7,500");
    expect(sheet).toHaveTextContent("2,500");
    expect(sheet).toHaveTextContent("gpt-5");
    expect(sheet).toHaveTextContent("claude-sonnet-4");
    expect(sheet).toHaveTextContent("203.0.113.0/24");
  });

  test("restores a shared key detail and clears the URL selection when closed", async () => {
    const apiKey = apiKeyFixture();
    getApiKeysPage.mockResolvedValue({ items: [apiKey], page: 1, pageSize: 20, total: 1 });
    const onSearchChange = vi.fn();

    renderApiKeysPage(
      <ApiKeysPage onSearchChange={onSearchChange} search={{ detail: apiKey.id }} />,
    );

    expect(await screen.findByRole("dialog", { name: "API key details" })).toHaveTextContent(
      "Production app",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onSearchChange).toHaveBeenCalledWith({ detail: undefined });
  });

  test("does not substitute another key when a shared key detail is unavailable", async () => {
    getApiKeysPage.mockResolvedValue({
      items: [apiKeyFixture()],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    const onSearchChange = vi.fn();

    renderApiKeysPage(<ApiKeysPage onSearchChange={onSearchChange} search={{ detail: 999 }} />);

    expect(await screen.findByText("API key details unavailable")).toBeVisible();
    expect(screen.queryByRole("dialog", { name: "API key details" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onSearchChange).toHaveBeenCalledWith({ detail: undefined });
  });

  test("edits an existing key through the current token update contract", async () => {
    const apiKey = apiKeyFixture();
    let serverRecord = apiKey;
    getApiKeysPage.mockImplementation(async () => ({
      items: [serverRecord],
      page: 1,
      pageSize: 20,
      total: 1,
    }));
    updateApiKey.mockImplementation(async (input: UpdateApiKeyInput) => {
      serverRecord = {
        ...apiKey,
        name: input.name,
        remainingQuota: input.remainingQuota,
      };
      return serverRecord;
    });

    renderApiKeysPage();

    fireEvent.click(await screen.findByRole("button", { name: "Production app" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit settings" }));
    const editDialog = await screen.findByRole("dialog", { name: "Edit API key" });
    const nameInput = within(editDialog).getByLabelText("Name");
    fireEvent.change(nameInput, { target: { value: "Production gateway" } });
    const saveButton = within(editDialog).getByRole("button", { name: "Save changes" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(updateApiKey.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          id: 1,
          name: "Production gateway",
          remainingQuota: 7500,
          group: "default",
          allowedModels: ["gpt-5", "claude-sonnet-4"],
          allowedIps: ["203.0.113.0/24"],
        }),
      ),
    );
    expect((await screen.findAllByText("Production gateway")).length).toBeGreaterThan(0);
  });

  test("opens the editor directly from the table action without requiring the details sheet", async () => {
    getApiKeysPage.mockResolvedValue({
      items: [apiKeyFixture()],
      page: 1,
      pageSize: 20,
      total: 1,
    });

    renderApiKeysPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit Production app" }));
    const editDialog = await screen.findByRole("dialog", { name: "Edit API key" });
    expect(within(editDialog).getByLabelText("Name")).toHaveValue("Production app");
    expect(screen.queryByRole("dialog", { name: "API key details" })).not.toBeInTheDocument();
  });

  test("keeps unrelated key switches interactive while one row is updating", async () => {
    getApiKeysPage.mockResolvedValue({
      items: [apiKeyFixture(), { ...apiKeyFixture(), id: 2, name: "Staging app" }],
      page: 1,
      pageSize: 20,
      total: 2,
    });
    setApiKeyEnabled.mockImplementation(() => new Promise(() => undefined));

    renderApiKeysPage();

    const switches = await screen.findAllByRole("switch", { name: "Disable API key" });
    fireEvent.click(switches[0]!);

    await waitFor(() => expect(switches[0]).toHaveAttribute("aria-disabled", "true"));
    expect(switches[1]).not.toHaveAttribute("aria-disabled", "true");
  });

  test("locks the revoke confirmation until the key is removed", async () => {
    let records = [apiKeyFixture()];
    let resolveRevoke!: () => void;
    getApiKeysPage.mockImplementation(async () => ({
      items: records,
      page: 1,
      pageSize: 20,
      total: records.length,
    }));
    revokeApiKey.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRevoke = () => {
            records = [];
            resolve();
          };
        }),
    );

    renderApiKeysPage();

    fireEvent.click(await screen.findByRole("button", { name: "Revoke API key" }));
    const confirmation = await screen.findByRole("alertdialog");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Revoke" }));

    await waitFor(() => {
      expect(within(confirmation).getByRole("button", { name: "Revoke" })).toBeDisabled();
      expect(within(confirmation).getByRole("button", { name: "Cancel" })).toBeDisabled();
    });

    await act(async () => resolveRevoke());
    await waitFor(() => expect(screen.queryByText("Production app")).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith("API key revoked");
  });

  test("distinguishes an API failure from an empty key list", async () => {
    getApiKeysPage.mockRejectedValue(new Error("offline"));

    renderApiKeysPage();

    expect(await screen.findByText("Unable to load API keys")).toBeInTheDocument();
    expect(screen.queryByText("No API keys yet")).not.toBeInTheDocument();
  });

  test("preserves API key table headers while data is loading", async () => {
    let resolveKeys!: (value: {
      items: ApiKeyRecord[];
      page: number;
      pageSize: number;
      total: number;
    }) => void;
    getApiKeysPage.mockReturnValue(
      new Promise((resolve) => {
        resolveKeys = resolve;
      }),
    );

    renderApiKeysPage();

    expect(screen.getByRole("columnheader", { name: "Key" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Quota" })).toBeInTheDocument();
    expect(screen.getAllByLabelText("Loading")).toHaveLength(3);
    expect(screen.queryByText("No API keys yet")).not.toBeInTheDocument();

    await act(async () => {
      resolveKeys({ items: [], page: 1, pageSize: 20, total: 0 });
    });
    expect(await screen.findByText("No API keys yet")).toBeVisible();
  });

  test("reports one-time secret clipboard failures", async () => {
    const apiKey = apiKeyFixture();
    getApiKeysPage.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    createApiKey.mockResolvedValue({ record: apiKey, secret: "sk-created-secret" });
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderApiKeysPage(<ApiKeysPage defaultGroup="default" />);

    fireEvent.click(await screen.findByRole("button", { name: "Create key" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New app" } });
    const createButton = within(screen.getByRole("dialog")).getByRole("button", {
      name: "Create key",
    });
    await waitFor(() => expect(createButton).toBeEnabled());
    fireEvent.click(createButton);
    fireEvent.click(await screen.findByRole("button", { name: "Copy API key" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Unable to copy API key"));
    expect(toast.success).not.toHaveBeenCalledWith("API key copied");
  });

  test("selects an allowed group and searchable model instead of accepting arbitrary text", async () => {
    const apiKey = apiKeyFixture();
    getApiKeysPage.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    createApiKey.mockResolvedValue({ record: apiKey, secret: "sk-created-secret" });

    renderApiKeysPage(<ApiKeysPage defaultGroup="default" />);

    fireEvent.click(await screen.findByRole("button", { name: "Create key" }));
    const dialog = await screen.findByRole("dialog", { name: "Create API key" });
    const groupSelect = within(dialog).getByRole("combobox", { name: "Group" });
    expect(groupSelect).not.toHaveAttribute("contenteditable", "true");
    await waitFor(() => expect(groupSelect).toBeEnabled());
    fireEvent.click(groupSelect);
    const priorityOption = await screen.findByRole("option", { name: /priority/i });
    fireEvent.pointerDown(priorityOption);
    fireEvent.pointerUp(priorityOption);
    fireEvent.click(priorityOption);

    await waitFor(() => expect(listPlaygroundModels).toHaveBeenCalledWith("priority"));
    const modelSelect = within(dialog).getByRole("combobox", { name: "Allowed models" });
    await waitFor(() => expect(modelSelect).toBeEnabled());
    fireEvent.click(modelSelect);
    fireEvent.click(await screen.findByRole("option", { name: "priority-model" }));
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "New app" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create key" }));

    await waitFor(() =>
      expect(createApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          group: "priority",
          allowedModels: ["priority-model"],
        }),
      ),
    );
  });
});

function renderApiKeysPage(page: ReactElement = <ApiKeysPage />) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{page}</QueryClientProvider>);
}

function apiKeyFixture(): ApiKeyRecord {
  return {
    id: 1,
    name: "Production app",
    maskedKey: "sk-prod••••••••a82f",
    status: "active",
    createdAt: 1_754_000_000,
    lastUsedAt: 1_754_086_400,
    expiresAt: 1_764_000_000,
    unlimitedQuota: false,
    remainingQuota: 7500,
    usedQuota: 2500,
    group: "default",
    environment: "production",
    allowedModels: ["gpt-5", "claude-sonnet-4"],
    allowedIps: ["203.0.113.0/24"],
  };
}
