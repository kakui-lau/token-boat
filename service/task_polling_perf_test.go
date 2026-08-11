package service

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
)

func TestBuildTerminalTaskPerfSampleUsesOriginModelAndTaskDuration(t *testing.T) {
	task := &model.Task{
		Group:      "video",
		Status:     model.TaskStatusSuccess,
		StartTime:  100,
		FinishTime: 112,
		Properties: model.Properties{
			OriginModelName:   "seedance-2.0",
			UpstreamModelName: "provider/seedance-2.0",
		},
	}

	sample := buildTerminalTaskPerfSample(task, 200)

	assert.Equal(t, "seedance-2.0", sample.Model)
	assert.Equal(t, "video", sample.Group)
	assert.EqualValues(t, 12_000, sample.LatencyMs)
	assert.True(t, sample.Success)
}

func TestBuildTerminalTaskPerfSampleMarksFailedTaskAndUsesSafeFallbacks(t *testing.T) {
	task := &model.Task{
		Status:     model.TaskStatusFailure,
		CreatedAt:  100,
		FinishTime: 90,
		Properties: model.Properties{
			UpstreamModelName: "provider/video-model",
		},
	}

	sample := buildTerminalTaskPerfSample(task, 200)

	assert.Equal(t, "provider/video-model", sample.Model)
	assert.Equal(t, "auto", sample.Group)
	assert.Zero(t, sample.LatencyMs)
	assert.False(t, sample.Success)
}
