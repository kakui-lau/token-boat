package model

import (
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const (
	SalesPriceBookStatusDraft    = "draft"
	SalesPriceBookStatusEnabled  = "enabled"
	SalesPriceBookStatusDisabled = "disabled"
	SalesPriceBookStatusArchived = "archived"

	SalesPriceBookVersionStatusDraft      = "draft"
	SalesPriceBookVersionStatusActive     = "active"
	SalesPriceBookVersionStatusSuperseded = "superseded"
	SalesPriceBookVersionStatusCancelled  = "cancelled"

	PriceBookAssignmentStatusScheduled = "scheduled"
	PriceBookAssignmentStatusActive    = "active"
	PriceBookAssignmentStatusExpired   = "expired"
	PriceBookAssignmentStatusCancelled = "cancelled"
)

// SalesPriceBook is the stable identity of a reusable TOC or TOB offer group.
// Customer-facing prices live on its immutable versions and never on a route.
type SalesPriceBook struct {
	Id               int    `json:"id"`
	Code             string `json:"code" gorm:"type:varchar(64);not null;uniqueIndex"`
	Name             string `json:"name" gorm:"type:varchar(128);not null"`
	Audience         string `json:"audience" gorm:"type:varchar(16);not null;index"`
	Currency         string `json:"currency" gorm:"type:varchar(8);not null"`
	Status           string `json:"status" gorm:"type:varchar(16);not null;index"`
	CurrentVersionId *int   `json:"current_version_id" gorm:"index"`
	CreatedBy        int    `json:"created_by" gorm:"not null"`
	CreatedAt        int64  `json:"created_at" gorm:"bigint;not null;index"`
	UpdatedAt        int64  `json:"updated_at" gorm:"bigint;not null"`
	Remark           string `json:"remark" gorm:"type:varchar(255)"`
}

func (b *SalesPriceBook) BeforeCreate(tx *gorm.DB) error {
	now := common.GetTimestamp()
	b.Code = strings.TrimSpace(b.Code)
	b.Name = strings.TrimSpace(b.Name)
	b.Audience = strings.TrimSpace(b.Audience)
	b.Currency = strings.ToUpper(strings.TrimSpace(b.Currency))
	b.CreatedAt = now
	b.UpdatedAt = now
	return nil
}

func (b *SalesPriceBook) BeforeUpdate(tx *gorm.DB) error {
	b.UpdatedAt = common.GetTimestamp()
	return nil
}

// SalesPriceBookVersion freezes the commercial policy shared by all model
// prices in one price-book revision.
type SalesPriceBookVersion struct {
	Id                  int    `json:"id"`
	PriceBookId         int    `json:"price_book_id" gorm:"not null;uniqueIndex:uk_sales_price_book_version,priority:1;index"`
	Version             int64  `json:"version" gorm:"bigint;not null;uniqueIndex:uk_sales_price_book_version,priority:2"`
	Status              string `json:"status" gorm:"type:varchar(24);not null;index"`
	CostBasisStrategy   string `json:"cost_basis_strategy" gorm:"type:varchar(32);not null"`
	PaymentFeeRate      string `json:"payment_fee_rate" gorm:"type:decimal(18,12);not null"`
	DistributionFeeRate string `json:"distribution_fee_rate" gorm:"type:decimal(18,12);not null"`
	OperationsLaborRate string `json:"operations_labor_rate" gorm:"type:decimal(18,12);not null"`
	// API projection derived from the three component rates. It is intentionally
	// not mapped so AutoMigrate cannot recreate the retired database column.
	TotalVariableCostRate string `json:"total_variable_cost_rate" gorm:"-"`
	EffectiveTaxRate      string `json:"effective_tax_rate" gorm:"type:decimal(18,12);not null"`
	TargetNetMargin       string `json:"target_net_margin" gorm:"type:decimal(18,12);not null"`
	MinimumMarginRate     string `json:"minimum_margin_rate" gorm:"type:decimal(18,12);not null"`
	IncreaseCapRate       string `json:"increase_cap_rate" gorm:"type:decimal(18,12)"`
	EffectiveFrom         int64  `json:"effective_from" gorm:"bigint;not null;index"`
	EffectiveTo           int64  `json:"effective_to" gorm:"bigint;index"`
	ContentHash           string `json:"content_hash" gorm:"type:varchar(64);not null;index"`
	ChangeBatchId         *int   `json:"change_batch_id" gorm:"index"`
	CreatedBy             int    `json:"created_by" gorm:"not null"`
	PublishedBy           int    `json:"published_by"`
	CreatedAt             int64  `json:"created_at" gorm:"bigint;not null"`
	UpdatedAt             int64  `json:"updated_at" gorm:"bigint;not null"`
	PublishedAt           int64  `json:"published_at" gorm:"bigint"`
	Remark                string `json:"remark" gorm:"type:varchar(255)"`
}

func (v *SalesPriceBookVersion) BeforeCreate(tx *gorm.DB) error {
	now := common.GetTimestamp()
	v.CreatedAt = now
	v.UpdatedAt = now
	return nil
}

func (v *SalesPriceBookVersion) BeforeUpdate(tx *gorm.DB) error {
	if v.Id == 0 || v.Status == SalesPriceBookVersionStatusDraft {
		v.UpdatedAt = common.GetTimestamp()
		return nil
	}
	var currentStatus string
	if err := tx.Model(&SalesPriceBookVersion{}).Where("id = ?", v.Id).
		Pluck("status", &currentStatus).Error; err != nil {
		return err
	}
	if currentStatus != SalesPriceBookVersionStatusDraft {
		return errors.New("published sales price book versions are immutable")
	}
	v.UpdatedAt = common.GetTimestamp()
	return nil
}

func (v *SalesPriceBookVersion) AfterFind(tx *gorm.DB) error {
	payment, paymentErr := decimal.NewFromString(strings.TrimSpace(v.PaymentFeeRate))
	distribution, distributionErr := decimal.NewFromString(strings.TrimSpace(v.DistributionFeeRate))
	operations, operationsErr := decimal.NewFromString(strings.TrimSpace(v.OperationsLaborRate))
	if paymentErr != nil || distributionErr != nil || operationsErr != nil {
		v.TotalVariableCostRate = ""
		return nil
	}
	v.TotalVariableCostRate = payment.Add(distribution).Add(operations).String()
	return nil
}

// SalesPriceBookItem is the one customer-facing price for a logical model in
// a complete price-book version.
type SalesPriceBookItem struct {
	Id                      int    `json:"id"`
	PriceBookVersionId      int    `json:"price_book_version_id" gorm:"not null;uniqueIndex:uk_sales_price_book_item,priority:1;index"`
	ModelId                 int    `json:"model_id" gorm:"not null;uniqueIndex:uk_sales_price_book_item,priority:2;index"`
	Status                  string `json:"status" gorm:"type:varchar(24);not null;index"`
	BillingMode             string `json:"billing_mode" gorm:"type:varchar(32);not null"`
	PriceStructure          string `json:"price_structure" gorm:"type:varchar(16);not null"`
	PriceComponents         string `json:"price_components" gorm:"type:text"`
	SalesBillingExpr        string `json:"sales_billing_expr" gorm:"type:text;not null"`
	SalesExprHash           string `json:"sales_expr_hash" gorm:"type:varchar(64);not null"`
	ExpressionSource        string `json:"expression_source" gorm:"type:varchar(16);not null"`
	ExpressionSchemaVersion string `json:"expression_schema_version" gorm:"type:varchar(16);not null"`
	PricingMethod           string `json:"pricing_method" gorm:"type:varchar(24);not null;index"`
	OfficialPriceVersionId  *int   `json:"official_price_version_id" gorm:"index"`
	PricingConfig           string `json:"pricing_config" gorm:"type:text"`
	GeneratedByBatchId      *int   `json:"generated_by_batch_id" gorm:"index"`
	CreatedAt               int64  `json:"created_at" gorm:"bigint;not null"`
	Remark                  string `json:"remark" gorm:"type:varchar(255)"`

	// Admin API projections derived from canonical config, cost sources, and
	// the parent price book. They are not database columns.
	PrimaryPurchaseVersionId *int   `json:"primary_purchase_version_id,omitempty" gorm:"-"`
	SellingFactor            string `json:"selling_factor" gorm:"-"`
	OfficialDiscount         string `json:"official_discount" gorm:"-"`
	Currency                 string `json:"currency" gorm:"-"`
}

func (i *SalesPriceBookItem) BeforeCreate(tx *gorm.DB) error {
	i.CreatedAt = common.GetTimestamp()
	return nil
}

type SalesPriceBookItemCostSource struct {
	Id                     int    `json:"id"`
	PriceBookItemId        int    `json:"price_book_item_id" gorm:"not null;uniqueIndex:uk_sales_price_cost_source,priority:1;index"`
	ChannelModelId         int    `json:"channel_model_id" gorm:"not null;uniqueIndex:uk_sales_price_cost_source,priority:2;index"`
	PurchasePriceVersionId int    `json:"purchase_price_version_id" gorm:"not null;index"`
	SourceRole             string `json:"source_role" gorm:"type:varchar(16);not null;index"`
	CreatedAt              int64  `json:"created_at" gorm:"bigint;not null"`
}

func (s *SalesPriceBookItemCostSource) BeforeCreate(tx *gorm.DB) error {
	s.CreatedAt = common.GetTimestamp()
	return nil
}

// SalesPriceBookChannelModelOverride stores the exceptional commercial policy
// for one channel-model inside one price-book version. Nil rates inherit the
// version default while an explicit zero disables that cost for this route.
// The parent version owns the lifecycle: draft rows are editable and published
// rows are immutable together with the version.
type SalesPriceBookChannelModelOverride struct {
	Id                  int     `json:"id"`
	PriceBookVersionId  int     `json:"price_book_version_id" gorm:"not null;uniqueIndex:uk_sales_price_book_channel_model_override,priority:1;index"`
	ChannelModelId      int     `json:"channel_model_id" gorm:"not null;uniqueIndex:uk_sales_price_book_channel_model_override,priority:2;index"`
	PaymentFeeRate      *string `json:"payment_fee_rate" gorm:"type:decimal(18,12)"`
	DistributionFeeRate *string `json:"distribution_fee_rate" gorm:"type:decimal(18,12)"`
	OperationsLaborRate *string `json:"operations_labor_rate" gorm:"type:decimal(18,12)"`
	EffectiveTaxRate    *string `json:"effective_tax_rate" gorm:"type:decimal(18,12)"`
	TargetNetMargin     *string `json:"target_net_margin" gorm:"type:decimal(18,12)"`
	MinimumMarginRate   *string `json:"minimum_margin_rate" gorm:"type:decimal(18,12)"`
	CreatedBy           int     `json:"created_by" gorm:"not null"`
	UpdatedBy           int     `json:"updated_by" gorm:"not null"`
	CreatedAt           int64   `json:"created_at" gorm:"bigint;not null"`
	UpdatedAt           int64   `json:"updated_at" gorm:"bigint;not null"`
	Remark              string  `json:"remark" gorm:"type:varchar(255)"`
}

func (o *SalesPriceBookChannelModelOverride) BeforeCreate(tx *gorm.DB) error {
	now := common.GetTimestamp()
	o.CreatedAt = now
	o.UpdatedAt = now
	return nil
}

func (o *SalesPriceBookChannelModelOverride) BeforeUpdate(tx *gorm.DB) error {
	o.UpdatedAt = common.GetTimestamp()
	return nil
}

type SalesPriceBookDefault struct {
	DefaultKey  string `json:"default_key" gorm:"type:varchar(32);primaryKey;autoIncrement:false"`
	PriceBookId int    `json:"price_book_id" gorm:"not null;uniqueIndex"`
	UpdatedBy   int    `json:"updated_by" gorm:"not null"`
	UpdatedAt   int64  `json:"updated_at" gorm:"bigint;not null"`
}

type UserPriceBookAssignment struct {
	Id                int    `json:"id"`
	UserId            int    `json:"user_id" gorm:"not null;index:idx_user_price_book_effective,priority:1"`
	PriceBookId       int    `json:"price_book_id" gorm:"not null;index"`
	VersionPolicy     string `json:"version_policy" gorm:"type:varchar(16);not null"`
	PinnedVersionId   *int   `json:"pinned_version_id" gorm:"index"`
	Status            string `json:"status" gorm:"type:varchar(16);not null;index:idx_user_price_book_effective,priority:2"`
	EffectiveFrom     int64  `json:"effective_from" gorm:"bigint;not null;index:idx_user_price_book_effective,priority:3"`
	EffectiveTo       int64  `json:"effective_to" gorm:"bigint;index"`
	QuoteReference    string `json:"quote_reference" gorm:"type:varchar(64)"`
	ContractReference string `json:"contract_reference" gorm:"type:varchar(64)"`
	CreatedBy         int    `json:"created_by" gorm:"not null"`
	CreatedAt         int64  `json:"created_at" gorm:"bigint;not null"`
	UpdatedAt         int64  `json:"updated_at" gorm:"bigint;not null"`
	Remark            string `json:"remark" gorm:"type:varchar(255)"`
}

func (a *UserPriceBookAssignment) BeforeCreate(tx *gorm.DB) error {
	now := common.GetTimestamp()
	a.CreatedAt = now
	a.UpdatedAt = now
	return nil
}

func (a *UserPriceBookAssignment) BeforeUpdate(tx *gorm.DB) error {
	a.UpdatedAt = common.GetTimestamp()
	return nil
}

type PricingChangeBatch struct {
	Id             int    `json:"id"`
	BatchNo        string `json:"batch_no" gorm:"type:varchar(64);not null;uniqueIndex"`
	IdempotencyKey string `json:"idempotency_key" gorm:"type:varchar(128);not null;uniqueIndex"`
	TriggerType    string `json:"trigger_type" gorm:"type:varchar(32);not null;index"`
	TriggerId      *int   `json:"trigger_id" gorm:"index"`
	Status         string `json:"status" gorm:"type:varchar(24);not null;index"`
	ScopeSpec      string `json:"scope_spec" gorm:"type:text"`
	EffectiveFrom  int64  `json:"effective_from" gorm:"bigint;index"`
	TotalCount     int    `json:"total_count"`
	ChangedCount   int    `json:"changed_count"`
	UnchangedCount int    `json:"unchanged_count"`
	ReviewCount    int    `json:"review_count"`
	FailedCount    int    `json:"failed_count"`
	RequestedBy    int    `json:"requested_by" gorm:"not null"`
	CreatedAt      int64  `json:"created_at" gorm:"bigint;not null"`
	ErrorMessage   string `json:"error_message" gorm:"type:text"`
}

func (b *PricingChangeBatch) BeforeCreate(tx *gorm.DB) error {
	b.CreatedAt = common.GetTimestamp()
	return nil
}

type PricingChangeBatchItem struct {
	Id                int    `json:"id"`
	BatchId           int    `json:"batch_id" gorm:"not null;index"`
	TargetType        string `json:"target_type" gorm:"type:varchar(32);not null;index"`
	TargetId          *int   `json:"target_id" gorm:"index"`
	ModelId           int    `json:"model_id" gorm:"not null;index"`
	ChannelModelId    *int   `json:"channel_model_id" gorm:"index"`
	PriceBookId       *int   `json:"price_book_id" gorm:"index"`
	Action            string `json:"action" gorm:"type:varchar(24);not null"`
	OldVersionId      *int   `json:"old_version_id"`
	NewVersionId      *int   `json:"new_version_id"`
	OldExprHash       string `json:"old_expr_hash" gorm:"type:varchar(64)"`
	NewExprHash       string `json:"new_expr_hash" gorm:"type:varchar(64)"`
	OldReferenceCost  string `json:"old_reference_cost" gorm:"type:decimal(36,18)"`
	NewReferenceCost  string `json:"new_reference_cost" gorm:"type:decimal(36,18)"`
	OldReferencePrice string `json:"old_reference_price" gorm:"type:decimal(36,18)"`
	NewReferencePrice string `json:"new_reference_price" gorm:"type:decimal(36,18)"`
	MarginBefore      string `json:"margin_before" gorm:"type:decimal(18,12)"`
	MarginAfter       string `json:"margin_after" gorm:"type:decimal(18,12)"`
	RiskCode          string `json:"risk_code" gorm:"type:varchar(32);index"`
	Status            string `json:"status" gorm:"type:varchar(24);not null;index"`
	DiffDetail        string `json:"diff_detail" gorm:"type:text"`
	ErrorMessage      string `json:"error_message" gorm:"type:text"`
	CreatedAt         int64  `json:"created_at" gorm:"bigint;not null"`
}

func (i *PricingChangeBatchItem) BeforeCreate(tx *gorm.DB) error {
	normalizeOptionalPricingDecimal(&i.OldReferenceCost)
	normalizeOptionalPricingDecimal(&i.NewReferenceCost)
	normalizeOptionalPricingDecimal(&i.OldReferencePrice)
	normalizeOptionalPricingDecimal(&i.NewReferencePrice)
	normalizeOptionalPricingDecimal(&i.MarginBefore)
	normalizeOptionalPricingDecimal(&i.MarginAfter)
	i.CreatedAt = common.GetTimestamp()
	return nil
}

func normalizeOptionalPricingDecimal(value *string) {
	if strings.TrimSpace(*value) == "" {
		*value = "0"
	}
}

type PricingAuditRecord struct {
	Id         int    `json:"id"`
	ObjectType string `json:"object_type" gorm:"type:varchar(32);not null;index:idx_pricing_audit_object,priority:1"`
	ObjectId   int    `json:"object_id" gorm:"not null;index:idx_pricing_audit_object,priority:2"`
	Action     string `json:"action" gorm:"type:varchar(64);not null;index"`
	OperatorId int    `json:"operator_id" gorm:"not null;index"`
	Comment    string `json:"comment" gorm:"type:text"`
	CreatedAt  int64  `json:"created_at" gorm:"bigint;not null;index"`
}

func (r *PricingAuditRecord) BeforeCreate(tx *gorm.DB) error {
	r.CreatedAt = common.GetTimestamp()
	return nil
}

func GetSalesPriceBookForUpdate(tx *gorm.DB, id int) (SalesPriceBook, error) {
	var book SalesPriceBook
	err := lockForUpdate(tx).First(&book, id).Error
	return book, err
}

func GetSalesPriceBookVersionForUpdate(tx *gorm.DB, id int) (SalesPriceBookVersion, error) {
	var version SalesPriceBookVersion
	err := lockForUpdate(tx).First(&version, id).Error
	return version, err
}

func GetSalesPriceBookItemForUpdate(tx *gorm.DB, id int) (SalesPriceBookItem, error) {
	var item SalesPriceBookItem
	err := lockForUpdate(tx).First(&item, id).Error
	return item, err
}

func GetUserPriceBookAssignmentForUpdate(tx *gorm.DB, id int) (UserPriceBookAssignment, error) {
	var assignment UserPriceBookAssignment
	err := lockForUpdate(tx).First(&assignment, id).Error
	return assignment, err
}

func ActivateSalesPriceBookVersion(
	tx *gorm.DB,
	version SalesPriceBookVersion,
	userId int,
	now int64,
) error {
	book, err := GetSalesPriceBookForUpdate(tx, version.PriceBookId)
	if err != nil {
		return err
	}
	if version.Status != SalesPriceBookVersionStatusDraft {
		return errors.New("only sales price book drafts can be published")
	}
	var enabledItems int64
	if err := tx.Model(&SalesPriceBookItem{}).
		Where("price_book_version_id = ? AND status = ?", version.Id, "enabled").
		Count(&enabledItems).Error; err != nil {
		return err
	}
	if enabledItems == 0 {
		return errors.New("sales price book version has no enabled model prices")
	}
	if err := tx.Model(&SalesPriceBookVersion{}).
		Where("price_book_id = ? AND status = ? AND id <> ?", version.PriceBookId, SalesPriceBookVersionStatusActive, version.Id).
		Updates(map[string]any{
			"status":       SalesPriceBookVersionStatusSuperseded,
			"effective_to": now,
			"updated_at":   now,
		}).Error; err != nil {
		return err
	}
	result := tx.Model(&SalesPriceBookVersion{}).
		Where("id = ? AND status = ?", version.Id, SalesPriceBookVersionStatusDraft).
		Updates(map[string]any{
			"status":         SalesPriceBookVersionStatusActive,
			"effective_from": now,
			"effective_to":   0,
			"published_by":   userId,
			"published_at":   now,
			"updated_at":     now,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errors.New("sales price book draft changed while it was being published")
	}
	return tx.Model(&SalesPriceBook{}).Where("id = ?", book.Id).
		Updates(map[string]any{
			"current_version_id": version.Id,
			"status":             SalesPriceBookStatusEnabled,
			"updated_at":         now,
		}).Error
}

func ReplaceUserPriceBookAssignment(
	tx *gorm.DB,
	assignment *UserPriceBookAssignment,
) error {
	if assignment == nil {
		return errors.New("price book assignment is required")
	}
	now := common.GetTimestamp()
	if assignment.EffectiveFrom < 0 || assignment.EffectiveTo < 0 {
		return errors.New("price book assignment effective times cannot be negative")
	}
	if assignment.EffectiveFrom == 0 {
		assignment.EffectiveFrom = now
	}
	if assignment.EffectiveTo > 0 && assignment.EffectiveTo <= assignment.EffectiveFrom {
		return errors.New("price book assignment effective end must be after its start")
	}
	assignment.QuoteReference = strings.TrimSpace(assignment.QuoteReference)
	assignment.ContractReference = strings.TrimSpace(assignment.ContractReference)
	assignment.Remark = strings.TrimSpace(assignment.Remark)
	if utf8.RuneCountInString(assignment.QuoteReference) > 64 ||
		utf8.RuneCountInString(assignment.ContractReference) > 64 {
		return errors.New("price book assignment quote and contract references cannot exceed 64 characters")
	}
	if utf8.RuneCountInString(assignment.Remark) > 255 {
		return errors.New("price book assignment remark cannot exceed 255 characters")
	}
	var user User
	if err := lockForUpdate(tx).Select("id").First(&user, assignment.UserId).Error; err != nil {
		return err
	}
	if assignment.EffectiveFrom <= now {
		assignment.Status = PriceBookAssignmentStatusActive
	} else {
		assignment.Status = PriceBookAssignmentStatusScheduled
	}
	if assignment.Status == PriceBookAssignmentStatusActive {
		if err := tx.Model(&UserPriceBookAssignment{}).
			Where("user_id = ? AND status IN ?", assignment.UserId, []string{
				PriceBookAssignmentStatusActive,
				PriceBookAssignmentStatusScheduled,
			}).
			Updates(map[string]any{
				"status":       PriceBookAssignmentStatusExpired,
				"effective_to": assignment.EffectiveFrom,
				"updated_at":   now,
			}).Error; err != nil {
			return err
		}
	} else {
		if err := tx.Model(&UserPriceBookAssignment{}).
			Where("user_id = ? AND status = ?", assignment.UserId, PriceBookAssignmentStatusScheduled).
			Updates(map[string]any{
				"status":       PriceBookAssignmentStatusCancelled,
				"effective_to": now,
				"updated_at":   now,
			}).Error; err != nil {
			return err
		}
	}
	return tx.Create(assignment).Error
}
