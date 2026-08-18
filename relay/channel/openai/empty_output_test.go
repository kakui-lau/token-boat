package openai

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newOpenAITextTestContext(
	t *testing.T,
	body string,
	isStream bool,
) (*gin.Context, *httptest.ResponseRecorder, *http.Response, *relaycommon.RelayInfo) {
	t.Helper()
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	c.Set(common.RequestIdKey, "empty-output-test")
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
	}
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: "deepseek-v4-pro",
		},
		IsStream:           isStream,
		RelayMode:          relayconstant.RelayModeChatCompletions,
		RelayFormat:        types.RelayFormatOpenAI,
		ShouldIncludeUsage: true,
		DisablePing:        true,
	}
	return c, recorder, resp, info
}

func TestOaiStreamHandlerRejectsReasoningOnlyCompletion(t *testing.T) {
	oldMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(oldMode) })
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	body := strings.Join([]string{
		`data: {"id":"chat-1","model":"deepseek-v4-pro","choices":[{"index":0,"delta":{"reasoning_content":"thinking"}}]}`,
		`data: {"id":"chat-1","model":"deepseek-v4-pro","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":1,"total_tokens":11}}`,
		`data: [DONE]`,
		``,
	}, "\n")
	c, recorder, resp, info := newOpenAITextTestContext(t, body, true)

	usage, relayErr := OaiStreamHandler(c, info, resp)

	require.NotNil(t, relayErr)
	assert.Equal(t, http.StatusBadGateway, relayErr.StatusCode)
	assert.Equal(t, types.ErrorCodeBadResponse, relayErr.GetErrorCode())
	assert.Nil(t, usage)
	assert.NotContains(t, recorder.Body.String(), `data: [DONE]`)
}

func TestOpenaiHandlerRejectsReasoningOnlyCompletion(t *testing.T) {
	body := `{"id":"chat-1","model":"deepseek-v4-pro","choices":[{"index":0,"message":{"role":"assistant","content":"","reasoning_content":"thinking"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":1,"total_tokens":11}}`
	c, _, resp, info := newOpenAITextTestContext(t, body, false)

	usage, relayErr := OpenaiHandler(c, info, resp)

	require.NotNil(t, relayErr)
	assert.Equal(t, http.StatusBadGateway, relayErr.StatusCode)
	assert.Equal(t, types.ErrorCodeBadResponse, relayErr.GetErrorCode())
	assert.Nil(t, usage)
}

func TestOpenaiHandlerAcceptsToolCallWithoutVisibleText(t *testing.T) {
	body := `{"id":"chat-1","model":"deepseek-v4-pro","choices":[{"index":0,"message":{"role":"assistant","content":"","tool_calls":[{"id":"call-1","type":"function","function":{"name":"lookup","arguments":"{}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":10,"completion_tokens":4,"total_tokens":14}}`
	c, recorder, resp, info := newOpenAITextTestContext(t, body, false)

	usage, relayErr := OpenaiHandler(c, info, resp)

	require.Nil(t, relayErr)
	require.NotNil(t, usage)
	assert.Equal(t, 4, usage.CompletionTokens)
	assert.Contains(t, recorder.Body.String(), `"name":"lookup"`)
}
