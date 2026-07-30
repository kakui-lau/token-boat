package pricingadmin

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSimulatePriceReturnsAuditableProfitBreakdown(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 71, ChannelId: 81, ModelId: 91, UpstreamModelName: "simulation-model",
		Status: 1, RuntimeMode: "legacy",
	}).Error)
	purchase := model.ChannelModelPurchasePriceVersion{
		ChannelModelId: 71, BillingMode: "token", PricingMode: "fixed_unit_price",
		PriceStructure: "flat", PurchaseBillingExpr: "v2:(p * 1 + c * 2) / 1000000",
		ExpressionSource: "generated", ExpressionSchemaVersion: "v2", Currency: "USD",
	}
	require.NoError(t, CreatePurchasePriceVersion(&purchase, 1))
	retail := model.ChannelModelRetailPriceVersion{
		ChannelModelId: 71, PurchasePriceVersionId: purchase.Id, BillingMode: "token",
		PriceStructure: "flat", RetailBillingExpr: "v2:(p * 2 + c * 4) / 1000000",
		ExpressionSource: "generated", ExpressionSchemaVersion: "v2", Currency: "USD",
		TotalVariableCostRate: "0.1", EffectiveTaxRate: "0.2",
		TargetNetMargin: "0.2", MinimumMarginRate: "0.3",
	}
	require.NoError(t, CreateRetailPriceVersion(&retail, 1))

	result, err := SimulatePrice(PriceSimulationInput{
		ChannelModelId: 71, PurchasePriceVersionId: purchase.Id,
		RetailPriceVersionId: retail.Id, PromptTokens: 1_000_000,
		CompletionTokens: 1_000_000,
	})
	require.NoError(t, err)
	assert.Equal(t, "3", result.PurchaseCost)
	assert.Equal(t, "6", result.RetailAmount)
	assert.Equal(t, "0.6", result.VariableCost)
	assert.Equal(t, "1.92", result.NetProfit)
	assert.Equal(t, "0.32", result.NetMarginRate)
	assert.True(t, result.MeetsMinimumMargin)
}

func TestSimulatePriceRejectsUnboundedTokenInput(t *testing.T) {
	setupPricingAdminTestDB(t)
	_, err := SimulatePrice(PriceSimulationInput{
		ChannelModelId: 1, PurchasePriceVersionId: 1,
		RetailPriceVersionId: 1, PromptTokens: maxSimulationTokens + 1,
	})
	require.ErrorContains(t, err, "prompt_tokens")
}

func TestSimulatePriceUsesV2UsageAndRequestContext(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 72, ChannelId: 82, ModelId: 92, UpstreamModelName: "video-simulation",
		Status: 1, RuntimeMode: "legacy",
	}).Error)
	purchase := model.ChannelModelPurchasePriceVersion{
		ChannelModelId: 72, BillingMode: "video_duration", PricingMode: "custom_expr",
		PriceStructure:      "expression",
		PurchaseBillingExpr: `v2:param("resolution") == "1080p" ? tier("hd", video_s * 0.4) : tier("sd", video_s * 0.2)`,
		ExpressionSource:    "custom", ExpressionSchemaVersion: "v2", Currency: "USD",
	}
	require.NoError(t, CreatePurchasePriceVersion(&purchase, 1))
	retail := model.ChannelModelRetailPriceVersion{
		ChannelModelId: 72, PurchasePriceVersionId: purchase.Id, BillingMode: "video_duration",
		PriceStructure:    "expression",
		RetailBillingExpr: `v2:param("resolution") == "1080p" ? tier("hd", video_s * 0.8) : tier("sd", video_s * 0.4)`,
		ExpressionSource:  "custom", ExpressionSchemaVersion: "v2", Currency: "USD",
		TotalVariableCostRate: "0.1", EffectiveTaxRate: "0.2",
		TargetNetMargin: "0.2", MinimumMarginRate: "0.3",
	}
	require.NoError(t, CreateRetailPriceVersion(&retail, 1))

	result, err := SimulatePrice(PriceSimulationInput{
		ChannelModelId: 72, PurchasePriceVersionId: purchase.Id,
		RetailPriceVersionId: retail.Id, VideoSeconds: 10,
		RequestBody: `{"resolution":"1080p"}`,
	})
	require.NoError(t, err)
	assert.Equal(t, "4", result.PurchaseCost)
	assert.Equal(t, "8", result.RetailAmount)
	assert.Equal(t, "hd", result.PurchaseMatchedTier)
	assert.Equal(t, "hd", result.RetailMatchedTier)
}

func TestSimulatePriceDoesNotDoubleChargeSeparatelyPricedCacheTokens(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 73, ChannelId: 83, ModelId: 93, UpstreamModelName: "cache-simulation",
		Status: 1, RuntimeMode: "legacy",
	}).Error)
	purchase := model.ChannelModelPurchasePriceVersion{
		ChannelModelId: 73, BillingMode: "token", PricingMode: "fixed_unit_price",
		PriceStructure: "flat", PurchaseBillingExpr: `v2:tier("base", (p * 1 + cr * 10) / 1000000)`,
		ExpressionSource: "generated", ExpressionSchemaVersion: "v2", Currency: "USD",
	}
	require.NoError(t, CreatePurchasePriceVersion(&purchase, 1))
	retail := model.ChannelModelRetailPriceVersion{
		ChannelModelId: 73, PurchasePriceVersionId: purchase.Id, BillingMode: "token",
		PriceStructure: "flat", RetailBillingExpr: `v2:tier("base", (p * 2 + cr * 20) / 1000000)`,
		ExpressionSource: "generated", ExpressionSchemaVersion: "v2", Currency: "USD",
		TotalVariableCostRate: "0", EffectiveTaxRate: "0",
		TargetNetMargin: "0.1", MinimumMarginRate: "0",
	}
	require.NoError(t, CreateRetailPriceVersion(&retail, 1))

	result, err := SimulatePrice(PriceSimulationInput{
		ChannelModelId: 73, PurchasePriceVersionId: purchase.Id,
		RetailPriceVersionId: retail.Id, PromptTokens: 1_000_000,
		CacheReadTokens: 200_000,
	})
	require.NoError(t, err)
	assert.Equal(t, "2.8", result.PurchaseCost)
	assert.Equal(t, "5.6", result.RetailAmount)
}
