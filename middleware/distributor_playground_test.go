package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	projecti18n "github.com/QuantumNous/new-api/i18n"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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
