package billingexpr

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestV2UsageVariablesEvaluateNormalizedBusinessUnits(t *testing.T) {
	result, trace, err := RunExpr(
		`v2:tier("media", req * 1 + images * 2 + audio_s * 3 + video_s * 4 + chars * 0.001)`,
		TokenParams{Req: 2, Imgs: 3, AudS: 4, VidS: 5, Chars: 1000},
	)

	require.NoError(t, err)
	assert.Equal(t, 41.0, result)
	assert.Equal(t, "media", trace.MatchedTier)
}
