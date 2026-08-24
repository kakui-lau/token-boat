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

// ResolveSalesPrice resolves one customer-facing logical-model price without
// looking at, selecting, or mutating an upstream route.
func ResolveSalesPrice(userId int, modelName string, at int64) (ResolvedSalesPrice, error) {
	var result ResolvedSalesPrice
	if userId <= 0 || modelName == "" {
		return result, ErrSalesPriceBookUnavailable
	}
	if at == 0 {
		at = common.GetTimestamp()
	}
	var logicalModel model.Model
	if err := model.DB.Where("model_name = ? AND status = ?", modelName, 1).
		First(&logicalModel).Error; err != nil {
		return result, err
	}

	var assignment model.UserPriceBookAssignment
	err := model.DB.Where(
		"user_id = ? AND status = ? AND effective_from <= ? AND (effective_to = 0 OR effective_to > ?)",
		userId,
		model.PriceBookAssignmentStatusActive,
		at,
		at,
	).Order("effective_from DESC, id DESC").First(&assignment).Error
	priceBookId := 0
	versionId := 0
	if err == nil {
		result.AssignmentId = assignment.Id
		result.Source = "user_assignment"
		priceBookId = assignment.PriceBookId
		if assignment.VersionPolicy == "pin_version" && assignment.PinnedVersionId != nil {
			versionId = *assignment.PinnedVersionId
			result.Source = "pinned_version"
		}
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return result, err
	} else {
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
	if result.Book.Status != model.SalesPriceBookStatusEnabled || result.Book.CurrentVersionId == nil {
		return ResolvedSalesPrice{}, ErrSalesPriceBookUnavailable
	}
	if versionId == 0 {
		versionId = *result.Book.CurrentVersionId
	}
	if err := model.DB.First(&result.Version, versionId).Error; err != nil {
		return ResolvedSalesPrice{}, err
	}
	if result.Version.PriceBookId != result.Book.Id ||
		result.Version.Status != model.SalesPriceBookVersionStatusActive ||
		result.Version.EffectiveFrom > at ||
		(result.Version.EffectiveTo > 0 && result.Version.EffectiveTo <= at) {
		return ResolvedSalesPrice{}, ErrSalesPriceBookUnavailable
	}
	if err := model.DB.Where(
		"price_book_version_id = ? AND model_id = ? AND status = ?",
		result.Version.Id,
		logicalModel.Id,
		"enabled",
	).First(&result.Item).Error; err != nil {
		return ResolvedSalesPrice{}, err
	}
	result.PriceBookId = result.Book.Id
	result.PriceBookVersionId = result.Version.Id
	result.PriceBookItemId = result.Item.Id
	return result, nil
}
