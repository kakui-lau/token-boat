package middleware

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAccessLogFormatterSamplesSuccessfulHealthChecks(t *testing.T) {
	formatter := newAccessLogFormatter()
	startedAt := time.Date(2026, 8, 25, 5, 43, 0, 0, time.UTC)

	first := formatter(gin.LogFormatterParams{
		TimeStamp:  startedAt,
		StatusCode: http.StatusOK,
		Method:     http.MethodGet,
		Path:       "/health",
	})
	withinInterval := formatter(gin.LogFormatterParams{
		TimeStamp:  startedAt.Add(successfulHealthAccessLogInterval - time.Second),
		StatusCode: http.StatusOK,
		Method:     http.MethodGet,
		Path:       "/health",
	})
	afterInterval := formatter(gin.LogFormatterParams{
		TimeStamp:  startedAt.Add(successfulHealthAccessLogInterval),
		StatusCode: http.StatusOK,
		Method:     http.MethodGet,
		Path:       "/health",
	})

	assert.NotEmpty(t, first)
	assert.Empty(t, withinInterval)
	assert.NotEmpty(t, afterInterval)
}

func TestAccessLogFormatterAlwaysPrintsFailedHealthChecks(t *testing.T) {
	formatter := newAccessLogFormatter()
	startedAt := time.Date(2026, 8, 25, 5, 43, 0, 0, time.UTC)
	_ = formatter(gin.LogFormatterParams{
		TimeStamp:  startedAt,
		StatusCode: http.StatusOK,
		Method:     http.MethodGet,
		Path:       "/health",
	})

	failed := formatter(gin.LogFormatterParams{
		TimeStamp:  startedAt.Add(time.Second),
		StatusCode: http.StatusServiceUnavailable,
		Method:     http.MethodGet,
		Path:       "/health",
	})
	ordinary := formatter(gin.LogFormatterParams{
		TimeStamp:  startedAt.Add(2 * time.Second),
		StatusCode: http.StatusOK,
		Method:     http.MethodGet,
		Path:       "/api/status",
	})

	assert.NotEmpty(t, failed)
	assert.NotEmpty(t, ordinary)
}

func TestAccessLogFormatterSanitizesQueryCredentials(t *testing.T) {
	formatted := newAccessLogFormatter()(gin.LogFormatterParams{
		TimeStamp:  time.Date(2026, 9, 15, 12, 0, 0, 0, time.UTC),
		StatusCode: http.StatusUnauthorized,
		Method:     http.MethodPost,
		Path:       "/v1beta/models/gemini:generateContent?key=query-secret&trace_id=trace-1",
	})

	assert.Contains(t, formatted, "trace_id=trace-1")
	assert.Contains(t, formatted, "key=%2A%2A%2Amasked%2A%2A%2A")
	assert.NotContains(t, formatted, "query-secret")
}

func TestRelayAccessLogIncludesParametersOnceForSuccessAndFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, testCase := range []struct {
		name     string
		status   int
		readBody bool
	}{
		{name: "success", status: http.StatusOK, readBody: true},
		{name: "authentication failure", status: http.StatusUnauthorized, readBody: false},
		{name: "relay failure", status: http.StatusInternalServerError, readBody: true},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			var output bytes.Buffer
			common.LogWriterMu.Lock()
			originalWriter := gin.DefaultWriter
			gin.DefaultWriter = &output
			common.LogWriterMu.Unlock()
			t.Cleanup(func() {
				common.LogWriterMu.Lock()
				gin.DefaultWriter = originalWriter
				common.LogWriterMu.Unlock()
			})

			engine := gin.New()
			SetUpLogger(engine)
			engine.POST("/v1/responses", RouteTag("relay"), func(c *gin.Context) {
				if testCase.readBody {
					var payload map[string]any
					require.NoError(t, common.UnmarshalBodyReusable(c, &payload))
				}
				c.Status(testCase.status)
			})

			request := httptest.NewRequest(
				http.MethodPost,
				"/v1/responses?key=query-secret&trace_id=trace-1",
				strings.NewReader(`{"model":"gpt-5.6-sol","input":"hello"}`),
			)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Authorization", "Bearer sk-client-secret-value")
			response := httptest.NewRecorder()
			engine.ServeHTTP(response, request)

			logged := output.String()
			assert.Equal(t, 1, strings.Count(logged, "[GIN]"))
			assert.Equal(t, 1, strings.Count(logged, "client_request:"))
			assert.Contains(t, logged, "trace_id=trace-1")
			assert.Contains(t, logged, "fingerprint=sha256:")
			assert.NotContains(t, logged, "query-secret")
			assert.NotContains(t, logged, "client-secret-value")
			if testCase.readBody {
				assert.Contains(t, logged, `"model":"gpt-5.6-sol"`)
				assert.Contains(t, logged, `"input":"hello"`)
			} else {
				assert.Contains(t, logged, "body=[not read because request ended before normal body processing")
			}
		})
	}
}

func TestNonRelayAccessLogDoesNotIncludeClientParameters(t *testing.T) {
	formatted := newAccessLogFormatter()(gin.LogFormatterParams{
		TimeStamp:  time.Date(2026, 9, 15, 12, 0, 0, 0, time.UTC),
		StatusCode: http.StatusOK,
		Method:     http.MethodGet,
		Path:       "/api/status",
		Keys: map[string]any{
			RouteTagKey: "api",
		},
	})

	assert.NotContains(t, formatted, "client_request:")
}

func TestRelayAccessLogIncludesParametersOnceAfterRecoveredPanic(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var output bytes.Buffer
	common.LogWriterMu.Lock()
	originalWriter := gin.DefaultWriter
	gin.DefaultWriter = &output
	common.LogWriterMu.Unlock()
	t.Cleanup(func() {
		common.LogWriterMu.Lock()
		gin.DefaultWriter = originalWriter
		common.LogWriterMu.Unlock()
	})

	engine := gin.New()
	SetUpLogger(engine)
	engine.Use(gin.CustomRecovery(func(c *gin.Context, _ any) {
		c.Status(http.StatusInternalServerError)
	}))
	engine.POST("/v1/responses", RouteTag("relay"), func(c *gin.Context) {
		var payload map[string]any
		require.NoError(t, common.UnmarshalBodyReusable(c, &payload))
		panic("relay panic")
	})

	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/responses",
		strings.NewReader(`{"model":"gpt-5.6-sol","input":"hello"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, request)

	logged := output.String()
	assert.Equal(t, http.StatusInternalServerError, response.Code)
	assert.Equal(t, 1, strings.Count(logged, "[GIN]"))
	assert.Equal(t, 1, strings.Count(logged, "client_request:"))
	assert.Contains(t, logged, `"model":"gpt-5.6-sol"`)
}

func TestRelayAccessLogIncludesParametersOnDecompressionFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var output bytes.Buffer
	common.LogWriterMu.Lock()
	originalWriter := gin.DefaultWriter
	gin.DefaultWriter = &output
	common.LogWriterMu.Unlock()
	t.Cleanup(func() {
		common.LogWriterMu.Lock()
		gin.DefaultWriter = originalWriter
		common.LogWriterMu.Unlock()
	})

	engine := gin.New()
	SetUpLogger(engine)
	engine.Use(ClientRequestAudit())
	engine.Use(DecompressRequestMiddleware())
	engine.POST("/v1/responses", RouteTag("relay"), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	request := httptest.NewRequest(http.MethodPost, "/v1/responses", strings.NewReader("not-gzip"))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Content-Encoding", "gzip")
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, request)

	logged := output.String()
	assert.Equal(t, http.StatusBadRequest, response.Code)
	assert.Equal(t, 1, strings.Count(logged, "[GIN]"))
	assert.Equal(t, 1, strings.Count(logged, "client_request:"))
	assert.Contains(t, logged, "relay")
	assert.Contains(t, logged, `"Content-Encoding":["gzip"]`)
	assert.Contains(t, logged, "body=[not read because request ended before normal body processing]")
	assert.NotContains(t, logged, "not-gzip")
}
