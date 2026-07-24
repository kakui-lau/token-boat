package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

// LogTaskConsumption 记录任务消费日志和统计信息（仅记录，不涉及实际扣费）。
// 实际扣费已由 BillingSession（PreConsumeBilling + SettleBilling）完成。
func LogTaskConsumption(c *gin.Context, info *relaycommon.RelayInfo, chargedQuota int) {
	tokenName := c.GetString("token_name")
	logContent := fmt.Sprintf("操作 %s", info.Action)
	// 支持任务仅按次计费
	if common.StringsContains(constant.TaskPricePatches, info.OriginModelName) {
		logContent = fmt.Sprintf("%s，按次计费", logContent)
	} else {
		if otherRatios := info.PriceData.OtherRatios(); len(otherRatios) > 0 {
			var contents []string
			for key, ra := range otherRatios {
				if 1.0 != ra {
					contents = append(contents, fmt.Sprintf("%s: %.2f", key, ra))
				}
			}
			if len(contents) > 0 {
				logContent = fmt.Sprintf("%s, 计算参数：%s", logContent, strings.Join(contents, ", "))
			}
		}
	}
	other := make(map[string]interface{})
	other["is_task"] = true
	other["billing_stage"] = "submitted"
	other["task_status"] = string(model.TaskStatusSubmitted)
	other["task_id"] = info.PublicTaskID
	other["local_estimated_quota"] = info.PriceData.Quota
	other["actual_pre_consumed_quota"] = info.FinalPreConsumedQuota
	other["request_path"] = c.Request.URL.Path
	other["model_price"] = info.PriceData.ModelPrice
	if info.PriceData.ModelRatio > 0 {
		other["model_ratio"] = info.PriceData.ModelRatio
	}
	other["group_ratio"] = info.PriceData.GroupRatioInfo.GroupRatio
	if info.PriceData.GroupRatioInfo.HasSpecialRatio {
		other["user_group_ratio"] = info.PriceData.GroupRatioInfo.GroupSpecialRatio
	}
	if info.IsModelMapped {
		other["is_model_mapped"] = true
		other["upstream_model_name"] = info.UpstreamModelName
	}
	for key, ratio := range info.PriceData.OtherRatios() {
		other[key] = ratio
	}
	attachQuotaSaturation(c, info, other)
	model.RecordConsumeLog(c, info.UserId, model.RecordConsumeLogParams{
		ChannelId: info.ChannelId,
		ModelName: info.OriginModelName,
		TokenName: tokenName,
		Quota:     chargedQuota,
		Content:   logContent,
		TokenId:   info.TokenId,
		Group:     info.UsingGroup,
		TaskId:    info.PublicTaskID,
		Other:     other,
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
		other["model_price"] = bc.ModelPrice
		if bc.ModelRatio > 0 {
			other["model_ratio"] = bc.ModelRatio
		}
		other["group_ratio"] = bc.GroupRatio
		if priceData := taskBillingContextPriceData(bc); priceData != nil {
			for k, v := range priceData.OtherRatios() {
				other[k] = v
			}
		}
	}
	props := task.Properties
	if props.UpstreamModelName != "" && props.UpstreamModelName != props.OriginModelName {
		other["is_model_mapped"] = true
		other["upstream_model_name"] = props.UpstreamModelName
	}
	return other
}

func updateTaskBillingAudit(task *model.Task, status string, finalQuota, refundedQuota int) {
	if task == nil {
		return
	}
	fields := map[string]interface{}{
		"billing_stage":        "completed",
		"task_status":          status,
		"customer_final_quota": finalQuota,
	}
	if refundedQuota > 0 {
		fields["refunded_quota"] = refundedQuota
	}
	adminFields := taskBillingAdminInfo(task, finalQuota)
	if err := model.UpdateTaskConsumeLogDetails(task.TaskID, fields, adminFields); err != nil {
		common.SysLog(fmt.Sprintf("failed to enrich task billing log task=%s: %s", task.TaskID, err.Error()))
		if statusErr := model.UpdateTaskBillingAuditStatus(task.ID, model.TaskSettlementStatusPending, err.Error()); statusErr != nil {
			common.SysLog(fmt.Sprintf("failed to mark task billing audit pending task=%s: %s", task.TaskID, statusErr.Error()))
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
		adminInfo["provider_is_byok"] = task.PrivateData.ProviderIsByok
		if task.PrivateData.ProviderIsByok {
			adminInfo["provider_cost_scope"] = "platform_fee_only"
			adminInfo["gross_margin_known"] = false
		} else if taskIsSubscription(task) {
			adminInfo["gross_margin_basis"] = "subscription_quota_value"
			adminInfo["gross_margin_known"] = false
		} else {
			adminInfo["gross_margin_basis"] = "customer_charge"
			adminInfo["gross_margin_known"] = true
			adminInfo["gross_margin_usd"] = float64(finalQuota)/float64(common.QuotaPerUnit) - task.PrivateData.ProviderCost
		}
	}
	return adminInfo
}

func taskBillingContextPriceData(bc *model.TaskBillingContext) *types.PriceData {
	if bc == nil || len(bc.OtherRatios) == 0 {
		return nil
	}
	priceData := &types.PriceData{}
	if !priceData.ReplaceOtherRatios(bc.OtherRatios) {
		return nil
	}
	return priceData
}

// NewTaskBillingContext freezes every value required to settle an asynchronous
// task. Sensitive credentials are deliberately excluded from the persisted
// request headers.
func NewTaskBillingContext(info *relaycommon.RelayInfo) *model.TaskBillingContext {
	bc := &model.TaskBillingContext{
		ModelPrice:      info.PriceData.ModelPrice,
		GroupRatio:      info.PriceData.GroupRatioInfo.GroupRatio,
		ModelRatio:      info.PriceData.ModelRatio,
		OtherRatios:     info.PriceData.OtherRatios(),
		OriginModelName: info.OriginModelName,
		PerCallBilling:  common.StringsContains(constant.TaskPricePatches, info.OriginModelName) || info.PriceData.UsePrice,
		TieredSnapshot:  info.TieredBillingSnapshot,
	}
	if info.BillingRequestInput == nil {
		return bc
	}

	requestInput := &billingexpr.RequestInput{
		Headers: make(map[string]string),
		Body:    append([]byte(nil), info.BillingRequestInput.Body...),
	}
	for key, value := range info.BillingRequestInput.Headers {
		switch strings.ToLower(strings.TrimSpace(key)) {
		case "authorization", "proxy-authorization", "cookie", "set-cookie", "x-api-key", "api-key":
			continue
		default:
			requestInput.Headers[key] = value
		}
	}
	bc.TieredRequest = requestInput
	return bc
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
// 返回资金来源是否已成功退还；失败时保留 quota 作为后续对账标记。
func RefundTaskQuota(ctx context.Context, task *model.Task, reason string) bool {
	quota := task.Quota
	if quota == 0 {
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
	updateTaskBillingAudit(task, string(model.TaskStatusFailure), 0, quota)

	return true
}

// RecalculateTaskQuota 通用的异步差额结算。
// actualQuota 是任务完成后的实际应扣额度，与预扣额度 (task.Quota) 做差额结算。
// reason 用于日志记录（例如 "token重算" 或 "adaptor调整"）。
// clamps 可选：若计算 actualQuota 时发生额度饱和，将其记入日志 admin_info（仅管理员可见）。
func RecalculateTaskQuota(ctx context.Context, task *model.Task, actualQuota int, reason string, clamps ...*common.QuotaClamp) {
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
		UserId:    task.UserId,
		LogType:   logType,
		Content:   reason,
		ChannelId: task.ChannelId,
		ModelName: taskModelName(task),
		Quota:     logQuota,
		TokenId:   task.PrivateData.TokenId,
		Group:     task.Group,
		TaskId:    task.TaskID,
		Other:     other,
		NodeName:  task.PrivateData.NodeName,
	})
	updateTaskBillingAudit(task, string(model.TaskStatusSuccess), actualQuota, 0)
}

// RecalculateTaskQuotaByTokens 根据实际 token 消耗重新计费（异步差额结算）。
// 当任务成功且返回了 totalTokens 时，根据模型倍率和分组倍率重新计算实际扣费额度，
// 与预扣费的差额进行补扣或退还。支持钱包和订阅计费来源。
func RecalculateTaskQuotaByTokens(ctx context.Context, task *model.Task, totalTokens int) {
	if totalTokens <= 0 {
		return
	}

	modelName := taskModelName(task)

	// 获取模型价格和倍率
	modelRatio, hasRatioSetting, _ := ratio_setting.GetModelRatio(modelName)
	// 只有配置了倍率(非固定价格)时才按 token 重新计费
	if !hasRatioSetting || modelRatio <= 0 {
		return
	}

	// 获取用户和组的倍率信息
	group := task.Group
	if group == "" {
		user, err := model.GetUserById(task.UserId, false)
		if err == nil {
			group = user.Group
		}
	}
	if group == "" {
		return
	}

	groupRatio := ratio_setting.GetGroupRatio(group)
	userGroupRatio, hasUserGroupRatio := ratio_setting.GetGroupGroupRatio(group, group)

	var finalGroupRatio float64
	if hasUserGroupRatio {
		finalGroupRatio = userGroupRatio
	} else {
		finalGroupRatio = groupRatio
	}

	// 计算 OtherRatios 乘积（视频折扣、时长等）
	otherMultiplier := 1.0
	if priceData := taskBillingContextPriceData(task.PrivateData.BillingContext); priceData != nil {
		otherMultiplier = priceData.OtherRatioMultiplier()
	}

	// 计算实际应扣费额度: totalTokens * modelRatio * groupRatio * otherMultiplier（饱和转换，防止溢出成负数）
	actualQuota, clamp := common.QuotaFromFloatChecked(float64(totalTokens) * modelRatio * finalGroupRatio * otherMultiplier)

	reason := fmt.Sprintf("token重算：tokens=%d, modelRatio=%.2f, groupRatio=%.2f, otherMultiplier=%.4f", totalTokens, modelRatio, finalGroupRatio, otherMultiplier)
	RecalculateTaskQuota(ctx, task, actualQuota, reason, clamp)
}
