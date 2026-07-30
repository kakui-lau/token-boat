package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/types"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestInjectGeneralBillingAuditRecordsReconciliation(t *testing.T) {
	relayInfo := &relaycommon.RelayInfo{
		FinalPreConsumedQuota: 90,
		PriceData: types.PriceData{
			QuotaToPreConsume: 100,
		},
	}
	other := map[string]interface{}{}

	InjectGeneralBillingAudit(other, relayInfo, 75, nil)

	assert.Equal(t, "completed", other["billing_stage"])
	assert.Equal(t, 100, other["local_estimated_quota"])
	assert.Equal(t, 90, other["actual_pre_consumed_quota"])
	assert.Equal(t, 75, other["customer_final_quota"])
	assert.Equal(t, -15, other["adjustment_quota"])
	_, hasAdminInfo := other["admin_info"]
	assert.False(t, hasAdminInfo)
}

func TestInjectGeneralBillingAuditRecordsV2VersionLineageAsAdminOnly(t *testing.T) {
	relayInfo := &relaycommon.RelayInfo{
		DynamicPricingSnapshot: &types.DynamicPricingSnapshot{
			Selected: &types.DynamicPriceCandidate{
				ChannelModelId: 4, PurchasePriceVersion: 5, RetailPriceVersion: 6,
				PricingRevision: "revision", EstimatedPurchaseUSD: "0.4",
				EstimatedRetailUSD: "0.8", BillingMode: "video_duration",
			},
		},
	}
	other := map[string]interface{}{}

	InjectGeneralBillingAudit(other, relayInfo, 10, nil)

	assert.Equal(t, "v2_dynamic", other["billing_mode"])
	adminInfo, ok := other["admin_info"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, 4, adminInfo["channel_model_id"])
	assert.Equal(t, "video_duration", adminInfo["pricing_billing_mode"])
	assert.Equal(t, 5, adminInfo["purchase_price_version_id"])
	assert.Equal(t, 6, adminInfo["retail_price_version_id"])
	assert.Equal(t, "revision", adminInfo["pricing_revision"])
}

func TestInjectGeneralBillingAuditRecordsOpenRouterSupplierCost(t *testing.T) {
	isByok := false
	relayInfo := &relaycommon.RelayInfo{
		PriceData: types.PriceData{QuotaToPreConsume: 200},
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType: constant.ChannelTypeOpenRouter,
		},
	}
	other := map[string]interface{}{
		"admin_info": map[string]interface{}{"use_channel": []string{"3"}},
	}
	usage := &dto.Usage{Cost: 0.25, IsByok: &isByok}
	finalQuota := int(common.QuotaPerUnit)

	InjectGeneralBillingAudit(other, relayInfo, finalQuota, usage)

	adminInfo, ok := other["admin_info"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, []string{"3"}, adminInfo["use_channel"])
	assert.Equal(t, 0.25, adminInfo["provider_cost_usd"])
	assert.Equal(t, true, adminInfo["provider_cost_known"])
	assert.Equal(t, false, adminInfo["provider_is_byok"])
	assert.InDelta(t, 0.75, adminInfo["gross_margin_usd"], 1e-9)
}

func TestInjectGeneralBillingAuditDoesNotTreatOtherProviderCostAsMoney(t *testing.T) {
	relayInfo := &relaycommon.RelayInfo{
		FinalPreConsumedQuota: 50,
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType: constant.ChannelTypeOpenAI,
		},
	}
	other := map[string]interface{}{}

	InjectGeneralBillingAudit(other, relayInfo, 40, &dto.Usage{Cost: 0.25})

	assert.Equal(t, 50, other["local_estimated_quota"])
	assert.Equal(t, 40, other["customer_final_quota"])
	_, hasAdminInfo := other["admin_info"]
	assert.False(t, hasAdminInfo)
}

func TestInjectGeneralBillingAuditReportsActualChargeWhenSettlementFails(t *testing.T) {
	relayInfo := &relaycommon.RelayInfo{
		FinalPreConsumedQuota: 80,
		SettlementStatus:      "failed",
		SettlementError:       "insufficient quota",
		PriceData:             types.PriceData{QuotaToPreConsume: 100},
	}
	other := map[string]interface{}{}

	InjectGeneralBillingAudit(other, relayInfo, 120, nil)

	assert.Equal(t, "settlement_failed", other["billing_stage"])
	assert.Equal(t, 80, other["customer_final_quota"])
	assert.Equal(t, 0, other["adjustment_quota"])
	assert.Equal(t, 40, other["outstanding_quota"])
	adminInfo, ok := other["admin_info"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, "insufficient quota", adminInfo["settlement_error"])
}

func TestInjectGeneralBillingAuditDoesNotClaimCompleteByokMargin(t *testing.T) {
	isByok := true
	relayInfo := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{ChannelType: constant.ChannelTypeOpenRouter},
	}
	other := map[string]interface{}{}

	InjectGeneralBillingAudit(other, relayInfo, int(common.QuotaPerUnit), &dto.Usage{Cost: 0.1, IsByok: &isByok})

	adminInfo, ok := other["admin_info"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, "platform_fee_only", adminInfo["provider_cost_scope"])
	assert.Equal(t, false, adminInfo["gross_margin_known"])
	assert.NotContains(t, adminInfo, "gross_margin_usd")
}
