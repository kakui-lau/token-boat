package openrouter

import (
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
	return context, &relaycommon.RelayInfo{TaskRelayInfo: &relaycommon.TaskRelayInfo{}}
}

func TestParseTaskResult(t *testing.T) {
	tests := []struct {
		name      string
		body      string
		status    model.TaskStatus
		reason    string
		cost      float64
		remoteURL string
	}{
		{
			name:   "pending",
			body:   `{"id":"job-1","status":"pending"}`,
			status: model.TaskStatusQueued,
		},
		{
			name:      "completed with cost",
			body:      `{"id":"job-1","status":"completed","unsigned_urls":["https://example.com/video.mp4"],"usage":{"cost":0.25}}`,
			status:    model.TaskStatusSuccess,
			cost:      0.25,
			remoteURL: "https://example.com/video.mp4",
		},
		{
			name:   "failed with string error",
			body:   `{"id":"job-1","status":"failed","error":"content policy violation"}`,
			status: model.TaskStatusFailure,
			reason: "content policy violation",
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
			assert.Equal(t, test.remoteURL, result.RemoteUrl)
		})
	}
}

func TestAdjustBillingOnCompleteUsesUpstreamCostAndGroupRatio(t *testing.T) {
	adaptor := &TaskAdaptor{}
	task := &model.Task{
		PrivateData: model.TaskPrivateData{
			BillingContext: &model.TaskBillingContext{GroupRatio: 1.5},
		},
	}
	result := &relaycommon.TaskInfo{Cost: 0.25}

	quota := adaptor.AdjustBillingOnComplete(task, result)

	assert.Equal(t, common.QuotaFromFloat(0.25*common.QuotaPerUnit*1.5), quota)
	assert.Nil(t, result.QuotaClamp)
}

func TestAdjustBillingOnCompleteKeepsPrechargeWithoutCost(t *testing.T) {
	adaptor := &TaskAdaptor{}
	result := &relaycommon.TaskInfo{}

	assert.Zero(t, adaptor.AdjustBillingOnComplete(&model.Task{}, result))
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
	}

	adaptor := &TaskAdaptor{}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			context, info := newVideoTestContext(test.body)
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
