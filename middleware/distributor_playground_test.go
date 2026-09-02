package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	projecti18n "github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestApplyPlaygroundChannelSelection(t *testing.T) {
	gin.SetMode(gin.TestMode)
	require.NoError(t, projecti18n.Init())

	tests := []struct {
		name       string
		role       int
		body       string
		wantOK     bool
		wantStatus int
		wantID     string
	}{
		{name: "automatic routing when channel is omitted", role: common.RoleAdminUser, body: `{"model":"gpt-4o"}`, wantOK: true, wantStatus: http.StatusOK},
		{name: "admin selects a channel", role: common.RoleAdminUser, body: `{"model":"gpt-4o","channel_id":14}`, wantOK: true, wantStatus: http.StatusOK, wantID: "14"},
		{name: "common user cannot select a channel", role: common.RoleCommonUser, body: `{"model":"gpt-4o","channel_id":14}`, wantOK: false, wantStatus: http.StatusForbidden},
		{name: "invalid channel is rejected", role: common.RoleAdminUser, body: `{"model":"gpt-4o","channel_id":0}`, wantOK: false, wantStatus: http.StatusBadRequest},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)
			context.Request = httptest.NewRequest(http.MethodPost, "/pg/chat/completions", strings.NewReader(tt.body))
			context.Request.Header.Set("Content-Type", "application/json")
			context.Set("role", tt.role)

			assert.Equal(t, tt.wantOK, applyPlaygroundChannelSelection(context))
			assert.Equal(t, tt.wantStatus, recorder.Code)
			channelID, ok := common.GetContextKey(context, constant.ContextKeyTokenSpecificChannelId)
			if tt.wantID == "" {
				assert.False(t, ok)
				return
			}
			require.True(t, ok)
			assert.Equal(t, tt.wantID, channelID)
		})
	}
}

func TestApplyPlaygroundAPIKeySelection(t *testing.T) {
	gin.SetMode(gin.TestMode)
	require.NoError(t, projecti18n.Init())
	originalDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	require.NoError(t, db.AutoMigrate(&model.Token{}))
	require.NoError(t, db.Create(&[]model.Token{
		{
			Id:                 201,
			UserId:             42,
			Key:                "playground-active-key",
			Status:             common.TokenStatusEnabled,
			Name:               "Development key",
			ExpiredTime:        -1,
			UnlimitedQuota:     true,
			Group:              "vip",
			ModelLimitsEnabled: true,
			ModelLimits:        "gpt-5",
		},
		{
			Id:             202,
			UserId:         42,
			Key:            "playground-disabled-key",
			Status:         common.TokenStatusDisabled,
			Name:           "Disabled key",
			ExpiredTime:    -1,
			UnlimitedQuota: true,
		},
		{
			Id:             203,
			UserId:         99,
			Key:            "another-user-key",
			Status:         common.TokenStatusEnabled,
			Name:           "Another user's key",
			ExpiredTime:    -1,
			UnlimitedQuota: true,
		},
		{
			Id:             204,
			UserId:         42,
			Key:            "playground-expired-key",
			Status:         common.TokenStatusEnabled,
			Name:           "Expired key",
			ExpiredTime:    common.GetTimestamp() - 1,
			UnlimitedQuota: true,
		},
		{
			Id:             205,
			UserId:         42,
			Key:            "playground-exhausted-key",
			Status:         common.TokenStatusEnabled,
			Name:           "Exhausted key",
			ExpiredTime:    -1,
			RemainQuota:    0,
			UnlimitedQuota: false,
		},
	}).Error)
	t.Cleanup(func() { model.DB = originalDB })

	tests := []struct {
		name       string
		body       string
		wantOK     bool
		wantStatus int
	}{
		{name: "owned active key", body: `{"model":"gpt-5","api_key_id":201}`, wantOK: true, wantStatus: http.StatusOK},
		{name: "disabled key", body: `{"model":"gpt-5","api_key_id":202}`, wantOK: false, wantStatus: http.StatusForbidden},
		{name: "another user key", body: `{"model":"gpt-5","api_key_id":203}`, wantOK: false, wantStatus: http.StatusForbidden},
		{name: "invalid key id", body: `{"model":"gpt-5","api_key_id":-1}`, wantOK: false, wantStatus: http.StatusBadRequest},
		{name: "mismatched key group", body: `{"model":"gpt-5","group":"default","api_key_id":201}`, wantOK: false, wantStatus: http.StatusForbidden},
		{name: "expired key", body: `{"model":"gpt-5","api_key_id":204}`, wantOK: false, wantStatus: http.StatusForbidden},
		{name: "exhausted key", body: `{"model":"gpt-5","api_key_id":205}`, wantOK: false, wantStatus: http.StatusForbidden},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)
			context.Request = httptest.NewRequest(http.MethodPost, "/pg/chat/completions", strings.NewReader(tt.body))
			context.Request.Header.Set("Content-Type", "application/json")
			context.Set("id", 42)

			assert.Equal(t, tt.wantOK, applyPlaygroundChannelSelection(context))
			assert.Equal(t, tt.wantStatus, recorder.Code)
			if !tt.wantOK {
				return
			}
			assert.Equal(t, 201, context.GetInt("token_id"))
			assert.Equal(t, "Development key", context.GetString("token_name"))
			assert.Equal(t, "vip", common.GetContextKeyString(context, constant.ContextKeyTokenGroup))
			assert.True(t, common.GetContextKeyBool(context, constant.ContextKeyTokenModelLimitEnabled))
			_, exists := context.Get("playground_api_key")
			assert.True(t, exists)
			request, _, err := getModelRequest(context)
			require.NoError(t, err)
			assert.Equal(t, "vip", request.Group)
		})
	}
}

func TestApplyPlaygroundAPIKeySelectionAllowsAccountLevelRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodPost,
		"/pg/chat/completions",
		strings.NewReader(`{"model":"gpt-5","group":"default"}`),
	)
	context.Request.Header.Set("Content-Type", "application/json")
	context.Set("id", 42)

	assert.True(t, applyPlaygroundChannelSelection(context))
	assert.Equal(t, http.StatusOK, recorder.Code)
	_, selectedAPIKey := context.Get("playground_api_key")
	assert.False(t, selectedAPIKey)
	assert.Zero(t, context.GetInt("token_id"))
}

func TestApplyPlaygroundChannelSelectionSkipsTaskFetch(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/pg/videos/task-1", nil)

	assert.True(t, applyPlaygroundChannelSelection(context))
	assert.Equal(t, http.StatusOK, recorder.Code)
}

func TestApplyPlaygroundGroupSelectionAppliesBeforeSpecificChannelPricing(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodPost,
		"/pg/chat/completions",
		strings.NewReader(`{"model":"moonshotai/kimi-k3","group":"default","channel_id":17}`),
	)
	context.Request.Header.Set("Content-Type", "application/json")
	context.Set("role", common.RoleAdminUser)
	common.SetContextKey(context, constant.ContextKeyUserGroup, "default")

	require.True(t, applyPlaygroundChannelSelection(context))
	request, _, err := getModelRequest(context)
	require.NoError(t, err)
	require.True(t, applyPlaygroundGroupSelection(context, request.Group))

	assert.Equal(
		t,
		"default",
		common.GetContextKeyString(context, constant.ContextKeyUsingGroup),
	)
	channelID, ok := common.GetContextKey(
		context,
		constant.ContextKeyTokenSpecificChannelId,
	)
	require.True(t, ok)
	assert.Equal(t, "17", channelID)
}

func TestDistributorReturnsSelectedChannelSetupErrorToPlayground(t *testing.T) {
	gin.SetMode(gin.TestMode)
	require.NoError(t, projecti18n.Init())
	originalDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	require.NoError(t, db.AutoMigrate(&model.Model{}, &model.Channel{}))
	require.NoError(t, db.Create(&model.Model{
		ModelName:  "gpt-4o",
		Status:     1,
		NameRule:   model.NameRuleExact,
		Visibility: model.ModelVisibilityPublic,
	}).Error)
	require.NoError(t, db.Create(&model.Channel{
		Id:     14,
		Type:   constant.ChannelTypeOpenAI,
		Key:    "disabled-key",
		Status: common.ChannelStatusEnabled,
		Name:   "Selected channel",
		Models: "gpt-4o",
		Group:  "default",
		ChannelInfo: model.ChannelInfo{
			IsMultiKey:         true,
			MultiKeyStatusList: map[int]int{0: common.ChannelStatusManuallyDisabled},
		},
	}).Error)
	model.InvalidateModelRoutingCache()
	t.Cleanup(func() {
		model.InvalidateModelRoutingCache()
		model.DB = originalDB
	})

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodPost,
		"/pg/chat/completions",
		strings.NewReader(`{"model":"gpt-4o","channel_id":14,"messages":[]}`),
	)
	context.Request.Header.Set("Content-Type", "application/json")
	context.Set("role", common.RoleAdminUser)
	common.SetContextKey(context, constant.ContextKeyUsingGroup, "default")

	Distribute()(context)

	assert.Equal(t, http.StatusInternalServerError, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "指定渠道 #14 初始化失败")
	assert.Contains(t, recorder.Body.String(), string(types.ErrorCodeChannelNoAvailableKey))
	assert.True(t, context.IsAborted())
}
