package controller

import (
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
)

func TestEstimatedPricingUsageNormalizesBusinessDimensions(t *testing.T) {
	tooManyImages := uint(dto.MaxImageN + 1)
	imageUsage := estimatedPricingUsage(&dto.ImageRequest{N: &tooManyImages}, nil, 0)
	assert.Equal(t, float64(dto.MaxImageN), imageUsage.ImageCount)
	assert.Equal(t, float64(1584*dto.MaxImageN), imageUsage.ImageOutputTokens)
	assert.Equal(t, float64(1), imageUsage.RequestCount)

	gptImageUsage := estimatedPricingUsage(&dto.ImageRequest{Model: "openai/gpt-image-2"}, nil, 0)
	assert.Equal(t, float64(dto.MaxEstimatedImageOutputTokensPerImage), gptImageUsage.ImageOutputTokens)

	audioUsage := estimatedPricingUsage(&dto.AudioRequest{Input: "你a"}, nil, 0)
	assert.Equal(t, float64(2), audioUsage.CharacterCount)
	assert.Equal(t, float64(1), audioUsage.RequestCount)

	transcriptionUsage := estimatedPricingUsage(
		&dto.AudioRequest{},
		&relaycommon.RelayInfo{
			RelayMode: relayconstant.RelayModeAudioTranscription,
		},
		1500,
	)
	assert.Equal(t, float64(90), transcriptionUsage.AudioSeconds)
}
