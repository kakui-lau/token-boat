package service

import (
	"net/http"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCaptureUpstreamRequestID(t *testing.T) {
	tests := []struct {
		name   string
		header http.Header
		want   string
	}{
		{name: "one api", header: http.Header{common.RequestIdKey: {"one-api-id"}}, want: "one-api-id"},
		{name: "openai compatible", header: http.Header{"X-Request-Id": {"provider-id"}}, want: "provider-id"},
		{name: "aws", header: http.Header{"X-Amzn-Requestid": {"aws-id"}}, want: "aws-id"},
		{name: "trim and cap", header: http.Header{"Request-Id": {"  " + strings.Repeat("a", 140) + "  "}}, want: strings.Repeat("a", 128)},
		{name: "missing", header: http.Header{"Server": {"upstream"}}, want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			context, _ := gin.CreateTestContext(nil)
			got := CaptureUpstreamRequestID(context, tt.header)
			assert.Equal(t, tt.want, got)
			if tt.want != "" {
				require.Equal(t, tt.want, context.GetString(common.UpstreamRequestIdKey))
			}
		})
	}
}

func TestCaptureUpstreamRequestIDKeepsFirstRecognizedValue(t *testing.T) {
	context, _ := gin.CreateTestContext(nil)

	require.Equal(t, "primary", CaptureUpstreamRequestID(context, http.Header{"X-Request-Id": {"primary"}}))
	assert.Equal(t, "primary", CaptureUpstreamRequestID(context, http.Header{common.RequestIdKey: {"secondary"}}))
}

func TestCaptureUpstreamResponseID(t *testing.T) {
	tests := []struct {
		name string
		body string
		want string
	}{
		{name: "chat completion", body: `{"id":"chatcmpl-provider-123"}`, want: "chatcmpl-provider-123"},
		{name: "responses stream event", body: `{"type":"response.completed","response":{"id":"resp-provider-123"}}`, want: "resp-provider-123"},
		{name: "anthropic message event", body: `{"type":"message_start","message":{"id":"msg-provider-123"}}`, want: "msg-provider-123"},
		{name: "response id alias", body: `{"response_id":"provider-123"}`, want: "provider-123"},
		{name: "invalid", body: `not-json`, want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			context, _ := gin.CreateTestContext(nil)
			got := CaptureUpstreamResponseID(context, []byte(tt.body))
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestCaptureUpstreamResponseIDOverridesTransportRequestID(t *testing.T) {
	context, _ := gin.CreateTestContext(nil)
	require.Equal(t, "transport-id", CaptureUpstreamRequestID(context, http.Header{"X-Request-Id": {"transport-id"}}))

	require.Equal(t, "chatcmpl-body-id", CaptureUpstreamResponseID(context, []byte(`{"id":"chatcmpl-body-id"}`)))
	assert.Equal(t, "chatcmpl-body-id", context.GetString(common.UpstreamRequestIdKey))
}
