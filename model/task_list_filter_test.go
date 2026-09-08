package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestTaskListFiltersUserTasksByProductType(t *testing.T) {
	truncateTables(t)
	now := time.Now().Unix()
	tasks := []Task{
		{TaskID: "task-audio", UserId: 11, Platform: constant.TaskPlatformSuno, Action: constant.SunoActionMusic, Status: TaskStatusSuccess, SubmitTime: now - 30, Properties: Properties{OriginModelName: "suno_music"}},
		{TaskID: "task-video", UserId: 11, Platform: constant.TaskPlatform("50"), Action: constant.TaskActionGenerate, Status: TaskStatusInProgress, SubmitTime: now - 20, Properties: Properties{OriginModelName: "kling-video"}},
		{TaskID: "task-image", UserId: 11, Platform: constant.TaskPlatform("24"), Action: constant.TaskActionGenerate, Status: TaskStatusSuccess, SubmitTime: now - 10, Properties: Properties{OriginModelName: "imagen-4"}},
		{TaskID: "task-other-user", UserId: 12, Platform: constant.TaskPlatform("50"), Status: TaskStatusSuccess, SubmitTime: now, Properties: Properties{OriginModelName: "kling-video"}},
	}
	require.NoError(t, DB.Create(&tasks).Error)

	videoFilter := SyncTaskQueryParams{TaskType: "video", SortOrder: "asc"}
	videoRows := TaskGetAllUserTask(11, 0, 20, videoFilter)
	require.Len(t, videoRows, 1)
	assert.Equal(t, "task-video", videoRows[0].TaskID)
	assert.Equal(t, int64(1), TaskCountAllUserTask(11, videoFilter))
	processingRows := TaskGetAllUserTask(11, 0, 20, SyncTaskQueryParams{
		Statuses: []TaskStatus{TaskStatusInProgress},
	})
	require.Len(t, processingRows, 1)
	assert.Equal(t, "task-video", processingRows[0].TaskID)

	imageRows := TaskGetAllUserTask(11, 0, 20, SyncTaskQueryParams{TaskType: "image"})
	require.Len(t, imageRows, 1)
	assert.Equal(t, "task-image", imageRows[0].TaskID)

	audioRows := TaskGetAllUserTask(11, 0, 20, SyncTaskQueryParams{TaskType: "audio"})
	require.Len(t, audioRows, 1)
	assert.Equal(t, "task-audio", audioRows[0].TaskID)
}

func TestCanonicalTaskTypeMatchesListFilters(t *testing.T) {
	truncateTables(t)
	tasks := []Task{
		{TaskID: "task-audio", UserId: 11, Platform: constant.TaskPlatformSuno, Action: constant.SunoActionMusic, Properties: Properties{OriginModelName: "music-model"}},
		{TaskID: "task-video", UserId: 11, Platform: constant.TaskPlatform("50"), Action: constant.TaskActionGenerate, Properties: Properties{UpstreamModelName: "seedance-2.0"}},
		{TaskID: "task-image", UserId: 11, Platform: constant.TaskPlatform("24"), Action: constant.TaskActionGenerate, Properties: Properties{OriginModelName: "imagen-4"}},
	}
	require.NoError(t, DB.Create(&tasks).Error)

	testCases := []struct {
		taskType string
		taskID   string
		index    int
	}{
		{taskType: TaskTypeAudio, taskID: "task-audio", index: 0},
		{taskType: TaskTypeVideo, taskID: "task-video", index: 1},
		{taskType: TaskTypeImage, taskID: "task-image", index: 2},
	}
	for _, testCase := range testCases {
		t.Run(testCase.taskType, func(t *testing.T) {
			assert.Equal(t, testCase.taskType, CanonicalTaskType(&tasks[testCase.index]))
			rows := TaskGetAllUserTask(11, 0, 20, SyncTaskQueryParams{TaskType: testCase.taskType})
			require.Len(t, rows, 1)
			assert.Equal(t, testCase.taskID, rows[0].TaskID)
		})
	}
}

func TestTaskTypeIgnoresPromptText(t *testing.T) {
	truncateTables(t)
	task := Task{
		TaskID:   "task-image-with-video-prompt",
		UserId:   11,
		Platform: constant.TaskPlatform("24"),
		Action:   constant.TaskActionGenerate,
		Properties: Properties{
			Input:           "Create a music video poster",
			OriginModelName: "imagen-4",
		},
	}
	require.NoError(t, DB.Create(&task).Error)
	assert.Equal(t, TaskTypeImage, CanonicalTaskType(&task))

	imageRows := TaskGetAllUserTask(11, 0, 20, SyncTaskQueryParams{TaskType: TaskTypeImage})
	require.Len(t, imageRows, 1)
	assert.Equal(t, task.TaskID, imageRows[0].TaskID)
	assert.Empty(t, TaskGetAllUserTask(11, 0, 20, SyncTaskQueryParams{TaskType: TaskTypeVideo}))
	assert.Empty(t, TaskGetAllUserTask(11, 0, 20, SyncTaskQueryParams{TaskType: TaskTypeAudio}))
}

func TestTaskTypeFiltersUseCanonicalPriorityForStructuredHints(t *testing.T) {
	truncateTables(t)
	task := Task{
		TaskID:   "task-overlapping-hints",
		UserId:   11,
		Platform: constant.TaskPlatform("video"),
		Properties: Properties{
			OriginModelName: "music-video-model",
		},
	}
	require.NoError(t, DB.Create(&task).Error)
	assert.Equal(t, TaskTypeAudio, CanonicalTaskType(&task))
	assert.Len(t, TaskGetAllUserTask(11, 0, 20, SyncTaskQueryParams{TaskType: TaskTypeAudio}), 1)
	assert.Empty(t, TaskGetAllUserTask(11, 0, 20, SyncTaskQueryParams{TaskType: TaskTypeVideo}))
	assert.Empty(t, TaskGetAllUserTask(11, 0, 20, SyncTaskQueryParams{TaskType: TaskTypeImage}))
}

func TestTaskTypeDescriptorUsesOnlyStructuredFieldsAcrossDatabases(t *testing.T) {
	originalDatabaseType := common.MainDatabaseType()
	t.Cleanup(func() {
		common.SetMainDatabaseType(originalDatabaseType)
	})

	testCases := []struct {
		name          string
		databaseType  common.DatabaseType
		dialectMarker string
	}{
		{name: "SQLite", databaseType: common.DatabaseTypeSQLite, dialectMarker: "json_extract"},
		{name: "PostgreSQL", databaseType: common.DatabaseTypePostgreSQL, dialectMarker: "::jsonb ->>"},
		{name: "MySQL", databaseType: common.DatabaseTypeMySQL, dialectMarker: "JSON_EXTRACT"},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			common.SetMainDatabaseType(testCase.databaseType)
			descriptor := taskTypeDescriptorSQL()
			assert.Contains(t, descriptor, testCase.dialectMarker)
			assert.Contains(t, descriptor, "upstream_model_name")
			assert.Contains(t, descriptor, "origin_model_name")
			assert.NotContains(t, descriptor, "$.input")
			assert.NotContains(t, descriptor, "CAST(properties AS TEXT)")
		})
	}
}

func TestTaskAdminSummaryQueryDoesNotLoadPrivatePayloads(t *testing.T) {
	truncateTables(t)
	task := Task{
		TaskID:   "task-safe-summary",
		UserId:   11,
		Platform: constant.TaskPlatform("50"),
		Properties: Properties{
			Input:           "A safe preview",
			OriginModelName: "seedance-2.0",
		},
		PrivateData: TaskPrivateData{
			BillingContext: &TaskBillingContext{QuotaPerUnit: 250_000},
			ResultURL:      "https://signed.example/result.mp4?token=secret",
			AdminUpstreamRequest: &TaskUpstreamRequest{
				Body: `{"api_key":"secret"}`,
			},
		},
		Data: []byte(`{"provider":"secret"}`),
	}
	require.NoError(t, DB.Create(&task).Error)

	rows, err := TaskGetAllTaskSummaries(0, 20, SyncTaskQueryParams{})

	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, "A safe preview", rows[0].Properties.Input)
	assert.Empty(t, rows[0].PrivateData)
	assert.Empty(t, rows[0].Data)

	missingSnapshotTask := Task{TaskID: "task-missing-billing-snapshot", UserId: 11}
	require.NoError(t, DB.Create(&missingSnapshotTask).Error)
	quotaPerUnits, err := TaskBillingQuotaPerUnitSnapshots([]int64{task.ID, missingSnapshotTask.ID})
	require.NoError(t, err)
	assert.Equal(t, 250_000.0, quotaPerUnits[task.ID])
	_, hasMissingSnapshot := quotaPerUnits[missingSnapshotTask.ID]
	assert.False(t, hasMissingSnapshot)
}

func TestTaskQuotaUSDRequiresValidHistoricalRate(t *testing.T) {
	valid := TaskQuotaUSD(500_000, 250_000)
	require.NotNil(t, valid)
	assert.Equal(t, 2.0, *valid)
	assert.Nil(t, TaskQuotaUSD(500_000, 0))
	assert.Nil(t, TaskQuotaUSD(500_000, -1))
	assert.Nil(t, TaskQuotaUSD(-1, 250_000))
}

func TestAdminTaskSummaryQueriesReturnDatabaseErrors(t *testing.T) {
	previousDB := DB
	brokenDB, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	DB = brokenDB
	t.Cleanup(func() {
		DB = previousDB
	})

	_, err = TaskGetAllTaskSummaries(0, 20, SyncTaskQueryParams{})
	assert.Error(t, err)
	_, err = TaskCountAllTaskSummaries(SyncTaskQueryParams{})
	assert.Error(t, err)
}
