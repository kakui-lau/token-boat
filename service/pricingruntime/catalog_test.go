package pricingruntime

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service/pricingengine"
	hosttypes "github.com/QuantumNous/new-api/types"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupRuntimeCatalogTestDB(t *testing.T) {
	t.Helper()
	originalDB := model.DB
	common.OptionMapRWMutex.Lock()
	originalOptions := common.OptionMap
	common.OptionMap = map[string]string{
		"PricingV2RolloutPercent": "100",
	}
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

func TestSetRuntimeModeAllowsVideoDurationPricing(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 9, RuntimeModeLegacy)
	require.NoError(t, model.DB.Model(&model.ChannelModelPurchasePriceVersion{}).
		Where("id = ?", 9).
		Update("billing_mode", "video_duration").Error)
	require.NoError(t, model.DB.Model(&model.ChannelModelRetailPriceVersion{}).
		Where("id = ?", 9).
		Update("billing_mode", "video_duration").Error)

	err := SetRuntimeMode(9, RuntimeModeV2)
	require.NoError(t, err)

	var stored model.ChannelModel
	require.NoError(t, model.DB.First(&stored, 9).Error)
	assert.Equal(t, RuntimeModeV2, stored.RuntimeMode)
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
	require.NoError(t, SetRuntimeMode(11, RuntimeModeV2))

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
	require.NoError(t, SetRuntimeMode(14, RuntimeModeV2))

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
	require.NoError(t, SetRuntimeMode(2, RuntimeModeV2))

	bundle, ok := GetActiveBundle(2)
	require.True(t, ok)
	assert.Equal(t, 2, bundle.Retail.Id)
	assert.Len(t, bundle.Revision, 64)

	require.NoError(t, SetRuntimeMode(2, RuntimeModeLegacy))
	_, ok = GetActiveBundle(2)
	assert.False(t, ok)
}

func TestRuntimeReadinessRequiresEveryEnabledChannelForScope(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 2, RuntimeModeV2)
	createRuntimeBundle(t, 3, RuntimeModeLegacy)

	readiness, err := GetRuntimeReadiness(RolloutPolicy{Percent: 100})
	require.NoError(t, err)
	assert.Equal(t, int64(2), readiness.TotalChannelModels)
	assert.Equal(t, int64(1), readiness.V2ChannelModels)
	assert.Zero(t, readiness.CompleteGroupModelScopes)
	assert.Zero(t, readiness.EligibleGroupModelScopes)
	assert.False(t, readiness.LiveTrafficEnabled)

	require.NoError(t, SetRuntimeMode(3, RuntimeModeV2))
	readiness, err = GetRuntimeReadiness(RolloutPolicy{Percent: 100})
	require.NoError(t, err)
	assert.Equal(t, 1, readiness.CompleteGroupModelScopes)
	assert.Equal(t, 1, readiness.EligibleGroupModelScopes)
	assert.True(t, readiness.LiveTrafficEnabled)
}

func TestRuntimeReadinessAppliesRolloutFiltersButInternalUsersOverrideThem(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 4, RuntimeModeV2)
	require.NoError(t, RefreshCatalog())

	readiness, err := GetRuntimeReadiness(RolloutPolicy{
		Percent: 100,
		Models:  map[string]struct{}{"another-model": {}},
	})
	require.NoError(t, err)
	assert.Equal(t, 1, readiness.CompleteGroupModelScopes)
	assert.Zero(t, readiness.EligibleGroupModelScopes)
	assert.False(t, readiness.LiveTrafficEnabled)

	readiness, err = GetRuntimeReadiness(RolloutPolicy{
		UserIds: map[int]struct{}{42: {}},
		Models:  map[string]struct{}{"another-model": {}},
	})
	require.NoError(t, err)
	assert.Equal(t, 1, readiness.EligibleGroupModelScopes)
	assert.True(t, readiness.LiveTrafficEnabled)
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

func TestShadowComparisonDoesNotMutateActiveBillingSnapshot(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 13, RuntimeModeV2)
	require.NoError(t, RefreshCatalog())
	common.OptionMapRWMutex.Lock()
	common.OptionMap["PricingV2ShadowEnabled"] = "true"
	common.OptionMapRWMutex.Unlock()
	info := &relaycommon.RelayInfo{OriginModelName: "runtime-model"}

	comparison, err := BuildShadowComparison(
		info,
		"default",
		1_000_000,
		0,
		int(common.QuotaPerUnit),
		1,
		billingexpr.RequestInput{},
		pricingengine.Usage{RequestCount: 1},
	)
	require.NoError(t, err)
	require.NotNil(t, comparison)
	assert.Equal(t, int(common.QuotaPerUnit), comparison.LegacyReservationQuota)
	assert.Equal(t, 2*int(common.QuotaPerUnit), comparison.V2ReservationQuota)
	assert.Nil(t, info.TieredBillingSnapshot)
	assert.Nil(t, info.DynamicPricingSnapshot)
}

func TestShadowComparisonSkipsUnknownReferencedDuration(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 14, RuntimeModeV2)
	purchaseExpr := `v2:tier("mixed", p * 1 / 1000000 + video_s * 0.04)`
	retailExpr := `v2:tier("mixed", p * 2 / 1000000 + video_s * 0.08)`
	require.NoError(t, model.DB.Model(&model.ChannelModelPurchasePriceVersion{}).
		Where("id = ?", 14).
		Updates(map[string]any{
			"billing_mode":          "mixed",
			"purchase_billing_expr": purchaseExpr,
			"purchase_expr_hash":    billingexpr.ExprHashString(purchaseExpr),
		}).Error)
	require.NoError(t, model.DB.Model(&model.ChannelModelRetailPriceVersion{}).
		Where("id = ?", 14).
		Updates(map[string]any{
			"billing_mode":        "mixed",
			"retail_billing_expr": retailExpr,
			"retail_expr_hash":    billingexpr.ExprHashString(retailExpr),
		}).Error)
	require.NoError(t, RefreshCatalog())
	common.OptionMapRWMutex.Lock()
	common.OptionMap["PricingV2ShadowEnabled"] = "true"
	common.OptionMapRWMutex.Unlock()

	comparison, err := BuildShadowComparison(
		&relaycommon.RelayInfo{OriginModelName: "runtime-model"},
		"default",
		1_000_000,
		0,
		int(common.QuotaPerUnit),
		1,
		billingexpr.RequestInput{},
		pricingengine.Usage{RequestCount: 1},
	)

	require.NoError(t, err)
	assert.Nil(t, comparison)
}
