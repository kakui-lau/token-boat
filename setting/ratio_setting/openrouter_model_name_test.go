package ratio_setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestOpenRouterOpenAIModelUsesGPTCompletionRatio(t *testing.T) {
	ratio, locked := getHardcodedCompletionModelRatio("openai/gpt-5.5")

	assert.Equal(t, 6.0, ratio)
	assert.False(t, locked)
}

func TestOfficialAnitixTokenPricing(t *testing.T) {
	tests := []struct {
		model           string
		inputRatio      float64
		cacheRatio      float64
		completionRatio float64
	}{
		{"openai/gpt-5.4", 1.25, 0.1, 6},
		{"openai/gpt-5.4-mini", 0.375, 0.1, 6},
		{"openai/gpt-5.4-nano", 0.1, 0.1, 6.25},
		{"openai/gpt-5.5", 2.5, 0.1, 6},
		{"openai/gpt-5.6-sol", 2.5, 0.1, 6},
		{"openai/gpt-5.6-terra", 1.25, 0.1, 6},
		{"openai/gpt-5.6-luna", 0.5, 0.1, 6},
		{"z-ai/glm-5.1", 0.7, 0.185714285714, 3.142857142857},
		{"z-ai/glm-5.2", 0.7, 0.185714285714, 3.142857142857},
	}

	for _, tt := range tests {
		t.Run(tt.model, func(t *testing.T) {
			assert.Equal(t, tt.inputRatio, defaultModelRatio[tt.model])
			assert.Equal(t, tt.cacheRatio, defaultCacheRatio[tt.model])
			assert.Equal(t, tt.completionRatio, defaultCompletionRatio[tt.model])
		})
	}
}
