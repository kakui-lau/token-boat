package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestAdminListChannelModelProbesUsesFiltersAndDefaultPageSize(t *testing.T) {
	gin.SetMode(gin.TestMode)
	originalDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	require.NoError(t, model.DB.AutoMigrate(&model.ChannelModelProbe{}))
	t.Cleanup(func() { model.DB = originalDB })

	now := time.Now().Unix()
	require.NoError(t, model.DB.Create(&[]model.ChannelModelProbe{
		{ChannelId: 5, ChannelName: "primary", ModelName: "openai/gpt-test", Success: false, LatencyMs: 250, ProbedAt: now - 30},
		{ChannelId: 6, ChannelName: "backup", ModelName: "anthropic/claude-test", Success: true, LatencyMs: 100, ProbedAt: now - 20},
	}).Error)

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/channel/model-probes?status=failed&keyword=gpt&p=1", nil)

	AdminListChannelModelProbes(context)

	assert.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Items    []model.ChannelModelProbe      `json:"items"`
			PageSize int                            `json:"page_size"`
			Summary  model.ChannelModelProbeSummary `json:"summary"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	assert.Equal(t, 200, response.Data.PageSize)
	require.Len(t, response.Data.Items, 1)
	assert.Equal(t, 5, response.Data.Items[0].ChannelId)
	assert.Equal(t, int64(1), response.Data.Summary.FailedCount)
}
