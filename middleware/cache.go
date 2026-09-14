package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
)

func Cache() func(c *gin.Context) {
	return func(c *gin.Context) {
		requestPath := c.Request.URL.Path
		if requestPath == "/api" || strings.HasPrefix(requestPath, "/api/") ||
			requestPath == "/v1" || strings.HasPrefix(requestPath, "/v1/") ||
			requestPath == "/pg" || strings.HasPrefix(requestPath, "/pg/") ||
			requestPath == "/mj" || strings.HasPrefix(requestPath, "/mj/") {
			c.Header("Cache-Control", "no-store, no-cache, must-revalidate, private, max-age=0")
			c.Header("Pragma", "no-cache")
			c.Header("Expires", "0")
		} else if strings.HasPrefix(requestPath, "/_astro/") ||
			strings.HasPrefix(requestPath, "/assets/") ||
			strings.HasPrefix(requestPath, "/static/") ||
			strings.HasPrefix(requestPath, "/console/assets/") {
			c.Header("Cache-Control", "public, max-age=31536000, immutable")
		} else if strings.HasPrefix(requestPath, "/brand/") || strings.HasPrefix(requestPath, "/fonts/") {
			c.Header("Cache-Control", "public, max-age=604800")
		} else {
			c.Header("Cache-Control", "no-cache")
		}
		c.Next()
	}
}

func WebSecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Next()
	}
}
