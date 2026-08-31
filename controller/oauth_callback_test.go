package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type oauthStateTestResponse struct {
	Success bool `json:"success"`
	Data    struct {
		FlowToken   string `json:"flow_token"`
		RedirectURI string `json:"redirect_uri"`
	} `json:"data"`
}

func performOAuthStateRequest(t *testing.T, body string) (*httptest.ResponseRecorder, oauthStateTestResponse) {
	t.Helper()
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/api/oauth/state", strings.NewReader(body))
	context.Request.Header.Set("Content-Type", "application/json")
	GenerateOAuthCode(context)

	var response oauthStateTestResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	return recorder, response
}

func setupOAuthStateTestDB(t *testing.T) {
	t.Helper()
	db := setupManageUserTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.AuthFlow{}))
}

func TestGenerateOAuthCodeBindsConsoleCallbackToAuthFlow(t *testing.T) {
	setupOAuthStateTestDB(t)
	previousAddress := system_setting.ServerAddress
	system_setting.ServerAddress = "https://dashboard.example.com/"
	t.Cleanup(func() { system_setting.ServerAddress = previousAddress })

	recorder, response := performOAuthStateRequest(
		t,
		`{"provider":"github","intent":"login","aff":"partner","client":"console_v2"}`,
	)

	assert.Equal(t, http.StatusOK, recorder.Code)
	require.True(t, response.Success)
	assert.Equal(t, "https://dashboard.example.com/console/oauth/github", response.Data.RedirectURI)
	flow, err := model.GetAuthFlow(response.Data.FlowToken, model.AuthFlowMatch{
		Purpose:  model.AuthFlowPurposeOAuth,
		Provider: "github",
		Intent:   model.AuthFlowIntentLogin,
	})
	require.NoError(t, err)
	var payload oauthFlowPayload
	require.NoError(t, common.UnmarshalJsonStr(flow.Payload, &payload))
	assert.Equal(t, "partner", payload.AffiliateCode)
	assert.Equal(t, oauthClientConsoleV2, payload.Client)
	assert.Equal(t, "https://dashboard.example.com/console/oauth/github", payload.RedirectURI)
}

func TestGenerateOAuthCodeKeepsLegacyClientCallbackUnchanged(t *testing.T) {
	setupOAuthStateTestDB(t)

	_, response := performOAuthStateRequest(
		t,
		`{"provider":"github","intent":"login"}`,
	)

	require.True(t, response.Success)
	assert.Empty(t, response.Data.RedirectURI)
	flow, err := model.GetAuthFlow(response.Data.FlowToken, model.AuthFlowMatch{
		Purpose:  model.AuthFlowPurposeOAuth,
		Provider: "github",
	})
	require.NoError(t, err)
	var payload oauthFlowPayload
	require.NoError(t, common.UnmarshalJsonStr(flow.Payload, &payload))
	assert.Empty(t, payload.Client)
	assert.Empty(t, payload.RedirectURI)
}

func TestGenerateOAuthCodeRejectsUnknownCallbackClient(t *testing.T) {
	setupOAuthStateTestDB(t)

	_, response := performOAuthStateRequest(
		t,
		`{"provider":"github","intent":"login","client":"https://evil.example"}`,
	)

	assert.False(t, response.Success)
	var count int64
	require.NoError(t, model.DB.Model(&model.AuthFlow{}).Count(&count).Error)
	assert.Zero(t, count)
}
