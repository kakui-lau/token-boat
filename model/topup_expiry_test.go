package model

import (
	"context"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestExpirePendingTopUpsBeforeExpiresOnlyStalePendingOrders(t *testing.T) {
	truncateTables(t)

	const cutoff int64 = 1_000_000
	const expiredAt int64 = 1_000_300
	topUps := []TopUp{
		{TradeNo: "stale-pending", Status: common.TopUpStatusPending, CreateTime: cutoff - 1},
		{TradeNo: "boundary-pending", Status: common.TopUpStatusPending, CreateTime: cutoff},
		{TradeNo: "fresh-pending", Status: common.TopUpStatusPending, CreateTime: cutoff + 1},
		{TradeNo: "completed", Status: common.TopUpStatusSuccess, CreateTime: cutoff - 1},
		{TradeNo: "unknown-created-at", Status: common.TopUpStatusPending, CreateTime: 0},
	}
	require.NoError(t, DB.Create(&topUps).Error)

	expired, err := ExpirePendingTopUpsBefore(context.Background(), cutoff, expiredAt)
	require.NoError(t, err)
	assert.Equal(t, int64(2), expired)

	var got []TopUp
	require.NoError(t, DB.Order("id asc").Find(&got).Error)
	require.Len(t, got, len(topUps))
	assert.Equal(t, common.TopUpStatusExpired, got[0].Status)
	assert.Equal(t, expiredAt, got[0].CompleteTime)
	assert.Equal(t, common.TopUpStatusExpired, got[1].Status)
	assert.Equal(t, expiredAt, got[1].CompleteTime)
	assert.Equal(t, common.TopUpStatusPending, got[2].Status)
	assert.Zero(t, got[2].CompleteTime)
	assert.Equal(t, common.TopUpStatusSuccess, got[3].Status)
	assert.Zero(t, got[3].CompleteTime)
	assert.Equal(t, common.TopUpStatusPending, got[4].Status)
	assert.Zero(t, got[4].CompleteTime)
}

func TestExpirePendingTopUpsBeforeRejectsInvalidTimestamps(t *testing.T) {
	truncateTables(t)

	_, err := ExpirePendingTopUpsBefore(context.Background(), 0, 1)
	require.Error(t, err)
	_, err = ExpirePendingTopUpsBefore(context.Background(), 1, 0)
	require.Error(t, err)
}
