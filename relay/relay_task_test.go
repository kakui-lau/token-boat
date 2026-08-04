package relay

import (
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildOpenRouterVideoResponseUsesPublicContentIndexes(t *testing.T) {
	costPerUnit := 500000.0
	task := &model.Task{
		TaskID: "task_public",
		Status: model.TaskStatusSuccess,
		Quota:  250000,
		PrivateData: model.TaskPrivateData{
			ResultURLs:     []string{"https://upstream/one.mp4", "https://upstream/two.mp4"},
			BillingContext: &model.TaskBillingContext{QuotaPerUnit: costPerUnit},
		},
	}

	response := buildOpenRouterVideoResponse(task)

	assert.Equal(t, dto.OpenRouterVideoStatusCompleted, response.Status)
	require.Len(t, response.UnsignedURLs, 2)
	assert.Contains(t, response.UnsignedURLs[0], "/v1/videos/task_public/content?index=0")
	assert.Contains(t, response.UnsignedURLs[1], "/v1/videos/task_public/content?index=1")
	require.NotNil(t, response.Usage)
	require.NotNil(t, response.Usage.Cost)
	assert.Equal(t, 0.5, *response.Usage.Cost)
}

func TestTaskModel2DtoRedactsOpenRouterSupplierData(t *testing.T) {
	task := &model.Task{
		Platform: constant.TaskPlatform(strconv.Itoa(constant.ChannelTypeOpenRouter)),
		Data:     []byte(`{"id":"upstream-job","status":"completed","polling_url":"https://openrouter.ai/api/v1/videos/upstream-job","unsigned_urls":["https://example.com/video.mp4"],"usage":{"cost":0.25,"is_byok":true}}`),
	}

	dto := TaskModel2Dto(task)
	body := string(dto.Data)

	assert.Contains(t, body, `"status":"completed"`)
	assert.NotContains(t, body, "upstream-job")
	assert.NotContains(t, body, "polling_url")
	assert.NotContains(t, body, "unsigned_urls")
	assert.NotContains(t, body, "usage")
	assert.NotContains(t, body, "is_byok")
}
