package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
)

func TestEstimatedPricingUsageNormalizesBusinessDimensions(t *testing.T) {
	tooManyImages := uint(dto.MaxImageN + 1)
	imageUsage := estimatedPricingUsage(&dto.ImageRequest{N: &tooManyImages})
	assert.Equal(t, float64(dto.MaxImageN), imageUsage.ImageCount)
	assert.Equal(t, float64(1), imageUsage.RequestCount)

	audioUsage := estimatedPricingUsage(&dto.AudioRequest{Input: "你a"})
	assert.Equal(t, float64(2), audioUsage.CharacterCount)
	assert.Equal(t, float64(1), audioUsage.RequestCount)
}
