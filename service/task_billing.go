package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel/task/taskcommon"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service/pricingruntime"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

var (
	ErrManualTaskNotFound = errors.New("task not found")
	ErrManualTaskTerminal = errors.New("task is already in a terminal state")
)

type ManualTaskRefundResult struct {
	RefundedQuota   int
	AlreadyRefunded bool
}

// ManuallyFailAndRefundTask lets an administrator stop an unfinished async
// task without waiting for the global timeout. The status transition is CAS
// guarded against the polling worker, and RefundTaskQuota provides the
// transactional, idempotent accounting update.
func ManuallyFailAndRefundTask(ctx context.Context, taskID, reason string) (ManualTaskRefundResult, error) {
	task, exists, err := model.GetByOnlyTaskId(taskID)
	if err != nil {
		return ManualTaskRefundResult{}, err
	}
	if !exists {
		return ManualTaskRefundResult{}, ErrManualTaskNotFound
	}
	if task.RefundStatus == model.TaskRefundStatusCompleted && task.Quota == 0 {
		return ManualTaskRefundResult{
			RefundedQuota:   task.RefundQuota,
			AlreadyRefunded: true,
		}, nil
	}

	if task.Status != model.TaskStatusFailure {
		if task.Status == model.TaskStatusSuccess ||
			task.Status == model.TaskStatusCancelled ||
			task.Status == model.TaskStatusExpired {
			return ManualTaskRefundResult{}, ErrManualTaskTerminal
		}

		previousStatus := task.Status
		task.Status = model.TaskStatusFailure
		task.Progress = taskcommon.ProgressComplete
		task.FinishTime = time.Now().Unix()
		task.FailReason = reason
		won, updateErr := task.UpdateWithStatus(previousStatus)
		if updateErr != nil {
			return ManualTaskRefundResult{}, updateErr
		}
		if !won {
			return ManualTaskRefundResult{}, ErrManualTaskTerminal
		}
	}

	refundedQuota := task.Quota
	if !RefundTaskQuota(ctx, task, reason) {
		return ManualTaskRefundResult{}, errors.New("task refund failed and will be retried by reconciliation")
	}
	return ManualTaskRefundResult{RefundedQuota: refundedQuota}, nil
}

// LogTaskConsumption 记录任务消费日志和统计信息（仅记录，不涉及实际扣费）。
// 实际扣费已由 BillingSession（PreConsumeBilling + SettleBilling）完成。
func LogTaskConsumption(c *gin.Context, info *relaycommon.RelayInfo, chargedQuota int) {
	tokenName := c.GetString("token_name")
	logContent := fmt.Sprintf("操作 %s", info.Action)
	logContent = fmt.Sprintf("%s，销售报价已冻结", logContent)
	other := make(map[string]interface{})
	other["is_task"] = true
	other["billing_stage"] = "submitted"
	other["task_status"] = string(model.TaskStatusSubmitted)
	other["task_id"] = info.PublicTaskID
	other["local_estimated_quota"] = info.PriceData.Quota
	other["actual_pre_consumed_quota"] = info.FinalPreConsumedQuota
	other["request_path"] = c.Request.URL.Path
	if info.IsModelMapped {
		other["is_model_mapped"] = true
		other["upstream_model_name"] = info.UpstreamModelName
	}
	InjectGeneralBillingAudit(other, info, chargedQuota, nil)
	attachQuotaSaturation(c, info, other)
	estimatePromptTokens := info.GetEstimatePromptTokens()
	model.RecordConsumeLog(c, info.UserId, model.RecordConsumeLogParams{
		ChannelId:    info.ChannelId,
		PromptTokens: estimatePromptTokens,
		ModelName:    info.OriginModelName,
		TokenName:    tokenName,
		Quota:        chargedQuota,
		Content:      logContent,
		TokenId:      info.TokenId,
		Group:        info.UsingGroup,
		TaskId:       info.PublicTaskID,
		Other:        other,
	})
	// Async task refunds update durable accounting in a database transaction.
	// Persist the matching usage immediately as well; otherwise batch mode can
	// flush the pre-charge after a refund and make refunded usage reappear.
	model.UpdateUserUsedQuotaAndRequestCountImmediate(info.UserId, chargedQuota)
	model.UpdateChannelUsedQuotaImmediate(info.ChannelId, chargedQuota)
}

// ---------------------------------------------------------------------------
// 异步任务计费辅助函数
// ---------------------------------------------------------------------------

// taskIsSubscription 判断任务是否通过订阅计费。
func taskIsSubscription(task *model.Task) bool {
	return task.PrivateData.BillingSource == BillingSourceSubscription && task.PrivateData.SubscriptionId > 0
}

// taskBillingOther 从 task 的 BillingContext 构建日志 Other 字段。
func taskBillingOther(task *model.Task) map[string]interface{} {
	other := make(map[string]interface{})
	other["is_task"] = true
	other["task_id"] = task.TaskID
	if bc := task.PrivateData.BillingContext; bc != nil {
		if bc.QuotaPerUnit > 0 {
			other["quota_per_unit"] = bc.QuotaPerUnit
		}
		if len(bc.BusinessUsage) > 0 {
			other["business_usage"] = bc.BusinessUsage
		}
	}
	props := task.Properties
	if props.UpstreamModelName != "" && props.UpstreamModelName != props.OriginModelName {
		other["is_model_mapped"] = true
		other["upstream_model_name"] = props.UpstreamModelName
	}
	return other
}

func updateTaskBillingAudit(task *model.Task, status string, finalQuota, refundedQuota, promptTokens, completionTokens int) {
	if task == nil {
		return
	}
	pricingSnapshotAuditError := ""
	if task.PrivateData.ProviderCostKnown &&
		task.PrivateData.BillingContext != nil &&
		task.PrivateData.BillingContext.RequestId != "" {
		scope := "full_provider_cost"
		if task.PrivateData.ProviderIsByok {
			scope = "platform_fee_only"
		}
		if err := pricingruntime.RecordProviderReportedCostWithSource(
			task.PrivateData.BillingContext.RequestId,
			decimal.NewFromFloat(task.PrivateData.ProviderCost),
			scope,
			model.ProviderCostSourceTaskResponse,
		); err != nil {
			pricingSnapshotAuditError = err.Error()
			common.SysLog(fmt.Sprintf(
				"failed to persist task provider cost task=%s request=%s: %s",
				task.TaskID,
				task.PrivateData.BillingContext.RequestId,
				err.Error(),
			))
		}
	}
	fields := map[string]interface{}{
		"billing_stage":        "completed",
		"task_status":          status,
		"customer_final_quota": finalQuota,
	}
	if refundedQuota > 0 {
		fields["refunded_quota"] = refundedQuota
	}
	if promptTokens > 0 || completionTokens > 0 {
		fields["final_prompt_tokens"] = promptTokens
		fields["final_completion_tokens"] = completionTokens
		fields["final_total_tokens"] = promptTokens + completionTokens
	}
	adminFields := taskBillingAdminInfo(task, finalQuota)
	if err := model.UpdateTaskConsumeLogDetails(task.TaskID, fields, adminFields, promptTokens, completionTokens); err != nil {
		common.SysLog(fmt.Sprintf("failed to enrich task billing log task=%s: %s", task.TaskID, err.Error()))
		auditError := err.Error()
		if pricingSnapshotAuditError != "" {
			auditError = fmt.Sprintf(
				"pricing snapshot audit: %s; consume log audit: %s",
				pricingSnapshotAuditError,
				err.Error(),
			)
		}
		if statusErr := model.UpdateTaskBillingAuditStatus(task.ID, model.TaskSettlementStatusPending, auditError); statusErr != nil {
			common.SysLog(fmt.Sprintf("failed to mark task billing audit pending task=%s: %s", task.TaskID, statusErr.Error()))
		}
		return
	}
	if pricingSnapshotAuditError != "" {
		if err := model.UpdateTaskBillingAuditStatus(
			task.ID,
			model.TaskSettlementStatusPending,
			"pricing snapshot audit: "+pricingSnapshotAuditError,
		); err != nil {
			common.SysLog(fmt.Sprintf("failed to mark task billing audit pending task=%s: %s", task.TaskID, err.Error()))
		}
		return
	}
	if err := model.UpdateTaskBillingAuditStatus(task.ID, model.TaskSettlementStatusCompleted, ""); err != nil {
		common.SysLog(fmt.Sprintf("failed to mark task billing audit completed task=%s: %s", task.TaskID, err.Error()))
	}
}

func taskBillingAdminInfo(task *model.Task, finalQuota int) map[string]interface{} {
	adminInfo := make(map[string]interface{})
	if task != nil && task.PrivateData.ProviderCostKnown {
		adminInfo["provider_cost_usd"] = task.PrivateData.ProviderCost
		adminInfo["provider_cost_known"] = true
		adminInfo["provider_cost_status"] = model.ProviderCostStatusConfirmed
		adminInfo["provider_cost_source"] = model.ProviderCostSourceTaskResponse
		adminInfo["provider_is_byok"] = task.PrivateData.ProviderIsByok
		if task.PrivateData.ProviderIsByok {
			adminInfo["provider_cost_scope"] = "platform_fee_only"
			adminInfo["gross_margin_known"] = false
		} else if taskIsSubscription(task) {
			adminInfo["gross_margin_basis"] = "subscription_quota_value"
			adminInfo["gross_margin_known"] = false
		} else {
			quotaPerUnit := common.QuotaPerUnit
			if task.PrivateData.BillingContext != nil && task.PrivateData.BillingContext.QuotaPerUnit > 0 {
				quotaPerUnit = task.PrivateData.BillingContext.QuotaPerUnit
			}
			adminInfo["gross_margin_basis"] = "customer_charge"
			if quotaPerUnit <= 0 {
				adminInfo["gross_margin_known"] = false
				return adminInfo
			}
			adminInfo["gross_margin_known"] = true
			adminInfo["gross_margin_usd"] = float64(finalQuota)/quotaPerUnit - task.PrivateData.ProviderCost
		}
	}
	return adminInfo
}

// NewTaskBillingContext freezes every value required to settle an asynchronous
// task. Sensitive credentials are deliberately excluded from the persisted
// request headers.
func NewTaskBillingContext(info *relaycommon.RelayInfo) *model.TaskBillingContext {
	quotaPerUnit := common.QuotaPerUnit
	if info.DynamicPricingSnapshot != nil && info.DynamicPricingSnapshot.QuotaPerUnit > 0 {
		quotaPerUnit = info.DynamicPricingSnapshot.QuotaPerUnit
	}
	return &model.TaskBillingContext{
		RequestId:       info.RequestId,
		QuotaPerUnit:    quotaPerUnit,
		BusinessUsage:   info.PriceData.OtherRatios(),
		OriginModelName: info.OriginModelName,
	}
}

// taskModelName 从 BillingContext 或 Properties 中获取模型名称。
func taskModelName(task *model.Task) string {
	if bc := task.PrivateData.BillingContext; bc != nil && bc.OriginModelName != "" {
		return bc.OriginModelName
	}
	return task.Properties.OriginModelName
}

// RefundTaskQuota 统一的任务失败退款逻辑。
// 当异步任务失败时，将预扣的 quota 退还给用户（支持钱包和订阅），并退还令牌额度。
// 返回资金来源是否已成功退还；失败时保留 quota，供显式重试或人工对账。
func RefundTaskQuota(ctx context.Context, task *model.Task, reason string) bool {
	quota := task.Quota
	if quota == 0 {
		completeTaskRefundPricingAudit(task, task.RefundQuota)
		return true
	}
	applied, persistedTask, _, err := model.ApplyTaskRefund(task.ID, quota)
	if err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("任务退款事务失败 task %s: %s", task.TaskID, err.Error()))
		return false
	}
	if !applied {
		logger.LogInfo(ctx, fmt.Sprintf("任务 %s 已完成退款，跳过重复处理", task.TaskID))
		task.Quota = 0
		task.RefundStatus = model.TaskRefundStatusCompleted
		if persistedTask != nil {
			task.RefundQuota = persistedTask.RefundQuota
			task.RefundedAt = persistedTask.RefundedAt
		}
		completeTaskRefundPricingAudit(task, task.RefundQuota)
		return true
	}
	task.Quota = 0
	task.RefundStatus = model.TaskRefundStatusCompleted
	task.RefundQuota = quota
	if persistedTask != nil {
		task.RefundedAt = persistedTask.RefundedAt
	}

	// 核心余额、Token、统计和任务状态已经在同一数据库事务中提交。
	// 日志数据库可能独立，因此在事务成功后追加审计日志。
	other := taskBillingOther(task)
	other["billing_stage"] = "completed"
	other["task_status"] = string(model.TaskStatusFailure)
	other["local_estimated_quota"] = quota
	other["actual_pre_consumed_quota"] = quota
	other["customer_final_quota"] = 0
	other["refunded_quota"] = quota
	other["reason"] = reason
	if adminInfo := taskBillingAdminInfo(task, 0); len(adminInfo) > 0 {
		other["admin_info"] = adminInfo
	}
	model.RecordTaskBillingLog(model.RecordTaskBillingLogParams{
		UserId:    task.UserId,
		LogType:   model.LogTypeRefund,
		Content:   "",
		ChannelId: task.ChannelId,
		ModelName: taskModelName(task),
		Quota:     quota,
		TokenId:   task.PrivateData.TokenId,
		Group:     task.Group,
		TaskId:    task.TaskID,
		Other:     other,
	})
	completeTaskRefundPricingAudit(task, quota)

	return true
}

func completeTaskRefundPricingAudit(task *model.Task, refundedQuota int) {
	snapshotErr := markTaskPricingSnapshotRefunded(task)
	updateTaskBillingAudit(task, string(model.TaskStatusFailure), 0, refundedQuota, 0, 0)
	if snapshotErr != nil && task != nil && task.ID > 0 {
		if err := model.UpdateTaskBillingAuditStatus(
			task.ID,
			model.TaskSettlementStatusPending,
			snapshotErr.Error(),
		); err != nil {
			common.SysLog(fmt.Sprintf(
				"failed to mark task billing audit pending task=%s: %s",
				task.TaskID,
				err.Error(),
			))
		}
	}
}

func markTaskPricingSnapshotRefunded(task *model.Task) error {
	if task == nil || task.PrivateData.BillingContext == nil ||
		task.PrivateData.BillingContext.RequestId == "" {
		return nil
	}
	requestId := task.PrivateData.BillingContext.RequestId
	if err := pricingruntime.MarkRequestPricingRefunded(requestId); err != nil {
		common.SysLog(fmt.Sprintf(
			"failed to mark task pricing snapshot refunded task=%s request=%s: %s",
			task.TaskID,
			requestId,
			err.Error(),
		))
		return err
	}
	return nil
}

// RecalculateTaskQuota 通用的异步差额结算。
// actualQuota 是任务完成后的实际应扣额度，与预扣额度 (task.Quota) 做差额结算。
// reason 用于日志记录（例如 "token重算" 或 "adaptor调整"）。
// promptTokens / completionTokens 可选（异步任务完成后上游返回的真实 token 量），
// 会写入差额结算日志，并回填原 task 消费日志的 prompt_tokens/completion_tokens 列。
// clamps 可选：若计算 actualQuota 时发生额度饱和，将其记入日志 admin_info（仅管理员可见）。
func RecalculateTaskQuota(ctx context.Context, task *model.Task, actualQuota int, reason string, promptTokens, completionTokens int, clamps ...*common.QuotaClamp) {
	if actualQuota < 0 {
		return
	}
	preConsumedQuota := task.Quota
	quotaDelta := actualQuota - preConsumedQuota

	applied, persistedTask, _, err := model.ApplyTaskSettlement(task.ID, preConsumedQuota, actualQuota)
	if err != nil {
		if markErr := model.MarkTaskSettlementPending(task.ID, actualQuota, err.Error()); markErr != nil {
			logger.LogError(ctx, fmt.Sprintf("标记任务待结算失败 task %s: %s", task.TaskID, markErr.Error()))
		}
		logger.LogError(ctx, fmt.Sprintf("任务差额结算事务失败 task %s: %s", task.TaskID, err.Error()))
		return
	}
	if !applied {
		if persistedTask != nil {
			task.Quota = persistedTask.Quota
			task.SettlementStatus = persistedTask.SettlementStatus
			task.SettlementTargetQuota = persistedTask.SettlementTargetQuota
			task.SettlementError = persistedTask.SettlementError
		}
		return
	}
	task.Quota = actualQuota
	task.SettlementStatus = model.TaskSettlementStatusCompleted
	task.SettlementTargetQuota = actualQuota
	task.SettlementError = ""

	if quotaDelta == 0 {
		logger.LogInfo(ctx, fmt.Sprintf("任务 %s 预扣费准确（%s，%s）",
			task.TaskID, logger.LogQuota(actualQuota), reason))
		updateTaskBillingAudit(task, string(model.TaskStatusSuccess), actualQuota, 0, promptTokens, completionTokens)
		return
	}

	logger.LogInfo(ctx, fmt.Sprintf("任务 %s 差额结算完成：delta=%s（实际：%s，预扣：%s，%s）",
		task.TaskID,
		logger.LogQuota(quotaDelta),
		logger.LogQuota(actualQuota),
		logger.LogQuota(preConsumedQuota),
		reason,
	))

	var logType int
	var logQuota int
	if quotaDelta > 0 {
		logType = model.LogTypeConsume
		logQuota = quotaDelta
	} else {
		logType = model.LogTypeRefund
		logQuota = -quotaDelta
	}
	other := taskBillingOther(task)
	other["task_id"] = task.TaskID
	other["pre_consumed_quota"] = preConsumedQuota
	other["actual_quota"] = actualQuota
	other["billing_stage"] = "completed"
	other["task_status"] = string(model.TaskStatusSuccess)
	other["local_estimated_quota"] = preConsumedQuota
	other["actual_pre_consumed_quota"] = preConsumedQuota
	other["customer_final_quota"] = actualQuota
	other["adjustment_quota"] = quotaDelta
	if promptTokens > 0 || completionTokens > 0 {
		other["settlement_prompt_tokens"] = promptTokens
		other["settlement_completion_tokens"] = completionTokens
		other["settlement_total_tokens"] = promptTokens + completionTokens
	}
	if adminInfo := taskBillingAdminInfo(task, actualQuota); len(adminInfo) > 0 {
		other["admin_info"] = adminInfo
	}
	for _, clamp := range clamps {
		attachQuotaSaturationToOther(other, clamp)
		if clamp != nil {
			logger.LogWarn(ctx, fmt.Sprintf("quota saturation on task settlement: task=%s op=%s kind=%s original=%g clamped=%d",
				task.TaskID, clamp.Op, clamp.Kind, clamp.Original, clamp.Clamped))
		}
	}
	model.RecordTaskBillingLog(model.RecordTaskBillingLogParams{
		UserId:           task.UserId,
		LogType:          logType,
		Content:          reason,
		ChannelId:        task.ChannelId,
		ModelName:        taskModelName(task),
		Quota:            logQuota,
		PromptTokens:     promptTokens,
		CompletionTokens: completionTokens,
		TotalTokens:      promptTokens + completionTokens,
		TokenId:          task.PrivateData.TokenId,
		Group:            task.Group,
		TaskId:           task.TaskID,
		Other:            other,
		NodeName:         task.PrivateData.NodeName,
	})
	updateTaskBillingAudit(task, string(model.TaskStatusSuccess), actualQuota, 0, promptTokens, completionTokens)
}
