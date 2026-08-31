package oauth

import (
	"strings"

	"github.com/gin-gonic/gin"
)

const redirectURIContextKey = "oauth_redirect_uri"

// SetRedirectURI binds the callback URI selected when the OAuth state was
// created to the server-side token exchange. Callers must only pass a URI
// recovered from a validated AuthFlow, never a callback supplied directly by
// the browser.
func SetRedirectURI(c *gin.Context, redirectURI string) {
	if c == nil {
		return
	}
	redirectURI = strings.TrimSpace(redirectURI)
	if redirectURI != "" {
		c.Set(redirectURIContextKey, redirectURI)
	}
}

// GetRedirectURI returns an AuthFlow-bound callback URI when present and keeps
// the provider's legacy callback as the default for existing clients.
func GetRedirectURI(c *gin.Context, legacyRedirectURI string) string {
	if c == nil {
		return legacyRedirectURI
	}
	redirectURI, ok := c.Get(redirectURIContextKey)
	if !ok {
		return legacyRedirectURI
	}
	value, ok := redirectURI.(string)
	if !ok || strings.TrimSpace(value) == "" {
		return legacyRedirectURI
	}
	return value
}
