package middleware

import (
	"fmt"
	"net/http"
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
		return fmt.Sprintf("[GIN] %s | %s | %s | %3d | %13v | %15s | %7s %s\n",
			param.TimeStamp.Format("2006/01/02 - 15:04:05"),
			tag,
			requestID,
			param.StatusCode,
			param.Latency,
			param.ClientIP,
			param.Method,
			param.Path,
		)
	}
}
