package pricingruntime

import (
	"testing"

	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/stretchr/testify/require"
)

func TestValidateVideoPricingRequestRequiresResolutionUsedByExpression(t *testing.T) {
	expressions := []string{
		`v2:param("resolution") == "1080p" ? tier("1080p", video_s * 0.4) : tier("default", video_s * 0.2)`,
	}

	require.Error(t, validateVideoPricingRequest(expressions, billingexpr.RequestInput{}))
	require.Error(t, validateVideoPricingRequest(expressions, billingexpr.RequestInput{Body: []byte(`{"duration":5}`)}))
	require.NoError(t, validateVideoPricingRequest(expressions, billingexpr.RequestInput{Body: []byte(`{"resolution":"720p"}`)}))
}

func TestValidateVideoPricingRequestSupportsNormalizedMetadataResolution(t *testing.T) {
	expressions := []string{
		`v2:param("metadata.resolution") == "1080p" ? tier("1080p", video_s * 0.4) : tier("default", video_s * 0.2)`,
	}

	require.NoError(t, validateVideoPricingRequest(expressions, billingexpr.RequestInput{
		Body: []byte(`{"metadata":{"resolution":"1080p"}}`),
	}))
}

func TestValidateVideoPricingRequestDoesNotRequireUnusedResolution(t *testing.T) {
	require.NoError(t, validateVideoPricingRequest(
		[]string{`v2:tier("video", video_s * 0.2)`},
		billingexpr.RequestInput{},
	))
}
