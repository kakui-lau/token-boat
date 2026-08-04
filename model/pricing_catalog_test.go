package model

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPublicPricingIncludesActiveExactModelWithoutAbility(t *testing.T) {
	resetPricingEndpointTestTables(t)

	require.NoError(t, DB.Create(&Model{
		Id:        201,
		ModelName: "catalog-only-model",
		Status:    1,
		NameRule:  NameRuleExact,
	}).Error)
	require.NoError(t, DB.Create(&Model{
		Id:        202,
		ModelName: "disabled-catalog-model",
		Status:    1,
		NameRule:  NameRuleExact,
	}).Error)
	require.NoError(t, DB.Model(&Model{}).
		Where("id = ?", 202).
		Update("status", 0).Error)
	require.NoError(t, DB.Create(&Model{
		Id:        203,
		ModelName: "catalog-prefix-",
		Status:    1,
		NameRule:  NameRulePrefix,
	}).Error)
	targetID := 201
	require.NoError(t, DB.Create(&Model{
		Id:                   205,
		ModelName:            "internal-system-alias",
		Status:               1,
		NameRule:             NameRuleExact,
		Visibility:           ModelVisibilityInternal,
		ModelPurpose:         ModelPurposeApprovalReview,
		RoutingTargetModelId: &targetID,
	}).Error)

	catalog := pricingByModelName(GetPublicPricing())

	require.Contains(t, catalog, "catalog-only-model")
	assert.Equal(t, 201, catalog["catalog-only-model"].ID)
	assert.Empty(t, catalog["catalog-only-model"].EnableGroup)
	assert.NotContains(t, catalog, "disabled-catalog-model")
	assert.NotContains(t, catalog, "catalog-prefix-")
	assert.NotContains(t, catalog, "internal-system-alias")
	assert.NotContains(t, pricingByModelName(GetPricing()), "catalog-only-model")
}

func TestPublicPricingRefreshesImmediatelyAfterModelInsert(t *testing.T) {
	resetPricingEndpointTestTables(t)
	insertPricingEndpointChannel(t, 204, constant.ChannelTypeOpenAI, dto.ChannelOtherSettings{})
	insertPricingEndpointAbility(t, 204, "routable-model")
	require.NotContains(t, pricingByModelName(GetPublicPricing()), "new-catalog-model")

	logicalModel := &Model{
		ModelName:    "new-catalog-model",
		Status:       1,
		SyncOfficial: 1,
		NameRule:     NameRuleExact,
	}
	require.NoError(t, logicalModel.Insert())

	assert.Contains(t, pricingByModelName(GetPublicPricing()), "new-catalog-model")
}

func pricingByModelName(pricings []Pricing) map[string]Pricing {
	result := make(map[string]Pricing, len(pricings))
	for _, pricing := range pricings {
		result[pricing.ModelName] = pricing
	}
	return result
}
