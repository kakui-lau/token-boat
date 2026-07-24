package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"

	"github.com/stretchr/testify/require"
)

// TestFormatUserLogsStripsQuotaSaturation verifies the admin-only quota
// saturation marker (nested under other.admin_info) is removed for non-admin
// log views, since formatUserLogs strips the whole admin_info object.
func TestFormatUserLogsStripsQuotaSaturation(t *testing.T) {
	other := common.MapToJsonStr(map[string]interface{}{
		"model_price": 0.004,
		"admin_info": map[string]interface{}{
			"quota_saturation": map[string]interface{}{
				"op":      "QuotaFromDecimal",
				"kind":    "overflow",
				"clamped": common.MaxQuota,
			},
		},
	})
	logs := []*Log{{Other: other}}

	formatUserLogs(logs, 0)

	parsed, err := common.StrToMap(logs[0].Other)
	require.NoError(t, err)
	_, hasAdminInfo := parsed["admin_info"]
	require.False(t, hasAdminInfo, "admin_info (and nested quota_saturation) must be stripped for non-admin views")
	// Non-admin billing fields remain visible.
	require.Contains(t, parsed, "model_price")
}

func TestFormatUserLogsStripsMisplacedConfidentialBillingFields(t *testing.T) {
	logs := []*Log{{Other: common.MapToJsonStr(map[string]interface{}{
		"customer_final_quota": 42,
		"provider_cost_usd":    0.25,
		"gross_margin_usd":     -0.1,
		"settlement_error":     "database unavailable",
	})}}

	formatUserLogs(logs, 0)

	parsed, err := common.StrToMap(logs[0].Other)
	require.NoError(t, err)
	require.Equal(t, float64(42), parsed["customer_final_quota"])
	require.NotContains(t, parsed, "provider_cost_usd")
	require.NotContains(t, parsed, "gross_margin_usd")
	require.NotContains(t, parsed, "settlement_error")
}

func TestUpdateTaskConsumeLogDetailsMergesPublicAndAdminBillingFields(t *testing.T) {
	truncateTables(t)
	log := &Log{
		UserId: 1,
		Type:   LogTypeConsume,
		TaskId: "task_billing_audit",
		Other: common.MapToJsonStr(map[string]interface{}{
			"billing_stage":         "submitted",
			"local_estimated_quota": 600,
		}),
	}
	require.NoError(t, LOG_DB.Create(log).Error)

	require.NoError(t, UpdateTaskConsumeLogDetails(
		log.TaskId,
		map[string]interface{}{"customer_final_quota": 500},
		map[string]interface{}{"provider_cost_usd": 0.4},
	))

	var updated Log
	require.NoError(t, LOG_DB.First(&updated, log.Id).Error)
	var other map[string]interface{}
	require.NoError(t, common.UnmarshalJsonStr(updated.Other, &other))
	require.Equal(t, float64(600), other["local_estimated_quota"])
	require.Equal(t, float64(500), other["customer_final_quota"])
	adminInfo, ok := other["admin_info"].(map[string]interface{})
	require.True(t, ok)
	require.Equal(t, 0.4, adminInfo["provider_cost_usd"])

	formatUserLogs([]*Log{&updated}, 0)
	var userOther map[string]interface{}
	require.NoError(t, common.UnmarshalJsonStr(updated.Other, &userOther))
	require.NotContains(t, userOther, "admin_info")
	require.Equal(t, float64(500), userOther["customer_final_quota"])
}

func TestSumUsedQuotaSubtractsRefunds(t *testing.T) {
	truncateTables(t)
	require.NoError(t, createLog(&Log{
		UserId:    1,
		Username:  "net-usage-user",
		Type:      LogTypeConsume,
		ModelName: "billing-model",
		Quota:     100,
		CreatedAt: 100,
	}))
	require.NoError(t, createLog(&Log{
		UserId:    1,
		Username:  "net-usage-user",
		Type:      LogTypeRefund,
		ModelName: "billing-model",
		Quota:     40,
		CreatedAt: 101,
	}))

	stat, err := SumUsedQuota(LogTypeUnknown, 0, 0, "billing-model", "net-usage-user", "", 0, "")

	require.NoError(t, err)
	require.Equal(t, 60, stat.Quota)
}
