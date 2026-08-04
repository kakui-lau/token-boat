package service

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const financeAlertScanInterval = 5 * time.Minute

type FinanceAlertScanResult struct {
	NegativeBalanceCount int64 `json:"negative_balance_count"`
	StalePendingCount    int64 `json:"stale_pending_count"`
	IncompleteOrderCount int64 `json:"incomplete_order_count"`
	StaleCallbackCount   int64 `json:"stale_callback_count"`
}

type financeAlertHandler struct{}

func (financeAlertHandler) Type() string { return model.SystemTaskTypeFinanceAlertScan }

func (financeAlertHandler) Enabled() bool { return true }

func (financeAlertHandler) Interval() time.Duration { return financeAlertScanInterval }

func (financeAlertHandler) NewPayload() any { return nil }

func (financeAlertHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	result, err := ScanFinanceAlerts(ctx)
	if err != nil {
		failSystemTask(task, runnerID, err)
		return
	}
	if err := model.FinishSystemTask(task.TaskID, runnerID, model.SystemTaskStatusSucceeded, result, ""); err != nil {
		logSystemTaskLockError(ctx, task, err)
	}
}

func ScanFinanceAlerts(ctx context.Context) (*FinanceAlertScanResult, error) {
	result := &FinanceAlertScanResult{}
	now := common.GetTimestamp()

	callbackCutoff := now - int64((5*time.Minute)/time.Second)
	var staleCallbacks []model.PaymentCallbackEvent
	if err := model.DB.WithContext(ctx).
		Where("processing_status = ? AND received_at > 0 AND received_at <= ?", model.PaymentCallbackStatusReceived, callbackCutoff).
		Order("id ASC").Find(&staleCallbacks).Error; err != nil {
		return nil, err
	}
	for index := range staleCallbacks {
		callback := &staleCallbacks[index]
		message := "callback processing did not finish before the audit timeout"
		update := model.DB.WithContext(ctx).Model(&model.PaymentCallbackEvent{}).
			Where("id = ? AND processing_status = ?", callback.ID, model.PaymentCallbackStatusReceived).
			Updates(map[string]any{
				"processing_status": model.PaymentCallbackStatusFailed,
				"error_message":     message,
				"completed_at":      now,
			})
		if update.Error != nil {
			return nil, update.Error
		}
		if update.RowsAffected == 0 {
			continue
		}
		details, _ := common.Marshal(map[string]any{
			"callback_event_id": callback.ID,
			"provider":          callback.Provider,
			"provider_event_id": callback.EventID,
			"trade_no":          callback.TradeNo,
			"http_status":       callback.HTTPStatus,
		})
		if _, err := model.UpsertFinanceAlert(model.FinanceAlertInput{
			Fingerprint: "stale_payment_callback:" + strconv.FormatInt(callback.ID, 10),
			Code:        model.FinanceAlertCodeCallbackFailed,
			Source:      model.FinanceAlertSourceCallback,
			Severity:    model.FinanceAlertSeverityCritical,
			Title:       "Payment callback processing failed",
			Message:     fmt.Sprintf("Provider %s callback processing did not complete.", callback.Provider),
			EntityType:  "payment_callback_event",
			EntityID:    strconv.FormatInt(callback.ID, 10),
			Details:     string(details),
		}); err != nil {
			return nil, err
		}
		result.StaleCallbackCount++
	}

	var negativeUsers []struct {
		ID       int
		Username string
		Quota    int
	}
	if err := model.DB.WithContext(ctx).Model(&model.User{}).
		Select("id, username, quota").Where("quota < 0").Find(&negativeUsers).Error; err != nil {
		return nil, err
	}
	activeBalanceAlerts := make(map[string]struct{}, len(negativeUsers))
	for _, user := range negativeUsers {
		fingerprint := "negative_wallet:user:" + strconv.Itoa(user.ID)
		activeBalanceAlerts[fingerprint] = struct{}{}
		details, _ := common.Marshal(map[string]any{"user_id": user.ID, "username": user.Username, "quota": user.Quota})
		if _, err := model.UpsertFinanceAlert(model.FinanceAlertInput{
			Fingerprint: fingerprint,
			Code:        model.FinanceAlertCodeNegativeWallet,
			Source:      model.FinanceAlertSourceBalance,
			Severity:    model.FinanceAlertSeverityCritical,
			Title:       "Negative user wallet balance",
			Message:     fmt.Sprintf("User %s (#%d) has a negative wallet balance.", user.Username, user.ID),
			EntityType:  "user",
			EntityID:    strconv.Itoa(user.ID),
			Details:     string(details),
		}); err != nil {
			return nil, err
		}
	}
	result.NegativeBalanceCount = int64(len(negativeUsers))
	if err := model.ResolveMissingFinanceAlerts(model.FinanceAlertSourceBalance, activeBalanceAlerts, "Automatically resolved after the wallet balance returned to a non-negative value."); err != nil {
		return nil, err
	}

	cutoff := now - int64((24*time.Hour)/time.Second)
	var staleOrders []model.TopUp
	if err := model.DB.WithContext(ctx).Where("status = ? AND create_time > 0 AND create_time <= ?", common.TopUpStatusPending, cutoff).
		Order("id ASC").Find(&staleOrders).Error; err != nil {
		return nil, err
	}
	activeOrderAlerts := make(map[string]struct{}, len(staleOrders))
	for _, order := range staleOrders {
		fingerprint := "stale_pending_order:" + order.TradeNo
		activeOrderAlerts[fingerprint] = struct{}{}
		details, _ := common.Marshal(map[string]any{"trade_no": order.TradeNo, "user_id": order.UserId, "provider": order.PaymentProvider, "create_time": order.CreateTime})
		if _, err := model.UpsertFinanceAlert(model.FinanceAlertInput{
			Fingerprint: fingerprint,
			Code:        model.FinanceAlertCodeStalePendingOrder,
			Source:      model.FinanceAlertSourceOrder,
			Severity:    model.FinanceAlertSeverityWarning,
			Title:       "Recharge order remained pending for over 24 hours",
			Message:     fmt.Sprintf("Recharge order %s is still pending after its expected expiry window.", order.TradeNo),
			EntityType:  "topup",
			EntityID:    order.TradeNo,
			Details:     string(details),
		}); err != nil {
			return nil, err
		}
	}
	result.StalePendingCount = int64(len(staleOrders))

	var incompleteOrders []model.TopUp
	if err := model.DB.WithContext(ctx).Where("status = ? AND complete_time = 0", common.TopUpStatusSuccess).
		Order("id ASC").Find(&incompleteOrders).Error; err != nil {
		return nil, err
	}
	for _, order := range incompleteOrders {
		fingerprint := "success_missing_completion:" + order.TradeNo
		activeOrderAlerts[fingerprint] = struct{}{}
		details, _ := common.Marshal(map[string]any{"trade_no": order.TradeNo, "user_id": order.UserId, "provider": order.PaymentProvider})
		if _, err := model.UpsertFinanceAlert(model.FinanceAlertInput{
			Fingerprint: fingerprint,
			Code:        model.FinanceAlertCodeMissingCompletionTime,
			Source:      model.FinanceAlertSourceOrder,
			Severity:    model.FinanceAlertSeverityWarning,
			Title:       "Completed recharge order is missing completion time",
			Message:     fmt.Sprintf("Recharge order %s is successful but has no completion timestamp.", order.TradeNo),
			EntityType:  "topup",
			EntityID:    order.TradeNo,
			Details:     string(details),
		}); err != nil {
			return nil, err
		}
	}
	result.IncompleteOrderCount = int64(len(incompleteOrders))
	if err := model.ResolveMissingFinanceAlerts(model.FinanceAlertSourceOrder, activeOrderAlerts, "Automatically resolved after the recharge order returned to a consistent state."); err != nil {
		return nil, err
	}
	return result, nil
}

func init() {
	RegisterSystemTaskHandler(financeAlertHandler{})
}
