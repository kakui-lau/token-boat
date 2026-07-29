package billing_setting

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSmokeTestExprExercisesSeparatelyPricedDimensions(t *testing.T) {
	tests := []string{
		`v1:tier("cache", p * 1 - cr * 2)`,
		`v1:tier("media", p * 1 - img * 2)`,
		`v2:tier("images", images * -1)`,
		`v2:tier("video", video_s * -1)`,
	}

	for _, expression := range tests {
		require.Error(t, SmokeTestExpr(expression), expression)
	}
}
