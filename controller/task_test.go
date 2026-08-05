package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTaskToDtoOnlyExposesUpstreamRequestToAdministrators(t *testing.T) {
	task := &model.Task{PrivateData: model.TaskPrivateData{
		AdminUpstreamRequest: &model.TaskUpstreamRequest{
			Method:  "POST",
			URL:     "https://provider.example/v1/tasks",
			Body:    `{"model":"example"}`,
			Failure: "500 Internal Server Error",
		},
	}}

	userDTO := taskToDto(task, false)
	assert.Nil(t, userDTO.AdminUpstreamRequest)

	adminDTO := taskToDto(task, true)
	require.NotNil(t, adminDTO.AdminUpstreamRequest)
	assert.Equal(t, task.PrivateData.AdminUpstreamRequest, adminDTO.AdminUpstreamRequest)
}
