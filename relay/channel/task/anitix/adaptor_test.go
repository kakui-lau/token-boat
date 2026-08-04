package anitix

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

func newOpenRouterVideoContext(body string) (*gin.Context, *relaycommon.RelayInfo) {
	request := httptest.NewRequest(http.MethodPost, "/v1/videos", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = request
	return context, &relaycommon.RelayInfo{
		OriginModelName: "byteplus/seedance-2.0-fast",
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: "seedance2-fast",
		},
		TaskRelayInfo: &relaycommon.TaskRelayInfo{},
	}
}

func TestBuildRequestBodyConvertsOpenRouterFramesToAnitixOptions(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, info := newOpenRouterVideoContext(`{
		"model":"byteplus/seedance-2.0-fast",
		"prompt":"make a cloud",
		"duration":5,
		"resolution":"1080p",
		"aspect_ratio":"16:9",
		"generate_audio":true,
		"seed":7,
		"frame_images":[
			{"type":"image_url","image_url":{"url":"https://cdn.example/first.png"},"frame_type":"first_frame"},
			{"type":"image_url","image_url":{"url":"https://cdn.example/last.png"},"frame_type":"last_frame"}
		]
	}`)
	adaptor := &TaskAdaptor{}
	require.Nil(t, adaptor.ValidateRequestAndSetAction(context, info))

	body, err := adaptor.BuildRequestBody(context, info)
	require.NoError(t, err)
	data, err := io.ReadAll(body)
	require.NoError(t, err)
	var payload submitRequest
	require.NoError(t, common.Unmarshal(data, &payload))

	assert.Equal(t, "seedance2-fast", payload.ModelName)
	assert.Equal(t, "make a cloud", payload.Prompt)
	require.NotNil(t, payload.Options.Duration)
	assert.Equal(t, 5, *payload.Options.Duration)
	assert.Equal(t, "1080p", payload.Options.Quality)
	assert.Equal(t, "16:9", payload.Options.AspectRatio)
	require.NotNil(t, payload.Options.GenerateAudio)
	assert.True(t, *payload.Options.GenerateAudio)
	require.NotNil(t, payload.Options.Seed)
	assert.Equal(t, 7, *payload.Options.Seed)
	assert.Equal(t, "https://cdn.example/first.png", payload.Options.FirstFrameURL)
	assert.Equal(t, "https://cdn.example/last.png", payload.Options.LastFrameURL)
	assert.NotContains(t, string(data), `"content"`)
}

func TestParseTaskResultReturnsAllDirectVideoURLs(t *testing.T) {
	result, err := (&TaskAdaptor{}).ParseTaskResult([]byte(`{
		"task_id":"task_123",
		"status":"completed",
		"progress":100,
		"result":{"videos":["https://cdn.example/a.mp4","https://cdn.example/b.mp4"]}
	}`))
	require.NoError(t, err)
	assert.Equal(t, string(model.TaskStatusSuccess), result.Status)
	assert.Equal(t, "100%", result.Progress)
	assert.Equal(t, "https://cdn.example/a.mp4", result.RemoteUrl)
	assert.Equal(t, []string{"https://cdn.example/a.mp4", "https://cdn.example/b.mp4"}, result.RemoteUrls)
}

func TestDoRequestPreservesRejectedResponseForRelayError(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/api/v1/tasks/video", r.URL.Path)
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"code":"InvalidParameter","message":"bad options"}`))
	}))
	t.Cleanup(upstream.Close)

	context, info := newOpenRouterVideoContext(`{"model":"byteplus/seedance-2.0-fast","prompt":"test"}`)
	info.ChannelId = 12
	info.ChannelBaseUrl = upstream.URL
	info.ApiKey = "secret"
	adaptor := &TaskAdaptor{}
	adaptor.Init(info)
	require.Nil(t, adaptor.ValidateRequestAndSetAction(context, info))
	body, err := adaptor.BuildRequestBody(context, info)
	require.NoError(t, err)

	response, err := adaptor.DoRequest(context, info, body)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, response.StatusCode)
	responseBody, err := io.ReadAll(response.Body)
	require.NoError(t, err)
	assert.JSONEq(t, `{"code":"InvalidParameter","message":"bad options"}`, string(responseBody))
}
