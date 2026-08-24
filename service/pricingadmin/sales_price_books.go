package pricingadmin

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"sort"
	"strings"

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
		"max_eligible_cost": {}, "designated_channel": {},
		"min_eligible_cost": {}, "official_price": {}, "manual": {},
	}
	validRepriceModes = map[string]struct{}{
		"manual": {}, "review": {}, "automatic": {},
	}
	validPriceBookRiskActions = map[string]struct{}{
		"exclude_channel": {}, "block_model": {},
	}
	validSalesPricingMethods = map[string]struct{}{
		"cost_plus": {}, "official_discount": {}, "fixed": {},
		"copied": {}, "manual": {},
	}
)

type SalesPriceBookListItem struct {
	model.SalesPriceBook
	CurrentVersion *model.SalesPriceBookVersion `json:"current_version,omitempty"`
	ModelCount     int64                        `json:"model_count"`
	AssignedUsers  int64                        `json:"assigned_users"`
}

type SalesPriceBookItemListItem struct {
	model.SalesPriceBookItem
	ModelName string `json:"model_name"`
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
	Username      string `json:"username"`
	PriceBookName string `json:"price_book_name"`
	PriceBookCode string `json:"price_book_code"`
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
	return model.DB.Create(input).Error
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
	var assignmentCounts []struct {
		PriceBookId int
		Count       int64
	}
	if err := model.DB.Model(&model.UserPriceBookAssignment{}).
		Select("price_book_id, COUNT(*) AS count").
		Where("price_book_id IN ? AND status IN ?", bookIds, []string{
			model.PriceBookAssignmentStatusActive,
			model.PriceBookAssignmentStatusScheduled,
		}).Group("price_book_id").Scan(&assignmentCounts).Error; err != nil {
		return nil, 0, err
	}
	for _, count := range assignmentCounts {
		assignedUsersByBook[count.PriceBookId] = count.Count
	}

	items := make([]SalesPriceBookListItem, 0, len(books))
	for _, book := range books {
		item := SalesPriceBookListItem{
			SalesPriceBook: book,
			AssignedUsers:  assignedUsersByBook[book.Id],
		}
		if book.CurrentVersionId != nil {
			if version, ok := versionsById[*book.CurrentVersionId]; ok {
				item.CurrentVersion = &version
				item.ModelCount = modelCountsByVersion[version.Id]
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
		return tx.Create(input).Error
	})
}

func validateSalesPriceBookPolicy(input *model.SalesPriceBookVersion) error {
	if _, ok := validCostBasisStrategies[input.CostBasisStrategy]; !ok {
		return fmt.Errorf("unsupported cost basis strategy %q", input.CostBasisStrategy)
	}
	if _, ok := validRepriceModes[input.RepriceMode]; !ok {
		return fmt.Errorf("unsupported reprice mode %q", input.RepriceMode)
	}
	if _, ok := validPriceBookRiskActions[input.RiskAction]; !ok {
		return fmt.Errorf("unsupported price book risk action %q", input.RiskAction)
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
	if input.RoundingMode != "ceil" {
		return errors.New("sales price book rounding mode must be ceil")
	}
	if input.RoundingScale < 0 || input.RoundingScale > 12 {
		return errors.New("sales price book rounding scale must be between 0 and 12")
	}
	return nil
}

func SaveSalesPriceBookItem(input *model.SalesPriceBookItem) error {
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
	input.SalesExprHash = billingexpr.ExprHashString(input.SalesBillingExpr)
	return model.DB.Transaction(func(tx *gorm.DB) error {
		version, err := model.GetSalesPriceBookVersionForUpdate(tx, input.PriceBookVersionId)
		if err != nil {
			return err
		}
		if version.Status != model.SalesPriceBookVersionStatusDraft {
			return errors.New("only sales price book drafts can be edited")
		}
		if input.Id == 0 {
			return tx.Create(input).Error
		}
		var current model.SalesPriceBookItem
		if err := tx.First(&current, input.Id).Error; err != nil {
			return err
		}
		if current.PriceBookVersionId != input.PriceBookVersionId || current.ModelId != input.ModelId {
			return errors.New("sales price book item identity cannot be changed")
		}
		return tx.Model(&model.SalesPriceBookItem{}).Where("id = ?", input.Id).
			Select(
				"status", "billing_mode", "price_structure", "price_components",
				"sales_billing_expr", "sales_expr_hash", "expression_source",
				"expression_schema_version", "pricing_method",
				"official_price_version_id", "primary_purchase_version_id",
				"selling_factor", "official_discount", "minimum_margin_override",
				"currency", "generated_by_batch_id", "remark",
			).Updates(input).Error
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
		var items []model.SalesPriceBookItem
		if err := tx.Where("price_book_version_id = ?", id).
			Order("model_id ASC").Find(&items).Error; err != nil {
			return err
		}
		if len(items) == 0 {
			return errors.New("sales price book version has no model prices")
		}
		for _, item := range items {
			if item.Status == SalesPriceItemStatusReviewRequired {
				return fmt.Errorf("model %d requires pricing review", item.ModelId)
			}
			if item.Status != SalesPriceItemStatusEnabled {
				continue
			}
			if item.SalesExprHash != billingexpr.ExprHashString(item.SalesBillingExpr) {
				return fmt.Errorf("model %d sales expression hash mismatch", item.ModelId)
			}
			if _, err := billingexpr.CompileFromCache(item.SalesBillingExpr); err != nil {
				return fmt.Errorf("model %d sales expression: %w", item.ModelId, err)
			}
		}
		version.ContentHash = salesPriceBookContentHash(version, items)
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
		if input.VersionPolicy == "pin_version" {
			if input.PinnedVersionId == nil {
				return errors.New("pinned sales price book version is required")
			}
			var pinned model.SalesPriceBookVersion
			if err := tx.First(&pinned, *input.PinnedVersionId).Error; err != nil {
				return err
			}
			if pinned.PriceBookId != input.PriceBookId || pinned.Status != model.SalesPriceBookVersionStatusActive {
				return errors.New("pinned sales price book version is not active for this book")
			}
		} else {
			input.PinnedVersionId = nil
		}
		if err := model.ReplaceUserPriceBookAssignment(tx, input); err != nil {
			return err
		}
		return tx.Create(&model.PricingAuditRecord{
			ObjectType: "user_price_book_assignment",
			ObjectId:   input.Id,
			Action:     "assign",
			OperatorId: userId,
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
		return tx.Create(&model.PricingAuditRecord{
			ObjectType: "user_price_book_assignment",
			ObjectId:   id,
			Action:     "cancel",
			OperatorId: userId,
		}).Error
	})
}

func emptySalesPriceBookContentHash(version model.SalesPriceBookVersion) string {
	return salesPriceBookContentHash(version, nil)
}

func salesPriceBookContentHash(
	version model.SalesPriceBookVersion,
	items []model.SalesPriceBookItem,
) string {
	sort.Slice(items, func(left int, right int) bool {
		return items[left].ModelId < items[right].ModelId
	})
	parts := []string{
		fmt.Sprintf("%d", version.PriceBookId),
		version.CostBasisStrategy,
		version.RepriceMode,
		version.PaymentFeeRate,
		version.DistributionFeeRate,
		version.OperationsLaborRate,
		version.TotalVariableCostRate,
		version.EffectiveTaxRate,
		version.TargetNetMargin,
		version.MinimumMarginRate,
		version.RiskAction,
	}
	for _, item := range items {
		parts = append(parts, fmt.Sprintf("%d:%s:%s", item.ModelId, item.Status, item.SalesExprHash))
	}
	return fmt.Sprintf("%x", sha256.Sum256([]byte(strings.Join(parts, "\n"))))
}

func ListSalesPriceBookVersions(priceBookId int) ([]model.SalesPriceBookVersion, error) {
	var versions []model.SalesPriceBookVersion
	err := model.DB.Where("price_book_id = ?", priceBookId).
		Order("version DESC").Find(&versions).Error
	return versions, err
}

func ListSalesPriceBookItems(versionId int) ([]SalesPriceBookItemListItem, error) {
	var items []SalesPriceBookItemListItem
	err := model.DB.Table("sales_price_book_items").
		Select("sales_price_book_items.*, models.model_name AS model_name").
		Joins("JOIN models ON models.id = sales_price_book_items.model_id").
		Where("sales_price_book_items.price_book_version_id = ?", versionId).
		Order("models.model_name ASC, sales_price_book_items.model_id ASC").
		Scan(&items).Error
	return items, err
}

func ListUserPriceBookAssignments(
	filter UserPriceBookAssignmentListFilter,
) ([]UserPriceBookAssignmentListItem, int64, error) {
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
		Joins("JOIN sales_price_books ON sales_price_books.id = user_price_book_assignments.price_book_id")
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
		"user_price_book_assignments.*, users.username AS username, sales_price_books.name AS price_book_name, sales_price_books.code AS price_book_code",
	).Order("user_price_book_assignments.id DESC").
		Offset((filter.Page - 1) * filter.PageSize).
		Limit(filter.PageSize).
		Scan(&assignments).Error
	return assignments, total, err
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
