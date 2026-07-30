package pricingruntime

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service/pricingengine"
)

const (
	PricingSnapshotStatusReserved = "reserved"
	PricingSnapshotStatusSettled  = "settled"
	PricingSnapshotStatusPending  = "pending"
	PricingSnapshotStatusRefunded = "refunded"
)

func sanitizedPricingUsageJSON(rawUsage string) (string, error) {
	var usage pricingengine.Usage
	if err := common.UnmarshalJsonStr(rawUsage, &usage); err != nil {
		return "", err
	}
	usage.RequestBody = ""
	data, err := common.Marshal(usage)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func CreateRequestPricingSnapshot(info *relaycommon.RelayInfo) error {
	if info == nil || info.DynamicPricingSnapshot == nil {
		return nil
	}
	selected := info.DynamicPricingSnapshot.Selected
	if selected == nil {
		return errors.New("v2 pricing has no selected candidate")
	}
	if info.RequestId == "" {
		return errors.New("v2 pricing requires a request id")
	}
	estimatedUsage, err := sanitizedPricingUsageJSON(
		info.DynamicPricingSnapshot.EstimatedUsage,
	)
	if err != nil {
		return fmt.Errorf("sanitize estimated pricing usage: %w", err)
	}
	snapshot := model.RequestPricingSnapshot{
		RequestId:              info.RequestId,
		UserId:                 info.UserId,
		ModelId:                selected.ModelId,
		ChannelModelId:         selected.ChannelModelId,
		PurchasePriceVersionId: selected.PurchasePriceVersion,
		RetailPriceVersionId:   selected.RetailPriceVersion,
		BillingMode:            selected.BillingMode,
		EstimatedUsage:         estimatedUsage,
		ReservedQuota:          int64(info.DynamicPricingSnapshot.ReservationQuota),
		SettledQuota:           0,
		PurchaseCost:           selected.EstimatedPurchaseUSD,
		RetailAmount:           selected.EstimatedRetailUSD,
		Currency:               selected.Currency,
		Status:                 PricingSnapshotStatusReserved,
	}
	if err := model.DB.Create(&snapshot).Error; err != nil {
		return err
	}
	info.DynamicPricingSnapshot.AuditCreated = true
	return nil
}

func SettleRequestPricingSnapshot(
	info *relaycommon.RelayInfo,
	usage *dto.Usage,
	settledQuota int,
) error {
	if info == nil || info.DynamicPricingSnapshot == nil {
		return nil
	}
	selected := info.DynamicPricingSnapshot.Selected
	if selected == nil {
		return errors.New("v2 pricing has no selected settlement candidate")
	}
	if usage == nil {
		return errors.New("v2 pricing settlement requires usage")
	}
	var actualUsage pricingengine.Usage
	if err := common.UnmarshalJsonStr(
		info.DynamicPricingSnapshot.EstimatedUsage,
		&actualUsage,
	); err != nil {
		markPricingSnapshotPending(info.RequestId, "usage_decode_failed", err.Error())
		return fmt.Errorf("decode estimated business usage: %w", err)
	}
	actualUsage.PromptTokens = float64(usage.PromptTokens)
	actualUsage.CompletionTokens = float64(usage.CompletionTokens)
	actualUsage.CacheReadTokens = float64(usage.PromptTokensDetails.CachedTokens)
	actualUsage.CacheWriteTokens = float64(usage.PromptTokensDetails.CacheCreationTokensTotal())
	actualUsage.ImageInputTokens = float64(usage.PromptTokensDetails.ImageTokens)
	actualUsage.ImageOutputTokens = float64(usage.CompletionTokenDetails.ImageTokens)
	actualUsage.AudioInputTokens = float64(usage.PromptTokensDetails.AudioTokens)
	actualUsage.AudioOutputTokens = float64(usage.CompletionTokenDetails.AudioTokens)
	actualUsage.UsageSemantic = usage.UsageSemantic
	if info.BillingRequestInput != nil {
		actualUsage.RequestBody = string(info.BillingRequestInput.Body)
	}
	purchase, err := pricingengine.Evaluate(
		selected.PurchaseExpression,
		selected.PurchaseExpressionHash,
		actualUsage,
	)
	if err != nil {
		markPricingSnapshotPending(info.RequestId, "purchase_evaluation_failed", err.Error())
		return fmt.Errorf("evaluate settled purchase price: %w", err)
	}
	retail, err := pricingengine.Evaluate(
		selected.RetailExpression,
		selected.RetailExpressionHash,
		actualUsage,
	)
	if err != nil {
		markPricingSnapshotPending(info.RequestId, "retail_evaluation_failed", err.Error())
		return fmt.Errorf("evaluate settled retail price: %w", err)
	}
	actualUsage.RequestBody = ""
	usageJSON, err := common.Marshal(actualUsage)
	if err != nil {
		markPricingSnapshotPending(info.RequestId, "actual_usage_encode_failed", err.Error())
		return err
	}
	result := model.DB.Model(&model.RequestPricingSnapshot{}).
		Where("request_id = ? AND status IN ?", info.RequestId, []string{
			PricingSnapshotStatusReserved,
			PricingSnapshotStatusPending,
		}).
		Updates(map[string]any{
			"channel_model_id":          selected.ChannelModelId,
			"purchase_price_version_id": selected.PurchasePriceVersion,
			"retail_price_version_id":   selected.RetailPriceVersion,
			"billing_mode":              selected.BillingMode,
			"actual_usage":              string(usageJSON),
			"settled_quota":             int64(settledQuota),
			"purchase_cost":             purchase.Amount.String(),
			"retail_amount":             retail.Amount.String(),
			"currency":                  selected.Currency,
			"status":                    PricingSnapshotStatusSettled,
			"updated_at":                common.GetTimestamp(),
		})
	if result.Error != nil {
		markPricingSnapshotPending(info.RequestId, "snapshot_update_failed", result.Error.Error())
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errors.New("v2 pricing snapshot was not found or already settled")
	}
	return nil
}

func markPricingSnapshotPending(requestId string, failureCode string, failureReason string) {
	if requestId == "" {
		return
	}
	reasonRunes := []rune(failureReason)
	if len(reasonRunes) > 1000 {
		failureReason = string(reasonRunes[:1000])
	}
	_ = model.DB.Model(&model.RequestPricingSnapshot{}).
		Where("request_id = ? AND status = ?", requestId, PricingSnapshotStatusReserved).
		Updates(map[string]any{
			"status":         PricingSnapshotStatusPending,
			"failure_code":   failureCode,
			"failure_reason": failureReason,
			"updated_at":     common.GetTimestamp(),
		}).Error
}

func MarkRequestPricingPending(requestId string) {
	markPricingSnapshotPending(requestId, "settlement_failed", "pricing settlement requires reconciliation")
}

func MarkRequestPricingPendingWithReason(requestId string, failureCode string, failureReason string) {
	markPricingSnapshotPending(requestId, failureCode, failureReason)
}

func MarkRequestPricingRefunded(requestId string) error {
	if requestId == "" {
		return errors.New("request id is required")
	}
	result := model.DB.Model(&model.RequestPricingSnapshot{}).
		Where("request_id = ? AND status IN ?", requestId, []string{
			PricingSnapshotStatusReserved,
			PricingSnapshotStatusPending,
		}).
		Updates(map[string]any{
			"settled_quota": 0,
			"status":        PricingSnapshotStatusRefunded,
			"resolution":    "automatic_refund",
			"resolved_at":   common.GetTimestamp(),
			"updated_at":    common.GetTimestamp(),
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errors.New("v2 pricing snapshot was not found or already finalized")
	}
	return nil
}

func ReconcileStaleRequestPricingSnapshots(staleBefore int64) (int64, error) {
	if staleBefore <= 0 {
		return 0, errors.New("stale cutoff is required")
	}
	result := model.DB.Model(&model.RequestPricingSnapshot{}).
		Where(
			"status = ? AND created_at <= ?",
			PricingSnapshotStatusReserved,
			staleBefore,
		).
		Updates(map[string]any{
			"status":     PricingSnapshotStatusPending,
			"updated_at": common.GetTimestamp(),
		})
	return result.RowsAffected, result.Error
}
