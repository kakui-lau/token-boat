package pricingadmin

import (
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
)

type PricingChangeBatchListFilter struct {
	Keyword     string
	Status      string
	TriggerType string
	Page        int
	PageSize    int
}

type PricingChangeBatchPublishResult struct {
	PurchaseVersionsPublished int `json:"purchase_versions_published"`
	SalesVersionsPublished    int `json:"sales_versions_published"`
	ReviewRequired            int `json:"review_required"`
}

func PublishGeneratedPricingChangeBatch(
	batchId int,
	userId int,
) (PricingChangeBatchPublishResult, error) {
	var result PricingChangeBatchPublishResult
	batch, items, err := GetPricingChangeBatch(batchId)
	if err != nil {
		return result, err
	}
	if batch.ReviewCount > 0 {
		return result, errors.New("pricing change batch still has review-required items")
	}
	purchaseVersionIds := make(map[int]struct{})
	for _, item := range items {
		if item.TargetType == "purchase_price_version" && item.NewVersionId != nil {
			purchaseVersionIds[*item.NewVersionId] = struct{}{}
		}
	}
	orderedPurchaseVersionIds := make([]int, 0, len(purchaseVersionIds))
	for purchaseVersionId := range purchaseVersionIds {
		orderedPurchaseVersionIds = append(orderedPurchaseVersionIds, purchaseVersionId)
	}
	sort.Ints(orderedPurchaseVersionIds)
	for _, purchaseVersionId := range orderedPurchaseVersionIds {
		var version model.ChannelModelPurchasePriceVersion
		if err := model.DB.First(&version, purchaseVersionId).Error; err != nil {
			return result, err
		}
		if version.Status != model.PricingVersionStatusDraft {
			continue
		}
		_, err := PublishPurchasePriceVersionWithAutomation(purchaseVersionId, userId)
		if err != nil {
			return result, err
		}
		result.PurchaseVersionsPublished++
	}
	if len(orderedPurchaseVersionIds) > 0 {
		var downstreamBatches []model.PricingChangeBatch
		if err := model.DB.Where("trigger_type = ? AND trigger_id IN ?",
			SalesPriceBookTriggerPurchasePricePublished, orderedPurchaseVersionIds).
			Order("id ASC").Find(&downstreamBatches).Error; err != nil {
			return result, err
		}
		for _, downstreamBatch := range downstreamBatches {
			if downstreamBatch.ReviewCount > 0 ||
				downstreamBatch.Status == PricingChangeBatchStatusReviewRequired {
				result.ReviewRequired++
				continue
			}
			var salesDraft model.SalesPriceBookVersion
			err := model.DB.First(&salesDraft,
				"change_batch_id = ? AND status = ?", downstreamBatch.Id,
				model.SalesPriceBookVersionStatusDraft).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				continue
			}
			if err != nil {
				return result, err
			}
			if err := PublishSalesPriceBookVersion(salesDraft.Id, userId); err != nil {
				return result, err
			}
			result.SalesVersionsPublished++
		}
	}
	var draft model.SalesPriceBookVersion
	err = model.DB.First(&draft, "change_batch_id = ? AND status = ?",
		batchId, model.SalesPriceBookVersionStatusDraft).Error
	if err == nil {
		if err := PublishSalesPriceBookVersion(draft.Id, userId); err != nil {
			return result, err
		}
		result.SalesVersionsPublished++
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return result, err
	}
	return result, nil
}

type PricingChangeBatchListItem struct {
	model.PricingChangeBatch
	RequestedByUsername string `json:"requested_by_username"`
}

type PricingChangeBatchItemListItem struct {
	model.PricingChangeBatchItem
	ModelName     string `json:"model_name"`
	ChannelName   string `json:"channel_name"`
	PriceBookName string `json:"price_book_name"`
}

func ListPricingChangeBatches(
	filter PricingChangeBatchListFilter,
) ([]PricingChangeBatchListItem, int64, error) {
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	filter.Status = strings.ToLower(strings.TrimSpace(filter.Status))
	filter.TriggerType = strings.TrimSpace(filter.TriggerType)
	filter.Page, filter.PageSize = normalizeSalesPriceBookPage(filter.Page, filter.PageSize)
	query := model.DB.Table("pricing_change_batches AS batches")
	if filter.Keyword != "" {
		query = query.Where("LOWER(batches.batch_no) LIKE ?", "%"+strings.ToLower(filter.Keyword)+"%")
	}
	if filter.Status != "" {
		if filter.Status != PricingChangeBatchStatusCompleted &&
			filter.Status != PricingChangeBatchStatusReviewRequired {
			return nil, 0, fmt.Errorf("unsupported pricing change batch status %q", filter.Status)
		}
		query = query.Where("batches.status = ?", filter.Status)
	}
	if filter.TriggerType != "" {
		if filter.TriggerType != "manual_price_book_generation" &&
			filter.TriggerType != SalesPriceBookTriggerPurchasePricePublished &&
			filter.TriggerType != PurchasePriceTriggerOfficialPricePublished {
			return nil, 0, fmt.Errorf("unsupported pricing change trigger %q", filter.TriggerType)
		}
		query = query.Where("batches.trigger_type = ?", filter.TriggerType)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []PricingChangeBatchListItem
	err := query.Select("batches.*, users.username AS requested_by_username").
		Joins("LEFT JOIN users ON users.id = batches.requested_by").
		Order("batches.id DESC").
		Offset((filter.Page - 1) * filter.PageSize).
		Limit(filter.PageSize).
		Scan(&items).Error
	return items, total, err
}
