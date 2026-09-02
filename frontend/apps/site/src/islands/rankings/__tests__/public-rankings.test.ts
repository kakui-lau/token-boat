import { describe, expect, test } from "vitest";

import { parsePublicRankingsEnvelope } from "@/islands/rankings/public-rankings";

describe("parsePublicRankingsEnvelope", () => {
  test("maps public model, vendor, movement, and aggregated activity data", () => {
    const snapshot = parsePublicRankingsEnvelope({
      data: {
        models: [
          {
            growth_pct: 12.5,
            model_name: "vendor/model-a",
            previous_rank: 2,
            rank: 1,
            share: 0.625,
            total_tokens: 1250000,
            vendor: "Vendor",
          },
        ],
        models_history: {
          points: [
            { label: "Mon", model: "vendor/model-a", tokens: 100 },
            { label: "Mon", model: "vendor/model-b", tokens: 50 },
            { label: "Tue", model: "vendor/model-a", tokens: 200 },
          ],
        },
        top_droppers: [],
        top_movers: [
          {
            current_rank: 1,
            growth_pct: 12.5,
            model_name: "vendor/model-a",
            rank_delta: 1,
            vendor: "Vendor",
          },
        ],
        vendors: [
          {
            growth_pct: 8,
            models_count: 2,
            rank: 1,
            share: 0.75,
            top_model: "vendor/model-a",
            total_tokens: 1500000,
            vendor: "Vendor",
          },
        ],
      },
      success: true,
    });

    expect(snapshot).toEqual({
      activity: [
        { label: "Mon", totalTokens: 150 },
        { label: "Tue", totalTokens: 200 },
      ],
      models: [
        {
          growthPct: 12.5,
          modelName: "vendor/model-a",
          previousRank: 2,
          rank: 1,
          share: 0.625,
          totalTokens: 1250000,
          vendor: "Vendor",
        },
      ],
      topDroppers: [],
      topMovers: [
        {
          currentRank: 1,
          growthPct: 12.5,
          modelName: "vendor/model-a",
          rankDelta: 1,
          vendor: "Vendor",
        },
      ],
      vendors: [
        {
          growthPct: 8,
          modelsCount: 2,
          rank: 1,
          share: 0.75,
          topModel: "vendor/model-a",
          totalTokens: 1500000,
          vendor: "Vendor",
        },
      ],
    });
  });

  test("rejects failed or unusable public responses", () => {
    expect(parsePublicRankingsEnvelope({ success: false })).toBeNull();
    expect(
      parsePublicRankingsEnvelope({
        data: {
          models: [
            {
              growth_pct: 0,
              model_name: "invalid-share",
              rank: 1,
              share: 2,
              total_tokens: 1,
              vendor: "Vendor",
            },
          ],
        },
        success: true,
      }),
    ).toBeNull();
  });
});
