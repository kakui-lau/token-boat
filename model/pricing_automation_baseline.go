package model

import (
	"strconv"

	"gorm.io/gorm"
)

const PricingAutomationOfficialBaselineOption = "PricingAutomationOfficialBaselineId"
const PricingAutomationPurchaseBaselineOption = "PricingAutomationPurchaseBaselineId"

// InitializePricingAutomationBaselines records the immutable pricing revisions
// that predate the change-batch subsystem. Reconciliation must not replay those
// historical revisions as if they had just been published after an upgrade.
func InitializePricingAutomationBaselines() error {
	var officialBaseline int64
	if err := DB.Model(&OfficialModelPriceVersion{}).
		Select("COALESCE(MAX(id), 0)").Scan(&officialBaseline).Error; err != nil {
		return err
	}
	var purchaseBaseline int64
	if err := DB.Model(&ChannelModelPurchasePriceVersion{}).
		Select("COALESCE(MAX(id), 0)").Scan(&purchaseBaseline).Error; err != nil {
		return err
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		values := []Option{
			{Key: PricingAutomationOfficialBaselineOption, Value: strconv.FormatInt(officialBaseline, 10)},
			{Key: PricingAutomationPurchaseBaselineOption, Value: strconv.FormatInt(purchaseBaseline, 10)},
		}
		for _, value := range values {
			if err := tx.Where("key = ?", value.Key).FirstOrCreate(&value).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func GetPricingAutomationBaselines() (int64, int64, error) {
	var options []Option
	if err := DB.Where("key IN ?", []string{
		PricingAutomationOfficialBaselineOption,
		PricingAutomationPurchaseBaselineOption,
	}).Find(&options).Error; err != nil {
		return 0, 0, err
	}
	var officialBaseline int64
	var purchaseBaseline int64
	for _, option := range options {
		value, err := strconv.ParseInt(option.Value, 10, 64)
		if err != nil || value < 0 {
			continue
		}
		switch option.Key {
		case PricingAutomationOfficialBaselineOption:
			officialBaseline = value
		case PricingAutomationPurchaseBaselineOption:
			purchaseBaseline = value
		}
	}
	return officialBaseline, purchaseBaseline, nil
}
