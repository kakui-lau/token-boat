package main

import (
	"regexp"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAnalyticsInjectionTargetsCompatibilityShell(t *testing.T) {
	t.Setenv("UMAMI_WEBSITE_ID", "site-id")
	t.Setenv("UMAMI_SCRIPT_URL", "https://analytics.example/script.js")
	t.Setenv("GOOGLE_ANALYTICS_ID", "G-TEST123")

	page := []byte("<head><!--umami-->\n<!--Google Analytics-->\n</head>")
	page = InjectUmamiAnalytics(page)
	page = InjectGoogleAnalytics(page)

	result := string(page)
	assert.Contains(t, result, `src="https://analytics.example/script.js"`)
	assert.Contains(t, result, `data-website-id="site-id"`)
	assert.Contains(t, result, `googletagmanager.com/gtag/js?id=G-TEST123`)
	assert.Contains(t, result, `gtag('config', 'G-TEST123')`)
	assert.NotContains(t, result, "<!--umami-->")
	assert.NotContains(t, result, "<!--Google Analytics-->")
}

func TestAnalyticsInjectionLeavesPublicPageWithoutPlaceholdersUntouched(t *testing.T) {
	t.Setenv("UMAMI_WEBSITE_ID", "site-id")
	t.Setenv("GOOGLE_ANALYTICS_ID", "G-TEST123")

	page := []byte("<html><head><title>Public site</title></head></html>")
	result := InjectGoogleAnalytics(InjectUmamiAnalytics(page))

	assert.Equal(t, page, result)
}

func TestEmbeddedPublicSiteContainsReferencedAstroAssets(t *testing.T) {
	assetReferencePattern := regexp.MustCompile(`(?:href|src)="(/_astro/[^"?#]+)`)
	assetReferences := assetReferencePattern.FindAllSubmatch(indexPage, -1)
	require.NotEmpty(t, assetReferences, "public index must reference at least one Astro asset")

	for _, assetReference := range assetReferences {
		assetPath := "web/dist" + string(assetReference[1])
		asset, err := buildFS.ReadFile(assetPath)
		require.NoError(t, err, assetPath)
		assert.NotEmpty(t, asset, assetPath)
	}
}
