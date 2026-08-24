package openrouter

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newVideoTestContext(body string) (*gin.Context, *relaycommon.RelayInfo) {
	request := httptest.NewRequest(http.MethodPost, "/v1/videos", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = request
	return context, &relaycommon.RelayInfo{
		ChannelMeta:   &relaycommon.ChannelMeta{},
		TaskRelayInfo: &relaycommon.TaskRelayInfo{},
	}
}

func TestParseTaskResult(t *testing.T) {
	tests := []struct {
		name      string
		body      string
		status    model.TaskStatus
		reason    string
		cost      float64
		costKnown bool
		isByok    bool
		remoteURL string
	}{
		{
			name:   "pending",
			body:   `{"id":"job-1","status":"pending"}`,
			status: model.TaskStatusQueued,
		},
		{
			name:      "completed with cost",
			body:      `{"id":"job-1","status":"completed","unsigned_urls":["https://example.com/video.mp4"],"usage":{"cost":0.25,"is_byok":true}}`,
			status:    model.TaskStatusSuccess,
			cost:      0.25,
			costKnown: true,
			isByok:    true,
			remoteURL: "https://example.com/video.mp4",
		},
		{
			name:      "failed with string error and cost",
			body:      `{"id":"job-1","status":"failed","error":"content policy violation","usage":{"cost":0.03,"is_byok":true}}`,
			status:    model.TaskStatusFailure,
			reason:    "content policy violation",
			cost:      0.03,
			costKnown: true,
			isByok:    true,
		},
		{
			name:   "failed with object error",
			body:   `{"id":"job-1","status":"failed","error":{"message":"provider unavailable"}}`,
			status: model.TaskStatusFailure,
			reason: "provider unavailable",
		},
	}

	adaptor := &TaskAdaptor{}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			result, err := adaptor.ParseTaskResult([]byte(test.body))
			require.NoError(t, err)
			assert.Equal(t, string(test.status), result.Status)
			assert.Equal(t, test.reason, result.Reason)
			assert.Equal(t, test.cost, result.Cost)
			assert.Equal(t, test.costKnown, result.CostKnown)
			assert.Equal(t, test.isByok, result.IsByok)
			assert.Equal(t, test.remoteURL, result.RemoteUrl)
		})
	}
}

func TestConvertToOpenAIVideoUsesPublicURLs(t *testing.T) {
	adaptor := &TaskAdaptor{}
	task := &model.Task{
		TaskID: "task_public",
		Status: model.TaskStatusSuccess,
		Data:   []byte(`{"id":"upstream-job","status":"completed","polling_url":"https://openrouter.ai/api/v1/videos/upstream-job","unsigned_urls":["https://upstream.example/video.mp4"],"usage":{"cost":0.25}}`),
	}

	body, err := adaptor.ConvertToOpenAIVideo(task)
	require.NoError(t, err)

	var response videoResponse
	require.NoError(t, common.Unmarshal(body, &response))
	assert.Equal(t, "task_public", response.ID)
	assert.Equal(t, "completed", response.Status)
	assert.Equal(t, "/v1/videos/task_public", response.PollingURL)
	require.Len(t, response.UnsignedURLs, 1)
	assert.Contains(t, response.UnsignedURLs[0], "/v1/videos/task_public/content")
	assert.NotContains(t, string(body), "upstream-job")
	assert.NotContains(t, string(body), "upstream.example")
	assert.NotContains(t, string(body), "usage")
	assert.NotContains(t, string(body), "is_byok")
}

func TestDoResponseDefersPublicReplyAndSanitizesStoredData(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	info := &relaycommon.RelayInfo{
		TaskRelayInfo: &relaycommon.TaskRelayInfo{PublicTaskID: "task_public"},
	}
	response := &http.Response{
		StatusCode: http.StatusAccepted,
		Body: io.NopCloser(strings.NewReader(
			`{"id":"upstream-job","polling_url":"https://openrouter.ai/api/v1/videos/upstream-job","status":"pending","unsigned_urls":["https://example.com/video.mp4"],"usage":{"cost":0.25,"is_byok":true}}`,
		)),
	}

	upstreamID, storedBody, taskErr := (&TaskAdaptor{}).DoResponse(context, response, info)
	require.Nil(t, taskErr)
	assert.Equal(t, "upstream-job", upstreamID)
	assert.Empty(t, recorder.Body.String())

	deferred, exists := context.Get("deferred_task_response")
	require.True(t, exists)
	public, ok := deferred.(videoResponse)
	require.True(t, ok)
	assert.Equal(t, "task_public", public.ID)
	assert.Nil(t, public.Usage)

	assert.NotContains(t, string(storedBody), "upstream-job")
	assert.NotContains(t, string(storedBody), "polling_url")
	assert.NotContains(t, string(storedBody), "unsigned_urls")
	assert.NotContains(t, string(storedBody), "usage")
}

func TestSeedanceResolutionRatio(t *testing.T) {
	tests := []struct {
		name string
		req  relaycommon.TaskSubmitReq
		want float64
	}{
		{name: "default 720p landscape", req: relaycommon.TaskSubmitReq{}, want: 1},
		{name: "1080p landscape", req: relaycommon.TaskSubmitReq{Resolution: "1080p", AspectRatio: "16:9"}, want: 2.25},
		{name: "4K square", req: relaycommon.TaskSubmitReq{Resolution: "4K", AspectRatio: "1:1"}, want: 5.0625},
		{name: "exact portrait size", req: relaycommon.TaskSubmitReq{Size: "1080x1920"}, want: 2.25},
		{name: "invalid huge size falls back safely", req: relaycommon.TaskSubmitReq{Size: "999999999999x999999999999"}, want: 1},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			assert.InDelta(t, test.want, seedanceResolutionRatio(test.req), 0.000001)
		})
	}
}

func TestValidateSeedanceRequestCapabilities(t *testing.T) {
	gin.SetMode(gin.TestMode)
	tests := []struct {
		name     string
		body     string
		wantCode string
	}{
		{
			name: "supported request",
			body: `{"model":"bytedance/seedance-2.0","prompt":"ocean","duration":8,"resolution":"1080p"}`,
		},
		{
			name:     "duration below model minimum",
			body:     `{"model":"bytedance/seedance-2.0","prompt":"ocean","duration":3}`,
			wantCode: "invalid_seconds",
		},
		{
			name:     "fast model rejects 1080p",
			body:     `{"model":"bytedance/seedance-2.0-fast","prompt":"ocean","duration":8,"resolution":"1080p"}`,
			wantCode: "invalid_resolution",
		},
		{
			name:     "oversized dimensions cannot become a billing multiplier",
			body:     `{"model":"bytedance/seedance-2.0","prompt":"ocean","duration":8,"size":"999999x999999"}`,
			wantCode: "invalid_size",
		},
		{
			name:     "unsupported exact size is rejected locally",
			body:     `{"model":"bytedance/seedance-2.0","prompt":"ocean","duration":8,"size":"1000x1000"}`,
			wantCode: "invalid_size",
		},
		{
			name:     "unsupported aspect ratio is rejected locally",
			body:     `{"model":"bytedance/seedance-2.0","prompt":"ocean","duration":8,"aspect_ratio":"2:1"}`,
			wantCode: "invalid_aspect_ratio",
		},
		{
			name:     "size conflicts with resolution",
			body:     `{"model":"bytedance/seedance-2.0","prompt":"ocean","duration":8,"size":"1280x720","resolution":"720p"}`,
			wantCode: "conflicting_video_dimensions",
		},
		{
			name:     "non Seedance OpenRouter video model is rejected",
			body:     `{"model":"google/veo-3.1","prompt":"ocean","duration":8,"resolution":"720p"}`,
			wantCode: "unsupported_model",
		},
	}

	adaptor := &TaskAdaptor{}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			context, info := newVideoTestContext(test.body)
			var request relaycommon.TaskSubmitReq
			require.NoError(t, common.Unmarshal([]byte(test.body), &request))
			info.UpstreamModelName = request.Model
			taskErr := adaptor.ValidateRequestAndSetAction(context, info)
			if test.wantCode == "" {
				require.Nil(t, taskErr)
				return
			}
			require.NotNil(t, taskErr)
			assert.Equal(t, test.wantCode, taskErr.Code)
		})
	}
}

func TestBuildRequestBodyPinsBillableDefaults(t *testing.T) {
	context, info := newVideoTestContext(`{"model":"public-video-alias","prompt":"ocean"}`)
	info.UpstreamModelName = "bytedance/seedance-2.0-fast"
	adaptor := &TaskAdaptor{}

	body, err := adaptor.BuildRequestBody(context, info)
	require.NoError(t, err)
	encoded, err := io.ReadAll(body)
	require.NoError(t, err)

	var payload map[string]any
	require.NoError(t, common.Unmarshal(encoded, &payload))
	assert.Equal(t, info.UpstreamModelName, payload["model"])
	assert.Equal(t, float64(15), payload["duration"])
	assert.Equal(t, "720p", payload["resolution"])
	assert.Equal(t, "16:9", payload["aspect_ratio"])
}

func TestMappedSeedanceAliasUsesUpstreamCapabilitiesAndDefaultDuration(t *testing.T) {
	context, info := newVideoTestContext(`{"model":"public-video-alias","prompt":"ocean","resolution":"1080p"}`)
	info.OriginModelName = "public-video-alias"
	info.UpstreamModelName = "bytedance/seedance-2.0-fast"
	adaptor := &TaskAdaptor{}

	taskErr := adaptor.ValidateRequestAndSetAction(context, info)
	require.NotNil(t, taskErr)
	assert.Equal(t, "invalid_resolution", taskErr.Code)

	context, info = newVideoTestContext(`{"model":"public-video-alias","prompt":"ocean","resolution":"720p"}`)
	info.OriginModelName = "public-video-alias"
	info.UpstreamModelName = "bytedance/seedance-2.0-fast"
	require.Nil(t, adaptor.ValidateRequestAndSetAction(context, info))
	ratio := adaptor.EstimateBilling(context, info)
	assert.Equal(t, float64(15), ratio["seconds"])
}

func TestEstimateBillingReturnsVideoUsageForPriceExpression(t *testing.T) {
	context, info := newVideoTestContext(`{"model":"bytedance/seedance-2.0","prompt":"ocean","duration":8,"resolution":"1080p"}`)
	info.OriginModelName = "bytedance/seedance-2.0"
	info.UpstreamModelName = "bytedance/seedance-2.0"
	adaptor := &TaskAdaptor{}
	require.Nil(t, adaptor.ValidateRequestAndSetAction(context, info))

	ratios := adaptor.EstimateBilling(context, info)
	assert.Equal(t, float64(8), ratios["seconds"])
	assert.Equal(t, 2.25, ratios["resolution"])
}
