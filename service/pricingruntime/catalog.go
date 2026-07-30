package pricingruntime

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"gorm.io/gorm"
)

const (
	RuntimeModeLegacy = "legacy"
	RuntimeModeV2     = "v2"
)

type ActivePriceBundle struct {
	ChannelModel model.ChannelModel                     `json:"channel_model"`
	Official     *model.OfficialModelPriceVersion       `json:"official_price,omitempty"`
	Purchase     model.ChannelModelPurchasePriceVersion `json:"purchase_price"`
	Retail       model.ChannelModelRetailPriceVersion   `json:"retail_price"`
	Revision     string                                 `json:"revision"`
}

type CatalogSnapshot struct {
	CreatedAt              time.Time
	RevisionByChannelModel map[int]string
	BundleByChannelModel   map[int]ActivePriceBundle
	CandidatesByGroupModel map[string][]int
	CompleteV2ByGroupModel map[string]bool
}

type RuntimeReadiness struct {
	TotalChannelModels       int64 `json:"total_channel_models"`
	V2ChannelModels          int64 `json:"v2_channel_models"`
	CompleteGroupModelScopes int   `json:"complete_group_model_scopes"`
	LiveTrafficEnabled       bool  `json:"live_traffic_enabled"`
}

var (
	currentCatalog atomic.Pointer[CatalogSnapshot]
	refreshLock    sync.Mutex
)

func LoadActivePriceBundle(channelModelId int) (ActivePriceBundle, error) {
	return loadActivePriceBundle(model.DB, channelModelId)
}

func loadActivePriceBundle(db *gorm.DB, channelModelId int) (ActivePriceBundle, error) {
	var bundle ActivePriceBundle
	if channelModelId <= 0 {
		return bundle, errors.New("channel model is required")
	}
	if err := db.First(&bundle.ChannelModel, channelModelId).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return bundle, fmt.Errorf("channel model %d was not found", channelModelId)
		}
		return bundle, err
	}
	if err := db.Where(
		"channel_model_id = ? AND status = ?",
		channelModelId,
		model.PricingVersionStatusActive,
	).First(&bundle.Purchase).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return bundle, fmt.Errorf(
				"channel model %d has no active purchase price; publish a purchase price first",
				channelModelId,
			)
		}
		return bundle, err
	}
	if err := db.Where(
		"channel_model_id = ? AND purchase_price_version_id = ? AND status = ?",
		channelModelId,
		bundle.Purchase.Id,
		model.PricingVersionStatusActive,
	).First(&bundle.Retail).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return bundle, fmt.Errorf(
				"channel model %d has no active retail price for active purchase version %d; publish a linked retail price",
				channelModelId,
				bundle.Purchase.Version,
			)
		}
		return bundle, err
	}
	if bundle.Purchase.OfficialPriceVersionId != nil {
		var official model.OfficialModelPriceVersion
		if err := db.First(&official, *bundle.Purchase.OfficialPriceVersionId).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return bundle, fmt.Errorf(
					"active purchase price references missing official price %d",
					*bundle.Purchase.OfficialPriceVersionId,
				)
			}
			return bundle, err
		}
		bundle.Official = &official
	}
	bundle.Revision = bundleRevision(bundle)
	return bundle, nil
}

func ValidateV2Activation(channelModelId int) (ActivePriceBundle, error) {
	return validateV2Activation(model.DB, channelModelId)
}

func validateV2Activation(db *gorm.DB, channelModelId int) (ActivePriceBundle, error) {
	bundle, err := loadActivePriceBundle(db, channelModelId)
	if err != nil {
		return ActivePriceBundle{}, err
	}
	if bundle.ChannelModel.Status == 0 {
		return ActivePriceBundle{}, errors.New("disabled channel model cannot enable v2 runtime")
	}
	if bundle.Purchase.Currency != "USD" || bundle.Retail.Currency != "USD" {
		return ActivePriceBundle{}, errors.New("v2 runtime requires USD purchase and retail prices")
	}
	supportedBillingModes := map[string]struct{}{
		"token": {}, "request": {}, "image": {}, "character": {},
		"audio_duration": {}, "video_duration": {}, "mixed": {},
	}
	if bundle.Purchase.BillingMode != bundle.Retail.BillingMode {
		return ActivePriceBundle{}, errors.New(
			"v2 runtime requires matching purchase and retail billing modes",
		)
	}
	if _, supported := supportedBillingModes[bundle.Purchase.BillingMode]; !supported {
		return ActivePriceBundle{}, errors.New(
			"v2 runtime does not support this billing mode",
		)
	}
	if _, err := billingexpr.CompileFromCache(bundle.Purchase.PurchaseBillingExpr); err != nil {
		return ActivePriceBundle{}, fmt.Errorf("compile purchase price expression: %w", err)
	}
	if _, err := billingexpr.CompileFromCache(bundle.Retail.RetailBillingExpr); err != nil {
		return ActivePriceBundle{}, fmt.Errorf("compile retail price expression: %w", err)
	}
	return bundle, nil
}

func validateCandidateContracts(bundles []ActivePriceBundle) error {
	if len(bundles) < 2 {
		return nil
	}
	reference := bundles[0]
	for _, candidate := range bundles[1:] {
		if candidate.Purchase.Currency != reference.Purchase.Currency ||
			candidate.Retail.Currency != reference.Retail.Currency ||
			candidate.Purchase.BillingMode != reference.Purchase.BillingMode ||
			candidate.Purchase.PriceStructure != reference.Purchase.PriceStructure ||
			candidate.Retail.PriceStructure != reference.Retail.PriceStructure {
			return fmt.Errorf(
				"channel model %d billing contract does not match channel model %d",
				candidate.ChannelModel.Id,
				reference.ChannelModel.Id,
			)
		}
	}
	return nil
}

func SetModelRuntimeMode(modelName string, runtimeMode string) (int, error) {
	if runtimeMode != RuntimeModeLegacy && runtimeMode != RuntimeModeV2 {
		return 0, fmt.Errorf("unsupported runtime mode %q", runtimeMode)
	}
	modelName = strings.TrimSpace(modelName)
	if modelName == "" {
		return 0, errors.New("model name is required")
	}
	updated := 0
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		var logicalModel model.Model
		if err := tx.Where("model_name = ?", modelName).First(&logicalModel).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("model %q was not found", modelName)
			}
			return err
		}
		query := tx.Model(&model.ChannelModel{}).Where("model_id = ?", logicalModel.Id)
		if runtimeMode == RuntimeModeV2 {
			var abilities []model.Ability
			if err := tx.Where("model = ? AND enabled = ?", modelName, true).
				Find(&abilities).Error; err != nil {
				return err
			}
			channelIds := make([]int, 0, len(abilities))
			seenChannelIds := make(map[int]struct{}, len(abilities))
			for _, ability := range abilities {
				if _, exists := seenChannelIds[ability.ChannelId]; exists {
					continue
				}
				seenChannelIds[ability.ChannelId] = struct{}{}
				channelIds = append(channelIds, ability.ChannelId)
			}
			if len(channelIds) == 0 {
				return fmt.Errorf("model %q has no enabled routing abilities", modelName)
			}
			var channelModels []model.ChannelModel
			if err := tx.Where("model_id = ? AND channel_id IN ?", logicalModel.Id, channelIds).
				Find(&channelModels).Error; err != nil {
				return err
			}
			if len(channelModels) != len(channelIds) {
				return fmt.Errorf(
					"model %q has %d enabled channels but only %d channel models",
					modelName,
					len(channelIds),
					len(channelModels),
				)
			}
			ids := make([]int, 0, len(channelModels))
			bundles := make([]ActivePriceBundle, 0, len(channelModels))
			for _, channelModel := range channelModels {
				bundle, err := validateV2Activation(tx, channelModel.Id)
				if err != nil {
					return fmt.Errorf(
						"channel model %d is not ready for V2: %w",
						channelModel.Id,
						err,
					)
				}
				ids = append(ids, channelModel.Id)
				bundles = append(bundles, bundle)
			}
			if err := validateCandidateContracts(bundles); err != nil {
				return fmt.Errorf("model %q cannot enable V2: %w", modelName, err)
			}
			query = query.Where("id IN ?", ids)
		}
		var targetCount int64
		if err := query.Count(&targetCount).Error; err != nil {
			return err
		}
		if targetCount == 0 {
			return fmt.Errorf("model %q has no channel models", modelName)
		}
		result := query.Update("runtime_mode", runtimeMode)
		if result.Error != nil {
			return result.Error
		}
		updated = int(targetCount)
		return nil
	})
	if err != nil {
		return 0, err
	}
	InvalidateCatalog()
	if err := RefreshCatalog(); err != nil {
		return updated, err
	}
	return updated, nil
}

func RefreshCatalog() error {
	refreshLock.Lock()
	defer refreshLock.Unlock()

	var channelModels []model.ChannelModel
	if err := model.DB.Where("runtime_mode = ?", RuntimeModeV2).Find(&channelModels).Error; err != nil {
		return err
	}
	next := &CatalogSnapshot{
		CreatedAt:              time.Now(),
		RevisionByChannelModel: make(map[int]string, len(channelModels)),
		BundleByChannelModel:   make(map[int]ActivePriceBundle, len(channelModels)),
		CandidatesByGroupModel: make(map[string][]int),
		CompleteV2ByGroupModel: make(map[string]bool),
	}
	for _, channelModel := range channelModels {
		bundle, err := ValidateV2Activation(channelModel.Id)
		if err != nil {
			common.SysError(fmt.Sprintf(
				"skip invalid v2 channel model %d and fall back its model to legacy: %v",
				channelModel.Id,
				err,
			))
			continue
		}
		next.RevisionByChannelModel[channelModel.Id] = bundle.Revision
		next.BundleByChannelModel[channelModel.Id] = bundle
	}
	var models []model.Model
	if err := model.DB.Find(&models).Error; err != nil {
		return err
	}
	modelNameById := make(map[int]string, len(models))
	for _, logicalModel := range models {
		modelNameById[logicalModel.Id] = logicalModel.ModelName
	}
	var abilities []model.Ability
	if err := model.DB.Where("enabled = ?", true).Find(&abilities).Error; err != nil {
		return err
	}
	enabledCount := make(map[string]int)
	for _, ability := range abilities {
		key := ability.Group + "\x00" + ability.Model
		enabledCount[key]++
		for _, channelModel := range channelModels {
			if channelModel.ChannelId != ability.ChannelId ||
				modelNameById[channelModel.ModelId] != ability.Model {
				continue
			}
			if _, valid := next.BundleByChannelModel[channelModel.Id]; !valid {
				continue
			}
			next.CandidatesByGroupModel[key] = append(
				next.CandidatesByGroupModel[key],
				channelModel.Id,
			)
		}
	}
	for key, count := range enabledCount {
		candidateIds := next.CandidatesByGroupModel[key]
		if count == 0 || len(candidateIds) != count {
			continue
		}
		bundles := make([]ActivePriceBundle, 0, len(candidateIds))
		for _, channelModelId := range candidateIds {
			bundles = append(bundles, next.BundleByChannelModel[channelModelId])
		}
		if err := validateCandidateContracts(bundles); err != nil {
			common.SysError(fmt.Sprintf(
				"skip incompatible v2 candidate pool %q and fall back to legacy: %v",
				strings.ReplaceAll(key, "\x00", "/"),
				err,
			))
			continue
		}
		next.CompleteV2ByGroupModel[key] = true
	}
	currentCatalog.Store(next)
	return nil
}

func GetCandidateBundles(group string, modelName string) []ActivePriceBundle {
	snapshot, ok := getCatalogSnapshot()
	if !ok {
		return nil
	}
	ids := snapshot.CandidatesByGroupModel[group+"\x00"+modelName]
	if !snapshot.CompleteV2ByGroupModel[group+"\x00"+modelName] {
		return nil
	}
	bundles := make([]ActivePriceBundle, 0, len(ids))
	for _, id := range ids {
		if bundle, ok := snapshot.BundleByChannelModel[id]; ok {
			bundles = append(bundles, bundle)
		}
	}
	return bundles
}

func HasCompleteV2Pricing(group string, modelName string) bool {
	return len(GetCandidateBundles(group, modelName)) > 0
}

func GetRuntimeReadiness() (RuntimeReadiness, error) {
	var readiness RuntimeReadiness
	if err := model.DB.Model(&model.ChannelModel{}).
		Count(&readiness.TotalChannelModels).Error; err != nil {
		return RuntimeReadiness{}, err
	}
	if err := model.DB.Model(&model.ChannelModel{}).
		Where("runtime_mode = ?", RuntimeModeV2).
		Count(&readiness.V2ChannelModels).Error; err != nil {
		return RuntimeReadiness{}, err
	}
	snapshot := currentCatalog.Load()
	if snapshot == nil || time.Since(snapshot.CreatedAt) >= time.Minute {
		if err := RefreshCatalog(); err != nil {
			return RuntimeReadiness{}, err
		}
		snapshot = currentCatalog.Load()
	}
	if snapshot == nil {
		return readiness, nil
	}
	for _, complete := range snapshot.CompleteV2ByGroupModel {
		if !complete {
			continue
		}
		readiness.CompleteGroupModelScopes++
	}
	readiness.LiveTrafficEnabled = readiness.CompleteGroupModelScopes > 0
	return readiness, nil
}

func GetActiveBundle(channelModelId int) (ActivePriceBundle, bool) {
	snapshot, ok := getCatalogSnapshot()
	if !ok {
		return ActivePriceBundle{}, false
	}
	bundle, exists := snapshot.BundleByChannelModel[channelModelId]
	return bundle, exists
}

func getCatalogSnapshot() (*CatalogSnapshot, bool) {
	snapshot := currentCatalog.Load()
	if snapshot == nil || time.Since(snapshot.CreatedAt) >= time.Minute {
		if err := RefreshCatalog(); err != nil {
			return nil, false
		}
		snapshot = currentCatalog.Load()
	}
	return snapshot, snapshot != nil
}

func InvalidateCatalog() {
	currentCatalog.Store(nil)
}

func bundleRevision(bundle ActivePriceBundle) string {
	officialIdentity := "none"
	if bundle.Official != nil {
		officialIdentity = fmt.Sprintf(
			"%d:%d:%s:%s",
			bundle.Official.Id,
			bundle.Official.UpdatedAt,
			bundle.Official.Status,
			bundle.Official.ExprHash,
		)
	}
	payload := fmt.Sprintf(
		"cm=%d:%d:%d:%s|official=%s|purchase=%d:%d:%s:%s|retail=%d:%d:%s:%s",
		bundle.ChannelModel.Id,
		bundle.ChannelModel.UpdatedAt,
		bundle.ChannelModel.Status,
		bundle.ChannelModel.RuntimeMode,
		officialIdentity,
		bundle.Purchase.Id,
		bundle.Purchase.UpdatedAt,
		bundle.Purchase.Status,
		bundle.Purchase.PurchaseExprHash,
		bundle.Retail.Id,
		bundle.Retail.UpdatedAt,
		bundle.Retail.Status,
		bundle.Retail.RetailExprHash,
	)
	return fmt.Sprintf("%x", sha256.Sum256([]byte(payload)))
}
