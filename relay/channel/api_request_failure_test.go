package channel

import (
	"bytes"
	"net/http/httptest"
	"strings"
	"testing"

	projectcommon "github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLogFailedUpstreamRequestNeverPanicsWhenTaskPersistenceFails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	request := httptest.NewRequest("POST", "https://provider.example/v1/images/generations", nil)

	require.NotPanics(t, func() {
		logFailedUpstreamRequest(context, request, []byte(`{"model":"image"}`), "400 Bad Request", &relaycommon.RelayInfo{})
	})
	require.NotPanics(t, func() {
		logFailedUpstreamRequest(context, request, []byte(`{"model":"image"}`), "400 Bad Request", &relaycommon.RelayInfo{
			TaskRelayInfo: &relaycommon.TaskRelayInfo{PersistedTaskID: 1},
		})
	})
}

func TestLogFailedUpstreamRequestPrintsClientAndUpstreamParameters(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest(
		"POST",
		"/pg/chat/completions",
		strings.NewReader(`{"model":"gpt-5.6-sol","messages":[{"role":"user","content":"hello"}],"access_token":"client-secret"}`),
	)
	context.Request.Header.Set("Content-Type", "application/json")
	upstreamBody := []byte(`{"model":"provider-model","input":"hello","api_key":"upstream-secret"}`)
	request := httptest.NewRequest(
		"POST",
		"https://provider.example/v1/responses?api_key=query-secret",
		bytes.NewReader(upstreamBody),
	)
	request.Header.Set("Content-Type", "application/json")

	var output bytes.Buffer
	projectcommon.LogWriterMu.Lock()
	originalWriter := gin.DefaultErrorWriter
	gin.DefaultErrorWriter = &output
	projectcommon.LogWriterMu.Unlock()
	t.Cleanup(func() {
		projectcommon.LogWriterMu.Lock()
		gin.DefaultErrorWriter = originalWriter
		projectcommon.LogWriterMu.Unlock()
	})

	logFailedUpstreamRequest(
		context,
		request,
		upstreamBody,
		"524 Gateway Timeout",
		&relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelId: 18}},
	)

	logged := output.String()
	assert.Contains(t, logged, "channel_id=18")
	assert.Contains(t, logged, `client_body={"access_token":"***masked***"`)
	assert.Contains(t, logged, `"model":"gpt-5.6-sol"`)
	assert.Contains(t, logged, `upstream_body={"api_key":"***masked***"`)
	assert.Contains(t, logged, `"model":"provider-model"`)
	assert.Contains(t, logged, "api_key=%2A%2A%2Amasked%2A%2A%2A")
	assert.NotContains(t, logged, "client-secret")
	assert.NotContains(t, logged, "upstream-secret")
	assert.NotContains(t, logged, "query-secret")
}
