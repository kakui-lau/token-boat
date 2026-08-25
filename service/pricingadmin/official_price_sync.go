package pricingadmin

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"gorm.io/gorm"
)

const (
	officialPriceSyncStatusRunning   = "running"
	officialPriceSyncStatusCompleted = "completed"
	officialPriceSyncStatusFailed    = "failed"
)

type OfficialPriceSyncInput struct {
	Source         string                             `json:"source"`
	IdempotencyKey string                             `json:"idempotency_key"`
	AutoActivate   bool                               `json:"auto_activate"`
	Items          []OfficialPriceSynchronizationItem `json:"items"`
}

type OfficialPriceSynchronizationItem struct {
	ModelId                 int    `json:"model_id"`
	BillingMode             string `json:"billing_mode"`
	PriceStructure          string `json:"price_structure"`
	PriceComponents         string `json:"price_components"`
	BillingExpr             string `json:"billing_expr"`
	ExpressionSource        string `json:"expression_source"`
	ExpressionSchemaVersion string `json:"expression_schema_version"`
	Currency                string `json:"currency"`
	Region                  string `json:"region"`
	SourceVersion           string `json:"source_version"`
	SourceUpdatedAt         int64  `json:"source_updated_at"`
	Remark                  string `json:"remark"`
}

type OfficialPriceSyncResult struct {
	Batch      model.OfficialPriceSyncBatch `json:"batch"`
	Idempotent bool                         `json:"idempotent"`
}

// SyncOfficialPrices ingests one complete upstream snapshot. A completed
// source/idempotency pair is replay-safe. Changed records become immutable
// revisions; unchanged records do not create noisy history.
func SyncOfficialPrices(input OfficialPriceSyncInput, userId int) (OfficialPriceSyncResult, error) {
	var result OfficialPriceSyncResult
	input.Source = strings.TrimSpace(input.Source)
	input.IdempotencyKey = strings.TrimSpace(input.IdempotencyKey)
	if input.Source == "" {
		return result, errors.New("official price sync source is required")
	}
	if len(input.Source) > 32 {
		return result, errors.New("official price sync source exceeds 32 characters")
	}
	if input.IdempotencyKey == "" {
		return result, errors.New("official price sync idempotency key is required")
	}
	if len(input.IdempotencyKey) > 128 {
		return result, errors.New("official price sync idempotency key exceeds 128 characters")
	}
	if len(input.Items) == 0 {
		return result, errors.New("official price sync items are required")
	}

	var existing model.OfficialPriceSyncBatch
	err := model.DB.Where(
		"source = ? AND idempotency_key = ?",
		input.Source,
		input.IdempotencyKey,
	).First(&existing).Error
	if err == nil {
		return OfficialPriceSyncResult{Batch: existing, Idempotent: true}, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return result, err
	}

	now := common.GetTimestamp()
	batch := model.OfficialPriceSyncBatch{
		Source:         input.Source,
		IdempotencyKey: input.IdempotencyKey,
		Status:         officialPriceSyncStatusRunning,
		ReceivedCount:  len(input.Items),
		StartedAt:      now,
		CreatedBy:      userId,
	}
	if err := model.DB.Create(&batch).Error; err != nil {
		if lookupErr := model.DB.Where(
			"source = ? AND idempotency_key = ?",
			input.Source,
			input.IdempotencyKey,
		).First(&existing).Error; lookupErr == nil {
			return OfficialPriceSyncResult{Batch: existing, Idempotent: true}, nil
		}
		return result, err
	}

	processErr := model.DB.Transaction(func(tx *gorm.DB) error {
		seenModels := make(map[int]struct{}, len(input.Items))
		for _, item := range input.Items {
			if _, duplicate := seenModels[item.ModelId]; duplicate {
				return fmt.Errorf("official price sync contains duplicate model_id %d", item.ModelId)
			}
			seenModels[item.ModelId] = struct{}{}
			if err := synchronizeOfficialPriceItem(tx, &batch, input, item, userId); err != nil {
				return fmt.Errorf("sync official price for model %d: %w", item.ModelId, err)
			}
		}
		batch.Status = officialPriceSyncStatusCompleted
		batch.CompletedAt = common.GetTimestamp()
		return tx.Model(&model.OfficialPriceSyncBatch{}).
			Where("id = ? AND status = ?", batch.Id, officialPriceSyncStatusRunning).
			Updates(map[string]any{
				"status":          batch.Status,
				"changed_count":   batch.ChangedCount,
				"unchanged_count": batch.UnchangedCount,
				"activated_count": batch.ActivatedCount,
				"completed_at":    batch.CompletedAt,
			}).Error
	})
	if processErr != nil {
		batch.ChangedCount = 0
		batch.UnchangedCount = 0
		batch.ActivatedCount = 0
		message := processErr.Error()
		if len(message) > 2000 {
			message = message[:2000]
		}
		completedAt := common.GetTimestamp()
		_ = model.DB.Model(&model.OfficialPriceSyncBatch{}).
			Where("id = ?", batch.Id).
			Updates(map[string]any{
				"status":        officialPriceSyncStatusFailed,
				"completed_at":  completedAt,
				"error_message": message,
			}).Error
		batch.Status = officialPriceSyncStatusFailed
		batch.CompletedAt = completedAt
		batch.ErrorMessage = message
		return OfficialPriceSyncResult{Batch: batch}, processErr
	}
	if input.AutoActivate {
		var activated []model.OfficialModelPriceVersion
		if err := model.DB.Where(
			"sync_batch_id = ? AND status = ?", batch.Id, model.PricingVersionStatusActive,
		).Order("id ASC").Find(&activated).Error; err != nil {
			return OfficialPriceSyncResult{Batch: batch}, err
		}
		for _, version := range activated {
			if _, err := AutoCreatePurchaseDraftsForOfficialPrice(version.Id, userId); err != nil {
				return OfficialPriceSyncResult{Batch: batch}, fmt.Errorf(
					"official price sync completed, but purchase draft generation failed for version %d: %w",
					version.Id, err,
				)
			}
		}
	}
	return OfficialPriceSyncResult{Batch: batch}, nil
}

func synchronizeOfficialPriceItem(
	tx *gorm.DB,
	batch *model.OfficialPriceSyncBatch,
	input OfficialPriceSyncInput,
	item OfficialPriceSynchronizationItem,
	userId int,
) error {
	if _, err := model.GetLogicalModelForUpdate(tx, item.ModelId); err != nil {
		return err
	}
	if item.SourceUpdatedAt < 0 {
		return errors.New("source_updated_at cannot be negative")
	}
	version := model.OfficialModelPriceVersion{
		ModelId:                 item.ModelId,
		BillingMode:             item.BillingMode,
		PriceStructure:          item.PriceStructure,
		PriceComponents:         item.PriceComponents,
		BillingExpr:             item.BillingExpr,
		ExpressionSource:        item.ExpressionSource,
		ExpressionSchemaVersion: item.ExpressionSchemaVersion,
		Currency:                item.Currency,
		Region:                  normalizeOfficialPriceRegion(item.Region),
		Source:                  input.Source,
		SourceVersion:           strings.TrimSpace(item.SourceVersion),
		SourceUpdatedAt:         item.SourceUpdatedAt,
		CreatedBy:               userId,
		Status:                  model.PricingVersionStatusDraft,
		Remark:                  strings.TrimSpace(item.Remark),
	}
	normalizeExpressionMetadata(
		&version.ExpressionSource,
		&version.ExpressionSchemaVersion,
		&version.Currency,
		&version.BillingExpr,
	)
	if err := validateOfficialPriceCurrency(version.Currency); err != nil {
		return err
	}
	if err := validateExpressionMetadata(version.ExpressionSchemaVersion, version.BillingExpr); err != nil {
		return err
	}
	if err := validateCommonPrice(
		version.ModelId,
		version.BillingMode,
		version.PriceStructure,
		version.Currency,
		version.BillingExpr,
	); err != nil {
		return err
	}
	if err := validatePriceComponents(
		version.BillingMode,
		version.PriceStructure,
		version.PriceComponents,
	); err != nil {
		return err
	}
	version.ExprHash = billingexpr.ExprHashString(version.BillingExpr)
	version.ContentHash = officialPriceContentHash(version)
	version.SyncBatchId = &batch.Id

	var current model.OfficialModelPriceVersion
	err := tx.Table("official_model_price_versions AS revisions").
		Select("revisions.*").
		Joins("JOIN model_official_prices AS catalog ON catalog.current_revision_id = revisions.id").
		Where("catalog.model_id = ?", item.ModelId).
		First(&current).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		err = tx.Where(
			"model_id = ? AND status = ?",
			item.ModelId,
			model.PricingVersionStatusActive,
		).Order("version DESC").First(&current).Error
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	if err == nil {
		currentHash := current.ContentHash
		if currentHash == "" {
			currentHash = officialPriceContentHash(current)
		}
		if currentHash == version.ContentHash {
			batch.UnchangedCount++
			return nil
		}
		version.ChangeType = "updated"
	} else {
		version.ChangeType = "initial"
	}

	var maxVersion int64
	if err := tx.Model(&model.OfficialModelPriceVersion{}).
		Where("model_id = ?", item.ModelId).
		Select("COALESCE(MAX(version), 0)").
		Scan(&maxVersion).Error; err != nil {
		return err
	}
	version.Version = maxVersion + 1
	if err := tx.Create(&version).Error; err != nil {
		return err
	}
	batch.ChangedCount++
	if input.AutoActivate {
		if err := model.ActivateOfficialPriceVersion(tx, version, common.GetTimestamp()); err != nil {
			return err
		}
		batch.ActivatedCount++
	}
	return nil
}

func ListOfficialPriceSyncBatches(limit int) ([]model.OfficialPriceSyncBatch, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var batches []model.OfficialPriceSyncBatch
	err := model.DB.Order("id DESC").Limit(limit).Find(&batches).Error
	return batches, err
}
