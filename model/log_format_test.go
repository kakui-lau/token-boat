package model

import (
	"fmt"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/gin-gonic/gin"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestRecordConsumeLogAlwaysRecordsSourceIP(t *testing.T) {
	truncateTables(t)
	previousAlwaysRecordIP := constant.AlwaysRecordIp
	constant.AlwaysRecordIp = true
	t.Cleanup(func() { constant.AlwaysRecordIp = previousAlwaysRecordIP })
	user := &User{
		Username: "ip-log-user",
		Password: "password",
		Status:   common.UserStatusEnabled,
		Setting:  `{"record_ip_log":false}`,
	}
	require.NoError(t, DB.Create(user).Error)

	request := httptest.NewRequest("POST", "/v1/chat/completions", nil)
	request.RemoteAddr = "203.0.113.46:32100"
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = request
	context.Set("username", user.Username)
	context.Set(common.RequestIdKey, "request-with-source-ip")

	RecordConsumeLog(context, user.Id, RecordConsumeLogParams{ModelName: "test-model", Quota: 1})

	var recorded Log
	require.NoError(t, LOG_DB.Where("request_id = ?", "request-with-source-ip").First(&recorded).Error)
	assert.Equal(t, "203.0.113.46", recorded.Ip)
}

func TestRecordTaskBillingLogKeepsOriginatingRequestIP(t *testing.T) {
	truncateTables(t)
	previousAlwaysRecordIP := constant.AlwaysRecordIp
	constant.AlwaysRecordIp = true
	t.Cleanup(func() { constant.AlwaysRecordIp = previousAlwaysRecordIP })
	require.NoError(t, createLog(&Log{
		UserId:    77,
		Type:      LogTypeConsume,
		TaskId:    "task-source-ip",
		Ip:        "203.0.113.47",
		CreatedAt: 100,
	}))

	RecordTaskBillingLog(RecordTaskBillingLogParams{
		UserId:  77,
		LogType: LogTypeRefund,
		TaskId:  "task-source-ip",
		Quota:   10,
	})

	var logs []Log
	require.NoError(t, LOG_DB.Where("user_id = ? AND task_id = ?", 77, "task-source-ip").Order("created_at asc").Find(&logs).Error)
	require.Len(t, logs, 2)
	assert.Equal(t, "203.0.113.47", logs[1].Ip)
}

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

func TestFormatUserLogsStripsInternalRoutingButKeepsUserTraceContext(t *testing.T) {
	logs := []*Log{{
		ChannelId:         17,
		Ip:                "203.0.113.24",
		RequestId:         "req-user-visible",
		UpstreamRequestId: "trace-service-visible",
		Other: common.MapToJsonStr(map[string]interface{}{
			"requested_model_name": "public-model",
			"resolved_model_name":  "internal-model",
			"upstream_model_name":  "provider-model",
			"is_model_mapped":      true,
			"request_conversion":   []string{"OpenAI Compatible", "Provider Format"},
			"upstream_task_id":     "provider-task-42",
			"expr_b64":             "ZXhwcg==",
			"matched_tier":         "internal-tier",
			"quota_per_unit":       500000,
			"billing_mode":         "tiered_expr",
			"task_id":              "task_public_42",
			"reasoning_effort":     "high",
			"stream_status":        map[string]interface{}{"status": "completed"},
		})}}

	formatUserLogs(logs, 0)

	parsed, err := common.StrToMap(logs[0].Other)
	require.NoError(t, err)
	assert.Zero(t, logs[0].ChannelId)
	assert.Equal(t, "203.0.113.24", logs[0].Ip)
	assert.Equal(t, "req-user-visible", logs[0].RequestId)
	assert.Equal(t, "trace-service-visible", logs[0].UpstreamRequestId)
	assert.NotContains(t, parsed, "requested_model_name")
	assert.NotContains(t, parsed, "resolved_model_name")
	assert.NotContains(t, parsed, "upstream_model_name")
	assert.NotContains(t, parsed, "is_model_mapped")
	assert.NotContains(t, parsed, "request_conversion")
	assert.NotContains(t, parsed, "upstream_task_id")
	assert.NotContains(t, parsed, "expr_b64")
	assert.NotContains(t, parsed, "matched_tier")
	assert.Equal(t, float64(500000), parsed["quota_per_unit"])
	assert.Equal(t, "tiered_expr", parsed["billing_mode"])
	assert.Equal(t, "task_public_42", parsed["task_id"])
	assert.Equal(t, "high", parsed["reasoning_effort"])
	assert.Contains(t, parsed, "stream_status")
}

func TestGetUserLogsScopesSeparateRequestActivityAndBillingRecords(t *testing.T) {
	truncateTables(t)
	for logType := LogTypeTopup; logType <= LogTypeLogin; logType++ {
		require.NoError(t, LOG_DB.Create(&Log{
			UserId:    71,
			Type:      logType,
			CreatedAt: int64(logType),
			RequestId: fmt.Sprintf("scope-%d", logType),
		}).Error)
	}

	testCases := []struct {
		name     string
		scope    string
		expected []int
	}{
		{name: "request", scope: "request", expected: []int{LogTypeConsume, LogTypeError}},
		{name: "activity", scope: "activity", expected: []int{LogTypeManage, LogTypeSystem, LogTypeLogin}},
		{name: "billing", scope: "billing", expected: []int{LogTypeTopup, LogTypeRefund}},
		{name: "backward compatible all", scope: "", expected: []int{LogTypeTopup, LogTypeConsume, LogTypeManage, LogTypeSystem, LogTypeError, LogTypeRefund, LogTypeLogin}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			logs, total, err := GetUserLogs(71, LogTypeUnknown, 0, 0, "", "", 0, 20, "", "", "", testCase.scope, "asc")
			require.NoError(t, err)
			assert.Equal(t, int64(len(testCase.expected)), total)
			actual := make([]int, 0, len(logs))
			for _, log := range logs {
				actual = append(actual, log.Type)
			}
			assert.Equal(t, testCase.expected, actual)
		})
	}
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
		0, 0,
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

func TestUpdateTaskConsumeLogDetailsCanRetryCompletedAudit(t *testing.T) {
	truncateTables(t)
	log := &Log{
		UserId: 1,
		Type:   LogTypeConsume,
		TaskId: "task_billing_audit_retry",
		Other: common.MapToJsonStr(map[string]interface{}{
			"billing_stage":        "completed",
			"customer_final_quota": 500,
		}),
	}
	require.NoError(t, LOG_DB.Create(log).Error)

	require.NoError(t, UpdateTaskConsumeLogDetails(
		log.TaskId,
		map[string]interface{}{"task_status": "SUCCESS"},
		map[string]interface{}{"provider_cost_status": "estimated"},
		0, 0,
	))

	var updated Log
	require.NoError(t, LOG_DB.First(&updated, log.Id).Error)
	var other map[string]interface{}
	require.NoError(t, common.UnmarshalJsonStr(updated.Other, &other))
	require.Equal(t, "completed", other["billing_stage"])
	require.Equal(t, "SUCCESS", other["task_status"])
	adminInfo, ok := other["admin_info"].(map[string]interface{})
	require.True(t, ok)
	require.Equal(t, "estimated", adminInfo["provider_cost_status"])
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

	stat, err := SumUsedQuota(LogTypeUnknown, 0, 0, "billing-model", "net-usage-user", "", 0, "", "", "")

	require.NoError(t, err)
	require.Equal(t, int64(60), stat.Quota)
}

func TestGetUserUsageAnalyticsReturnsDailyAndModelFacts(t *testing.T) {
	truncateTables(t)
	const day = int64(86_400)
	logs := []*Log{
		{
			UserId: 88, Type: LogTypeConsume, ModelName: "model-a", TokenId: 11, TokenName: "Production", Quota: 100,
			PromptTokens: 10, CompletionTokens: 5, CreatedAt: day + 60, RequestId: "request-a",
			Other: common.MapToJsonStr(map[string]interface{}{"response_time_ms": 250, "cache_tokens": 4}),
		},
		{
			UserId: 88, Type: LogTypeError, ModelName: "model-a", TokenId: 11, TokenName: "Production", CreatedAt: day + 120,
		},
		{
			UserId: 88, Type: LogTypeConsume, ModelName: "model-b", TokenId: 12, TokenName: "Batch", Quota: 200,
			PromptTokens: 20, CompletionTokens: 10, CreatedAt: 2*day + 60, RequestId: "request-b",
			Other: common.MapToJsonStr(map[string]interface{}{"response_time_ms": 750, "cache_tokens": 8}),
		},
		{
			UserId: 99, Type: LogTypeConsume, ModelName: "other-user", Quota: 999,
			CreatedAt: day + 60, Other: common.MapToJsonStr(map[string]interface{}{"response_time_ms": 1}),
		},
	}
	for _, log := range logs {
		require.NoError(t, createLog(log))
	}

	analytics, err := GetUserUsageAnalytics(88, day, 3*day-1, 0)

	require.NoError(t, err)
	assert.Equal(t, int64(300), analytics.Quota)
	assert.Equal(t, int64(2), analytics.RequestCount)
	assert.Equal(t, int64(1), analytics.FailureCount)
	assert.Equal(t, int64(45), analytics.TotalTokens)
	assert.Equal(t, int64(12), analytics.CacheHitTokens)
	assert.InDelta(t, float64(12)/45, analytics.CacheHitRate, 0.000_001)
	assert.Equal(t, int64(1), analytics.PeakRpm)
	assert.Equal(t, int64(30), analytics.PeakTpm)
	require.NotNil(t, analytics.AverageLatencyMs)
	assert.Equal(t, float64(500), *analytics.AverageLatencyMs)
	require.Len(t, analytics.Series, 2)
	assert.Equal(t, day, analytics.Series[0].DayStart)
	assert.Equal(t, day, analytics.Series[0].BucketSeconds)
	assert.Equal(t, int64(1), analytics.Series[0].RequestCount)
	assert.Equal(t, int64(1), analytics.Series[0].FailureCount)
	assert.Equal(t, int64(100), analytics.Series[0].Quota)
	assert.Equal(t, int64(4), analytics.Series[0].CacheHitTokens)
	require.Len(t, analytics.Models, 2)
	assert.Equal(t, "model-b", analytics.Models[0].ModelName)
	assert.Equal(t, int64(200), analytics.Models[0].Quota)
	assert.Equal(t, "model-a", analytics.Models[1].ModelName)
	assert.Equal(t, int64(1), analytics.Models[1].FailureCount)
	require.Len(t, analytics.APIKeys, 2)
	assert.Equal(t, 12, analytics.APIKeys[0].TokenID)
	assert.Equal(t, "Batch", analytics.APIKeys[0].TokenName)
	assert.Equal(t, int64(200), analytics.APIKeys[0].Quota)
	assert.Equal(t, 11, analytics.APIKeys[1].TokenID)
	assert.Equal(t, int64(1), analytics.APIKeys[1].FailureCount)
}

func TestGetUserUsageAnalyticsAppliesRequestFiltersAndCustomBucket(t *testing.T) {
	truncateTables(t)
	const day = int64(86_400)
	logs := []*Log{
		{
			UserId: 101, Type: LogTypeConsume, ModelName: "model-a", TokenName: "Production",
			RequestId: "request-a", UpstreamRequestId: "trace-a", Quota: 100,
			PromptTokens: 10, CompletionTokens: 5, CreatedAt: day + 60,
			Other: common.MapToJsonStr(map[string]interface{}{"cache_tokens": 4}),
		},
		{
			UserId: 101, Type: LogTypeError, ModelName: "model-a", TokenName: "Production",
			RequestId: "request-a", UpstreamRequestId: "trace-a", CreatedAt: day + 120,
		},
		{
			UserId: 101, Type: LogTypeConsume, ModelName: "model-b", TokenName: "Batch",
			RequestId: "request-b", UpstreamRequestId: "trace-b", Quota: 200,
			PromptTokens: 20, CompletionTokens: 10, CreatedAt: day + 420,
		},
	}
	for _, log := range logs {
		require.NoError(t, createLog(log))
	}

	analytics, err := GetUserUsageAnalyticsWithQuery(101, UserUsageAnalyticsQuery{
		StartTimestamp:    day,
		EndTimestamp:      day + 600,
		BucketSeconds:     300,
		ModelName:         "%model-a%",
		TokenName:         "Production",
		RequestID:         "request-a",
		UpstreamRequestID: "trace-a",
	})

	require.NoError(t, err)
	assert.Equal(t, int64(1), analytics.RequestCount)
	assert.Equal(t, int64(1), analytics.FailureCount)
	assert.Equal(t, 0.5, analytics.FailureRate)
	assert.Equal(t, int64(15), analytics.TotalTokens)
	assert.Equal(t, int64(4), analytics.CacheHitTokens)
	assert.Equal(t, int64(1), analytics.PeakRpm)
	assert.Equal(t, int64(15), analytics.PeakTpm)
	require.Len(t, analytics.Series, 1)
	assert.Equal(t, day, analytics.Series[0].DayStart)
	assert.Equal(t, int64(300), analytics.Series[0].BucketSeconds)
}

func TestGetUserRequestLogEnforcesOwnershipAndRequestScope(t *testing.T) {
	truncateTables(t)
	require.NoError(t, createLog(&Log{
		UserId: 91, Type: LogTypeManage, RequestId: "shared-request", CreatedAt: 1,
	}))
	require.NoError(t, createLog(&Log{
		UserId: 92, Type: LogTypeConsume, RequestId: "shared-request", CreatedAt: 2,
	}))
	require.NoError(t, createLog(&Log{
		UserId: 91, Type: LogTypeConsume, RequestId: "owned-request", CreatedAt: 3,
		ChannelId: 7,
		Other: common.MapToJsonStr(map[string]interface{}{
			"request_path": "/v1/chat/completions",
			"admin_info":   map[string]interface{}{"provider_cost_usd": 1.25},
		}),
	}))

	log, err := GetUserRequestLog(91, "owned-request")

	require.NoError(t, err)
	assert.Equal(t, "owned-request", log.RequestId)
	assert.Zero(t, log.ChannelId)
	other, err := common.StrToMap(log.Other)
	require.NoError(t, err)
	assert.Equal(t, "/v1/chat/completions", other["request_path"])
	assert.NotContains(t, other, "admin_info")
	_, err = GetUserRequestLog(91, "shared-request")
	assert.ErrorIs(t, err, gorm.ErrRecordNotFound)
}
