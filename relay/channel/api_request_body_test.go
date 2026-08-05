package channel

import (
	"io"
	"net/http"
	"strings"
	"testing"

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
