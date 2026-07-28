package pricingadmin

import (
	"fmt"
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
		&model.ModelOfficialPrice{},
		&model.OfficialModelPriceVersion{},
		&model.OfficialPriceSyncBatch{},
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

	require.NoError(t, PublishOfficialPriceVersion(next.Id))

	var storedCurrent model.OfficialModelPriceVersion
	require.NoError(t, model.DB.First(&storedCurrent, current.Id).Error)
	assert.Equal(t, model.PricingVersionStatusExpired, storedCurrent.Status)

	var storedPurchase model.ChannelModelPurchasePriceVersion
	require.NoError(t, model.DB.Where("official_price_version_id = ?", current.Id).
		First(&storedPurchase).Error)
	assert.Equal(t, model.PricingVersionStatusActive, storedPurchase.Status)
	assert.Equal(t, current.Id, *storedPurchase.OfficialPriceVersionId)

	var catalog model.ModelOfficialPrice
	require.NoError(t, model.DB.First(&catalog, 21).Error)
	assert.Equal(t, next.Id, catalog.CurrentRevisionId)
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

func TestPublishLatestOfficialPriceDraftsSkipsUnsupportedBillingModes(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 63, ModelName: "batch-token"}).Error)
	require.NoError(t, model.DB.Create(&model.Model{Id: 64, ModelName: "batch-video"}).Error)

	token, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 63, Currency: "USD",
		Prices: FlatTokenPriceInput{InputUnitPrice: "1"},
	}, 1)
	require.NoError(t, err)
	video := model.OfficialModelPriceVersion{
		ModelId: 64, BillingMode: "video_duration", PriceStructure: "flat",
		PriceComponents: `{"video_second_unit_price":"0.2"}`,
		BillingExpr:     "v1:0.2", Currency: "USD",
	}
	require.NoError(t, CreateOfficialPriceVersion(&video, 1))

	result, err := PublishLatestOfficialPriceDrafts()
	require.NoError(t, err)
	assert.Equal(t, 1, result.Published)
	assert.Equal(t, 1, result.SkippedUnsupported)

	var storedToken model.OfficialModelPriceVersion
	require.NoError(t, model.DB.First(&storedToken, token.Id).Error)
	assert.Equal(t, model.PricingVersionStatusActive, storedToken.Status)
	var storedVideo model.OfficialModelPriceVersion
	require.NoError(t, model.DB.First(&storedVideo, video.Id).Error)
	assert.Equal(t, model.PricingVersionStatusDraft, storedVideo.Status)
}

func TestPublishLatestOfficialPriceDraftsDoesNotRewritePurchaseSnapshots(t *testing.T) {
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
	require.NoError(t, err)
	assert.Equal(t, 2, result.Published)

	var storedFirst model.OfficialModelPriceVersion
	require.NoError(t, model.DB.First(&storedFirst, first.Id).Error)
	assert.Equal(t, model.PricingVersionStatusActive, storedFirst.Status)
	var storedCurrent model.OfficialModelPriceVersion
	require.NoError(t, model.DB.First(&storedCurrent, current.Id).Error)
	assert.Equal(t, model.PricingVersionStatusExpired, storedCurrent.Status)
}

func TestSyncOfficialPricesIsIdempotentAndKeepsOnlyChangedRevisions(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 81, ModelName: "sync-model"}).Error)

	input := OfficialPriceSyncInput{
		Source: "official_api", IdempotencyKey: "batch-2026-07-28T00:00Z",
		AutoActivate: true,
		Items: []OfficialPriceSynchronizationItem{{
			ModelId: 81, BillingMode: "token", PriceStructure: "flat",
			PriceComponents: `{"input_unit_price":"1"}`,
			BillingExpr:     `v1:tier("base", p * 1)`, Currency: "USD",
			SourceVersion: "upstream-1",
		}},
	}
	first, err := SyncOfficialPrices(input, 9)
	require.NoError(t, err)
	assert.False(t, first.Idempotent)
	assert.Equal(t, 1, first.Batch.ChangedCount)
	assert.Equal(t, 1, first.Batch.ActivatedCount)

	replay, err := SyncOfficialPrices(input, 9)
	require.NoError(t, err)
	assert.True(t, replay.Idempotent)
	assert.Equal(t, first.Batch.Id, replay.Batch.Id)

	input.IdempotencyKey = "batch-2026-07-28T01:00Z"
	unchanged, err := SyncOfficialPrices(input, 9)
	require.NoError(t, err)
	assert.Equal(t, 0, unchanged.Batch.ChangedCount)
	assert.Equal(t, 1, unchanged.Batch.UnchangedCount)

	var revisionCount int64
	require.NoError(t, model.DB.Model(&model.OfficialModelPriceVersion{}).
		Where("model_id = ?", 81).Count(&revisionCount).Error)
	assert.Equal(t, int64(1), revisionCount)
}

func TestSyncOfficialPricesAdvancesCatalogWithoutChangingPurchaseReference(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 91, ModelName: "sync-chain"}).Error)

	syncInput := func(key string, price string) OfficialPriceSyncInput {
		return OfficialPriceSyncInput{
			Source: "official_api", IdempotencyKey: key, AutoActivate: true,
			Items: []OfficialPriceSynchronizationItem{{
				ModelId: 91, BillingMode: "token", PriceStructure: "flat",
				PriceComponents: fmt.Sprintf(`{"input_unit_price":"%s"}`, price),
				BillingExpr:     fmt.Sprintf(`v1:tier("base", p * %s)`, price),
				Currency:        "USD",
			}},
		}
	}
	_, err := SyncOfficialPrices(syncInput("first", "1"), 9)
	require.NoError(t, err)
	var first model.OfficialModelPriceVersion
	require.NoError(t, model.DB.Where("model_id = ? AND status = ?", 91, model.PricingVersionStatusActive).
		First(&first).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModelPurchasePriceVersion{
		ChannelModelId: 92, OfficialPriceVersionId: &first.Id, Version: 1,
		Status: model.PricingVersionStatusActive,
	}).Error)

	_, err = SyncOfficialPrices(syncInput("second", "2"), 9)
	require.NoError(t, err)
	var catalog model.ModelOfficialPrice
	require.NoError(t, model.DB.First(&catalog, 91).Error)
	assert.NotEqual(t, first.Id, catalog.CurrentRevisionId)

	var purchase model.ChannelModelPurchasePriceVersion
	require.NoError(t, model.DB.Where("channel_model_id = ?", 92).First(&purchase).Error)
	assert.Equal(t, first.Id, *purchase.OfficialPriceVersionId)
	assert.Equal(t, model.PricingVersionStatusActive, purchase.Status)
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

func TestUpdateOfficialPriceDraftSupportsNonTokenConfiguration(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 15, ModelName: "adaptive-video"}).Error)

	version := model.OfficialModelPriceVersion{
		ModelId:         15,
		BillingMode:     "video_duration",
		PriceStructure:  "expression",
		PriceComponents: `{"video_second_unit_price":"0.2"}`,
		BillingExpr:     `v1:tier("base", 0.2)`,
		Currency:        "USD",
		Source:          "official_api",
	}
	require.NoError(t, CreateOfficialPriceVersion(&version, 1))

	updated, err := UpdateOfficialPriceVersionDraft(version.Id, &model.OfficialModelPriceVersion{
		ModelId:                 15,
		BillingMode:             "video_duration",
		PriceStructure:          "expression",
		PriceComponents:         `{"video_second_unit_price":"0.3"}`,
		BillingExpr:             `v1:tier("base", 0.3)`,
		ExpressionSource:        "custom",
		ExpressionSchemaVersion: "v1",
		Currency:                "usd",
		Remark:                  "updated video price",
	})
	require.NoError(t, err)
	assert.Equal(t, "video_duration", updated.BillingMode)
	assert.Equal(t, "expression", updated.PriceStructure)
	assert.Equal(t, `{"video_second_unit_price":"0.3"}`, updated.PriceComponents)
	assert.Equal(t, `v1:tier("base", 0.3)`, updated.BillingExpr)
	assert.Equal(t, "USD", updated.Currency)
	assert.NotEmpty(t, updated.ExprHash)
	assert.NotEmpty(t, updated.ContentHash)
	assert.Equal(t, model.PricingVersionStatusDraft, updated.Status)
}

func TestCreateOfficialPriceDraftRejectsInvalidPriceComponents(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 16, ModelName: "invalid-components"}).Error)

	version := model.OfficialModelPriceVersion{
		ModelId:         16,
		BillingMode:     "token",
		PriceStructure:  "expression",
		PriceComponents: "{invalid",
		BillingExpr:     `v1:tier("base", p * 1)`,
		Currency:        "USD",
		Source:          "manual",
	}
	err := CreateOfficialPriceVersion(&version, 1)
	require.ErrorContains(t, err, "price_components must be a JSON object")

	var count int64
	require.NoError(t, model.DB.Model(&model.OfficialModelPriceVersion{}).
		Where("model_id = ?", 16).Count(&count).Error)
	assert.Zero(t, count)
}

func TestCreateOfficialPriceDraftRejectsConditionalFallbackRule(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 17, ModelName: "invalid-fallback"}).Error)

	version := model.OfficialModelPriceVersion{
		ModelId:        17,
		BillingMode:    "video_duration",
		PriceStructure: "tiered",
		PriceComponents: `{"schema_version":"v2","rules":[` +
			`{"name":"1080p","component":"video_output","unit":"second","unit_size":"1","unit_price":"0.4","upper_bound":"60"},` +
			`{"name":"fallback","component":"video_output","unit":"second","unit_size":"1","unit_price":"0.2","resolution":"720p"}` +
			`]}`,
		BillingExpr:             `v2:video_s <= 60 ? tier("1080p", video_s * 0.4) : tier("fallback", video_s * 0.2)`,
		ExpressionSchemaVersion: "v2",
		Currency:                "USD",
		Source:                  "manual",
	}
	err := CreateOfficialPriceVersion(&version, 1)
	require.ErrorContains(t, err, "final price rule is the default fallback")
}

func TestCreateOfficialPriceDraftAcceptsValidatedBusinessRules(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 18, ModelName: "valid-video-rules"}).Error)

	version := model.OfficialModelPriceVersion{
		ModelId:        18,
		BillingMode:    "video_duration",
		PriceStructure: "tiered",
		PriceComponents: `{"schema_version":"v2","rules":[` +
			`{"name":"short","component":"video_output","unit":"second","unit_size":"1","unit_price":"0.4","upper_bound":"60"},` +
			`{"name":"default","component":"video_output","unit":"second","unit_size":"1","unit_price":"0.2"}` +
			`]}`,
		BillingExpr:             `v2:video_s <= 60 ? tier("short", video_s * 0.4) : tier("default", video_s * 0.2)`,
		ExpressionSchemaVersion: "v2",
		Currency:                "USD",
		Source:                  "manual",
	}
	require.NoError(t, CreateOfficialPriceVersion(&version, 1))
	assert.NotZero(t, version.Id)
}
