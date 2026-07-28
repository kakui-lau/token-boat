package pricingadmin

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStructuredDraftBuildsOfficialPurchaseAndRetailPriceChain(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 21, ModelName: "structured-test"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id:                31,
		ChannelId:         41,
		ModelId:           21,
		UpstreamModelName: "structured-test",
		Status:            1,
		RuntimeMode:       "legacy",
	}).Error)

	official, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId:  21,
		Currency: "usd",
		Prices: FlatTokenPriceInput{
			InputUnitPrice:     "2",
			OutputUnitPrice:    "10",
			CacheReadUnitPrice: "0.2",
		},
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishOfficialPriceVersion(official.Id))

	officialId := official.Id
	purchase, err := CreatePurchaseDraft(PurchaseDraftInput{
		ChannelModelId:         31,
		OfficialPriceVersionId: &officialId,
		PricingMode:            "official_ratio",
		PurchaseDiscount:       "0.65",
	}, 2)
	require.NoError(t, err)
	assert.Equal(t, "1.3", purchase.InputUnitPrice)
	assert.Equal(t, "6.5", purchase.OutputUnitPrice)
	assert.Equal(t, "0.13", purchase.CacheReadUnitPrice)
	assert.Contains(t, purchase.PurchaseBillingExpr, "* 0.65")
	require.NoError(t, PublishPurchasePriceVersion(purchase.Id))

	retail, err := CreateRetailDraft(RetailDraftInput{
		ChannelModelId:         31,
		PurchasePriceVersionId: purchase.Id,
		TotalVariableCostRate:  "0.10",
		EffectiveTaxRate:       "0.165",
		TargetNetMargin:        "0.10",
		MinimumMarginRate:      "0.05",
	}, 3)
	require.NoError(t, err)

	factor := decimal.RequireFromString("0.835").Div(decimal.RequireFromString("0.6515"))
	expectedInput := decimal.RequireFromString("1.3").Mul(factor)
	actualInput := decimal.RequireFromString(retail.InputUnitPrice)
	assert.True(t, expectedInput.Equal(actualInput))
	assert.Contains(t, retail.RetailBillingExpr, factor.String())
	require.NoError(t, PublishRetailPriceVersion(retail.Id))
}

func TestComponentDiscountRequiresEveryPricedOfficialComponent(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 22, ModelName: "component-test"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id:                32,
		ChannelId:         42,
		ModelId:           22,
		UpstreamModelName: "component-test",
		Status:            1,
		RuntimeMode:       "legacy",
	}).Error)
	official, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId:  22,
		Currency: "USD",
		Prices: FlatTokenPriceInput{
			InputUnitPrice:  "1",
			OutputUnitPrice: "4",
		},
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishOfficialPriceVersion(official.Id))

	officialId := official.Id
	_, err = CreatePurchaseDraft(PurchaseDraftInput{
		ChannelModelId:         32,
		OfficialPriceVersionId: &officialId,
		PricingMode:            "component_ratio",
		InputDiscount:          "0.6",
	}, 2)
	require.ErrorContains(t, err, "output_discount")
}
