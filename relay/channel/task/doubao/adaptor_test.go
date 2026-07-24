package doubao

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/config"
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

func TestValidateOnlyAppliesStrictEstimatorToTieredSeedance20(t *testing.T) {
	gin.SetMode(gin.TestMode)
	saved := map[string]string{}
	require.NoError(t, config.GlobalConfig.SaveToDB(func(key, value string) error {
		saved[key] = value
		return nil
	}))
	t.Cleanup(func() { require.NoError(t, config.GlobalConfig.LoadFromDB(saved)) })
	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
		"billing_setting.billing_mode": `{"bytedance/seedance-2.0":"tiered_expr"}`,
	}))

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
	assert.Equal(t, "1080p", normalized.Metadata["resolution"])
	assert.Equal(t, true, normalized.Metadata["billing_has_video"])
	normalizedBody := string(tieredInfo.BillingRequestInput.Body)
	assert.NotContains(t, normalizedBody, "https://example.com/in.mp4")
	assert.Contains(t, normalizedBody, "video_url")
}
