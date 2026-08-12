package openai

import (
	"testing"

	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
)

func TestNormalizeOpenAIImageUsageMapsOutputToImageTokens(t *testing.T) {
	usage := dto.Usage{
		InputTokens:  19,
		OutputTokens: 2048,
		InputTokensDetails: &dto.InputTokenDetails{
			ImageTokens: 7,
			TextTokens:  12,
		},
	}

	normalizeOpenAIUsage(&usage)

	assert.Equal(t, 19, usage.PromptTokens)
	assert.Equal(t, 2048, usage.CompletionTokens)
	assert.Equal(t, 7, usage.PromptTokensDetails.ImageTokens)
	assert.Equal(t, 2048, usage.CompletionTokenDetails.ImageTokens)
	assert.Equal(t, 2067, usage.TotalTokens)
}
