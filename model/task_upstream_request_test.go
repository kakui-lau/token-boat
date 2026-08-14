package model

import (
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestInitTaskCopiesAdminUpstreamRequestIntoPrivateData(t *testing.T) {
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{},
		TaskRelayInfo: &relaycommon.TaskRelayInfo{
			AdminUpstreamRequest: &relaycommon.TaskUpstreamRequestSnapshot{
				Method: "POST",
				URL:    "https://provider.example/v1/tasks",
				Body:   `{"model":"video"}`,
			},
		},
	}

	task := InitTask("video", info)

	require.NotNil(t, task.PrivateData.AdminUpstreamRequest)
	assert.Equal(t, "POST", task.PrivateData.AdminUpstreamRequest.Method)
	assert.Equal(t, "https://provider.example/v1/tasks", task.PrivateData.AdminUpstreamRequest.URL)
	assert.Equal(t, `{"model":"video"}`, task.PrivateData.AdminUpstreamRequest.Body)
	assert.Empty(t, task.PrivateData.AdminUpstreamRequest.Failure)
}
