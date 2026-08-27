package pricingadmin

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const (
	SalesPriceItemStatusEnabled        = "enabled"
	SalesPriceItemStatusDisabled       = "disabled"
	SalesPriceItemStatusReviewRequired = "review_required"
	SalesPriceBookDefaultPageSize      = 200
	SalesPriceBookMaximumPageSize      = 200
)

var (
	validPriceBookAudiences = map[string]struct{}{
		"toc": {}, "tob": {}, "internal": {},
	}
	validPriceBookStatuses = map[string]struct{}{
		model.SalesPriceBookStatusDraft: {}, model.SalesPriceBookStatusEnabled: {},
		model.SalesPriceBookStatusDisabled: {}, model.SalesPriceBookStatusArchived: {},
	}
	validPriceBookAssignmentStatuses = map[string]struct{}{
		model.PriceBookAssignmentStatusScheduled: {}, model.PriceBookAssignmentStatusActive: {},
		model.PriceBookAssignmentStatusExpired: {}, model.PriceBookAssignmentStatusCancelled: {},
	}
	validCostBasisStrategies = map[string]struct{}{
		"max_eligible_cost": {}, "designated_channel": {}, "min_eligible_cost": {},
	}
	validSalesPricingMethods = map[string]struct{}{
		"cost_plus": {}, "official_discount": {}, "fixed": {},
		"copied": {}, "manual": {},
	}
)

type SalesPriceBookListItem struct {
	model.SalesPriceBook
	CurrentVersion    *model.SalesPriceBookVersion `json:"current_version,omitempty"`
	ModelCount        int64                        `json:"model_count"`
	AssignedUsers     int64                        `json:"assigned_users"`
	MissingModelCount int64                        `json:"missing_model_count"`
}

type SalesPriceBookItemListItem struct {
	model.SalesPriceBookItem
	ModelName        string `json:"model_name"`
	PurchaseDiscount string `json:"purchase_discount"`
	SalesDiscount    string `json:"sales_discount"`
	ReviewRiskCode   string `json:"review_risk_code"`
	ReviewReason     string `json:"review_reason"`
}

type SalesPriceBookListFilter struct {
	Keyword  string
	Audience string
	Status   string
	Page     int
	PageSize int
}

type UserPriceBookAssignmentListFilter struct {
	Keyword     string
	UserId      int
	PriceBookId int
	Status      string
	Page        int
	PageSize    int
}

type UserPriceBookAssignmentListItem struct {
	model.UserPriceBookAssignment
	Username            string `json:"username"`
	PriceBookName       string `json:"price_book_name"`
	PriceBookCode       string `json:"price_book_code"`
	PinnedVersionNumber int64  `json:"pinned_version_number"`
}

type PricingAuditRecordListItem struct {
	model.PricingAuditRecord
	OperatorUsername string `json:"operator_username"`
}

func CreateSalesPriceBook(input *model.SalesPriceBook, userId int) error {
	if input == nil {
		return errors.New("sales price book is required")
	}
	input.Id = 0
	input.Code = strings.TrimSpace(input.Code)
	input.Name = strings.TrimSpace(input.Name)
	input.Audience = strings.ToLower(strings.TrimSpace(input.Audience))
	input.Currency = strings.ToUpper(strings.TrimSpace(input.Currency))
	input.Status = model.SalesPriceBookStatusDraft
	input.CurrentVersionId = nil
	input.CreatedBy = userId
	if input.Code == "" || input.Name == "" {
		return errors.New("sales price book code and name are required")
	}
	if _, ok := validPriceBookAudiences[input.Audience]; !ok {
		return fmt.Errorf("unsupported sales price book audience %q", input.Audience)
	}
	if input.Currency != "USD" {
		return errors.New("sales price book currency must be USD")
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(input).Error; err != nil {
			return err
		}
		return tx.Create(&model.PricingAuditRecord{
			ObjectType: "sales_price_book", ObjectId: input.Id,
			Action: "create", OperatorId: userId, Comment: input.Remark,
		}).Error
	})
}

func ListSalesPriceBooks(filter SalesPriceBookListFilter) ([]SalesPriceBookListItem, int64, error) {
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	filter.Audience = strings.ToLower(strings.TrimSpace(filter.Audience))
	filter.Status = strings.ToLower(strings.TrimSpace(filter.Status))
	filter.Page, filter.PageSize = normalizeSalesPriceBookPage(filter.Page, filter.PageSize)
	if filter.Audience != "" {
		if _, ok := validPriceBookAudiences[filter.Audience]; !ok {
			return nil, 0, fmt.Errorf("unsupported sales price book audience %q", filter.Audience)
		}
	}
	if filter.Status != "" {
		if _, ok := validPriceBookStatuses[filter.Status]; !ok {
			return nil, 0, fmt.Errorf("unsupported sales price book status %q", filter.Status)
		}
	}

	query := model.DB.Model(&model.SalesPriceBook{})
	if filter.Keyword != "" {
		pattern := "%" + strings.ToLower(filter.Keyword) + "%"
		query = query.Where("LOWER(name) LIKE ? OR LOWER(code) LIKE ?", pattern, pattern)
	}
	if filter.Audience != "" {
		query = query.Where("audience = ?", filter.Audience)
	}
	if filter.Status != "" {
		query = query.Where("status = ?", filter.Status)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var books []model.SalesPriceBook
	if err := query.Order("id DESC").
		Offset((filter.Page - 1) * filter.PageSize).
		Limit(filter.PageSize).
		Find(&books).Error; err != nil {
		return nil, 0, err
	}
	if len(books) == 0 {
		return []SalesPriceBookListItem{}, total, nil
	}

	bookIds := make([]int, 0, len(books))
	currentVersionIds := make([]int, 0, len(books))
	for _, book := range books {
		bookIds = append(bookIds, book.Id)
		if book.CurrentVersionId != nil {
			currentVersionIds = append(currentVersionIds, *book.CurrentVersionId)
		}
	}
	versionsById := make(map[int]model.SalesPriceBookVersion, len(currentVersionIds))
	modelCountsByVersion := make(map[int]int64, len(currentVersionIds))
	if len(currentVersionIds) > 0 {
		var versions []model.SalesPriceBookVersion
		if err := model.DB.Where("id IN ?", currentVersionIds).Find(&versions).Error; err != nil {
			return nil, 0, err
		}
		for _, version := range versions {
			versionsById[version.Id] = version
		}
		var counts []struct {
			PriceBookVersionId int
			Count              int64
		}
		if err := model.DB.Model(&model.SalesPriceBookItem{}).
			Select("price_book_version_id, COUNT(*) AS count").
			Where("price_book_version_id IN ? AND status = ?", currentVersionIds, SalesPriceItemStatusEnabled).
			Group("price_book_version_id").Scan(&counts).Error; err != nil {
			return nil, 0, err
		}
		for _, count := range counts {
			modelCountsByVersion[count.PriceBookVersionId] = count.Count
		}
	}
	assignedUsersByBook := make(map[int]int64, len(bookIds))
	now := common.GetTimestamp()
	var assignmentCounts []struct {
		PriceBookId int
		Count       int64
	}
	if err := model.DB.Model(&model.UserPriceBookAssignment{}).
		Select("price_book_id, COUNT(DISTINCT user_id) AS count").
		Where("price_book_id IN ? AND status IN ?", bookIds, []string{
			model.PriceBookAssignmentStatusActive,
			model.PriceBookAssignmentStatusScheduled,
		}).Where("effective_to = 0 OR effective_to > ?", now).
		Group("price_book_id").Scan(&assignmentCounts).Error; err != nil {
		return nil, 0, err
	}
	for _, count := range assignmentCounts {
		assignedUsersByBook[count.PriceBookId] = count.Count
	}
	tocModelIds := make([]int, 0)
	var tocDefault model.SalesPriceBookDefault
	if err := model.DB.First(&tocDefault, "default_key = ?", "toc_default").Error; err == nil {
		var tocBook model.SalesPriceBook
		if err := model.DB.First(&tocBook, tocDefault.PriceBookId).Error; err == nil && tocBook.CurrentVersionId != nil {
			if err := model.DB.Model(&model.SalesPriceBookItem{}).
				Where("price_book_version_id = ? AND status = ?", *tocBook.CurrentVersionId, SalesPriceItemStatusEnabled).
				Pluck("model_id", &tocModelIds).Error; err != nil {
				return nil, 0, err
			}
		}
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, 0, err
	}
	modelIdsByVersion := make(map[int]map[int]struct{}, len(currentVersionIds))
	if len(currentVersionIds) > 0 && len(tocModelIds) > 0 {
		var rows []struct {
			PriceBookVersionId int
			ModelId            int
		}
		if err := model.DB.Model(&model.SalesPriceBookItem{}).
			Select("price_book_version_id, model_id").
			Where("price_book_version_id IN ? AND status = ?", currentVersionIds, SalesPriceItemStatusEnabled).
			Scan(&rows).Error; err != nil {
			return nil, 0, err
		}
		for _, row := range rows {
			if modelIdsByVersion[row.PriceBookVersionId] == nil {
				modelIdsByVersion[row.PriceBookVersionId] = make(map[int]struct{})
			}
			modelIdsByVersion[row.PriceBookVersionId][row.ModelId] = struct{}{}
		}
	}

	items := make([]SalesPriceBookListItem, 0, len(books))
	for _, book := range books {
		item := SalesPriceBookListItem{
			SalesPriceBook: book,
			AssignedUsers:  assignedUsersByBook[book.Id],
		}
		if book.Audience == "tob" {
			item.MissingModelCount = int64(len(tocModelIds))
		}
		if book.CurrentVersionId != nil {
			if version, ok := versionsById[*book.CurrentVersionId]; ok {
				item.CurrentVersion = &version
				item.ModelCount = modelCountsByVersion[version.Id]
				if book.Audience == "tob" {
					item.MissingModelCount = 0
					for _, modelId := range tocModelIds {
						if _, exists := modelIdsByVersion[version.Id][modelId]; !exists {
							item.MissingModelCount++
						}
					}
				}
			}
		}
		items = append(items, item)
	}
	return items, total, nil
}

func normalizeSalesPriceBookPage(page int, pageSize int) (int, int) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = SalesPriceBookDefaultPageSize
	}
	if pageSize > SalesPriceBookMaximumPageSize {
		pageSize = SalesPriceBookMaximumPageSize
	}
	return page, pageSize
}

func CreateSalesPriceBookVersion(input *model.SalesPriceBookVersion, userId int) error {
	if input == nil {
		return errors.New("sales price book version is required")
	}
	input.Id = 0
	input.Status = model.SalesPriceBookVersionStatusDraft
	input.EffectiveFrom = 0
	input.EffectiveTo = 0
	input.PublishedBy = 0
	input.PublishedAt = 0
	input.CreatedBy = userId
	if err := validateSalesPriceBookPolicy(input); err != nil {
		return err
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		book, err := model.GetSalesPriceBookForUpdate(tx, input.PriceBookId)
		if err != nil {
			return err
		}
		if book.Status == model.SalesPriceBookStatusArchived {
			return errors.New("archived sales price books cannot receive new versions")
		}
		var maxVersion int64
		if err := tx.Model(&model.SalesPriceBookVersion{}).
			Where("price_book_id = ?", input.PriceBookId).
			Select("COALESCE(MAX(version), 0)").Scan(&maxVersion).Error; err != nil {
			return err
		}
		input.Version = maxVersion + 1
		input.ContentHash = emptySalesPriceBookContentHash(*input)
		if err := tx.Create(input).Error; err != nil {
			return err
		}
		return tx.Create(&model.PricingAuditRecord{
			ObjectType: "sales_price_book_version", ObjectId: input.Id,
			Action: "create_version", OperatorId: userId, Comment: input.Remark,
		}).Error
	})
}

func validateSalesPriceBookPolicy(input *model.SalesPriceBookVersion) error {
	if _, ok := validCostBasisStrategies[input.CostBasisStrategy]; !ok {
		return fmt.Errorf("unsupported cost basis strategy %q", input.CostBasisStrategy)
	}
	input.IncreaseCapRate = strings.TrimSpace(input.IncreaseCapRate)
	if input.IncreaseCapRate == "" {
		input.IncreaseCapRate = "0"
	}
	payment, err := validateRate("payment_fee_rate", input.PaymentFeeRate)
	if err != nil {
		return err
	}
	distribution, err := validateRate("distribution_fee_rate", input.DistributionFeeRate)
	if err != nil {
		return err
	}
	operations, err := validateRate("operations_labor_rate", input.OperationsLaborRate)
	if err != nil {
		return err
	}
	total, err := validateRate("total_variable_cost_rate", input.TotalVariableCostRate)
	if err != nil {
		return err
	}
	if !payment.Add(distribution).Add(operations).Equal(total) {
		return errors.New("total variable cost rate must equal payment, distribution and operations rates")
	}
	if _, err := NewSalesPriceCalculator(
		input.TotalVariableCostRate,
		input.EffectiveTaxRate,
		input.TargetNetMargin,
	); err != nil {
		return err
	}
	minimum, err := validateRate("minimum_margin_rate", input.MinimumMarginRate)
	if err != nil {
		return err
	}
	target, _ := decimal.NewFromString(input.TargetNetMargin)
	if minimum.GreaterThan(target) {
		return errors.New("minimum margin rate cannot exceed target net margin")
	}
	if _, err := validateRate("increase_cap_rate", input.IncreaseCapRate); err != nil {
		return err
	}
	return nil
}

func SaveSalesPriceBookItem(input *model.SalesPriceBookItem, userId int) error {
	if input == nil {
		return errors.New("sales price book item is required")
	}
	if input.Status != SalesPriceItemStatusEnabled &&
		input.Status != SalesPriceItemStatusDisabled &&
		input.Status != SalesPriceItemStatusReviewRequired {
		return fmt.Errorf("unsupported sales price item status %q", input.Status)
	}
	if _, ok := validSalesPricingMethods[input.PricingMethod]; !ok {
		return fmt.Errorf("unsupported sales pricing method %q", input.PricingMethod)
	}
	normalizeExpressionMetadata(
		&input.ExpressionSource,
		&input.ExpressionSchemaVersion,
		&input.Currency,
		&input.SalesBillingExpr,
	)
	if err := validateExpressionMetadata(input.ExpressionSchemaVersion, input.SalesBillingExpr); err != nil {
		return err
	}
	if err := validateCommonPrice(
		input.ModelId,
		input.BillingMode,
		input.PriceStructure,
		input.Currency,
		input.SalesBillingExpr,
	); err != nil {
		return err
	}
	if err := validatePriceComponents(input.BillingMode, input.PriceStructure, input.PriceComponents); err != nil {
		return err
	}
	if err := validateStructuredPricingContract(
		input.BillingMode, input.PriceStructure, input.PriceComponents, input.SalesBillingExpr,
	); err != nil {
		return err
	}
	if strings.TrimSpace(input.SellingFactor) == "" {
		input.SellingFactor = "0"
	}
	if strings.TrimSpace(input.OfficialDiscount) == "" {
		input.OfficialDiscount = "0"
	}
	if strings.TrimSpace(input.MinimumMarginOverride) == "" {
		input.MinimumMarginOverride = "0"
	}
	input.SalesExprHash = billingexpr.ExprHashString(input.SalesBillingExpr)
	return model.DB.Transaction(func(tx *gorm.DB) error {
		version, err := model.GetSalesPriceBookVersionForUpdate(tx, input.PriceBookVersionId)
		if err != nil {
			return err
		}
		if version.Status != model.SalesPriceBookVersionStatusDraft {
			return errors.New("only sales price book drafts can be edited")
		}
		var book model.SalesPriceBook
		if err := tx.First(&book, version.PriceBookId).Error; err != nil {
			return err
		}
		if input.Currency != book.Currency {
			return fmt.Errorf(
				"sales price item currency %s does not match price book currency %s",
				input.Currency, book.Currency,
			)
		}
		if input.Id == 0 {
			if err := tx.Create(input).Error; err != nil {
				return err
			}
			return tx.Create(&model.PricingAuditRecord{
				ObjectType: "sales_price_book_item", ObjectId: input.Id,
				Action: "create_item", OperatorId: userId, Comment: input.Remark,
			}).Error
		}
		var current model.SalesPriceBookItem
		if err := tx.First(&current, input.Id).Error; err != nil {
			return err
		}
		if current.PriceBookVersionId != input.PriceBookVersionId || current.ModelId != input.ModelId {
			return errors.New("sales price book item identity cannot be changed")
		}
		if current.Status == SalesPriceItemStatusReviewRequired {
			if err := closeSalesPriceBookItemReviewTx(tx, current, PricingChangeBatchItemStatusRejected); err != nil {
				return err
			}
		}
		oldReferencePrice, oldReferenceCost, marginBefore, oldPurchaseVersions, err :=
			salesPriceBookItemReferenceTx(tx, current, version)
		if err != nil {
			return err
		}
		input.Id = current.Id
		input.PriceBookVersionId = current.PriceBookVersionId
		input.ModelId = current.ModelId
		input.SalesExprHash = billingexpr.ExprHashString(input.SalesBillingExpr)
		if input.PricingMethod != "cost_plus" {
			input.SellingFactor = "0"
		} else if input.SalesExprHash != current.SalesExprHash {
			salesAmount, err := referenceBillingAmount(input.SalesBillingExpr, input.BillingMode)
			if err != nil {
				return err
			}
			costAmount, err := decimal.NewFromString(oldReferenceCost)
			if err != nil || !costAmount.IsPositive() {
				return errors.New("manual cost-plus edit requires a positive purchase reference cost")
			}
			input.SellingFactor = salesAmount.Div(costAmount).String()
		}
		newReferencePrice, newReferenceCost, marginAfter, newPurchaseVersions, err :=
			salesPriceBookItemReferenceTx(tx, *input, version)
		if err != nil {
			return err
		}
		oldChannelMargins, err := salesPriceBookChannelMarginsTx(tx, current, version)
		if err != nil {
			return err
		}
		newChannelMargins, err := salesPriceBookChannelMarginsTx(tx, *input, version)
		if err != nil {
			return err
		}
		diff := SalesPriceBookItemDiff{
			OldItem:           &SalesPriceBookItemListItem{SalesPriceBookItem: current},
			NewItem:           &SalesPriceBookItemListItem{SalesPriceBookItem: *input},
			OldReferencePrice: oldReferencePrice, NewReferencePrice: newReferencePrice,
			OldReferenceCost: oldReferenceCost, NewReferenceCost: newReferenceCost,
			PriceChangeRate: decimalChangeRate(oldReferencePrice, newReferencePrice),
			MarginBefore:    marginBefore, MarginAfter: marginAfter,
			OldPurchaseVersions: oldPurchaseVersions, NewPurchaseVersions: newPurchaseVersions,
			OldChannelMargins: oldChannelMargins, NewChannelMargins: newChannelMargins,
		}
		risks := salesPriceBookDiffRisks(diff, version)
		if len(oldPurchaseVersions) == 0 && len(newPurchaseVersions) == 0 && current.GeneratedByBatchId == nil {
			filteredRisks := make([]string, 0, len(risks))
			for _, risk := range risks {
				if risk != "missing_purchase_price" {
					filteredRisks = append(filteredRisks, risk)
				}
			}
			risks = filteredRisks
		}
		batchStatus := PricingChangeBatchStatusCompleted
		batchItemStatus := PricingChangeBatchItemStatusGenerated
		riskCode := ""
		if len(risks) > 0 {
			batchStatus = PricingChangeBatchStatusReviewRequired
			batchItemStatus = PricingChangeBatchItemStatusReview
			riskCode = risks[0]
			input.Status = SalesPriceItemStatusReviewRequired
		} else if input.Status == SalesPriceItemStatusReviewRequired {
			input.Status = SalesPriceItemStatusEnabled
		}
		batch := model.PricingChangeBatch{
			BatchNo:        fmt.Sprintf("PB-EDIT-%d-%d", input.Id, time.Now().UnixNano()),
			IdempotencyKey: fmt.Sprintf("manual-item-edit:%d:%d", input.Id, time.Now().UnixNano()),
			TriggerType:    "manual_price_book_edit", TriggerId: &input.Id,
			Status: batchStatus, TotalCount: 1, ChangedCount: 1,
			RequestedBy: userId,
		}
		if len(risks) > 0 {
			batch.ReviewCount = 1
		}
		if err := tx.Create(&batch).Error; err != nil {
			return err
		}
		input.GeneratedByBatchId = &batch.Id
		if err := tx.Model(&model.SalesPriceBookItem{}).Where("id = ?", input.Id).
			Select(
				"status", "billing_mode", "price_structure", "price_components",
				"sales_billing_expr", "sales_expr_hash", "expression_source",
				"expression_schema_version", "pricing_method",
				"official_price_version_id", "primary_purchase_version_id",
				"selling_factor", "official_discount", "minimum_margin_override",
				"currency", "generated_by_batch_id", "remark",
			).Updates(input).Error; err != nil {
			return err
		}
		diffDetail, err := common.Marshal(map[string]any{
			"old_purchase_version_ids": oldPurchaseVersions,
			"new_purchase_version_ids": newPurchaseVersions,
			"price_change_rate":        diff.PriceChangeRate,
			"old_channel_margins":      oldChannelMargins,
			"new_channel_margins":      newChannelMargins,
			"risk_codes":               risks,
		})
		if err != nil {
			return err
		}
		itemId := input.Id
		if err := tx.Create(&model.PricingChangeBatchItem{
			BatchId: batch.Id, TargetType: "sales_price_book_item", TargetId: &itemId,
			ModelId: input.ModelId, PriceBookId: &version.PriceBookId, Action: "manual_edit",
			OldExprHash: current.SalesExprHash, NewExprHash: input.SalesExprHash,
			OldReferenceCost: oldReferenceCost, NewReferenceCost: newReferenceCost,
			OldReferencePrice: oldReferencePrice, NewReferencePrice: newReferencePrice,
			MarginBefore: marginBefore, MarginAfter: marginAfter,
			RiskCode: riskCode, Status: batchItemStatus, DiffDetail: string(diffDetail),
		}).Error; err != nil {
			return err
		}
		return tx.Create(&model.PricingAuditRecord{
			ObjectType: "sales_price_book_item", ObjectId: input.Id,
			Action: "edit_item", OperatorId: userId, Comment: input.Remark,
		}).Error
	})
}

func UpdateSalesPriceBookVersionDraft(input *model.SalesPriceBookVersion, userId int) error {
	if input == nil || input.Id <= 0 {
		return errors.New("sales price book version is required")
	}
	if err := validateSalesPriceBookPolicy(input); err != nil {
		return err
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		current, err := model.GetSalesPriceBookVersionForUpdate(tx, input.Id)
		if err != nil {
			return err
		}
		if current.Status != model.SalesPriceBookVersionStatusDraft {
			return errors.New("only sales price book drafts can be edited")
		}
		if input.PriceBookId != 0 && input.PriceBookId != current.PriceBookId {
			return errors.New("sales price book version identity cannot be changed")
		}
		input.PriceBookId = current.PriceBookId
		input.Version = current.Version
		input.Status = current.Status
		input.ContentHash = emptySalesPriceBookContentHash(*input)
		policyChanged := input.CostBasisStrategy != current.CostBasisStrategy
		ratePairs := [][2]string{
			{input.PaymentFeeRate, current.PaymentFeeRate},
			{input.DistributionFeeRate, current.DistributionFeeRate},
			{input.OperationsLaborRate, current.OperationsLaborRate},
			{input.TotalVariableCostRate, current.TotalVariableCostRate},
			{input.EffectiveTaxRate, current.EffectiveTaxRate},
			{input.TargetNetMargin, current.TargetNetMargin},
			{input.MinimumMarginRate, current.MinimumMarginRate},
			{input.IncreaseCapRate, current.IncreaseCapRate},
		}
		for _, pair := range ratePairs {
			left, leftErr := decimal.NewFromString(pair[0])
			right, rightErr := decimal.NewFromString(pair[1])
			if leftErr != nil || rightErr != nil || !left.Equal(right) {
				policyChanged = true
				break
			}
		}
		if policyChanged {
			var itemIds []int
			if err := tx.Model(&model.SalesPriceBookItem{}).
				Where("price_book_version_id = ?", input.Id).
				Order("id ASC").Pluck("id", &itemIds).Error; err != nil {
				return err
			}
			for _, itemId := range itemIds {
				if err := deleteSalesPriceBookItemTx(tx, itemId, userId); err != nil {
					return err
				}
			}
		}
		if err := tx.Model(&model.SalesPriceBookVersion{}).Where("id = ?", input.Id).
			Select(
				"cost_basis_strategy", "payment_fee_rate", "distribution_fee_rate",
				"operations_labor_rate", "total_variable_cost_rate", "effective_tax_rate",
				"target_net_margin", "minimum_margin_rate", "increase_cap_rate",
				"content_hash", "remark", "updated_at",
			).Updates(input).Error; err != nil {
			return err
		}
		return tx.Create(&model.PricingAuditRecord{
			ObjectType: "sales_price_book_version", ObjectId: input.Id,
			Action: "edit_policy", OperatorId: userId, Comment: input.Remark,
		}).Error
	})
}

func PublishSalesPriceBookVersion(id int, userId int) error {
	return model.DB.Transaction(func(tx *gorm.DB) error {
		version, err := model.GetSalesPriceBookVersionForUpdate(tx, id)
		if err != nil {
			return err
		}
		if err := validateSalesPriceBookPolicy(&version); err != nil {
			return err
		}
		book, err := model.GetSalesPriceBookForUpdate(tx, version.PriceBookId)
		if err != nil {
			return err
		}
		var items []model.SalesPriceBookItem
		if err := tx.Where("price_book_version_id = ?", id).
			Order("model_id ASC").Find(&items).Error; err != nil {
			return err
		}
		if len(items) == 0 {
			return errors.New("sales price book version has no model prices")
		}
		enabledItems := 0
		for _, item := range items {
			if item.Status == SalesPriceItemStatusReviewRequired {
				var review struct {
					ModelName    string
					RiskCode     string
					ErrorMessage string
				}
				if err := tx.Table("models").
					Select(`models.model_name,
						pricing_change_batch_items.risk_code,
						pricing_change_batch_items.error_message`).
					Joins(`LEFT JOIN pricing_change_batch_items
						ON pricing_change_batch_items.target_id = ?
						AND pricing_change_batch_items.batch_id = ?
						AND pricing_change_batch_items.target_type = ?
						AND pricing_change_batch_items.status = ?`,
						item.Id, item.GeneratedByBatchId,
						"sales_price_book_item", PricingChangeBatchItemStatusReview).
					Where("models.id = ?", item.ModelId).
					Scan(&review).Error; err != nil {
					return err
				}
				if review.ModelName == "" {
					review.ModelName = fmt.Sprintf("%d", item.ModelId)
				}
				reasons := make([]string, 0, 2)
				if strings.TrimSpace(review.RiskCode) != "" {
					reasons = append(reasons, review.RiskCode)
				}
				if strings.TrimSpace(review.ErrorMessage) != "" {
					reasons = append(reasons, review.ErrorMessage)
				}
				if len(reasons) == 0 {
					return fmt.Errorf("model %s requires pricing review", review.ModelName)
				}
				return fmt.Errorf(
					"model %s requires pricing review: %s",
					review.ModelName, strings.Join(reasons, ": "),
				)
			}
			if item.Status != SalesPriceItemStatusEnabled {
				continue
			}
			enabledItems++
			if item.Currency != book.Currency {
				return fmt.Errorf(
					"model %d currency %s does not match price book currency %s",
					item.ModelId, item.Currency, book.Currency,
				)
			}
			if item.SalesExprHash != billingexpr.ExprHashString(item.SalesBillingExpr) {
				return fmt.Errorf("model %d sales expression hash mismatch", item.ModelId)
			}
			if _, err := billingexpr.CompileFromCache(item.SalesBillingExpr); err != nil {
				return fmt.Errorf("model %d sales expression: %w", item.ModelId, err)
			}
			if err := validateStructuredPricingContract(
				item.BillingMode, item.PriceStructure, item.PriceComponents, item.SalesBillingExpr,
			); err != nil {
				return fmt.Errorf("model %d structured sales price: %w", item.ModelId, err)
			}
		}
		if enabledItems == 0 {
			return errors.New("sales price book version has no enabled model prices")
		}
		itemIds := make([]int, 0, len(items))
		for _, item := range items {
			itemIds = append(itemIds, item.Id)
		}
		var sources []model.SalesPriceBookItemBasisSource
		if err := tx.Where("price_book_item_id IN ?", itemIds).
			Order("price_book_item_id ASC, channel_model_id ASC, purchase_price_version_id ASC, tier_key ASC, component_key ASC").
			Find(&sources).Error; err != nil {
			return err
		}
		version.ContentHash = salesPriceBookContentHash(version, items, sources)
		if err := tx.Model(&model.SalesPriceBookVersion{}).
			Where("id = ? AND status = ?", id, model.SalesPriceBookVersionStatusDraft).
			UpdateColumns(map[string]any{
				"content_hash": version.ContentHash,
				"updated_at":   common.GetTimestamp(),
			}).Error; err != nil {
			return err
		}
		if err := model.ActivateSalesPriceBookVersion(tx, version, userId, common.GetTimestamp()); err != nil {
			return err
		}
		return tx.Create(&model.PricingAuditRecord{
			ObjectType: "sales_price_book_version",
			ObjectId:   version.Id,
			Action:     "publish",
			OperatorId: userId,
		}).Error
	})
}

func AcceptSalesPriceBookItemReview(id int, userId int, comment string) error {
	if id <= 0 {
		return errors.New("sales price book item is required")
	}
	comment = strings.TrimSpace(comment)
	if comment == "" {
		return errors.New("review comment is required")
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		item, err := model.GetSalesPriceBookItemForUpdate(tx, id)
		if err != nil {
			return err
		}
		version, err := model.GetSalesPriceBookVersionForUpdate(tx, item.PriceBookVersionId)
		if err != nil {
			return err
		}
		if version.Status != model.SalesPriceBookVersionStatusDraft {
			return errors.New("only draft price book items can be reviewed")
		}
		if item.Status != SalesPriceItemStatusReviewRequired {
			return errors.New("sales price book item does not require review")
		}
		if err := tx.Model(&model.SalesPriceBookItem{}).Where("id = ?", id).
			Update("status", SalesPriceItemStatusEnabled).Error; err != nil {
			return err
		}
		if err := closeSalesPriceBookItemReviewTx(tx, item, PricingChangeBatchItemStatusAccepted); err != nil {
			return err
		}
		return tx.Create(&model.PricingAuditRecord{
			ObjectType: "sales_price_book_item", ObjectId: id,
			Action: "accept_risk", OperatorId: userId, Comment: comment,
		}).Error
	})
}

func RejectSalesPriceBookItemReview(id int, userId int, comment string) error {
	if id <= 0 {
		return errors.New("sales price book item is required")
	}
	comment = strings.TrimSpace(comment)
	if comment == "" {
		return errors.New("review comment is required")
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		item, err := model.GetSalesPriceBookItemForUpdate(tx, id)
		if err != nil {
			return err
		}
		version, err := model.GetSalesPriceBookVersionForUpdate(tx, item.PriceBookVersionId)
		if err != nil {
			return err
		}
		if version.Status != model.SalesPriceBookVersionStatusDraft {
			return errors.New("only draft price book items can be reviewed")
		}
		if item.Status != SalesPriceItemStatusReviewRequired {
			return errors.New("sales price book item does not require review")
		}
		if err := tx.Model(&model.SalesPriceBookItem{}).Where("id = ?", id).
			Update("status", SalesPriceItemStatusDisabled).Error; err != nil {
			return err
		}
		if err := closeSalesPriceBookItemReviewTx(tx, item, PricingChangeBatchItemStatusRejected); err != nil {
			return err
		}
		return tx.Create(&model.PricingAuditRecord{
			ObjectType: "sales_price_book_item", ObjectId: id,
			Action: "reject_risk", OperatorId: userId, Comment: comment,
		}).Error
	})
}

func closeSalesPriceBookItemReviewTx(
	tx *gorm.DB,
	item model.SalesPriceBookItem,
	status string,
) error {
	if item.GeneratedByBatchId == nil {
		return nil
	}
	result := tx.Model(&model.PricingChangeBatchItem{}).
		Where("batch_id = ? AND target_id = ? AND target_type = ? AND status = ?",
			*item.GeneratedByBatchId, item.Id, "sales_price_book_item", PricingChangeBatchItemStatusReview).
		Update("status", status)
	if result.Error != nil {
		return result.Error
	}
	var reviewCount int64
	if err := tx.Model(&model.PricingChangeBatchItem{}).
		Where("batch_id = ? AND status = ?", *item.GeneratedByBatchId, PricingChangeBatchItemStatusReview).
		Count(&reviewCount).Error; err != nil {
		return err
	}
	batchStatus := PricingChangeBatchStatusReviewRequired
	if reviewCount == 0 {
		batchStatus = PricingChangeBatchStatusCompleted
	}
	return tx.Model(&model.PricingChangeBatch{}).Where("id = ?", *item.GeneratedByBatchId).
		Updates(map[string]any{"review_count": int(reviewCount), "status": batchStatus}).Error
}

func CloneSalesPriceBookVersion(priceBookId int, sourceVersionId int, userId int) (*model.SalesPriceBookVersion, error) {
	if priceBookId <= 0 || sourceVersionId <= 0 {
		return nil, errors.New("sales price book and source version are required")
	}
	var cloned model.SalesPriceBookVersion
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		book, err := model.GetSalesPriceBookForUpdate(tx, priceBookId)
		if err != nil {
			return err
		}
		if book.Status == model.SalesPriceBookStatusArchived {
			return errors.New("archived sales price books cannot receive new versions")
		}
		var source model.SalesPriceBookVersion
		if err := tx.First(&source, sourceVersionId).Error; err != nil {
			return err
		}
		if source.PriceBookId != priceBookId {
			return errors.New("source version does not belong to the sales price book")
		}
		var maxVersion int64
		if err := tx.Model(&model.SalesPriceBookVersion{}).
			Where("price_book_id = ?", priceBookId).
			Select("COALESCE(MAX(version), 0)").Scan(&maxVersion).Error; err != nil {
			return err
		}
		cloned = source
		cloned.Id = 0
		cloned.Version = maxVersion + 1
		cloned.Status = model.SalesPriceBookVersionStatusDraft
		cloned.EffectiveFrom = 0
		cloned.EffectiveTo = 0
		cloned.ChangeBatchId = nil
		cloned.CreatedBy = userId
		cloned.PublishedBy = 0
		cloned.CreatedAt = 0
		cloned.UpdatedAt = 0
		cloned.PublishedAt = 0
		cloned.ContentHash = emptySalesPriceBookContentHash(cloned)
		if err := tx.Create(&cloned).Error; err != nil {
			return err
		}

		var sourceItems []model.SalesPriceBookItem
		if err := tx.Where("price_book_version_id = ?", sourceVersionId).
			Order("id ASC").Find(&sourceItems).Error; err != nil {
			return err
		}
		for _, sourceItem := range sourceItems {
			oldItemId := sourceItem.Id
			sourceItem.Id = 0
			sourceItem.PriceBookVersionId = cloned.Id
			sourceItem.GeneratedByBatchId = nil
			sourceItem.CreatedAt = 0
			if err := tx.Create(&sourceItem).Error; err != nil {
				return err
			}
			var sources []model.SalesPriceBookItemBasisSource
			if err := tx.Where("price_book_item_id = ?", oldItemId).
				Order("id ASC").Find(&sources).Error; err != nil {
				return err
			}
			for _, source := range sources {
				source.Id = 0
				source.PriceBookItemId = sourceItem.Id
				source.CreatedAt = 0
				if err := tx.Create(&source).Error; err != nil {
					return err
				}
			}
		}
		return tx.Create(&model.PricingAuditRecord{
			ObjectType: "sales_price_book_version",
			ObjectId:   cloned.Id,
			Action:     "clone",
			OperatorId: userId,
			Comment:    fmt.Sprintf("cloned from version %d", sourceVersionId),
		}).Error
	})
	if err != nil {
		return nil, err
	}
	return &cloned, nil
}

func DisableSalesPriceBook(id int, userId int) error {
	if id <= 0 {
		return errors.New("sales price book is required")
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		book, err := model.GetSalesPriceBookForUpdate(tx, id)
		if err != nil {
			return err
		}
		if book.Status == model.SalesPriceBookStatusArchived {
			return errors.New("archived sales price books cannot be disabled")
		}
		if book.Status == model.SalesPriceBookStatusDisabled {
			return nil
		}
		var defaultCount int64
		if err := tx.Model(&model.SalesPriceBookDefault{}).
			Where("price_book_id = ?", id).Count(&defaultCount).Error; err != nil {
			return err
		}
		if defaultCount > 0 {
			return errors.New("default sales price book cannot be disabled; set a replacement first")
		}
		var assignmentCount int64
		if err := tx.Model(&model.UserPriceBookAssignment{}).
			Where("price_book_id = ? AND status IN ?", id, []string{
				model.PriceBookAssignmentStatusActive,
				model.PriceBookAssignmentStatusScheduled,
			}).Where("effective_to = 0 OR effective_to > ?", common.GetTimestamp()).
			Count(&assignmentCount).Error; err != nil {
			return err
		}
		if assignmentCount > 0 {
			return errors.New("sales price book has active or scheduled assignments; migrate them before disabling")
		}
		if err := tx.Model(&model.SalesPriceBook{}).Where("id = ?", id).
			Updates(map[string]any{
				"status":     model.SalesPriceBookStatusDisabled,
				"updated_at": common.GetTimestamp(),
			}).Error; err != nil {
			return err
		}
		return tx.Create(&model.PricingAuditRecord{
			ObjectType: "sales_price_book",
			ObjectId:   id,
			Action:     "disable",
			OperatorId: userId,
		}).Error
	})
}

func UpdateSalesPriceBook(id int, name string, remark string, userId int) error {
	name = strings.TrimSpace(name)
	remark = strings.TrimSpace(remark)
	if id <= 0 || name == "" {
		return errors.New("sales price book and name are required")
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		book, err := model.GetSalesPriceBookForUpdate(tx, id)
		if err != nil {
			return err
		}
		if book.Status == model.SalesPriceBookStatusArchived {
			return errors.New("archived sales price books cannot be edited")
		}
		if err := tx.Model(&model.SalesPriceBook{}).Where("id = ?", id).
			Updates(map[string]any{"name": name, "remark": remark, "updated_at": common.GetTimestamp()}).Error; err != nil {
			return err
		}
		return tx.Create(&model.PricingAuditRecord{
			ObjectType: "sales_price_book", ObjectId: id,
			Action: "update", OperatorId: userId,
		}).Error
	})
}

func EnableSalesPriceBook(id int, userId int) error {
	if id <= 0 {
		return errors.New("sales price book is required")
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		book, err := model.GetSalesPriceBookForUpdate(tx, id)
		if err != nil {
			return err
		}
		if book.Status == model.SalesPriceBookStatusEnabled {
			return nil
		}
		if book.Status != model.SalesPriceBookStatusDisabled || book.CurrentVersionId == nil {
			return errors.New("only a disabled published sales price book can be enabled")
		}
		if err := tx.Model(&model.SalesPriceBook{}).Where("id = ?", id).
			Updates(map[string]any{"status": model.SalesPriceBookStatusEnabled, "updated_at": common.GetTimestamp()}).Error; err != nil {
			return err
		}
		return tx.Create(&model.PricingAuditRecord{
			ObjectType: "sales_price_book", ObjectId: id,
			Action: "enable", OperatorId: userId,
		}).Error
	})
}

func ArchiveSalesPriceBook(id int, userId int) error {
	if id <= 0 {
		return errors.New("sales price book is required")
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		book, err := model.GetSalesPriceBookForUpdate(tx, id)
		if err != nil {
			return err
		}
		if book.Status == model.SalesPriceBookStatusArchived {
			return nil
		}
		if book.Status != model.SalesPriceBookStatusDisabled {
			return errors.New("disable the sales price book before archiving it")
		}
		var references int64
		if err := tx.Model(&model.SalesPriceBookDefault{}).Where("price_book_id = ?", id).Count(&references).Error; err != nil {
			return err
		}
		if references > 0 {
			return errors.New("default sales price book cannot be archived")
		}
		if err := tx.Model(&model.UserPriceBookAssignment{}).
			Where("price_book_id = ? AND status IN ?", id, []string{
				model.PriceBookAssignmentStatusActive, model.PriceBookAssignmentStatusScheduled,
			}).Where("effective_to = 0 OR effective_to > ?", common.GetTimestamp()).
			Count(&references).Error; err != nil {
			return err
		}
		if references > 0 {
			return errors.New("sales price book has active or scheduled assignments")
		}
		if err := tx.Model(&model.SalesPriceBook{}).Where("id = ?", id).
			Updates(map[string]any{"status": model.SalesPriceBookStatusArchived, "updated_at": common.GetTimestamp()}).Error; err != nil {
			return err
		}
		return tx.Create(&model.PricingAuditRecord{
			ObjectType: "sales_price_book", ObjectId: id,
			Action: "archive", OperatorId: userId,
		}).Error
	})
}

func DeleteSalesPriceBookVersionDraft(id int, userId int) error {
	return deleteSalesPriceBookDraft(id, userId)
}

func DeleteSalesPriceBookItem(id int, userId int) error {
	if id <= 0 {
		return errors.New("sales price book item is required")
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		return deleteSalesPriceBookItemTx(tx, id, userId)
	})
}

func DeleteSalesPriceBookItems(ids []int, userId int) error {
	if len(ids) == 0 {
		return errors.New("at least one sales price book item is required")
	}
	if len(ids) > 10000 {
		return errors.New("sales price book item selection cannot exceed 10000")
	}
	seen := make(map[int]struct{}, len(ids))
	orderedIds := make([]int, 0, len(ids))
	for _, id := range ids {
		if id <= 0 {
			return errors.New("sales price book item ids contain an invalid value")
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		orderedIds = append(orderedIds, id)
	}
	sort.Ints(orderedIds)
	return model.DB.Transaction(func(tx *gorm.DB) error {
		for _, id := range orderedIds {
			if err := deleteSalesPriceBookItemTx(tx, id, userId); err != nil {
				return err
			}
		}
		return nil
	})
}

func deleteSalesPriceBookItemTx(tx *gorm.DB, id int, userId int) error {
	item, err := model.GetSalesPriceBookItemForUpdate(tx, id)
	if err != nil {
		return err
	}
	version, err := model.GetSalesPriceBookVersionForUpdate(tx, item.PriceBookVersionId)
	if err != nil {
		return err
	}
	if version.Status != model.SalesPriceBookVersionStatusDraft {
		return errors.New("only draft price book items can be deleted")
	}
	if item.Status == SalesPriceItemStatusReviewRequired {
		if err := closeSalesPriceBookItemReviewTx(tx, item, PricingChangeBatchItemStatusRejected); err != nil {
			return err
		}
	}
	if err := tx.Where("price_book_item_id = ?", id).
		Delete(&model.SalesPriceBookItemBasisSource{}).Error; err != nil {
		return err
	}
	if err := tx.Delete(&model.SalesPriceBookItem{}, id).Error; err != nil {
		return err
	}
	if err := tx.Create(&model.PricingAuditRecord{
		ObjectType: "sales_price_book_item", ObjectId: id,
		Action: "delete_item", OperatorId: userId,
	}).Error; err != nil {
		return err
	}
	return tx.Create(&model.PricingAuditRecord{
		ObjectType: "sales_price_book_version", ObjectId: version.Id,
		Action: "delete_item", OperatorId: userId,
		Comment: fmt.Sprintf("model_id=%d, item_id=%d", item.ModelId, item.Id),
	}).Error
}

func SetSalesPriceBookItemEnabled(id int, enabled bool, userId int) error {
	if id <= 0 {
		return errors.New("sales price book item is required")
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		item, err := model.GetSalesPriceBookItemForUpdate(tx, id)
		if err != nil {
			return err
		}
		version, err := model.GetSalesPriceBookVersionForUpdate(tx, item.PriceBookVersionId)
		if err != nil {
			return err
		}
		if version.Status != model.SalesPriceBookVersionStatusDraft {
			return errors.New("only draft price book items can be changed")
		}
		if item.Status == SalesPriceItemStatusReviewRequired {
			return errors.New("review-required items must be accepted or rejected")
		}
		status, action := SalesPriceItemStatusDisabled, "disable_item"
		if enabled {
			status, action = SalesPriceItemStatusEnabled, "enable_item"
		}
		if err := tx.Model(&model.SalesPriceBookItem{}).Where("id = ?", id).Update("status", status).Error; err != nil {
			return err
		}
		return tx.Create(&model.PricingAuditRecord{
			ObjectType: "sales_price_book_item", ObjectId: id,
			Action: action, OperatorId: userId,
		}).Error
	})
}

func AssignUserToSalesPriceBook(input *model.UserPriceBookAssignment, userId int) error {
	if input == nil {
		return errors.New("price book assignment is required")
	}
	if input.UserId <= 0 || input.PriceBookId <= 0 {
		return errors.New("user and sales price book are required")
	}
	if input.VersionPolicy != "follow_current" && input.VersionPolicy != "pin_version" {
		return fmt.Errorf("unsupported price book version policy %q", input.VersionPolicy)
	}
	input.Id = 0
	input.CreatedBy = userId
	return model.DB.Transaction(func(tx *gorm.DB) error {
		book, err := model.GetSalesPriceBookForUpdate(tx, input.PriceBookId)
		if err != nil {
			return err
		}
		if book.Status != model.SalesPriceBookStatusEnabled || book.CurrentVersionId == nil {
			return errors.New("sales price book is not enabled")
		}
		if book.Audience != "tob" {
			return errors.New("direct user assignments require a TOB sales price book")
		}
		if input.VersionPolicy == "pin_version" {
			if input.PinnedVersionId == nil {
				return errors.New("pinned sales price book version is required")
			}
			var pinned model.SalesPriceBookVersion
			if err := tx.First(&pinned, *input.PinnedVersionId).Error; err != nil {
				return err
			}
			if pinned.PriceBookId != input.PriceBookId ||
				(pinned.Status != model.SalesPriceBookVersionStatusActive &&
					pinned.Status != model.SalesPriceBookVersionStatusSuperseded) ||
				pinned.PublishedAt == 0 {
				return errors.New("pinned sales price book version is not published for this book")
			}
		} else {
			input.PinnedVersionId = nil
		}
		if err := model.ReplaceUserPriceBookAssignment(tx, input); err != nil {
			return err
		}
		commentParts := []string{fmt.Sprintf("user #%d", input.UserId)}
		if input.QuoteReference != "" {
			commentParts = append(commentParts, "quote "+input.QuoteReference)
		}
		if input.ContractReference != "" {
			commentParts = append(commentParts, "contract "+input.ContractReference)
		}
		return tx.Create(&model.PricingAuditRecord{
			ObjectType: "user_price_book_assignment",
			ObjectId:   input.Id,
			Action:     "assign",
			OperatorId: userId,
			Comment:    strings.Join(commentParts, "; "),
		}).Error
	})
}

func CancelUserPriceBookAssignment(id int, userId int) error {
	if id <= 0 {
		return errors.New("price book assignment is required")
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		assignment, err := model.GetUserPriceBookAssignmentForUpdate(tx, id)
		if err != nil {
			return err
		}
		if assignment.Status != model.PriceBookAssignmentStatusActive &&
			assignment.Status != model.PriceBookAssignmentStatusScheduled {
			return errors.New("only active or scheduled price book assignments can be cancelled")
		}
		now := common.GetTimestamp()
		if err := tx.Model(&model.UserPriceBookAssignment{}).Where("id = ?", id).
			Updates(map[string]any{
				"status":       model.PriceBookAssignmentStatusCancelled,
				"effective_to": now,
				"updated_at":   now,
			}).Error; err != nil {
			return err
		}
		if assignment.Status == model.PriceBookAssignmentStatusScheduled {
			if err := tx.Model(&model.UserPriceBookAssignment{}).
				Where("user_id = ? AND status = ? AND effective_to = ?",
					assignment.UserId, model.PriceBookAssignmentStatusActive, assignment.EffectiveFrom).
				Updates(map[string]any{"effective_to": 0, "updated_at": now}).Error; err != nil {
				return err
			}
		}
		return tx.Create(&model.PricingAuditRecord{
			ObjectType: "user_price_book_assignment",
			ObjectId:   id,
			Action:     "cancel",
			OperatorId: userId,
			Comment:    fmt.Sprintf("user #%d", assignment.UserId),
		}).Error
	})
}

func emptySalesPriceBookContentHash(version model.SalesPriceBookVersion) string {
	return salesPriceBookContentHash(version, nil, nil)
}

func salesPriceBookContentHash(
	version model.SalesPriceBookVersion,
	items []model.SalesPriceBookItem,
	sources []model.SalesPriceBookItemBasisSource,
) string {
	sort.Slice(items, func(left int, right int) bool {
		return items[left].ModelId < items[right].ModelId
	})
	parts := []string{
		fmt.Sprintf("%d", version.PriceBookId),
		version.CostBasisStrategy,
		version.PaymentFeeRate,
		version.DistributionFeeRate,
		version.OperationsLaborRate,
		version.TotalVariableCostRate,
		version.EffectiveTaxRate,
		version.TargetNetMargin,
		version.MinimumMarginRate,
		version.IncreaseCapRate,
	}
	sourcesByItem := make(map[int][]model.SalesPriceBookItemBasisSource)
	for _, source := range sources {
		sourcesByItem[source.PriceBookItemId] = append(sourcesByItem[source.PriceBookItemId], source)
	}
	for _, item := range items {
		parts = append(parts, strings.Join([]string{
			fmt.Sprintf("%d", item.ModelId), item.Status, item.BillingMode,
			item.PriceStructure, item.PriceComponents, item.SalesBillingExpr,
			item.SalesExprHash, item.ExpressionSource, item.ExpressionSchemaVersion,
			item.PricingMethod, optionalIntHash(item.OfficialPriceVersionId),
			optionalIntHash(item.PrimaryPurchaseVersionId), item.SellingFactor,
			item.OfficialDiscount, item.MinimumMarginOverride, item.Currency,
		}, "\x00"))
		itemSources := sourcesByItem[item.Id]
		sort.Slice(itemSources, func(left int, right int) bool {
			leftKey := fmt.Sprintf("%010d:%010d:%s:%s:%s", itemSources[left].ChannelModelId,
				itemSources[left].PurchasePriceVersionId, itemSources[left].TierKey,
				itemSources[left].ComponentKey, itemSources[left].SourceRole)
			rightKey := fmt.Sprintf("%010d:%010d:%s:%s:%s", itemSources[right].ChannelModelId,
				itemSources[right].PurchasePriceVersionId, itemSources[right].TierKey,
				itemSources[right].ComponentKey, itemSources[right].SourceRole)
			return leftKey < rightKey
		})
		for _, source := range itemSources {
			parts = append(parts, strings.Join([]string{
				fmt.Sprintf("%d", item.ModelId), fmt.Sprintf("%d", source.ChannelModelId),
				fmt.Sprintf("%d", source.PurchasePriceVersionId), source.TierKey,
				source.ComponentKey, source.SourceRole, source.SourceValue,
				source.SelectionReason,
			}, "\x00"))
		}
	}
	return fmt.Sprintf("%x", sha256.Sum256([]byte(strings.Join(parts, "\n"))))
}

func optionalIntHash(value *int) string {
	if value == nil {
		return ""
	}
	return fmt.Sprintf("%d", *value)
}

func ListSalesPriceBookVersions(priceBookId int) ([]model.SalesPriceBookVersion, error) {
	versions := make([]model.SalesPriceBookVersion, 0)
	err := model.DB.Where("price_book_id = ?", priceBookId).
		Order("version DESC").Find(&versions).Error
	return versions, err
}

func ListSalesPriceBookItems(versionId int) ([]SalesPriceBookItemListItem, error) {
	items := make([]SalesPriceBookItemListItem, 0)
	query := model.DB.Table("sales_price_book_items").
		Select("sales_price_book_items.*, models.model_name AS model_name").
		Joins("JOIN models ON models.id = sales_price_book_items.model_id")
	if model.DB.Migrator().HasTable(&model.PricingChangeBatchItem{}) {
		query = query.Select(`sales_price_book_items.*, models.model_name AS model_name,
			pricing_change_batch_items.risk_code AS review_risk_code,
			pricing_change_batch_items.error_message AS review_reason`).
			Joins(`LEFT JOIN pricing_change_batch_items
			ON pricing_change_batch_items.batch_id = sales_price_book_items.generated_by_batch_id
			AND pricing_change_batch_items.target_type = ?
			AND pricing_change_batch_items.target_id = sales_price_book_items.id
			AND pricing_change_batch_items.status = ?`,
				"sales_price_book_item", PricingChangeBatchItemStatusReview)
	}
	err := query.Where("sales_price_book_items.price_book_version_id = ?", versionId).
		Order("models.model_name ASC, sales_price_book_items.model_id ASC").
		Scan(&items).Error
	if err != nil || len(items) == 0 {
		return items, err
	}
	for index := range items {
		if items[index].PricingMethod != "official_discount" {
			continue
		}
		if _, err := decimal.NewFromString(strings.TrimSpace(items[index].OfficialDiscount)); err == nil {
			items[index].SalesDiscount = items[index].OfficialDiscount
		}
	}
	if !model.DB.Migrator().HasTable(&model.SalesPriceBookItemBasisSource{}) ||
		!model.DB.Migrator().HasTable(&model.ChannelModelPurchasePriceVersion{}) {
		return items, nil
	}

	var version model.SalesPriceBookVersion
	costBasisStrategy := "max_eligible_cost"
	if err := model.DB.Select("id", "cost_basis_strategy").First(&version, versionId).Error; err != nil &&
		!errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	} else if err == nil && version.CostBasisStrategy != "" {
		costBasisStrategy = version.CostBasisStrategy
	}
	itemIds := make([]int, 0, len(items))
	for _, item := range items {
		itemIds = append(itemIds, item.Id)
	}
	type basisDiscount struct {
		PriceBookItemId        int    `gorm:"column:price_book_item_id"`
		PurchasePriceVersionId int    `gorm:"column:purchase_price_version_id"`
		PricingMode            string `gorm:"column:pricing_mode"`
		PurchaseDiscount       string `gorm:"column:purchase_discount"`
	}
	basisDiscounts := make([]basisDiscount, 0)
	if err := model.DB.Table("sales_price_book_item_basis_sources AS basis").
		Select(`basis.price_book_item_id, basis.purchase_price_version_id,
			purchase.pricing_mode, purchase.purchase_discount`).
		Joins(`JOIN channel_model_purchase_price_versions AS purchase
			ON purchase.id = basis.purchase_price_version_id`).
		Where("basis.price_book_item_id IN ?", itemIds).
		Where("basis.source_role IN ?", []string{"selected", "cost_basis"}).
		Order("basis.price_book_item_id ASC, basis.purchase_price_version_id ASC").
		Scan(&basisDiscounts).Error; err != nil {
		return nil, err
	}

	discountsByItem := make(map[int][]decimal.Decimal, len(items))
	seenPurchaseVersion := make(map[int]map[int]struct{}, len(items))
	for _, basis := range basisDiscounts {
		if basis.PricingMode != "official_ratio" {
			continue
		}
		discount, err := decimal.NewFromString(strings.TrimSpace(basis.PurchaseDiscount))
		if err != nil || discount.IsNegative() {
			continue
		}
		if seenPurchaseVersion[basis.PriceBookItemId] == nil {
			seenPurchaseVersion[basis.PriceBookItemId] = make(map[int]struct{})
		}
		if _, exists := seenPurchaseVersion[basis.PriceBookItemId][basis.PurchasePriceVersionId]; exists {
			continue
		}
		seenPurchaseVersion[basis.PriceBookItemId][basis.PurchasePriceVersionId] = struct{}{}
		discountsByItem[basis.PriceBookItemId] = append(
			discountsByItem[basis.PriceBookItemId], discount,
		)
	}

	for index := range items {
		discounts := discountsByItem[items[index].Id]
		if len(discounts) > 0 {
			purchaseDiscount := discounts[0]
			for _, candidate := range discounts[1:] {
				shouldReplace := candidate.GreaterThan(purchaseDiscount)
				if costBasisStrategy == "min_eligible_cost" {
					shouldReplace = candidate.LessThan(purchaseDiscount)
				}
				if shouldReplace {
					purchaseDiscount = candidate
				}
			}
			items[index].PurchaseDiscount = purchaseDiscount.String()
			if items[index].PricingMethod == "cost_plus" {
				sellingFactor, err := decimal.NewFromString(strings.TrimSpace(items[index].SellingFactor))
				if err == nil && !sellingFactor.IsNegative() {
					items[index].SalesDiscount = purchaseDiscount.Mul(sellingFactor).String()
				}
			}
		}
	}
	return items, nil
}

func ListSalesPriceBookAuditRecords(
	priceBookId int,
	page int,
	pageSize int,
) ([]PricingAuditRecordListItem, int64, error) {
	if priceBookId <= 0 {
		return nil, 0, errors.New("sales price book is required")
	}
	page, pageSize = normalizeSalesPriceBookPage(page, pageSize)
	var versionIds []int
	if err := model.DB.Model(&model.SalesPriceBookVersion{}).
		Where("price_book_id = ?", priceBookId).Pluck("id", &versionIds).Error; err != nil {
		return nil, 0, err
	}
	var itemIds []int
	if len(versionIds) > 0 {
		if err := model.DB.Model(&model.SalesPriceBookItem{}).
			Where("price_book_version_id IN ?", versionIds).Pluck("id", &itemIds).Error; err != nil {
			return nil, 0, err
		}
	}
	var assignmentIds []int
	if err := model.DB.Model(&model.UserPriceBookAssignment{}).
		Where("price_book_id = ?", priceBookId).Pluck("id", &assignmentIds).Error; err != nil {
		return nil, 0, err
	}
	var batchIds []int
	if err := model.DB.Model(&model.PricingChangeBatchItem{}).
		Where("price_book_id = ?", priceBookId).
		Distinct("batch_id").Pluck("batch_id", &batchIds).Error; err != nil {
		return nil, 0, err
	}
	query := model.DB.Table("pricing_audit_records AS audit").
		Where(
			"(audit.object_type = ? AND audit.object_id = ?) OR (audit.object_type = ? AND audit.object_id = ?)",
			"sales_price_book", priceBookId, "sales_price_book_default", priceBookId,
		)
	if len(versionIds) > 0 {
		query = query.Or("(audit.object_type = ? AND audit.object_id IN ?)",
			"sales_price_book_version", versionIds)
	}
	if len(itemIds) > 0 {
		query = query.Or("(audit.object_type = ? AND audit.object_id IN ?)",
			"sales_price_book_item", itemIds)
	}
	if len(assignmentIds) > 0 {
		query = query.Or("(audit.object_type = ? AND audit.object_id IN ?)",
			"user_price_book_assignment", assignmentIds)
	}
	if len(batchIds) > 0 {
		query = query.Or("(audit.object_type = ? AND audit.object_id IN ?)",
			"pricing_change_batch", batchIds)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]PricingAuditRecordListItem, 0)
	err := query.Select("audit.*, users.username AS operator_username").
		Joins("LEFT JOIN users ON users.id = audit.operator_id").
		Order("audit.id DESC").Offset((page - 1) * pageSize).Limit(pageSize).
		Scan(&items).Error
	return items, total, err
}

func ListUserPriceBookAssignments(
	filter UserPriceBookAssignmentListFilter,
) ([]UserPriceBookAssignmentListItem, int64, error) {
	if err := RefreshUserPriceBookAssignmentStatuses(); err != nil {
		return nil, 0, err
	}
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	filter.Status = strings.ToLower(strings.TrimSpace(filter.Status))
	filter.Page, filter.PageSize = normalizeSalesPriceBookPage(filter.Page, filter.PageSize)
	if filter.UserId < 0 || filter.PriceBookId < 0 {
		return nil, 0, errors.New("user and sales price book filters cannot be negative")
	}
	if filter.Status != "" {
		if _, ok := validPriceBookAssignmentStatuses[filter.Status]; !ok {
			return nil, 0, fmt.Errorf("unsupported price book assignment status %q", filter.Status)
		}
	}

	query := model.DB.Table("user_price_book_assignments").
		Joins("JOIN users ON users.id = user_price_book_assignments.user_id").
		Joins("JOIN sales_price_books ON sales_price_books.id = user_price_book_assignments.price_book_id").
		Joins("LEFT JOIN sales_price_book_versions AS pinned_versions ON pinned_versions.id = user_price_book_assignments.pinned_version_id")
	if filter.Keyword != "" {
		pattern := "%" + strings.ToLower(filter.Keyword) + "%"
		query = query.Where(
			"LOWER(users.username) LIKE ? OR LOWER(user_price_book_assignments.quote_reference) LIKE ? OR LOWER(user_price_book_assignments.contract_reference) LIKE ?",
			pattern, pattern, pattern,
		)
	}
	if filter.UserId > 0 {
		query = query.Where("user_price_book_assignments.user_id = ?", filter.UserId)
	}
	if filter.PriceBookId > 0 {
		query = query.Where("user_price_book_assignments.price_book_id = ?", filter.PriceBookId)
	}
	if filter.Status != "" {
		query = query.Where("user_price_book_assignments.status = ?", filter.Status)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var assignments []UserPriceBookAssignmentListItem
	err := query.Select(
		"user_price_book_assignments.*, users.username AS username, sales_price_books.name AS price_book_name, sales_price_books.code AS price_book_code, COALESCE(pinned_versions.version, 0) AS pinned_version_number",
	).Order("user_price_book_assignments.id DESC").
		Offset((filter.Page - 1) * filter.PageSize).
		Limit(filter.PageSize).
		Scan(&assignments).Error
	return assignments, total, err
}

func RefreshUserPriceBookAssignmentStatuses() error {
	now := common.GetTimestamp()
	return model.DB.Transaction(func(tx *gorm.DB) error {
		return refreshUserPriceBookAssignmentStatusesTx(tx, now)
	})
}

func refreshUserPriceBookAssignmentStatusesTx(tx *gorm.DB, now int64) error {
	if err := tx.Model(&model.UserPriceBookAssignment{}).
		Where("status IN ? AND effective_to > 0 AND effective_to <= ?", []string{
			model.PriceBookAssignmentStatusActive,
			model.PriceBookAssignmentStatusScheduled,
		}, now).
		Updates(map[string]any{
			"status": model.PriceBookAssignmentStatusExpired, "updated_at": now,
		}).Error; err != nil {
		return err
	}
	var due []model.UserPriceBookAssignment
	if err := tx.Where(
		"status = ? AND effective_from <= ? AND (effective_to = 0 OR effective_to > ?)",
		model.PriceBookAssignmentStatusScheduled, now, now,
	).Order("effective_from ASC, id ASC").Find(&due).Error; err != nil {
		return err
	}
	for _, assignment := range due {
		if err := tx.Model(&model.UserPriceBookAssignment{}).
			Where("user_id = ? AND status = ? AND id <> ?", assignment.UserId,
				model.PriceBookAssignmentStatusActive, assignment.Id).
			Updates(map[string]any{
				"status":       model.PriceBookAssignmentStatusExpired,
				"effective_to": assignment.EffectiveFrom,
				"updated_at":   now,
			}).Error; err != nil {
			return err
		}
		result := tx.Model(&model.UserPriceBookAssignment{}).
			Where("id = ? AND status = ?", assignment.Id, model.PriceBookAssignmentStatusScheduled).
			Updates(map[string]any{
				"status": model.PriceBookAssignmentStatusActive, "updated_at": now,
			})
		if result.Error != nil {
			return result.Error
		}
	}
	return nil
}

func SetDefaultSalesPriceBook(defaultKey string, priceBookId int, userId int) error {
	defaultKey = strings.TrimSpace(defaultKey)
	if defaultKey != "toc_default" {
		return fmt.Errorf("unsupported sales price book default %q", defaultKey)
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		book, err := model.GetSalesPriceBookForUpdate(tx, priceBookId)
		if err != nil {
			return err
		}
		if book.Status != model.SalesPriceBookStatusEnabled || book.CurrentVersionId == nil {
			return errors.New("default sales price book must be enabled and published")
		}
		if book.Audience != "toc" {
			return errors.New("TOC default requires a TOC sales price book")
		}
		value := model.SalesPriceBookDefault{
			DefaultKey: defaultKey, PriceBookId: priceBookId,
			UpdatedBy: userId, UpdatedAt: common.GetTimestamp(),
		}
		var existing model.SalesPriceBookDefault
		err = tx.First(&existing, "default_key = ?", defaultKey).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if err := tx.Create(&value).Error; err != nil {
				return err
			}
			return tx.Create(&model.PricingAuditRecord{
				ObjectType: "sales_price_book_default",
				ObjectId:   priceBookId,
				Action:     "set_default",
				OperatorId: userId,
				Comment:    defaultKey,
			}).Error
		}
		if err != nil {
			return err
		}
		if err := tx.Model(&model.SalesPriceBookDefault{}).
			Where("default_key = ?", defaultKey).
			Updates(map[string]any{
				"price_book_id": priceBookId,
				"updated_by":    userId,
				"updated_at":    value.UpdatedAt,
			}).Error; err != nil {
			return err
		}
		return tx.Create(&model.PricingAuditRecord{
			ObjectType: "sales_price_book_default",
			ObjectId:   priceBookId,
			Action:     "set_default",
			OperatorId: userId,
			Comment:    defaultKey,
		}).Error
	})
}

func GetDefaultSalesPriceBook(defaultKey string) (*model.SalesPriceBookDefault, error) {
	defaultKey = strings.TrimSpace(defaultKey)
	if defaultKey != "toc_default" {
		return nil, fmt.Errorf("unsupported sales price book default %q", defaultKey)
	}
	var value model.SalesPriceBookDefault
	if err := model.DB.First(&value, "default_key = ?", defaultKey).Error; err != nil {
		return nil, err
	}
	return &value, nil
}
