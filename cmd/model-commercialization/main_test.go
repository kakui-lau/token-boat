package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func validConfig() config {
	return config{
		ChannelID: 14, LogicalModel: "moonshotai/kimi-k3", UpstreamModel: "wb-moonshot/kimi-k3",
		Vendor: "Moonshot", Description: "Kimi K3", OfficialSourceURL: "https://platform.kimi.ai/docs/pricing/chat-k3",
		OfficialInput: "3", OfficialOutput: "15", OfficialCacheRead: "0.3",
		PurchaseDiscount: "0.85", VariableCostRate: "0.11", TaxRate: "0.165",
		TargetMargin: "0.03", MinimumMargin: "0.03",
	}
}

func TestBuildPlanCalculatesCommercialPriceChain(t *testing.T) {
	result, err := buildPlan(validConfig())
	require.NoError(t, err)
	assert.Equal(t, "2.55", result.PurchaseInput)
	assert.Equal(t, "12.75", result.PurchaseOutput)
	assert.Equal(t, "0.255", result.PurchaseCacheRead)
	assert.Equal(t, "2.98570", result.RetailInput)
	assert.Equal(t, "14.92849", result.RetailOutput)
	assert.Equal(t, "0.29857", result.RetailCacheRead)
}

func TestBuildPlanRejectsRetailAtOrAboveOfficialPrice(t *testing.T) {
	cfg := validConfig()
	cfg.PurchaseDiscount = "1"
	_, err := buildPlan(cfg)
	require.ErrorContains(t, err, "must be lower than official price")
}

func TestValidateConfigRejectsMinimumMarginAboveTarget(t *testing.T) {
	cfg := validConfig()
	cfg.MinimumMargin = "0.04"
	require.ErrorContains(t, validateConfig(cfg), "cannot exceed")
}

func TestValidateConfigRequiresCommercialIdentityInputs(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(*config)
		message string
	}{
		{"channel id", func(cfg *config) { cfg.ChannelID = 0 }, "channel_id is required"},
		{"logical model", func(cfg *config) { cfg.LogicalModel = "" }, "logical_model is required"},
		{"upstream model", func(cfg *config) { cfg.UpstreamModel = "" }, "upstream_model is required"},
		{"purchase discount", func(cfg *config) { cfg.PurchaseDiscount = "" }, "purchase_discount is required"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			cfg := validConfig()
			test.mutate(&cfg)
			require.ErrorContains(t, validateConfig(cfg), test.message)
		})
	}
}

func TestCSVContainsMatchesWholeModelName(t *testing.T) {
	assert.True(t, csvContains("a,moonshotai/kimi-k3,b", "moonshotai/kimi-k3"))
	assert.False(t, csvContains("a,moonshotai/kimi-k30,b", "moonshotai/kimi-k3"))
}
