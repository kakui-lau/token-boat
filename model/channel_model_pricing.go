package model

import (
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	PricingVersionStatusDraft     = "draft"
	PricingVersionStatusActive    = "active"
	PricingVersionStatusSuspended = "suspended"
	PricingVersionStatusExpired   = "expired"
)

type ChannelModelImportResult struct {
	Created           int      `json:"created"`
	Updated           int      `json:"updated"`
	SkippedUnknown    int      `json:"skipped_unknown"`
	UnknownModelNames []string `json:"unknown_model_names,omitempty"`
}

// ChannelModel is the stable identity of one logical model supplied by one
// channel. Runtime routing remains on Ability until the V2 feature flag is
// enabled.
type ChannelModel struct {
	Id                int    `json:"id"`
	ChannelId         int    `json:"channel_id" gorm:"not null;uniqueIndex:uk_channel_model_upstream,priority:1;index"`
	ModelId           int    `json:"model_id" gorm:"not null;uniqueIndex:uk_channel_model_upstream,priority:2;index"`
	UpstreamModelName string `json:"upstream_model_name" gorm:"type:varchar(192);not null;uniqueIndex:uk_channel_model_upstream,priority:3"`
	Status            int    `json:"status" gorm:"not null;index"`
	Priority          int64  `json:"priority" gorm:"bigint;not null"`
	Weight            uint   `json:"weight" gorm:"not null"`
	Region            string `json:"region" gorm:"type:varchar(32)"`
	DataPolicy        string `json:"data_policy" gorm:"type:varchar(32)"`
	CapabilityConfig  string `json:"capability_config" gorm:"type:text"`
	RoutingTags       string `json:"routing_tags" gorm:"type:varchar(255)"`
	RuntimeMode       string `json:"runtime_mode" gorm:"type:varchar(16);not null;index"`
	CreatedAt         int64  `json:"created_at" gorm:"bigint"`
	UpdatedAt         int64  `json:"updated_at" gorm:"bigint"`
}

func (m *ChannelModel) BeforeCreate(tx *gorm.DB) error {
	now := common.GetTimestamp()
	m.CreatedAt = now
	m.UpdatedAt = now
	if m.RuntimeMode == "" {
		m.RuntimeMode = "legacy"
	}
	return nil
}

func (m *ChannelModel) BeforeUpdate(tx *gorm.DB) error {
	m.UpdatedAt = common.GetTimestamp()
	return nil
}

type OfficialModelPriceVersion struct {
	Id                      int    `json:"id"`
	ModelId                 int    `json:"model_id" gorm:"not null;uniqueIndex:uk_official_model_price_version,priority:1;index"`
	BillingMode             string `json:"billing_mode" gorm:"type:varchar(32);not null"`
	PriceStructure          string `json:"price_structure" gorm:"type:varchar(16);not null"`
	PriceComponents         string `json:"price_components" gorm:"type:text"`
	BillingExpr             string `json:"billing_expr" gorm:"type:text;not null"`
	ExprHash                string `json:"expr_hash" gorm:"type:varchar(64);not null"`
	ExpressionSource        string `json:"expression_source" gorm:"type:varchar(16);not null"`
	ExpressionSchemaVersion string `json:"expression_schema_version" gorm:"type:varchar(16);not null"`
	Currency                string `json:"currency" gorm:"type:varchar(8);not null"`
	Source                  string `json:"source" gorm:"type:varchar(32);not null"`
	SourceVersion           string `json:"source_version" gorm:"type:varchar(64)"`
	ContentHash             string `json:"content_hash" gorm:"type:varchar(64);index"`
	SyncBatchId             *int   `json:"sync_batch_id" gorm:"index"`
	SourceUpdatedAt         int64  `json:"source_updated_at" gorm:"bigint;index"`
	ChangeType              string `json:"change_type" gorm:"type:varchar(16)"`
	Version                 int64  `json:"version" gorm:"bigint;not null;uniqueIndex:uk_official_model_price_version,priority:2"`
	Status                  string `json:"status" gorm:"type:varchar(16);not null;index"`
	EffectiveFrom           int64  `json:"effective_from" gorm:"bigint;not null;index"`
	EffectiveTo             int64  `json:"effective_to" gorm:"bigint;index"`
	CreatedBy               int    `json:"created_by"`
	CreatedAt               int64  `json:"created_at" gorm:"bigint"`
	UpdatedAt               int64  `json:"updated_at" gorm:"bigint"`
	Remark                  string `json:"remark" gorm:"type:varchar(255)"`
}

// ModelOfficialPrice is the fast-read catalog entry for a logical model. The
// referenced revision is immutable; synchronization only advances this pointer.
type ModelOfficialPrice struct {
	ModelId           int   `json:"model_id" gorm:"primaryKey;autoIncrement:false"`
	CurrentRevisionId int   `json:"current_revision_id" gorm:"not null;uniqueIndex"`
	UpdatedAt         int64 `json:"updated_at" gorm:"bigint;not null;index"`
}

type OfficialPriceSyncBatch struct {
	Id             int    `json:"id"`
	Source         string `json:"source" gorm:"type:varchar(32);not null;uniqueIndex:uk_official_price_sync_batch,priority:1"`
	IdempotencyKey string `json:"idempotency_key" gorm:"type:varchar(128);not null;uniqueIndex:uk_official_price_sync_batch,priority:2"`
	Status         string `json:"status" gorm:"type:varchar(16);not null;index"`
	ReceivedCount  int    `json:"received_count"`
	ChangedCount   int    `json:"changed_count"`
	UnchangedCount int    `json:"unchanged_count"`
	ActivatedCount int    `json:"activated_count"`
	StartedAt      int64  `json:"started_at" gorm:"bigint;not null;index"`
	CompletedAt    int64  `json:"completed_at" gorm:"bigint"`
	CreatedBy      int    `json:"created_by"`
	ErrorMessage   string `json:"error_message" gorm:"type:text"`
}

type ChannelModelPurchasePriceVersion struct {
	Id                      int    `json:"id"`
	ChannelModelId          int    `json:"channel_model_id" gorm:"not null;uniqueIndex:uk_purchase_price_version,priority:1;index"`
	OfficialPriceVersionId  *int   `json:"official_price_version_id" gorm:"index"`
	BillingMode             string `json:"billing_mode" gorm:"type:varchar(32);not null"`
	PricingMode             string `json:"pricing_mode" gorm:"type:varchar(24);not null"`
	PriceStructure          string `json:"price_structure" gorm:"type:varchar(16);not null"`
	QuoteSpec               string `json:"quote_spec" gorm:"type:text"`
	PriceComponents         string `json:"price_components" gorm:"type:text"`
	PurchaseDiscount        string `json:"purchase_discount" gorm:"type:text"`
	InputUnitPrice          string `json:"input_unit_price" gorm:"type:text"`
	OutputUnitPrice         string `json:"output_unit_price" gorm:"type:text"`
	CacheReadUnitPrice      string `json:"cache_read_unit_price" gorm:"type:text"`
	CacheWriteUnitPrice     string `json:"cache_write_unit_price" gorm:"type:text"`
	PriceUnit               string `json:"price_unit" gorm:"type:varchar(32)"`
	PurchaseBillingExpr     string `json:"purchase_billing_expr" gorm:"type:text;not null"`
	PurchaseExprHash        string `json:"purchase_expr_hash" gorm:"type:varchar(64);not null"`
	ExpressionSource        string `json:"expression_source" gorm:"type:varchar(16);not null"`
	ExpressionSchemaVersion string `json:"expression_schema_version" gorm:"type:varchar(16);not null"`
	Currency                string `json:"currency" gorm:"type:varchar(8);not null"`
	QuoteReference          string `json:"quote_reference" gorm:"type:varchar(64)"`
	ContractReference       string `json:"contract_reference" gorm:"type:varchar(64)"`
	Conditions              string `json:"conditions" gorm:"type:text"`
	Version                 int64  `json:"version" gorm:"bigint;not null;uniqueIndex:uk_purchase_price_version,priority:2"`
	Status                  string `json:"status" gorm:"type:varchar(16);not null;index"`
	EffectiveFrom           int64  `json:"effective_from" gorm:"bigint;not null;index"`
	EffectiveTo             int64  `json:"effective_to" gorm:"bigint;index"`
	CreatedBy               int    `json:"created_by"`
	CreatedAt               int64  `json:"created_at" gorm:"bigint"`
	UpdatedAt               int64  `json:"updated_at" gorm:"bigint"`
	Remark                  string `json:"remark" gorm:"type:varchar(255)"`
}

type ChannelModelRetailPriceVersion struct {
	Id                      int    `json:"id"`
	ChannelModelId          int    `json:"channel_model_id" gorm:"not null;uniqueIndex:uk_retail_price_version,priority:1;index"`
	PurchasePriceVersionId  int    `json:"purchase_price_version_id" gorm:"not null;index"`
	BillingMode             string `json:"billing_mode" gorm:"type:varchar(32);not null"`
	PriceStructure          string `json:"price_structure" gorm:"type:varchar(16);not null"`
	PriceComponents         string `json:"price_components" gorm:"type:text"`
	InputUnitPrice          string `json:"input_unit_price" gorm:"type:text"`
	OutputUnitPrice         string `json:"output_unit_price" gorm:"type:text"`
	CacheReadUnitPrice      string `json:"cache_read_unit_price" gorm:"type:text"`
	CacheWriteUnitPrice     string `json:"cache_write_unit_price" gorm:"type:text"`
	PriceUnit               string `json:"price_unit" gorm:"type:varchar(32)"`
	RetailBillingExpr       string `json:"retail_billing_expr" gorm:"type:text;not null"`
	RetailExprHash          string `json:"retail_expr_hash" gorm:"type:varchar(64);not null"`
	ExpressionSource        string `json:"expression_source" gorm:"type:varchar(16);not null"`
	ExpressionSchemaVersion string `json:"expression_schema_version" gorm:"type:varchar(16);not null"`
	Currency                string `json:"currency" gorm:"type:varchar(8);not null"`
	TotalVariableCostRate   string `json:"total_variable_cost_rate" gorm:"type:decimal(18,12);not null"`
	EffectiveTaxRate        string `json:"effective_tax_rate" gorm:"type:decimal(18,12);not null"`
	TargetNetMargin         string `json:"target_net_margin" gorm:"type:decimal(18,12);not null"`
	MinimumMarginRate       string `json:"minimum_margin_rate" gorm:"type:decimal(18,12);not null"`
	Version                 int64  `json:"version" gorm:"bigint;not null;uniqueIndex:uk_retail_price_version,priority:2"`
	Status                  string `json:"status" gorm:"type:varchar(16);not null;index"`
	EffectiveFrom           int64  `json:"effective_from" gorm:"bigint;not null;index"`
	EffectiveTo             int64  `json:"effective_to" gorm:"bigint;index"`
	CreatedBy               int    `json:"created_by"`
	CreatedAt               int64  `json:"created_at" gorm:"bigint"`
	UpdatedAt               int64  `json:"updated_at" gorm:"bigint"`
	Remark                  string `json:"remark" gorm:"type:varchar(255)"`
}

type RequestPricingSnapshot struct {
	Id                     int    `json:"id"`
	RequestId              string `json:"request_id" gorm:"type:varchar(64);not null;uniqueIndex"`
	UserId                 int    `json:"user_id" gorm:"not null;index"`
	ModelId                int    `json:"model_id" gorm:"not null;index"`
	ChannelModelId         int    `json:"channel_model_id" gorm:"not null;index"`
	PurchasePriceVersionId int    `json:"purchase_price_version_id" gorm:"not null"`
	RetailPriceVersionId   int    `json:"retail_price_version_id" gorm:"not null"`
	BillingMode            string `json:"billing_mode" gorm:"type:varchar(32);not null"`
	EstimatedUsage         string `json:"estimated_usage" gorm:"type:text"`
	ActualUsage            string `json:"actual_usage" gorm:"type:text"`
	ReservedQuota          int64  `json:"reserved_quota" gorm:"bigint;not null"`
	SettledQuota           int64  `json:"settled_quota" gorm:"bigint;not null"`
	PurchaseCost           string `json:"purchase_cost" gorm:"type:decimal(36,18);not null"`
	RetailAmount           string `json:"retail_amount" gorm:"type:decimal(36,18);not null"`
	Currency               string `json:"currency" gorm:"type:varchar(8);not null"`
	Status                 string `json:"status" gorm:"type:varchar(16);not null;index"`
	CreatedAt              int64  `json:"created_at" gorm:"bigint;index"`
	UpdatedAt              int64  `json:"updated_at" gorm:"bigint"`
}

func setPricingVersionCreateTimes(createdAt *int64, updatedAt *int64) {
	now := common.GetTimestamp()
	*createdAt = now
	*updatedAt = now
}

func rejectPublishedPricingVersionMutation(tx *gorm.DB, id int, status string) error {
	if id == 0 || status == PricingVersionStatusDraft {
		return nil
	}
	var currentStatus string
	if err := tx.Model(tx.Statement.Model).Where("id = ?", id).Pluck("status", &currentStatus).Error; err != nil {
		return err
	}
	if currentStatus != PricingVersionStatusDraft {
		return errors.New("published pricing versions are immutable")
	}
	return nil
}

func (v *OfficialModelPriceVersion) BeforeCreate(tx *gorm.DB) error {
	setPricingVersionCreateTimes(&v.CreatedAt, &v.UpdatedAt)
	return nil
}

func (v *OfficialModelPriceVersion) BeforeUpdate(tx *gorm.DB) error {
	if err := rejectPublishedPricingVersionMutation(tx, v.Id, v.Status); err != nil {
		return err
	}
	v.UpdatedAt = common.GetTimestamp()
	return nil
}

func (v *ChannelModelPurchasePriceVersion) BeforeCreate(tx *gorm.DB) error {
	setPricingVersionCreateTimes(&v.CreatedAt, &v.UpdatedAt)
	return nil
}

func (v *ChannelModelPurchasePriceVersion) BeforeUpdate(tx *gorm.DB) error {
	if err := rejectPublishedPricingVersionMutation(tx, v.Id, v.Status); err != nil {
		return err
	}
	v.UpdatedAt = common.GetTimestamp()
	return nil
}

func (v *ChannelModelRetailPriceVersion) BeforeCreate(tx *gorm.DB) error {
	setPricingVersionCreateTimes(&v.CreatedAt, &v.UpdatedAt)
	return nil
}

func (v *ChannelModelRetailPriceVersion) BeforeUpdate(tx *gorm.DB) error {
	if err := rejectPublishedPricingVersionMutation(tx, v.Id, v.Status); err != nil {
		return err
	}
	v.UpdatedAt = common.GetTimestamp()
	return nil
}

func (s *RequestPricingSnapshot) BeforeCreate(tx *gorm.DB) error {
	now := common.GetTimestamp()
	s.CreatedAt = now
	s.UpdatedAt = now
	return nil
}

func (s *RequestPricingSnapshot) BeforeUpdate(tx *gorm.DB) error {
	s.UpdatedAt = common.GetTimestamp()
	return nil
}

// InitializeChannelModelsFromAbilities imports the legacy routing catalog
// without changing Ability or enabling V2 runtime routing.
func InitializeChannelModelsFromAbilities() (ChannelModelImportResult, error) {
	result := ChannelModelImportResult{}
	var abilities []Ability
	if err := DB.Find(&abilities).Error; err != nil {
		return result, err
	}

	var channels []Channel
	if err := DB.Select("id", "model_mapping").Find(&channels).Error; err != nil {
		return result, err
	}
	modelMappings := make(map[int]map[string]string, len(channels))
	for _, channel := range channels {
		if channel.ModelMapping == nil || strings.TrimSpace(*channel.ModelMapping) == "" {
			continue
		}
		var mapping map[string]string
		if err := common.UnmarshalJsonStr(*channel.ModelMapping, &mapping); err != nil {
			return result, fmt.Errorf("parse model mapping for channel %d: %w", channel.Id, err)
		}
		modelMappings[channel.Id] = mapping
	}

	var models []Model
	if err := DB.Find(&models).Error; err != nil {
		return result, err
	}
	modelIdByName := make(map[string]int, len(models))
	for _, item := range models {
		modelIdByName[item.ModelName] = item.Id
	}

	type candidate struct {
		channelId         int
		modelId           int
		modelName         string
		upstreamModelName string
		enabled           bool
		priority          int64
		weight            uint
	}
	candidates := make(map[string]candidate)
	unknownNames := make(map[string]struct{})
	for _, ability := range abilities {
		modelName := strings.TrimSpace(ability.Model)
		modelId, ok := modelIdByName[modelName]
		if !ok {
			result.SkippedUnknown++
			unknownNames[modelName] = struct{}{}
			continue
		}
		key := strconv.Itoa(ability.ChannelId) + "\x00" + modelName
		current, exists := candidates[key]
		if !exists {
			upstreamModelName := modelName
			if mappedName := strings.TrimSpace(modelMappings[ability.ChannelId][modelName]); mappedName != "" {
				upstreamModelName = mappedName
			}
			current = candidate{
				channelId:         ability.ChannelId,
				modelId:           modelId,
				modelName:         modelName,
				upstreamModelName: upstreamModelName,
			}
		}
		current.enabled = current.enabled || ability.Enabled
		if ability.Priority != nil && *ability.Priority > current.priority {
			current.priority = *ability.Priority
		}
		if ability.Weight > current.weight {
			current.weight = ability.Weight
		}
		candidates[key] = current
	}

	for name := range unknownNames {
		if name != "" {
			result.UnknownModelNames = append(result.UnknownModelNames, name)
		}
	}
	sort.Strings(result.UnknownModelNames)

	err := DB.Transaction(func(tx *gorm.DB) error {
		for _, item := range candidates {
			var existing ChannelModel
			err := tx.Where(
				"channel_id = ? AND model_id = ? AND upstream_model_name = ?",
				item.channelId,
				item.modelId,
				item.upstreamModelName,
			).First(&existing).Error
			if errors.Is(err, gorm.ErrRecordNotFound) && item.upstreamModelName != item.modelName {
				err = tx.Where(
					"channel_id = ? AND model_id = ? AND upstream_model_name = ?",
					item.channelId,
					item.modelId,
					item.modelName,
				).First(&existing).Error
				if err == nil {
					if err := tx.Model(&existing).Update(
						"upstream_model_name",
						item.upstreamModelName,
					).Error; err != nil {
						return err
					}
				}
			}
			if errors.Is(err, gorm.ErrRecordNotFound) {
				status := 0
				if item.enabled {
					status = 1
				}
				if err := tx.Create(&ChannelModel{
					ChannelId:         item.channelId,
					ModelId:           item.modelId,
					UpstreamModelName: item.upstreamModelName,
					Status:            status,
					Priority:          item.priority,
					Weight:            item.weight,
					RuntimeMode:       "legacy",
				}).Error; err != nil {
					return err
				}
				result.Created++
				continue
			}
			if err != nil {
				return err
			}
			status := 0
			if item.enabled {
				status = 1
			}
			if err := tx.Model(&existing).Updates(map[string]any{
				"status":     status,
				"priority":   item.priority,
				"weight":     item.weight,
				"updated_at": common.GetTimestamp(),
			}).Error; err != nil {
				return err
			}
			result.Updated++
		}
		return nil
	})
	return result, err
}

func GetOfficialPriceVersionForUpdate(tx *gorm.DB, id int) (OfficialModelPriceVersion, error) {
	var version OfficialModelPriceVersion
	err := lockForUpdate(tx).First(&version, id).Error
	return version, err
}

func GetLogicalModelForUpdate(tx *gorm.DB, id int) (Model, error) {
	var logicalModel Model
	err := lockForUpdate(tx).First(&logicalModel, id).Error
	return logicalModel, err
}

func GetChannelModelForUpdate(tx *gorm.DB, id int) (ChannelModel, error) {
	var channelModel ChannelModel
	err := lockForUpdate(tx).First(&channelModel, id).Error
	return channelModel, err
}

func GetPurchasePriceVersionForUpdate(tx *gorm.DB, id int) (ChannelModelPurchasePriceVersion, error) {
	var version ChannelModelPurchasePriceVersion
	err := lockForUpdate(tx).First(&version, id).Error
	return version, err
}

func GetRetailPriceVersionForUpdate(tx *gorm.DB, id int) (ChannelModelRetailPriceVersion, error) {
	var version ChannelModelRetailPriceVersion
	err := lockForUpdate(tx).First(&version, id).Error
	return version, err
}

func ActivateOfficialPriceVersion(tx *gorm.DB, version OfficialModelPriceVersion, now int64) error {
	if err := tx.Model(&OfficialModelPriceVersion{}).
		Where("model_id = ? AND status = ? AND id <> ?", version.ModelId, PricingVersionStatusActive, version.Id).
		UpdateColumns(map[string]any{
			"status":       PricingVersionStatusExpired,
			"effective_to": now,
			"updated_at":   now,
		}).Error; err != nil {
		return err
	}
	result := tx.Model(&OfficialModelPriceVersion{}).
		Where("id = ? AND status = ?", version.Id, PricingVersionStatusDraft).
		UpdateColumns(map[string]any{
			"status":         PricingVersionStatusActive,
			"effective_from": now,
			"effective_to":   0,
			"updated_at":     now,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errors.New("official price version is no longer publishable")
	}
	current := ModelOfficialPrice{
		ModelId:           version.ModelId,
		CurrentRevisionId: version.Id,
		UpdatedAt:         now,
	}
	return tx.Where("model_id = ?", version.ModelId).
		Assign(map[string]any{
			"current_revision_id": version.Id,
			"updated_at":          now,
		}).
		FirstOrCreate(&current).Error
}

// InitializeModelOfficialPrices backfills the current catalog for installations
// that already had active official revisions before the catalog table existed.
func InitializeModelOfficialPrices() error {
	var active []OfficialModelPriceVersion
	if err := DB.Where("status = ?", PricingVersionStatusActive).
		Order("model_id ASC, version DESC").
		Find(&active).Error; err != nil {
		return err
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		seen := make(map[int]struct{}, len(active))
		for _, revision := range active {
			if _, exists := seen[revision.ModelId]; exists {
				continue
			}
			seen[revision.ModelId] = struct{}{}
			current := ModelOfficialPrice{
				ModelId:           revision.ModelId,
				CurrentRevisionId: revision.Id,
				UpdatedAt:         revision.UpdatedAt,
			}
			if err := tx.Where("model_id = ?", revision.ModelId).
				Assign(map[string]any{
					"current_revision_id": revision.Id,
					"updated_at":          revision.UpdatedAt,
				}).
				FirstOrCreate(&current).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func ActivatePurchasePriceVersion(tx *gorm.DB, version ChannelModelPurchasePriceVersion, now int64) error {
	if err := tx.Model(&ChannelModelPurchasePriceVersion{}).
		Where("channel_model_id = ? AND status = ? AND id <> ?", version.ChannelModelId, PricingVersionStatusActive, version.Id).
		UpdateColumns(map[string]any{
			"status":       PricingVersionStatusExpired,
			"effective_to": now,
			"updated_at":   now,
		}).Error; err != nil {
		return err
	}
	result := tx.Model(&ChannelModelPurchasePriceVersion{}).
		Where("id = ? AND status = ?", version.Id, PricingVersionStatusDraft).
		UpdateColumns(map[string]any{
			"status":         PricingVersionStatusActive,
			"effective_from": now,
			"effective_to":   0,
			"updated_at":     now,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errors.New("purchase price version is no longer publishable")
	}
	return nil
}

func ActivateRetailPriceVersion(tx *gorm.DB, version ChannelModelRetailPriceVersion, now int64) error {
	if err := tx.Model(&ChannelModelRetailPriceVersion{}).
		Where("channel_model_id = ? AND status = ? AND id <> ?", version.ChannelModelId, PricingVersionStatusActive, version.Id).
		UpdateColumns(map[string]any{
			"status":       PricingVersionStatusExpired,
			"effective_to": now,
			"updated_at":   now,
		}).Error; err != nil {
		return err
	}
	result := tx.Model(&ChannelModelRetailPriceVersion{}).
		Where("id = ? AND status = ?", version.Id, PricingVersionStatusDraft).
		UpdateColumns(map[string]any{
			"status":         PricingVersionStatusActive,
			"effective_from": now,
			"effective_to":   0,
			"updated_at":     now,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errors.New("retail price version is no longer publishable")
	}
	return nil
}
