package pricingadmin

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/pricingruntime"
	"gorm.io/gorm"
)

type ActivePriceBundle = pricingruntime.ActivePriceBundle

func GetActivePriceBundle(channelModelId int) (ActivePriceBundle, error) {
	return pricingruntime.LoadActivePriceBundle(channelModelId)
}

func SuspendPurchasePriceVersion(id int) error {
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		version, err := model.GetPurchasePriceVersionForUpdate(tx, id)
		if err != nil {
			return err
		}
		if version.Status != model.PricingVersionStatusActive {
			return errors.New("only active purchase prices can be suspended")
		}
		var dependent int64
		if err := tx.Model(&model.ChannelModelRetailPriceVersion{}).
			Where("purchase_price_version_id = ? AND status = ?", id, model.PricingVersionStatusActive).
			Count(&dependent).Error; err != nil {
			return err
		}
		if dependent > 0 {
			return errors.New("purchase price is referenced by an active retail price")
		}
		return suspendVersion(tx, &model.ChannelModelPurchasePriceVersion{}, id)
	})
	if err == nil {
		pricingruntime.InvalidateCatalog()
	}
	return err
}

func SuspendRetailPriceVersion(id int) error {
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		version, err := model.GetRetailPriceVersionForUpdate(tx, id)
		if err != nil {
			return err
		}
		if version.Status != model.PricingVersionStatusActive {
			return errors.New("only active retail prices can be suspended")
		}
		return suspendVersion(tx, &model.ChannelModelRetailPriceVersion{}, id)
	})
	if err == nil {
		pricingruntime.InvalidateCatalog()
	}
	return err
}

func DeleteOfficialPriceDraft(id int) error {
	return model.DB.Transaction(func(tx *gorm.DB) error {
		version, err := model.GetOfficialPriceVersionForUpdate(tx, id)
		if err != nil {
			return err
		}
		if version.Status != model.PricingVersionStatusDraft {
			return errors.New("only official price drafts can be deleted")
		}
		var dependent int64
		if err := tx.Model(&model.ChannelModelPurchasePriceVersion{}).
			Where("official_price_version_id = ?", id).
			Count(&dependent).Error; err != nil {
			return err
		}
		if dependent > 0 {
			return errors.New("official price draft is referenced by a purchase price")
		}
		return tx.Delete(&version).Error
	})
}

func DeletePurchasePriceDraft(id int) error {
	return model.DB.Transaction(func(tx *gorm.DB) error {
		version, err := model.GetPurchasePriceVersionForUpdate(tx, id)
		if err != nil {
			return err
		}
		if version.Status != model.PricingVersionStatusDraft {
			return errors.New("only purchase price drafts can be deleted")
		}
		var dependent int64
		if err := tx.Model(&model.ChannelModelRetailPriceVersion{}).
			Where("purchase_price_version_id = ?", id).
			Count(&dependent).Error; err != nil {
			return err
		}
		if dependent > 0 {
			return errors.New("purchase price draft is referenced by a retail price")
		}
		return tx.Delete(&version).Error
	})
}

func DeleteRetailPriceDraft(id int) error {
	return model.DB.Transaction(func(tx *gorm.DB) error {
		version, err := model.GetRetailPriceVersionForUpdate(tx, id)
		if err != nil {
			return err
		}
		if version.Status != model.PricingVersionStatusDraft {
			return errors.New("only retail price drafts can be deleted")
		}
		return tx.Delete(&version).Error
	})
}

func suspendVersion(tx *gorm.DB, target any, id int) error {
	now := common.GetTimestamp()
	result := tx.Model(target).
		Where("id = ? AND status = ?", id, model.PricingVersionStatusActive).
		UpdateColumns(map[string]any{
			"status":       model.PricingVersionStatusSuspended,
			"effective_to": now,
			"updated_at":   now,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errors.New("price version is no longer active")
	}
	return nil
}
