package pricingadmin

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestScaleBillingExpressionScalesRequestAwareExpression(t *testing.T) {
	expression, err := scaleBillingExpression(
		`v2:tier("fast", req * (header("x-priority") == "fast" ? 2 : 1))`,
		decimal.RequireFromString("1.25"),
	)
	require.NoError(t, err)
	assert.Contains(t, expression, "* 1.25")
}

func TestScaleBillingExpressionRejectsOldSchema(t *testing.T) {
	_, err := scaleBillingExpression(`v1:tier("base", p * 1)`, decimal.NewFromInt(2))
	require.ErrorContains(t, err, "v2")
}

func TestComponentDiscountRequiresEveryPricedOfficialComponent(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 41, ModelName: "component-model"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 42, ChannelId: 43, ModelId: 41, UpstreamModelName: "component-model", Status: 1,
	}).Error)
	official, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 41, Currency: "USD",
		Prices: FlatTokenPriceInput{InputUnitPrice: "1", OutputUnitPrice: "2"},
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishOfficialPriceVersion(official.Id))
	officialID := official.Id
	_, err = CreatePurchaseDraft(PurchaseDraftInput{
		ChannelModelId: 42, OfficialPriceVersionId: &officialID,
		PricingMode: "component_ratio", InputDiscount: "0.8",
	}, 1)
	require.ErrorContains(t, err, "output")
}

func TestPurchaseCanReferenceExpiredOfficialRevision(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 51, ModelName: "revision-model"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 52, ChannelId: 53, ModelId: 51, UpstreamModelName: "revision-model", Status: 1,
	}).Error)
	first, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 51, Currency: "USD", Prices: FlatTokenPriceInput{InputUnitPrice: "1"},
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishOfficialPriceVersion(first.Id))
	second, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 51, Currency: "USD", Prices: FlatTokenPriceInput{InputUnitPrice: "2"},
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishOfficialPriceVersion(second.Id))
	firstID := first.Id
	purchase, err := CreatePurchaseDraft(PurchaseDraftInput{
		ChannelModelId: 52, OfficialPriceVersionId: &firstID,
		PricingMode: "official_ratio", PurchaseDiscount: "0.8",
	}, 1)
	require.NoError(t, err)
	assert.Equal(t, first.Id, *purchase.OfficialPriceVersionId)
}
