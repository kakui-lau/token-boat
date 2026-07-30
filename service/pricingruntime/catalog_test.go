package pricingruntime

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/pricingengine"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupRuntimeCatalogTestDB(t *testing.T) {
	t.Helper()
	originalDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	require.NoError(t, db.AutoMigrate(
		&model.Model{},
		&model.Ability{},
		&model.ChannelModel{},
		&model.OfficialModelPriceVersion{},
		&model.ChannelModelPurchasePriceVersion{},
		&model.ChannelModelRetailPriceVersion{},
	))
	InvalidateCatalog()
	t.Cleanup(func() {
		InvalidateCatalog()
		model.DB = originalDB
	})
}

func createRuntimeBundle(t *testing.T, channelModelId int, runtimeMode string) {
	t.Helper()
	require.NoError(t, model.DB.Create(&model.Model{
		Id:        channelModelId,
		ModelName: "runtime-model",
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: channelModelId, ChannelId: channelModelId, ModelId: channelModelId,
		UpstreamModelName: "runtime-model", Status: 1, RuntimeMode: runtimeMode,
	}).Error)
	require.NoError(t, model.DB.Create(&model.Ability{
		Group: "default", Model: "runtime-model", ChannelId: channelModelId, Enabled: true,
	}).Error)
	purchase := model.ChannelModelPurchasePriceVersion{
		Id: channelModelId, ChannelModelId: channelModelId,
		BillingMode: "token", PricingMode: "fixed_unit_price", PriceStructure: "flat",
		PurchaseBillingExpr: `v2:tier("base", p * 1 / 1000000)`,
		PurchaseExprHash:    "purchase", ExpressionSchemaVersion: "v2",
		Currency: "USD", Version: 1, Status: model.PricingVersionStatusActive,
	}
	require.NoError(t, model.DB.Create(&purchase).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModelRetailPriceVersion{
		Id: channelModelId, ChannelModelId: channelModelId, PurchasePriceVersionId: purchase.Id,
		BillingMode: "token", PriceStructure: "flat",
		RetailBillingExpr: `v2:tier("base", p * 2 / 1000000)`,
		RetailExprHash:    "retail", ExpressionSchemaVersion: "v2",
		Currency: "USD", Version: 1, Status: model.PricingVersionStatusActive,
		TotalVariableCostRate: "0", EffectiveTaxRate: "0",
		MinimumMarginRate: "0.1", TargetNetMargin: "0.2",
	}).Error)
}

func TestSetRuntimeModeRejectsIncompletePriceChain(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 1, ModelName: "incomplete"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 1, ChannelId: 1, ModelId: 1, UpstreamModelName: "incomplete",
		Status: 1, RuntimeMode: RuntimeModeLegacy,
	}).Error)

	err := SetRuntimeMode(1, RuntimeModeV2)
	require.ErrorContains(t, err, "no active purchase price")

	var stored model.ChannelModel
	require.NoError(t, model.DB.First(&stored, 1).Error)
	assert.Equal(t, RuntimeModeLegacy, stored.RuntimeMode)
}

func TestCatalogContainsOnlyValidatedV2Bundles(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 2, RuntimeModeLegacy)
	require.NoError(t, SetRuntimeMode(2, RuntimeModeV2))

	bundle, ok := GetActiveBundle(2)
	require.True(t, ok)
	assert.Equal(t, 2, bundle.Retail.Id)
	assert.Len(t, bundle.Revision, 64)

	require.NoError(t, SetRuntimeMode(2, RuntimeModeLegacy))
	_, ok = GetActiveBundle(2)
	assert.False(t, ok)
}

func TestCatalogSnapshotStaysFrozenUntilInvalidated(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 3, RuntimeModeV2)
	require.NoError(t, RefreshCatalog())

	before, ok := GetActiveBundle(3)
	require.True(t, ok)
	require.NoError(t, model.DB.Exec(
		"UPDATE channel_model_retail_price_versions SET retail_billing_expr = ? WHERE id = ?",
		`v2:tier("base", p * 3 / 1000000)`,
		3,
	).Error)

	frozen, ok := GetActiveBundle(3)
	require.True(t, ok)
	assert.Equal(t, before.Retail.RetailBillingExpr, frozen.Retail.RetailBillingExpr)

	InvalidateCatalog()
	refreshed, ok := GetActiveBundle(3)
	require.True(t, ok)
	assert.NotEqual(t, before.Retail.RetailBillingExpr, refreshed.Retail.RetailBillingExpr)
}

func TestQuoteCandidatesUsesFrozenPurchaseAndRetailExpressions(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 4, RuntimeModeV2)
	require.NoError(t, RefreshCatalog())

	quotes, err := QuoteCandidates("default", "runtime-model", pricingengine.Usage{
		PromptTokens: 1_000_000,
	})
	require.NoError(t, err)
	require.Len(t, quotes, 1)
	assert.Equal(t, "1", quotes[0].PurchaseCost)
	assert.Equal(t, "2", quotes[0].RetailAmount)
	assert.True(t, quotes[0].MeetsMinimumMargin)
	assert.Equal(t, "0.5", quotes[0].EstimatedNetMarginRate)
}
