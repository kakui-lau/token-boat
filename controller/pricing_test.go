package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestScopePricingPreservesModelsOutsideUsableGroups(t *testing.T) {
	pricing := []model.Pricing{
		{ModelName: "default-model", EnableGroup: []string{"default", "staff"}},
		{ModelName: "staff-model", EnableGroup: []string{"staff"}},
		{ModelName: "catalog-only-model", EnableGroup: []string{}},
		{ModelName: "all-model", EnableGroup: []string{"all"}},
	}

	scoped := scopePricingByUsableGroups(pricing, map[string]string{"default": "Default"})

	require.Len(t, scoped, 4)
	assert.Equal(t, []string{"default"}, scoped[0].EnableGroup)
	assert.Empty(t, scoped[1].EnableGroup)
	assert.Empty(t, scoped[2].EnableGroup)
	assert.Equal(t, []string{"all"}, scoped[3].EnableGroup)
}

func TestMarkPricingAvailabilityRequiresRouteAndRetailPrice(t *testing.T) {
	price := &model.PublicPriceSummary{Currency: "USD"}
	pricing := []model.Pricing{
		{
			ModelName: "available", EnableGroup: []string{"default"},
			LowestPrice: price, PricingSource: "v2_dynamic",
		},
		{
			ModelName: "expression-only", EnableGroup: []string{"default"},
			PricingSource: "v2_dynamic",
		},
		{ModelName: "missing-price", EnableGroup: []string{"default"}},
		{
			ModelName: "missing-route", EnableGroup: []string{},
			LowestPrice: price, PricingSource: "v2_dynamic",
		},
	}

	marked := markPricingAvailability(pricing)

	assert.True(t, marked[0].Available)
	assert.Equal(t, model.PricingAvailabilityAvailable, marked[0].AvailabilityStatus)
	assert.True(t, marked[1].Available)
	assert.Equal(t, model.PricingAvailabilityAvailable, marked[1].AvailabilityStatus)
	assert.False(t, marked[2].Available)
	assert.Equal(t, model.PricingAvailabilityPriceUnavailable, marked[2].AvailabilityStatus)
	assert.False(t, marked[3].Available)
	assert.Equal(t, model.PricingAvailabilityRouteUnavailable, marked[3].AvailabilityStatus)
}
