package controller

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"github.com/gin-gonic/gin"
)

const copilotPlaygroundAgentID = "token-boat-playground"

type copilotPlaygroundRunInput struct {
	ThreadID       string                          `json:"threadId"`
	RunID          string                          `json:"runId"`
	Messages       []copilotPlaygroundMessage      `json:"messages"`
	ForwardedProps copilotPlaygroundForwardedProps `json:"forwardedProps"`
}

type copilotPlaygroundMessage struct {
	Role    string `json:"role"`
	Content any    `json:"content"`
}

type copilotPlaygroundForwardedProps struct {
	APIKeyID     int      `json:"apiKeyId"`
	Group        string   `json:"group"`
	Model        string   `json:"model"`
	SystemPrompt string   `json:"systemPrompt"`
	Temperature  *float64 `json:"temperature"`
	MaxTokens    *uint    `json:"maxTokens"`
}

type copilotPlaygroundOpenAIRequest struct {
	APIKeyID    int                        `json:"api_key_id"`
	Group       string                     `json:"group,omitempty"`
	Model       string                     `json:"model"`
	Messages    []copilotPlaygroundMessage `json:"messages"`
	Stream      bool                       `json:"stream"`
	Temperature *float64                   `json:"temperature,omitempty"`
	MaxTokens   *uint                      `json:"max_tokens,omitempty"`
}

type copilotOpenAIStreamChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
		Code    any    `json:"code"`
	} `json:"error"`
}

func CopilotPlaygroundInfo(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"version": "1.0.0",
		"mode":    "sse",
		"agents": gin.H{
			copilotPlaygroundAgentID: gin.H{
				"name":        copilotPlaygroundAgentID,
				"className":   "TokenBoatPlaygroundAgent",
				"description": "Token Boat Playground chat agent",
				"capabilities": gin.H{
					"transport": gin.H{"streaming": true},
					"tools":     gin.H{"supported": false, "clientProvided": false},
					"multimodal": gin.H{
						"input": gin.H{
							"image": false,
							"audio": false,
							"video": false,
							"pdf":   false,
							"file":  false,
						},
					},
				},
			},
		},
		"audioFileTranscriptionEnabled": false,
		"suggestions":                   false,
		"inspectorMetadata":             false,
		"telemetryDisabled":             true,
	})
}

// CopilotPlaygroundRunAdapter converts CopilotKit's AG-UI request into the
// existing authenticated Playground relay request, then converts the OpenAI
// compatible response stream back into AG-UI events for <CopilotChat>.
func CopilotPlaygroundRunAdapter() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Param("agent_id") != copilotPlaygroundAgentID {
			c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": "playground agent not found"})
			return
		}

		var input copilotPlaygroundRunInput
		if err := common.UnmarshalBodyReusable(c, &input); err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid AG-UI run request"})
			return
		}
		if input.ThreadID == "" || input.RunID == "" || input.ForwardedProps.APIKeyID <= 0 ||
			strings.TrimSpace(input.ForwardedProps.Model) == "" {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "incomplete Playground configuration"})
			return
		}
		if input.ForwardedProps.Temperature != nil &&
			(*input.ForwardedProps.Temperature < 0 || *input.ForwardedProps.Temperature > 2) {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "temperature must be between 0 and 2"})
			return
		}
		if input.ForwardedProps.MaxTokens != nil &&
			(*input.ForwardedProps.MaxTokens == 0 || *input.ForwardedProps.MaxTokens > 32768) {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "maxTokens must be between 1 and 32768"})
			return
		}

		messages := make([]copilotPlaygroundMessage, 0, len(input.Messages)+1)
		if systemPrompt := strings.TrimSpace(input.ForwardedProps.SystemPrompt); systemPrompt != "" {
			messages = append(messages, copilotPlaygroundMessage{Role: "system", Content: systemPrompt})
		}
		for _, message := range input.Messages {
			if message.Role != "user" && message.Role != "assistant" && message.Role != "system" && message.Role != "developer" {
				continue
			}
			content, ok := message.Content.(string)
			if !ok {
				c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "multimodal Playground messages are not enabled"})
				return
			}
			messages = append(messages, copilotPlaygroundMessage{Role: message.Role, Content: content})
		}

		requestBody, err := common.Marshal(copilotPlaygroundOpenAIRequest{
			APIKeyID:    input.ForwardedProps.APIKeyID,
			Group:       input.ForwardedProps.Group,
			Model:       input.ForwardedProps.Model,
			Messages:    messages,
			Stream:      true,
			Temperature: input.ForwardedProps.Temperature,
			MaxTokens:   input.ForwardedProps.MaxTokens,
		})
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "unable to prepare Playground request"})
			return
		}

		common.CleanupBodyStorage(c)
		storage, err := common.CreateBodyStorage(requestBody)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "unable to store Playground request"})
			return
		}
		c.Set(common.KeyBodyStorage, storage)
		c.Request.Body = io.NopCloser(common.ReaderOnly(storage))
		c.Request.ContentLength = int64(len(requestBody))
		c.Request.URL.Path = "/pg/chat/completions"
		c.Request.Header.Set("Content-Type", "application/json")

		eventWriter := &copilotPlaygroundEventWriter{
			ResponseWriter: c.Writer,
			threadID:       input.ThreadID,
			runID:          input.RunID,
			messageID:      input.RunID + "-assistant",
			upstreamStatus: http.StatusOK,
		}
		c.Writer = eventWriter
		c.Next()
		eventWriter.finish()
		c.Abort()
	}
}

func CopilotPlaygroundConnect(c *gin.Context) {
	if c.Param("agent_id") != copilotPlaygroundAgentID {
		c.JSON(http.StatusNotFound, gin.H{"error": "playground agent not found"})
		return
	}
	var input copilotPlaygroundRunInput
	if err := common.UnmarshalBodyReusable(c, &input); err != nil || input.ThreadID == "" || input.RunID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid AG-UI connect request"})
		return
	}
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache, no-transform")
	c.Header("X-Accel-Buffering", "no")
	writeCopilotEvent(c.Writer, gin.H{
		"type": "RUN_STARTED", "threadId": input.ThreadID, "runId": input.RunID,
	})
	writeCopilotEvent(c.Writer, gin.H{
		"type": "RUN_FINISHED", "threadId": input.ThreadID, "runId": input.RunID,
		"outcome": gin.H{"type": "success"},
	})
	c.Writer.Flush()
}

func CopilotPlaygroundStop(c *gin.Context) {
	if c.Param("agent_id") != copilotPlaygroundAgentID {
		c.JSON(http.StatusNotFound, gin.H{"error": "playground agent not found"})
		return
	}
	c.Status(http.StatusNoContent)
}

type copilotPlaygroundEventWriter struct {
	gin.ResponseWriter
	threadID       string
	runID          string
	messageID      string
	upstreamStatus int
	buffer         bytes.Buffer
	started        bool
	messageStarted bool
	finished       bool
}

func (w *copilotPlaygroundEventWriter) WriteHeader(code int) {
	w.upstreamStatus = code
}

func (w *copilotPlaygroundEventWriter) WriteHeaderNow() {}

func (w *copilotPlaygroundEventWriter) Write(data []byte) (int, error) {
	if w.finished {
		return len(data), nil
	}
	_, _ = w.buffer.Write(data)
	if w.upstreamStatus >= http.StatusBadRequest {
		return len(data), nil
	}
	w.consumeLines()
	return len(data), nil
}

func (w *copilotPlaygroundEventWriter) WriteString(data string) (int, error) {
	return w.Write([]byte(data))
}

func (w *copilotPlaygroundEventWriter) Flush() {
	w.consumeLines()
	if w.ResponseWriter.Written() {
		w.ResponseWriter.Flush()
	}
}

func (w *copilotPlaygroundEventWriter) consumeLines() {
	for {
		data := w.buffer.Bytes()
		newline := bytes.IndexByte(data, '\n')
		if newline < 0 {
			return
		}
		line := strings.TrimSpace(string(data[:newline]))
		w.buffer.Next(newline + 1)
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		w.consumeOpenAIData(strings.TrimSpace(strings.TrimPrefix(line, "data:")))
	}
}

func (w *copilotPlaygroundEventWriter) consumeOpenAIData(data string) {
	if data == "" {
		return
	}
	if data == "[DONE]" {
		w.finishSuccess()
		return
	}

	var chunk copilotOpenAIStreamChunk
	if err := common.Unmarshal([]byte(data), &chunk); err != nil {
		return
	}
	if chunk.Error != nil {
		w.finishError(chunk.Error.Message, fmt.Sprint(chunk.Error.Code))
		return
	}
	for _, choice := range chunk.Choices {
		if choice.Delta.Content != "" {
			w.writeContent(choice.Delta.Content)
		}
	}
}

func (w *copilotPlaygroundEventWriter) beginRun() {
	if w.started {
		return
	}
	w.started = true
	header := w.ResponseWriter.Header()
	header.Del("Content-Length")
	header.Set("Content-Type", "text/event-stream")
	header.Set("Cache-Control", "no-cache, no-transform")
	header.Set("Connection", "keep-alive")
	header.Set("X-Accel-Buffering", "no")
	w.ResponseWriter.WriteHeader(http.StatusOK)
	writeCopilotEvent(w.ResponseWriter, gin.H{
		"type": "RUN_STARTED", "threadId": w.threadID, "runId": w.runID,
	})
}

func (w *copilotPlaygroundEventWriter) beginMessage() {
	w.beginRun()
	if w.messageStarted {
		return
	}
	w.messageStarted = true
	writeCopilotEvent(w.ResponseWriter, gin.H{
		"type": "TEXT_MESSAGE_START", "messageId": w.messageID, "role": "assistant",
	})
}

func (w *copilotPlaygroundEventWriter) writeContent(content string) {
	w.beginMessage()
	writeCopilotEvent(w.ResponseWriter, gin.H{
		"type": "TEXT_MESSAGE_CONTENT", "messageId": w.messageID, "delta": content,
	})
	w.ResponseWriter.Flush()
}

func (w *copilotPlaygroundEventWriter) finish() {
	if w.finished {
		return
	}
	w.consumeLines()
	remaining := strings.TrimSpace(w.buffer.String())
	if remaining != "" {
		if strings.HasPrefix(remaining, "data:") {
			w.consumeOpenAIData(strings.TrimSpace(strings.TrimPrefix(remaining, "data:")))
		} else {
			var response copilotOpenAIStreamChunk
			if err := common.Unmarshal([]byte(remaining), &response); err == nil {
				if response.Error != nil {
					w.finishError(response.Error.Message, fmt.Sprint(response.Error.Code))
					return
				}
				for _, choice := range response.Choices {
					w.writeContent(choice.Message.Content)
				}
			}
		}
	}
	if w.finished {
		return
	}
	if w.upstreamStatus >= http.StatusBadRequest {
		w.finishError(http.StatusText(w.upstreamStatus), fmt.Sprint(w.upstreamStatus))
		return
	}
	w.finishSuccess()
}

func (w *copilotPlaygroundEventWriter) finishSuccess() {
	if w.finished {
		return
	}
	w.beginMessage()
	writeCopilotEvent(w.ResponseWriter, gin.H{
		"type": "TEXT_MESSAGE_END", "messageId": w.messageID,
	})
	writeCopilotEvent(w.ResponseWriter, gin.H{
		"type": "RUN_FINISHED", "threadId": w.threadID, "runId": w.runID,
		"outcome": gin.H{"type": "success"},
	})
	w.finished = true
	w.ResponseWriter.Flush()
}

func (w *copilotPlaygroundEventWriter) finishError(message string, code string) {
	if w.finished {
		return
	}
	w.beginRun()
	event := gin.H{"type": "RUN_ERROR", "message": message}
	if code != "" && code != "<nil>" {
		event["code"] = code
	}
	writeCopilotEvent(w.ResponseWriter, event)
	w.finished = true
	w.ResponseWriter.Flush()
}

func writeCopilotEvent(writer io.Writer, event any) {
	payload, err := common.Marshal(event)
	if err != nil {
		return
	}
	_, _ = fmt.Fprintf(writer, "data: %s\n\n", payload)
}
