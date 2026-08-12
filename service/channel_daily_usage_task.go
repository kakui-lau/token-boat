package service

import (
	"context"
	"time"

	"github.com/QuantumNous/new-api/model"
)

type channelDailyUsageHandler struct{}

func (channelDailyUsageHandler) Type() string            { return model.SystemTaskTypeDailyUsage }
func (channelDailyUsageHandler) Enabled() bool           { return true }
func (channelDailyUsageHandler) Interval() time.Duration { return time.Hour }
func (channelDailyUsageHandler) NewPayload() any         { return nil }

func (channelDailyUsageHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	if err := RecalculateRecentChannelDailyUsage(ctx, 3, time.Now()); err != nil {
		failSystemTask(task, runnerID, err)
		return
	}
	result := map[string]any{"days_recalculated": 3, "includes_current_day": true, "timezone": "UTC"}
	if err := model.FinishSystemTask(task.TaskID, runnerID, model.SystemTaskStatusSucceeded, result, ""); err != nil {
		logSystemTaskLockError(ctx, task, err)
	}
}

func init() {
	RegisterSystemTaskHandler(channelDailyUsageHandler{})
}
