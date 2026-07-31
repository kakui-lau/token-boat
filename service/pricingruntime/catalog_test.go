package pricingruntime

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service/pricingengine"
	hosttypes "github.com/QuantumNous/new-api/types"
	"github.com/glebarez/sqlite"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupRuntimeCatalogTestDB(t *testing.T) {
	t.Helper()
	originalDB := model.DB
	common.OptionMapRWMutex.Lock()
	originalOptions := common.OptionMap
	common.OptionMap = map[string]string{}
	common.OptionMapRWMutex.Unlock()
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
		&model.RequestPricingSnapshot{},
		&model.PricingCircuitEvent{},
	))
	InvalidateCatalog()
	t.Cleanup(func() {
		InvalidateCatalog()
		model.DB = originalDB
		common.OptionMapRWMutex.Lock()
		common.OptionMap = originalOptions
		common.OptionMapRWMutex.Unlock()
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
		PurchaseExprHash: billingexpr.ExprHashString(
			`v2:tier("base", p * 1 / 1000000)`,
		),
		ExpressionSchemaVersion: "v2",
		Currency:                "USD", Version: 1, Status: model.PricingVersionStatusActive,
	}
	require.NoError(t, model.DB.Create(&purchase).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModelRetailPriceVersion{
		Id: channelModelId, ChannelModelId: channelModelId, PurchasePriceVersionId: purchase.Id,
		BillingMode: "token", PriceStructure: "flat",
		RetailBillingExpr: `v2:tier("base", p * 2 / 1000000)`,
		RetailExprHash: billingexpr.ExprHashString(
			`v2:tier("base", p * 2 / 1000000)`,
		),
		ExpressionSchemaVersion: "v2",
		Currency:                "USD", Version: 1, Status: model.PricingVersionStatusActive,
		TotalVariableCostRate: "0", EffectiveTaxRate: "0",
		MinimumMarginRate: "0.1", TargetNetMargin: "0.2",
	}).Error)
}

func setRuntimeModeForTest(t *testing.T, channelModelId int, runtimeMode string) {
	t.Helper()
	result := model.DB.Model(&model.ChannelModel{}).
		Where("id = ?", channelModelId).
		Update("runtime_mode", runtimeMode)
	require.NoError(t, result.Error)
	require.Equal(t, int64(1), result.RowsAffected)
	InvalidateCatalog()
	require.NoError(t, RefreshCatalog())
}

func TestValidateV2ActivationRejectsIncompletePriceChain(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 1, ModelName: "incomplete"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 1, ChannelId: 1, ModelId: 1, UpstreamModelName: "incomplete",
		Status: 1, RuntimeMode: RuntimeModeLegacy,
	}).Error)

	_, err := ValidateV2Activation(1)
	require.ErrorContains(t, err, "no active purchase price")

	var stored model.ChannelModel
	require.NoError(t, model.DB.First(&stored, 1).Error)
	assert.Equal(t, RuntimeModeLegacy, stored.RuntimeMode)
}

func TestSetModelRuntimeModeAllowsVideoDurationPricing(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 9, RuntimeModeLegacy)
	require.NoError(t, model.DB.Model(&model.ChannelModelPurchasePriceVersion{}).
		Where("id = ?", 9).
		Update("billing_mode", "video_duration").Error)
	require.NoError(t, model.DB.Model(&model.ChannelModelRetailPriceVersion{}).
		Where("id = ?", 9).
		Update("billing_mode", "video_duration").Error)

	updated, err := SetModelRuntimeMode("runtime-model", RuntimeModeV2)
	require.NoError(t, err)
	assert.Equal(t, 1, updated)

	var stored model.ChannelModel
	require.NoError(t, model.DB.First(&stored, 9).Error)
	assert.Equal(t, RuntimeModeV2, stored.RuntimeMode)
}

func TestSetModelRuntimeModeActivatesAllEnabledChannelsAtomically(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 1, RuntimeModeLegacy)
	createRuntimeBundle(t, 2, RuntimeModeLegacy)
	require.NoError(t, model.DB.Model(&model.ChannelModel{}).
		Where("id = ?", 2).
		Update("model_id", 1).Error)

	updated, err := SetModelRuntimeMode("runtime-model", RuntimeModeV2)
	require.NoError(t, err)
	assert.Equal(t, 2, updated)

	var channelModels []model.ChannelModel
	require.NoError(t, model.DB.Order("id").Find(&channelModels).Error)
	require.Len(t, channelModels, 2)
	assert.Equal(t, RuntimeModeV2, channelModels[0].RuntimeMode)
	assert.Equal(t, RuntimeModeV2, channelModels[1].RuntimeMode)
}

func TestSetModelRuntimeModeLeavesEveryChannelLegacyWhenOnePriceChainIsIncomplete(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 1, RuntimeModeLegacy)
	createRuntimeBundle(t, 2, RuntimeModeLegacy)
	require.NoError(t, model.DB.Model(&model.ChannelModel{}).
		Where("id = ?", 2).
		Update("model_id", 1).Error)
	require.NoError(t, model.DB.Delete(
		&model.ChannelModelRetailPriceVersion{},
		2,
	).Error)

	updated, err := SetModelRuntimeMode("runtime-model", RuntimeModeV2)
	assert.Zero(t, updated)
	require.ErrorContains(t, err, "channel model 2 is not ready for V2")

	var v2Count int64
	require.NoError(t, model.DB.Model(&model.ChannelModel{}).
		Where("runtime_mode = ?", RuntimeModeV2).
		Count(&v2Count).Error)
	assert.Zero(t, v2Count)
}

func TestSetModelRuntimeModeRejectsMismatchedCandidateBillingContracts(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 1, RuntimeModeLegacy)
	createRuntimeBundle(t, 2, RuntimeModeLegacy)
	require.NoError(t, model.DB.Model(&model.ChannelModel{}).
		Where("id = ?", 2).
		Update("model_id", 1).Error)
	require.NoError(t, model.DB.Model(&model.ChannelModelPurchasePriceVersion{}).
		Where("id = ?", 2).
		Update("billing_mode", "video_duration").Error)
	require.NoError(t, model.DB.Model(&model.ChannelModelRetailPriceVersion{}).
		Where("id = ?", 2).
		Update("billing_mode", "video_duration").Error)

	updated, err := SetModelRuntimeMode("runtime-model", RuntimeModeV2)
	assert.Zero(t, updated)
	require.ErrorContains(t, err, "billing contract does not match")

	var v2Count int64
	require.NoError(t, model.DB.Model(&model.ChannelModel{}).
		Where("runtime_mode = ?", RuntimeModeV2).
		Count(&v2Count).Error)
	assert.Zero(t, v2Count)
}

func TestSetModelRuntimeModeRejectsCorruptedExpressionHash(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 18, RuntimeModeLegacy)
	require.NoError(t, model.DB.Model(&model.ChannelModelRetailPriceVersion{}).
		Where("id = ?", 18).
		Update("retail_expr_hash", billingexpr.ExprHashString(`v2:tier("other", req)`)).Error)

	updated, err := SetModelRuntimeMode("runtime-model", RuntimeModeV2)
	assert.Zero(t, updated)
	require.ErrorContains(t, err, "retail price expression hash does not match")
}

func TestSetModelRuntimeModeRejectsLegacyOfficialPriceReference(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 20, RuntimeModeLegacy)
	legacyExpression := `v1:tier("base", p * 2)`
	official := model.OfficialModelPriceVersion{
		ModelId:                 20,
		BillingMode:             "token",
		PriceStructure:          "flat",
		BillingExpr:             legacyExpression,
		ExprHash:                billingexpr.ExprHashString(legacyExpression),
		ExpressionSchemaVersion: "v1",
		Currency:                "USD",
		Version:                 1,
		Status:                  model.PricingVersionStatusActive,
	}
	require.NoError(t, model.DB.Create(&official).Error)
	require.NoError(t, model.DB.Model(&model.ChannelModelPurchasePriceVersion{}).
		Where("id = ?", 20).
		Update("official_price_version_id", official.Id).Error)

	updated, err := SetModelRuntimeMode("runtime-model", RuntimeModeV2)
	assert.Zero(t, updated)
	require.ErrorContains(t, err, "requires a published v2 official price")
}

func TestSetModelRuntimeModeRejectsRatioPricingWithoutOfficialPrice(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 21, RuntimeModeLegacy)
	require.NoError(t, model.DB.Model(&model.ChannelModelPurchasePriceVersion{}).
		Where("id = ?", 21).
		Update("pricing_mode", "official_ratio").Error)

	updated, err := SetModelRuntimeMode("runtime-model", RuntimeModeV2)
	assert.Zero(t, updated)
	require.ErrorContains(t, err, "ratio pricing requires a published official price")
}

func TestSetModelRuntimeModeRejectsOfficialPriceFromDifferentModel(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 22, RuntimeModeLegacy)
	expression := `v2:tier("base", p * 2 / 1000000)`
	official := model.OfficialModelPriceVersion{
		ModelId: 999, BillingMode: "token", PriceStructure: "flat",
		BillingExpr: expression, ExprHash: billingexpr.ExprHashString(expression),
		ExpressionSchemaVersion: "v2", Currency: "USD",
		Version: 1, Status: model.PricingVersionStatusActive,
	}
	require.NoError(t, model.DB.Create(&official).Error)
	require.NoError(t, model.DB.Model(&model.ChannelModelPurchasePriceVersion{}).
		Where("id = ?", 22).
		Updates(map[string]any{
			"pricing_mode":              "official_ratio",
			"official_price_version_id": official.Id,
		}).Error)

	updated, err := SetModelRuntimeMode("runtime-model", RuntimeModeV2)
	assert.Zero(t, updated)
	require.ErrorContains(t, err, "belong to different logical models")
}

func TestSetModelRuntimeModeRejectsExpressionThatFailsSmokeExecution(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 19, RuntimeModeLegacy)
	invalidAtRuntime := `v2:tier("base", 1 / req)`
	require.NoError(t, model.DB.Model(&model.ChannelModelRetailPriceVersion{}).
		Where("id = ?", 19).
		Updates(map[string]any{
			"retail_billing_expr": invalidAtRuntime,
			"retail_expr_hash":    billingexpr.ExprHashString(invalidAtRuntime),
		}).Error)

	updated, err := SetModelRuntimeMode("runtime-model", RuntimeModeV2)
	assert.Zero(t, updated)
	require.ErrorContains(t, err, "smoke test")
}

func TestRefreshCatalogRejectsMismatchedCandidateBillingContracts(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 1, RuntimeModeV2)
	createRuntimeBundle(t, 2, RuntimeModeV2)
	require.NoError(t, model.DB.Model(&model.ChannelModel{}).
		Where("id = ?", 2).
		Update("model_id", 1).Error)
	require.NoError(t, model.DB.Model(&model.ChannelModelPurchasePriceVersion{}).
		Where("id = ?", 2).
		Update("price_structure", "expression").Error)
	require.NoError(t, model.DB.Model(&model.ChannelModelRetailPriceVersion{}).
		Where("id = ?", 2).
		Update("price_structure", "expression").Error)

	require.NoError(t, RefreshCatalog())
	assert.False(t, HasCompleteV2Pricing("default", "runtime-model"))
}

func TestPrepareRelayPricingRequiresVideoDurationUsage(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 9, RuntimeModeV2)
	purchaseExpr := `v2:tier("video", video_s * 0.04)`
	retailExpr := `v2:tier("video", video_s * 0.08)`
	require.NoError(t, model.DB.Model(&model.ChannelModelPurchasePriceVersion{}).
		Where("id = ?", 9).
		Updates(map[string]any{
			"billing_mode":          "video_duration",
			"purchase_billing_expr": purchaseExpr,
			"purchase_expr_hash":    billingexpr.ExprHashString(purchaseExpr),
		}).Error)
	require.NoError(t, model.DB.Model(&model.ChannelModelRetailPriceVersion{}).
		Where("id = ?", 9).
		Updates(map[string]any{
			"billing_mode":        "video_duration",
			"retail_billing_expr": retailExpr,
			"retail_expr_hash":    billingexpr.ExprHashString(retailExpr),
		}).Error)
	require.NoError(t, RefreshCatalog())

	info := &relaycommon.RelayInfo{
		RequestId: "video-duration-missing",
		UserId:    9, OriginModelName: "runtime-model",
	}
	_, ok, err := PrepareRelayPricing(
		info,
		"default",
		9,
		0,
		0,
		hosttypes.GroupRatioInfo{GroupRatio: 1},
		billingexpr.RequestInput{},
		pricingengine.Usage{RequestCount: 1},
	)
	require.NoError(t, err)
	assert.False(t, ok)

	info.RequestId = "video-duration-valid"
	priceData, ok, err := PrepareRelayPricing(
		info,
		"default",
		9,
		0,
		0,
		hosttypes.GroupRatioInfo{GroupRatio: 1},
		billingexpr.RequestInput{},
		pricingengine.Usage{RequestCount: 1, VideoSeconds: 10},
	)
	require.NoError(t, err)
	require.True(t, ok)
	assert.Equal(t, int(0.8*common.QuotaPerUnit), priceData.QuotaToPreConsume)
}

func TestPrepareRelayPricingMixedModeRequiresReferencedDurations(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 10, RuntimeModeV2)
	purchaseExpr := `v2:tier("mixed", p * 1 / 1000000 + video_s * 0.04)`
	retailExpr := `v2:tier("mixed", p * 2 / 1000000 + video_s * 0.08)`
	require.NoError(t, model.DB.Model(&model.ChannelModelPurchasePriceVersion{}).
		Where("id = ?", 10).
		Updates(map[string]any{
			"billing_mode":          "mixed",
			"purchase_billing_expr": purchaseExpr,
			"purchase_expr_hash":    billingexpr.ExprHashString(purchaseExpr),
		}).Error)
	require.NoError(t, model.DB.Model(&model.ChannelModelRetailPriceVersion{}).
		Where("id = ?", 10).
		Updates(map[string]any{
			"billing_mode":        "mixed",
			"retail_billing_expr": retailExpr,
			"retail_expr_hash":    billingexpr.ExprHashString(retailExpr),
		}).Error)
	require.NoError(t, RefreshCatalog())
	assert.False(t, SupportsFixedVideoTaskPricing("default", "runtime-model"))

	info := &relaycommon.RelayInfo{
		RequestId: "mixed-duration-missing",
		UserId:    10, OriginModelName: "runtime-model",
	}
	_, ok, err := PrepareRelayPricing(
		info,
		"default",
		10,
		1_000_000,
		0,
		hosttypes.GroupRatioInfo{GroupRatio: 1},
		billingexpr.RequestInput{},
		pricingengine.Usage{RequestCount: 1},
	)
	require.NoError(t, err)
	assert.False(t, ok)

	info.RequestId = "mixed-duration-valid"
	priceData, ok, err := PrepareRelayPricing(
		info,
		"default",
		10,
		1_000_000,
		0,
		hosttypes.GroupRatioInfo{GroupRatio: 1},
		billingexpr.RequestInput{},
		pricingengine.Usage{RequestCount: 1, VideoSeconds: 10},
	)
	require.NoError(t, err)
	require.True(t, ok)
	assert.Equal(t, int(2.8*common.QuotaPerUnit), priceData.QuotaToPreConsume)
}

func TestSupportsFixedVideoTaskPricingAllowsRequestAndDurationOnly(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 12, RuntimeModeV2)
	purchaseExpr := `v2:tier("video", req * 0.01 + video_s * 0.04)`
	retailExpr := `v2:tier("video", req * 0.02 + video_s * 0.08)`
	require.NoError(t, model.DB.Model(&model.ChannelModelPurchasePriceVersion{}).
		Where("id = ?", 12).
		Updates(map[string]any{
			"billing_mode":          "mixed",
			"purchase_billing_expr": purchaseExpr,
			"purchase_expr_hash":    billingexpr.ExprHashString(purchaseExpr),
		}).Error)
	require.NoError(t, model.DB.Model(&model.ChannelModelRetailPriceVersion{}).
		Where("id = ?", 12).
		Updates(map[string]any{
			"billing_mode":        "mixed",
			"retail_billing_expr": retailExpr,
			"retail_expr_hash":    billingexpr.ExprHashString(retailExpr),
		}).Error)
	require.NoError(t, RefreshCatalog())

	assert.True(t, SupportsFixedVideoTaskPricing("default", "runtime-model"))
}

func TestImageBillingUsesBoundedImageCountForReserveAndSettlement(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 11, RuntimeModeLegacy)
	purchaseExpr := `v2:tier("image", images * 0.02)`
	retailExpr := `v2:tier("image", images * 0.04)`
	require.NoError(t, model.DB.Model(&model.ChannelModelPurchasePriceVersion{}).
		Where("id = ?", 11).
		Updates(map[string]any{
			"billing_mode":          "image",
			"purchase_billing_expr": purchaseExpr,
			"purchase_expr_hash":    billingexpr.ExprHashString(purchaseExpr),
		}).Error)
	require.NoError(t, model.DB.Model(&model.ChannelModelRetailPriceVersion{}).
		Where("id = ?", 11).
		Updates(map[string]any{
			"billing_mode":        "image",
			"retail_billing_expr": retailExpr,
			"retail_expr_hash":    billingexpr.ExprHashString(retailExpr),
		}).Error)
	setRuntimeModeForTest(t, 11, RuntimeModeV2)

	info := &relaycommon.RelayInfo{
		RequestId: "request-v2-image", UserId: 9, OriginModelName: "runtime-model",
	}
	priceData, ok, err := PrepareRelayPricing(
		info,
		"default",
		11,
		1,
		1584,
		hosttypes.GroupRatioInfo{GroupRatio: 1},
		billingexpr.RequestInput{},
		pricingengine.Usage{RequestCount: 1, ImageCount: 3},
	)
	require.NoError(t, err)
	require.True(t, ok)
	assert.Equal(t, common.QuotaFromFloat(0.12*common.QuotaPerUnit), priceData.QuotaToPreConsume)

	require.NoError(t, CreateRequestPricingSnapshot(info))
	require.NoError(t, SettleRequestPricingSnapshot(info, &dto.Usage{
		PromptTokens: 1, TotalTokens: 1,
	}, priceData.QuotaToPreConsume))
	var snapshot model.RequestPricingSnapshot
	require.NoError(t, model.DB.Where("request_id = ?", info.RequestId).First(&snapshot).Error)
	assert.Equal(t, "image", snapshot.BillingMode)
	assert.Equal(t, "0.06", snapshot.PurchaseCost)
	assert.Equal(t, "0.12", snapshot.RetailAmount)
	assert.Contains(t, snapshot.ActualUsage, `"image_count":3`)
}

func TestAudioDurationBillingRequiresKnownDuration(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 14, RuntimeModeLegacy)
	purchaseExpr := `v2:tier("audio", audio_s * 0.006)`
	retailExpr := `v2:tier("audio", audio_s * 0.01)`
	require.NoError(t, model.DB.Model(&model.ChannelModelPurchasePriceVersion{}).
		Where("id = ?", 14).
		Updates(map[string]any{
			"billing_mode":          "audio_duration",
			"purchase_billing_expr": purchaseExpr,
			"purchase_expr_hash":    billingexpr.ExprHashString(purchaseExpr),
		}).Error)
	require.NoError(t, model.DB.Model(&model.ChannelModelRetailPriceVersion{}).
		Where("id = ?", 14).
		Updates(map[string]any{
			"billing_mode":        "audio_duration",
			"retail_billing_expr": retailExpr,
			"retail_expr_hash":    billingexpr.ExprHashString(retailExpr),
		}).Error)
	setRuntimeModeForTest(t, 14, RuntimeModeV2)

	info := &relaycommon.RelayInfo{
		RequestId: "request-v2-audio", UserId: 9, OriginModelName: "runtime-model",
	}
	priceData, ok, err := PrepareRelayPricing(
		info,
		"default",
		14,
		1500,
		0,
		hosttypes.GroupRatioInfo{GroupRatio: 1},
		billingexpr.RequestInput{},
		pricingengine.Usage{RequestCount: 1, AudioSeconds: 90},
	)
	require.NoError(t, err)
	require.True(t, ok)
	assert.Equal(t, common.QuotaFromFloat(0.9*common.QuotaPerUnit), priceData.QuotaToPreConsume)

	_, ok, err = PrepareRelayPricing(
		&relaycommon.RelayInfo{OriginModelName: "runtime-model"},
		"default",
		14,
		0,
		0,
		hosttypes.GroupRatioInfo{GroupRatio: 1},
		billingexpr.RequestInput{},
		pricingengine.Usage{RequestCount: 1},
	)
	require.NoError(t, err)
	assert.False(t, ok)
}

func TestCatalogContainsOnlyValidatedV2Bundles(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 2, RuntimeModeLegacy)
	setRuntimeModeForTest(t, 2, RuntimeModeV2)

	bundle, ok := GetActiveBundle(2)
	require.True(t, ok)
	assert.Equal(t, 2, bundle.Retail.Id)
	assert.Len(t, bundle.Revision, 64)

	setRuntimeModeForTest(t, 2, RuntimeModeLegacy)
	_, ok = GetActiveBundle(2)
	assert.False(t, ok)
}

func TestRuntimeReadinessRequiresEveryEnabledChannelForScope(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 2, RuntimeModeV2)
	createRuntimeBundle(t, 3, RuntimeModeLegacy)

	readiness, err := GetRuntimeReadiness()
	require.NoError(t, err)
	assert.Equal(t, int64(2), readiness.TotalChannelModels)
	assert.Equal(t, int64(1), readiness.V2ChannelModels)
	assert.Zero(t, readiness.CompleteGroupModelScopes)
	assert.False(t, readiness.LiveTrafficEnabled)

	setRuntimeModeForTest(t, 3, RuntimeModeV2)
	readiness, err = GetRuntimeReadiness()
	require.NoError(t, err)
	assert.Equal(t, 1, readiness.CompleteGroupModelScopes)
	assert.True(t, readiness.LiveTrafficEnabled)
}

func TestCatalogSnapshotStaysFrozenUntilInvalidated(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 3, RuntimeModeV2)
	require.NoError(t, RefreshCatalog())

	before, ok := GetActiveBundle(3)
	require.True(t, ok)
	updatedExpr := `v2:tier("base", p * 3 / 1000000)`
	require.NoError(t, model.DB.Exec(
		"UPDATE channel_model_retail_price_versions SET retail_billing_expr = ?, retail_expr_hash = ? WHERE id = ?",
		updatedExpr,
		billingexpr.ExprHashString(updatedExpr),
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

func TestQuoteRetailRangeAppliesGroupRatioAndExcludesBelowMargin(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 15, RuntimeModeV2)
	createRuntimeBundle(t, 16, RuntimeModeV2)
	require.NoError(t, model.DB.Model(&model.ChannelModel{}).
		Where("id = ?", 16).
		Update("model_id", 15).Error)
	lowMarginExpr := `v2:tier("base", p * 1.05 / 1000000)`
	require.NoError(t, model.DB.Model(&model.ChannelModelRetailPriceVersion{}).
		Where("id = ?", 16).
		Updates(map[string]any{
			"retail_billing_expr": lowMarginExpr,
			"retail_expr_hash":    billingexpr.ExprHashString(lowMarginExpr),
		}).Error)
	require.NoError(t, RefreshCatalog())

	quoteRange, err := QuoteRetailRange(
		"default",
		"runtime-model",
		pricingengine.Usage{PromptTokens: 1_000_000},
		1.5,
	)
	require.NoError(t, err)
	assert.Equal(t, "USD", quoteRange.Currency)
	assert.Equal(t, "3", quoteRange.MinimumRetailAmount)
	assert.Equal(t, "3", quoteRange.MaximumReservationAmount)
	assert.Equal(t, 1, quoteRange.EligibleCandidateCount)

	_, err = QuoteRetailRange(
		"default",
		"runtime-model",
		pricingengine.Usage{PromptTokens: 1_000_000},
		-1,
	)
	require.ErrorContains(t, err, "finite non-negative")
}

func TestPrepareRelayPricingReservesHighestCandidateAndFreezesSelectedPrice(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 5, RuntimeModeV2)
	createRuntimeBundle(t, 6, RuntimeModeV2)
	require.NoError(t, model.DB.Exec(
		"UPDATE channel_model_purchase_price_versions SET purchase_billing_expr = ?, purchase_expr_hash = ? WHERE id = ?",
		`v2:tier("base", p * 0.5 / 1000000)`,
		billingexpr.ExprHashString(`v2:tier("base", p * 0.5 / 1000000)`),
		6,
	).Error)
	require.NoError(t, model.DB.Exec(
		"UPDATE channel_model_retail_price_versions SET retail_billing_expr = ?, retail_expr_hash = ? WHERE id = ?",
		`v2:tier("base", p * 4 / 1000000)`,
		billingexpr.ExprHashString(`v2:tier("base", p * 4 / 1000000)`),
		6,
	).Error)
	require.NoError(t, RefreshCatalog())
	info := &relaycommon.RelayInfo{OriginModelName: "runtime-model"}

	priceData, ok, err := PrepareRelayPricing(
		info,
		"default",
		5,
		1_000_000,
		0,
		hosttypes.GroupRatioInfo{GroupRatio: 1},
		billingexpr.RequestInput{},
		pricingengine.Usage{RequestCount: 1},
	)
	require.NoError(t, err)
	require.True(t, ok)
	assert.Equal(t, 4*int(common.QuotaPerUnit), priceData.QuotaToPreConsume)
	assert.Equal(t, []int{6, 5}, info.DynamicPricingSnapshot.RouteChannelIds)
	require.NotNil(t, info.DynamicPricingSnapshot.Selected)
	assert.Equal(t, 5, info.DynamicPricingSnapshot.Selected.ChannelModelId)
	assert.Contains(t, info.TieredBillingSnapshot.ExprString, "p * 2")

	require.NoError(t, BindSelectedChannel(info, 6))
	assert.Equal(t, 6, info.DynamicPricingSnapshot.Selected.ChannelModelId)
	assert.Contains(t, info.TieredBillingSnapshot.ExprString, "p * 4")
	assert.Equal(t, priceData.QuotaToPreConsume, info.TieredBillingSnapshot.EstimatedQuotaAfterGroup)
}

func TestPrepareRelayPricingUsesRequestHeadersForConditionalPrices(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 17, RuntimeModeV2)
	purchaseExpr := `v2:tier("base", req * (header("x-priority") == "fast" ? 2 : 1))`
	retailExpr := `v2:tier("base", req * (header("x-priority") == "fast" ? 4 : 2))`
	require.NoError(t, model.DB.Model(&model.ChannelModelPurchasePriceVersion{}).
		Where("id = ?", 17).
		Updates(map[string]any{
			"billing_mode":          "request",
			"purchase_billing_expr": purchaseExpr,
			"purchase_expr_hash":    billingexpr.ExprHashString(purchaseExpr),
		}).Error)
	require.NoError(t, model.DB.Model(&model.ChannelModelRetailPriceVersion{}).
		Where("id = ?", 17).
		Updates(map[string]any{
			"billing_mode":        "request",
			"retail_billing_expr": retailExpr,
			"retail_expr_hash":    billingexpr.ExprHashString(retailExpr),
		}).Error)
	require.NoError(t, RefreshCatalog())
	info := &relaycommon.RelayInfo{OriginModelName: "runtime-model"}

	priceData, ok, err := PrepareRelayPricing(
		info,
		"default",
		17,
		0,
		0,
		hosttypes.GroupRatioInfo{GroupRatio: 1},
		billingexpr.RequestInput{Headers: map[string]string{"x-priority": "fast"}},
		pricingengine.Usage{RequestCount: 1},
	)
	require.NoError(t, err)
	require.True(t, ok)
	assert.Equal(t, 4*int(common.QuotaPerUnit), priceData.QuotaToPreConsume)
	require.NotNil(t, info.DynamicPricingSnapshot.Selected)
	assert.Equal(t, "4", info.DynamicPricingSnapshot.Selected.EstimatedRetailUSD)
}

func TestPrepareRelayPricingRejectsCandidatesBelowMinimumMargin(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 10, RuntimeModeV2)
	require.NoError(t, model.DB.Model(&model.ChannelModelRetailPriceVersion{}).
		Where("id = ?", 10).
		Update("minimum_margin_rate", "0.6").Error)
	require.NoError(t, RefreshCatalog())

	_, ok, err := PrepareRelayPricing(
		&relaycommon.RelayInfo{OriginModelName: "runtime-model"},
		"default",
		10,
		1_000_000,
		0,
		hosttypes.GroupRatioInfo{GroupRatio: 1},
		billingexpr.RequestInput{},
		pricingengine.Usage{RequestCount: 1},
	)
	assert.False(t, ok)
	require.ErrorContains(t, err, "no v2 candidate meets the minimum margin")
}

func TestRequestPricingSnapshotFreezesAndSettlesSelectedVersions(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 7, RuntimeModeV2)
	require.NoError(t, RefreshCatalog())
	info := &relaycommon.RelayInfo{
		RequestId: "request-v2-audit", UserId: 9, OriginModelName: "runtime-model",
	}
	_, ok, err := PrepareRelayPricing(
		info,
		"default",
		7,
		1_000_000,
		0,
		hosttypes.GroupRatioInfo{GroupRatio: 1},
		billingexpr.RequestInput{
			Body: []byte(`{"prompt":"private audit prompt","quality":"hd"}`),
		},
		pricingengine.Usage{RequestCount: 1},
	)
	require.NoError(t, err)
	require.True(t, ok)
	require.NoError(t, CreateRequestPricingSnapshot(info))

	var reserved model.RequestPricingSnapshot
	require.NoError(t, model.DB.Where("request_id = ?", info.RequestId).First(&reserved).Error)
	assert.Equal(t, PricingSnapshotStatusReserved, reserved.Status)
	assert.Equal(t, 7, reserved.PurchasePriceVersionId)
	assert.Equal(t, "token", reserved.BillingMode)
	assert.Equal(t, int64(2*int(common.QuotaPerUnit)), reserved.ReservedQuota)
	assert.NotContains(t, reserved.EstimatedUsage, "private audit prompt")
	assert.Contains(t, reserved.EstimatedUsage, `"request_body":""`)

	require.NoError(t, SettleRequestPricingSnapshot(info, &dto.Usage{
		PromptTokens: 500_000,
	}, int(common.QuotaPerUnit)))
	var settled model.RequestPricingSnapshot
	require.NoError(t, model.DB.Where("request_id = ?", info.RequestId).First(&settled).Error)
	assert.Equal(t, PricingSnapshotStatusSettled, settled.Status)
	assert.Equal(t, "token", settled.BillingMode)
	assert.Equal(t, "0.5", settled.PurchaseCost)
	assert.Equal(t, "1", settled.RetailAmount)
	assert.Equal(t, int64(common.QuotaPerUnit), settled.SettledQuota)
	assert.NotContains(t, settled.ActualUsage, "private audit prompt")
	assert.Contains(t, settled.ActualUsage, `"request_body":""`)
}

func TestProviderReportedCostReconcilesAgainstFrozenEstimate(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 27, RuntimeModeV2)
	require.NoError(t, RefreshCatalog())
	info := &relaycommon.RelayInfo{
		RequestId: "request-provider-cost", UserId: 9,
		OriginModelName: "runtime-model",
	}
	_, ok, err := PrepareRelayPricing(
		info,
		"default",
		27,
		1_000_000,
		0,
		hosttypes.GroupRatioInfo{GroupRatio: 1},
		billingexpr.RequestInput{},
		pricingengine.Usage{RequestCount: 1},
	)
	require.NoError(t, err)
	require.True(t, ok)
	require.NoError(t, CreateRequestPricingSnapshot(info))
	require.NoError(t, SettleRequestPricingSnapshot(
		info,
		&dto.Usage{PromptTokens: 500_000},
		int(common.QuotaPerUnit),
	))

	require.NoError(t, RecordProviderReportedCost(
		info.RequestId,
		decimal.RequireFromString("0.25"),
		"full_provider_cost",
	))
	require.NoError(t, RecordProviderReportedCost(
		info.RequestId,
		decimal.RequireFromString("0.25"),
		"full_provider_cost",
	))

	var snapshot model.RequestPricingSnapshot
	require.NoError(t, model.DB.Where(
		"request_id = ?",
		info.RequestId,
	).First(&snapshot).Error)
	assert.True(t, snapshot.ProviderCostKnown)
	assert.Equal(t, "0.25", snapshot.ProviderReportedCost)
	assert.Equal(t, "-0.25", snapshot.CostVariance)
	assert.Equal(t, "0.75", snapshot.GrossMargin)
	assert.Equal(t, "full_provider_cost", snapshot.ProviderCostScope)

	err = RecordProviderReportedCost(
		info.RequestId,
		decimal.RequireFromString("0.26"),
		"full_provider_cost",
	)
	require.ErrorContains(t, err, "already recorded")
}

func TestRequestPricingSnapshotRecordsCompletedRefund(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	require.NoError(t, model.DB.Create(&model.RequestPricingSnapshot{
		RequestId:      "request-refunded",
		UserId:         1,
		ModelId:        2,
		ChannelModelId: 3,
		BillingMode:    "token",
		ReservedQuota:  25,
		Status:         PricingSnapshotStatusReserved,
	}).Error)

	require.NoError(t, MarkRequestPricingRefunded("request-refunded"))

	var snapshot model.RequestPricingSnapshot
	require.NoError(t, model.DB.Where("request_id = ?", "request-refunded").First(&snapshot).Error)
	assert.Equal(t, PricingSnapshotStatusRefunded, snapshot.Status)
	assert.Zero(t, snapshot.SettledQuota)
	assert.Equal(t, "automatic_refund", snapshot.Resolution)
	assert.Positive(t, snapshot.ResolvedAt)
}

func TestRequestPricingSnapshotPendingStoresBoundedFailureReason(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	require.NoError(t, model.DB.Create(&model.RequestPricingSnapshot{
		RequestId: "request-failed", UserId: 1, ModelId: 2,
		ChannelModelId: 3, BillingMode: "token",
		Status: PricingSnapshotStatusReserved,
	}).Error)

	MarkRequestPricingPendingWithReason(
		"request-failed", "refund_failed", strings.Repeat("错", 1100),
	)

	var snapshot model.RequestPricingSnapshot
	require.NoError(t, model.DB.Where("request_id = ?", "request-failed").First(&snapshot).Error)
	assert.Equal(t, PricingSnapshotStatusPending, snapshot.Status)
	assert.Equal(t, "refund_failed", snapshot.FailureCode)
	assert.Len(t, []rune(snapshot.FailureReason), 1000)
}

func TestReconcileStaleRequestPricingSnapshotsMarksOnlyOldReservations(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	require.NoError(t, model.DB.Create([]model.RequestPricingSnapshot{
		{
			RequestId: "stale-reserved", UserId: 1, ModelId: 2,
			ChannelModelId: 3, BillingMode: "token",
			Status: PricingSnapshotStatusReserved, CreatedAt: 100,
		},
		{
			RequestId: "fresh-reserved", UserId: 1, ModelId: 2,
			ChannelModelId: 3, BillingMode: "token",
			Status: PricingSnapshotStatusReserved, CreatedAt: 200,
		},
		{
			RequestId: "already-settled", UserId: 1, ModelId: 2,
			ChannelModelId: 3, BillingMode: "token",
			Status: PricingSnapshotStatusSettled, CreatedAt: 100,
		},
	}).Error)
	require.NoError(t, model.DB.Model(&model.RequestPricingSnapshot{}).
		Where("request_id IN ?", []string{"stale-reserved", "already-settled"}).
		UpdateColumn("created_at", 100).Error)
	require.NoError(t, model.DB.Model(&model.RequestPricingSnapshot{}).
		Where("request_id = ?", "fresh-reserved").
		UpdateColumn("created_at", 200).Error)

	updated, err := ReconcileStaleRequestPricingSnapshots(150)
	require.NoError(t, err)
	assert.Equal(t, int64(1), updated)

	var stale model.RequestPricingSnapshot
	require.NoError(t, model.DB.Where("request_id = ?", "stale-reserved").First(&stale).Error)
	assert.Equal(t, PricingSnapshotStatusPending, stale.Status)
	var fresh model.RequestPricingSnapshot
	require.NoError(t, model.DB.Where("request_id = ?", "fresh-reserved").First(&fresh).Error)
	assert.Equal(t, PricingSnapshotStatusReserved, fresh.Status)
}

func TestPurgeFinalizedRequestPricingSnapshotsKeepsActiveAndAnomalousRows(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	snapshots := []model.RequestPricingSnapshot{
		{RequestId: "old-settled", Status: PricingSnapshotStatusSettled},
		{RequestId: "old-refunded", Status: PricingSnapshotStatusRefunded},
		{RequestId: "old-pending", Status: PricingSnapshotStatusPending},
		{RequestId: "old-reserved", Status: PricingSnapshotStatusReserved},
		{RequestId: "recent-settled", Status: PricingSnapshotStatusSettled},
	}
	for index := range snapshots {
		snapshots[index].UserId = 1
		snapshots[index].ModelId = 1
		snapshots[index].ChannelModelId = 1
		snapshots[index].BillingMode = "token"
		snapshots[index].Currency = "USD"
		require.NoError(t, model.DB.Create(&snapshots[index]).Error)
	}
	require.NoError(t, model.DB.Model(&model.RequestPricingSnapshot{}).
		Where("request_id <> ?", "recent-settled").
		UpdateColumn("created_at", 100).Error)
	require.NoError(t, model.DB.Model(&model.RequestPricingSnapshot{}).
		Where("request_id = ?", "recent-settled").
		UpdateColumn("created_at", 200).Error)

	deleted, err := PurgeFinalizedRequestPricingSnapshots(150, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(1), deleted)
	deleted, err = PurgeFinalizedRequestPricingSnapshots(150, 10)
	require.NoError(t, err)
	assert.Equal(t, int64(1), deleted)

	var remaining []string
	require.NoError(t, model.DB.Model(&model.RequestPricingSnapshot{}).
		Order("request_id ASC").
		Pluck("request_id", &remaining).Error)
	assert.Equal(t, []string{
		"old-pending",
		"old-reserved",
		"recent-settled",
	}, remaining)
}

func TestPlanV2RouteOrdersByPurchaseCostBeforePriority(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 8, RuntimeModeV2)
	createRuntimeBundle(t, 9, RuntimeModeV2)
	require.NoError(t, model.DB.Exec(
		"UPDATE channel_model_purchase_price_versions SET purchase_billing_expr = ?, purchase_expr_hash = ? WHERE id = ?",
		`v2:tier("base", p * 0.5 / 1000000)`,
		billingexpr.ExprHashString(`v2:tier("base", p * 0.5 / 1000000)`),
		9,
	).Error)
	require.NoError(t, model.DB.Model(&model.ChannelModel{}).
		Where("id = ?", 8).
		UpdateColumn("priority", 100).Error)
	require.NoError(t, RefreshCatalog())

	candidates, err := PlanV2Route("default", "runtime-model")
	require.NoError(t, err)
	require.Len(t, candidates, 2)
	assert.Equal(t, 9, candidates[0].ChannelModelId)
	assert.Equal(t, 8, candidates[1].ChannelModelId)
}

func TestRouteScoringBalancesCostReliabilityLatencyAndQuality(t *testing.T) {
	channelCircuits.Lock()
	originalStates := channelCircuits.byChannelId
	channelCircuits.byChannelId = map[int]channelCircuitState{
		101: {
			SuccessCount:     20,
			FailureCount:     30,
			AverageLatencyMs: 2500,
		},
		102: {
			SuccessCount:     500,
			FailureCount:     2,
			AverageLatencyMs: 200,
		},
	}
	channelCircuits.Unlock()
	t.Cleanup(func() {
		channelCircuits.Lock()
		channelCircuits.byChannelId = originalStates
		channelCircuits.Unlock()
	})
	candidates := []RouteCandidate{
		{
			ChannelId: 101, PurchaseCost: decimal.RequireFromString("0.8"),
			QualityScore: 20,
		},
		{
			ChannelId: 102, PurchaseCost: decimal.RequireFromString("1"),
			QualityScore: 100,
		},
	}

	scoreRouteCandidates(candidates)
	sortRouteCandidates(candidates)

	assert.Equal(t, 102, candidates[0].ChannelId)
	assert.Greater(t, candidates[0].RouteScore, candidates[1].RouteScore)
	assert.Greater(t, candidates[0].SuccessRate, candidates[1].SuccessRate)
	assert.Less(t, candidates[0].LatencyMs, candidates[1].LatencyMs)
}

func TestRouteScoreWeightsAreConfigurableAndNormalized(t *testing.T) {
	t.Setenv("PRICING_ROUTE_COST_WEIGHT", "2")
	t.Setenv("PRICING_ROUTE_SUCCESS_WEIGHT", "1")
	t.Setenv("PRICING_ROUTE_LATENCY_WEIGHT", "1")
	t.Setenv("PRICING_ROUTE_QUALITY_WEIGHT", "0")

	weights := GetRouteScoreWeights()

	assert.Equal(t, 0.5, weights.Cost)
	assert.Equal(t, 0.25, weights.Success)
	assert.Equal(t, 0.25, weights.Latency)
	assert.Equal(t, float64(0), weights.Quality)
}

func TestRouteScoreWeightsRejectAllZeroConfiguration(t *testing.T) {
	t.Setenv("PRICING_ROUTE_COST_WEIGHT", "0")
	t.Setenv("PRICING_ROUTE_SUCCESS_WEIGHT", "0")
	t.Setenv("PRICING_ROUTE_LATENCY_WEIGHT", "0")
	t.Setenv("PRICING_ROUTE_QUALITY_WEIGHT", "0")

	assert.Equal(t, RouteScoreWeights{
		Cost: 0.5, Success: 0.25, Latency: 0.15, Quality: 0.1,
	}, GetRouteScoreWeights())
}

func TestMixedLegacyAndV2CandidatesFallBackAsOneModel(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 10, RuntimeModeV2)
	createRuntimeBundle(t, 11, RuntimeModeLegacy)
	require.NoError(t, RefreshCatalog())

	assert.Empty(t, GetCandidateBundles("default", "runtime-model"))
	candidates, err := PlanV2Route("default", "runtime-model")
	require.NoError(t, err)
	assert.Empty(t, candidates)
}

func TestApplyV2RetailPricingPublishesActiveRetailExpression(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 12, RuntimeModeV2)
	require.NoError(t, RefreshCatalog())

	result := ApplyV2RetailPricing([]model.Pricing{{
		ModelName: "runtime-model", BillingMode: "ratio", PricingVersion: "legacy",
	}}, map[string]string{"default": "Default"})

	require.Len(t, result, 1)
	assert.Equal(t, "tiered_expr", result[0].BillingMode)
	assert.Contains(t, result[0].BillingExpr, "p * 2")
	assert.Equal(t, "v2_dynamic", result[0].PricingSource)
	assert.Len(t, result[0].PricingVersion, 64)
}
