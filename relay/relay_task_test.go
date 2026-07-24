package relay

import (
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
)

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
