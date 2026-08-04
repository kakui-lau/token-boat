package dto

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOpenRouterVideoRequestPreservesExplicitZeroValues(t *testing.T) {
	var request OpenRouterVideoGenerationRequest
	require.NoError(t, common.Unmarshal([]byte(`{
		"model":"example/video-model",
		"duration":0,
		"generate_audio":false,
		"seed":0
	}`), &request))

	require.NotNil(t, request.Duration)
	assert.Equal(t, 0, *request.Duration)
	require.NotNil(t, request.GenerateAudio)
	assert.False(t, *request.GenerateAudio)
	require.NotNil(t, request.Seed)
	assert.Equal(t, 0, *request.Seed)

	body, err := common.Marshal(request)
	require.NoError(t, err)
	assert.JSONEq(t, `{
		"model":"example/video-model",
		"duration":0,
		"generate_audio":false,
		"seed":0
	}`, string(body))
}

func TestOpenRouterVideoResponseUsesExactPublicShape(t *testing.T) {
	response := OpenRouterVideoGenerationResponse{
		ID:         "task_public",
		PollingURL: "/v1/videos/task_public",
		Status:     OpenRouterVideoStatusPending,
	}

	body, err := common.Marshal(response)
	require.NoError(t, err)
	assert.JSONEq(t, `{
		"id":"task_public",
		"polling_url":"/v1/videos/task_public",
		"status":"pending"
	}`, string(body))
}

func TestOpenRouterVideoModelKeepsRequiredNullableCapabilities(t *testing.T) {
	model := OpenRouterVideoModel{
		ID:                           "example/video-model",
		CanonicalSlug:                "example/video-model",
		Name:                         "Example Video Model",
		Created:                      1,
		SupportedResolutions:         nil,
		SupportedAspectRatios:        nil,
		SupportedSizes:               nil,
		SupportedDurations:           nil,
		SupportedFrameImages:         nil,
		GenerateAudio:                nil,
		Seed:                         nil,
		AllowedPassthroughParameters: []string{},
	}

	body, err := common.Marshal(model)
	require.NoError(t, err)
	assert.JSONEq(t, `{
		"id":"example/video-model",
		"canonical_slug":"example/video-model",
		"name":"Example Video Model",
		"created":1,
		"supported_resolutions":null,
		"supported_aspect_ratios":null,
		"supported_sizes":null,
		"supported_durations":null,
		"supported_frame_images":null,
		"generate_audio":null,
		"seed":null,
		"allowed_passthrough_parameters":[]
	}`, string(body))
}
