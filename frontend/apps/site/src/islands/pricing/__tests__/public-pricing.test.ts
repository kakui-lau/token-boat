import { describe, expect, test } from "vitest";

import { parsePublicPricingEnvelope } from "@/islands/pricing/public-pricing";

describe("public pricing contract", () => {
  test("uses the published lowest-price summary without exposing group internals", () => {
    const models = parsePublicPricingEnvelope({
      data: [
        {
          availability_status: "available",
          available: true,
          description: "A long-context reasoning model.",
          context_length: 200_000,
          lowest_price: {
            billing_mode: "usage",
            currency: "USD",
            items: [
              {
                amount: "9.95",
                component: "token_input",
                tier: "standard",
                unit: "token",
                unit_size: 1_000_000,
              },
              { amount: "49.76", component: "token_output", unit: "token" },
            ],
            price_structure: "component",
          },
          max_output_tokens: 16_000,
          model_name: "anthropic/claude-example",
          pricing_source: "sales_price_book",
          sales_prices_by_group: {
            internal: {
              currency: "USD",
              items: [{ amount: "1", component: "token_input", unit: "token" }],
            },
          },
          tags: "文本,推理,代码",
          supported_endpoint_types: ["openai", "anthropic"],
          vendor_id: 2,
        },
      ],
      vendors: [{ id: 2, name: "Anthropic" }],
    });

    expect(models).toEqual([
      expect.objectContaining({
        family: "reasoning",
        id: "anthropic/claude-example",
        availabilityStatus: "available",
        billingMode: "usage",
        description: "A long-context reasoning model.",
        endpoints: ["openai", "anthropic"],
        inputPrice: { amount: 9.95, currency: "USD", qualifier: null, unit: "million_tokens" },
        outputPrice: {
          amount: 49.76,
          currency: "USD",
          qualifier: null,
          unit: "million_tokens",
        },
        provider: "Anthropic",
        maxOutputTokens: 16_000,
        priceComponents: [
          expect.objectContaining({
            amount: 9.95,
            component: "token_input",
            tier: "standard",
            unit: "token",
            unitSize: 1_000_000,
          }),
          expect.objectContaining({ amount: 49.76, component: "token_output" }),
        ],
        priceStructure: "component",
        pricingSource: "sales_price_book",
      }),
    ]);
  });

  test("marks tiered media pricing as a starting price and ignores malformed models", () => {
    const models = parsePublicPricingEnvelope({
      data: [
        { model_name: "" },
        {
          lowest_price: {
            currency: "USD",
            items: [
              { amount: "0.36", component: "video_output", unit: "second" },
              { amount: "0.07", component: "video_output", unit: "second" },
            ],
          },
          model_name: "bytedance/seedance",
          tags: "视频,文生视频",
        },
      ],
    });

    expect(models).toHaveLength(1);
    expect(models[0]?.family).toBe("video");
    expect(models[0]?.outputPrice).toEqual({
      amount: 0.07,
      currency: "USD",
      qualifier: "from",
      unit: "second",
    });
  });

  test("omits malformed price components from the public details contract", () => {
    const models = parsePublicPricingEnvelope({
      data: [
        {
          lowest_price: {
            currency: "USD",
            items: [
              { amount: "bad", component: "token_input", unit: "token" },
              { amount: "1.25", component: "", unit: "token" },
              { amount: "2.5", component: "request", unit: "request" },
            ],
          },
          model_name: "provider/example",
        },
      ],
    });

    expect(models[0]?.priceComponents).toEqual([
      expect.objectContaining({ amount: 2.5, component: "request", unit: "request" }),
    ]);
  });
});
