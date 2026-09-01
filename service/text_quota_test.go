package service

import (
	"math"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCacheWriteTokensTotalPrefersCompleteTotal(t *testing.T) {
	summary := textQuotaSummary{
		CacheCreationTokens:   90,
		CacheCreationTokens5m: 40,
		CacheCreationTokens1h: 30,
	}
	assert.Equal(t, 90, cacheWriteTokensTotal(summary))

	summary.CacheCreationTokens = 50
	assert.Equal(t, 70, cacheWriteTokensTotal(summary))
}

func TestComposeTieredTextQuotaAddsToolSurcharge(t *testing.T) {
	relayInfo := &relaycommon.RelayInfo{
		TieredBillingSnapshot: &billingexpr.BillingSnapshot{
			ExprVersion: 2,
			GroupRatio:  1,
		},
	}
	summary := textQuotaSummary{
		ToolCallSurchargeQuota: decimal.NewFromInt(250),
	}
	result := &billingexpr.TieredResult{ActualQuotaBeforeGroup: 1000}

	assert.Equal(t, 1250, composeTieredTextQuota(relayInfo, summary, 1000, result))
}

func TestCalculateTextToolCallSurchargeMergesSameNameAndPrice(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Set("claude_web_search_requests", 3)
	relayInfo := &relaycommon.RelayInfo{
		OriginModelName: "claude-3-7-sonnet",
		ResponsesUsageInfo: &relaycommon.ResponsesUsageInfo{
			BuiltInTools: map[string]*relaycommon.BuildInToolInfo{
				dto.BuildInToolWebSearch: {CallCount: 2},
			},
		},
	}
	summary := &textQuotaSummary{ModelName: relayInfo.OriginModelName}

	surcharge := calculateTextToolCallSurcharge(ctx, relayInfo, summary)

	require.Len(t, summary.ToolSurchargeItems, 1)
	assert.Equal(t, 5, summary.ToolSurchargeItems[0].Count)
	expected := decimal.NewFromFloat(10.0 * 5 / 1000).
		Mul(decimal.NewFromFloat(common.QuotaPerUnit))
	assert.True(t, expected.Equal(surcharge), "got %s want %s", surcharge, expected)
}

func TestCalculateTextToolCallSurchargeDoesNotUseAccessGroupRatio(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	t.Cleanup(func() {
		operation_setting.DeleteToolPriceForTest(dto.BuildInToolImageGeneration)
	})
	relayInfo := &relaycommon.RelayInfo{
		OriginModelName: "gpt-5.1",
		ResponsesUsageInfo: &relaycommon.ResponsesUsageInfo{
			BuiltInTools: map[string]*relaycommon.BuildInToolInfo{
				dto.BuildInToolImageGeneration: {CallCount: 2},
			},
		},
	}
	summary := &textQuotaSummary{ModelName: relayInfo.OriginModelName}

	surcharge := calculateTextToolCallSurcharge(ctx, relayInfo, summary)
	expected := decimal.NewFromFloat(150.0).
		Mul(decimal.NewFromInt(2)).
		Div(decimal.NewFromInt(1000)).
		Mul(decimal.NewFromFloat(common.QuotaPerUnit))
	assert.True(t, expected.Equal(surcharge), "got %s want %s", surcharge, expected)
}

func TestCalculateTextToolCallSurchargeSkipsResponsesSearchInference(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	relayInfo := &relaycommon.RelayInfo{
		RelayMode:       relayconstant.RelayModeResponses,
		OriginModelName: "gpt-4o-search-preview",
	}
	summary := &textQuotaSummary{ModelName: relayInfo.OriginModelName}

	assert.True(t, calculateTextToolCallSurcharge(ctx, relayInfo, summary).IsZero())
	assert.Empty(t, summary.ToolSurchargeItems)
}

func TestMergeToolSurchargeItemsSaturatesCountOverflow(t *testing.T) {
	merged := mergeToolSurchargeItems([]ToolSurchargeItem{
		{Name: "custom_fn", Count: math.MaxInt, Price: 5},
		{Name: "custom_fn", Count: 1, Price: 5},
	})

	require.Len(t, merged, 1)
	assert.Equal(t, math.MaxInt, merged[0].Count)
}

func TestAppendToolSurchargeLogInfoUsesStructuredField(t *testing.T) {
	other := map[string]interface{}{}
	items := []ToolSurchargeItem{{Name: "web_search", Count: 2, Price: 10}}

	appendToolSurchargeLogInfo(other, items)

	assert.Equal(t, items, other["tool_surcharges"])
	assert.NotContains(t, other, "model_ratio")
}

func TestAppendTextUsageLogInfoPersistsObservedBreakdownWithoutInference(t *testing.T) {
	other := map[string]interface{}{}
	summary := textQuotaSummary{
		CacheTokens:           30,
		CacheCreationTokens:   50,
		CacheCreationTokens5m: 20,
		CacheCreationTokens1h: 30,
		ImageTokens:           7,
	}
	usage := &dto.Usage{
		InputTokens: 180,
		UsageSource: "claude_messages",
		PromptTokensDetails: dto.InputTokenDetails{
			TextTokens:  100,
			AudioTokens: 4,
		},
		CompletionTokenDetails: dto.OutputTokenDetails{
			TextTokens:  40,
			AudioTokens: 6,
		},
	}

	appendTextUsageLogInfo(other, summary, usage)

	assert.Equal(t, 30, other["cache_tokens"])
	assert.Equal(t, 50, other["cache_write_tokens"])
	assert.Equal(t, 20, other["cache_creation_tokens_5m"])
	assert.Equal(t, 30, other["cache_creation_tokens_1h"])
	assert.Equal(t, 180, other["input_tokens_total"])
	assert.Equal(t, 7, other["image_output"])
	assert.Equal(t, 100, other["text_input"])
	assert.Equal(t, 40, other["text_output"])
	assert.Equal(t, 4, other["audio_input"])
	assert.Equal(t, 6, other["audio_output"])
}

func TestAppendTextUsageLogInfoRecordsObservedZeroCacheRead(t *testing.T) {
	other := map[string]interface{}{}

	appendTextUsageLogInfo(other, textQuotaSummary{}, nil)

	assert.Equal(t, 0, other["cache_tokens"])
	assert.NotContains(t, other, "input_tokens_total")
	assert.NotContains(t, other, "cache_write_tokens")
}

func TestAppendTextUsageLogInfoRecordsCompleteInputWithoutUsageSource(t *testing.T) {
	other := map[string]interface{}{}

	appendTextUsageLogInfo(other, textQuotaSummary{}, &dto.Usage{InputTokens: 42})

	assert.Equal(t, 0, other["cache_tokens"])
	assert.Equal(t, 42, other["input_tokens_total"])
}
