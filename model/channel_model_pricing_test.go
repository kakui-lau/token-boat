package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func resetChannelModelPricingTestTables(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(
		&Ability{},
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
	} {
		require.NoError(t, DB.Exec("DELETE FROM "+table).Error)
	}
}

func TestInitializeChannelModelsFromAbilitiesKeepsLegacyRuntimeAndAggregatesGroups(t *testing.T) {
	resetChannelModelPricingTestTables(t)

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
	assert.Equal(t, "gpt-test", channelModel.UpstreamModelName)
	assert.Equal(t, 1, channelModel.Status)
	assert.Equal(t, int64(20), channelModel.Priority)
	assert.Equal(t, uint(30), channelModel.Weight)
	assert.Equal(t, "legacy", channelModel.RuntimeMode)
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
