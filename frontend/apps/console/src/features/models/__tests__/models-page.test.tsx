import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ModelCatalogItem } from "@/data/contracts";
import type { ModelSearch } from "@/lib/list-search";
import { ModelsPage } from "../pages/models-page";

const { listModelCatalog } = vi.hoisted(() => ({ listModelCatalog: vi.fn() }));

vi.mock("@/app/session/session-context", () => ({
  useSession: () => ({ session: { user: { group: "priority" } } }),
}));

vi.mock("@/data/repository", () => ({ repository: { listModelCatalog } }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    search,
    to,
    ...props
  }: {
    children?: ReactNode;
    search?: { model?: string };
    to: string;
  }) => (
    <a href={search?.model ? `${to}?model=${encodeURIComponent(search.model)}` : to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, options?: Record<string, string>) =>
      Object.entries(options ?? {}).reduce(
        (value, [name, replacement]) => value.replace(`{{${name}}}`, replacement),
        key,
      ),
  }),
}));

beforeEach(() => listModelCatalog.mockReset());

describe("ModelsPage", () => {
  test("shows the account price group and clears URL-backed filters", async () => {
    listModelCatalog.mockResolvedValue([modelFixture()]);
    const onSearchChange = vi.fn();

    renderModelsPage(
      <ModelsPage onSearchChange={onSearchChange} search={{ family: "video", q: "missing" }} />,
    );

    expect(await screen.findByText("No matching models")).toBeVisible();
    expect(screen.getByText("Group: priority")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onSearchChange).toHaveBeenCalledWith({
      availability: undefined,
      detail: undefined,
      family: undefined,
      q: undefined,
    });
  });

  test("summarizes only model facts returned by the current catalog", async () => {
    const unpricedModel = modelFixture();
    unpricedModel.id = "anthropic/unpriced";
    unpricedModel.family = "reasoning";
    unpricedModel.pricingAvailable = false;
    unpricedModel.accountPrice = null;
    unpricedModel.inputPrice = null;
    unpricedModel.outputPrice = null;
    listModelCatalog.mockResolvedValue([modelFixture(), unpricedModel]);

    renderModelsPage(<ModelsPage />);

    const availableCard = (await screen.findByText("Available models")).closest(
      '[data-slot="card"]',
    );
    const pricedCard = screen.getByText("Priced models").closest('[data-slot="card"]');
    const typesCard = screen.getByText("Model types").closest('[data-slot="card"]');
    expect(availableCard).toHaveTextContent("2");
    expect(pricedCard).toHaveTextContent("1");
    expect(typesCard).toHaveTextContent("2");
    expect(screen.queryByText("Before every request")).not.toBeInTheDocument();
  });

  test("sorts every model catalog column and defaults to model name ascending", async () => {
    const alpha = modelFixture();
    alpha.id = "alpha/model";
    alpha.family = "video";
    alpha.contextWindow = 200_000;
    alpha.features = ["Tool calling", "Vision"];
    const zeta = modelFixture();
    zeta.id = "zeta/model";
    zeta.available = false;
    zeta.availabilityStatus = "unavailable";
    zeta.contextWindow = 100_000;
    zeta.family = "chat";
    zeta.features = ["Audio"];
    zeta.inputPrice = 1;
    zeta.outputPrice = 5;
    listModelCatalog.mockResolvedValue([zeta, alpha]);

    renderModelsPage(<ModelsPageHarness initialSearch={{ availability: "all" }} />);

    const table = await screen.findByRole("table", { name: "Model catalog" });
    await within(table).findByRole("button", { name: "alpha/model" });
    const modelNames = () =>
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("button")[0]?.textContent?.trim());

    expect(modelNames()).toEqual(["alpha/model", "zeta/model"]);
    expect(within(table).getByRole("columnheader", { name: "Model" })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(within(table).getAllByRole("columnheader")).toHaveLength(7);
    expect(within(table).getAllByRole("button", { name: /.+/ })).toEqual(
      expect.arrayContaining([
        within(table).getByRole("button", { name: "Model" }),
        within(table).getByRole("button", { name: "Type" }),
        within(table).getByRole("button", { name: "Context" }),
        within(table).getByRole("button", { name: "Input price" }),
        within(table).getByRole("button", { name: "Output price" }),
        within(table).getByRole("button", { name: "Capabilities" }),
        within(table).getByRole("button", { name: "Status" }),
      ]),
    );

    for (const column of ["Type", "Context", "Input price", "Output price", "Capabilities"]) {
      const sortButton = within(table).getByRole("button", { name: column });
      fireEvent.click(sortButton);
      expect(modelNames()).toEqual(["zeta/model", "alpha/model"]);
      expect(within(table).getByRole("columnheader", { name: column })).toHaveAttribute(
        "aria-sort",
        "ascending",
      );

      fireEvent.click(sortButton);
      expect(modelNames()).toEqual(["alpha/model", "zeta/model"]);
      expect(within(table).getByRole("columnheader", { name: column })).toHaveAttribute(
        "aria-sort",
        "descending",
      );
    }

    const statusButton = within(table).getByRole("button", { name: "Status" });
    fireEvent.click(statusButton);
    expect(modelNames()).toEqual(["alpha/model", "zeta/model"]);
    fireEvent.click(statusButton);
    expect(modelNames()).toEqual(["zeta/model", "alpha/model"]);
  });

  test("keeps unknown numeric model facts last in both sort directions", async () => {
    const known = modelFixture();
    known.id = "known/model";
    const unknown = modelFixture();
    unknown.id = "unknown/model";
    unknown.contextWindow = null;
    unknown.inputPrice = null;
    unknown.outputPrice = null;
    listModelCatalog.mockResolvedValue([unknown, known]);

    renderModelsPage(<ModelsPage />);

    const table = await screen.findByRole("table", { name: "Model catalog" });
    const modelNames = () =>
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("button")[0]?.textContent?.trim());

    for (const column of ["Context", "Input price", "Output price"]) {
      const sortButton = within(table).getByRole("button", { name: column });
      fireEvent.click(sortButton);
      expect(modelNames()).toEqual(["known/model", "unknown/model"]);
      fireEvent.click(sortButton);
      expect(modelNames()).toEqual(["known/model", "unknown/model"]);
    }
  });

  test("restores a shared model detail URL and clears it when the dialog closes", async () => {
    listModelCatalog.mockResolvedValue([modelFixture()]);
    const onSearchChange = vi.fn();

    renderModelsPage(
      <ModelsPage onSearchChange={onSearchChange} search={{ detail: "anthropic/claude-sonnet" }} />,
    );

    expect(await screen.findByRole("dialog")).toHaveTextContent("anthropic/claude-sonnet");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onSearchChange).toHaveBeenCalledWith({ detail: undefined });
  });

  test("explains when a shared model detail is no longer in the account catalog", async () => {
    listModelCatalog.mockResolvedValue([modelFixture()]);
    const onSearchChange = vi.fn();

    renderModelsPage(
      <ModelsPage onSearchChange={onSearchChange} search={{ detail: "removed/model" }} />,
    );

    expect(await screen.findByText("Selected model unavailable")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onSearchChange).toHaveBeenCalledWith({ detail: undefined });
  });

  test("links an available model into Playground with its model ID", async () => {
    listModelCatalog.mockResolvedValue([modelFixture()]);

    renderModelsPage(<ModelsPage />);

    await screen.findByText("anthropic/claude-sonnet");
    const actions = screen.getAllByRole("button", { name: "Test in Playground" });
    expect(actions[1]).toHaveAttribute("href", "/playground?model=anthropic%2Fclaude-sonnet");
  });

  test("uses compact row action icons without shrinking their button targets", async () => {
    listModelCatalog.mockResolvedValue([modelFixture()]);

    renderModelsPage(<ModelsPage />);

    const copyAction = await screen.findByRole("button", { name: "Copy model ID" });
    const playgroundActions = screen.getAllByRole("button", { name: "Test in Playground" });
    const playgroundAction = playgroundActions[1];

    expect(copyAction).toHaveClass("size-7");
    expect(playgroundAction).toHaveClass("size-7");
    expect(copyAction.querySelector("svg")).toHaveClass("size-3.5");
    expect(playgroundAction?.querySelector("svg")).toHaveClass("size-3.5");
  });

  test("exposes the exact table price through a shadcn tooltip trigger", async () => {
    listModelCatalog.mockResolvedValue([modelFixture()]);

    renderModelsPage(<ModelsPage />);

    const inputPrice = await screen.findByLabelText("$3.00000 per 1M tokens");
    expect(inputPrice).toHaveTextContent("$3.00/1M");
    expect(inputPrice).toHaveAttribute("data-slot", "tooltip-trigger");
  });

  test("keeps loading failures distinct from empty results and retries", async () => {
    listModelCatalog
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([modelFixture()]);

    renderModelsPage(<ModelsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(listModelCatalog).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("anthropic/claude-sonnet")).toBeVisible();
  });

  test("keeps model table context visible while the catalog is loading", async () => {
    let resolveCatalog: (models: ModelCatalogItem[]) => void = () => {};
    listModelCatalog.mockReturnValue(
      new Promise<ModelCatalogItem[]>((resolve) => {
        resolveCatalog = resolve;
      }),
    );

    renderModelsPage(<ModelsPage />);

    expect(screen.getByRole("columnheader", { name: "Model" })).toBeVisible();
    expect(screen.getAllByRole("row", { name: "Loading" })).toHaveLength(3);
    expect(screen.queryByText("No models available")).not.toBeInTheDocument();

    resolveCatalog([]);
    expect(await screen.findByText("No models available")).toBeVisible();
  });

  test("opens complete model metadata and every account price component from the model name", async () => {
    listModelCatalog.mockResolvedValue([modelFixture()]);

    renderModelsPage(<ModelsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "anthropic/claude-sonnet" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Anthropic");
    expect(dialog).toHaveTextContent("Balanced model for production workloads.");
    expect(dialog).toHaveTextContent("8,192");
    expect(
      screen.getByRole("link", { name: "Open official model limits documentation" }),
    ).toHaveAttribute("href", "https://vendor.example/models/claude-sonnet");
    expect(dialog).toHaveTextContent("priority");
    expect(dialog).toHaveTextContent("Input tokens / million tokens");
    expect(dialog).toHaveTextContent("3 USD");
    expect(dialog).toHaveTextContent("15 USD");
    expect(dialog).toHaveTextContent("Cache read");
    expect(dialog).toHaveTextContent("0.3 USD");
    expect(dialog).toHaveTextContent("3.125 USD");
    expect(dialog).toHaveTextContent("Official reference: 3.2 USD");
    expect(dialog).toHaveTextContent("OpenAI compatible");
    expect(dialog).toHaveTextContent("Tool calling");
    expect(dialog).toHaveTextContent("Structured output");
  });

  test("groups token prices into context tiers with component matrices", async () => {
    const model = modelFixture();
    model.accountPrice = {
      ...model.accountPrice!,
      priceStructure: "tiered",
      items: [
        {
          ...priceItem("token_input", 5),
          key: "standard-input",
          tier: "standard",
          upperBound: "272000",
        },
        {
          ...priceItem("token_output", 30),
          key: "standard-output",
          tier: "standard",
          upperBound: "272000",
        },
        {
          ...priceItem("cache_read", 0.5),
          key: "standard-cache-read",
          tier: "standard",
          upperBound: "272000",
        },
        {
          ...priceItem("token_input", 10),
          key: "long-input",
          tier: "long_context",
          upperBound: "1050000",
        },
        {
          ...priceItem("token_output", 45),
          key: "long-output",
          tier: "long_context",
          upperBound: "1050000",
        },
      ],
    };
    model.officialPrice = null;
    listModelCatalog.mockResolvedValue([model]);

    renderModelsPage(<ModelsPage />);

    fireEvent.click(await screen.findByRole("button", { name: model.id }));
    const dialog = await screen.findByRole("dialog");
    const priceLayout = dialog.querySelector('[data-price-layout="token"]');
    const standardGroup = priceLayout?.querySelector("section");
    expect(priceLayout).toHaveClass("gap-2");
    expect(standardGroup?.querySelector("header")).toHaveClass("min-h-10", "px-3", "py-2");
    expect(standardGroup?.querySelector('[data-price-component="token_input"]')).toHaveClass(
      "min-h-20",
      "px-3",
      "py-2.5",
    );
    expect(dialog).toHaveTextContent("Standard");
    expect(dialog).toHaveTextContent("Context ≤ 272,000 tokens");
    expect(dialog).toHaveTextContent("Long context");
    expect(dialog).toHaveTextContent("272,000 < Context ≤ 1,050,000 tokens");
    expect(dialog).toHaveTextContent("Cache read / million tokens");
    expect(dialog).toHaveTextContent("45 USD");
  });

  test("exposes hidden capability names from the hover summary trigger", async () => {
    listModelCatalog.mockResolvedValue([modelFixture()]);

    renderModelsPage(<ModelsPage />);

    const hiddenCapabilities = await screen.findByRole("button", {
      name: "More capabilities: Tool calling, Structured output",
    });
    expect(hiddenCapabilities).toHaveAttribute("title", "Tool calling, Structured output");
    expect(hiddenCapabilities).toHaveAttribute("data-slot", "tooltip-trigger");
  });

  test("shows every tier and condition for a duration-priced model", async () => {
    const model = modelFixture();
    model.id = "bytedance/seedance-2.0";
    model.provider = "ByteDance";
    model.family = "video";
    model.inputPrice = null;
    model.outputPrice = 0.06803;
    model.outputPriceQualifier = "from";
    model.inputPriceUnit = "second";
    model.outputPriceUnit = "second";
    model.features = ["Video generation"];
    model.accountPrice = {
      currency: "USD",
      billingMode: "video_duration",
      priceStructure: "tiered",
      comparisonScope: "sales_price_book",
      candidateCount: 1,
      items: [
        {
          ...priceItem("video_output", 0.06803),
          baseAmount: 0.08,
          key: "video-output-480p",
          tier: "480p",
          unit: "second",
          unitSize: 1,
        },
        {
          ...priceItem("video_output", 0.35958),
          key: "video-output-1080p-audio",
          tier: "1080p",
          unit: "second",
          unitSize: 1,
          withAudio: "true",
        },
      ],
    };
    model.officialPrice = null;
    listModelCatalog.mockResolvedValue([model]);

    renderModelsPage(<ModelsPage />);

    fireEvent.click(await screen.findByRole("button", { name: model.id }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector('[data-price-layout="video-duration"]')).toBeTruthy();
    expect(dialog).toHaveTextContent("Tiered pricing");
    expect(dialog).toHaveTextContent("480p");
    expect(dialog).toHaveTextContent("1080p");
    expect(dialog).toHaveTextContent("With audio");
    expect(dialog).toHaveTextContent("Video output / second");
    expect(dialog).toHaveTextContent("0.06803 USD");
    expect(dialog).toHaveTextContent("0.35958 USD");
    expect(dialog).toHaveTextContent("Before group adjustment: 0.08 USD");
  });

  test("uses a full-width unit-price card for a single request price", async () => {
    const model = modelFixture();
    model.id = "openai/image-request-model";
    model.family = "image";
    model.inputPrice = null;
    model.outputPrice = 0.04;
    model.inputPriceUnit = "request";
    model.outputPriceUnit = "request";
    model.accountPrice = {
      currency: "USD",
      billingMode: "request",
      priceStructure: "flat",
      comparisonScope: "sales_price_book",
      candidateCount: 1,
      items: [
        {
          ...priceItem("request", 0.04),
          unit: "request",
          unitSize: 1,
        },
      ],
    };
    model.officialPrice = null;
    listModelCatalog.mockResolvedValue([model]);

    renderModelsPage(<ModelsPage />);

    fireEvent.click(await screen.findByRole("button", { name: model.id }));
    const dialog = await screen.findByRole("dialog");
    const layout = dialog.querySelector('[data-price-layout="request"]');
    expect(layout).toBeTruthy();
    expect(layout).not.toHaveClass("sm:grid-cols-2");
    expect(screen.getByRole("heading", { level: 4, name: "Standard" })).toBeVisible();
    expect(dialog).toHaveTextContent("Request / request");
    expect(dialog).toHaveTextContent("0.04 USD");
  });

  test("keeps long model details inside the viewport with only the content region scrolling", async () => {
    const model = modelFixture();
    model.accountPrice = {
      ...model.accountPrice!,
      items: Array.from({ length: 24 }, (_, index) => ({
        ...priceItem(index % 2 === 0 ? "token_input" : "token_output", index + 1),
        key: `tier-${index}`,
        tier: index < 12 ? "standard" : "long_context",
        upperBound: index < 12 ? "272000" : "1050000",
      })),
    };
    listModelCatalog.mockResolvedValue([model]);

    renderModelsPage(<ModelsPage />);

    fireEvent.click(await screen.findByRole("button", { name: model.id }));
    const dialog = await screen.findByRole("dialog");
    const scrollRegion = screen.getByRole("region", { name: "Model details" });
    const header = dialog.querySelector('[data-slot="dialog-header"]');
    const footer = dialog.querySelector('[data-slot="dialog-footer"]');

    expect(dialog).toHaveClass("flex", "max-h-[calc(100dvh-2rem)]", "overflow-hidden");
    expect(scrollRegion).toHaveClass("min-h-0", "flex-1", "gap-3", "overflow-y-auto", "py-3");
    expect(scrollRegion).toHaveAttribute("tabindex", "0");
    expect(header).toHaveClass("shrink-0", "gap-1", "pb-2");
    expect(footer).toHaveClass("shrink-0", "py-2");
    expect(scrollRegion.contains(footer)).toBe(false);
    expect(dialog).toHaveTextContent("24 USD");
  });
});

function renderModelsPage(page: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{page}</QueryClientProvider>);
}

function ModelsPageHarness(props: { initialSearch: ModelSearch }) {
  const [search, setSearch] = useState(props.initialSearch);
  return (
    <ModelsPage
      search={search}
      onSearchChange={(patch) => setSearch((current) => ({ ...current, ...patch }))}
    />
  );
}

function modelFixture(): ModelCatalogItem {
  return {
    id: "anthropic/claude-sonnet",
    provider: "Anthropic",
    description: "Balanced model for production workloads.",
    family: "chat",
    contextWindow: 200_000,
    maxOutputTokens: 8192,
    limitsSourceUrl: "https://vendor.example/models/claude-sonnet",
    limitsVerifiedAt: 1_788_192_000,
    inputPrice: 3,
    inputPriceQualifier: null,
    outputPrice: 15,
    outputPriceQualifier: null,
    currency: "USD",
    inputPriceUnit: "million_tokens",
    outputPriceUnit: "million_tokens",
    pricingAvailable: true,
    pricingSource: "sales_price_book",
    accountPriceSource: "group",
    accountPrice: {
      currency: "USD",
      billingMode: "token",
      priceStructure: "flat",
      comparisonScope: "sales_price_book",
      candidateCount: 1,
      items: [
        priceItem("token_input", 3),
        priceItem("token_output", 15),
        priceItem("cache_read", 0.3),
        priceItem("cache_write", 3.125),
      ],
    },
    officialPrice: {
      currency: "USD",
      billingMode: "token",
      priceStructure: "flat",
      comparisonScope: null,
      candidateCount: null,
      items: [
        priceItem("token_input", 3.2),
        priceItem("token_output", 16),
        priceItem("cache_read", 0.32),
        priceItem("cache_write", 3.5),
      ],
    },
    available: true,
    availabilityStatus: "available",
    features: ["Text", "Vision", "Tool calling", "Structured output"],
    supportedEndpointTypes: ["openai"],
  };
}

function priceItem(component: string, amount: number) {
  return {
    key: component,
    component,
    amount,
    baseAmount: amount,
    unit: "token",
    unitSize: 1_000_000,
    tier: null,
    upperBound: null,
    operation: null,
    quality: null,
    resolution: null,
    withAudio: null,
    appliedGroup: "priority",
    appliedGroupLabel: "Priority",
  };
}
