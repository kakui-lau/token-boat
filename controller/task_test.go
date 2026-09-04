package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestTaskToDtoOnlyExposesAdminDetailsToAdministrators(t *testing.T) {
	task := &model.Task{
		Quota:                 500000,
		SettlementStatus:      model.TaskSettlementStatusCompleted,
		SettlementTargetQuota: 500000,
		BillingAuditStatus:    model.TaskSettlementStatusPending,
		BillingAuditError:     "audit pending",
		PrivateData: model.TaskPrivateData{
			AdminUpstreamRequest: &model.TaskUpstreamRequest{
				Method:  "POST",
				URL:     "https://provider.example/v1/tasks",
				Body:    `{"model":"example"}`,
				Failure: "500 Internal Server Error",
			},
		},
	}

	userDTO := taskToDto(task, false)
	assert.Nil(t, userDTO.AdminUpstreamRequest)
	assert.Nil(t, userDTO.AdminBilling)

	adminDTO := taskToDto(task, true)
	require.NotNil(t, adminDTO.AdminUpstreamRequest)
	assert.Equal(t, task.PrivateData.AdminUpstreamRequest, adminDTO.AdminUpstreamRequest)
	require.NotNil(t, adminDTO.AdminBilling)
	assert.Equal(t, task.Quota, adminDTO.AdminBilling.Quota)
	assert.Equal(t, task.SettlementStatus, adminDTO.AdminBilling.SettlementStatus)
	assert.Equal(t, task.BillingAuditError, adminDTO.AdminBilling.BillingAuditError)
}

func TestTaskToDtoRecoversLegacyPromptAndSettledCharge(t *testing.T) {
	task := &model.Task{
		Quota:                 0,
		SettlementStatus:      model.TaskSettlementStatusCompleted,
		SettlementTargetQuota: 24_786,
		Properties: model.Properties{
			OriginModelName: "byteplus/seedance-2.0-fast-hc",
		},
		PrivateData: model.TaskPrivateData{
			AdminUpstreamRequest: &model.TaskUpstreamRequest{
				Body: `{"model_name":"dreamina-seedance-2-0-fast-hc","prompt":"A paper boat crossing a moonlit lake"}`,
			},
		},
	}

	result := taskToDto(task, false)

	properties, ok := result.Properties.(model.Properties)
	require.True(t, ok)
	assert.Equal(t, "A paper boat crossing a moonlit lake", properties.Input)
	assert.Equal(t, 24_786, result.Quota)
	assert.Nil(t, result.AdminUpstreamRequest)
}

func TestTaskToDtoDoesNotRestoreARefundedCharge(t *testing.T) {
	task := &model.Task{
		Quota:                 0,
		RefundStatus:          model.TaskRefundStatusCompleted,
		RefundQuota:           24_786,
		SettlementStatus:      model.TaskSettlementStatusCompleted,
		SettlementTargetQuota: 24_786,
	}

	result := taskToDto(task, false)

	assert.Zero(t, result.Quota)
}

func TestGetUserTaskArtifactReturnsOnlyOwnedImage(t *testing.T) {
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	t.Cleanup(func() { model.DB = previousDB })
	require.NoError(t, db.AutoMigrate(&model.Task{}, &model.TaskArtifact{}))

	task := &model.Task{TaskID: "task-image-result", UserId: 7, Platform: "image"}
	require.NoError(t, task.InsertWithArtifacts([]model.TaskArtifact{{
		Position:    0,
		ContentType: "image/png",
		Content:     []byte("image-content"),
	}}))

	request := httptest.NewRequest(http.MethodGet, "/api/task/self/task-image-result/artifacts/0", nil)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = request
	context.Set("id", 7)
	context.Params = gin.Params{
		{Key: "task_id", Value: "task-image-result"},
		{Key: "position", Value: "0"},
	}
	GetUserTaskArtifact(context)

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, "image/png", recorder.Header().Get("Content-Type"))
	assert.Equal(t, "nosniff", recorder.Header().Get("X-Content-Type-Options"))
	assert.Equal(t, "image-content", recorder.Body.String())

	forbiddenRecorder := httptest.NewRecorder()
	forbiddenContext, _ := gin.CreateTestContext(forbiddenRecorder)
	forbiddenContext.Request = request
	forbiddenContext.Set("id", 8)
	forbiddenContext.Params = context.Params
	GetUserTaskArtifact(forbiddenContext)
	assert.Equal(t, http.StatusNotFound, forbiddenRecorder.Code)
}
