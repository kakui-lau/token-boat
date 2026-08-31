package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func performUpdateUserSettingRequest(t *testing.T, userID int, body string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPut, "/api/user/setting", strings.NewReader(body))
	context.Request.Header.Set("Content-Type", "application/json")
	context.Set("id", userID)
	context.Set("role", common.RoleCommonUser)
	UpdateUserSetting(context)
	return recorder
}

func TestGetUserSettingReturnsConfigurationFlagsWithoutNotificationSecrets(t *testing.T) {
	db := setupManageUserTestDB(t)
	user := model.User{
		Username: "safe-setting-user",
		Password: "password",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		Group:    "default",
	}
	user.SetSetting(dto.UserSetting{
		NotifyType:            dto.NotifyTypeWebhook,
		QuotaWarningThreshold: 500000,
		WebhookUrl:            "https://merchant.example.com/hooks/quota",
		WebhookSecret:         "do-not-return-webhook-secret",
		GotifyUrl:             "https://gotify.example.com",
		GotifyToken:           "do-not-return-gotify-token",
		GotifyPriority:        5,
	})
	require.NoError(t, db.Create(&user).Error)

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/user/setting", nil)
	context.Set("id", user.Id)
	GetUserSetting(context)

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"webhook_secret_configured":true`)
	assert.Contains(t, recorder.Body.String(), `"gotify_token_configured":true`)
	assert.NotContains(t, recorder.Body.String(), "do-not-return-webhook-secret")
	assert.NotContains(t, recorder.Body.String(), "do-not-return-gotify-token")
}

func TestUpdateUserSettingPreservesUnrelatedPreferencesAndExistingSecrets(t *testing.T) {
	db := setupManageUserTestDB(t)
	user := model.User{
		Username: "setting-preservation-user",
		Password: "password",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		Group:    "default",
	}
	user.SetSetting(dto.UserSetting{
		NotifyType:                       dto.NotifyTypeEmail,
		QuotaWarningThreshold:            500000,
		WebhookUrl:                       "https://old.example.com/quota",
		WebhookSecret:                    "existing-webhook-secret",
		NotificationEmail:                "alerts@example.com",
		BarkUrl:                          "https://api.day.app/existing",
		GotifyUrl:                        "https://gotify.example.com",
		GotifyToken:                      "existing-gotify-token",
		GotifyPriority:                   7,
		UpstreamModelUpdateNotifyEnabled: true,
		RecordIpLog:                      true,
		SidebarModules:                   `{"chat":{"enabled":true}}`,
		BillingPreference:                "subscription",
		Language:                         "zh",
	})
	require.NoError(t, db.Create(&user).Error)

	recorder := performUpdateUserSettingRequest(t, user.Id, `{
		"notify_type":"webhook",
		"quota_warning_threshold":1000000,
		"webhook_url":"https://new.example.com/quota",
		"webhook_secret":"",
		"record_ip_log":false
	}`)

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"success":true`)
	var updated model.User
	require.NoError(t, db.First(&updated, user.Id).Error)
	settings := updated.GetSetting()
	assert.Equal(t, dto.NotifyTypeWebhook, settings.NotifyType)
	assert.Equal(t, float64(1000000), settings.QuotaWarningThreshold)
	assert.Equal(t, "https://new.example.com/quota", settings.WebhookUrl)
	assert.Equal(t, "existing-webhook-secret", settings.WebhookSecret)
	assert.False(t, settings.RecordIpLog)
	assert.Equal(t, "alerts@example.com", settings.NotificationEmail)
	assert.Equal(t, "https://api.day.app/existing", settings.BarkUrl)
	assert.Equal(t, "https://gotify.example.com", settings.GotifyUrl)
	assert.Equal(t, "existing-gotify-token", settings.GotifyToken)
	assert.Equal(t, 7, settings.GotifyPriority)
	assert.True(t, settings.UpstreamModelUpdateNotifyEnabled)
	assert.Equal(t, `{"chat":{"enabled":true}}`, settings.SidebarModules)
	assert.Equal(t, "subscription", settings.BillingPreference)
	assert.Equal(t, "zh", settings.Language)
}

func TestUpdateUserSettingKeepsConfiguredGotifyTokenWhenRequestLeavesItBlank(t *testing.T) {
	db := setupManageUserTestDB(t)
	user := model.User{
		Username: "gotify-token-user",
		Password: "password",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		Group:    "default",
	}
	user.SetSetting(dto.UserSetting{
		NotifyType:     dto.NotifyTypeGotify,
		GotifyUrl:      "https://gotify.example.com",
		GotifyToken:    "existing-gotify-token",
		GotifyPriority: 5,
	})
	require.NoError(t, db.Create(&user).Error)

	recorder := performUpdateUserSettingRequest(t, user.Id, `{
		"notify_type":"gotify",
		"quota_warning_threshold":500000,
		"gotify_url":"https://gotify.example.com",
		"gotify_token":"",
		"gotify_priority":8,
		"record_ip_log":true
	}`)

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"success":true`)
	var updated model.User
	require.NoError(t, db.First(&updated, user.Id).Error)
	settings := updated.GetSetting()
	assert.Equal(t, "existing-gotify-token", settings.GotifyToken)
	assert.Equal(t, 8, settings.GotifyPriority)
}
