package model

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"gorm.io/gorm"
)

const (
	ModelVisibilityPublic   = "public"
	ModelVisibilityInternal = "internal"

	ModelPurposeApprovalReview = "approval_review"

	modelRoutingCacheTTL = 30 * time.Second
)

type ModelRoutingResolution struct {
	RequestedModelName string
	ResolvedModelName  string
	Purpose            string
	IsAlias            bool
}

type ModelRoutingTarget struct {
	Id        int    `json:"id"`
	ModelName string `json:"model_name"`
}

type modelRoutingAlias struct {
	SourceModelName string `gorm:"column:source_model_name"`
	SourceStatus    int    `gorm:"column:source_status"`
	ModelPurpose    string `gorm:"column:model_purpose"`
	TargetModelId   int    `gorm:"column:target_model_id"`
	TargetModelName string `gorm:"column:target_model_name"`
	TargetStatus    int    `gorm:"column:target_status"`
}

type modelRoutingSnapshot struct {
	loadedAt time.Time
	aliases  map[string]modelRoutingAlias
}

var (
	modelRoutingCache atomic.Pointer[modelRoutingSnapshot]
	modelRoutingLock  sync.Mutex
)

func (mi *Model) NormalizeRoutingConfiguration() {
	mi.ModelName = strings.TrimSpace(mi.ModelName)
	mi.Visibility = strings.ToLower(strings.TrimSpace(mi.Visibility))
	if mi.Visibility == "" {
		mi.Visibility = ModelVisibilityPublic
	}
	mi.ModelPurpose = strings.ToLower(strings.TrimSpace(mi.ModelPurpose))
	if mi.RoutingTargetModelId != nil && *mi.RoutingTargetModelId <= 0 {
		mi.RoutingTargetModelId = nil
	}
	if mi.RoutingTargetModelId != nil {
		mi.Visibility = ModelVisibilityInternal
		mi.NameRule = NameRuleExact
		mi.Endpoints = ""
		mi.SyncOfficial = 0
	}
}

func (mi *Model) ValidateRoutingConfiguration(tx *gorm.DB) error {
	if tx == nil {
		return errors.New("database is not initialized")
	}
	if mi.Visibility != ModelVisibilityPublic && mi.Visibility != ModelVisibilityInternal {
		return fmt.Errorf("unsupported model visibility %q", mi.Visibility)
	}
	if mi.Id > 0 {
		var referencedBy int64
		if err := tx.Model(&Model{}).
			Where("routing_target_model_id = ?", mi.Id).
			Count(&referencedBy).Error; err != nil {
			return err
		}
		if referencedBy > 0 {
			if mi.Status != 1 {
				return errors.New("model is the active routing target of a system alias")
			}
			if mi.NameRule != NameRuleExact {
				return errors.New("a routing target must keep exact name matching")
			}
			if mi.RoutingTargetModelId != nil {
				return errors.New("a routing target cannot be converted into an alias")
			}
		}
	}
	if mi.RoutingTargetModelId == nil {
		if mi.ModelPurpose != "" {
			return errors.New("model purpose is only supported for system aliases")
		}
		return nil
	}
	if mi.ModelPurpose != ModelPurposeApprovalReview {
		return errors.New("system model aliases require a supported purpose")
	}
	if mi.NameRule != NameRuleExact {
		return errors.New("system model aliases require exact name matching")
	}
	if mi.Id > 0 && *mi.RoutingTargetModelId == mi.Id {
		return errors.New("a model cannot route to itself")
	}

	var target Model
	if err := lockForUpdate(tx).First(&target, *mi.RoutingTargetModelId).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("routing target model was not found")
		}
		return err
	}
	if target.ModelName == mi.ModelName {
		return errors.New("a model cannot route to itself")
	}
	if target.Status != 1 {
		return errors.New("routing target model must be enabled")
	}
	if target.NameRule != NameRuleExact {
		return errors.New("routing target model must use exact name matching")
	}
	if target.RoutingTargetModelId != nil {
		return errors.New("routing aliases cannot target another alias")
	}
	return nil
}

func ValidateModelStatusChange(tx *gorm.DB, modelId int, status int) error {
	if tx == nil {
		return errors.New("database is not initialized")
	}
	if modelId <= 0 || status != 0 {
		return nil
	}
	var references int64
	if err := tx.Model(&Model{}).
		Where("routing_target_model_id = ? AND status = ?", modelId, 1).
		Count(&references).Error; err != nil {
		return err
	}
	if references > 0 {
		return errors.New("model is the active routing target of a system alias")
	}
	return nil
}

func ValidateModelDeletion(tx *gorm.DB, modelId int) error {
	if tx == nil {
		return errors.New("database is not initialized")
	}
	if modelId <= 0 {
		return errors.New("model id is required")
	}
	var references int64
	if err := tx.Model(&Model{}).
		Where("routing_target_model_id = ?", modelId).
		Count(&references).Error; err != nil {
		return err
	}
	if references > 0 {
		return errors.New("model is referenced by a system alias")
	}
	return nil
}

func ResolveModelRouting(modelName string) (ModelRoutingResolution, error) {
	modelName = strings.TrimSpace(modelName)
	resolution := ModelRoutingResolution{
		RequestedModelName: modelName,
		ResolvedModelName:  modelName,
	}
	if modelName == "" {
		return resolution, nil
	}
	snapshot, err := currentModelRoutingSnapshot()
	if err != nil {
		return resolution, err
	}
	alias, exists := snapshot.aliases[modelName]
	if !exists {
		return resolution, nil
	}
	if alias.SourceStatus != 1 {
		return resolution, fmt.Errorf("system model %q is disabled", modelName)
	}
	if alias.TargetModelId <= 0 || alias.TargetModelName == "" {
		return resolution, fmt.Errorf("system model %q has no valid routing target", modelName)
	}
	if alias.TargetStatus != 1 {
		return resolution, fmt.Errorf("routing target for system model %q is disabled", modelName)
	}
	resolution.ResolvedModelName = alias.TargetModelName
	resolution.Purpose = alias.ModelPurpose
	resolution.IsAlias = true
	return resolution, nil
}

func InvalidateModelRoutingCache() {
	modelRoutingCache.Store(nil)
}

func ListModelRoutingTargets(excludeModelId int) ([]ModelRoutingTarget, error) {
	if DB == nil {
		return nil, errors.New("database is not initialized")
	}
	targets := make([]ModelRoutingTarget, 0)
	query := DB.Model(&Model{}).
		Select("id", "model_name").
		Where("status = ? AND name_rule = ? AND routing_target_model_id IS NULL", 1, NameRuleExact)
	if excludeModelId > 0 {
		query = query.Where("id <> ?", excludeModelId)
	}
	if err := query.Order("model_name ASC").Scan(&targets).Error; err != nil {
		return nil, err
	}
	return targets, nil
}

func currentModelRoutingSnapshot() (*modelRoutingSnapshot, error) {
	if DB == nil {
		return nil, errors.New("database is not initialized")
	}
	if snapshot := modelRoutingCache.Load(); snapshot != nil && time.Since(snapshot.loadedAt) < modelRoutingCacheTTL {
		return snapshot, nil
	}

	modelRoutingLock.Lock()
	defer modelRoutingLock.Unlock()
	if snapshot := modelRoutingCache.Load(); snapshot != nil && time.Since(snapshot.loadedAt) < modelRoutingCacheTTL {
		return snapshot, nil
	}

	var rows []modelRoutingAlias
	err := DB.Table("models AS source").
		Select(
			"source.model_name AS source_model_name, source.status AS source_status, " +
				"source.model_purpose AS model_purpose, source.routing_target_model_id AS target_model_id, " +
				"target.model_name AS target_model_name, target.status AS target_status",
		).
		Joins("LEFT JOIN models AS target ON target.id = source.routing_target_model_id AND target.deleted_at IS NULL").
		Where("source.deleted_at IS NULL AND source.routing_target_model_id IS NOT NULL").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	aliases := make(map[string]modelRoutingAlias, len(rows))
	for _, row := range rows {
		aliases[row.SourceModelName] = row
	}
	snapshot := &modelRoutingSnapshot{loadedAt: time.Now(), aliases: aliases}
	modelRoutingCache.Store(snapshot)
	return snapshot, nil
}
