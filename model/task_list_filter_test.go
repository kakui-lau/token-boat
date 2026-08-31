package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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
