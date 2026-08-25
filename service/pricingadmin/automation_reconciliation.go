package pricingadmin

import (
	"strconv"

	"github.com/QuantumNous/new-api/model"
)

type PricingAutomationReconciliationSummary struct {
	OfficialVersionsChecked int `json:"official_versions_checked"`
	OfficialGapsRepaired    int `json:"official_gaps_repaired"`
	PurchaseVersionsChecked int `json:"purchase_versions_checked"`
	PurchaseGapsRepaired    int `json:"purchase_gaps_repaired"`
}

// ReconcilePricingAutomation closes the crash window between publishing an
// immutable upstream price revision and creating its deterministic downstream
// change batch. Existing idempotency keys make reruns safe.
func ReconcilePricingAutomation(userId int) (PricingAutomationReconciliationSummary, error) {
	var summary PricingAutomationReconciliationSummary
	if !model.DB.Migrator().HasTable(&model.PricingChangeBatch{}) {
		return summary, nil
	}
	var officialVersions []model.OfficialModelPriceVersion
	if err := model.DB.Where("status = ?", model.PricingVersionStatusActive).
		Order("id ASC").Find(&officialVersions).Error; err != nil {
		return summary, err
	}
	for _, version := range officialVersions {
		summary.OfficialVersionsChecked++
		key := "auto-official-" + strconv.Itoa(version.Id) + "-purchase-drafts"
		var count int64
		if err := model.DB.Model(&model.PricingChangeBatch{}).
			Where("idempotency_key = ?", key).Count(&count).Error; err != nil {
			return summary, err
		}
		if _, err := AutoCreatePurchaseDraftsForOfficialPrice(version.Id, userId); err != nil {
			return summary, err
		}
		if count == 0 {
			summary.OfficialGapsRepaired++
		}
	}

	var purchaseVersions []model.ChannelModelPurchasePriceVersion
	if err := model.DB.Where("status = ?", model.PricingVersionStatusActive).
		Order("id ASC").Find(&purchaseVersions).Error; err != nil {
		return summary, err
	}
	for _, version := range purchaseVersions {
		summary.PurchaseVersionsChecked++
		var countBefore int64
		if err := model.DB.Model(&model.PricingChangeBatch{}).
			Where("trigger_type = ? AND trigger_id = ?",
				SalesPriceBookTriggerPurchasePricePublished, version.Id).
			Count(&countBefore).Error; err != nil {
			return summary, err
		}
		_, err := AutoRepriceSalesPriceBooksForPurchaseVersion(version.Id, userId)
		if err != nil {
			return summary, err
		}
		var countAfter int64
		if err := model.DB.Model(&model.PricingChangeBatch{}).
			Where("trigger_type = ? AND trigger_id = ?",
				SalesPriceBookTriggerPurchasePricePublished, version.Id).
			Count(&countAfter).Error; err != nil {
			return summary, err
		}
		if countAfter > countBefore {
			summary.PurchaseGapsRepaired++
		}
	}
	return summary, nil
}
