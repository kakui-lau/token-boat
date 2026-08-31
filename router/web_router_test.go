package router

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWebAssetsSelectsConsoleShellOnlyForConsoleRoutes(t *testing.T) {
	assets := WebAssets{
		IndexPage:        []byte("legacy"),
		ConsoleIndexPage: []byte("console"),
	}

	assert.Equal(t, []byte("console"), assets.indexPageForPath("/console/logs"))
	assert.Equal(t, []byte("legacy"), assets.indexPageForPath("/pricing"))
	assert.Equal(t, []byte("legacy"), assets.indexPageForPath("/console-like"))
}

func TestWebAssetsFallsBackToLegacyShellWhenConsoleIsNotBundled(t *testing.T) {
	assets := WebAssets{IndexPage: []byte("legacy")}

	assert.Equal(t, []byte("legacy"), assets.indexPageForPath("/console/logs"))
}

func TestWebRouterServesLegacyAndConsoleApplicationsFromOneBundle(t *testing.T) {
	gin.SetMode(gin.TestMode)
	buildFS := fstest.MapFS{
		"web/dist/index.html":                {Data: []byte("legacy-shell")},
		"web/dist/static/legacy.js":          {Data: []byte("legacy-asset")},
		"web/dist/console/index.html":        {Data: []byte("console-shell")},
		"web/dist/console/assets/console.js": {Data: []byte("console-asset")},
	}
	assets := WebAssets{
		BuildFS:          buildFS,
		IndexPage:        []byte("legacy-shell"),
		ConsoleIndexPage: []byte("console-shell"),
	}
	router := gin.New()
	SetWebRouter(router, assets)

	assertResponseBody(t, router, "/pricing", http.StatusOK, "legacy-shell")
	assertResponseBody(t, router, "/console/", http.StatusOK, "console-shell")
	assertResponseBody(t, router, "/console/logs", http.StatusOK, "console-shell")
	assertResponseBody(t, router, "/console/assets/console.js", http.StatusOK, "console-asset")

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/console?tab=usage", nil)
	router.ServeHTTP(recorder, request)
	assert.Equal(t, http.StatusPermanentRedirect, recorder.Code)
	assert.Equal(t, "/console/?tab=usage", recorder.Header().Get("Location"))

	_, err := fs.Stat(buildFS, "web/dist/console/index.html")
	require.NoError(t, err)
}

func assertResponseBody(t *testing.T, handler http.Handler, path string, status int, body string) {
	t.Helper()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, path, nil)
	handler.ServeHTTP(recorder, request)
	assert.Equal(t, status, recorder.Code)
	assert.Equal(t, body, recorder.Body.String())
}
