package pricingruntime

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
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
		&model.Channel{},
		&model.Ability{},
		&model.ChannelModel{},
		&model.OfficialModelPriceVersion{},
		&model.ModelOfficialPrice{},
		&model.ChannelModelPurchasePriceVersion{},
		&model.RequestPricingSnapshot{},
		&model.SalesPriceBookChannelModelOverride{},
		&model.PricingCircuitEvent{},
		&model.SalesPriceBook{},
		&model.SalesPriceBookVersion{},
		&model.SalesPriceBookItem{},
		&model.SalesPriceBookDefault{},
		&model.UserPriceBookAssignment{},
	))
	InvalidateCatalog()
	t.Cleanup(func() {
		InvalidateCatalog()
		model.DB = originalDB
	})
}

func createRuntimeBundle(t *testing.T, channelModelID int) {
	t.Helper()
	require.NoError(t, model.DB.Create(&model.Model{
		Id: channelModelID, ModelName: "runtime-model", Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.Channel{
		Id: channelModelID, Name: fmt.Sprintf("runtime-channel-%d", channelModelID),
		Status: common.ChannelStatusEnabled,
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: channelModelID, ChannelId: channelModelID, ModelId: channelModelID,
		UpstreamModelName: "runtime-model", Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.Ability{
		Group: "default", Model: "runtime-model", ChannelId: channelModelID, Enabled: true,
	}).Error)
	expression := `v2:tier("base", p * 1 / 1000000)`
	require.NoError(t, model.DB.Create(&model.ChannelModelPurchasePriceVersion{
		Id: channelModelID, ChannelModelId: channelModelID,
		BillingMode: "token", PricingMode: "fixed_unit_price", PriceStructure: "flat",
		PriceComponents:     `{"input_unit_price":"1"}`,
		PurchaseBillingExpr: expression, PurchaseExprHash: billingexpr.ExprHashString(expression),
		ExpressionSchemaVersion: "v2", Currency: "USD", Version: 1,
		Status: model.PricingVersionStatusActive,
	}).Error)
}

func TestValidatePricingActivationRejectsMissingPurchasePrice(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 1, ModelName: "incomplete", Status: 1}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 1, ChannelId: 1, ModelId: 1, UpstreamModelName: "incomplete", Status: 1,
	}).Error)
	_, err := ValidatePricingActivation(1)
	require.ErrorContains(t, err, "no active purchase price")
}

func TestRefreshCatalogIncludesPublishedPurchasePrice(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 2)
	require.NoError(t, RefreshCatalog())

	bundle, ok := GetActiveBundle(2)
	require.True(t, ok)
	assert.Equal(t, 2, bundle.Purchase.Id)
	assert.Len(t, bundle.Revision, 64)
	assert.True(t, HasCompletePricing("default", "runtime-model"))
}

func TestRefreshCatalogRejectsMismatchedCandidateContracts(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 3)
	createRuntimeBundle(t, 4)
	require.NoError(t, model.DB.Model(&model.ChannelModel{}).Where("id = ?", 4).
		Update("model_id", 3).Error)
	require.NoError(t, model.DB.Model(&model.ChannelModelPurchasePriceVersion{}).
		Where("id = ?", 4).Update("billing_mode", "video_duration").Error)
	require.NoError(t, RefreshCatalog())
	assert.False(t, HasCompletePricing("default", "runtime-model"))
	availability := GetPricingAvailability("default", "runtime-model")
	assert.Equal(t, PricingPurchaseContractMismatch, availability.Code)
	assert.Contains(t, availability.Detail, "purchase contract does not match")
}

func TestPricingAvailabilityDistinguishesModelAndGroupFailures(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{
		Id: 31, ModelName: "known-model", Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.Model{
		Id: 32, ModelName: "disabled-model", Status: 0,
	}).Error)
	require.NoError(t, model.DB.Model(&model.Model{}).
		Where("id = ?", 32).Update("status", 0).Error)
	require.NoError(t, RefreshCatalog())

	unknown := GetPricingAvailability("default", "unknown-model")
	assert.Equal(t, PricingModelNotFound, unknown.Code)
	known := GetPricingAvailability("default", "known-model")
	assert.Equal(t, PricingModelNotAvailableInGroup, known.Code)
	disabled := GetPricingAvailability("default", "disabled-model")
	assert.Equal(t, PricingModelDisabled, disabled.Code)
}

func TestPricingAvailabilityReportsMissingChannelModel(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{
		Id: 41, ModelName: "missing-channel-model", Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.Channel{
		Id: 41, Name: "missing-channel-model-route", Status: common.ChannelStatusEnabled,
	}).Error)
	require.NoError(t, model.DB.Create(&model.Ability{
		Group: "default", Model: "missing-channel-model", ChannelId: 41, Enabled: true,
	}).Error)
	require.NoError(t, RefreshCatalog())

	availability := GetPricingAvailability("default", "missing-channel-model")
	assert.Equal(t, PricingChannelModelMissing, availability.Code)
	assert.Equal(t, 1, availability.MissingChannelModels)
	assert.Contains(t, availability.Detail, "no enabled channel-model")
}

func TestPricingAvailabilityReportsMissingPurchasePrice(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{
		Id: 51, ModelName: "missing-purchase", Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.Channel{
		Id: 51, Name: "missing-purchase-route", Status: common.ChannelStatusEnabled,
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 51, ChannelId: 51, ModelId: 51, UpstreamModelName: "missing-purchase", Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.Ability{
		Group: "default", Model: "missing-purchase", ChannelId: 51, Enabled: true,
	}).Error)
	require.NoError(t, RefreshCatalog())

	availability := GetPricingAvailability("default", "missing-purchase")
	assert.Equal(t, PricingPurchasePriceMissing, availability.Code)
	assert.Equal(t, 1, availability.MissingPurchasePrices)
	assert.Contains(t, availability.Detail, "no active purchase price")
}

func TestLoadActivePriceBundleRejectsAmbiguousPurchaseVersions(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 5)
	expression := `v2:tier("base", p / 1000000)`
	require.NoError(t, model.DB.Create(&model.ChannelModelPurchasePriceVersion{
		Id: 105, ChannelModelId: 5, BillingMode: "token",
		PricingMode: "fixed_unit_price", PriceStructure: "flat",
		PurchaseBillingExpr: expression, PurchaseExprHash: billingexpr.ExprHashString(expression),
		ExpressionSchemaVersion: "v2", Currency: "USD", Version: 2,
		Status: model.PricingVersionStatusActive,
	}).Error)
	_, err := LoadActivePriceBundle(5)
	require.ErrorContains(t, err, "multiple active purchase prices")
}

func TestRuntimeReadinessCountsPricedChannelModels(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 6)
	book, _, _ := createResolvedPriceFixture(t, "readiness-toc", 6, 100)
	require.NoError(t, model.DB.Create(&model.SalesPriceBookDefault{
		DefaultKey: "toc_default", PriceBookId: book.Id, UpdatedBy: 1, UpdatedAt: 100,
	}).Error)
	require.NoError(t, RefreshCatalog())
	readiness, err := GetRuntimeReadiness()
	require.NoError(t, err)
	assert.Equal(t, int64(1), readiness.TotalChannelModels)
	assert.Equal(t, int64(1), readiness.PricedChannelModels)
	assert.Equal(t, 1, readiness.CompleteGroupModelScopes)
	assert.True(t, readiness.TocDefaultReady)
	assert.True(t, readiness.LiveTrafficEnabled)
}

func TestRuntimeReadinessExcludesPricedModelsWithoutEnabledAbility(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 7)
	createRuntimeBundle(t, 8)
	require.NoError(t, model.DB.Model(&model.Ability{}).
		Where("channel_id = ?", 8).Update("enabled", false).Error)
	book, _, _ := createResolvedPriceFixture(t, "readiness-routable", 7, 100)
	require.NoError(t, model.DB.Create(&model.SalesPriceBookDefault{
		DefaultKey: "toc_default", PriceBookId: book.Id, UpdatedBy: 1, UpdatedAt: 100,
	}).Error)
	require.NoError(t, RefreshCatalog())

	readiness, err := GetRuntimeReadiness()

	require.NoError(t, err)
	assert.Equal(t, int64(1), readiness.TotalChannelModels)
	assert.Equal(t, int64(1), readiness.PricedChannelModels)
	assert.Equal(t, 1, readiness.CompleteGroupModelScopes)
	assert.True(t, readiness.LiveTrafficEnabled)
}
