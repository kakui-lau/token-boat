package service

import (
	"context"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const (
	topUpPendingTTL         = 24 * time.Hour
	topUpExpiryTaskInterval = 5 * time.Minute
)

type topUpExpiryHandler struct{}

func (topUpExpiryHandler) Type() string { return model.SystemTaskTypeTopUpExpiry }

func (topUpExpiryHandler) Enabled() bool { return true }

func (topUpExpiryHandler) Interval() time.Duration { return topUpExpiryTaskInterval }

func (topUpExpiryHandler) NewPayload() any { return nil }

func (topUpExpiryHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	now := common.GetTimestamp()
	cutoff := now - int64(topUpPendingTTL/time.Second)
	expired, err := model.ExpirePendingTopUpsBefore(ctx, cutoff, now)
	if err != nil {
		failSystemTask(task, runnerID, err)
		return
	}
	result := map[string]int64{
		"expired_count": expired,
		"cutoff":        cutoff,
		"ttl_seconds":   int64(topUpPendingTTL / time.Second),
	}
	if err := model.FinishSystemTask(
		task.TaskID,
		runnerID,
		model.SystemTaskStatusSucceeded,
		result,
		"",
	); err != nil {
		logSystemTaskLockError(ctx, task, err)
	}
}

func init() {
	RegisterSystemTaskHandler(topUpExpiryHandler{})
}
