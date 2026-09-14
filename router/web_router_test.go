package router

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWebAssetsSelectsProductAndCompatibilityShells(t *testing.T) {
	assets := WebAssets{
		IndexPage:        []byte("site"),
		LegacyIndexPage:  []byte("legacy"),
		ConsoleIndexPage: []byte("console"),
	}

	assert.Equal(t, []byte("console"), assets.indexPageForPath("/console/logs"))
	assert.Equal(t, []byte("legacy"), assets.indexPageForPath("/setup"))
	assert.Equal(t, []byte("legacy"), assets.indexPageForPath("/oauth/github"))
	assert.Equal(t, []byte("legacy"), assets.indexPageForPath("/user/reset"))
	assert.Equal(t, []byte("site"), assets.indexPageForPath("/pricing"))
	assert.Equal(t, []byte("site"), assets.indexPageForPath("/console-like"))
}

func TestWebAssetsDoesNotExposeSiteShellWhenConsoleIsNotBundled(t *testing.T) {
	assets := WebAssets{IndexPage: []byte("site")}

	assert.Empty(t, assets.indexPageForPath("/console/logs"))
	assert.Empty(t, assets.indexPageForPath("/dashboard"))
}

func TestLegacyShellRouteCompatibility(t *testing.T) {
	for _, requestPath := range []string{
		"/setup",
		"/oauth/github",
		"/user/reset",
		"/dashboard",
		"/subscriptions",
		"/channels",
		"/users",
		"/system-settings",
		"/system-settings/security/ssrf",
		"/models/metadata",
		"/models/deployments",
	} {
		assert.True(t, isLegacyShellPath(requestPath), requestPath)
	}
	for _, requestPath := range []string{
		"/",
		"/models",
		"/pricing",
		"/rankings",
		"/about",
		"/getting-started",
		"/chat/3",
		"/chat2link",
		"/keys",
		"/playground",
		"/profile",
		"/recharge",
		"/usage-logs/common",
		"/wallet",
	} {
		assert.False(t, isLegacyShellPath(requestPath), requestPath)
	}
}

func TestLegacyUserRoutesMapToTheNewConsole(t *testing.T) {
	routes := map[string]string{
		"/getting-started":    "/console/getting-started",
		"/chat/4":             "/console/playground",
		"/chat2link":          "/console/playground",
		"/keys":               "/console/api-keys",
		"/playground":         "/console/playground",
		"/profile":            "/console/account",
		"/recharge":           "/console/recharge",
		"/usage-logs":         "/console/logs",
		"/usage-logs/common":  "/console/logs",
		"/usage-logs/drawing": "/console/tasks",
		"/usage-logs/task":    "/console/tasks",
		"/wallet":             "/console/billing",
	}

	for source, expected := range routes {
		actual, ok := legacyUserConsoleTarget(source + "/")
		assert.True(t, ok, source)
		assert.Equal(t, expected, actual, source)
	}
	for _, requestPath := range []string{
		"/dashboard",
		"/oauth/github",
		"/setup",
		"/subscriptions",
		"/system-settings",
	} {
		_, ok := legacyUserConsoleTarget(requestPath)
		assert.False(t, ok, requestPath)
	}
}

func TestLegacyWalletPaymentReturnRequiresPendingTradeNumber(t *testing.T) {
	testCases := []struct {
		name     string
		target   string
		expected bool
	}{
		{name: "pending order", target: "/wallet?pay=pending&trade_no=order-123", expected: true},
		{name: "trailing slash", target: "/wallet/?pay=pending&trade_no=order-123", expected: true},
		{name: "missing trade number", target: "/wallet?pay=pending", expected: false},
		{name: "blank trade number", target: "/wallet?pay=pending&trade_no=%20", expected: false},
		{name: "completed order", target: "/wallet?pay=success&trade_no=order-123", expected: false},
		{name: "different page", target: "/recharge?pay=pending&trade_no=order-123", expected: false},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, testCase.target, nil)
			assert.Equal(t, testCase.expected, isLegacyWalletPaymentReturn(request.URL))
		})
	}
}

func TestWebRouterServesPublicSiteAndApplicationShellsFromOneBundle(t *testing.T) {
	gin.SetMode(gin.TestMode)
	buildFS := fstest.MapFS{
		"web/dist/index.html":                {Data: []byte("site-home")},
		"web/dist/404.html":                  {Data: []byte("site-not-found")},
		"web/dist/en/404/index.html":         {Data: []byte("site-not-found-en")},
		"web/dist/ja/404/index.html":         {Data: []byte("site-not-found-ja")},
		"web/dist/ko/404/index.html":         {Data: []byte("site-not-found-ko")},
		"web/dist/zh-TW/404/index.html":      {Data: []byte("site-not-found-zh-TW")},
		"web/dist/en/index.html":             {Data: []byte("site-home-en")},
		"web/dist/ja/index.html":             {Data: []byte("site-home-ja")},
		"web/dist/ko/index.html":             {Data: []byte("site-home-ko")},
		"web/dist/zh-TW/index.html":          {Data: []byte("site-home-zh-TW")},
		"web/dist/models/index.html":         {Data: []byte("site-models")},
		"web/dist/_astro/site.HASH.js":       {Data: []byte("site-asset")},
		"web/dist/legacy/index.html":         {Data: []byte("legacy-shell")},
		"web/dist/assets/legacy.HASH.js":     {Data: []byte("legacy-asset")},
		"web/dist/console/index.html":        {Data: []byte("console-shell")},
		"web/dist/console/assets/console.js": {Data: []byte("console-asset")},
	}
	assets := WebAssets{
		BuildFS:   buildFS,
		IndexPage: []byte("site-home"),
		LocalizedIndexPages: map[string][]byte{
			"en":    []byte("site-home-en"),
			"ja":    []byte("site-home-ja"),
			"ko":    []byte("site-home-ko"),
			"zh-TW": []byte("site-home-zh-TW"),
		},
		LegacyIndexPage: []byte("legacy-shell"),
		NotFoundPage:    []byte("site-not-found"),
		NotFoundPages: map[string][]byte{
			"en":    []byte("site-not-found-en"),
			"ja":    []byte("site-not-found-ja"),
			"ko":    []byte("site-not-found-ko"),
			"zh-TW": []byte("site-not-found-zh-TW"),
		},
		ConsoleIndexPage: []byte("console-shell"),
	}
	router := gin.New()
	router.Use(middleware.Cache())
	SetWebRouter(router, assets)

	assertResponseBody(t, router, "/", http.StatusOK, "site-home")
	assertResponseBody(t, router, "/models", http.StatusOK, "site-models")
	assertResponseBody(t, router, "/models/", http.StatusMovedPermanently, "")
	assertResponseBody(t, router, "/en/", http.StatusOK, "site-home-en")
	assertResponseBody(t, router, "/ja/", http.StatusOK, "site-home-ja")
	assertResponseBody(t, router, "/ko/", http.StatusOK, "site-home-ko")
	assertResponseBody(t, router, "/zh-TW/", http.StatusOK, "site-home-zh-TW")
	for _, locale := range []string{"en", "ja", "ko", "zh-TW"} {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/"+locale, nil)
		router.ServeHTTP(recorder, request)
		assert.Equal(t, http.StatusMovedPermanently, recorder.Code, locale)
		assert.Equal(t, "/"+locale+"/", recorder.Header().Get("Location"), locale)
	}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/ja?source=locale-switcher", nil)
	router.ServeHTTP(recorder, request)
	assert.Equal(t, http.StatusMovedPermanently, recorder.Code)
	assert.Equal(t, "/ja/?source=locale-switcher", recorder.Header().Get("Location"))
	assertResponseBody(t, router, "/_astro/site.HASH.js", http.StatusOK, "site-asset")
	assertResponseBody(t, router, "/setup", http.StatusOK, "legacy-shell")
	assertResponseBody(t, router, "/dashboard", http.StatusOK, "legacy-shell")
	assertResponseBody(t, router, "/dashboard/overview", http.StatusOK, "legacy-shell")
	assertResponseBody(t, router, "/oauth/github", http.StatusOK, "legacy-shell")
	assertResponseBody(t, router, "/user/reset", http.StatusOK, "legacy-shell")
	assertRedirect(t, router, "/wallet", http.StatusPermanentRedirect, "/console/billing")
	assertRedirect(t, router, "/wallet?show_history=true", http.StatusPermanentRedirect, "/console/billing?show_history=true")
	assertResponseBody(t, router, "/wallet?pay=pending&trade_no=order-123&source=stripe", http.StatusOK, "legacy-shell")
	assertRedirect(t, router, "/keys", http.StatusPermanentRedirect, "/console/api-keys")
	assertRedirect(t, router, "/playground?model=openai%2Fgpt-5", http.StatusPermanentRedirect, "/console/playground?model=openai%2Fgpt-5")
	assertRedirect(t, router, "/usage-logs/task", http.StatusPermanentRedirect, "/console/tasks")
	assertResponseBody(t, router, "/pricing/legacy-model", http.StatusOK, "legacy-shell")
	assertResponseBody(t, router, "/assets/legacy.HASH.js", http.StatusOK, "legacy-asset")
	assertResponseBody(t, router, "/console/", http.StatusOK, "console-shell")
	assertResponseBody(t, router, "/console/logs", http.StatusOK, "console-shell")
	assertResponseBody(t, router, "/console/assets/console.js", http.StatusOK, "console-asset")
	assertResponseBody(t, router, "/admin", http.StatusNotFound, "site-not-found")
	assertResponseBody(t, router, "/admin/", http.StatusNotFound, "site-not-found")
	assertResponseBody(t, router, "/admin/gateway/channels", http.StatusNotFound, "site-not-found")
	assertResponseBody(t, router, "/does-not-exist", http.StatusNotFound, "site-not-found")
	assertResponseBody(t, router, "/en/does-not-exist", http.StatusNotFound, "site-not-found-en")
	assertResponseBody(t, router, "/ja/does-not-exist", http.StatusNotFound, "site-not-found-ja")
	assertResponseBody(t, router, "/ko/does-not-exist", http.StatusNotFound, "site-not-found-ko")
	assertResponseBody(t, router, "/zh-TW/does-not-exist", http.StatusNotFound, "site-not-found-zh-TW")
	assertResponseBody(t, router, "/404.html", http.StatusNotFound, "site-not-found")
	assertResponseBody(t, router, "/en/404", http.StatusNotFound, "site-not-found-en")
	assertResponseBody(t, router, "/legacy", http.StatusNotFound, "site-not-found")

	recorder = httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodGet, "/pricing?source=legacy", nil)
	router.ServeHTTP(recorder, request)
	assert.Equal(t, http.StatusMovedPermanently, recorder.Code)
	assert.Equal(t, "/models?source=legacy", recorder.Header().Get("Location"))

	recorder = httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodGet, "/en/pricing/", nil)
	router.ServeHTTP(recorder, request)
	assert.Equal(t, http.StatusMovedPermanently, recorder.Code)
	assert.Equal(t, "/en/models", recorder.Header().Get("Location"))

	recorder = httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodGet, "/admin/assets/missing.js", nil)
	router.ServeHTTP(recorder, request)
	assert.Equal(t, http.StatusNotFound, recorder.Code)
	assert.Equal(t, "no-cache", recorder.Header().Get("Cache-Control"))

	recorder = httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodGet, "/admin/", nil)
	router.ServeHTTP(recorder, request)
	assert.Equal(t, http.StatusNotFound, recorder.Code)
	assert.Empty(t, recorder.Header().Get("Location"))
	assert.Equal(t, "no-cache", recorder.Header().Get("Cache-Control"))
	assert.Equal(t, "nosniff", recorder.Header().Get("X-Content-Type-Options"))

	recorder = httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodGet, "/console?tab=usage", nil)
	router.ServeHTTP(recorder, request)
	assert.Equal(t, http.StatusPermanentRedirect, recorder.Code)
	assert.Equal(t, "/console/?tab=usage", recorder.Header().Get("Location"))

	recorder = httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodHead, "/wallet?pay=pending&trade_no=order-123", nil)
	router.ServeHTTP(recorder, request)
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Empty(t, recorder.Header().Get("Location"))
	assert.Empty(t, recorder.Body.String())

	recorder = httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodHead, "/wallet?show_history=true", nil)
	router.ServeHTTP(recorder, request)
	assert.Equal(t, http.StatusPermanentRedirect, recorder.Code)
	assert.Equal(t, "/console/billing?show_history=true", recorder.Header().Get("Location"))

	recorder = httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodGet, "/models", nil)
	router.ServeHTTP(recorder, request)
	assert.Equal(t, "no-cache", recorder.Header().Get("Cache-Control"))
	assert.Equal(t, "nosniff", recorder.Header().Get("X-Content-Type-Options"))
	assert.Equal(t, "strict-origin-when-cross-origin", recorder.Header().Get("Referrer-Policy"))

	recorder = httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodGet, "/_astro/site.HASH.js", nil)
	router.ServeHTTP(recorder, request)
	assert.Equal(t, "public, max-age=31536000, immutable", recorder.Header().Get("Cache-Control"))

	_, err := fs.Stat(buildFS, "web/dist/models/index.html")
	require.NoError(t, err)
	_, err = fs.Stat(buildFS, "web/dist/console/index.html")
	require.NoError(t, err)
}

func TestWebRouterCanRollBackOnlyThePublicSite(t *testing.T) {
	gin.SetMode(gin.TestMode)
	buildFS := fstest.MapFS{
		"web/dist/index.html":                {Data: []byte("site-home")},
		"web/dist/404.html":                  {Data: []byte("site-not-found")},
		"web/dist/models/index.html":         {Data: []byte("site-models")},
		"web/dist/robots.txt":                {Data: []byte("robots")},
		"web/dist/_astro/site.HASH.js":       {Data: []byte("site-asset")},
		"web/dist/legacy/index.html":         {Data: []byte("legacy-shell")},
		"web/dist/console/index.html":        {Data: []byte("console-shell")},
		"web/dist/console/assets/console.js": {Data: []byte("console-asset")},
		// A stale local build must not make unfinished Admin V2 reachable.
		"web/dist/admin/index.html": {Data: []byte("admin-shell")},
	}
	assets := WebAssets{
		BuildFS:          buildFS,
		IndexPage:        []byte("site-home"),
		LegacyIndexPage:  []byte("legacy-shell"),
		NotFoundPage:     []byte("site-not-found"),
		ConsoleIndexPage: []byte("console-shell"),
		LegacyPublicSite: true,
	}
	router := gin.New()
	router.Use(middleware.Cache())
	SetWebRouter(router, assets)

	assertResponseBody(t, router, "/", http.StatusOK, "legacy-shell")
	assertRedirect(t, router, "/models", http.StatusFound, "/pricing")
	assertResponseBody(t, router, "/pricing", http.StatusOK, "legacy-shell")
	assertResponseBody(t, router, "/pricing?search=openai%2Fgpt-5", http.StatusOK, "legacy-shell")
	assertRedirect(t, router, "/en/docs", http.StatusFound, "/wiki/features-introduction")
	assertRedirect(t, router, "/ja/legal/privacy", http.StatusFound, "/privacy-policy")
	assertRedirect(t, router, "/ko/support", http.StatusFound, "/support/community-interaction")
	assertRedirect(t, router, "/zh-TW/status", http.StatusFound, "/")
	assertRedirect(
		t,
		router,
		"/en/models/openai/gpt-5?source=rollback",
		http.StatusFound,
		"/pricing?search=openai%2Fgpt-5&source=rollback",
	)
	assertResponseBody(t, router, "/dashboard", http.StatusOK, "legacy-shell")
	assertRedirect(t, router, "/profile", http.StatusPermanentRedirect, "/console/account")
	assertRedirect(t, router, "/usage-logs/common", http.StatusPermanentRedirect, "/console/logs")
	assertRedirect(t, router, "/wallet", http.StatusPermanentRedirect, "/console/billing")
	assertResponseBody(t, router, "/wallet?pay=pending&trade_no=order-123", http.StatusOK, "legacy-shell")
	assertResponseBody(t, router, "/console/logs", http.StatusOK, "console-shell")
	assertResponseBody(t, router, "/console/assets/console.js", http.StatusOK, "console-asset")
	assertResponseBody(t, router, "/robots.txt", http.StatusOK, "robots")
	assertResponseBody(t, router, "/_astro/site.HASH.js", http.StatusOK, "site-asset")
	assertResponseBody(t, router, "/admin", http.StatusNotFound, "site-not-found")
	assertResponseBody(t, router, "/admin/", http.StatusNotFound, "site-not-found")
}

func TestSetRouterAppliesNoStoreToRegisteredAPI(t *testing.T) {
	gin.SetMode(gin.TestMode)
	buildFS := fstest.MapFS{
		"web/dist/index.html": {Data: []byte("site-home")},
		"web/dist/404.html":   {Data: []byte("site-not-found")},
	}
	engine := gin.New()
	SetRouter(engine, WebAssets{
		BuildFS:      buildFS,
		IndexPage:    []byte("site-home"),
		NotFoundPage: []byte("site-not-found"),
	})

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/privacy-policy", nil)
	engine.ServeHTTP(response, request)

	assert.Equal(t, http.StatusOK, response.Code)
	assert.Equal(
		t,
		"no-store, no-cache, must-revalidate, private, max-age=0",
		response.Header().Get("Cache-Control"),
	)
	assert.Equal(t, "no-cache", response.Header().Get("Pragma"))
	assert.Equal(t, "0", response.Header().Get("Expires"))
}

func assertResponseBody(t *testing.T, handler http.Handler, path string, status int, body string) {
	t.Helper()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, path, nil)
	handler.ServeHTTP(recorder, request)
	assert.Equal(t, status, recorder.Code)
	assert.Equal(t, body, recorder.Body.String())
}

func assertRedirect(t *testing.T, handler http.Handler, path string, status int, location string) {
	t.Helper()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, path, nil)
	handler.ServeHTTP(recorder, request)
	assert.Equal(t, status, recorder.Code)
	assert.Equal(t, location, recorder.Header().Get("Location"))
}
