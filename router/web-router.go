package router

import (
	"io/fs"
	"net/http"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

// WebAssets holds the embedded public site and application frontend assets.
type WebAssets struct {
	BuildFS             fs.FS
	IndexPage           []byte
	LocalizedIndexPages map[string][]byte
	LegacyIndexPage     []byte
	NotFoundPage        []byte
	NotFoundPages       map[string][]byte
	ConsoleIndexPage    []byte
	LegacyPublicSite    bool
}

func (assets WebAssets) notFoundPageForPath(requestPath string) []byte {
	trimmedPath := strings.TrimPrefix(requestPath, "/")
	locale, _, _ := strings.Cut(trimmedPath, "/")
	if page := assets.NotFoundPages[locale]; len(page) > 0 {
		return page
	}
	return assets.NotFoundPage
}

func (assets WebAssets) indexPageForPath(requestPath string) []byte {
	if strings.HasPrefix(requestPath, "/console/") {
		return assets.ConsoleIndexPage
	}
	if isLegacyShellPath(requestPath) {
		return assets.LegacyIndexPage
	}
	return assets.IndexPage
}

func legacyUserConsoleTarget(requestPath string) (string, bool) {
	normalizedPath := strings.TrimRight(requestPath, "/")
	switch normalizedPath {
	case "/getting-started":
		return "/console/getting-started", true
	case "/chat2link":
		return "/console/playground", true
	case "/keys":
		return "/console/api-keys", true
	case "/playground":
		return "/console/playground", true
	case "/profile":
		return "/console/account", true
	case "/recharge":
		return "/console/recharge", true
	case "/usage-logs", "/usage-logs/common":
		return "/console/logs", true
	case "/usage-logs/drawing", "/usage-logs/task":
		return "/console/tasks", true
	case "/wallet":
		return "/console/billing", true
	default:
		if strings.HasPrefix(normalizedPath, "/chat/") {
			return "/console/playground", true
		}
		return "", false
	}
}

func isLegacyWalletPaymentReturn(requestURL *url.URL) bool {
	if strings.TrimRight(requestURL.Path, "/") != "/wallet" {
		return false
	}
	query := requestURL.Query()
	return query.Get("pay") == "pending" && strings.TrimSpace(query.Get("trade_no")) != ""
}

func isLegacyShellPath(requestPath string) bool {
	normalizedPath := strings.TrimRight(requestPath, "/")
	switch normalizedPath {
	case "/setup",
		"/login",
		"/forbidden",
		"/privacy",
		"/privacy-policy",
		"/refund",
		"/terms",
		"/user-agreement",
		"/sign-in",
		"/sign-up",
		"/register",
		"/forgot-password",
		"/reset",
		"/otp",
		"/oauth",
		"/user/reset",
		"/401",
		"/403",
		"/500",
		"/503",
		"/system-settings",
		"/support/community-interaction",
		"/wiki/features-introduction",
		"/channel-daily-usage",
		"/channel-model-probes",
		"/channel-monthly-usage",
		"/channels",
		"/circuit-analysis",
		"/finance",
		"/models/deployments",
		"/models/metadata",
		"/official-pricing",
		"/pricing-admin",
		"/pricing-reconciliation",
		"/redemption-codes",
		"/sales-discount-calculator",
		"/sales-price-books",
		"/subscriptions",
		"/system-info",
		"/user-model-usage",
		"/users":
		return true
	default:
		for _, prefix := range []string{
			"/oauth/",
			"/dashboard/",
			"/errors/",
			"/pricing/",
			"/system-settings/",
		} {
			if strings.HasPrefix(normalizedPath, prefix) {
				return true
			}
		}
		return normalizedPath == "/dashboard"
	}
}

func shouldServeLegacyPublicDocument(requestPath string) bool {
	for _, prefix := range []string{
		"/api",
		"/v1",
		"/pg",
		"/mj",
		"/console",
		"/admin",
		"/_astro",
		"/assets",
		"/static",
		"/brand",
		"/fonts",
		"/.well-known",
	} {
		if requestPath == prefix || strings.HasPrefix(requestPath, prefix+"/") {
			return false
		}
	}

	trimmedPath := strings.TrimSuffix(requestPath, "/")
	lastSlash := strings.LastIndex(trimmedPath, "/")
	return !strings.Contains(trimmedPath[lastSlash+1:], ".")
}

func legacyPublicDocumentTarget(requestPath string) string {
	normalizedPath := strings.TrimSuffix(requestPath, "/")
	if normalizedPath == "" {
		normalizedPath = "/"
	}
	for _, localePrefix := range []string{"/en", "/ja", "/ko", "/zh-TW"} {
		if normalizedPath == localePrefix {
			normalizedPath = "/"
			break
		}
		if strings.HasPrefix(normalizedPath, localePrefix+"/") {
			normalizedPath = strings.TrimPrefix(normalizedPath, localePrefix)
			break
		}
	}

	switch normalizedPath {
	case "/models":
		return "/pricing"
	case "/docs":
		return "/wiki/features-introduction"
	case "/legal/privacy":
		return "/privacy-policy"
	case "/legal/terms":
		return "/terms"
	case "/support":
		return "/support/community-interaction"
	case "/faq", "/trust", "/status", "/changelog":
		return "/"
	}
	if strings.HasPrefix(normalizedPath, "/models/") {
		return "/pricing?search=" + url.QueryEscape(strings.TrimPrefix(normalizedPath, "/models/"))
	}
	if normalizedPath == "/" || normalizedPath == "/pricing" || isLegacyShellPath(normalizedPath) ||
		normalizedPath == "/about" || normalizedPath == "/rankings" {
		return normalizedPath
	}
	return "/"
}

func SetWebRouter(router *gin.Engine, assets WebAssets) {
	frontendFS := common.EmbedFolder(assets.BuildFS, "web/dist")

	router.Use(gzip.Gzip(gzip.DefaultCompression))
	router.Use(middleware.GlobalWebRateLimit())
	router.Use(middleware.WebSecurityHeaders())
	router.Use(func(c *gin.Context) {
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
			c.Next()
			return
		}
		if isLegacyWalletPaymentReturn(c.Request.URL) && len(assets.LegacyIndexPage) > 0 {
			c.Set(middleware.RouteTagKey, "web")
			c.Header("Cache-Control", "no-cache")
			if c.Request.Method == http.MethodHead {
				c.Status(http.StatusOK)
			} else {
				c.Data(http.StatusOK, "text/html; charset=utf-8", assets.LegacyIndexPage)
			}
			c.Abort()
			return
		}

		targetPath, ok := legacyUserConsoleTarget(c.Request.URL.Path)
		if !ok {
			c.Next()
			return
		}
		if c.Request.URL.RawQuery != "" {
			targetPath += "?" + c.Request.URL.RawQuery
		}
		c.Redirect(http.StatusPermanentRedirect, targetPath)
		c.Abort()
	})
	if assets.LegacyPublicSite && len(assets.LegacyIndexPage) > 0 {
		router.Use(func(c *gin.Context) {
			if (c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead) ||
				!shouldServeLegacyPublicDocument(c.Request.URL.Path) {
				c.Next()
				return
			}

			c.Set(middleware.RouteTagKey, "web")
			c.Header("Cache-Control", "no-cache")
			targetPath := legacyPublicDocumentTarget(c.Request.URL.Path)
			normalizedRequestPath := strings.TrimSuffix(c.Request.URL.Path, "/")
			if normalizedRequestPath == "" {
				normalizedRequestPath = "/"
			}
			if targetPath != normalizedRequestPath {
				if c.Request.URL.RawQuery != "" {
					separator := "?"
					if strings.Contains(targetPath, "?") {
						separator = "&"
					}
					targetPath += separator + c.Request.URL.RawQuery
				}
				c.Redirect(http.StatusFound, targetPath)
				c.Abort()
				return
			}
			if c.Request.Method == http.MethodHead {
				c.Status(http.StatusOK)
				c.Abort()
				return
			}
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.LegacyIndexPage)
			c.Abort()
		})
	}
	for source, target := range map[string]string{
		"/pricing":     "/models",
		"/pricing/":    "/models",
		"/en/pricing":  "/en/models",
		"/en/pricing/": "/en/models",
	} {
		source, target := source, target
		router.GET(source, func(c *gin.Context) {
			location := target
			if c.Request.URL.RawQuery != "" {
				location += "?" + c.Request.URL.RawQuery
			}
			c.Redirect(http.StatusMovedPermanently, location)
		})
	}
	router.GET("/console", func(c *gin.Context) {
		location := "/console/"
		if c.Request.URL.RawQuery != "" {
			location += "?" + c.Request.URL.RawQuery
		}
		c.Redirect(http.StatusPermanentRedirect, location)
	})
	router.GET("/console/", func(c *gin.Context) {
		c.Set(middleware.RouteTagKey, "web")
		c.Header("Cache-Control", "no-cache")
		c.Data(http.StatusOK, "text/html; charset=utf-8", assets.indexPageForPath(c.Request.URL.Path))
	})
	for _, locale := range []string{"en", "ja", "ko", "zh-TW"} {
		page := assets.LocalizedIndexPages[locale]
		if len(page) == 0 {
			continue
		}
		localePath := "/" + locale
		router.GET(localePath, func(c *gin.Context) {
			location := localePath + "/"
			if c.Request.URL.RawQuery != "" {
				location += "?" + c.Request.URL.RawQuery
			}
			c.Redirect(http.StatusMovedPermanently, location)
		})
		serveLocalizedHome := func(c *gin.Context) {
			c.Set(middleware.RouteTagKey, "web")
			c.Header("Cache-Control", "no-cache")
			if c.Request.Method == http.MethodHead {
				c.Status(http.StatusOK)
				return
			}
			c.Data(http.StatusOK, "text/html; charset=utf-8", page)
		}
		router.GET(localePath+"/", serveLocalizedHome)
		router.HEAD(localePath+"/", serveLocalizedHome)
	}
	serveAdminNotFound := func(c *gin.Context) {
		c.Set(middleware.RouteTagKey, "web")
		c.Header("Cache-Control", "no-cache")
		if c.Request.Method == http.MethodHead {
			c.Status(http.StatusNotFound)
			return
		}
		if len(assets.NotFoundPage) == 0 {
			c.Data(http.StatusNotFound, "text/plain; charset=utf-8", []byte(http.StatusText(http.StatusNotFound)))
			return
		}
		c.Data(http.StatusNotFound, "text/html; charset=utf-8", assets.NotFoundPage)
	}
	for _, requestPath := range []string{"/admin", "/admin/"} {
		router.GET(requestPath, serveAdminNotFound)
		router.HEAD(requestPath, serveAdminNotFound)
	}
	router.Use(static.Serve("/", frontendFS))
	router.NoRoute(func(c *gin.Context) {
		c.Set(middleware.RouteTagKey, "web")
		requestPath := c.Request.URL.Path
		if strings.HasPrefix(requestPath, "/v1") || strings.HasPrefix(requestPath, "/api") {
			controller.RelayNotFound(c)
			return
		}
		if strings.HasPrefix(requestPath, "/_astro/") || strings.HasPrefix(requestPath, "/assets") ||
			strings.HasPrefix(requestPath, "/static/") || strings.HasPrefix(requestPath, "/admin/assets/") ||
			strings.HasPrefix(requestPath, "/console/assets/") {
			c.Header("Cache-Control", "no-cache")
			controller.RelayNotFound(c)
			return
		}
		c.Header("Cache-Control", "no-cache")
		if requestPath == "/" || strings.HasPrefix(requestPath, "/console/") || isLegacyShellPath(requestPath) {
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.indexPageForPath(requestPath))
			return
		}
		notFoundPage := assets.notFoundPageForPath(requestPath)
		if len(notFoundPage) == 0 {
			c.Data(http.StatusNotFound, "text/plain; charset=utf-8", []byte(http.StatusText(http.StatusNotFound)))
			return
		}
		c.Data(http.StatusNotFound, "text/html; charset=utf-8", notFoundPage)
	})
}
