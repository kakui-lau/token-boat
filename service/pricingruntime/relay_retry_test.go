package pricingruntime

import (
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	hosttypes "github.com/QuantumNous/new-api/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBindSelectedChannelUsesFrozenRetryPrice(t *testing.T) {
	const frozenSalesExpression = `v2:tier("base", req * 2)`
	info := &relaycommon.RelayInfo{
		OriginModelName: "retry-model",
		PriceData: hosttypes.PriceData{
			QuotaToPreConsume: 300,
		},
		DynamicPricingSnapshot: &hosttypes.DynamicPricingSnapshot{
			ReservationQuota: 300,
			QuotaPerUnit:     100,
			CandidatesByChannelId: map[int]hosttypes.DynamicPriceCandidate{
				11: {
					ChannelId:                  11,
					SalesExpression:            frozenSalesExpression,
					SalesExpressionHash:        "frozen-hash",
					SalesPriceBookVersionId:    501,
					PurchasePriceVersion:       601,
					EstimatedCustomerChargeUSD: "2",
				},
				12: {
					ChannelId:                  12,
					SalesExpression:            frozenSalesExpression,
					SalesExpressionHash:        "frozen-hash",
					SalesPriceBookVersionId:    501,
					PurchasePriceVersion:       602,
					EstimatedCustomerChargeUSD: "2.5",
				},
			},
		},
	}

	require.NoError(t, BindSelectedChannel(info, 12))
	require.NotNil(t, info.DynamicPricingSnapshot.Selected)
	assert.Equal(t, 12, info.DynamicPricingSnapshot.Selected.ChannelId)
	assert.Equal(t, 501, info.DynamicPricingSnapshot.Selected.SalesPriceBookVersionId)
	assert.Equal(t, 602, info.DynamicPricingSnapshot.Selected.PurchasePriceVersion)
	assert.Equal(t, frozenSalesExpression, info.TieredBillingSnapshot.ExprString)
	assert.Equal(t, 300, info.PriceData.QuotaToPreConsume)
	assert.Equal(t, 250, info.PriceData.Quota)
}
