package pricingadmin

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
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
		&model.ChannelModel{},
		&model.OfficialModelPriceVersion{},
		&model.ChannelModelPurchasePriceVersion{},
		&model.ChannelModelRetailPriceVersion{},
	))
	t.Cleanup(func() {
		model.DB = originalDB
	})
}

func TestPublishOfficialPriceExpiresPreviousVersion(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 11, ModelName: "gpt-price-test"}).Error)

	first := model.OfficialModelPriceVersion{
		ModelId:         11,
		BillingMode:     "token",
		PriceStructure:  "flat",
		BillingExpr:     `v1:tier("base", p * 1 + c * 2)`,
		Currency:        "usd",
		Source:          "manual",
		PriceComponents: "{}",
	}
	require.NoError(t, CreateOfficialPriceVersion(&first, 1))
	require.NoError(t, PublishOfficialPriceVersion(first.Id))

	second := model.OfficialModelPriceVersion{
		ModelId:         11,
		BillingMode:     "token",
		PriceStructure:  "flat",
		BillingExpr:     `v1:tier("base", p * 2 + c * 3)`,
		Currency:        "USD",
		Source:          "manual",
		PriceComponents: "{}",
	}
	require.NoError(t, CreateOfficialPriceVersion(&second, 2))
	require.NoError(t, PublishOfficialPriceVersion(second.Id))

	var storedFirst model.OfficialModelPriceVersion
	require.NoError(t, model.DB.First(&storedFirst, first.Id).Error)
	assert.Equal(t, model.PricingVersionStatusExpired, storedFirst.Status)
	assert.NotZero(t, storedFirst.EffectiveTo)

	var storedSecond model.OfficialModelPriceVersion
	require.NoError(t, model.DB.First(&storedSecond, second.Id).Error)
	assert.Equal(t, model.PricingVersionStatusActive, storedSecond.Status)
	assert.Equal(t, int64(2), storedSecond.Version)
	assert.Equal(t, "USD", storedSecond.Currency)
	assert.NotEmpty(t, storedSecond.ExprHash)
}

func TestPublishOfficialPricePreservesActivePurchaseChain(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 21, ModelName: "chain-model"}).Error)

	current, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId:  21,
		Currency: "USD",
		Prices: FlatTokenPriceInput{
			InputUnitPrice: "1",
		},
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishOfficialPriceVersion(current.Id))
	require.NoError(t, model.DB.Create(&model.ChannelModelPurchasePriceVersion{
		ChannelModelId:         22,
		OfficialPriceVersionId: &current.Id,
		Version:                1,
		Status:                 model.PricingVersionStatusActive,
	}).Error)

	next, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId:  21,
		Currency: "USD",
		Prices: FlatTokenPriceInput{
			InputUnitPrice: "2",
		},
	}, 1)
	require.NoError(t, err)

	err = PublishOfficialPriceVersion(next.Id)
	require.ErrorContains(t, err, "active purchase price references")

	var storedCurrent model.OfficialModelPriceVersion
	require.NoError(t, model.DB.First(&storedCurrent, current.Id).Error)
	assert.Equal(t, model.PricingVersionStatusActive, storedCurrent.Status)
}

func TestPublishLatestOfficialPriceDraftsPublishesNewestDraftPerModel(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 61, ModelName: "batch-a"}).Error)
	require.NoError(t, model.DB.Create(&model.Model{Id: 62, ModelName: "batch-b"}).Error)

	older, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 61, Currency: "USD",
		Prices: FlatTokenPriceInput{InputUnitPrice: "1"},
	}, 1)
	require.NoError(t, err)
	newer, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 61, Currency: "USD",
		Prices: FlatTokenPriceInput{InputUnitPrice: "2"},
	}, 1)
	require.NoError(t, err)
	other, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 62, Currency: "USD",
		Prices: FlatTokenPriceInput{InputUnitPrice: "3"},
	}, 1)
	require.NoError(t, err)

	result, err := PublishLatestOfficialPriceDrafts()
	require.NoError(t, err)
	assert.Equal(t, 2, result.Published)

	var storedOlder model.OfficialModelPriceVersion
	require.NoError(t, model.DB.First(&storedOlder, older.Id).Error)
	assert.Equal(t, model.PricingVersionStatusDraft, storedOlder.Status)
	var storedNewer model.OfficialModelPriceVersion
	require.NoError(t, model.DB.First(&storedNewer, newer.Id).Error)
	assert.Equal(t, model.PricingVersionStatusActive, storedNewer.Status)
	var storedOther model.OfficialModelPriceVersion
	require.NoError(t, model.DB.First(&storedOther, other.Id).Error)
	assert.Equal(t, model.PricingVersionStatusActive, storedOther.Status)
}

func TestPublishLatestOfficialPriceDraftsRollsBackEntireBatch(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 71, ModelName: "batch-first"}).Error)
	require.NoError(t, model.DB.Create(&model.Model{Id: 72, ModelName: "batch-blocked"}).Error)

	first, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 71, Currency: "USD",
		Prices: FlatTokenPriceInput{InputUnitPrice: "1"},
	}, 1)
	require.NoError(t, err)
	current, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 72, Currency: "USD",
		Prices: FlatTokenPriceInput{InputUnitPrice: "2"},
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishOfficialPriceVersion(current.Id))
	require.NoError(t, model.DB.Create(&model.ChannelModelPurchasePriceVersion{
		ChannelModelId: 73, OfficialPriceVersionId: &current.Id, Version: 1,
		Status: model.PricingVersionStatusActive,
	}).Error)
	_, err = CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 72, Currency: "USD",
		Prices: FlatTokenPriceInput{InputUnitPrice: "3"},
	}, 1)
	require.NoError(t, err)

	result, err := PublishLatestOfficialPriceDrafts()
	require.ErrorContains(t, err, "active purchase price references")
	assert.Zero(t, result.Published)

	var storedFirst model.OfficialModelPriceVersion
	require.NoError(t, model.DB.First(&storedFirst, first.Id).Error)
	assert.Equal(t, model.PricingVersionStatusDraft, storedFirst.Status)
	var storedCurrent model.OfficialModelPriceVersion
	require.NoError(t, model.DB.First(&storedCurrent, current.Id).Error)
	assert.Equal(t, model.PricingVersionStatusActive, storedCurrent.Status)
}

func TestPublishPurchasePricePreservesActiveRetailChain(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 31, ChannelId: 32, ModelId: 33, UpstreamModelName: "chain-model",
		Status: 1, RuntimeMode: "legacy",
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModelPurchasePriceVersion{
		Id: 34, ChannelModelId: 31, Version: 1,
		Status: model.PricingVersionStatusActive,
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModelRetailPriceVersion{
		ChannelModelId: 31, PurchasePriceVersionId: 34, Version: 1,
		Status: model.PricingVersionStatusActive,
	}).Error)

	next := model.ChannelModelPurchasePriceVersion{
		ChannelModelId:      31,
		BillingMode:         "token",
		PricingMode:         "fixed_unit_price",
		PriceStructure:      "flat",
		PurchaseBillingExpr: `v1:tier("base", p * 1)`,
		Currency:            "USD",
	}
	require.NoError(t, CreatePurchasePriceVersion(&next, 1))

	err := PublishPurchasePriceVersion(next.Id)
	require.ErrorContains(t, err, "active retail price references")

	var storedCurrent model.ChannelModelPurchasePriceVersion
	require.NoError(t, model.DB.First(&storedCurrent, 34).Error)
	assert.Equal(t, model.PricingVersionStatusActive, storedCurrent.Status)
}

func TestPurchasePriceRejectsOfficialPriceFromDifferentLogicalModel(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 401, ModelName: "model-a"}).Error)
	require.NoError(t, model.DB.Create(&model.Model{Id: 402, ModelName: "model-b"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 403, ChannelId: 404, ModelId: 402, UpstreamModelName: "model-b",
		Status: 1, RuntimeMode: "legacy",
	}).Error)
	official, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 401, Currency: "USD",
		Prices: FlatTokenPriceInput{InputUnitPrice: "1"},
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishOfficialPriceVersion(official.Id))
	officialId := official.Id

	_, err = CreatePurchaseDraft(PurchaseDraftInput{
		ChannelModelId: 403, OfficialPriceVersionId: &officialId,
		PricingMode: "official_ratio", PurchaseDiscount: "0.5",
	}, 1)
	require.ErrorContains(t, err, "different logical models")
}

func TestCreateRetailPriceRejectsImpossibleMarginFormula(t *testing.T) {
	setupPricingAdminTestDB(t)

	input := model.ChannelModelRetailPriceVersion{
		ChannelModelId:         20,
		PurchasePriceVersionId: 30,
		BillingMode:            "token",
		PriceStructure:         "flat",
		RetailBillingExpr:      `v1:tier("base", p * 2 + c * 3)`,
		Currency:               "USD",
		TotalVariableCostRate:  "0.50",
		EffectiveTaxRate:       "0.20",
		TargetNetMargin:        "0.50",
		MinimumMarginRate:      "0.10",
	}
	err := CreateRetailPriceVersion(&input, 1)
	require.ErrorContains(t, err, "non-positive retail denominator")
}

func TestPublishOfficialPriceRejectsExpressionHashMismatch(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 12, ModelName: "hash-test"}).Error)

	version := model.OfficialModelPriceVersion{
		ModelId:        12,
		BillingMode:    "token",
		PriceStructure: "flat",
		BillingExpr:    `v1:tier("base", p * 1 + c * 2)`,
		Currency:       "USD",
		Source:         "manual",
	}
	require.NoError(t, CreateOfficialPriceVersion(&version, 1))
	require.NoError(t, model.DB.Model(&model.OfficialModelPriceVersion{}).
		Where("id = ?", version.Id).
		UpdateColumn("billing_expr", `v1:tier("base", p * 9 + c * 9)`).Error)

	err := PublishOfficialPriceVersion(version.Id)
	require.ErrorContains(t, err, "expression hash does not match")

	var stored model.OfficialModelPriceVersion
	require.NoError(t, model.DB.First(&stored, version.Id).Error)
	assert.Equal(t, model.PricingVersionStatusDraft, stored.Status)
}

func TestImportLegacyOfficialPriceCreatesReviewableDraftWithoutRuntimeActivation(t *testing.T) {
	setupPricingAdminTestDB(t)
	ratio_setting.InitRatioSettings()
	require.NoError(t, model.DB.Create(&model.Model{Id: 13, ModelName: "gpt-4o"}).Error)

	result, err := ImportLegacyOfficialPriceDrafts(7)
	require.NoError(t, err)
	assert.Equal(t, 1, result.Created)

	var version model.OfficialModelPriceVersion
	require.NoError(t, model.DB.First(&version).Error)
	assert.Equal(t, model.PricingVersionStatusDraft, version.Status)
	assert.Equal(t, "legacy_import", version.Source)
	assert.Equal(t, "token", version.BillingMode)
	assert.Contains(t, version.BillingExpr, "p * 2.5")
	assert.Zero(t, version.EffectiveFrom)

	secondResult, err := ImportLegacyOfficialPriceDrafts(7)
	require.NoError(t, err)
	assert.Equal(t, 0, secondResult.Created)
	assert.Equal(t, 1, secondResult.SkippedExisting)
}

func TestPublishNonTokenOfficialPriceWaitsForRuntimeEvaluator(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 14, ModelName: "video-test"}).Error)

	version := model.OfficialModelPriceVersion{
		ModelId:        14,
		BillingMode:    "video_duration",
		PriceStructure: "flat",
		BillingExpr:    `v1:tier("base", 0.2)`,
		Currency:       "USD",
		Source:         "manual",
	}
	require.NoError(t, CreateOfficialPriceVersion(&version, 1))
	err := PublishOfficialPriceVersion(version.Id)
	require.ErrorContains(t, err, "cannot be published until its V2 runtime evaluator is enabled")
}
