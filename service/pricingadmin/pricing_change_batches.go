package pricingadmin

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/model"
)

type PricingChangeBatchListFilter struct {
	Keyword     string
	Status      string
	TriggerType string
	Page        int
	PageSize    int
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
