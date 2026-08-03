package model

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"gorm.io/gorm"
)

const (
	ProviderCostModeEstimated        = "estimated"
	ProviderCostModeResponseReported = "response_reported"
	ProviderCostModeProviderAPI      = "provider_api"
	ProviderCostModeInvoice          = "invoice"
	ProviderCostModeManual           = "manual"

	ProviderCostStatusEstimated  = "estimated"
	ProviderCostStatusPending    = "pending"
	ProviderCostStatusConfirmed  = "confirmed"
	ProviderCostStatusReconciled = "reconciled"
	ProviderCostStatusFailed     = "failed"

	ProviderCostSourceResponse     = "response"
	ProviderCostSourceTaskResponse = "task_response"
	ProviderCostSourceProviderAPI  = "provider_api"
	ProviderCostSourceInvoice      = "invoice"
	ProviderCostSourceManual       = "manual"
	ProviderCostSourceLegacy       = "legacy"
)

func DefaultProviderCostMode(channelType int) string {
	if channelType == constant.ChannelTypeOpenRouter {
		return ProviderCostModeResponseReported
	}
	return ProviderCostModeEstimated
}

func NormalizeProviderCostMode(channelType int, value string) (string, error) {
	mode := strings.TrimSpace(value)
	if mode == "" {
		return DefaultProviderCostMode(channelType), nil
	}
	switch mode {
	case ProviderCostModeEstimated,
		ProviderCostModeResponseReported,
		ProviderCostModeProviderAPI,
		ProviderCostModeInvoice,
		ProviderCostModeManual:
		return mode, nil
	default:
		return "", errors.New("provider cost mode is invalid")
	}
}

func InitialProviderCostStatus(mode string) string {
	if mode == ProviderCostModeEstimated {
		return ProviderCostStatusEstimated
	}
	return ProviderCostStatusPending
}

// BackfillProviderCostTracking freezes cost expectations on legacy channels
// and request snapshots after the new tracking columns have been migrated.
// All updates are idempotent and use portable GORM queries.
func BackfillProviderCostTracking() error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&Channel{}).
			Where("(provider_cost_mode = ? OR provider_cost_mode IS NULL) AND type = ?", "", constant.ChannelTypeOpenRouter).
			Update("provider_cost_mode", ProviderCostModeResponseReported).Error; err != nil {
			return err
		}
		if err := tx.Model(&Channel{}).
			Where("provider_cost_mode = ? OR provider_cost_mode IS NULL", "").
			Update("provider_cost_mode", ProviderCostModeEstimated).Error; err != nil {
			return err
		}

		var modes []string
		if err := tx.Model(&Channel{}).Distinct().Pluck("provider_cost_mode", &modes).Error; err != nil {
			return err
		}
		for _, mode := range modes {
			normalized, err := NormalizeProviderCostMode(0, mode)
			if err != nil {
				return err
			}
			channelIDs := tx.Model(&Channel{}).
				Select("id").
				Where("provider_cost_mode = ?", mode)
			channelModelIDs := tx.Model(&ChannelModel{}).
				Select("id").
				Where("channel_id IN (?)", channelIDs)
			if err := tx.Model(&RequestPricingSnapshot{}).
				Where("(provider_cost_mode = ? OR provider_cost_mode IS NULL) AND channel_model_id IN (?)", "", channelModelIDs).
				Update("provider_cost_mode", normalized).Error; err != nil {
				return err
			}
		}
		if err := tx.Model(&RequestPricingSnapshot{}).
			Where("provider_cost_mode = ? OR provider_cost_mode IS NULL", "").
			Update("provider_cost_mode", ProviderCostModeEstimated).Error; err != nil {
			return err
		}
		if err := tx.Model(&RequestPricingSnapshot{}).
			Where("provider_cost_known = ? AND (provider_cost_status = ? OR provider_cost_status IS NULL)", true, "").
			Updates(map[string]any{
				"provider_cost_status":       ProviderCostStatusConfirmed,
				"provider_cost_source":       ProviderCostSourceLegacy,
				"provider_cost_confirmed_at": gorm.Expr("updated_at"),
			}).Error; err != nil {
			return err
		}
		if err := tx.Model(&RequestPricingSnapshot{}).
			Where("(provider_cost_known = ? OR provider_cost_known IS NULL) AND (provider_cost_status = ? OR provider_cost_status IS NULL) AND provider_cost_mode = ?", false, "", ProviderCostModeEstimated).
			Update("provider_cost_status", ProviderCostStatusEstimated).Error; err != nil {
			return err
		}
		if err := tx.Model(&RequestPricingSnapshot{}).
			Where("(provider_cost_known = ? OR provider_cost_known IS NULL) AND (provider_cost_status = ? OR provider_cost_status IS NULL)", false, "").
			Update("provider_cost_status", ProviderCostStatusPending).Error; err != nil {
			return err
		}
		return nil
	})
}

func ProviderCostRecordedStatus(source string) (string, error) {
	switch source {
	case ProviderCostSourceResponse,
		ProviderCostSourceTaskResponse,
		ProviderCostSourceProviderAPI:
		return ProviderCostStatusConfirmed, nil
	case ProviderCostSourceInvoice, ProviderCostSourceManual:
		return ProviderCostStatusReconciled, nil
	default:
		return "", errors.New("provider cost source is invalid")
	}
}

func normalizeProviderCostSnapshot(snapshot *RequestPricingSnapshot) error {
	mode, err := NormalizeProviderCostMode(0, snapshot.ProviderCostMode)
	if err != nil {
		return err
	}
	snapshot.ProviderCostMode = mode
	if snapshot.ProviderCostKnown {
		if snapshot.ProviderCostStatus == "" {
			snapshot.ProviderCostStatus = ProviderCostStatusConfirmed
		}
		if snapshot.ProviderCostSource == "" {
			snapshot.ProviderCostSource = ProviderCostSourceLegacy
		}
		if snapshot.ProviderCostConfirmedAt == 0 {
			snapshot.ProviderCostConfirmedAt = common.GetTimestamp()
		}
		return nil
	}
	if snapshot.ProviderCostStatus == "" {
		snapshot.ProviderCostStatus = InitialProviderCostStatus(mode)
	}
	return nil
}
