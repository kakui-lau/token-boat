package doubao

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	taskdto "github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newDoubaoVideoTestContext(body string) (*gin.Context, *relaycommon.RelayInfo) {
	request := httptest.NewRequest(http.MethodPost, "/v1/video/generations", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = request
	return context, &relaycommon.RelayInfo{
		ChannelMeta:   &relaycommon.ChannelMeta{},
		TaskRelayInfo: &relaycommon.TaskRelayInfo{},
	}
}

func TestEstimateMaxBillingTokensIsConservativeForVideoInput(t *testing.T) {
	textTokens, err := estimateMaxBillingTokens(relaycommon.TaskSubmitReq{
		Duration: 10,
		Metadata: map[string]interface{}{"resolution": "1080p"},
	})
	require.NoError(t, err)

	videoTokens, err := estimateMaxBillingTokens(relaycommon.TaskSubmitReq{
		Duration: 10,
		Metadata: map[string]interface{}{
			"resolution": "1080p",
			"content": []interface{}{
				map[string]interface{}{"type": "video_url"},
			},
		},
	})
	require.NoError(t, err)
	assert.Equal(t, 1_215_000, textTokens)
	assert.Equal(t, 3_037_500, videoTokens)
}

func TestHasVideoInMetadataSupportsTypedContentSlices(t *testing.T) {
	assert.True(t, hasVideoInMetadata(map[string]interface{}{
		"content": []map[string]interface{}{
			{"type": "video_url", "video_url": map[string]interface{}{"url": "https://example.com/in.mp4"}},
		},
	}))
	assert.False(t, hasVideoInMetadata(map[string]interface{}{
		"content": []map[string]interface{}{
			{"type": "text", "text": "the literal word video_url must not be treated as video input"},
		},
	}))
}

func TestEstimateMaxBillingTokensValidatesBoundsAndSupports480p(t *testing.T) {
	tokens, err := estimateMaxBillingTokens(relaycommon.TaskSubmitReq{
		Duration:   15,
		Resolution: "480p",
	})
	require.NoError(t, err)
	assert.Equal(t, 360_282, tokens)

	_, err = estimateMaxBillingTokens(relaycommon.TaskSubmitReq{Duration: 16})
	require.ErrorContains(t, err, "between 1 and 15")

	_, err = estimateMaxBillingTokens(relaycommon.TaskSubmitReq{
		Duration:   10,
		Resolution: "8k",
	})
	require.ErrorContains(t, err, "unsupported resolution")
}

func TestEstimateMaxBillingTokensAllowsSeedance25DurationUpTo30Seconds(t *testing.T) {
	_, err := estimateMaxBillingTokens(relaycommon.TaskSubmitReq{
		Model:      "bytedance/seedance-2.5-upscale",
		Duration:   30,
		Resolution: "720p",
	})
	require.NoError(t, err)

	_, err = estimateMaxBillingTokens(relaycommon.TaskSubmitReq{
		Model:    "bytedance/seedance-2.5-upscale",
		Duration: 31,
	})
	require.ErrorContains(t, err, "between 1 and 30")
}

func TestValidateSeedance25RejectsMoreThan50MixedMediaInputs(t *testing.T) {
	gin.SetMode(gin.TestMode)
	content := make([]map[string]interface{}, 51)
	for index := range content {
		content[index] = map[string]interface{}{
			"type":      "image_url",
			"image_url": map[string]interface{}{"url": "https://example.com/reference.png"},
		}
	}
	body, err := common.Marshal(map[string]interface{}{
		"model":  "bytedance/seedance-2.5-upscale",
		"prompt": "test",
		"metadata": map[string]interface{}{
			"content": content,
		},
	})
	require.NoError(t, err)

	context, info := newDoubaoVideoTestContext(string(body))
	taskErr := (&TaskAdaptor{}).ValidateRequestAndSetAction(context, info)

	require.NotNil(t, taskErr)
	assert.Equal(t, http.StatusBadRequest, taskErr.StatusCode)
	assert.Equal(t, "invalid_media_count", taskErr.Code)
}

func TestConvertToRequestPayloadCarriesTopLevelVideoOptions(t *testing.T) {
	adaptor := &TaskAdaptor{}
	payload, err := adaptor.convertToRequestPayload(&relaycommon.TaskSubmitReq{
		Prompt:      "test",
		Model:       "doubao-seedance-2-0-260128",
		Resolution:  "1080p",
		AspectRatio: "9:16",
		Seconds:     "8",
	})
	require.NoError(t, err)
	assert.Equal(t, "1080p", payload.Resolution)
	assert.Equal(t, "9:16", payload.Ratio)
	require.NotNil(t, payload.Duration)
	assert.Equal(t, 8, int(*payload.Duration))
}

func TestConvertToRequestPayloadMarksInputImagesAsReferences(t *testing.T) {
	adaptor := &TaskAdaptor{}
	payload, err := adaptor.convertToRequestPayload(&relaycommon.TaskSubmitReq{
		Model: "doubao-seedance-2-0-260128",
		InputReferences: []taskdto.OpenRouterVideoInputReference{
			{
				Type:     "image_url",
				ImageURL: &taskdto.OpenRouterVideoURL{URL: "https://example.com/reference.png"},
			},
		},
	})
	require.NoError(t, err)
	require.NotEmpty(t, payload.Content)
	assert.Equal(t, "image_url", payload.Content[0].Type)
	assert.Equal(t, "reference_image", payload.Content[0].Role)
	require.NotNil(t, payload.Content[0].ImageURL)
	assert.Equal(t, "https://example.com/reference.png", payload.Content[0].ImageURL.URL)
}

func TestValidateProvidesSafeEstimateForSeedance2(t *testing.T) {
	gin.SetMode(gin.TestMode)
	adaptor := &TaskAdaptor{}
	legacyContext, legacyInfo := newDoubaoVideoTestContext(
		`{"model":"doubao-seedance-1-5-pro-251215","prompt":"test","duration":30,"resolution":"2k"}`,
	)
	require.Nil(t, adaptor.ValidateRequestAndSetAction(legacyContext, legacyInfo))
	assert.False(t, legacyInfo.TaskTieredEstimateReady)

	tieredContext, tieredInfo := newDoubaoVideoTestContext(
		`{"model":"bytedance/seedance-2.0","prompt":"test","duration":8,"resolution":"1080p","metadata":{"content":[{"type":"video_url","video_url":{"url":"https://example.com/in.mp4"}}]}}`,
	)
	require.Nil(t, adaptor.ValidateRequestAndSetAction(tieredContext, tieredInfo))
	assert.True(t, tieredInfo.TaskTieredEstimateReady)
	require.NotNil(t, tieredInfo.BillingRequestInput)
	var normalized relaycommon.TaskSubmitReq
	require.NoError(t, common.Unmarshal(tieredInfo.BillingRequestInput.Body, &normalized))
	assert.Equal(t, "1080p", normalized.Resolution)
	assert.Equal(t, "1080p", normalized.Metadata["resolution"])
	assert.Equal(t, true, normalized.Metadata["billing_has_video"])
	normalizedBody := string(tieredInfo.BillingRequestInput.Body)
	assert.NotContains(t, normalizedBody, "https://example.com/in.mp4")
	assert.NotContains(t, normalizedBody, `"prompt":"test"`)
	assert.Contains(t, normalizedBody, "video_url")

	seedance25Context, seedance25Info := newDoubaoVideoTestContext(
		`{"model":"bytedance/seedance-2.5-upscale","prompt":"test","duration":30,"resolution":"720p"}`,
	)
	require.Nil(t, adaptor.ValidateRequestAndSetAction(seedance25Context, seedance25Info))
	assert.True(t, seedance25Info.TaskTieredEstimateReady)
	assert.Positive(t, seedance25Info.TaskPreConsumeTokens)
	require.NotNil(t, seedance25Info.BillingRequestInput)
}

func TestValidateRejectsSeedance20Mini480pBeforeBilling(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, info := newDoubaoVideoTestContext(
		`{"model":"byteplus/seedance-2.0-mini","prompt":"test","duration":3,"resolution":"480p"}`,
	)
	info.UpstreamModelName = "dreamina-seedance-2-0-mini-260615"

	taskErr := (&TaskAdaptor{}).ValidateRequestAndSetAction(context, info)

	require.NotNil(t, taskErr)
	assert.Equal(t, http.StatusBadRequest, taskErr.StatusCode)
	assert.Equal(t, "invalid_resolution", taskErr.Code)
	assert.Contains(t, taskErr.Message, "minimum resolution is 720p")
	assert.Nil(t, info.Billing)
}

func TestIsSupportedSeedanceModelRecognizesPublicAndUpstreamNames(t *testing.T) {
	tests := []struct {
		name      string
		modelName string
		expected  bool
	}{
		{name: "public model", modelName: "byteplus/seedance-2.0", expected: true},
		{name: "official model", modelName: "dreamina-seedance-2-0-260128", expected: true},
		{name: "official fast model", modelName: "dreamina-seedance-2-0-fast-260128", expected: true},
		{name: "official mini model", modelName: "dreamina-seedance-2-0-mini-260615", expected: true},
		{name: "upstream alias", modelName: "seedance2", expected: true},
		{name: "upstream fast alias", modelName: "seedance2-fast", expected: true},
		{name: "seedance 2.5 public model", modelName: "bytedance/seedance-2.5-upscale", expected: true},
		{name: "seedance 2.5 upstream model", modelName: "wb-bytedance-t/doubao-seedance-2-5", expected: true},
		{name: "older seedance", modelName: "seedance-1.5-pro", expected: false},
		{name: "unrelated model", modelName: "gpt-5.4", expected: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, isSupportedSeedanceModel(tt.modelName))
		})
	}
}
