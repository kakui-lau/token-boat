package pricingruntime

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service/pricingengine"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const (
	PricingSnapshotStatusReserved = "reserved"
	PricingSnapshotStatusSettled  = "settled"
	PricingSnapshotStatusPending  = "pending"
	PricingSnapshotStatusRefunded = "refunded"
	PricingSnapshotStatusArchived = "archived"
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
		return errors.New("pricing has no selected candidate")
	}
	if info.RequestId == "" {
		return errors.New("pricing requires a request id")
	}
	estimatedUsage, err := sanitizedPricingUsageJSON(
		info.DynamicPricingSnapshot.EstimatedUsage,
	)
	if err != nil {
		return fmt.Errorf("sanitize estimated pricing usage: %w", err)
	}
	snapshot := model.RequestPricingSnapshot{
		RequestId:               info.RequestId,
		UserId:                  info.UserId,
		ModelId:                 selected.ModelId,
		ChannelModelId:          selected.ChannelModelId,
		PurchasePriceVersionId:  selected.PurchasePriceVersion,
		SalesPriceBookId:        selected.SalesPriceBookId,
		SalesPriceBookVersionId: selected.SalesPriceBookVersionId,
		SalesPriceBookItemId:    selected.SalesPriceBookItemId,
		PriceBookAssignmentId:   selected.PriceBookAssignmentId,
		SalesBillingExpr:        selected.SalesExpression,
		SalesExprHash:           selected.SalesExpressionHash,
		SalesPricingSource:      selected.SalesPricingSource,
		SalesPriceResolvedAt:    common.GetTimestamp(),
		BillingMode:             selected.BillingMode,
		EstimatedUsage:          estimatedUsage,
		ReservedQuota:           int64(info.DynamicPricingSnapshot.ReservationQuota),
		PreConsumeCaptured:      info.Billing != nil,
		TokenId:                 info.TokenId,
		SettledQuota:            0,
		PurchaseCost:            selected.EstimatedPurchaseUSD,
		ProviderCostMode:        selected.ProviderCostMode,
		ProviderCostStatus:      model.InitialProviderCostStatus(selected.ProviderCostMode),
		SalesAmount:             selected.EstimatedSalesUSD,
		BaseSalesAmount:         selected.EstimatedSalesUSD,
		EstimatedCustomerCharge: selected.EstimatedCustomerChargeUSD,
		AppliedGroup:            info.DynamicPricingSnapshot.Group,
		QuotaPerUnit:            decimal.NewFromFloat(info.DynamicPricingSnapshot.QuotaPerUnit).String(),
		TotalVariableCostRate:   selected.TotalVariableCostRate,
		PaymentFeeRate:          selected.PaymentFeeRate,
		DistributionFeeRate:     selected.DistributionFeeRate,
		OperationsLaborRate:     selected.OperationsLaborRate,
		EffectiveTaxRate:        selected.EffectiveTaxRate,
		TargetNetMargin:         selected.TargetNetMargin,
		MinimumMarginRate:       selected.MinimumMarginRate,
		NetMarginRate:           selected.EstimatedNetMarginRate,
		MarginCompliant:         selected.MarginCompliant,
		BillingSource:           info.BillingSource,
		SubscriptionId:          info.SubscriptionId,
		Currency:                selected.Currency,
		Status:                  PricingSnapshotStatusReserved,
	}
	if snapshot.BillingSource == "" && !snapshot.PreConsumeCaptured {
		snapshot.BillingSource = "pending"
	}
	if info.Billing != nil {
		snapshot.ActualPreConsumedQuota = int64(info.Billing.GetPreConsumedQuota())
		if !info.IsPlayground {
			snapshot.TokenPreConsumedQuota = snapshot.ActualPreConsumedQuota
		}
	}
	if err := model.DB.Create(&snapshot).Error; err != nil {
		return err
	}
	info.DynamicPricingSnapshot.AuditCreated = true
	return nil
}

// SyncRequestPricingPreConsume refreshes the durable reservation audit after a
// retry raises the amount held by the billing session. It never infers an
// amount from the estimate: zero is a valid captured value for trusted users.
func SyncRequestPricingPreConsume(info *relaycommon.RelayInfo) error {
	if info == nil || info.DynamicPricingSnapshot == nil || info.RequestId == "" {
		return nil
	}
	actual := int64(0)
	if info.Billing != nil {
		actual = int64(info.Billing.GetPreConsumedQuota())
	}
	tokenActual := actual
	if info.IsPlayground {
		tokenActual = 0
	}
	billingSource := info.BillingSource
	if billingSource == "" {
		billingSource = "none"
	}
	result := model.DB.Model(&model.RequestPricingSnapshot{}).
		Where("request_id = ? AND status IN ?", info.RequestId, []string{
			PricingSnapshotStatusReserved,
			PricingSnapshotStatusPending,
		}).
		Updates(map[string]any{
			"actual_pre_consumed_quota": actual,
			"token_pre_consumed_quota":  tokenActual,
			"pre_consume_captured":      true,
			"token_id":                  info.TokenId,
			"billing_source":            billingSource,
			"subscription_id":           info.SubscriptionId,
			"updated_at":                common.GetTimestamp(),
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errors.New("pricing snapshot was not found or already finalized")
	}
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
		return errors.New("pricing has no selected settlement candidate")
	}
	if usage == nil {
		return errors.New("pricing settlement requires usage")
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
	requestInput := billingexpr.RequestInput{}
	if info.BillingRequestInput != nil {
		requestInput = billingexpr.FreezeRequestInput(*info.BillingRequestInput)
	}
	purchase, err := pricingengine.EvaluateWithRequest(
		selected.PurchaseExpression,
		selected.PurchaseExpressionHash,
		actualUsage,
		requestInput,
	)
	if err != nil {
		markPricingSnapshotPending(info.RequestId, "purchase_evaluation_failed", err.Error())
		return fmt.Errorf("evaluate settled purchase price: %w", err)
	}
	sales, err := pricingengine.EvaluateWithRequest(
		selected.SalesExpression,
		selected.SalesExpressionHash,
		actualUsage,
		requestInput,
	)
	if err != nil {
		markPricingSnapshotPending(info.RequestId, "sales_evaluation_failed", err.Error())
		return fmt.Errorf("evaluate settled sales price: %w", err)
	}
	if settledQuota < 0 {
		err = errors.New("settled quota cannot be negative")
		markPricingSnapshotPending(info.RequestId, "negative_settled_quota", err.Error())
		return err
	}
	quotaPerUnit := decimal.NewFromFloat(info.DynamicPricingSnapshot.QuotaPerUnit)
	if !quotaPerUnit.IsPositive() {
		err = errors.New("frozen quota per unit must be positive")
		markPricingSnapshotPending(info.RequestId, "invalid_quota_per_unit", err.Error())
		return err
	}
	customerCharge := decimal.NewFromInt(int64(settledQuota)).Div(quotaPerUnit)
	variableCostRate, err := parseRate("total variable cost rate", selected.TotalVariableCostRate)
	if err != nil {
		markPricingSnapshotPending(info.RequestId, "variable_cost_rate_invalid", err.Error())
		return err
	}
	taxRate, err := parseRate("effective tax rate", selected.EffectiveTaxRate)
	if err != nil {
		markPricingSnapshotPending(info.RequestId, "effective_tax_rate_invalid", err.Error())
		return err
	}
	minimumMargin, err := parseMargin(selected.MinimumMarginRate)
	if err != nil {
		markPricingSnapshotPending(info.RequestId, "minimum_margin_rate_invalid", err.Error())
		return err
	}
	netMargin := calculateNetMargin(
		purchase.Amount,
		customerCharge,
		variableCostRate,
		taxRate,
	)
	marginCompliant := meetsMinimumMargin(netMargin, minimumMargin)
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
			"billing_mode":              selected.BillingMode,
			"actual_usage":              string(usageJSON),
			"settled_quota":             int64(settledQuota),
			"purchase_cost":             purchase.Amount.String(),
			"sales_amount":              sales.Amount.String(),
			"base_sales_amount":         sales.Amount.String(),
			"customer_charge":           customerCharge.String(),
			"applied_group":             info.DynamicPricingSnapshot.Group,
			"quota_per_unit":            quotaPerUnit.String(),
			"total_variable_cost_rate":  variableCostRate.String(),
			"effective_tax_rate":        taxRate.String(),
			"minimum_margin_rate":       minimumMargin.String(),
			"net_margin_rate":           netMargin.String(),
			"margin_compliant":          marginCompliant,
			"currency":                  selected.Currency,
			"status":                    PricingSnapshotStatusSettled,
			"updated_at":                common.GetTimestamp(),
		})
	if result.Error != nil {
		markPricingSnapshotPending(info.RequestId, "snapshot_update_failed", result.Error.Error())
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errors.New("pricing snapshot was not found or already settled")
	}
	return nil
}

func RecordProviderReportedCost(
	requestId string,
	providerCost decimal.Decimal,
	scope string,
) error {
	return RecordProviderReportedCostWithSource(
		requestId,
		providerCost,
		scope,
		model.ProviderCostSourceManual,
	)
}

func RecordProviderReportedCostWithSource(
	requestId string,
	providerCost decimal.Decimal,
	scope string,
	source string,
) error {
	requestId = strings.TrimSpace(requestId)
	if requestId == "" {
		return errors.New("request id is required")
	}
	if providerCost.IsNegative() {
		return errors.New("provider reported cost cannot be negative")
	}
	switch scope {
	case "full_provider_cost", "platform_fee_only":
	default:
		return errors.New("provider cost scope is invalid")
	}
	providerCostStatus, err := model.ProviderCostRecordedStatus(source)
	if err != nil {
		return err
	}
	var snapshot model.RequestPricingSnapshot
	if err := model.DB.Where("request_id = ?", requestId).First(&snapshot).Error; err != nil {
		return err
	}
	if snapshot.Status != PricingSnapshotStatusSettled &&
		snapshot.Status != PricingSnapshotStatusRefunded {
		return errors.New("provider cost can only be recorded for a finalized snapshot")
	}
	if snapshot.ProviderCostKnown {
		existing, err := decimal.NewFromString(snapshot.ProviderReportedCost)
		if err != nil {
			return err
		}
		if existing.Equal(providerCost) && snapshot.ProviderCostScope == scope {
			return nil
		}
		return errors.New("provider reported cost was already recorded")
	}
	estimated, err := decimal.NewFromString(snapshot.PurchaseCost)
	if err != nil {
		return fmt.Errorf("parse estimated purchase cost: %w", err)
	}
	variance := providerCost.Sub(estimated)
	updates := map[string]any{
		"provider_reported_cost":     providerCost.String(),
		"provider_cost_known":        true,
		"provider_cost_scope":        scope,
		"provider_cost_status":       providerCostStatus,
		"provider_cost_source":       source,
		"provider_cost_confirmed_at": common.GetTimestamp(),
		"cost_variance":              variance.String(),
		"updated_at":                 common.GetTimestamp(),
	}
	if scope == "full_provider_cost" && snapshot.BillingSource == "wallet" {
		if snapshot.Status == PricingSnapshotStatusRefunded {
			updates["gross_margin"] = providerCost.Neg().String()
			updates["gross_margin_known"] = true
			updates["margin_compliant"] = false
		} else if snapshot.CustomerCharge != nil {
			customerCharge, err := decimal.NewFromString(*snapshot.CustomerCharge)
			if err != nil {
				return fmt.Errorf("parse customer charge: %w", err)
			}
			variableCostRate, err := parseRate(
				"total variable cost rate",
				snapshot.TotalVariableCostRate,
			)
			if err != nil {
				return err
			}
			taxRate, err := parseRate("effective tax rate", snapshot.EffectiveTaxRate)
			if err != nil {
				return err
			}
			minimumMargin, err := parseMargin(snapshot.MinimumMarginRate)
			if err != nil {
				return err
			}
			netMargin := calculateNetMargin(
				providerCost,
				customerCharge,
				variableCostRate,
				taxRate,
			)
			updates["gross_margin"] = customerCharge.Sub(providerCost).String()
			updates["gross_margin_known"] = true
			updates["net_margin_rate"] = netMargin.String()
			updates["margin_compliant"] = meetsMinimumMargin(netMargin, minimumMargin)
		}
	}
	result := model.DB.Model(&model.RequestPricingSnapshot{}).
		Where(
			"request_id = ? AND status IN ? AND (provider_cost_known = ? OR provider_cost_known IS NULL)",
			requestId,
			[]string{PricingSnapshotStatusSettled, PricingSnapshotStatusRefunded},
			false,
		).
		Updates(updates)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 1 {
		return nil
	}
	return errors.New("provider reported cost changed concurrently")
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

// PurgeFinalizedRequestPricingSnapshots deletes one bounded batch of old,
// completed audit rows. Active and anomalous rows are deliberately excluded.
func PurgeFinalizedRequestPricingSnapshots(cutoff int64, batchSize int) (int64, error) {
	if cutoff <= 0 || batchSize <= 0 {
		return 0, errors.New("pricing snapshot retention boundary is invalid")
	}
	statuses := []string{
		PricingSnapshotStatusSettled,
		PricingSnapshotStatusRefunded,
		PricingSnapshotStatusArchived,
	}
	var ids []int
	if err := model.DB.Model(&model.RequestPricingSnapshot{}).
		Where("created_at < ? AND status IN ?", cutoff, statuses).
		Order("id ASC").
		Limit(batchSize).
		Pluck("id", &ids).Error; err != nil {
		return 0, err
	}
	if len(ids) == 0 {
		return 0, nil
	}
	result := model.DB.
		Where("id IN ? AND created_at < ? AND status IN ?", ids, cutoff, statuses).
		Delete(&model.RequestPricingSnapshot{})
	return result.RowsAffected, result.Error
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
			PricingSnapshotStatusSettled,
		}).
		Updates(map[string]any{
			"settled_quota":    0,
			"customer_charge":  "0",
			"net_margin_rate":  nil,
			"margin_compliant": false,
			"gross_margin": gorm.Expr(
				"CASE WHEN billing_source = ? AND provider_cost_known = ? AND provider_cost_scope = ? THEN -provider_reported_cost ELSE 0 END",
				"wallet",
				true,
				"full_provider_cost",
			),
			"gross_margin_known": gorm.Expr(
				"billing_source = ? AND provider_cost_known = ? AND provider_cost_scope = ?",
				"wallet",
				true,
				"full_provider_cost",
			),
			"status":      PricingSnapshotStatusRefunded,
			"resolution":  "automatic_refund",
			"resolved_at": common.GetTimestamp(),
			"updated_at":  common.GetTimestamp(),
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 1 {
		return nil
	}
	var status string
	if err := model.DB.Model(&model.RequestPricingSnapshot{}).
		Where("request_id = ?", requestId).
		Pluck("status", &status).Error; err != nil {
		return err
	}
	if status == PricingSnapshotStatusRefunded {
		return nil
	}
	return errors.New("pricing snapshot was not found or cannot be refunded")
}

func ReconcileStaleRequestPricingSnapshots(staleBefore int64) (int64, error) {
	if staleBefore <= 0 {
		return 0, errors.New("stale cutoff is required")
	}
	captured := model.DB.Model(&model.RequestPricingSnapshot{}).
		Where(
			"status = ? AND created_at <= ? AND pre_consume_captured = ?",
			PricingSnapshotStatusReserved,
			staleBefore,
			true,
		).
		Updates(map[string]any{
			"status":         PricingSnapshotStatusPending,
			"failure_code":   "stale_reservation",
			"failure_reason": "captured reservation exceeded the reconciliation grace period",
			"updated_at":     common.GetTimestamp(),
		})
	if captured.Error != nil {
		return 0, captured.Error
	}
	uncaptured := model.DB.Model(&model.RequestPricingSnapshot{}).
		Where(
			"status = ? AND created_at <= ? AND (pre_consume_captured = ? OR pre_consume_captured IS NULL)",
			PricingSnapshotStatusReserved,
			staleBefore,
			false,
		).
		Updates(map[string]any{
			"status":         PricingSnapshotStatusPending,
			"failure_code":   "preconsume_capture_missing",
			"failure_reason": "reservation intent exists but the actual pre-consume result was not durably captured",
			"updated_at":     common.GetTimestamp(),
		})
	return captured.RowsAffected + uncaptured.RowsAffected, uncaptured.Error
}

type PricingReconciliationClassification struct {
	NoChargeFinalized int64
	LegacyArchived    int64
}

// ClassifyStalePendingPricingSnapshots only closes cases that cannot move
// money. Captured zero reservations are known to have charged nothing. Legacy
// snapshots are archived as evidence-incomplete and are never treated as
// refunds. Positive captured reservations remain pending for explicit review.
func ClassifyStalePendingPricingSnapshots(staleBefore int64) (PricingReconciliationClassification, error) {
	result := PricingReconciliationClassification{}
	if staleBefore <= 0 {
		return result, errors.New("stale cutoff is required")
	}
	now := common.GetTimestamp()
	noCharge := model.DB.Model(&model.RequestPricingSnapshot{}).
		Where(
			"status = ? AND created_at <= ? AND pre_consume_captured = ? AND actual_pre_consumed_quota = 0 AND token_pre_consumed_quota = 0",
			PricingSnapshotStatusPending,
			staleBefore,
			true,
		).
		Updates(map[string]any{
			"status":      PricingSnapshotStatusRefunded,
			"resolution":  "automatic_no_charge",
			"resolved_at": now,
			"updated_at":  now,
		})
	if noCharge.Error != nil {
		return result, noCharge.Error
	}
	result.NoChargeFinalized = noCharge.RowsAffected
	legacy := model.DB.Model(&model.RequestPricingSnapshot{}).
		Where(
			"status = ? AND created_at <= ? AND failure_code = ? AND (pre_consume_captured = ? OR pre_consume_captured IS NULL)",
			PricingSnapshotStatusPending,
			staleBefore,
			"legacy_preconsume_unknown",
			false,
		).
		Updates(map[string]any{
			"status":         PricingSnapshotStatusArchived,
			"failure_code":   "legacy_preconsume_unknown",
			"failure_reason": "archived without balance adjustment because actual pre-consume evidence is unavailable",
			"resolution":     "legacy_evidence_unavailable",
			"resolved_at":    now,
			"updated_at":     now,
		})
	if legacy.Error != nil {
		return result, legacy.Error
	}
	result.LegacyArchived = legacy.RowsAffected
	return result, nil
}
