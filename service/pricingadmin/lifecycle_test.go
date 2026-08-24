package pricingadmin

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetActivePriceBundleRequiresPublishedPurchasePrice(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 121, ModelName: "incomplete-bundle"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 122, ChannelId: 123, ModelId: 121, UpstreamModelName: "incomplete-bundle", Status: 1,
	}).Error)
	_, err := GetActivePriceBundle(122)
	require.ErrorContains(t, err, "has no active purchase price")
	purchase := model.ChannelModelPurchasePriceVersion{
		ChannelModelId: 122, BillingMode: "token", PricingMode: "fixed_unit_price",
		PriceStructure: "flat", PriceComponents: `{"input_unit_price":"1"}`,
		InputUnitPrice: "1", PurchaseBillingExpr: `v2:tier("base", p * 1 / 1000000)`,
		PurchaseExprHash: "purchase", ExpressionSource: "generated",
		ExpressionSchemaVersion: "v2", Currency: "USD", Version: 1,
		Status: model.PricingVersionStatusActive,
	}
	require.NoError(t, model.DB.Create(&purchase).Error)
	bundle, err := GetActivePriceBundle(122)
	require.NoError(t, err)
	assert.Equal(t, purchase.Id, bundle.Purchase.Id)
	assert.Len(t, bundle.Revision, 64)
}

func TestPurchasePriceLifecycleIsIndependentFromSalesPriceBooks(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 101, ModelName: "lifecycle"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 102, ChannelId: 103, ModelId: 101, UpstreamModelName: "lifecycle", Status: 1,
	}).Error)
	official, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 101, Currency: "USD", Prices: FlatTokenPriceInput{InputUnitPrice: "1"},
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishOfficialPriceVersion(official.Id))
	officialId := official.Id
	purchase, err := CreatePurchaseDraft(PurchaseDraftInput{
		ChannelModelId: 102, OfficialPriceVersionId: &officialId,
		PricingMode: "official_ratio", PurchaseDiscount: "0.5",
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishPurchasePriceVersion(purchase.Id))
	require.NoError(t, SuspendPurchasePriceVersion(purchase.Id))
	var stored model.ChannelModelPurchasePriceVersion
	require.NoError(t, model.DB.First(&stored, purchase.Id).Error)
	assert.Equal(t, model.PricingVersionStatusSuspended, stored.Status)
}

func TestDeletePurchaseDraftRejectsUnpublishedOfficialReference(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 111, ModelName: "delete-draft"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 112, ChannelId: 113, ModelId: 111, UpstreamModelName: "delete-draft", Status: 1,
	}).Error)
	official, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 111, Currency: "USD", Prices: FlatTokenPriceInput{InputUnitPrice: "1"},
	}, 1)
	require.NoError(t, err)
	officialId := official.Id
	_, err = CreatePurchaseDraft(PurchaseDraftInput{
		ChannelModelId: 112, OfficialPriceVersionId: &officialId,
		PricingMode: "official_ratio", PurchaseDiscount: "0.5",
	}, 1)
	require.ErrorContains(t, err, "must be published")
	require.NoError(t, PublishOfficialPriceVersion(official.Id))
	purchase, err := CreatePurchaseDraft(PurchaseDraftInput{
		ChannelModelId: 112, OfficialPriceVersionId: &officialId,
		PricingMode: "official_ratio", PurchaseDiscount: "0.5",
	}, 1)
	require.NoError(t, err)
	require.NoError(t, DeletePurchasePriceDraft(purchase.Id))
	var count int64
	require.NoError(t, model.DB.Model(&model.ChannelModelPurchasePriceVersion{}).
		Where("id = ?", purchase.Id).Count(&count).Error)
	assert.Zero(t, count)
}
