package middleware

import (
	"fmt"
	"net/http"
	"runtime/debug"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/gin-gonic/gin"
)

func RelayPanicRecover() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				common.SysLog(fmt.Sprintf("panic detected: %v", err))
				common.SysLog(fmt.Sprintf("stacktrace from panic: %s", string(debug.Stack())))
				message := fmt.Sprintf("Panic detected, error: %v. Please submit a issue here: http://tokenboat.com", err)
				if c.Request != nil && (c.Request.URL.Path == "/v1/videos" || strings.HasPrefix(c.Request.URL.Path, "/v1/videos/")) {
					c.JSON(http.StatusInternalServerError, dto.OpenRouterVideoErrorResponse{
						Error: dto.OpenRouterVideoErrorData{Code: http.StatusInternalServerError, Message: message},
					})
					c.Abort()
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": gin.H{
						"message": message,
						"type":    "new_api_panic",
					},
				})
				c.Abort()
			}
		}()
		c.Next()
	}
}
