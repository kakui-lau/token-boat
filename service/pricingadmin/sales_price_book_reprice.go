package pricingadmin

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
)

const SalesPriceBookTriggerPurchasePricePublished = "purchase_price_publish"

type SalesPriceBookAutoRepriceResult struct {
	PriceBookId        int    `json:"price_book_id"`
	PriceBookVersionId int    `json:"price_book_version_id"`
	BatchId            int    `json:"batch_id"`
	Status             string `json:"status"`
}

type affectedSalesPriceBook struct {
	PriceBookId      int
	CurrentVersionId int
}

func RetrySalesPriceBooksForPurchaseVersion(
	purchaseVersionId int,
	userId int,
) ([]SalesPriceBookAutoRepriceResult, error) {
	var batches []model.PricingChangeBatch
	if err := model.DB.Where("trigger_type = ? AND trigger_id = ? AND status = ?",
		SalesPriceBookTriggerPurchasePricePublished, purchaseVersionId,
		PricingChangeBatchStatusReviewRequired).Find(&batches).Error; err != nil {
		return nil, err
	}
	for _, batch := range batches {
		if err := resetReviewRequiredChangeBatch(batch.IdempotencyKey, batch.Id); err != nil {
			return nil, err
		}
	}
	return AutoRepriceSalesPriceBooksForPurchaseVersion(purchaseVersionId, userId)
}

func resetReviewRequiredChangeBatch(idempotencyKey string, expectedBatchId int) error {
	var batch model.PricingChangeBatch
	err := model.DB.First(&batch, "idempotency_key = ?", idempotencyKey).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	if expectedBatchId > 0 && batch.Id != expectedBatchId {
		return errors.New("pricing retry batch changed; reload before retrying")
	}
	if batch.Status != PricingChangeBatchStatusReviewRequired {
		return nil
	}
	var draft model.SalesPriceBookVersion
	err = model.DB.First(&draft, "change_batch_id = ?", batch.Id).Error
	if err == nil {
		if err := deleteSalesPriceBookDraft(draft.Id, 0); err != nil {
			return err
		}
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
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

func AutoRepriceSalesPriceBooksForPurchaseVersion(
	purchaseVersionId int,
	userId int,
) ([]SalesPriceBookAutoRepriceResult, error) {
	if purchaseVersionId <= 0 {
		return nil, errors.New("purchase price version is required")
	}
	var purchase model.ChannelModelPurchasePriceVersion
	if err := model.DB.First(&purchase, purchaseVersionId).Error; err != nil {
		return nil, err
	}
	if purchase.Status != model.PricingVersionStatusActive {
		return nil, errors.New("only an active purchase price can trigger sales repricing")
	}
	var channelModel model.ChannelModel
	if err := model.DB.First(&channelModel, purchase.ChannelModelId).Error; err != nil {
		return nil, err
	}
	var affected []affectedSalesPriceBook
	if err := model.DB.Table("sales_price_books").
		Select("sales_price_books.id AS price_book_id, sales_price_books.current_version_id AS current_version_id").
		Joins(`JOIN sales_price_book_items
			ON sales_price_book_items.price_book_version_id = sales_price_books.current_version_id`).
		Where("sales_price_books.status = ?", model.SalesPriceBookStatusEnabled).
		Where("sales_price_books.current_version_id IS NOT NULL").
		Where("sales_price_book_items.model_id = ?", channelModel.ModelId).
		Order("sales_price_books.id ASC").
		Scan(&affected).Error; err != nil {
		return nil, err
	}
	var tocDefault affectedSalesPriceBook
	err := model.DB.Table("sales_price_book_defaults AS defaults").
		Select("sales_price_books.id AS price_book_id, sales_price_books.current_version_id AS current_version_id").
		Joins("JOIN sales_price_books ON sales_price_books.id = defaults.price_book_id").
		Where("defaults.default_key = ?", "toc_default").
		Where("sales_price_books.status = ?", model.SalesPriceBookStatusEnabled).
		Where("sales_price_books.current_version_id IS NOT NULL").
		First(&tocDefault).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	if err == nil {
		alreadyAffected := false
		for _, book := range affected {
			if book.PriceBookId == tocDefault.PriceBookId {
				alreadyAffected = true
				break
			}
		}
		if !alreadyAffected {
			affected = append(affected, tocDefault)
		}
	}
	if len(affected) == 0 {
		triggerId := purchaseVersionId
		idempotencyKey := fmt.Sprintf("auto-purchase-%d-no-price-books", purchaseVersionId)
		var existing model.PricingChangeBatch
		err := model.DB.First(&existing, "idempotency_key = ?", idempotencyKey).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			scope, marshalErr := common.Marshal(map[string]any{
				"purchase_price_version_id": purchaseVersionId,
				"model_id":                  channelModel.ModelId,
			})
			if marshalErr != nil {
				return nil, marshalErr
			}
			err = model.DB.Create(&model.PricingChangeBatch{
				BatchNo: fmt.Sprintf("PP-%d-SALES", purchaseVersionId), IdempotencyKey: idempotencyKey,
				TriggerType: SalesPriceBookTriggerPurchasePricePublished, TriggerId: &triggerId,
				Status: PricingChangeBatchStatusCompleted, ScopeSpec: string(scope), RequestedBy: userId,
			}).Error
		}
		if err != nil {
			return nil, err
		}
		return []SalesPriceBookAutoRepriceResult{}, nil
	}
	channelModelIds, err := activePricedChannelModelIds(channelModel.ModelId)
	if err != nil {
		return nil, err
	}
	if len(channelModelIds) == 0 {
		return nil, errors.New("the affected logical model has no active priced channel models")
	}

	results := make([]SalesPriceBookAutoRepriceResult, 0, len(affected))
	for _, book := range affected {
		idempotencyKey := fmt.Sprintf(
			"auto-purchase-%d-price-book-%d", purchaseVersionId, book.PriceBookId,
		)
		var existing model.PricingChangeBatch
		err := model.DB.First(&existing, "idempotency_key = ?", idempotencyKey).Error
		if err == nil {
			var version model.SalesPriceBookVersion
			versionErr := model.DB.First(&version, "change_batch_id = ?", existing.Id).Error
			if errors.Is(versionErr, gorm.ErrRecordNotFound) &&
				existing.Status == PricingChangeBatchStatusCompleted &&
				existing.ChangedCount == 0 && existing.ReviewCount == 0 {
				results = append(results, SalesPriceBookAutoRepriceResult{
					PriceBookId: book.PriceBookId, BatchId: existing.Id, Status: existing.Status,
				})
				continue
			}
			if versionErr != nil {
				return nil, versionErr
			}
			results = append(results, SalesPriceBookAutoRepriceResult{
				PriceBookId: book.PriceBookId, PriceBookVersionId: version.Id,
				BatchId: existing.Id, Status: existing.Status,
			})
			continue
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		sourceVersionId, err := latestAutomaticSalesDraftVersionId(
			book.PriceBookId,
			book.CurrentVersionId,
		)
		if err != nil {
			return nil, err
		}
		draft, err := CloneSalesPriceBookVersion(
			book.PriceBookId, sourceVersionId, userId,
		)
		if err != nil {
			return nil, err
		}
		designatedChannelModels := map[int]int(nil)
		if draft.CostBasisStrategy == "designated_channel" {
			var currentItem model.SalesPriceBookItem
			err := model.DB.First(
				&currentItem,
				"price_book_version_id = ? AND model_id = ?",
				draft.Id,
				channelModel.ModelId,
			).Error
			if err == nil {
				var selectedSource model.SalesPriceBookItemCostSource
				if err := model.DB.First(&selectedSource,
					"price_book_item_id = ? AND source_role = ?", currentItem.Id, "selected",
				).Error; err != nil {
					return nil, err
				}
				designatedChannelModels = map[int]int{
					channelModel.ModelId: selectedSource.ChannelModelId,
				}
			} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, err
			}
		}
		triggerId := purchaseVersionId
		generated, err := GenerateSalesPriceBookItems(draft.Id, SalesPriceBookGenerationInput{
			ChannelModelIds:        channelModelIds,
			IdempotencyKey:         idempotencyKey,
			DesignatedChannelModel: designatedChannelModels,
			TriggerType:            SalesPriceBookTriggerPurchasePricePublished,
			TriggerId:              &triggerId,
		}, userId)
		if err != nil {
			if cleanupErr := deleteSalesPriceBookDraft(draft.Id, 0); cleanupErr != nil {
				return nil, fmt.Errorf(
					"generate sales price book %d draft %d: %w; cleanup failed: %v",
					book.PriceBookId, draft.Id, err, cleanupErr,
				)
			}
			return nil, fmt.Errorf(
				"generate sales price book %d draft %d: %w",
				book.PriceBookId, draft.Id, err,
			)
		}
		if generated.Batch.ChangedCount == 0 && generated.Batch.ReviewCount == 0 {
			if err := deleteSalesPriceBookDraft(draft.Id, 0); err != nil {
				return nil, fmt.Errorf(
					"remove unchanged sales price book %d draft %d: %w",
					book.PriceBookId, draft.Id, err,
				)
			}
			results = append(results, SalesPriceBookAutoRepriceResult{
				PriceBookId: book.PriceBookId, BatchId: generated.Batch.Id,
				Status: generated.Batch.Status,
			})
			continue
		}
		if err := cancelSupersededAutomaticSalesDrafts(book.PriceBookId, draft.Id); err != nil {
			return nil, err
		}
		results = append(results, SalesPriceBookAutoRepriceResult{
			PriceBookId: book.PriceBookId, PriceBookVersionId: draft.Id,
			BatchId: generated.Batch.Id, Status: generated.Batch.Status,
		})
	}
	return results, nil
}

func latestAutomaticSalesDraftVersionId(priceBookId int, fallbackVersionId int) (int, error) {
	var draft model.SalesPriceBookVersion
	err := model.DB.Table("sales_price_book_versions AS version").
		Select("version.*").
		Joins("JOIN pricing_change_batches AS batch ON batch.id = version.change_batch_id").
		Where("version.price_book_id = ? AND version.status = ?",
			priceBookId, model.SalesPriceBookVersionStatusDraft).
		Where("batch.trigger_type = ?", SalesPriceBookTriggerPurchasePricePublished).
		Order("version.version DESC").
		First(&draft).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return fallbackVersionId, nil
	}
	if err != nil {
		return 0, err
	}
	return draft.Id, nil
}

func cancelSupersededAutomaticSalesDrafts(priceBookId int, keepVersionId int) error {
	var batchIds []int
	if err := model.DB.Model(&model.PricingChangeBatch{}).
		Where("trigger_type = ?", SalesPriceBookTriggerPurchasePricePublished).
		Pluck("id", &batchIds).Error; err != nil {
		return err
	}
	if len(batchIds) == 0 {
		return nil
	}
	return model.DB.Model(&model.SalesPriceBookVersion{}).
		Where("price_book_id = ? AND status = ? AND change_batch_id IN ?",
			priceBookId, model.SalesPriceBookVersionStatusDraft, batchIds).
		Where("id <> ?", keepVersionId).
		Updates(map[string]any{
			"status":     model.SalesPriceBookVersionStatusCancelled,
			"updated_at": common.GetTimestamp(),
		}).Error
}

func deleteSalesPriceBookDraft(versionId int, userId int) error {
	return model.DB.Transaction(func(tx *gorm.DB) error {
		version, err := model.GetSalesPriceBookVersionForUpdate(tx, versionId)
		if err != nil {
			return err
		}
		if version.Status != model.SalesPriceBookVersionStatusDraft {
			return errors.New("only a sales price book draft can be cleaned up")
		}
		var itemIds []int
		if err := tx.Model(&model.SalesPriceBookItem{}).
			Where("price_book_version_id = ?", versionId).Pluck("id", &itemIds).Error; err != nil {
			return err
		}
		if len(itemIds) > 0 {
			if err := tx.Where("price_book_item_id IN ?", itemIds).
				Delete(&model.SalesPriceBookItemCostSource{}).Error; err != nil {
				return err
			}
		}
		if err := tx.Where("price_book_version_id = ?", versionId).
			Delete(&model.SalesPriceBookChannelModelOverride{}).Error; err != nil {
			return err
		}
		auditQuery := tx.Where("object_type = ? AND object_id = ?",
			"sales_price_book_version", versionId)
		if len(itemIds) > 0 {
			auditQuery = auditQuery.Or("object_type = ? AND object_id IN ?",
				"sales_price_book_item", itemIds)
		}
		var draftAuditRecords []model.PricingAuditRecord
		if err := auditQuery.Find(&draftAuditRecords).Error; err != nil {
			return err
		}
		for _, record := range draftAuditRecords {
			comment := fmt.Sprintf("draft v%d", version.Version)
			if record.Comment != "" {
				comment += "; " + record.Comment
			}
			if err := tx.Model(&model.PricingAuditRecord{}).Where("id = ?", record.Id).
				Updates(map[string]any{
					"object_type": "sales_price_book",
					"object_id":   version.PriceBookId,
					"comment":     comment,
				}).Error; err != nil {
				return err
			}
		}
		if err := tx.Where("price_book_version_id = ?", versionId).
			Delete(&model.SalesPriceBookItem{}).Error; err != nil {
			return err
		}
		if err := tx.Delete(&model.SalesPriceBookVersion{}, versionId).Error; err != nil {
			return err
		}
		if userId <= 0 {
			return nil
		}
		return tx.Create(&model.PricingAuditRecord{
			ObjectType: "sales_price_book", ObjectId: version.PriceBookId,
			Action: "delete_draft", OperatorId: userId,
			Comment: fmt.Sprintf("v%d", version.Version),
		}).Error
	})
}

func activePricedChannelModelIds(modelId int) ([]int, error) {
	now := common.GetTimestamp()
	var ids []int
	err := model.DB.Table("channel_models").
		Distinct("channel_models.id").
		Joins("JOIN channels ON channels.id = channel_models.channel_id").
		Joins(`JOIN channel_model_purchase_price_versions AS purchase
			ON purchase.channel_model_id = channel_models.id
			AND purchase.status = ?
			AND purchase.effective_from <= ?
			AND (purchase.effective_to = 0 OR purchase.effective_to > ?)`,
			model.PricingVersionStatusActive, now, now,
		).
		Where("channel_models.model_id = ?", modelId).
		Where("channel_models.status = ?", 1).
		Where("channels.status = ?", common.ChannelStatusEnabled).
		Order("channel_models.id ASC").
		Pluck("channel_models.id", &ids).Error
	return ids, err
}
