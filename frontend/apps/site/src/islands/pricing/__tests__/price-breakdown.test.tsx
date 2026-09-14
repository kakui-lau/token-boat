// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { createPricingI18n } from "@/i18n/pricing";
import {
  groupPriceComponents,
  PriceBreakdown,
  PriceSummary,
} from "@/islands/pricing/price-breakdown";
import type {
  PricingAudience,
  PublicPriceComponent,
  PublicPricingModel,
} from "@/islands/pricing/public-pricing";

describe("public price breakdown", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  test("groups tier conditions once and keeps every supported pricing component", async () => {
    const components = [
      priceComponent("token_input", 1.32, { tier: "peak" }),
      priceComponent("token_output", 3.96, { tier: "peak" }),
      priceComponent("cache_read", 0.044, { tier: "peak" }),
      priceComponent("token_input", 0.66, { tier: "off_peak" }),
      priceComponent("token_output", 1.98, { tier: "off_peak" }),
      priceComponent("cache_read", 0.022, { tier: "off_peak" }),
    ];

    const groups = groupPriceComponents(components);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.items.map((item) => item.component))).toEqual([
      ["token_input", "token_output", "cache_read"],
      ["token_input", "token_output", "cache_read"],
    ]);

    await renderBreakdown(model("official", components));

    expect(container.querySelectorAll("[data-price-group]")).toHaveLength(2);
    expect(container.querySelectorAll("[data-price-component]")).toHaveLength(6);
    expect(container.textContent).toContain("高峰");
    expect(container.textContent).toContain("非高峰");
    expect(container.textContent).toContain("缓存读取");
  });

  test("uses the same compact card layout for request, media, character, and mixed prices", async () => {
    const components = [
      priceComponent("request", 0.04, { unit: "request", unitSize: 1 }),
      priceComponent("image_output", 0.08, {
        quality: "hd",
        resolution: "1024x1024",
        unit: "image",
        unitSize: 1,
      }),
      priceComponent("audio_output", 0.02, { unit: "second", unitSize: 1 }),
      priceComponent("video_output", 0.12, {
        resolution: "1080p",
        unit: "second",
        unitSize: 1,
        withAudio: "true",
      }),
      priceComponent("character_input", 0.3, { unit: "character", unitSize: 1_000_000 }),
      priceComponent("tool_call", 0.01, { unit: "item", unitSize: 1 }),
    ];

    await renderBreakdown(model("official", components, "mixed"));

    expect(container.querySelector("[data-price-layout='mixed']")).not.toBeNull();
    expect(container.querySelectorAll("[data-price-component]")).toHaveLength(6);
    expect(container.textContent).toContain("每次请求");
    expect(container.textContent).toContain("图像输出");
    expect(container.textContent).toContain("音频输出");
    expect(container.textContent).toContain("视频输出");
    expect(container.textContent).toContain("字符输入");
    expect(container.textContent).toContain("工具调用");
    expect(container.textContent).toContain("含音频");
  });

  test("defaults signed-in viewers to account prices and switches in place to official prices", async () => {
    const accountModel = model("account", [priceComponent("token_input", 0.435)]);
    const officialModel = model("official", [priceComponent("token_input", 1.32)]);

    await renderBreakdown(accountModel, officialModel);

    expect(container.querySelector("[data-price-view='account']")?.textContent).toContain(
      "0.435 USD",
    );
    expect(container.textContent).toContain("官方参考价");
    expect(container.textContent).toContain("节省 67%");

    const officialButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "官方价格",
    );
    expect(officialButton).toBeDefined();
    await act(async () => officialButton?.click());

    expect(container.querySelector("[data-price-view='official']")?.textContent).toContain(
      "1.32 USD",
    );
    expect(container.textContent).not.toContain("官方参考价");
  });

  test("falls back to the available source when account pricing disappears", async () => {
    const accountModel = model("account", [priceComponent("token_input", 0.435)]);
    const officialModel = model("official", [priceComponent("token_input", 1.32)]);

    await renderBreakdown(accountModel, officialModel);
    const accountButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "当前账户价格",
    );
    await act(async () => accountButton?.click());
    await renderBreakdown(officialModel, officialModel);

    expect(container.querySelector("[data-price-view='official']")).not.toBeNull();
    expect(container.querySelector("[data-price-view='account']")).toBeNull();
  });

  test("summarizes non-token models without empty input or output placeholders", async () => {
    const videoModel = model(
      "official",
      [
        priceComponent("video_output", 0.12, {
          resolution: "1080p",
          unit: "second",
          unitSize: 1,
        }),
        priceComponent("video_output", 0.08, {
          resolution: "720p",
          unit: "second",
          unitSize: 1,
        }),
      ],
      "video_duration",
    );
    await renderSummary(videoModel);

    expect(container.querySelectorAll(".model-price-grid > div")).toHaveLength(1);
    expect(container.textContent).toContain("视频输出");
    expect(container.textContent).toContain("0.08 USD / 每秒");
    expect(container.textContent).toContain("起");
    expect(container.textContent).not.toContain("—");
  });

  test("keeps canonical token input and output in a multimodal card summary", async () => {
    const tokenModel = model("official", [
      priceComponent("token_input", 1),
      priceComponent("image_token_input", 2),
      priceComponent("token_output", 3),
    ]);

    await renderSummary(tokenModel);

    const labels = [...container.querySelectorAll(".model-price-grid dt")].map(
      (item) => item.textContent,
    );
    expect(labels).toEqual(["文本输入", "文本输出"]);
    expect(container.textContent).toContain("另有 1 个计费项目");
  });

  test("uses distinct billing domains for a compact mixed-price summary", async () => {
    const mixedModel = model(
      "official",
      [
        priceComponent("token_input", 1),
        priceComponent("token_output", 3),
        priceComponent("video_output", 0.1, { unit: "second", unitSize: 1 }),
      ],
      "mixed",
    );

    await renderSummary(mixedModel);

    const labels = [...container.querySelectorAll(".model-price-grid dt")].map(
      (item) => item.textContent,
    );
    expect(labels).toEqual(["文本输入", "视频输出"]);
    expect(container.textContent).toContain("另有 1 个计费项目");
  });

  test("marks a single conditional price as starting from and identifies official fallback", async () => {
    const conditionalOfficialModel = model("official", [
      priceComponent("image_output", 0.08, {
        quality: "hd",
        resolution: "1024x1024",
        unit: "image",
        unitSize: 1,
      }),
    ]);

    await renderSummary(conditionalOfficialModel, true);

    expect(container.textContent).toContain("起 0.08 USD / 每张图像");
    expect(container.querySelector("[data-price-source='official']")?.textContent).toBe("官方价格");
  });

  async function renderBreakdown(
    viewerModel: PublicPricingModel,
    officialModel: PublicPricingModel | null = null,
  ) {
    const i18n = createPricingI18n("zh");
    await act(async () => {
      root.render(
        createElement(
          I18nextProvider,
          { i18n },
          createElement(PriceBreakdown, {
            locale: "zh",
            model: viewerModel,
            officialModel,
          }),
        ),
      );
    });
  }

  async function renderSummary(viewerModel: PublicPricingModel, showSource = false) {
    const i18n = createPricingI18n("zh");
    await act(async () => {
      root.render(
        createElement(
          I18nextProvider,
          { i18n },
          createElement(PriceSummary, {
            locale: "zh",
            model: viewerModel,
            showSource,
          }),
        ),
      );
    });
  }
});

function priceComponent(
  component: string,
  amount: number,
  overrides: Partial<PublicPriceComponent> = {},
): PublicPriceComponent {
  return {
    amount,
    component,
    currency: "USD",
    operation: null,
    quality: null,
    resolution: null,
    tier: null,
    unit: "token",
    unitSize: 1_000_000,
    upperBound: null,
    withAudio: null,
    ...overrides,
  };
}

function model(
  priceAudience: PricingAudience,
  priceComponents: PublicPriceComponent[],
  billingMode = "token",
): PublicPricingModel {
  return {
    available: true,
    availabilityStatus: "available",
    billingMode,
    contextLength: null,
    description: null,
    endpoints: [],
    family: "chat",
    id: "provider/example",
    inputPrice: null,
    limitsSourceUrl: null,
    limitsVerifiedAt: null,
    maxOutputTokens: null,
    outputPrice: null,
    priceAudience,
    priceComponents,
    priceStructure: "flat",
    pricingSource: priceAudience === "account" ? "sales_price_book" : "official_price",
    provider: "Provider",
    tags: [],
  };
}
