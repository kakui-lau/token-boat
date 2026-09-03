package controller

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildCompletedMediaTaskForImageAPI(t *testing.T) {
	count := uint(2)
	info := &relaycommon.RelayInfo{
		RequestId:          "request-image-1",
		UserId:             7,
		UsingGroup:         "default",
		ChannelMeta:        &relaycommon.ChannelMeta{ChannelId: 18, UpstreamModelName: "gpt-image-2"},
		OriginModelName:    "openai/gpt-image-2",
		RelayMode:          relayconstant.RelayModeImagesGenerations,
		StartTime:          time.Unix(100, 0),
		FinalConsumedQuota: 123,
	}
	request := &dto.ImageRequest{
		Prompt:         "draw a rabbit",
		N:              &count,
		Size:           "1024x1024",
		Quality:        "high",
		ResponseFormat: "url",
	}

	task, artifacts, ok := buildCompletedMediaTask(info, request, []byte(`{
		"created": 1,
		"data": [
			{"url": "https://cdn.example/one.png"},
			{"url": "https://cdn.example/two.png"}
		]
	}`))

	require.True(t, ok)
	require.NotNil(t, task)
	assert.Empty(t, artifacts)
	assert.Equal(t, "request-image-1", task.TaskID)
	assert.Equal(t, "image", string(task.Platform))
	assert.Equal(t, "image_generation", task.Action)
	assert.Equal(t, model.TaskStatus(model.TaskStatusSuccess), task.Status)
	assert.Equal(t, 123, task.Quota)
	assert.Equal(t, "draw a rabbit", task.Properties.Input)
	assert.Equal(t, "openai/gpt-image-2", task.Properties.OriginModelName)
	assert.Equal(t, "https://cdn.example/one.png", task.PrivateData.ResultURL)
	assert.Equal(t, []string{
		"https://cdn.example/one.png",
		"https://cdn.example/two.png",
	}, task.PrivateData.ResultURLs)

	var metadata map[string]any
	require.NoError(t, task.GetData(&metadata))
	assert.Equal(t, float64(2), metadata["n"])
	assert.Equal(t, "1024x1024", metadata["size"])
	assert.Equal(t, "high", metadata["quality"])
}

func TestBuildCompletedMediaTaskForPlaygroundChatImage(t *testing.T) {
	info := &relaycommon.RelayInfo{
		RequestId:          "request-chat-image",
		UserId:             7,
		UsingGroup:         "default",
		ChannelMeta:        &relaycommon.ChannelMeta{ChannelId: 18, UpstreamModelName: "gemini-3-flash-preview"},
		OriginModelName:    "google/gemini-3-flash-preview",
		RelayMode:          relayconstant.RelayModeChatCompletions,
		IsPlayground:       true,
		StartTime:          time.Unix(100, 0),
		FinalConsumedQuota: 34,
	}
	request := &dto.GeneralOpenAIRequest{
		Messages: []dto.Message{{Role: "user", Content: "draw a rabbit"}},
	}
	response := []byte(`{
		"choices": [{
			"message": {
				"content": [{"type":"image_url","image_url":{"url":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="}}]
			}
		}]
	}`)

	task, artifacts, ok := buildCompletedMediaTask(info, request, response)

	require.True(t, ok)
	require.NotNil(t, task)
	assert.Equal(t, "request-chat-image", task.TaskID)
	assert.Equal(t, "draw a rabbit", task.Properties.Input)
	require.Len(t, artifacts, 1)
	assert.Equal(t, "image/png", artifacts[0].ContentType)
	assert.NotEmpty(t, artifacts[0].Content)
	assert.Equal(t, "/api/task/self/request-chat-image/artifacts/0", task.PrivateData.ResultURL)
	assert.Equal(t, []string{"/api/task/self/request-chat-image/artifacts/0"}, task.PrivateData.ResultURLs)
}

func TestBuildCompletedMediaTaskSkipsOrdinaryPlaygroundChat(t *testing.T) {
	info := &relaycommon.RelayInfo{
		RequestId:    "request-chat-text",
		RelayMode:    relayconstant.RelayModeChatCompletions,
		IsPlayground: true,
		StartTime:    time.Unix(100, 0),
	}
	request := &dto.GeneralOpenAIRequest{
		Messages: []dto.Message{{Role: "user", Content: "hello"}},
	}

	task, artifacts, ok := buildCompletedMediaTask(
		info,
		request,
		[]byte(`{"choices":[{"message":{"content":"hello"}}]}`),
	)

	assert.False(t, ok)
	assert.Nil(t, task)
	assert.Nil(t, artifacts)
}

func TestInspectGeneratedImageResponseRejectsUnsafeResultURL(t *testing.T) {
	hasImage, resultURLs, count := inspectGeneratedImageResponse(
		[]byte(`{"data":[{"url":"javascript:alert(1)"},{"b64_json":"AAAA"}]}`),
		true,
	)

	assert.True(t, hasImage)
	assert.Empty(t, resultURLs)
	assert.GreaterOrEqual(t, count, 1)
}

func TestExtractGeneratedImageArtifactsRejectsNonImageBase64(t *testing.T) {
	artifacts := extractGeneratedImageArtifacts(
		[]byte(`{"data":[{"b64_json":"SGVsbG8="}]}`),
		100,
	)

	assert.Empty(t, artifacts)
}

func TestExtractGeneratedImageArtifactsReadsServerSentEvent(t *testing.T) {
	artifacts := extractGeneratedImageArtifacts(
		[]byte("data: {\"image_url\":{\"url\":\"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=\"}}\n\ndata: [DONE]\n"),
		100,
	)

	require.Len(t, artifacts, 1)
	assert.Equal(t, "image/png", artifacts[0].ContentType)
}
