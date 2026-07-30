package pricingengine

import (
	"math"
	"testing"

	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEvaluateV2TokenAndVideoUsage(t *testing.T) {
	expression := `v2:tier("standard", p * 2 / 1000000 + video_s * 0.04)`
	result, err := Evaluate(expression, billingexpr.ExprHashString(expression), Usage{
		PromptTokens: 500_000,
		VideoSeconds: 10,
	})
	require.NoError(t, err)
	assert.Equal(t, "1.4", result.Amount.String())
	assert.Equal(t, "standard", result.MatchedTier)
}

func TestEvaluateV2MultimodalUsageDimensions(t *testing.T) {
	expression := `v2:tier("multi", (p * 2 + cr + img * 4) / 1000000 + images * 0.5 + audio_s * 0.03 + video_s * 0.04)`
	result, err := Evaluate(expression, billingexpr.ExprHashString(expression), Usage{
		PromptTokens:     1_000_000,
		CacheReadTokens:  100_000,
		ImageInputTokens: 50_000,
		ImageCount:       2,
		AudioSeconds:     10,
		VideoSeconds:     10,
	})
	require.NoError(t, err)
	amount, _ := result.Amount.Float64()
	assert.InDelta(t, 3.7, amount, 1e-12)
	assert.Equal(t, "multi", result.MatchedTier)
}

func TestEvaluateRejectsInvalidUsageBeforeExpressionExecution(t *testing.T) {
	_, err := Evaluate(`v2:p`, "", Usage{PromptTokens: math.Inf(1)})
	require.ErrorContains(t, err, "prompt_tokens must be between")
}

func TestEvaluateRejectsNegativeExpressionAmount(t *testing.T) {
	expression := `v2:p - 2`
	_, err := Evaluate(expression, billingexpr.ExprHashString(expression), Usage{
		PromptTokens: 1,
	})
	require.ErrorContains(t, err, "finite non-negative")
}
