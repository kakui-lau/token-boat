package middleware

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

type turnstileCheckResponse struct {
	Success bool `json:"success"`
}

func TurnstileCheck() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !VerifyTurnstileRequest(c) {
			c.Abort()
			return
		}
		c.Next()
	}
}

// VerifyTurnstileRequest validates the request only when Turnstile is enabled.
// Controllers use it for conditional account-creation paths that share a login
// endpoint with existing users.
func VerifyTurnstileRequest(c *gin.Context) bool {
	if !common.TurnstileCheckEnabled {
		return true
	}
	// Prefer a header so verification tokens do not appear in request URLs,
	// proxy access logs, or browser history. Keep the query fallback for
	// existing clients during the migration.
	response := strings.TrimSpace(c.GetHeader("X-Turnstile-Token"))
	if response == "" {
		response = c.Query("turnstile")
	}
	if response == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "Turnstile token 为空"})
		return false
	}
	rawRes, err := http.PostForm("https://challenges.cloudflare.com/turnstile/v0/siteverify", url.Values{
		"secret": {common.TurnstileSecretKey}, "response": {response}, "remoteip": {c.ClientIP()},
	})
	if err != nil {
		common.SysLog(err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return false
	}
	defer rawRes.Body.Close()
	var res turnstileCheckResponse
	if err := common.DecodeJson(rawRes.Body, &res); err != nil {
		common.SysLog(err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return false
	}
	if !res.Success {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "Turnstile 校验失败，请刷新重试！"})
		return false
	}
	return true
}
