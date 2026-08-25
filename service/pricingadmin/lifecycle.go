package pricingadmin

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/pricingruntime"
	"gorm.io/gorm"
)

type ActivePriceBundle = pricingruntime.ActivePriceBundle

type PurchasePriceSuspendImpact struct {
	ModelId                 int   `json:"model_id"`
	RemainingCandidateCount int64 `json:"remaining_candidate_count"`
	AffectedPriceBookCount  int64 `json:"affected_price_book_count"`
	AffectedAssignmentCount int64 `json:"affected_assignment_count"`
	AffectsTocDefault       bool  `json:"affects_toc_default"`
}

func GetActivePriceBundle(channelModelId int) (ActivePriceBundle, error) {
	return pricingruntime.LoadActivePriceBundle(channelModelId)
}

func GetPurchasePriceSuspendImpact(id int) (PurchasePriceSuspendImpact, error) {
	var impact PurchasePriceSuspendImpact
	var version model.ChannelModelPurchasePriceVersion
	if err := model.DB.First(&version, id).Error; err != nil {
		return impact, err
	}
	var channelModel model.ChannelModel
	if err := model.DB.First(&channelModel, version.ChannelModelId).Error; err != nil {
		return impact, err
	}
	impact.ModelId = channelModel.ModelId
	now := common.GetTimestamp()
	if err := model.DB.Table("channel_models").
		Joins(`JOIN channel_model_purchase_price_versions AS purchase
			ON purchase.channel_model_id = channel_models.id
			AND purchase.status = ? AND purchase.effective_from <= ?
			AND (purchase.effective_to = 0 OR purchase.effective_to > ?)`,
			model.PricingVersionStatusActive, now, now).
		Joins("JOIN channels ON channels.id = channel_models.channel_id").
		Where("channel_models.model_id = ? AND channel_models.id <> ?",
			channelModel.ModelId, channelModel.Id).
		Where("channel_models.status = ? AND channels.status = ?", 1, common.ChannelStatusEnabled).
		Distinct("channel_models.id").Count(&impact.RemainingCandidateCount).Error; err != nil {
		return impact, err
	}
	var bookIds []int
	if err := model.DB.Table("sales_price_books AS books").
		Distinct("books.id").
		Joins("JOIN sales_price_book_items AS items ON items.price_book_version_id = books.current_version_id").
		Where("books.status = ? AND items.status = ? AND items.model_id = ?",
			model.SalesPriceBookStatusEnabled, SalesPriceItemStatusEnabled, channelModel.ModelId).
		Pluck("books.id", &bookIds).Error; err != nil && !ignoreMissingTable(err) {
		return impact, err
	}
	impact.AffectedPriceBookCount = int64(len(bookIds))
	if len(bookIds) > 0 {
		if err := model.DB.Model(&model.UserPriceBookAssignment{}).
			Where("price_book_id IN ? AND status IN ?", bookIds, []string{
				model.PriceBookAssignmentStatusActive, model.PriceBookAssignmentStatusScheduled,
			}).Count(&impact.AffectedAssignmentCount).Error; err != nil {
			return impact, err
		}
		var count int64
		if err := model.DB.Model(&model.SalesPriceBookDefault{}).
			Where("default_key = ? AND price_book_id IN ?", "toc_default", bookIds).
			Count(&count).Error; err != nil {
			return impact, err
		}
		impact.AffectsTocDefault = count > 0
	}
	return impact, nil
}

func SuspendPurchasePriceVersion(id int, forceValues ...bool) error {
	force := len(forceValues) > 0 && forceValues[0]
	impact, err := GetPurchasePriceSuspendImpact(id)
	if err != nil {
		return err
	}
	if impact.RemainingCandidateCount == 0 && !force {
		return errors.New("suspending this purchase price removes the last active priced channel; confirm with force=true")
	}
	err = model.DB.Transaction(func(tx *gorm.DB) error {
		version, err := model.GetPurchasePriceVersionForUpdate(tx, id)
		if err != nil {
			return err
		}
		if version.Status != model.PricingVersionStatusActive {
			return errors.New("only active purchase prices can be suspended")
		}
		return suspendVersion(tx, &model.ChannelModelPurchasePriceVersion{}, id)
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
