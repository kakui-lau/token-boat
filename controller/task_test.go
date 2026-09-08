package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
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

func TestAdminTaskSummaryIsBoundedAndExcludesProviderPayloads(t *testing.T) {
	prompt := strings.Repeat("船", 260)
	task := &model.Task{
		ID:         42,
		TaskID:     "task-public-42",
		Platform:   "byteplus-video",
		UserId:     7,
		Group:      "default",
		ChannelId:  9,
		Quota:      500_000,
		Action:     "generate",
		Status:     model.TaskStatusInProgress,
		FailReason: "https://legacy-result.example/video.mp4?token=secret",
		SubmitTime: 1_700_000_000,
		Progress:   "46%",
		Properties: model.Properties{
			Input:             prompt,
			OriginModelName:   "byteplus/seedance-2.0-fast-hc",
			UpstreamModelName: "provider-secret-model-name",
			GenerationID:      "provider-generation-id",
		},
		PrivateData: model.TaskPrivateData{
			ResultURL: "https://signed.example/result.mp4?token=secret",
			AdminUpstreamRequest: &model.TaskUpstreamRequest{
				Method: "POST",
				URL:    "https://provider.example/tasks?key=secret",
				Body:   `{"credential":"secret"}`,
			},
		},
		Data: []byte(`{"raw_provider_payload":"secret"}`),
	}

	result := adminTaskToDto(task, "alice", 500_000)
	encoded, err := common.Marshal(result)
	require.NoError(t, err)
	response := string(encoded)

	assert.Equal(t, int64(42), result.ID)
	assert.Equal(t, "task-public-42", result.TaskID)
	assert.Equal(t, model.TaskTypeVideo, result.TaskType)
	assert.Equal(t, "byteplus/seedance-2.0-fast-hc", result.Model)
	assert.Equal(t, "alice", result.Username)
	require.NotNil(t, result.CostUSD)
	assert.Equal(t, 1.0, *result.CostUSD)
	assert.Len(t, []rune(result.PromptPreview), 240)
	assert.NotContains(t, response, "result_url")
	assert.NotContains(t, response, "legacy-result.example")
	assert.NotContains(t, response, "properties")
	assert.NotContains(t, response, "raw_provider_payload")
	assert.NotContains(t, response, "admin_upstream_request")
	assert.NotContains(t, response, "credential")
	assert.NotContains(t, response, "provider-generation-id")
	assert.NotContains(t, response, `"quota":`)
	assert.NotContains(t, response, `"refund_quota":`)
	assert.NotContains(t, response, `"settlement_target_quota":`)
}

func TestAdminTaskSummaryIncludesOnlyTerminalFailureText(t *testing.T) {
	failed := adminTaskToDto(&model.Task{
		Status:     model.TaskStatusFailure,
		FailReason: "  provider   timed out  ",
	}, "", 500_000)
	succeeded := adminTaskToDto(&model.Task{
		Status:     model.TaskStatusSuccess,
		FailReason: "https://legacy-result.example/video.mp4?token=secret",
	}, "", 500_000)

	assert.Equal(t, "provider timed out", failed.FailureReason)
	assert.Empty(t, succeeded.FailureReason)
}

func TestGetAllTaskSummaryReturnsOnlyTheSafeProjection(t *testing.T) {
	previousDB := model.DB
	previousRedisEnabled := common.RedisEnabled
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	common.RedisEnabled = false
	t.Cleanup(func() {
		model.DB = previousDB
		common.RedisEnabled = previousRedisEnabled
	})
	require.NoError(t, db.AutoMigrate(&model.Task{}))

	task := &model.Task{
		TaskID:     "task-safe-response",
		Platform:   "byteplus-video",
		UserId:     7,
		ChannelId:  9,
		Quota:      500_000,
		Status:     model.TaskStatusSuccess,
		SubmitTime: 1_700_000_000,
		CreatedAt:  1_700_000_000,
		FailReason: "https://legacy-result.example/video.mp4?token=secret",
		Properties: model.Properties{
			Input:           "A safe prompt preview",
			OriginModelName: "byteplus/seedance-2.0-fast-hc",
			GenerationID:    "provider-generation-id",
		},
		PrivateData: model.TaskPrivateData{
			BillingContext: &model.TaskBillingContext{QuotaPerUnit: 250_000},
			ResultURL:      "https://signed.example/result.mp4?token=secret",
			AdminUpstreamRequest: &model.TaskUpstreamRequest{
				Body: `{"credential":"secret"}`,
			},
		},
		Data: []byte(`{"raw_provider_payload":"secret"}`),
	}
	require.NoError(t, db.Create(task).Error)

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodGet,
		"/api/task/?view=summary&start_timestamp=1699999900&end_timestamp=1700000100",
		nil,
	)
	GetAllTask(context)

	response := recorder.Body.String()
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, response, `"task_id":"task-safe-response"`)
	assert.Contains(t, response, `"prompt_preview":"A safe prompt preview"`)
	assert.Contains(t, response, `"cost_usd":2`)
	assert.NotContains(t, response, "legacy-result.example")
	assert.NotContains(t, response, "signed.example")
	assert.NotContains(t, response, "raw_provider_payload")
	assert.NotContains(t, response, "admin_upstream_request")
	assert.NotContains(t, response, "credential")
	assert.NotContains(t, response, "provider-generation-id")
}

func TestAdminTaskSummaryMarksHistoricalUSDUnavailableWithoutSnapshot(t *testing.T) {
	task := &model.Task{
		Quota:                 500_000,
		RefundQuota:           125_000,
		SettlementTargetQuota: 250_000,
	}

	withoutSnapshot := adminTaskToDto(task, "", 0)
	assert.Nil(t, withoutSnapshot.CostUSD)
	assert.Nil(t, withoutSnapshot.AdminBilling.RefundedUSD)
	assert.Nil(t, withoutSnapshot.AdminBilling.SettlementTargetUSD)
	encoded, err := common.Marshal(withoutSnapshot)
	require.NoError(t, err)
	assert.Contains(t, string(encoded), `"cost_usd":null`)
	assert.Contains(t, string(encoded), `"refunded_usd":null`)

	withSnapshot := adminTaskToDto(task, "", 250_000)
	require.NotNil(t, withSnapshot.CostUSD)
	require.NotNil(t, withSnapshot.AdminBilling.RefundedUSD)
	require.NotNil(t, withSnapshot.AdminBilling.SettlementTargetUSD)
	assert.Equal(t, 2.0, *withSnapshot.CostUSD)
	assert.Equal(t, 0.5, *withSnapshot.AdminBilling.RefundedUSD)
	assert.Equal(t, 1.0, *withSnapshot.AdminBilling.SettlementTargetUSD)
}

func TestGetAllTaskSummaryRejectsInvalidTimeRanges(t *testing.T) {
	gin.SetMode(gin.TestMode)
	testCases := []struct {
		name    string
		query   string
		message string
	}{
		{
			name:    "timestamps are required",
			query:   "?view=summary",
			message: "valid start_timestamp and end_timestamp are required",
		},
		{
			name:    "only start timestamp",
			query:   "?view=summary&start_timestamp=100",
			message: "valid start_timestamp and end_timestamp are required",
		},
		{
			name:    "non-positive timestamp",
			query:   "?view=summary&start_timestamp=0&end_timestamp=100",
			message: "valid start_timestamp and end_timestamp are required",
		},
		{
			name:    "reversed range",
			query:   "?view=summary&start_timestamp=200&end_timestamp=100",
			message: "start_timestamp must not be after end_timestamp",
		},
		{
			name:    "range exceeds limit",
			query:   "?view=summary&start_timestamp=1&end_timestamp=2678402",
			message: "task date range must not exceed 31 days",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)
			context.Request = httptest.NewRequest(http.MethodGet, "/api/task/"+testCase.query, nil)

			GetAllTask(context)

			var response struct {
				Success bool   `json:"success"`
				Message string `json:"message"`
			}
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
			assert.Equal(t, http.StatusBadRequest, recorder.Code)
			assert.False(t, response.Success)
			assert.Equal(t, testCase.message, response.Message)
		})
	}
}

func TestGetAllTaskSummaryPropagatesDatabaseFailure(t *testing.T) {
	previousDB := model.DB
	brokenDB, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = brokenDB
	t.Cleanup(func() {
		model.DB = previousDB
	})

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodGet,
		"/api/task/?view=summary&start_timestamp=100&end_timestamp=200",
		nil,
	)
	GetAllTask(context)

	var response struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.False(t, response.Success)
	assert.Contains(t, response.Message, "tasks")
}

func TestParseAdminTaskTimeRangeAcceptsMaximumRange(t *testing.T) {
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodGet,
		"/api/task/?start_timestamp=100&end_timestamp=2678500",
		nil,
	)

	startTimestamp, endTimestamp, ok := parseAdminTaskTimeRange(context)

	assert.True(t, ok)
	assert.Equal(t, int64(100), startTimestamp)
	assert.Equal(t, int64(2_678_500), endTimestamp)
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
