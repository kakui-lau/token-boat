package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestQueryUserModelUsageAggregatesConsumptionAndRefunds(t *testing.T) {
	truncateTables(t)
	logs := []*Log{
		{UserId: 1, Username: "alice", ModelName: "model-a", Type: LogTypeConsume, CreatedAt: 100, Quota: 500, PromptTokens: 20, CompletionTokens: 10, UseTime: 1200},
		{UserId: 1, Username: "alice", ModelName: "model-a", Type: LogTypeConsume, CreatedAt: 110, Quota: 300, PromptTokens: 10, CompletionTokens: 5, UseTime: 800},
		{UserId: 1, Username: "alice", ModelName: "model-a", Type: LogTypeRefund, CreatedAt: 120, Quota: 200},
		{UserId: 1, Username: "alice", ModelName: "model-b", Type: LogTypeConsume, CreatedAt: 130, Quota: 100, PromptTokens: 4, CompletionTokens: 2, UseTime: 500},
		{UserId: 2, Username: "bob", ModelName: "model-a", Type: LogTypeConsume, CreatedAt: 140, Quota: 900},
	}
	for _, log := range logs {
		require.NoError(t, LOG_DB.Create(log).Error)
	}

	rows, total, summary, err := QueryUserModelUsage(UserModelUsageQuery{
		StartTimestamp: 90,
		EndTimestamp:   135,
		Username:       "alice",
	}, 0, 20)

	require.NoError(t, err)
	require.Len(t, rows, 2)
	assert.Equal(t, int64(2), total)
	assert.Equal(t, "model-a", rows[0].ModelName)
	assert.Equal(t, int64(2), rows[0].RequestCount)
	assert.Equal(t, int64(600), rows[0].Quota)
	assert.Equal(t, int64(30), rows[0].PromptTokens)
	assert.Equal(t, int64(15), rows[0].CompletionTokens)
	assert.Equal(t, int64(45), rows[0].TotalTokens)
	assert.Equal(t, int64(1000), rows[0].AverageUseTime)
	assert.Equal(t, int64(1), summary.UserCount)
	assert.Equal(t, int64(2), summary.ModelCount)
	assert.Equal(t, int64(3), summary.RequestCount)
	assert.Equal(t, int64(700), summary.Quota)
}

func TestQueryUserModelUsagePaginatesGroupedRows(t *testing.T) {
	truncateTables(t)
	for index, modelName := range []string{"model-a", "model-b", "model-c"} {
		require.NoError(t, LOG_DB.Create(&Log{
			UserId: 1, Username: "alice", ModelName: modelName,
			Type: LogTypeConsume, CreatedAt: 100, Quota: (index + 1) * 100,
		}).Error)
	}

	rows, total, summary, err := QueryUserModelUsage(UserModelUsageQuery{
		StartTimestamp: 90,
		EndTimestamp:   110,
	}, 1, 1)

	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, int64(3), total)
	assert.Equal(t, "model-b", rows[0].ModelName)
	assert.Equal(t, int64(3), summary.ModelCount)
}
