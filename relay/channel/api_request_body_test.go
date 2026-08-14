package channel

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCaptureUpstreamRequestBodyPreservesNonReplayableBody(t *testing.T) {
	req, err := http.NewRequest(http.MethodPost, "https://example.com/v1/test", io.NopCloser(strings.NewReader(`{"prompt":"hello"}`)))
	require.NoError(t, err)
	require.Nil(t, req.GetBody)

	captured, err := captureUpstreamRequestBody(req)
	require.NoError(t, err)
	assert.JSONEq(t, `{"prompt":"hello"}`, string(captured))

	forwarded, err := io.ReadAll(req.Body)
	require.NoError(t, err)
	assert.Equal(t, captured, forwarded)
	require.NotNil(t, req.GetBody)

	replayed, err := req.GetBody()
	require.NoError(t, err)
	defer replayed.Close()
	replayedBody, err := io.ReadAll(replayed)
	require.NoError(t, err)
	assert.Equal(t, captured, replayedBody)
}

func TestCaptureUpstreamRequestBodyDoesNotConsumeReplayableBody(t *testing.T) {
	req, err := http.NewRequest(http.MethodPost, "https://example.com/v1/test", strings.NewReader("payload"))
	require.NoError(t, err)
	require.NotNil(t, req.GetBody)

	captured, err := captureUpstreamRequestBody(req)
	require.NoError(t, err)
	assert.Equal(t, "payload", string(captured))

	forwarded, err := io.ReadAll(req.Body)
	require.NoError(t, err)
	assert.Equal(t, "payload", string(forwarded))
}

func TestCaptureUpstreamRequestBodyDoesNotTruncateLargePayload(t *testing.T) {
	payload := strings.Repeat("complete-upstream-parameter-", 20_000)
	req, err := http.NewRequest(
		http.MethodPost,
		"https://example.com/v1/test",
		io.NopCloser(strings.NewReader(payload)),
	)
	require.NoError(t, err)

	captured, err := captureUpstreamRequestBody(req)
	require.NoError(t, err)
	assert.Len(t, captured, len(payload))
	assert.Equal(t, payload, string(captured))

	forwarded, err := io.ReadAll(req.Body)
	require.NoError(t, err)
	assert.Equal(t, payload, string(forwarded))
}

func TestSaveTaskUpstreamRequestCapturesSuccessfulSubmissionInMemory(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	req := httptest.NewRequest(
		http.MethodPost,
		"https://provider.example/v1/tasks?api_key=secret",
		strings.NewReader(`{"model":"video","duration":10}`),
	)
	info := &relaycommon.RelayInfo{
		TaskRelayInfo: &relaycommon.TaskRelayInfo{},
	}

	body, err := captureUpstreamRequestBody(req)
	require.NoError(t, err)
	saveTaskUpstreamRequest(ctx, taskUpstreamRequest(req, body, ""), info)

	require.NotNil(t, info.AdminUpstreamRequest)
	assert.Equal(t, http.MethodPost, info.AdminUpstreamRequest.Method)
	assert.NotContains(t, info.AdminUpstreamRequest.URL, "secret")
	assert.Equal(t, `{"model":"video","duration":10}`, info.AdminUpstreamRequest.Body)
	assert.Empty(t, info.AdminUpstreamRequest.Failure)
}
