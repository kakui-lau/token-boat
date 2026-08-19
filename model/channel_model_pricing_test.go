package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBackfillProviderCostTrackingClassifiesLegacySnapshots(t *testing.T) {
	resetChannelModelPricingTestTables(t)
	require.NoError(t, DB.Create([]Channel{
		{Id: 301, Name: "openai-compatible", Type: constant.ChannelTypeOpenAI},
		{Id: 302, Name: "openrouter", Type: constant.ChannelTypeOpenRouter},
	}).Error)
	require.NoError(t, DB.Create([]Model{
		{Id: 301, ModelName: "estimated-model"},
		{Id: 302, ModelName: "reported-model"},
	}).Error)
	require.NoError(t, DB.Create([]ChannelModel{
		{Id: 301, ChannelId: 301, ModelId: 301, UpstreamModelName: "estimated-model"},
		{Id: 302, ChannelId: 302, ModelId: 302, UpstreamModelName: "reported-model"},
	}).Error)
	require.NoError(t, DB.Create([]RequestPricingSnapshot{
		{
			RequestId: "legacy-estimated", UserId: 1, ModelId: 301, ChannelModelId: 301,
			PurchasePriceVersionId: 1, RetailPriceVersionId: 1, BillingMode: "token",
			PurchaseCost: "0.1", RetailAmount: "0.2", Currency: "USD", Status: "settled",
		},
		{
			RequestId: "legacy-pending", UserId: 1, ModelId: 302, ChannelModelId: 302,
			PurchasePriceVersionId: 1, RetailPriceVersionId: 1, BillingMode: "token",
			PurchaseCost: "0.1", RetailAmount: "0.2", Currency: "USD", Status: "settled",
		},
		{
			RequestId: "legacy-confirmed", UserId: 1, ModelId: 302, ChannelModelId: 302,
			PurchasePriceVersionId: 1, RetailPriceVersionId: 1, BillingMode: "token",
			PurchaseCost: "0.1", ProviderReportedCost: "0.11", ProviderCostKnown: true,
			RetailAmount: "0.2", Currency: "USD", Status: "settled",
		},
	}).Error)
	require.NoError(t, DB.Model(&Channel{}).Where("id IN ?", []int{301, 302}).
		Update("provider_cost_mode", "").Error)
	require.NoError(t, DB.Model(&RequestPricingSnapshot{}).
		Where("request_id IN ?", []string{"legacy-estimated", "legacy-pending", "legacy-confirmed"}).
		Updates(map[string]any{
			"provider_cost_mode":         "",
			"provider_cost_status":       "",
			"provider_cost_source":       "",
			"provider_cost_confirmed_at": 0,
		}).Error)

	require.NoError(t, BackfillProviderCostTracking())

	var channels []Channel
	require.NoError(t, DB.Where("id IN ?", []int{301, 302}).Order("id").Find(&channels).Error)
	require.Len(t, channels, 2)
	assert.Equal(t, ProviderCostModeEstimated, channels[0].ProviderCostMode)
	assert.Equal(t, ProviderCostModeResponseReported, channels[1].ProviderCostMode)
	var snapshots []RequestPricingSnapshot
	require.NoError(t, DB.Where(
		"request_id IN ?",
		[]string{"legacy-estimated", "legacy-pending", "legacy-confirmed"},
	).Order("request_id").Find(&snapshots).Error)
	require.Len(t, snapshots, 3)
	assert.Equal(t, ProviderCostStatusConfirmed, snapshots[0].ProviderCostStatus)
	assert.Equal(t, ProviderCostSourceLegacy, snapshots[0].ProviderCostSource)
	assert.Positive(t, snapshots[0].ProviderCostConfirmedAt)
	assert.Equal(t, ProviderCostStatusEstimated, snapshots[1].ProviderCostStatus)
	assert.Equal(t, ProviderCostStatusPending, snapshots[2].ProviderCostStatus)
}

func resetChannelModelPricingTestTables(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(
		&Ability{},
		&Channel{},
		&Model{},
		&ChannelModel{},
		&OfficialModelPriceVersion{},
		&ChannelModelPurchasePriceVersion{},
		&ChannelModelRetailPriceVersion{},
		&RequestPricingSnapshot{},
	))
	for _, table := range []string{
		"request_pricing_snapshots",
		"channel_model_retail_price_versions",
		"channel_model_purchase_price_versions",
		"official_model_price_versions",
		"channel_models",
		"abilities",
		"models",
		"channels",
	} {
		require.NoError(t, DB.Exec("DELETE FROM "+table).Error)
	}
}

func TestSearchChannelsByRoutingAbilityUsesLogicalModelAndExactGroup(t *testing.T) {
	resetChannelModelPricingTestTables(t)

	mapping := `{"openai/gpt-test":"provider-gpt-test"}`
	relevantPriority := int64(20)
	otherPriority := int64(10)
	require.NoError(t, DB.Create([]Channel{
		{
			Id: 401, Name: "mapped-internal", Status: common.ChannelStatusEnabled,
			Models: "provider-gpt-test", Group: "internal-model", ModelMapping: &mapping,
			Priority: &relevantPriority,
		},
		{
			Id: 402, Name: "mapped-public", Status: common.ChannelStatusEnabled,
			Models: "provider-gpt-test", Group: "default", ModelMapping: &mapping,
			Priority: &otherPriority,
		},
	}).Error)
	require.NoError(t, DB.Create([]Ability{
		{Group: "internal-model", Model: "openai/gpt-test", ChannelId: 401, Enabled: true},
		{Group: "default", Model: "openai/gpt-test", ChannelId: 402, Enabled: true},
	}).Error)

	channels, err := SearchChannelsByRoutingAbility("internal-model", "openai/gpt-test", false)
	require.NoError(t, err)
	require.Len(t, channels, 1)
	assert.Equal(t, 401, channels[0].Id)
	assert.Equal(t, "mapped-internal", channels[0].Name)
}

func TestInitializeChannelModelsFromAbilitiesKeepsLegacyRuntimeAndAggregatesGroups(t *testing.T) {
	resetChannelModelPricingTestTables(t)

	modelMapping := `{"gpt-test":"provider-gpt-test"}`
	require.NoError(t, DB.Create(&Channel{
		Id:           201,
		Name:         "mapped-channel",
		ModelMapping: &modelMapping,
	}).Error)
	require.NoError(t, DB.Create(&Model{Id: 101, ModelName: "gpt-test"}).Error)
	priorityLow := int64(5)
	priorityHigh := int64(20)
	require.NoError(t, DB.Create([]Ability{
		{
			Group:     "default",
			Model:     "gpt-test",
			ChannelId: 201,
			Enabled:   true,
			Priority:  &priorityLow,
			Weight:    10,
		},
		{
			Group:     "vip",
			Model:     "gpt-test",
			ChannelId: 201,
			Enabled:   false,
			Priority:  &priorityHigh,
			Weight:    30,
		},
		{
			Group:     "default",
			Model:     "missing-model",
			ChannelId: 201,
			Enabled:   true,
		},
	}).Error)

	result, err := InitializeChannelModelsFromAbilities()
	require.NoError(t, err)
	assert.Equal(t, 1, result.Created)
	assert.Equal(t, 1, result.SkippedUnknown)
	assert.Equal(t, []string{"missing-model"}, result.UnknownModelNames)

	var channelModel ChannelModel
	require.NoError(t, DB.First(&channelModel).Error)
	assert.Equal(t, 201, channelModel.ChannelId)
	assert.Equal(t, 101, channelModel.ModelId)
	assert.Equal(t, "provider-gpt-test", channelModel.UpstreamModelName)
	assert.Equal(t, 1, channelModel.Status)
	assert.Equal(t, int64(20), channelModel.Priority)
	assert.Equal(t, uint(30), channelModel.Weight)
	assert.Equal(t, "legacy", channelModel.RuntimeMode)
}

func TestInitializeChannelModelsFromAbilitiesRepairsLegacyUpstreamModelName(t *testing.T) {
	resetChannelModelPricingTestTables(t)

	modelMapping := `{"gpt-test":"provider-gpt-test"}`
	require.NoError(t, DB.Create(&Channel{
		Id:           201,
		Name:         "mapped-channel",
		ModelMapping: &modelMapping,
	}).Error)
	require.NoError(t, DB.Create(&Model{Id: 101, ModelName: "gpt-test"}).Error)
	require.NoError(t, DB.Create(&Ability{
		Group:     "default",
		Model:     "gpt-test",
		ChannelId: 201,
		Enabled:   true,
	}).Error)
	require.NoError(t, DB.Create(&ChannelModel{
		ChannelId:         201,
		ModelId:           101,
		UpstreamModelName: "gpt-test",
		Status:            1,
		RuntimeMode:       "legacy",
	}).Error)

	result, err := InitializeChannelModelsFromAbilities()
	require.NoError(t, err)
	assert.Zero(t, result.Created)
	assert.Equal(t, 1, result.Updated)

	var channelModels []ChannelModel
	require.NoError(t, DB.Find(&channelModels).Error)
	require.Len(t, channelModels, 1)
	assert.Equal(t, "provider-gpt-test", channelModels[0].UpstreamModelName)
}

func TestInitializeChannelModelsFromAbilitiesDoesNotRecreateDisabledInventory(t *testing.T) {
	resetChannelModelPricingTestTables(t)

	require.NoError(t, DB.Create(&Channel{Id: 202, Name: "removed-channel"}).Error)
	require.NoError(t, DB.Create(&Model{Id: 102, ModelName: "removed-model"}).Error)
	require.NoError(t, DB.Create(&Ability{
		Group: "default", Model: "removed-model", ChannelId: 202, Enabled: false,
	}).Error)

	result, err := InitializeChannelModelsFromAbilities()
	require.NoError(t, err)
	assert.Zero(t, result.Created)

	var count int64
	require.NoError(t, DB.Model(&ChannelModel{}).Count(&count).Error)
	assert.Zero(t, count)
}

func TestPublishedOfficialPriceVersionCannotBeMutated(t *testing.T) {
	resetChannelModelPricingTestTables(t)

	version := OfficialModelPriceVersion{
		ModelId:                 101,
		BillingMode:             "token",
		PriceStructure:          "flat",
		PriceComponents:         "{}",
		BillingExpr:             "v1:tier(\"base\", p * 1 + c * 2)",
		ExprHash:                "hash",
		ExpressionSource:        "generated",
		ExpressionSchemaVersion: "v1",
		Currency:                "USD",
		Source:                  "manual",
		Version:                 1,
		Status:                  PricingVersionStatusActive,
		EffectiveFrom:           1,
	}
	require.NoError(t, DB.Create(&version).Error)

	version.Remark = "must not change"
	err := DB.Save(&version).Error
	require.ErrorContains(t, err, "published pricing versions are immutable")

	var stored OfficialModelPriceVersion
	require.NoError(t, DB.First(&stored, version.Id).Error)
	assert.Empty(t, stored.Remark)
}
