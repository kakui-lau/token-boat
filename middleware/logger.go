package middleware

import (
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

const RouteTagKey = "route_tag"

const successfulHealthAccessLogInterval = time.Minute

func RouteTag(tag string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(RouteTagKey, tag)
		if tag == "relay" && !c.GetBool(common.ClientRequestAuditKey) {
			common.BeginClientRequestLog(c)
			defer common.FinishClientRequestLog(c)
		}
		c.Next()
	}
}

// IsRelayRequestPath identifies public model-interaction routes before Gin has
// resolved the final route. It keeps authentication and decompression failures
// inside the same request-audit path as successful relay calls.
func IsRelayRequestPath(requestPath string) bool {
	for _, prefix := range []string{"/v1", "/v1beta", "/pg", "/mj", "/suno", "/kling/v1", "/jimeng"} {
		if requestPath == prefix || strings.HasPrefix(requestPath, prefix+"/") {
			return true
		}
	}

	segments := strings.Split(strings.Trim(requestPath, "/"), "/")
	return len(segments) >= 2 && segments[0] != "api" && segments[1] == "mj"
}

// ClientRequestAudit snapshots relay request metadata before any middleware
// can abort or rewrite it. Body content is captured only if normal processing
// reads it through common.GetRequestBody.
func ClientRequestAudit() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request == nil || !IsRelayRequestPath(c.Request.URL.Path) {
			c.Next()
			return
		}
		c.Set(RouteTagKey, "relay")
		common.BeginClientRequestLog(c)
		defer common.FinishClientRequestLog(c)
		c.Next()
	}
}

func SetUpLogger(server *gin.Engine) {
	server.Use(gin.LoggerWithFormatter(newAccessLogFormatter()))
}

func newAccessLogFormatter() gin.LogFormatter {
	var healthLogMu sync.Mutex
	var lastSuccessfulHealthLog time.Time
	return func(param gin.LogFormatterParams) string {
		if param.Path == "/health" && param.StatusCode < http.StatusBadRequest {
			healthLogMu.Lock()
			if !lastSuccessfulHealthLog.IsZero() &&
				param.TimeStamp.Sub(lastSuccessfulHealthLog) < successfulHealthAccessLogInterval {
				healthLogMu.Unlock()
				return ""
			}
			lastSuccessfulHealthLog = param.TimeStamp
			healthLogMu.Unlock()
		}
		var requestID string
		if param.Keys != nil {
			requestID, _ = param.Keys[common.RequestIdKey].(string)
		}
		tag, _ := param.Keys[RouteTagKey].(string)
		if tag == "" {
			tag = "web"
		}
		requestPath := common.SanitizeRequestURLForLog(param.Path)
		clientRequest := ""
		if param.Keys != nil {
			if value, ok := param.Keys[common.ClientRequestAccessLogKey].(string); ok && value != "" {
				clientRequest = " | client_request: " + value
			}
		}
		return fmt.Sprintf("[GIN] %s | %s | %s | %3d | %13v | %15s | %7s %s%s\n",
			param.TimeStamp.Format("2006/01/02 - 15:04:05"),
			tag,
			requestID,
			param.StatusCode,
			param.Latency,
			param.ClientIP,
			param.Method,
			requestPath,
			clientRequest,
		)
	}
}
