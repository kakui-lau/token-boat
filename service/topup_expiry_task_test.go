package service

import (
	"context"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTopUpExpiryHandlerExpiresOrdersOlderThanTwentyFourHours(t *testing.T) {
	truncate(t)

	now := common.GetTimestamp()
	require.NoError(t, model.DB.Create(&[]model.TopUp{
		{TradeNo: "older-than-24h", Status: common.TopUpStatusPending, CreateTime: now - int64(25*time.Hour/time.Second)},
		{TradeNo: "newer-than-24h", Status: common.TopUpStatusPending, CreateTime: now - int64(23*time.Hour/time.Second)},
	}).Error)

	task, err := model.CreateSystemTask(model.SystemTaskTypeTopUpExpiry, nil, nil)
	require.NoError(t, err)
	claimed, ok, err := model.ClaimSystemTask(
		task.ID,
		model.SystemTaskTypeTopUpExpiry,
		"topup-expiry-test-runner",
		now+60,
	)
	require.NoError(t, err)
	require.True(t, ok)

	topUpExpiryHandler{}.Run(context.Background(), claimed, "topup-expiry-test-runner")

	stale := model.GetTopUpByTradeNo("older-than-24h")
	require.NotNil(t, stale)
	assert.Equal(t, common.TopUpStatusExpired, stale.Status)
	assert.Positive(t, stale.CompleteTime)
	fresh := model.GetTopUpByTradeNo("newer-than-24h")
	require.NotNil(t, fresh)
	assert.Equal(t, common.TopUpStatusPending, fresh.Status)
	assert.Zero(t, fresh.CompleteTime)

	finished, err := model.GetSystemTaskByTaskID(task.TaskID)
	require.NoError(t, err)
	require.NotNil(t, finished)
	assert.Equal(t, model.SystemTaskStatusSucceeded, finished.Status)
	assert.Contains(t, finished.Result, `"expired_count":1`)
	assert.Contains(t, finished.Result, `"ttl_seconds":86400`)
}
