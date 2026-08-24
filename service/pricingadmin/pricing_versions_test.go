package pricingadmin

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupPricingAdminTestDB(t *testing.T) {
	t.Helper()
	originalDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	require.NoError(t, db.AutoMigrate(
		&model.Model{},
		&model.Channel{},
		&model.ChannelModel{},
		&model.ModelOfficialPrice{},
		&model.OfficialModelPriceVersion{},
		&model.OfficialPriceSyncBatch{},
		&model.ChannelModelPurchasePriceVersion{},
	))
	t.Cleanup(func() { model.DB = originalDB })
}

func TestPurchaseOptionalPricesUseTextColumns(t *testing.T) {
	setupPricingAdminTestDB(t)
	columnTypes, err := model.DB.Migrator().ColumnTypes(&model.ChannelModelPurchasePriceVersion{})
	require.NoError(t, err)
	typesByName := make(map[string]string, len(columnTypes))
	for _, columnType := range columnTypes {
		typesByName[columnType.Name()] = columnType.DatabaseTypeName()
	}
	for _, column := range []string{
		"input_unit_price", "output_unit_price", "cache_read_unit_price", "cache_write_unit_price",
	} {
		assert.Equal(t, "text", typesByName[column])
	}
}

func TestPublishOfficialPriceExpiresPreviousVersion(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 11, ModelName: "gpt-price-test"}).Error)
	first, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 11, Currency: "USD", Prices: FlatTokenPriceInput{InputUnitPrice: "1"},
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishOfficialPriceVersion(first.Id))
	second, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 11, Currency: "USD", Prices: FlatTokenPriceInput{InputUnitPrice: "2"},
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishOfficialPriceVersion(second.Id))

	var storedFirst model.OfficialModelPriceVersion
	var storedSecond model.OfficialModelPriceVersion
	require.NoError(t, model.DB.First(&storedFirst, first.Id).Error)
	require.NoError(t, model.DB.First(&storedSecond, second.Id).Error)
	assert.Equal(t, model.PricingVersionStatusExpired, storedFirst.Status)
	assert.Equal(t, model.PricingVersionStatusActive, storedSecond.Status)
}

func TestCreateOfficialPriceRejectsOldExpressionSchema(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 12, ModelName: "old-expression"}).Error)
	expression := `v1:tier("base", p * 1)`
	version := model.OfficialModelPriceVersion{
		ModelId: 12, BillingMode: "token", PriceStructure: "flat",
		BillingExpr: expression, ExprHash: billingexpr.ExprHashString(expression),
		ExpressionSchemaVersion: "v1", Currency: "USD", Source: "manual",
	}
	require.Error(t, CreateOfficialPriceVersion(&version, 1))
}

func TestPurchasePriceRejectsOfficialPriceFromDifferentModel(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create([]model.Model{
		{Id: 21, ModelName: "logical-a"},
		{Id: 22, ModelName: "logical-b"},
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 23, ChannelId: 24, ModelId: 21, UpstreamModelName: "logical-a", Status: 1,
	}).Error)
	official, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 22, Currency: "USD", Prices: FlatTokenPriceInput{InputUnitPrice: "1"},
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishOfficialPriceVersion(official.Id))
	officialID := official.Id
	_, err = CreatePurchaseDraft(PurchaseDraftInput{
		ChannelModelId: 23, OfficialPriceVersionId: &officialID,
		PricingMode: "official_ratio", PurchaseDiscount: "0.8",
	}, 1)
	require.ErrorContains(t, err, "different logical models")
}

func TestPublishPurchasePriceCreatesSingleActiveVersion(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 31, ModelName: "purchase-model"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 32, ChannelId: 33, ModelId: 31, UpstreamModelName: "purchase-model", Status: 1,
	}).Error)
	purchase, err := CreatePurchaseDraft(PurchaseDraftInput{
		ChannelModelId: 32, PricingMode: "fixed_unit_price", Currency: "USD",
		Prices:         FlatTokenPriceInput{InputUnitPrice: "0.5"},
		QuoteReference: "supplier-quote-2026-08", ContractReference: "contract-1",
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishPurchasePriceVersion(purchase.Id))
	var activeCount int64
	require.NoError(t, model.DB.Model(&model.ChannelModelPurchasePriceVersion{}).
		Where("channel_model_id = ? AND status = ?", 32, model.PricingVersionStatusActive).
		Count(&activeCount).Error)
	assert.Equal(t, int64(1), activeCount)
}
