package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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
