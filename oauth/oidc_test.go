package oauth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOIDCProvider_GetName(t *testing.T) {
	settings := system_setting.GetOIDCSettings()
	originalDisplayName := settings.DisplayName
	defer func() { settings.DisplayName = originalDisplayName }()

	p := &OIDCProvider{}

	settings.DisplayName = ""
	assert.Equal(t, "OIDC", p.GetName())

	settings.DisplayName = "  Acme SSO  "
	assert.Equal(t, "Acme SSO", p.GetName())
}

func TestOIDCProviderUsesAuthFlowBoundRedirectURIForTokenExchange(t *testing.T) {
	const redirectURI = "https://dashboard.example.com/console/oauth/oidc"
	tokenServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.NoError(t, r.ParseForm())
		assert.Equal(t, redirectURI, r.Form.Get("redirect_uri"))
		assert.Equal(t, "authorization-code", r.Form.Get("code"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"access_token":"access-token","token_type":"Bearer","scope":"openid"}`))
	}))
	t.Cleanup(tokenServer.Close)

	settings := system_setting.GetOIDCSettings()
	originalSettings := *settings
	settings.ClientId = "client-id"
	settings.ClientSecret = "client-secret"
	settings.TokenEndpoint = tokenServer.URL
	t.Cleanup(func() { *settings = originalSettings })

	ginContext, _ := gin.CreateTestContext(httptest.NewRecorder())
	SetRedirectURI(ginContext, redirectURI)
	token, err := (&OIDCProvider{}).ExchangeToken(context.Background(), "authorization-code", ginContext)

	require.NoError(t, err)
	assert.Equal(t, "access-token", token.AccessToken)
}
