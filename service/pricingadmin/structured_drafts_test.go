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

	actualInput := decimal.RequireFromString(retail.InputUnitPrice)
	assert.True(t, decimal.RequireFromString("1.67").Equal(actualInput))
	assert.Contains(t, retail.RetailBillingExpr, "p * 1.67")
	require.NoError(t, PublishRetailPriceVersion(retail.Id))
}

func TestUpdateOfficialFlatDraftChangesPricesWithoutCreatingVersion(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 24, ModelName: "editable-draft"}).Error)

	draft, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 24, Currency: "USD",
		Prices: FlatTokenPriceInput{
			InputUnitPrice:  "1",
			OutputUnitPrice: "4",
		},
		Source: "legacy_import",
		Remark: "initial",
	}, 7)
	require.NoError(t, err)

	updated, err := UpdateOfficialFlatDraft(draft.Id, OfficialFlatDraftInput{
		ModelId: 24, Currency: "eur",
		Prices: FlatTokenPriceInput{
			InputUnitPrice:       "1.25",
			OutputUnitPrice:      "5",
			AudioOutputUnitPrice: "12",
		},
		Remark: "revised",
	})
	require.NoError(t, err)
	assert.Equal(t, draft.Id, updated.Id)
	assert.Equal(t, draft.Version, updated.Version)
	assert.Equal(t, "EUR", updated.Currency)
	assert.Equal(t, "legacy_import", updated.Source)
	assert.Equal(t, "revised", updated.Remark)
	assert.Contains(t, updated.PriceComponents, `"input_unit_price":"1.25"`)
	assert.Contains(t, updated.PriceComponents, `"audio_output_unit_price":"12"`)
	assert.NotEmpty(t, updated.ExprHash)

	var count int64
	require.NoError(t, model.DB.Model(&model.OfficialModelPriceVersion{}).
		Where("model_id = ?", 24).Count(&count).Error)
	assert.Equal(t, int64(1), count)
}

func TestUpdateOfficialFlatDraftRejectsPublishedVersion(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 25, ModelName: "published-price"}).Error)

	version, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 25, Currency: "USD",
		Prices: FlatTokenPriceInput{InputUnitPrice: "1"},
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishOfficialPriceVersion(version.Id))

	_, err = UpdateOfficialFlatDraft(version.Id, OfficialFlatDraftInput{
		ModelId: 25, Currency: "USD",
		Prices: FlatTokenPriceInput{InputUnitPrice: "2"},
	})
	require.ErrorContains(t, err, "only official price drafts")
}

func TestUpdatePurchaseAndRetailDraftsPreservesVersionIdentity(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 26, ModelName: "editable-chain"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 36, ChannelId: 46, ModelId: 26, UpstreamModelName: "editable-chain",
		Status: 1, RuntimeMode: "legacy",
	}).Error)
	official, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 26, Currency: "USD",
		Prices: FlatTokenPriceInput{InputUnitPrice: "2", OutputUnitPrice: "8"},
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishOfficialPriceVersion(official.Id))
	officialId := official.Id

	purchase, err := CreatePurchaseDraft(PurchaseDraftInput{
		ChannelModelId: 36, OfficialPriceVersionId: &officialId,
		PricingMode: "component_ratio", InputDiscount: "0.5", OutputDiscount: "0.75",
	}, 2)
	require.NoError(t, err)
	updatedPurchase, err := UpdatePurchaseDraft(purchase.Id, PurchaseDraftInput{
		ChannelModelId: 36, OfficialPriceVersionId: &officialId,
		PricingMode: "component_ratio", InputDiscount: "0.6", OutputDiscount: "0.8",
		QuoteReference: "Q-2026", Remark: "revised",
		ExpectedUpdatedAt: purchase.UpdatedAt,
	})
	require.NoError(t, err)
	assert.Equal(t, purchase.Id, updatedPurchase.Id)
	assert.Equal(t, purchase.Version, updatedPurchase.Version)
	assert.Equal(t, "1.2", updatedPurchase.InputUnitPrice)
	assert.Equal(t, "6.4", updatedPurchase.OutputUnitPrice)
	assert.Equal(t, "Q-2026", updatedPurchase.QuoteReference)
	assert.Contains(t, updatedPurchase.QuoteSpec, `"input_discount":"0.6"`)
	_, err = UpdatePurchaseDraft(purchase.Id, PurchaseDraftInput{
		ChannelModelId: 36, OfficialPriceVersionId: &officialId,
		PricingMode: "official_ratio", PurchaseDiscount: "0.5",
		ExpectedUpdatedAt: purchase.UpdatedAt,
	})
	require.ErrorContains(t, err, "updated by another administrator")
	require.NoError(t, PublishPurchasePriceVersion(updatedPurchase.Id))

	retail, err := CreateRetailDraft(RetailDraftInput{
		ChannelModelId: 36, PurchasePriceVersionId: updatedPurchase.Id,
		TotalVariableCostRate: "0.1", EffectiveTaxRate: "0.1",
		TargetNetMargin: "0.2", MinimumMarginRate: "0.1",
	}, 3)
	require.NoError(t, err)
	updatedRetail, err := UpdateRetailDraft(retail.Id, RetailDraftInput{
		ChannelModelId: 36, PurchasePriceVersionId: updatedPurchase.Id,
		TotalVariableCostRate: "0.12", EffectiveTaxRate: "0.1",
		TargetNetMargin: "0.25", MinimumMarginRate: "0.15", Remark: "approved",
		ExpectedUpdatedAt: retail.UpdatedAt,
	})
	require.NoError(t, err)
	assert.Equal(t, retail.Id, updatedRetail.Id)
	assert.Equal(t, retail.Version, updatedRetail.Version)
	assert.Equal(t, "0.25", updatedRetail.TargetNetMargin)
	assert.Equal(t, "approved", updatedRetail.Remark)
}

func TestPublishRetailDraftRejectsMarginBelowConfiguredFloor(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 27, ModelName: "margin-gate"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 37, ChannelId: 47, ModelId: 27, UpstreamModelName: "margin-gate",
		Status: 1, RuntimeMode: "legacy",
	}).Error)
	purchase, err := CreatePurchaseDraft(PurchaseDraftInput{
		ChannelModelId: 37, PricingMode: "fixed_unit_price", Currency: "USD",
		Prices: FlatTokenPriceInput{InputUnitPrice: "1"},
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishPurchasePriceVersion(purchase.Id))
	retail, err := CreateRetailDraft(RetailDraftInput{
		ChannelModelId: 37, PurchasePriceVersionId: purchase.Id,
		TotalVariableCostRate: "0.1", EffectiveTaxRate: "0.1",
		TargetNetMargin: "0.1", MinimumMarginRate: "0.2",
	}, 1)
	require.NoError(t, err)

	err = PublishRetailPriceVersion(retail.Id)
	require.ErrorContains(t, err, "does not meet the configured minimum margin")
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

func TestStructuredDraftPreservesMultimodalTokenPrices(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 23, ModelName: "multimodal-test"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 33, ChannelId: 43, ModelId: 23, UpstreamModelName: "multimodal-test",
		Status: 1, RuntimeMode: "legacy",
	}).Error)
	official, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 23, Currency: "USD",
		Prices: FlatTokenPriceInput{
			ImageInputUnitPrice: "2", ImageOutputUnitPrice: "8",
			AudioInputUnitPrice: "3", AudioOutputUnitPrice: "12",
		},
	}, 1)
	require.NoError(t, err)
	assert.Contains(t, official.BillingExpr, "img * 2")
	assert.Contains(t, official.BillingExpr, "img_o * 8")
	assert.Contains(t, official.BillingExpr, "ai * 3")
	assert.Contains(t, official.BillingExpr, "ao * 12")
	require.NoError(t, PublishOfficialPriceVersion(official.Id))

	officialId := official.Id
	purchase, err := CreatePurchaseDraft(PurchaseDraftInput{
		ChannelModelId: 33, OfficialPriceVersionId: &officialId,
		PricingMode: "official_ratio", PurchaseDiscount: "0.5",
	}, 1)
	require.NoError(t, err)
	assert.Contains(t, purchase.PriceComponents, `"image_input_unit_price":"1"`)
	assert.Contains(t, purchase.PriceComponents, `"audio_output_unit_price":"6"`)
	require.NoError(t, PublishPurchasePriceVersion(purchase.Id))

	retail, err := CreateRetailDraft(RetailDraftInput{
		ChannelModelId: 33, PurchasePriceVersionId: purchase.Id,
		TotalVariableCostRate: "0", EffectiveTaxRate: "0",
		TargetNetMargin: "0.5", MinimumMarginRate: "0.1",
	}, 1)
	require.NoError(t, err)
	assert.Contains(t, retail.PriceComponents, `"image_input_unit_price":"2"`)
	assert.Contains(t, retail.PriceComponents, `"audio_output_unit_price":"12"`)
}

func TestStructuredDraftBuildsTieredExpressionPurchaseAndRetailChain(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 31, ModelName: "tiered-chain"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 32, ChannelId: 33, ModelId: 31, UpstreamModelName: "tiered-chain",
		Status: 1, RuntimeMode: "legacy",
	}).Error)
	official := model.OfficialModelPriceVersion{
		ModelId: 31, BillingMode: "token", PriceStructure: "tiered",
		PriceComponents: `{"rules":[` +
			`{"name":"short","component":"token_input","unit":"token","unit_size":"1000000","unit_price":"2","upper_bound":"100000"},` +
			`{"name":"default","component":"token_input","unit":"token","unit_size":"1000000","unit_price":"4"}` +
			`]}`,
		BillingExpr:      `v1:len <= 100000 ? tier("short", p * 2) : tier("default", p * 4)`,
		ExpressionSource: "custom", ExpressionSchemaVersion: "v1",
		Currency: "USD", Source: "manual",
	}
	require.NoError(t, CreateOfficialPriceVersion(&official, 1))
	require.NoError(t, PublishOfficialPriceVersion(official.Id))

	purchase, err := CreatePurchaseDraft(PurchaseDraftInput{
		ChannelModelId: 32, OfficialPriceVersionId: &official.Id,
		PricingMode: "official_ratio", PurchaseDiscount: "0.5",
	}, 1)
	require.NoError(t, err)
	assert.Equal(t, "tiered", purchase.PriceStructure)
	assert.Contains(t, purchase.PurchaseBillingExpr, "* 0.5")
	assert.Contains(t, purchase.PriceComponents, `"unit_price":"1"`)

	retail, err := CreateRetailDraft(RetailDraftInput{
		ChannelModelId: 32, PurchasePriceVersionId: purchase.Id,
		TotalVariableCostRate: "0", EffectiveTaxRate: "0",
		TargetNetMargin: "0.5", MinimumMarginRate: "0.4",
	}, 1)
	require.NoError(t, err)
	assert.Equal(t, "tiered", retail.PriceStructure)
	assert.Contains(t, retail.RetailBillingExpr, "* 2")

	result, err := SimulatePrice(PriceSimulationInput{
		ChannelModelId: 32, PurchasePriceVersionId: purchase.Id,
		RetailPriceVersionId: retail.Id, PromptTokens: 200_000,
	})
	require.NoError(t, err)
	assert.Equal(t, "0.4", result.PurchaseCost)
	assert.Equal(t, "0.8", result.RetailAmount)
}

func TestPurchaseCanReferenceAnExpiredOfficialRevision(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{
		Id: 81, ModelName: "historical-official-reference",
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 82, ChannelId: 83, ModelId: 81,
		UpstreamModelName: "historical-official-reference",
		Status:            1, RuntimeMode: "legacy",
	}).Error)

	historical, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 81, Currency: "USD",
		Prices: FlatTokenPriceInput{InputUnitPrice: "2", OutputUnitPrice: "8"},
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishOfficialPriceVersion(historical.Id))

	current, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 81, Currency: "USD",
		Prices: FlatTokenPriceInput{InputUnitPrice: "3", OutputUnitPrice: "12"},
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishOfficialPriceVersion(current.Id))

	require.NoError(t, model.DB.First(&historical, historical.Id).Error)
	assert.Equal(t, model.PricingVersionStatusExpired, historical.Status)

	purchase, err := CreatePurchaseDraft(PurchaseDraftInput{
		ChannelModelId: 82, OfficialPriceVersionId: &historical.Id,
		PricingMode: "official_ratio", PurchaseDiscount: "0.5",
	}, 1)
	require.NoError(t, err)
	assert.Equal(t, "1", purchase.InputUnitPrice)
	assert.Equal(t, "4", purchase.OutputUnitPrice)
	require.NoError(t, PublishPurchasePriceVersion(purchase.Id))
}
