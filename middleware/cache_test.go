package middleware

import (
	"net/http"
	"net/http/httptest"
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
