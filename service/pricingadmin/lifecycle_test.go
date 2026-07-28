package pricingadmin

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSuspendPriceChainRequiresRetailFirst(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 101, ModelName: "lifecycle"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 102, ChannelId: 103, ModelId: 101, UpstreamModelName: "lifecycle",
		Status: 1, RuntimeMode: "legacy",
	}).Error)
	official, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 101, Currency: "USD",
		Prices: FlatTokenPriceInput{InputUnitPrice: "1"},
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
	retail, err := CreateRetailDraft(RetailDraftInput{
		ChannelModelId: 102, PurchasePriceVersionId: purchase.Id,
		TotalVariableCostRate: "0.1", EffectiveTaxRate: "0.1",
		TargetNetMargin: "0.1", MinimumMarginRate: "0.05",
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishRetailPriceVersion(retail.Id))

	bundle, err := GetActivePriceBundle(102)
	require.NoError(t, err)
	assert.Equal(t, retail.Id, bundle.Retail.Id)
	assert.Positive(t, bundle.Revision)

	require.ErrorContains(t, SuspendPurchasePriceVersion(purchase.Id), "active retail")
	require.NoError(t, SuspendRetailPriceVersion(retail.Id))
	require.NoError(t, SuspendPurchasePriceVersion(purchase.Id))
	require.NoError(t, SuspendOfficialPriceVersion(official.Id))
}

func TestDeleteDraftRejectsPublishedAndReferencedVersions(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 111, ModelName: "delete-draft"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 112, ChannelId: 113, ModelId: 111, UpstreamModelName: "delete-draft",
		Status: 1, RuntimeMode: "legacy",
	}).Error)
	official, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 111, Currency: "USD",
		Prices: FlatTokenPriceInput{InputUnitPrice: "1"},
	}, 1)
	require.NoError(t, err)
	officialId := official.Id
	purchase, err := CreatePurchaseDraft(PurchaseDraftInput{
		ChannelModelId: 112, OfficialPriceVersionId: &officialId,
		PricingMode: "official_ratio", PurchaseDiscount: "0.5",
	}, 1)
	require.ErrorContains(t, err, "must be active")

	require.NoError(t, PublishOfficialPriceVersion(official.Id))
	purchase, err = CreatePurchaseDraft(PurchaseDraftInput{
		ChannelModelId: 112, OfficialPriceVersionId: &officialId,
		PricingMode: "official_ratio", PurchaseDiscount: "0.5",
	}, 1)
	require.NoError(t, err)
	require.ErrorContains(t, DeleteOfficialPriceDraft(official.Id), "only official price drafts")
	require.NoError(t, DeletePurchasePriceDraft(purchase.Id))
	var count int64
	require.NoError(t, model.DB.Model(&model.ChannelModelPurchasePriceVersion{}).
		Where("id = ?", purchase.Id).Count(&count).Error)
	assert.Zero(t, count)
}
