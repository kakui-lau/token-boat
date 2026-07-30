package controller

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/service/pricingengine"
	"github.com/QuantumNous/new-api/service/pricingruntime"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestQuotePricingReturnsOnlyUserFacingAmounts(t *testing.T) {
	setupPricingAdminControllerTestDB(t)
	require.NoError(t, model.DB.AutoMigrate(&model.Ability{}))
	require.NoError(t, model.DB.Create(&model.Model{
		Id: 81, ModelName: "public-quote-model",
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 82, ChannelId: 83, ModelId: 81, UpstreamModelName: "public-quote-model",
		Status: 1, RuntimeMode: pricingruntime.RuntimeModeV2,
	}).Error)
	require.NoError(t, model.DB.Create(&model.Ability{
		Group: "default", Model: "public-quote-model", ChannelId: 83, Enabled: true,
	}).Error)
	purchaseExpr := `v2:tier("base", p * 1 / 1000000)`
	retailExpr := `v2:tier("base", p * 2 / 1000000)`
	require.NoError(t, model.DB.Create(&model.ChannelModelPurchasePriceVersion{
		Id: 84, ChannelModelId: 82, BillingMode: "token",
		PricingMode: "fixed_unit_price", PriceStructure: "flat",
		PurchaseBillingExpr:     purchaseExpr,
		PurchaseExprHash:        billingexpr.ExprHashString(purchaseExpr),
		ExpressionSchemaVersion: "v2",
		Currency:                "USD", Version: 1, Status: model.PricingVersionStatusActive,
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModelRetailPriceVersion{
		Id: 85, ChannelModelId: 82, PurchasePriceVersionId: 84,
		BillingMode: "token", PriceStructure: "flat", RetailBillingExpr: retailExpr,
		RetailExprHash:          billingexpr.ExprHashString(retailExpr),
		ExpressionSchemaVersion: "v2",
		Currency:                "USD", Version: 1, Status: model.PricingVersionStatusActive,
		TotalVariableCostRate: "0", EffectiveTaxRate: "0",
		MinimumMarginRate: "0.1", TargetNetMargin: "0.2",
	}).Error)
	pricingruntime.InvalidateCatalog()
	require.NoError(t, pricingruntime.RefreshCatalog())
	t.Cleanup(pricingruntime.InvalidateCatalog)

	context, recorder := newPricingAdminJSONContext(
		t,
		http.MethodPost,
		"/api/pricing/quote",
		PricingQuoteInput{
			ModelName: "public-quote-model",
			Usage:     pricingengine.Usage{PromptTokens: 1_000_000},
		},
	)
	common.SetContextKey(context, constant.ContextKeyUserGroup, "default")

	QuotePricing(context)

	var response map[string]any
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.Equal(t, true, response["success"])
	data, ok := response["data"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "2", data["minimum_retail_amount"])
	assert.Equal(t, "2", data["maximum_reservation_amount"])
	assert.Equal(t, "default", data["group"])
	assert.NotContains(t, data, "quotes")
	assert.NotContains(t, data, "purchase_cost")
	assert.NotContains(t, data, "channel_id")
}

func TestQuotePricingRejectsUnavailableRequestedGroup(t *testing.T) {
	setupPricingAdminControllerTestDB(t)
	context, recorder := newPricingAdminJSONContext(
		t,
		http.MethodPost,
		"/api/pricing/quote",
		PricingQuoteInput{
			ModelName: "public-quote-model",
			Group:     "private-unavailable-group",
			Usage:     pricingengine.Usage{PromptTokens: 1_000_000},
		},
	)
	common.SetContextKey(context, constant.ContextKeyUserGroup, "default")

	QuotePricing(context)

	var response struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.False(t, response.Success)
	assert.Contains(t, response.Message, "无权")
}
