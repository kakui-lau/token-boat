package billingexpr

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParseExprVersionTrimsOuterWhitespace(t *testing.T) {
	version, body := ParseExprVersion(" \n v2:tier(\"base\", req * 1) \t")

	assert.Equal(t, 2, version)
	assert.Equal(t, `tier("base", req * 1)`, body)
}

func TestParseExprVersionKeepsLegacyExpressionsAsV1(t *testing.T) {
	version, body := ParseExprVersion(" tier(\"base\", p * 1) ")

	assert.Equal(t, 1, version)
	assert.Equal(t, `tier("base", p * 1)`, body)
}

func TestNormalizeTokenParamsExcludesSeparatelyPricedOpenAISubcategories(t *testing.T) {
	params := NormalizeTokenParams(TokenParams{
		P: 1_000, C: 500, CR: 200, CC: 100, Img: 50, AI: 25, ImgO: 40, AO: 10,
	}, false, map[string]bool{
		"cr": true, "cc": true, "img": true, "ai": true, "img_o": true, "ao": true,
	})

	assert.Equal(t, 625.0, params.P)
	assert.Equal(t, 450.0, params.C)
	assert.Equal(t, 1_000.0, params.Len)
}

func TestNormalizeTokenParamsPreservesAnthropicTextCountsAndBuildsContextLength(t *testing.T) {
	params := NormalizeTokenParams(TokenParams{
		P: 700, C: 500, CR: 200, CC: 100, CC1h: 50,
	}, true, map[string]bool{"cr": true, "cc": true, "cc1h": true})

	assert.Equal(t, 700.0, params.P)
	assert.Equal(t, 500.0, params.C)
	assert.Equal(t, 1_050.0, params.Len)
}
