package common

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func openRouterVideoTestContext(body string) (*gin.Context, *RelayInfo) {
	request := httptest.NewRequest(http.MethodPost, "/v1/videos", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = request
	return context, &RelayInfo{TaskRelayInfo: &TaskRelayInfo{}}
}

func TestParseOpenRouterVideoRequestPreservesReferenceSemantics(t *testing.T) {
	context, info := openRouterVideoTestContext(`{
		"model":"bytedance/seedance-2.0",
		"duration":8,
		"generate_audio":false,
		"frame_images":[
			{"type":"image_url","image_url":{"url":"https://example.com/first.png"},"frame_type":"first_frame"},
			{"type":"image_url","image_url":{"url":"https://example.com/last.png"},"frame_type":"last_frame"}
		],
		"input_references":[
			{"type":"video_url","video_url":{"url":"https://example.com/reference.mp4"}}
		],
		"callback_url":"https://example.com/callback"
	}`)

	taskErr := ValidateBasicTaskRequest(context, info, constant.TaskActionTextGenerate)
	require.Nil(t, taskErr)
	request, err := GetTaskRequest(context)
	require.NoError(t, err)
	assert.Equal(t, []string{"https://example.com/first.png", "https://example.com/last.png"}, request.Images)
	assert.Empty(t, request.InputReferences)
	assert.Equal(t, constant.TaskActionFirstTailGenerate, info.Action)
	assert.Equal(t, "https://example.com/callback", info.CallbackURL)
	require.NotNil(t, request.GenerateAudio)
	assert.False(t, *request.GenerateAudio)
}

func TestParseOpenRouterVideoRequestRejectsMismatchedReferenceUnion(t *testing.T) {
	context, info := openRouterVideoTestContext(`{
		"model":"example/video",
		"input_references":[{
			"type":"image_url",
			"image_url":{"url":"https://example.com/image.png"},
			"video_url":{"url":"https://example.com/video.mp4"}
		}]
	}`)

	taskErr := ValidateBasicTaskRequest(context, info, constant.TaskActionTextGenerate)
	require.NotNil(t, taskErr)
	assert.Equal(t, "invalid_input_reference", taskErr.Code)
}

func TestParseOpenRouterVideoRequestRejectsInvalidDimensions(t *testing.T) {
	tests := []struct {
		name string
		body string
		code string
	}{
		{name: "size", body: `{"model":"example/video","size":"1280*720"}`, code: "invalid_size"},
		{name: "resolution", body: `{"model":"example/video","resolution":"1440p"}`, code: "invalid_resolution"},
		{name: "aspect ratio", body: `{"model":"example/video","aspect_ratio":"5:4"}`, code: "invalid_aspect_ratio"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			context, info := openRouterVideoTestContext(test.body)
			taskErr := ValidateBasicTaskRequest(context, info, constant.TaskActionTextGenerate)
			require.NotNil(t, taskErr)
			assert.Equal(t, test.code, taskErr.Code)
		})
	}
}

func TestParseOpenRouterVideoRequestRejectsDuplicateFrameType(t *testing.T) {
	context, info := openRouterVideoTestContext(`{
		"model":"example/video",
		"frame_images":[
			{"type":"image_url","image_url":{"url":"https://example.com/a.png"},"frame_type":"first_frame"},
			{"type":"image_url","image_url":{"url":"https://example.com/b.png"},"frame_type":"first_frame"}
		]
	}`)

	taskErr := ValidateBasicTaskRequest(context, info, constant.TaskActionTextGenerate)
	require.NotNil(t, taskErr)
	assert.Equal(t, "duplicate_frame_type", taskErr.Code)
}

func TestParseOpenRouterVideoRequestRejectsNonHTTPSCallback(t *testing.T) {
	context, info := openRouterVideoTestContext(`{
		"model":"example/video",
		"callback_url":"http://127.0.0.1/callback"
	}`)

	taskErr := ValidateBasicTaskRequest(context, info, constant.TaskActionTextGenerate)
	require.NotNil(t, taskErr)
	assert.Equal(t, "invalid_callback_url", taskErr.Code)
}

func TestSeedance25IgnoresUnsupportedGeneratedAudio(t *testing.T) {
	context, info := openRouterVideoTestContext(`{
		"model":"bytedance/seedance-2.5-upscale",
		"prompt":"test",
		"generate_audio":true
	}`)
	info.ChannelMeta = &ChannelMeta{
		ChannelType:       constant.ChannelTypeDoubaoVideo,
		UpstreamModelName: "wb-bytedance-t/doubao-seedance-2-5",
	}

	require.Nil(t, ValidateBasicTaskRequest(context, info, constant.TaskActionTextGenerate))
	require.Nil(t, ValidateOpenRouterVideoChannelSupport(context, info))

	request, ok := GetOpenRouterVideoRequest(context)
	require.True(t, ok)
	assert.Nil(t, request.GenerateAudio)
	legacyRequest, err := GetTaskRequest(context)
	require.NoError(t, err)
	assert.Nil(t, legacyRequest.GenerateAudio)
}

func TestSeedance25SupportsMixedReferences(t *testing.T) {
	context, info := openRouterVideoTestContext(`{
		"model":"bytedance/seedance-2.5-upscale",
		"prompt":"test",
		"input_references":[{
			"type":"video_url",
			"video_url":{"url":"https://example.com/reference.mp4"}
		}]
	}`)
	info.ChannelMeta = &ChannelMeta{
		ChannelType:       constant.ChannelTypeDoubaoVideo,
		UpstreamModelName: "wb-bytedance-t/doubao-seedance-2-5",
	}

	require.Nil(t, ValidateBasicTaskRequest(context, info, constant.TaskActionTextGenerate))
	require.Nil(t, ValidateOpenRouterVideoChannelSupport(context, info))
}
