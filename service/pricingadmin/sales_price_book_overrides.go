package pricingadmin

import (
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/pricingpolicy"
	"gorm.io/gorm"
)

type SalesPriceBookChannelModelOverrideListItem struct {
	model.SalesPriceBookChannelModelOverride
	ChannelName                    string `json:"channel_name"`
	ModelId                        int    `json:"model_id"`
	ModelName                      string `json:"model_name"`
	EffectivePaymentFeeRate        string `json:"effective_payment_fee_rate"`
	EffectiveDistributionFeeRate   string `json:"effective_distribution_fee_rate"`
	EffectiveOperationsLaborRate   string `json:"effective_operations_labor_rate"`
	EffectiveTotalVariableCostRate string `json:"effective_total_variable_cost_rate"`
	EffectiveTaxRateValue          string `json:"effective_tax_rate_value"`
	EffectiveTargetNetMargin       string `json:"effective_target_net_margin"`
	EffectiveMinimumMarginRate     string `json:"effective_minimum_margin_rate"`
}

func ListSalesPriceBookChannelModelOverrides(
	versionId int,
) ([]SalesPriceBookChannelModelOverrideListItem, error) {
	if versionId <= 0 {
		return nil, errors.New("sales price book version is required")
	}
	var version model.SalesPriceBookVersion
	if err := model.DB.First(&version, versionId).Error; err != nil {
		return nil, err
	}
	rows := make([]SalesPriceBookChannelModelOverrideListItem, 0)
	if err := model.DB.Table("sales_price_book_channel_model_overrides AS overrides").
		Select(`overrides.*, channel_models.model_id AS model_id,
			channels.name AS channel_name, models.model_name AS model_name`).
		Joins("JOIN channel_models ON channel_models.id = overrides.channel_model_id").
		Joins("JOIN channels ON channels.id = channel_models.channel_id").
		Joins("JOIN models ON models.id = channel_models.model_id").
		Where("overrides.price_book_version_id = ?", versionId).
		Order("models.model_name ASC, channels.name ASC, overrides.channel_model_id ASC").
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	for index := range rows {
		effective, err := pricingpolicy.Resolve(version, &rows[index].SalesPriceBookChannelModelOverride)
		if err != nil {
			return nil, fmt.Errorf("channel model %d override: %w", rows[index].ChannelModelId, err)
		}
		rows[index].EffectivePaymentFeeRate = effective.PaymentFeeRate
		rows[index].EffectiveDistributionFeeRate = effective.DistributionFeeRate
		rows[index].EffectiveOperationsLaborRate = effective.OperationsLaborRate
		rows[index].EffectiveTotalVariableCostRate = effective.TotalVariableCostRate
		rows[index].EffectiveTaxRateValue = effective.EffectiveTaxRate
		rows[index].EffectiveTargetNetMargin = effective.TargetNetMargin
		rows[index].EffectiveMinimumMarginRate = effective.MinimumMarginRate
	}
	return rows, nil
}

func SaveSalesPriceBookChannelModelOverride(
	versionId int,
	channelModelId int,
	input *model.SalesPriceBookChannelModelOverride,
	userId int,
) (*model.SalesPriceBookChannelModelOverride, error) {
	if versionId <= 0 || channelModelId <= 0 {
		return nil, errors.New("sales price book version and channel model are required")
	}
	if err := pricingpolicy.ValidateOverride(input); err != nil {
		return nil, err
	}
	if !pricingpolicy.HasConfiguredRate(*input) {
		return nil, errors.New("at least one channel model special parameter is required")
	}
	var saved model.SalesPriceBookChannelModelOverride
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		version, err := model.GetSalesPriceBookVersionForUpdate(tx, versionId)
		if err != nil {
			return err
		}
		if version.Status != model.SalesPriceBookVersionStatusDraft {
			return errors.New("only sales price book drafts can edit channel model special parameters")
		}
		var channelModel model.ChannelModel
		if err := tx.Select("id", "model_id").First(&channelModel, channelModelId).Error; err != nil {
			return err
		}
		input.PriceBookVersionId = versionId
		input.ChannelModelId = channelModelId
		effective, err := pricingpolicy.Resolve(version, input)
		if err != nil {
			return err
		}
		if _, err := NewSalesPriceCalculator(
			effective.TotalVariableCostRate,
			effective.EffectiveTaxRate,
			effective.TargetNetMargin,
		); err != nil {
			return err
		}

		var current model.SalesPriceBookChannelModelOverride
		err = tx.Where(
			"price_book_version_id = ? AND channel_model_id = ?",
			versionId, channelModelId,
		).First(&current).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			input.Id = 0
			input.CreatedBy = userId
			input.UpdatedBy = userId
			if err := tx.Create(input).Error; err != nil {
				return err
			}
			saved = *input
		} else if err != nil {
			return err
		} else {
			input.Id = current.Id
			input.CreatedBy = current.CreatedBy
			input.CreatedAt = current.CreatedAt
			input.UpdatedBy = userId
			updates := map[string]any{
				"updated_by": userId,
				"updated_at": common.GetTimestamp(),
				"remark":     input.Remark,
			}
			if input.PaymentFeeRate == nil {
				updates["payment_fee_rate"] = nil
			} else {
				updates["payment_fee_rate"] = *input.PaymentFeeRate
			}
			if input.DistributionFeeRate == nil {
				updates["distribution_fee_rate"] = nil
			} else {
				updates["distribution_fee_rate"] = *input.DistributionFeeRate
			}
			if input.OperationsLaborRate == nil {
				updates["operations_labor_rate"] = nil
			} else {
				updates["operations_labor_rate"] = *input.OperationsLaborRate
			}
			if input.EffectiveTaxRate == nil {
				updates["effective_tax_rate"] = nil
			} else {
				updates["effective_tax_rate"] = *input.EffectiveTaxRate
			}
			if input.TargetNetMargin == nil {
				updates["target_net_margin"] = nil
			} else {
				updates["target_net_margin"] = *input.TargetNetMargin
			}
			if input.MinimumMarginRate == nil {
				updates["minimum_margin_rate"] = nil
			} else {
				updates["minimum_margin_rate"] = *input.MinimumMarginRate
			}
			if err := tx.Model(&model.SalesPriceBookChannelModelOverride{}).
				Where("id = ?", current.Id).
				Updates(updates).Error; err != nil {
				return err
			}
			if err := tx.First(&saved, current.Id).Error; err != nil {
				return err
			}
		}
		if err := invalidateSalesPriceBookItemForPolicyChangeTx(
			tx, version, channelModel.ModelId, channelModelId, userId,
		); err != nil {
			return err
		}
		return tx.Create(&model.PricingAuditRecord{
			ObjectType: "sales_price_book_version",
			ObjectId:   versionId, Action: "save_channel_model_override",
			OperatorId: userId,
			Comment:    fmt.Sprintf("price book version #%d; channel model #%d", versionId, channelModelId),
		}).Error
	})
	if err != nil {
		return nil, err
	}
	return &saved, nil
}

func DeleteSalesPriceBookChannelModelOverride(
	versionId int,
	channelModelId int,
	userId int,
) error {
	if versionId <= 0 || channelModelId <= 0 {
		return errors.New("sales price book version and channel model are required")
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		version, err := model.GetSalesPriceBookVersionForUpdate(tx, versionId)
		if err != nil {
			return err
		}
		if version.Status != model.SalesPriceBookVersionStatusDraft {
			return errors.New("only sales price book drafts can edit channel model special parameters")
		}
		var channelModel model.ChannelModel
		if err := tx.Select("id", "model_id").First(&channelModel, channelModelId).Error; err != nil {
			return err
		}
		var current model.SalesPriceBookChannelModelOverride
		if err := tx.Where(
			"price_book_version_id = ? AND channel_model_id = ?",
			versionId, channelModelId,
		).First(&current).Error; err != nil {
			return err
		}
		if err := tx.Delete(&current).Error; err != nil {
			return err
		}
		if err := invalidateSalesPriceBookItemForPolicyChangeTx(
			tx, version, channelModel.ModelId, channelModelId, userId,
		); err != nil {
			return err
		}
		return tx.Create(&model.PricingAuditRecord{
			ObjectType: "sales_price_book_version",
			ObjectId:   versionId, Action: "delete_channel_model_override",
			OperatorId: userId,
			Comment:    fmt.Sprintf("price book version #%d; channel model #%d", versionId, channelModelId),
		}).Error
	})
}

func invalidateSalesPriceBookItemForPolicyChangeTx(
	tx *gorm.DB,
	version model.SalesPriceBookVersion,
	modelId int,
	channelModelId int,
	userId int,
) error {
	var item model.SalesPriceBookItem
	if err := tx.Where(
		"price_book_version_id = ? AND model_id = ?",
		version.Id, modelId,
	).First(&item).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	// Keep the existing price visible for comparison, but make it impossible to
	// publish until the logical model is regenerated with the updated policy.
	if item.Status == SalesPriceItemStatusReviewRequired {
		if err := closeSalesPriceBookItemReviewTx(
			tx, item, PricingChangeBatchItemStatusRejected,
		); err != nil {
			return err
		}
	}
	itemId := item.Id
	priceBookId := version.PriceBookId
	batch := model.PricingChangeBatch{
		BatchNo: fmt.Sprintf("PB-POLICY-%d-%d", item.Id, time.Now().UnixNano()),
		IdempotencyKey: fmt.Sprintf(
			"channel-model-policy:%d:%d", item.Id, time.Now().UnixNano(),
		),
		TriggerType: "channel_model_policy_change", TriggerId: &channelModelId,
		Status:     PricingChangeBatchStatusReviewRequired,
		TotalCount: 1, ChangedCount: 1, ReviewCount: 1, RequestedBy: userId,
	}
	if err := tx.Create(&batch).Error; err != nil {
		return err
	}
	if err := tx.Create(&model.PricingChangeBatchItem{
		BatchId: batch.Id, TargetType: "sales_price_book_item", TargetId: &itemId,
		ModelId: modelId, ChannelModelId: &channelModelId, PriceBookId: &priceBookId,
		Action: "review", OldExprHash: item.SalesExprHash, NewExprHash: item.SalesExprHash,
		RiskCode: "channel_model_policy_changed", Status: PricingChangeBatchItemStatusReview,
	}).Error; err != nil {
		return err
	}
	return tx.Model(&model.SalesPriceBookItem{}).Where("id = ?", item.Id).
		Updates(map[string]any{
			"status":                SalesPriceItemStatusReviewRequired,
			"generated_by_batch_id": batch.Id,
		}).Error
}
