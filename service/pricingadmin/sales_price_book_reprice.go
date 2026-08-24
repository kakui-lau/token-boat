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
	if len(affected) == 0 {
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
