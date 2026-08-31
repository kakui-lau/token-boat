package oauth

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestRedirectURIOverrideKeepsLegacyFallback(t *testing.T) {
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	assert.Equal(t, "https://legacy.example/oauth/oidc", GetRedirectURI(context, "https://legacy.example/oauth/oidc"))

	SetRedirectURI(context, "https://dashboard.example/console/oauth/oidc")
	assert.Equal(t, "https://dashboard.example/console/oauth/oidc", GetRedirectURI(context, "https://legacy.example/oauth/oidc"))
}
