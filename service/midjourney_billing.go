package service

import (
	"context"
	"fmt"

	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/pricingruntime"
)

// RefundMidjourneyQuota reverses a completed legacy Midjourney charge. The
// model transaction makes balance, token, usage counters and refund marker
// atomic; the pricing snapshot and refund log are appended after that commit.
func RefundMidjourneyQuota(ctx context.Context, task *model.Midjourney, reason string) bool {
	if task == nil {
		return false
	}
	quota := task.Quota
	if quota == 0 {
		if task.RequestId != "" {
			if err := pricingruntime.MarkRequestPricingRefunded(task.RequestId); err != nil {
				logger.LogWarn(ctx, fmt.Sprintf("Midjourney pricing refund audit failed task=%s: %s", task.MjId, err.Error()))
				return false
			}
		}
		return true
	}

	applied, persistedTask, _, err := model.ApplyMidjourneyRefund(task.Id, quota)
	if err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("Midjourney refund transaction failed task=%s: %s", task.MjId, err.Error()))
		return false
	}
	if persistedTask != nil {
		task.Quota = persistedTask.Quota
		task.RefundStatus = persistedTask.RefundStatus
		task.RefundQuota = persistedTask.RefundQuota
		task.RefundedAt = persistedTask.RefundedAt
	}
	if !applied {
		logger.LogInfo(ctx, fmt.Sprintf("Midjourney task %s was already refunded", task.MjId))
		return true
	}

	model.RecordTaskBillingLog(model.RecordTaskBillingLogParams{
		UserId:    task.UserId,
		LogType:   model.LogTypeRefund,
		ChannelId: task.ChannelId,
		ModelName: CovertMjpActionToModelName(task.Action),
		Quota:     quota,
		TokenId:   task.TokenId,
		TaskId:    task.MjId,
		Other: map[string]interface{}{
			"billing_stage":        "completed",
			"task_status":          "FAILURE",
			"actual_charged_quota": quota,
			"customer_final_quota": 0,
			"refunded_quota":       quota,
			"reason":               reason,
		},
	})
	if task.RequestId != "" {
		if err := pricingruntime.MarkRequestPricingRefunded(task.RequestId); err != nil {
			logger.LogWarn(ctx, fmt.Sprintf("Midjourney pricing refund audit failed task=%s: %s", task.MjId, err.Error()))
			return false
		}
	}
	return true
}
