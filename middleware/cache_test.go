package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestCacheDoesNotCacheMissingAPIRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(Cache())

	request := httptest.NewRequest(http.MethodGet, "/api/new-endpoint", nil)
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, request)

	assert.Equal(t, http.StatusNotFound, response.Code)
	assert.Equal(t, "no-store, no-cache, must-revalidate, private, max-age=0", response.Header().Get("Cache-Control"))
}

func TestCacheUsesContentSpecificWebPolicies(t *testing.T) {
	tests := []struct {
		name     string
		path     string
		expected string
	}{
		{name: "directory page", path: "/models", expected: "no-cache"},
		{name: "trailing slash page", path: "/models/", expected: "no-cache"},
		{name: "dotted model page", path: "/models/openai/gpt-5.4", expected: "no-cache"},
		{name: "html page", path: "/404.html", expected: "no-cache"},
		{name: "robots", path: "/robots.txt", expected: "no-cache"},
		{name: "sitemap", path: "/sitemap.xml", expected: "no-cache"},
		{name: "astro asset", path: "/_astro/site.HASH.js", expected: "public, max-age=31536000, immutable"},
		{name: "legacy asset", path: "/static/js/app.HASH.js", expected: "public, max-age=31536000, immutable"},
		{name: "console asset", path: "/console/assets/app.HASH.js", expected: "public, max-age=31536000, immutable"},
		{name: "versionless asset", path: "/brand/logo.svg", expected: "public, max-age=604800"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			gin.SetMode(gin.TestMode)
			engine := gin.New()
			engine.Use(Cache())
			request := httptest.NewRequest(http.MethodGet, test.path, nil)
			response := httptest.NewRecorder()
			engine.ServeHTTP(response, request)

			assert.Equal(t, test.expected, response.Header().Get("Cache-Control"))
		})
	}
}

func TestPrivateNoStoreVariesByAuthorization(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		c.Writer.Header().Add("Vary", "Accept-Encoding")
		c.Next()
	})
	engine.GET("/api/pricing", PrivateNoStore(), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	request := httptest.NewRequest(http.MethodGet, "/api/pricing", nil)
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, request)

	assert.Equal(t, "private, no-store", response.Header().Get("Cache-Control"))
	assert.Contains(t, strings.Join(response.Header().Values("Vary"), ","), "Accept-Encoding")
	assert.Contains(t, strings.Join(response.Header().Values("Vary"), ","), "Authorization")
}
