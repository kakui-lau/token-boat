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
