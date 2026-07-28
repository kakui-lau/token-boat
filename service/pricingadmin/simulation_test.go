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
		PriceStructure: "flat", PurchaseBillingExpr: "p * 1 + c * 2",
		ExpressionSource: "generated", ExpressionSchemaVersion: "v1", Currency: "USD",
	}
	require.NoError(t, CreatePurchasePriceVersion(&purchase, 1))
	retail := model.ChannelModelRetailPriceVersion{
		ChannelModelId: 71, PurchasePriceVersionId: purchase.Id, BillingMode: "token",
		PriceStructure: "flat", RetailBillingExpr: "p * 2 + c * 4",
		ExpressionSource: "generated", ExpressionSchemaVersion: "v1", Currency: "USD",
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
