package controller

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCopilotPlaygroundRunAdapterStreamsAGUIEventsWithoutStoredThread(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST(
		"/pg/copilotkit/agent/:agent_id/run",
		CopilotPlaygroundRunAdapter(),
		func(c *gin.Context) {
			var request copilotPlaygroundOpenAIRequest
			require.NoError(t, common.UnmarshalBodyReusable(c, &request))
			assert.Equal(t, "/pg/chat/completions", c.Request.URL.Path)
			assert.Nil(t, request.APIKeyID)
			assert.Equal(t, "priority", request.Group)
			assert.Equal(t, "anthropic/claude-sonnet", request.Model)
			assert.True(t, request.Stream)
			assert.True(t, request.StreamOptions.IncludeUsage)
			require.Len(t, request.Messages, 2)
			assert.Equal(t, "system", request.Messages[0].Role)
			assert.Equal(t, "Answer precisely.", request.Messages[0].Content)

			c.Header("Content-Type", "text/event-stream")
			c.Status(http.StatusOK)
			_, _ = c.Writer.WriteString("data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n")
			c.Writer.Flush()
			_, _ = c.Writer.WriteString("data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\n")
			_, _ = c.Writer.WriteString("data: {\"choices\":[],\"usage\":{\"prompt_tokens\":14,\"completion_tokens\":230}}\n\n")
			_, _ = c.Writer.WriteString("data: [DONE]\n\n")
		},
	)

	body := `{
		"threadId":"browser-only-thread",
		"runId":"run-1",
		"messages":[{"id":"user-1","role":"user","content":"Hi"}],
		"forwardedProps":{
			"group":"priority",
			"model":"anthropic/claude-sonnet",
			"systemPrompt":"Answer precisely.",
			"temperature":0,
			"maxTokens":2048
		}
	}`
	request := httptest.NewRequest(
		http.MethodPost,
		"/pg/copilotkit/agent/token-boat-playground/run",
		strings.NewReader(body),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, "text/event-stream", recorder.Header().Get("Content-Type"))
	events := decodeCopilotSSEEvents(t, recorder.Body.Bytes())
	require.Len(t, events, 6)
	assert.Equal(t, "RUN_STARTED", events[0]["type"])
	assert.Equal(t, "TEXT_MESSAGE_START", events[1]["type"])
	assert.Equal(t, "Hello", events[2]["delta"])
	assert.Equal(t, " world", events[3]["delta"])
	assert.Equal(t, "TEXT_MESSAGE_END", events[4]["type"])
	assert.Equal(t, "RUN_FINISHED", events[5]["type"])
	result, ok := events[5]["result"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "run-1-assistant", result["messageId"])
	assert.Equal(t, "anthropic/claude-sonnet", result["model"])
	assert.EqualValues(t, 14, result["inputTokens"])
	assert.EqualValues(t, 230, result["outputTokens"])
	assert.GreaterOrEqual(t, result["latencyMs"], float64(0))
}

func TestCopilotPlaygroundRunAdapterConvertsRelayErrorsWithoutStoredThread(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST(
		"/pg/copilotkit/agent/:agent_id/run",
		CopilotPlaygroundRunAdapter(),
		func(c *gin.Context) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": gin.H{"message": "Quota exhausted", "code": "insufficient_quota"},
			})
		},
	)

	body := `{
		"threadId":"browser-only-thread",
		"runId":"run-2",
		"messages":[{"id":"user-2","role":"user","content":"Hi"}],
		"forwardedProps":{"model":"gpt-5"}
	}`
	request := httptest.NewRequest(
		http.MethodPost,
		"/pg/copilotkit/agent/token-boat-playground/run",
		strings.NewReader(body),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	events := decodeCopilotSSEEvents(t, recorder.Body.Bytes())
	require.Len(t, events, 2)
	assert.Equal(t, "RUN_STARTED", events[0]["type"])
	assert.Equal(t, "RUN_ERROR", events[1]["type"])
	assert.Equal(t, "Quota exhausted", events[1]["message"])
	assert.Equal(t, "insufficient_quota", events[1]["code"])
}

func TestCopilotPlaygroundInfoAdvertisesStreamingAgent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/pg/copilotkit/info", CopilotPlaygroundInfo)
	request := httptest.NewRequest(http.MethodGet, "/pg/copilotkit/info", nil)
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Mode   string `json:"mode"`
		Agents map[string]struct {
			Capabilities struct {
				Transport struct {
					Streaming bool `json:"streaming"`
				} `json:"transport"`
			} `json:"capabilities"`
		} `json:"agents"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.Equal(t, "sse", response.Mode)
	agent, exists := response.Agents[copilotPlaygroundAgentID]
	require.True(t, exists)
	assert.True(t, agent.Capabilities.Transport.Streaming)
}

func TestCopilotPlaygroundConnectRestoresClientProvidedMessages(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Params = gin.Params{{Key: "agent_id", Value: copilotPlaygroundAgentID}}
	context.Request = httptest.NewRequest(
		http.MethodPost,
		"/pg/copilotkit/agent/token-boat-playground/connect",
		strings.NewReader(`{
			"threadId":"browser-only-thread",
			"runId":"connect-1",
			"forwardedProps":{"localMessages":[
				{"id":"user-history","role":"user","content":"Remember this"},
				{"id":"assistant-history","role":"assistant","content":"Stored in the browser"}
			]}
		}`),
	)
	context.Request.Header.Set("Content-Type", "application/json")
	CopilotPlaygroundConnect(context)

	require.Equal(t, http.StatusOK, recorder.Code)
	events := decodeCopilotSSEEvents(t, recorder.Body.Bytes())
	require.Len(t, events, 3)
	assert.Equal(t, "MESSAGES_SNAPSHOT", events[1]["type"])
	messages, ok := events[1]["messages"].([]any)
	require.True(t, ok)
	require.Len(t, messages, 2)
	assert.Equal(t, "Remember this", messages[0].(map[string]any)["content"])
	assert.Equal(t, "Stored in the browser", messages[1].(map[string]any)["content"])
}

func TestCopilotPlaygroundConnectRestoresInitializedAgentMessages(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Params = gin.Params{{Key: "agent_id", Value: copilotPlaygroundAgentID}}
	context.Request = httptest.NewRequest(
		http.MethodPost,
		"/pg/copilotkit/agent/token-boat-playground/connect",
		strings.NewReader(`{
			"threadId":"browser-only-thread",
			"runId":"connect-2",
			"forwardedProps":{"localMessages":[
				{"id":"user-stale","role":"user","content":"Stale browser snapshot"}
			]},
			"messages":[
				{"id":"user-history","role":"user","content":"Restore me"},
				{"id":"assistant-history","role":"assistant","content":"Restored"}
			]
		}`),
	)
	context.Request.Header.Set("Content-Type", "application/json")
	CopilotPlaygroundConnect(context)

	require.Equal(t, http.StatusOK, recorder.Code)
	events := decodeCopilotSSEEvents(t, recorder.Body.Bytes())
	require.Len(t, events, 3)
	messages, ok := events[1]["messages"].([]any)
	require.True(t, ok)
	require.Len(t, messages, 2)
	assert.Equal(t, "Restore me", messages[0].(map[string]any)["content"])
	assert.Equal(t, "Restored", messages[1].(map[string]any)["content"])
}

func decodeCopilotSSEEvents(t *testing.T, body []byte) []map[string]any {
	t.Helper()
	events := make([]map[string]any, 0)
	for _, block := range bytes.Split(body, []byte("\n\n")) {
		line := strings.TrimSpace(string(block))
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		var event map[string]any
		require.NoError(t, common.Unmarshal([]byte(strings.TrimSpace(strings.TrimPrefix(line, "data:"))), &event))
		events = append(events, event)
	}
	return events
}
