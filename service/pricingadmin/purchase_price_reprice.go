package pricingadmin

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
)

const PurchasePriceTriggerOfficialPricePublished = "official_price_publish"

type PurchasePriceAutoDraftResult struct {
	BatchId                int    `json:"batch_id"`
	ChannelModelId         int    `json:"channel_model_id"`
	PurchasePriceVersionId int    `json:"purchase_price_version_id"`
	Status                 string `json:"status"`
	ErrorMessage           string `json:"error_message"`
}

func RetryPurchaseDraftsForOfficialPrice(
	officialPriceVersionId int,
	userId int,
) ([]PurchasePriceAutoDraftResult, error) {
	idempotencyKey := fmt.Sprintf("auto-official-%d-purchase-drafts", officialPriceVersionId)
	if err := resetPurchaseReviewRequiredChangeBatch(idempotencyKey); err != nil {
		return nil, err
	}
	return AutoCreatePurchaseDraftsForOfficialPrice(officialPriceVersionId, userId)
}

func resetPurchaseReviewRequiredChangeBatch(idempotencyKey string) error {
	return model.DB.Transaction(func(tx *gorm.DB) error {
		var batch model.PricingChangeBatch
		err := tx.First(&batch, "idempotency_key = ?", idempotencyKey).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		if err != nil {
			return err
		}
		if batch.Status != PricingChangeBatchStatusReviewRequired {
			return nil
		}
		var draftIds []int
		if err := tx.Model(&model.PricingChangeBatchItem{}).
			Where("batch_id = ? AND target_type = ? AND action = ? AND new_version_id IS NOT NULL",
				batch.Id, "purchase_price_version", "create_draft").
			Pluck("new_version_id", &draftIds).Error; err != nil {
			return err
		}
		if len(draftIds) > 0 {
			if err := tx.Where("id IN ? AND status = ?", draftIds, model.PricingVersionStatusDraft).
				Delete(&model.ChannelModelPurchasePriceVersion{}).Error; err != nil {
				return err
			}
		}
		if err := tx.Where("batch_id = ?", batch.Id).
			Delete(&model.PricingChangeBatchItem{}).Error; err != nil {
			return err
		}
		if err := tx.Where("object_type = ? AND object_id = ?",
			"pricing_change_batch", batch.Id).Delete(&model.PricingAuditRecord{}).Error; err != nil {
			return err
		}
		return tx.Delete(&model.PricingChangeBatch{}, batch.Id).Error
	})
}

func AutoCreatePurchaseDraftsForOfficialPrice(
	officialPriceVersionId int,
	userId int,
) ([]PurchasePriceAutoDraftResult, error) {
	if officialPriceVersionId <= 0 {
		return nil, errors.New("official price version is required")
	}
	var official model.OfficialModelPriceVersion
	if err := model.DB.First(&official, officialPriceVersionId).Error; err != nil {
		return nil, err
	}
	if official.Status != model.PricingVersionStatusActive {
		return nil, errors.New("only an active official price can refresh purchase drafts")
	}
	var active []model.ChannelModelPurchasePriceVersion
	if err := model.DB.Table("channel_model_purchase_price_versions AS purchase").
		Select("purchase.*").
		Joins("JOIN channel_models ON channel_models.id = purchase.channel_model_id").
		Where("channel_models.model_id = ?", official.ModelId).
		Where("purchase.status = ?", model.PricingVersionStatusActive).
		Where("purchase.pricing_mode IN ?", []string{"official_ratio", "component_ratio"}).
		Where("purchase.official_price_version_id <> ?", officialPriceVersionId).
		Order("purchase.channel_model_id ASC").
		Scan(&active).Error; err != nil {
		return nil, err
	}
	idempotencyKey := fmt.Sprintf("auto-official-%d-purchase-drafts", officialPriceVersionId)
	var existing model.PricingChangeBatch
	err := model.DB.First(&existing, "idempotency_key = ?", idempotencyKey).Error
	if err == nil {
		var itemCount int64
		if err := model.DB.Model(&model.PricingChangeBatchItem{}).
			Where("batch_id = ?", existing.Id).Count(&itemCount).Error; err != nil {
			return nil, err
		}
		if existing.TotalCount == len(active) && itemCount == int64(len(active)) {
			return purchaseDraftResultsForBatch(existing.Id)
		}
		if err := resetIncompletePurchaseDraftBatch(existing.Id); err != nil {
			return nil, err
		}
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	scope, err := common.Marshal(map[string]any{
		"official_price_version_id": officialPriceVersionId,
		"model_id":                  official.ModelId,
	})
	if err != nil {
		return nil, err
	}
	triggerId := officialPriceVersionId
	batch := model.PricingChangeBatch{
		BatchNo:        fmt.Sprintf("OP-%d-PURCHASE", officialPriceVersionId),
		IdempotencyKey: idempotencyKey, TriggerType: PurchasePriceTriggerOfficialPricePublished,
		TriggerId: &triggerId, Status: PricingChangeBatchStatusCompleted,
		ScopeSpec: string(scope), RequestedBy: userId,
	}
	if err := model.DB.Create(&batch).Error; err != nil {
		return nil, err
	}
	results := make([]PurchasePriceAutoDraftResult, 0, len(active))
	createdDraftIds := make([]int, 0, len(active))
	completed := false
	defer func() {
		if completed {
			return
		}
		_ = cleanupFailedPurchaseDraftBatch(batch.Id, createdDraftIds)
	}()
	for _, current := range active {
		batch.TotalCount++
		input, err := purchaseDraftInputForOfficialRefresh(current, officialPriceVersionId)
		if err != nil {
			result, itemErr := recordPurchaseDraftRefreshFailure(batch.Id, current, official.ModelId, err)
			if itemErr != nil {
				return nil, itemErr
			}
			results = append(results, result)
			batch.ReviewCount++
			batch.Status = PricingChangeBatchStatusReviewRequired
			continue
		}
		var existingDraft model.ChannelModelPurchasePriceVersion
		err = model.DB.First(
			&existingDraft,
			"channel_model_id = ? AND official_price_version_id = ? AND status = ?",
			current.ChannelModelId, officialPriceVersionId, model.PricingVersionStatusDraft,
		).Error
		if err == nil {
			oldId, newId, channelModelId := current.Id, existingDraft.Id, current.ChannelModelId
			if err := model.DB.Create(&model.PricingChangeBatchItem{
				BatchId: batch.Id, TargetType: "purchase_price_version", TargetId: &newId,
				ModelId: official.ModelId, ChannelModelId: &channelModelId,
				Action: "unchanged", OldVersionId: &oldId, NewVersionId: &newId,
				OldExprHash: current.PurchaseExprHash, NewExprHash: existingDraft.PurchaseExprHash,
				Status: PricingChangeBatchItemStatusUnchanged,
			}).Error; err != nil {
				return nil, err
			}
			results = append(results, PurchasePriceAutoDraftResult{
				BatchId: batch.Id, ChannelModelId: current.ChannelModelId,
				PurchasePriceVersionId: existingDraft.Id, Status: "unchanged",
			})
			batch.UnchangedCount++
			continue
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		draft, err := CreatePurchaseDraft(input, userId)
		if err != nil {
			result, itemErr := recordPurchaseDraftRefreshFailure(batch.Id, current, official.ModelId, err)
			if itemErr != nil {
				return nil, itemErr
			}
			results = append(results, result)
			batch.ReviewCount++
			batch.Status = PricingChangeBatchStatusReviewRequired
			continue
		}
		createdDraftIds = append(createdDraftIds, draft.Id)
		oldCost, oldCostErr := referenceBillingAmount(current.PurchaseBillingExpr, current.BillingMode)
		newCost, newCostErr := referenceBillingAmount(draft.PurchaseBillingExpr, draft.BillingMode)
		if oldCostErr != nil || newCostErr != nil {
			return nil, errors.New("generated purchase draft reference price cannot be evaluated")
		}
		oldId, newId, channelModelId := current.Id, draft.Id, current.ChannelModelId
		detail, err := common.Marshal(map[string]any{
			"old_official_price_version_id": current.OfficialPriceVersionId,
			"new_official_price_version_id": officialPriceVersionId,
			"pricing_mode":                  current.PricingMode,
			"purchase_discount":             current.PurchaseDiscount,
		})
		if err != nil {
			return nil, err
		}
		if err := model.DB.Create(&model.PricingChangeBatchItem{
			BatchId: batch.Id, TargetType: "purchase_price_version", TargetId: &newId,
			ModelId: official.ModelId, ChannelModelId: &channelModelId,
			Action: "create_draft", OldVersionId: &oldId, NewVersionId: &newId,
			OldExprHash: current.PurchaseExprHash, NewExprHash: draft.PurchaseExprHash,
			OldReferenceCost: oldCost.String(), NewReferenceCost: newCost.String(),
			Status: PricingChangeBatchItemStatusGenerated, DiffDetail: string(detail),
		}).Error; err != nil {
			return nil, err
		}
		batch.ChangedCount++
		results = append(results, PurchasePriceAutoDraftResult{
			BatchId: batch.Id, ChannelModelId: current.ChannelModelId,
			PurchasePriceVersionId: draft.Id, Status: PricingChangeBatchItemStatusGenerated,
		})
	}
	if err := model.DB.Model(&model.PricingChangeBatch{}).Where("id = ?", batch.Id).
		Updates(map[string]any{
			"status": batch.Status, "total_count": batch.TotalCount,
			"changed_count": batch.ChangedCount, "unchanged_count": batch.UnchangedCount,
			"review_count": batch.ReviewCount,
		}).Error; err != nil {
		return nil, err
	}
	if err := model.DB.Create(&model.PricingAuditRecord{
		ObjectType: "pricing_change_batch", ObjectId: batch.Id,
		Action: "generate_purchase_drafts", OperatorId: userId,
	}).Error; err != nil {
		return nil, err
	}
	completed = true
	return results, nil
}

func resetIncompletePurchaseDraftBatch(batchId int) error {
	return model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("batch_id = ?", batchId).
			Delete(&model.PricingChangeBatchItem{}).Error; err != nil {
			return err
		}
		if err := tx.Where("object_type = ? AND object_id = ?",
			"pricing_change_batch", batchId).Delete(&model.PricingAuditRecord{}).Error; err != nil {
			return err
		}
		return tx.Delete(&model.PricingChangeBatch{}, batchId).Error
	})
}

func cleanupFailedPurchaseDraftBatch(batchId int, draftIds []int) error {
	return model.DB.Transaction(func(tx *gorm.DB) error {
		if len(draftIds) > 0 {
			if err := tx.Where("id IN ? AND status = ?", draftIds, model.PricingVersionStatusDraft).
				Delete(&model.ChannelModelPurchasePriceVersion{}).Error; err != nil {
				return err
			}
		}
		if err := tx.Where("batch_id = ?", batchId).
			Delete(&model.PricingChangeBatchItem{}).Error; err != nil {
			return err
		}
		if err := tx.Where("object_type = ? AND object_id = ?",
			"pricing_change_batch", batchId).Delete(&model.PricingAuditRecord{}).Error; err != nil {
			return err
		}
		return tx.Delete(&model.PricingChangeBatch{}, batchId).Error
	})
}

func purchaseDraftInputForOfficialRefresh(
	current model.ChannelModelPurchasePriceVersion,
	officialPriceVersionId int,
) (PurchaseDraftInput, error) {
	input := PurchaseDraftInput{
		ChannelModelId: current.ChannelModelId, OfficialPriceVersionId: &officialPriceVersionId,
		PricingMode: current.PricingMode, PurchaseDiscount: current.PurchaseDiscount,
		QuoteReference: current.QuoteReference, QuoteValidUntil: current.QuoteValidUntil,
		ContractReference:     current.ContractReference,
		ContractEffectiveFrom: current.ContractEffectiveFrom,
		ContractEffectiveTo:   current.ContractEffectiveTo,
		Remark:                strings.TrimSpace(current.Remark + " refreshed from official price"),
	}
	if current.PricingMode != "component_ratio" {
		return input, nil
	}
	var discounts purchaseDiscountSpec
	if err := common.UnmarshalJsonStr(current.QuoteSpec, &discounts); err != nil {
		return input, fmt.Errorf("decode component discount specification: %w", err)
	}
	input.InputDiscount = discounts.InputDiscount
	input.OutputDiscount = discounts.OutputDiscount
	input.CacheReadDiscount = discounts.CacheReadDiscount
	input.CacheWriteDiscount = discounts.CacheWriteDiscount
	input.ImageInputDiscount = discounts.ImageInputDiscount
	input.ImageOutputDiscount = discounts.ImageOutputDiscount
	input.AudioInputDiscount = discounts.AudioInputDiscount
	input.AudioOutputDiscount = discounts.AudioOutputDiscount
	return input, nil
}

func recordPurchaseDraftRefreshFailure(
	batchId int,
	current model.ChannelModelPurchasePriceVersion,
	modelId int,
	generationErr error,
) (PurchasePriceAutoDraftResult, error) {
	channelModelId, oldId := current.ChannelModelId, current.Id
	err := model.DB.Create(&model.PricingChangeBatchItem{
		BatchId: batchId, TargetType: "purchase_price_version",
		ModelId: modelId, ChannelModelId: &channelModelId,
		Action: "create_draft", OldVersionId: &oldId,
		Status:   PricingChangeBatchItemStatusReview,
		RiskCode: "purchase_refresh_failed", ErrorMessage: generationErr.Error(),
	}).Error
	return PurchasePriceAutoDraftResult{
		BatchId: batchId, ChannelModelId: current.ChannelModelId,
		Status: PricingChangeBatchItemStatusReview, ErrorMessage: generationErr.Error(),
	}, err
}

func purchaseDraftResultsForBatch(batchId int) ([]PurchasePriceAutoDraftResult, error) {
	var items []model.PricingChangeBatchItem
	if err := model.DB.Where("batch_id = ?", batchId).Order("id ASC").Find(&items).Error; err != nil {
		return nil, err
	}
	results := make([]PurchasePriceAutoDraftResult, 0, len(items))
	for _, item := range items {
		channelModelId, purchaseVersionId := 0, 0
		if item.ChannelModelId != nil {
			channelModelId = *item.ChannelModelId
		}
		if item.NewVersionId != nil {
			purchaseVersionId = *item.NewVersionId
		}
		results = append(results, PurchasePriceAutoDraftResult{
			BatchId: batchId, ChannelModelId: channelModelId,
			PurchasePriceVersionId: purchaseVersionId,
			Status:                 item.Status, ErrorMessage: item.ErrorMessage,
		})
	}
	return results, nil
}
