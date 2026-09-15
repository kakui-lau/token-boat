package logger

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLogErrorAlwaysIncludesCachedClientRequestParameters(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest(
		http.MethodPost,
		"/v1/responses?trace_id=trace-1&access_token=query-secret",
		strings.NewReader(`{"model":"gpt-5.6-sol","input":"hello","password":"body-secret"}`),
	)
	context.Request.Header.Set("Content-Type", "application/json")
	context.Set(common.RequestIdKey, "request-1")
	_, err := common.GetBodyStorage(context)
	require.NoError(t, err)
	t.Cleanup(func() {
		common.CleanupBodyStorage(context)
	})

	var output bytes.Buffer
	common.LogWriterMu.Lock()
	originalWriter := gin.DefaultErrorWriter
	gin.DefaultErrorWriter = &output
	common.LogWriterMu.Unlock()
	t.Cleanup(func() {
		common.LogWriterMu.Lock()
		gin.DefaultErrorWriter = originalWriter
		common.LogWriterMu.Unlock()
	})

	for _, message := range []string{
		"scanner error: response body closed",
		"stream ended: reason=client_gone",
		"total tokens is 0, cannot consume quota",
	} {
		LogError(context, message)
	}

	logged := output.String()
	assert.Equal(t, 3, strings.Count(logged, "client_request: method=POST"))
	assert.Equal(t, 3, strings.Count(logged, `"model":"gpt-5.6-sol"`))
	assert.Equal(t, 3, strings.Count(logged, `"input":"hello"`))
	assert.Contains(t, logged, "trace_id=trace-1")
	assert.Contains(t, logged, "access_token=%2A%2A%2Amasked%2A%2A%2A")
	assert.Contains(t, logged, `"password":"***masked***"`)
	assert.NotContains(t, logged, "query-secret")
	assert.NotContains(t, logged, "body-secret")
}

func TestLogErrorDoesNotConsumeUncachedRequestBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest(
		http.MethodPost,
		"/v1/responses",
		strings.NewReader(`{"model":"gpt-5.6-sol"}`),
	)

	var output bytes.Buffer
	common.LogWriterMu.Lock()
	originalWriter := gin.DefaultErrorWriter
	gin.DefaultErrorWriter = &output
	common.LogWriterMu.Unlock()
	t.Cleanup(func() {
		common.LogWriterMu.Lock()
		gin.DefaultErrorWriter = originalWriter
		common.LogWriterMu.Unlock()
	})

	LogError(context, "request validation failed")

	remainingBody, err := io.ReadAll(context.Request.Body)
	require.NoError(t, err)
	assert.JSONEq(t, `{"model":"gpt-5.6-sol"}`, string(remainingBody))
	assert.Contains(t, output.String(), "body=[unavailable: request body not cached]")
}

func TestLogErrorDoesNotRepeatParametersWhenRelayAccessAuditIsActive(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest(
		http.MethodPost,
		"/v1/responses",
		strings.NewReader(`{"model":"gpt-5.6-sol"}`),
	)
	common.BeginClientRequestLog(context)

	var output bytes.Buffer
	common.LogWriterMu.Lock()
	originalWriter := gin.DefaultErrorWriter
	gin.DefaultErrorWriter = &output
	common.LogWriterMu.Unlock()
	t.Cleanup(func() {
		common.LogWriterMu.Lock()
		gin.DefaultErrorWriter = originalWriter
		common.LogWriterMu.Unlock()
	})

	LogError(context, "upstream failed")

	assert.Contains(t, output.String(), "upstream failed")
	assert.NotContains(t, output.String(), "client_request:")
}
