package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupSpecificChannelHeaderTest(t *testing.T, role int) (*gin.Context, *model.Token) {
	t.Helper()
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}))
	model.DB = db
	t.Cleanup(func() { model.DB = previousDB })

	user := &model.User{Username: "channel-header-user", Role: role}
	require.NoError(t, db.Create(user).Error)
	request := httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = request
	return context, &model.Token{Id: 1, UserId: user.Id}
}

func TestSetupContextForTokenUsesSpecificChannelHeader(t *testing.T) {
	context, token := setupSpecificChannelHeaderTest(t, common.RoleAdminUser)
	context.Request.Header.Set(specificChannelHeader, "18")

	require.NoError(t, SetupContextForToken(context, token))
	channelID, ok := common.GetContextKey(context, constant.ContextKeyTokenSpecificChannelId)
	require.True(t, ok)
	assert.Equal(t, "18", channelID)
}

func TestSetupContextForTokenKeepsAutomaticRoutingWithoutHeader(t *testing.T) {
	context, token := setupSpecificChannelHeaderTest(t, common.RoleAdminUser)

	require.NoError(t, SetupContextForToken(context, token))
	_, ok := common.GetContextKey(context, constant.ContextKeyTokenSpecificChannelId)
	assert.False(t, ok)
}

func TestSetupContextForTokenRejectsSpecificChannelHeaderForOrdinaryUser(t *testing.T) {
	context, token := setupSpecificChannelHeaderTest(t, common.RoleCommonUser)
	context.Request.Header.Set(specificChannelHeader, "18")

	err := SetupContextForToken(context, token)
	require.Error(t, err)
	assert.True(t, context.IsAborted())
	assert.Equal(t, http.StatusForbidden, context.Writer.Status())
}

func TestSetupContextForTokenRejectsInvalidSpecificChannelHeader(t *testing.T) {
	context, token := setupSpecificChannelHeaderTest(t, common.RoleAdminUser)
	context.Request.Header.Set(specificChannelHeader, "invalid")

	err := SetupContextForToken(context, token)
	require.Error(t, err)
	assert.True(t, context.IsAborted())
	assert.Equal(t, http.StatusBadRequest, context.Writer.Status())
}

func TestSetupContextForTokenHeaderOverridesLegacyTokenSuffix(t *testing.T) {
	context, token := setupSpecificChannelHeaderTest(t, common.RoleAdminUser)
	context.Request.Header.Set(specificChannelHeader, "18")

	require.NoError(t, SetupContextForToken(context, token, "token", "14"))
	channelID, ok := common.GetContextKey(context, constant.ContextKeyTokenSpecificChannelId)
	require.True(t, ok)
	assert.Equal(t, "18", channelID)
}
