package pricingruntime

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
)

var ErrSalesPriceBookUnavailable = errors.New("sales price book is unavailable")

type ResolvedSalesPrice struct {
	PriceBookId        int
	PriceBookVersionId int
	PriceBookItemId    int
	AssignmentId       int
	Source             string
	Book               model.SalesPriceBook
	Version            model.SalesPriceBookVersion
	Item               model.SalesPriceBookItem
}

func resolveSalesPriceBook(userId int, at int64) (ResolvedSalesPrice, error) {
	var result ResolvedSalesPrice
	if at == 0 {
		at = common.GetTimestamp()
	}
	priceBookId := 0
	versionId := 0
	pinnedVersion := false
	if userId > 0 {
		var assignment model.UserPriceBookAssignment
		err := model.DB.Where(
			"user_id = ? AND status IN ? AND effective_from <= ? AND (effective_to = 0 OR effective_to > ?)",
			userId,
			[]string{model.PriceBookAssignmentStatusActive, model.PriceBookAssignmentStatusScheduled},
			at,
			at,
		).Order("effective_from DESC, id DESC").First(&assignment).Error
		if err == nil {
			result.AssignmentId = assignment.Id
			result.Source = "user_assignment"
			priceBookId = assignment.PriceBookId
			if assignment.VersionPolicy == "pin_version" && assignment.PinnedVersionId != nil {
				versionId = *assignment.PinnedVersionId
				pinnedVersion = true
				result.Source = "pinned_version"
			}
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return result, err
		}
	}
	if priceBookId == 0 {
		var defaultBook model.SalesPriceBookDefault
		if err := model.DB.First(&defaultBook, "default_key = ?", "toc_default").Error; err != nil {
			return result, ErrSalesPriceBookUnavailable
		}
		priceBookId = defaultBook.PriceBookId
		result.Source = "toc_default"
	}

	if err := model.DB.First(&result.Book, priceBookId).Error; err != nil {
		return ResolvedSalesPrice{}, err
	}
	if result.AssignmentId > 0 && result.Book.Audience != "tob" {
		return ResolvedSalesPrice{}, ErrSalesPriceBookUnavailable
	}
	if result.AssignmentId == 0 && result.Book.Audience != "toc" {
		return ResolvedSalesPrice{}, ErrSalesPriceBookUnavailable
	}
	if result.Book.Status != model.SalesPriceBookStatusEnabled || result.Book.CurrentVersionId == nil {
		return ResolvedSalesPrice{}, ErrSalesPriceBookUnavailable
	}
	if versionId == 0 {
		versionId = *result.Book.CurrentVersionId
	}
	if err := model.DB.First(&result.Version, versionId).Error; err != nil {
		return ResolvedSalesPrice{}, err
	}
	if result.Version.PriceBookId != result.Book.Id {
		return ResolvedSalesPrice{}, ErrSalesPriceBookUnavailable
	}
	if pinnedVersion {
		if result.Version.Status != model.SalesPriceBookVersionStatusActive &&
			result.Version.Status != model.SalesPriceBookVersionStatusSuperseded ||
			result.Version.PublishedAt == 0 {
			return ResolvedSalesPrice{}, ErrSalesPriceBookUnavailable
		}
	} else if result.Version.Status != model.SalesPriceBookVersionStatusActive ||
		result.Version.EffectiveFrom > at ||
		(result.Version.EffectiveTo > 0 && result.Version.EffectiveTo <= at) {
		return ResolvedSalesPrice{}, ErrSalesPriceBookUnavailable
	}
	result.PriceBookId = result.Book.Id
	result.PriceBookVersionId = result.Version.Id
	return result, nil
}

// ResolveSalesPrice resolves one customer-facing logical-model price without
// looking at, selecting, or mutating an upstream route.
func ResolveSalesPrice(userId int, modelName string, at int64) (ResolvedSalesPrice, error) {
	var result ResolvedSalesPrice
	if modelName == "" {
		return result, ErrSalesPriceBookUnavailable
	}
	var logicalModel model.Model
	if err := model.DB.Where("model_name = ? AND status = ?", modelName, 1).
		First(&logicalModel).Error; err != nil {
		return result, err
	}
	result, err := resolveSalesPriceBook(userId, at)
	if err != nil {
		return ResolvedSalesPrice{}, err
	}
	if err := model.DB.Where(
		"price_book_version_id = ? AND model_id = ? AND status = ?",
		result.Version.Id,
		logicalModel.Id,
		"enabled",
	).First(&result.Item).Error; err != nil {
		return ResolvedSalesPrice{}, err
	}
	result.PriceBookItemId = result.Item.Id
	return result, nil
}

// ResolveSalesPriceModelNames returns the requested logical models that are
// enabled in the exact price-book version currently resolved for the user.
// It resolves the assignment once so model discovery cannot mix TOB and TOC
// prices or issue one database query per advertised model.
func ResolveSalesPriceModelNames(userId int, modelNames []string, at int64) (map[string]struct{}, error) {
	available := make(map[string]struct{})
	if len(modelNames) == 0 {
		return available, nil
	}
	resolved, err := resolveSalesPriceBook(userId, at)
	if err != nil {
		return nil, err
	}
	type pricedModel struct {
		ModelName string `gorm:"column:model_name"`
	}
	rows := make([]pricedModel, 0, len(modelNames))
	if err := model.DB.Table("sales_price_book_items AS item").
		Select("models.model_name").
		Joins("JOIN models ON models.id = item.model_id").
		Where("item.price_book_version_id = ? AND item.status = ?", resolved.Version.Id, "enabled").
		Where("models.status = ? AND models.deleted_at IS NULL", 1).
		Where("models.model_name IN ?", modelNames).
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		available[row.ModelName] = struct{}{}
	}
	return available, nil
}
