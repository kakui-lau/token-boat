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
		if err := deleteSalesPriceBookDraft(draft.Id); err != nil {
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
			if err := model.DB.First(&version, "change_batch_id = ?", existing.Id).Error; err != nil {
				return nil, err
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
		if err := cancelSupersededAutomaticSalesDrafts(book.PriceBookId); err != nil {
			return nil, err
		}
		draft, err := CloneSalesPriceBookVersion(
			book.PriceBookId, book.CurrentVersionId, userId,
		)
		if err != nil {
			return nil, err
		}
		triggerId := purchaseVersionId
		generated, err := GenerateSalesPriceBookItems(draft.Id, SalesPriceBookGenerationInput{
			ChannelModelIds: channelModelIds,
			IdempotencyKey:  idempotencyKey,
			TriggerType:     SalesPriceBookTriggerPurchasePricePublished,
			TriggerId:       &triggerId,
		}, userId)
		if err != nil {
			if cleanupErr := deleteSalesPriceBookDraft(draft.Id); cleanupErr != nil {
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
		results = append(results, SalesPriceBookAutoRepriceResult{
			PriceBookId: book.PriceBookId, PriceBookVersionId: draft.Id,
			BatchId: generated.Batch.Id, Status: generated.Batch.Status,
		})
	}
	return results, nil
}

func cancelSupersededAutomaticSalesDrafts(priceBookId int) error {
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
		Updates(map[string]any{
			"status":     model.SalesPriceBookVersionStatusCancelled,
			"updated_at": common.GetTimestamp(),
		}).Error
}

func deleteSalesPriceBookDraft(versionId int) error {
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
				Delete(&model.SalesPriceBookItemBasisSource{}).Error; err != nil {
				return err
			}
		}
		if err := tx.Where("price_book_version_id = ?", versionId).
			Delete(&model.SalesPriceBookItem{}).Error; err != nil {
			return err
		}
		if err := tx.Where("object_type = ? AND object_id = ?",
			"sales_price_book_version", versionId).Delete(&model.PricingAuditRecord{}).Error; err != nil {
			return err
		}
		return tx.Delete(&model.SalesPriceBookVersion{}, versionId).Error
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
