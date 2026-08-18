package controller

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResolveChannelTestGroupUsesChannelPricingGroup(t *testing.T) {
	tests := []struct {
		name      string
		channel   *model.Channel
		userGroup string
		want      string
	}{
		{name: "user group belongs to channel", channel: &model.Channel{Group: "default,internal-model"}, userGroup: "internal-model", want: "internal-model"},
		{name: "admin group differs from channel", channel: &model.Channel{Group: "default"}, userGroup: "internal-model", want: "default"},
		{name: "channel group missing", channel: &model.Channel{}, userGroup: "internal-model", want: "internal-model"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			assert.Equal(t, test.want, resolveChannelTestGroup(test.channel, test.userGroup))
		})
	}
}

func TestBuildChannelTestRequestAllowsReasoningBeforeVisibleOutput(t *testing.T) {
	tests := []struct {
		name  string
		model string
	}{
		{name: "DeepSeek V4", model: "deepseek/deepseek-v4-pro"},
		{name: "GLM 5", model: "z-ai/glm-5.2"},
		{name: "ordinary chat", model: "openai/gpt-4.1"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request, ok := buildTestRequest(test.model, "", &model.Channel{}, false).(*dto.GeneralOpenAIRequest)
			require.True(t, ok)
			require.NotNil(t, request.MaxTokens)
			assert.Equal(t, uint(512), *request.MaxTokens)
			assert.Equal(t, "Reply with exactly: OK", request.Messages[0].Content)
		})
	}
}

func TestValidateChannelProxy(t *testing.T) {
	tests := []struct {
		name    string
		proxy   string
		wantErr bool
	}{
		{name: "empty"},
		{name: "http", proxy: "http://proxy.example:8080"},
		{name: "https", proxy: "https://proxy.example:8443"},
		{name: "socks5", proxy: "socks5://proxy.example"},
		{name: "socks5h", proxy: "socks5h://proxy.example:1080/"},
		{name: "unsupported", proxy: "ftp://proxy.example", wantErr: true},
		{name: "path", proxy: "socks5://proxy.example:1080/path", wantErr: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			setting, err := common.Marshal(dto.ChannelSettings{Proxy: test.proxy})
			require.NoError(t, err)
			channel := &model.Channel{
				Type:    constant.ChannelTypeOpenAI,
				Setting: common.GetPointer(string(setting)),
			}

			err = validateChannel(channel, false)

			if test.wantErr {
				require.ErrorContains(t, err, "invalid channel proxy")
				return
			}
			require.NoError(t, err)
		})
	}
}

func TestValidateChannelRequiresNewAPIBaseURL(t *testing.T) {
	tests := []struct {
		name    string
		baseURL *string
		wantErr bool
	}{
		{name: "missing", wantErr: true},
		{name: "blank", baseURL: common.GetPointer("  "), wantErr: true},
		{name: "configured", baseURL: common.GetPointer("https://new-api.example")},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			channel := &model.Channel{
				Type:    constant.ChannelTypeNewAPI,
				BaseURL: test.baseURL,
			}

			err := validateChannel(channel, false)

			if test.wantErr {
				require.ErrorContains(t, err, "New API channel base URL cannot be empty")
				return
			}
			require.NoError(t, err)
		})
	}
}

func TestValidateChannelProviderCostMode(t *testing.T) {
	channel := &model.Channel{
		Type:             constant.ChannelTypeOpenAI,
		ProviderCostMode: model.ProviderCostModeInvoice,
	}
	require.NoError(t, validateChannel(channel, false))
	assert.Equal(t, model.ProviderCostModeInvoice, channel.ProviderCostMode)

	channel.ProviderCostMode = "request_cost"
	require.ErrorContains(t, validateChannel(channel, false), "provider cost mode is invalid")
}

func TestNewAPIChannelRegistration(t *testing.T) {
	apiType, ok := common.ChannelType2APIType(constant.ChannelTypeNewAPI)

	require.True(t, ok)
	assert.Equal(t, constant.APITypeNewAPI, apiType)
	assert.Equal(t, "New API", constant.GetChannelTypeName(constant.ChannelTypeNewAPI))
	require.Greater(t, len(constant.ChannelBaseURLs), constant.ChannelTypeNewAPI)
	assert.Empty(t, constant.ChannelBaseURLs[constant.ChannelTypeNewAPI])
}

func TestResponsesCompactAPITypeSupport(t *testing.T) {
	tests := []struct {
		name    string
		apiType int
		want    bool
	}{
		{name: "OpenAI", apiType: constant.APITypeOpenAI, want: true},
		{name: "Codex", apiType: constant.APITypeCodex, want: true},
		{name: "Advanced Custom", apiType: constant.APITypeAdvancedCustom, want: true},
		{name: "Sub2API", apiType: constant.APITypeSub2API, want: true},
		{name: "New API", apiType: constant.APITypeNewAPI, want: true},
		{name: "Anthropic", apiType: constant.APITypeAnthropic, want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			assert.Equal(t, test.want, common.IsResponsesCompactAPIType(test.apiType))
		})
	}
}

func TestMultiprotocolGatewayEndpointTypes(t *testing.T) {
	want := []constant.EndpointType{
		constant.EndpointTypeOpenAI,
		constant.EndpointTypeOpenAIResponse,
		constant.EndpointTypeOpenAIResponseCompact,
		constant.EndpointTypeAnthropic,
		constant.EndpointTypeGemini,
		constant.EndpointTypeOpenAIAlphaSearch,
	}

	assert.Equal(t, want, common.GetEndpointTypesByChannelType(constant.ChannelTypeNewAPI, "gpt-5"))
	assert.Equal(t, want, common.GetEndpointTypesByChannelType(constant.ChannelTypeSub2API, "gpt-5"))
}

func TestCopyChannelRejectsInvalidLegacyProxySettings(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	settingBytes, err := common.Marshal(dto.ChannelSettings{
		Proxy: "socks5://proxy.example/legacy-path",
	})
	require.NoError(t, err)
	setting := string(settingBytes)
	origin := &model.Channel{
		Type:    constant.ChannelTypeOpenAI,
		Name:    "legacy proxy channel",
		Key:     "test-key",
		Models:  "gpt-test",
		Group:   "default",
		Setting: &setting,
	}
	require.NoError(t, db.Create(origin).Error)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", origin.Id)}}
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/channel/copy", nil)

	CopyChannel(ctx)

	assert.Contains(t, recorder.Body.String(), "invalid channel settings")
	var channelCount int64
	require.NoError(t, db.Model(&model.Channel{}).Count(&channelCount).Error)
	assert.Equal(t, int64(1), channelCount)
}

func TestDeleteChannelResetsProxyCacheWhenPreReadFails(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.Log{}))
	service.ResetProxyClientCache()
	t.Cleanup(service.ResetProxyClientCache)

	proxyURL := "http://proxy.example:8080"
	beforeDelete, err := service.GetHttpClientWithProxy(proxyURL)
	require.NoError(t, err)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Params = gin.Params{{Key: "id", Value: "999999"}}
	ctx.Request = httptest.NewRequest(http.MethodDelete, "/api/channel/999999", nil)

	DeleteChannel(ctx)

	assert.Contains(t, recorder.Body.String(), `"success":true`)
	afterDelete, err := service.GetHttpClientWithProxy(proxyURL)
	require.NoError(t, err)
	assert.NotSame(t, beforeDelete, afterDelete)
}

func TestDeleteChannelBatchReportsAndAuditsActualDeletedCount(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.Log{}))
	channel := &model.Channel{Name: "existing", Key: "test-key"}
	require.NoError(t, db.Create(channel).Error)

	requestBody, err := common.Marshal(ChannelBatch{Ids: []int{channel.Id, 999999}})
	require.NoError(t, err)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodDelete, "/api/channel/batch", bytes.NewReader(requestBody))
	ctx.Request.Header.Set("Content-Type", "application/json")

	DeleteChannelBatch(ctx)

	var response struct {
		Success bool  `json:"success"`
		Data    int64 `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.True(t, response.Success)
	assert.Equal(t, int64(1), response.Data)

	var auditLog model.Log
	require.NoError(t, db.Order("id desc").First(&auditLog).Error)
	var auditData struct {
		Operation struct {
			Params map[string]any `json:"params"`
		} `json:"op"`
	}
	require.NoError(t, common.UnmarshalJsonStr(auditLog.Other, &auditData))
	assert.Equal(t, float64(1), auditData.Operation.Params["count"])
}

func TestSettleTestQuotaUsesTieredBilling(t *testing.T) {
	info := &relaycommon.RelayInfo{
		TieredBillingSnapshot: &billingexpr.BillingSnapshot{
			BillingMode:   "tiered_expr",
			ExprString:    `param("stream") == true ? tier("stream", p * 3) : tier("base", p * 2)`,
			ExprHash:      billingexpr.ExprHashString(`param("stream") == true ? tier("stream", p * 3) : tier("base", p * 2)`),
			GroupRatio:    1,
			EstimatedTier: "stream",
			QuotaPerUnit:  common.QuotaPerUnit,
			ExprVersion:   1,
		},
		BillingRequestInput: &billingexpr.RequestInput{
			Body: []byte(`{"stream":true}`),
		},
	}

	quota, result := settleTestQuota(info, types.PriceData{
		ModelRatio:      1,
		CompletionRatio: 2,
	}, &dto.Usage{
		PromptTokens: 1000,
	})

	require.Equal(t, 1500, quota)
	require.NotNil(t, result)
	require.Equal(t, "stream", result.MatchedTier)
}

func TestBuildTestLogOtherInjectsTieredInfo(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())

	info := &relaycommon.RelayInfo{
		TieredBillingSnapshot: &billingexpr.BillingSnapshot{
			BillingMode: "tiered_expr",
			ExprString:  `tier("base", p * 2)`,
		},
		ChannelMeta: &relaycommon.ChannelMeta{},
	}
	priceData := types.PriceData{
		GroupRatioInfo: types.GroupRatioInfo{GroupRatio: 1},
	}
	usage := &dto.Usage{
		PromptTokensDetails: dto.InputTokenDetails{
			CachedTokens: 12,
		},
	}

	other := buildTestLogOther(ctx, info, priceData, usage, &billingexpr.TieredResult{
		MatchedTier: "base",
	})

	require.Equal(t, "tiered_expr", other["billing_mode"])
	require.Equal(t, "base", other["matched_tier"])
	require.NotEmpty(t, other["expr_b64"])
}

func TestResolveChannelTestUserIDUsesRequestUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Set("id", 2)

	userID, err := resolveChannelTestUserID(ctx)

	require.NoError(t, err)
	require.Equal(t, 2, userID)
}

func TestIsAsyncVideoTestModelRecognizesOpenRouterSeedance(t *testing.T) {
	require.True(t, isAsyncVideoTestModel(constant.ChannelTypeOpenRouter, "bytedance/seedance-2.0"))
	require.True(t, isAsyncVideoTestModel(constant.ChannelTypeOpenRouter, "bytedance/seedance-2.0-fast"))
	require.False(t, isAsyncVideoTestModel(constant.ChannelTypeOpenRouter, "openai/gpt-4o-mini"))
	require.False(t, isAsyncVideoTestModel(constant.ChannelTypeOpenAI, "bytedance/seedance-2.0"))
}

func TestIsMediaTestModelDetectsImageAndVideoModels(t *testing.T) {
	require.True(t, isMediaTestModel(constant.ChannelTypeOpenAI, "gpt-image-1"))
	require.True(t, isMediaTestModel(constant.ChannelTypeOpenAI, "dall-e-3"))
	require.True(t, isMediaTestModel(constant.ChannelTypeOpenAI, "flux-schnell"))
	require.True(t, isMediaTestModel(constant.ChannelTypeVolcEngine, "seedream-2.0"))
	require.True(t, isMediaTestModel(constant.ChannelTypeOpenRouter, "bytedance/seedance-2.0"))
	require.False(t, isMediaTestModel(constant.ChannelTypeOpenAI, "gpt-4o-mini"))
	require.False(t, isMediaTestModel(constant.ChannelTypeOpenAI, "text-embedding-3-small"))
	require.False(t, isMediaTestModel(constant.ChannelTypeOpenAI, "bge-reranker-v2-m3"))
}

func TestIsNonLLMTestModelDetectsEmbeddingAndRerank(t *testing.T) {
	// embedding 模型
	require.True(t, isNonLLMTestModel(constant.ChannelTypeOpenAI, "text-embedding-3-small"))
	require.True(t, isNonLLMTestModel(constant.ChannelTypeOpenAI, "text-embedding-ada-002"))
	require.True(t, isNonLLMTestModel(constant.ChannelTypeOpenAI, "m3e-base"))
	require.True(t, isNonLLMTestModel(constant.ChannelTypeOpenAI, "bge-large-zh"))
	require.True(t, isNonLLMTestModel(constant.ChannelTypeMokaAI, "bge-m3"))
	require.True(t, isNonLLMTestModel(constant.ChannelTypeOpenAI, "jina-embeddings-v3"))

	// rerank 模型
	require.True(t, isNonLLMTestModel(constant.ChannelTypeOpenAI, "bge-reranker-v2-m3"))
	require.True(t, isNonLLMTestModel(constant.ChannelTypeOpenAI, "jina-reranker-v2-base-multilingual"))
	require.True(t, isNonLLMTestModel(constant.ChannelTypeOpenAI, "RERANK-v1")) // 大小写不敏感

	// 媒体模型仍然命中
	require.True(t, isNonLLMTestModel(constant.ChannelTypeOpenAI, "gpt-image-1"))
	require.True(t, isNonLLMTestModel(constant.ChannelTypeOpenRouter, "bytedance/seedance-2.0"))

	// LLM 模型不被误判
	require.False(t, isNonLLMTestModel(constant.ChannelTypeOpenAI, "gpt-4o-mini"))
	require.False(t, isNonLLMTestModel(constant.ChannelTypeOpenAI, "claude-3-5-sonnet"))
	require.False(t, isNonLLMTestModel(constant.ChannelTypeOpenAI, "deepseek-chat"))
}

func TestFindFirstLLMTestModelSkipsNonLLMModels(t *testing.T) {
	mixed := &model.Channel{
		Type:   constant.ChannelTypeOpenAI,
		Models: "gpt-image-1,gpt-4o-mini",
	}
	require.Equal(t, "gpt-4o-mini", findFirstLLMTestModel(mixed))

	mediaOnly := &model.Channel{
		Type:   constant.ChannelTypeOpenAI,
		Models: "gpt-image-1,dall-e-3",
	}
	require.Equal(t, "", findFirstLLMTestModel(mediaOnly))

	// embedding/rerank 模型同样被跳过
	embedOnly := &model.Channel{
		Type:   constant.ChannelTypeOpenAI,
		Models: "text-embedding-3-small,bge-reranker-v2-m3",
	}
	require.Equal(t, "", findFirstLLMTestModel(embedOnly))

	// 混合 embedding + LLM 回退到 LLM
	embedAndLLM := &model.Channel{
		Type:   constant.ChannelTypeOpenAI,
		Models: "text-embedding-3-small,deepseek-chat",
	}
	require.Equal(t, "deepseek-chat", findFirstLLMTestModel(embedAndLLM))

	require.Equal(t, "", findFirstLLMTestModel(nil))
}

func TestSelectChannelsForAutomaticTestPassiveRecoveryOnlyUsesAutoDisabled(t *testing.T) {
	channels := []*model.Channel{
		{Id: 1, Status: common.ChannelStatusEnabled},
		{Id: 2, Status: common.ChannelStatusAutoDisabled},
		{Id: 3, Status: common.ChannelStatusManuallyDisabled},
	}

	selected := selectChannelsForAutomaticTest(channels, operation_setting.ChannelTestModePassiveRecovery)

	require.Len(t, selected, 1)
	require.Equal(t, 2, selected[0].Id)
}

func TestSelectChannelsForAutomaticTestScheduledSkipsManualDisabled(t *testing.T) {
	channels := []*model.Channel{
		{Id: 1, Status: common.ChannelStatusEnabled},
		{Id: 2, Status: common.ChannelStatusAutoDisabled},
		{Id: 3, Status: common.ChannelStatusManuallyDisabled},
	}

	selected := selectChannelsForAutomaticTest(channels, operation_setting.ChannelTestModeScheduledAll)

	require.Len(t, selected, 2)
	require.Equal(t, 1, selected[0].Id)
	require.Equal(t, 2, selected[1].Id)
}

func TestSelectModelProbeTargetsUsesOneTextChannelPerModelAndSkipsMedia(t *testing.T) {
	channels := []*model.Channel{
		{
			Id:     1,
			Type:   constant.ChannelTypeOpenAI,
			Status: common.ChannelStatusEnabled,
			Models: "gpt-4o-mini,gpt-image-1",
		},
		{
			Id:     2,
			Type:   constant.ChannelTypeOpenAI,
			Status: common.ChannelStatusEnabled,
			Models: "gpt-4o-mini,claude-compatible,google/gemini-3-pro-image-preview,google/gemini-3.1-flash-image-preview",
		},
		{
			Id:     3,
			Type:   constant.ChannelTypeOpenRouter,
			Status: common.ChannelStatusEnabled,
			Models: "bytedance/seedance-2.0",
		},
	}

	targets, skipped := selectModelProbeTargets(channels)

	require.Len(t, targets, 2)
	assert.Equal(t, "gpt-4o-mini", targets[0].modelName)
	assert.Equal(t, 1, targets[0].channel.Id)
	assert.Equal(t, "claude-compatible", targets[1].modelName)
	assert.Equal(t, 4, skipped)
}

func TestTestAllChannelsRejectsExistingActiveTask(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.SystemTask{}, &model.SystemTaskLock{}))

	existing, err := model.CreateSystemTask(model.SystemTaskTypeChannelTest, nil, nil)
	require.NoError(t, err)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/channel/test", nil)

	TestAllChannels(ctx)

	require.Equal(t, http.StatusConflict, recorder.Code)
	require.Contains(t, recorder.Body.String(), existing.TaskID)
	require.Contains(t, recorder.Body.String(), "已有通道测试任务正在运行或等待中")
}
