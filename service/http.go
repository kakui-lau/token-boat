package service

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"github.com/gin-gonic/gin"
)

var upstreamRequestIDHeaderNames = []string{
	common.RequestIdKey,
	"X-Request-Id",
	"Request-Id",
	"X-Amzn-RequestId",
	"X-Goog-Request-Id",
	"X-Ms-Request-Id",
	"X-Trace-Id",
	"Trace-Id",
}

// CaptureUpstreamRequestID stores the first recognized provider request ID for
// usage-log correlation. The value is capped to the database column length.
func CaptureUpstreamRequestID(c *gin.Context, header http.Header) string {
	if c == nil || header == nil {
		return ""
	}
	if existing := c.GetString(common.UpstreamRequestIdKey); existing != "" {
		return existing
	}
	for _, name := range upstreamRequestIDHeaderNames {
		value := strings.TrimSpace(header.Get(name))
		if value == "" {
			continue
		}
		if len(value) > 128 {
			value = value[:128]
		}
		c.Set(common.UpstreamRequestIdKey, value)
		return value
	}
	return ""
}

// CaptureUpstreamResponseID records the provider-generated response object ID.
// This is the ID returned in JSON/SSE payloads (for example, chatcmpl-...) and
// intentionally takes precedence over a transport-level request header ID.
func CaptureUpstreamResponseID(c *gin.Context, data []byte) string {
	if c == nil || len(data) == 0 {
		return ""
	}
	var payload struct {
		ID         string `json:"id"`
		ResponseID string `json:"response_id"`
		Response   *struct {
			ID string `json:"id"`
		} `json:"response"`
		Message *struct {
			ID string `json:"id"`
		} `json:"message"`
	}
	if err := common.Unmarshal(data, &payload); err != nil {
		return ""
	}
	value := payload.ID
	if value == "" {
		value = payload.ResponseID
	}
	if value == "" && payload.Response != nil {
		value = payload.Response.ID
	}
	if value == "" && payload.Message != nil {
		value = payload.Message.ID
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if len(value) > 128 {
		value = value[:128]
	}
	c.Set(common.UpstreamRequestIdKey, value)
	return value
}

func CloseResponseBodyGracefully(httpResponse *http.Response) {
	if httpResponse == nil || httpResponse.Body == nil {
		return
	}
	err := httpResponse.Body.Close()
	if err != nil {
		common.SysError("failed to close response body: " + err.Error())
	}
}

// ShouldCopyUpstreamHeader checks whether a given upstream response header
// should be copied to the client response. It returns false for Content-Length
// (managed separately) and X-Oneapi-Request-Id (to preserve the local instance
// ID). When the upstream header is X-Oneapi-Request-Id, the value is captured
// into the Gin context for later logging.
func ShouldCopyUpstreamHeader(c *gin.Context, k string, v []string) bool {
	if strings.EqualFold(k, "Content-Length") {
		return false
	}
	if strings.EqualFold(k, common.RequestIdKey) {
		CaptureUpstreamRequestID(c, http.Header{k: v})
		return false
	}
	return true
}

func IOCopyBytesGracefully(c *gin.Context, src *http.Response, data []byte) {
	if c.Writer == nil {
		return
	}
	CaptureUpstreamResponseID(c, data)

	body := io.NopCloser(bytes.NewBuffer(data))

	// We shouldn't set the header before we parse the response body, because the parse part may fail.
	// And then we will have to send an error response, but in this case, the header has already been set.
	// So the httpClient will be confused by the response.
	// For example, Postman will report error, and we cannot check the response at all.
	if src != nil {
		for k, v := range src.Header {
			if !ShouldCopyUpstreamHeader(c, k, v) {
				continue
			}
			c.Writer.Header().Set(k, v[0])
		}
	}

	// set Content-Length header manually BEFORE calling WriteHeader
	c.Writer.Header().Set("Content-Length", fmt.Sprintf("%d", len(data)))

	// Write header with status code (this sends the headers)
	if src != nil {
		c.Writer.WriteHeader(src.StatusCode)
	} else {
		c.Writer.WriteHeader(http.StatusOK)
	}

	_, err := io.Copy(c.Writer, body)
	if err != nil {
		logger.LogError(c, fmt.Sprintf("failed to copy response body: %s", err.Error()))
	}
	c.Writer.Flush()
}
