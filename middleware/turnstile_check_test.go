package middleware

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type turnstileRoundTripper func(*http.Request) (*http.Response, error)

func (transport turnstileRoundTripper) RoundTrip(request *http.Request) (*http.Response, error) {
	return transport(request)
}

func TestTurnstileCheckPrefersHeaderTokenOverLegacyQueryToken(t *testing.T) {
	previousEnabled := common.TurnstileCheckEnabled
	previousSecret := common.TurnstileSecretKey
	previousClient := http.DefaultClient
	common.TurnstileCheckEnabled = true
	common.TurnstileSecretKey = "turnstile-test-secret"
	http.DefaultClient = &http.Client{Transport: turnstileRoundTripper(func(request *http.Request) (*http.Response, error) {
		body, err := io.ReadAll(request.Body)
		require.NoError(t, err)
		values, err := url.ParseQuery(string(body))
		require.NoError(t, err)
		assert.Equal(t, "header-token", values.Get("response"))
		assert.Equal(t, "turnstile-test-secret", values.Get("secret"))
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(`{"success":true}`)),
			Header:     make(http.Header),
		}, nil
	})}
	t.Cleanup(func() {
		common.TurnstileCheckEnabled = previousEnabled
		common.TurnstileSecretKey = previousSecret
		http.DefaultClient = previousClient
	})

	gin.SetMode(gin.TestMode)
	router := gin.New()
	reachedHandler := false
	router.GET("/protected", TurnstileCheck(), func(c *gin.Context) {
		reachedHandler = true
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(http.MethodGet, "/protected?turnstile=query-token", nil)
	request.Header.Set("X-Turnstile-Token", "header-token")
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	assert.True(t, reachedHandler)
	assert.Equal(t, http.StatusNoContent, response.Code)
}
