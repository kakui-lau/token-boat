package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTaskArtifactIsStoredAndScopedToOwner(t *testing.T) {
	truncateTables(t)

	task := &Task{TaskID: "task-artifact-owner", UserId: 17, Platform: "image"}
	artifacts := []TaskArtifact{{
		CreatedAt:   100,
		Position:    0,
		ContentType: "image/png",
		Content:     []byte("png-bytes"),
	}}
	require.NoError(t, task.InsertWithArtifacts(artifacts))

	artifact, exists, err := GetUserTaskArtifact(17, task.TaskID, 0)
	require.NoError(t, err)
	require.True(t, exists)
	assert.Equal(t, "image/png", artifact.ContentType)
	assert.Equal(t, []byte("png-bytes"), artifact.Content)

	_, exists, err = GetUserTaskArtifact(18, task.TaskID, 0)
	require.NoError(t, err)
	assert.False(t, exists)
}
