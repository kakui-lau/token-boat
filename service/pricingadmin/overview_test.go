package pricingadmin

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestListModelPriceOverviewChoosesEachComponentMinimum(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.AutoMigrate(&model.Channel{}))
	require.NoError(t, model.DB.Create(&model.Model{Id: 201, ModelName: "overview-model"}).Error)
	require.NoError(t, model.DB.Create(&model.Channel{Id: 211, Name: "channel-a"}).Error)
	require.NoError(t, model.DB.Create(&model.Channel{Id: 212, Name: "channel-b"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 221, ChannelId: 211, ModelId: 201, UpstreamModelName: "a",
		Status: 1, RuntimeMode: "legacy",
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 222, ChannelId: 212, ModelId: 201, UpstreamModelName: "b",
		Status: 1, RuntimeMode: "legacy",
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModelRetailPriceVersion{
		ChannelModelId: 221, PurchasePriceVersionId: 1, BillingMode: "token",
		PriceStructure: "flat", RetailBillingExpr: "p * 2 + c * 9",
		RetailExprHash: "a", ExpressionSource: "generated", ExpressionSchemaVersion: "v1",
		Currency: "USD", InputUnitPrice: "2", OutputUnitPrice: "9",
		TotalVariableCostRate: "0", EffectiveTaxRate: "0", TargetNetMargin: "0",
		MinimumMarginRate: "0", Version: 1, Status: model.PricingVersionStatusActive,
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModelRetailPriceVersion{
		ChannelModelId: 222, PurchasePriceVersionId: 2, BillingMode: "token",
		PriceStructure: "flat", RetailBillingExpr: "p * 3 + c * 8",
		RetailExprHash: "b", ExpressionSource: "generated", ExpressionSchemaVersion: "v1",
		Currency: "USD", InputUnitPrice: "3", OutputUnitPrice: "8",
		TotalVariableCostRate: "0", EffectiveTaxRate: "0", TargetNetMargin: "0",
		MinimumMarginRate: "0", Version: 1, Status: model.PricingVersionStatusActive,
	}).Error)

	result, err := ListModelPriceOverview("overview")
	require.NoError(t, err)
	require.Len(t, result, 1)
	assert.Equal(t, 2, result[0].ActiveChannelCount)
	assert.Equal(t, "2", result[0].Input.UnitPrice)
	assert.Equal(t, "channel-a", result[0].Input.ChannelName)
	assert.Equal(t, "8", result[0].Output.UnitPrice)
	assert.Equal(t, "channel-b", result[0].Output.ChannelName)
}

func TestListModelPriceOverviewDoesNotCompareDifferentCurrencies(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.AutoMigrate(&model.Channel{}))
	require.NoError(t, model.DB.Create(&model.Model{Id: 301, ModelName: "currency-model"}).Error)
	require.NoError(t, model.DB.Create(&model.Channel{Id: 311, Name: "usd-channel"}).Error)
	require.NoError(t, model.DB.Create(&model.Channel{Id: 312, Name: "cny-channel"}).Error)
	for _, channelModel := range []model.ChannelModel{
		{Id: 321, ChannelId: 311, ModelId: 301, UpstreamModelName: "usd", Status: 1, RuntimeMode: "legacy"},
		{Id: 322, ChannelId: 312, ModelId: 301, UpstreamModelName: "cny", Status: 1, RuntimeMode: "legacy"},
	} {
		require.NoError(t, model.DB.Create(&channelModel).Error)
	}
	for _, retail := range []model.ChannelModelRetailPriceVersion{
		{
			ChannelModelId: 321, PurchasePriceVersionId: 1, BillingMode: "token",
			PriceStructure: "flat", RetailBillingExpr: "p * 1", RetailExprHash: "usd",
			ExpressionSource: "generated", ExpressionSchemaVersion: "v1",
			Currency: "USD", InputUnitPrice: "1", TotalVariableCostRate: "0",
			EffectiveTaxRate: "0", TargetNetMargin: "0", MinimumMarginRate: "0",
			Version: 1, Status: model.PricingVersionStatusActive,
		},
		{
			ChannelModelId: 322, PurchasePriceVersionId: 2, BillingMode: "token",
			PriceStructure: "flat", RetailBillingExpr: "p * 0.8", RetailExprHash: "cny",
			ExpressionSource: "generated", ExpressionSchemaVersion: "v1",
			Currency: "CNY", InputUnitPrice: "0.8", TotalVariableCostRate: "0",
			EffectiveTaxRate: "0", TargetNetMargin: "0", MinimumMarginRate: "0",
			Version: 1, Status: model.PricingVersionStatusActive,
		},
	} {
		require.NoError(t, model.DB.Create(&retail).Error)
	}

	result, err := ListModelPriceOverview("currency")
	require.NoError(t, err)
	require.Len(t, result, 2)
	assert.Equal(t, "CNY", result[0].Currency)
	assert.Equal(t, "USD", result[1].Currency)
}

func TestListOfficialPriceOverviewPrefersActiveVersionAndIncludesCoverage(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 401, ModelName: "official-priced"}).Error)
	require.NoError(t, model.DB.Create(&model.Model{Id: 402, ModelName: "official-unconfigured"}).Error)
	for _, version := range []model.OfficialModelPriceVersion{
		{
			ModelId: 401, BillingMode: "token", PriceStructure: "flat",
			PriceComponents: `{"input_unit_price":"1.25","output_unit_price":"5","cache_read_unit_price":"0.2"}`,
			BillingExpr:     `v1:tier("active", p * 1.25 + c * 5)`, ExprHash: "active",
			ExpressionSource: "generated", ExpressionSchemaVersion: "v1",
			Currency: "USD", Source: "manual", Version: 1,
			Status: model.PricingVersionStatusActive, EffectiveFrom: 100,
		},
		{
			ModelId: 401, BillingMode: "token", PriceStructure: "flat",
			PriceComponents: `{"input_unit_price":"2","output_unit_price":"6"}`,
			BillingExpr:     `v1:tier("draft", p * 2 + c * 6)`, ExprHash: "draft",
			ExpressionSource: "generated", ExpressionSchemaVersion: "v1",
			Currency: "USD", Source: "manual", Version: 2,
			Status: model.PricingVersionStatusDraft,
		},
	} {
		require.NoError(t, model.DB.Create(&version).Error)
	}

	result, err := ListOfficialPriceOverview("official")
	require.NoError(t, err)
	require.Len(t, result, 2)
	assert.Equal(t, model.PricingVersionStatusActive, result[0].Status)
	assert.Equal(t, int64(1), result[0].Version)
	assert.Equal(t, "1.25", result[0].InputUnitPrice)
	assert.Equal(t, "0.2", result[0].CacheReadUnitPrice)
	assert.Equal(t, 2, result[0].VersionCount)
	assert.Equal(t, 1, result[0].DraftCount)
	var draft model.OfficialModelPriceVersion
	require.NoError(t, model.DB.Where(
		"model_id = ? AND status = ?",
		401,
		model.PricingVersionStatusDraft,
	).First(&draft).Error)
	assert.Equal(t, draft.Id, result[0].LatestDraftId)
	assert.Equal(t, "unconfigured", result[1].Status)
	assert.Zero(t, result[1].VersionCount)
}
