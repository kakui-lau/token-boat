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
	"github.com/QuantumNous/new-api/setting/billing_setting"
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
	OfficialByModelName    map[string]model.OfficialModelPriceVersion
}

type RuntimeReadiness struct {
	TotalChannelModels       int64             `json:"total_channel_models"`
	V2ChannelModels          int64             `json:"v2_channel_models"`
	CompleteGroupModelScopes int               `json:"complete_group_model_scopes"`
	LiveTrafficEnabled       bool              `json:"live_traffic_enabled"`
	DistributedCircuitState  bool              `json:"distributed_circuit_state"`
	RouteScoreWeights        RouteScoreWeights `json:"route_score_weights"`
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
	var activePurchases []model.ChannelModelPurchasePriceVersion
	if err := db.Where(
		"channel_model_id = ? AND status = ?",
		channelModelId,
		model.PricingVersionStatusActive,
	).Order("id ASC").Limit(2).Find(&activePurchases).Error; err != nil {
		return bundle, err
	}
	if len(activePurchases) == 0 {
		return bundle, fmt.Errorf(
			"channel model %d has no active purchase price; publish a purchase price first",
			channelModelId,
		)
	}
	if len(activePurchases) > 1 {
		return bundle, fmt.Errorf(
			"channel model %d has multiple active purchase prices",
			channelModelId,
		)
	}
	bundle.Purchase = activePurchases[0]
	var activeRetails []model.ChannelModelRetailPriceVersion
	if err := db.Where(
		"channel_model_id = ? AND purchase_price_version_id = ? AND status = ?",
		channelModelId,
		bundle.Purchase.Id,
		model.PricingVersionStatusActive,
	).Order("id ASC").Limit(2).Find(&activeRetails).Error; err != nil {
		return bundle, err
	}
	if len(activeRetails) == 0 {
		return bundle, fmt.Errorf(
			"channel model %d has no active retail price for active purchase version %d; publish a linked retail price",
			channelModelId,
			bundle.Purchase.Version,
		)
	}
	if len(activeRetails) > 1 {
		return bundle, fmt.Errorf(
			"channel model %d has multiple active retail prices for purchase version %d",
			channelModelId,
			bundle.Purchase.Version,
		)
	}
	bundle.Retail = activeRetails[0]
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
	switch bundle.Purchase.PricingMode {
	case "official_ratio", "component_ratio", "fixed_unit_price", "hybrid", "custom_expr":
	default:
		return ActivePriceBundle{}, fmt.Errorf(
			"v2 runtime does not support pricing mode %q",
			bundle.Purchase.PricingMode,
		)
	}
	requiresOfficialPrice := bundle.Purchase.PricingMode == "official_ratio" ||
		bundle.Purchase.PricingMode == "component_ratio" ||
		bundle.Purchase.PricingMode == "hybrid"
	if requiresOfficialPrice && bundle.Official == nil {
		return ActivePriceBundle{}, errors.New(
			"v2 ratio pricing requires a published official price",
		)
	}
	if bundle.Official != nil {
		if !officialPriceCanRunInV2(*bundle.Official) {
			return ActivePriceBundle{}, errors.New(
				"v2 runtime requires a published v2 official price with a valid expression hash",
			)
		}
		if bundle.Official.ModelId != bundle.ChannelModel.ModelId {
			return ActivePriceBundle{}, errors.New(
				"v2 official price and channel model belong to different logical models",
			)
		}
		if bundle.Official.BillingMode != bundle.Purchase.BillingMode ||
			bundle.Official.PriceStructure != bundle.Purchase.PriceStructure ||
			bundle.Official.Currency != bundle.Purchase.Currency {
			return ActivePriceBundle{}, errors.New(
				"v2 purchase billing contract does not match official price",
			)
		}
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
	expressions := []struct {
		name          string
		schemaVersion string
		expression    string
		hash          string
	}{
		{
			name: "purchase", schemaVersion: bundle.Purchase.ExpressionSchemaVersion,
			expression: bundle.Purchase.PurchaseBillingExpr, hash: bundle.Purchase.PurchaseExprHash,
		},
		{
			name: "retail", schemaVersion: bundle.Retail.ExpressionSchemaVersion,
			expression: bundle.Retail.RetailBillingExpr, hash: bundle.Retail.RetailExprHash,
		},
	}
	for _, priceExpression := range expressions {
		if priceExpression.schemaVersion != "v2" ||
			billingexpr.ExprVersion(priceExpression.expression) != 2 {
			return ActivePriceBundle{}, fmt.Errorf(
				"%s price expression must use the v2 schema",
				priceExpression.name,
			)
		}
		if priceExpression.hash == "" ||
			priceExpression.hash != billingexpr.ExprHashString(priceExpression.expression) {
			return ActivePriceBundle{}, fmt.Errorf(
				"%s price expression hash does not match",
				priceExpression.name,
			)
		}
		if err := billing_setting.SmokeTestExpr(priceExpression.expression); err != nil {
			return ActivePriceBundle{}, fmt.Errorf(
				"execute %s price expression smoke test: %w",
				priceExpression.name,
				err,
			)
		}
	}
	return bundle, nil
}

func officialPriceCanRunInV2(official model.OfficialModelPriceVersion) bool {
	return (official.Status == model.PricingVersionStatusActive ||
		official.Status == model.PricingVersionStatusExpired) &&
		official.ExpressionSchemaVersion == "v2" &&
		billingexpr.ExprVersion(official.BillingExpr) == 2 &&
		official.ExprHash != "" &&
		official.ExprHash == billingexpr.ExprHashString(official.BillingExpr)
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
			if err := tx.Model(&model.Ability{}).
				Select("abilities.*").
				Joins("JOIN channels ON channels.id = abilities.channel_id").
				Where(
					"abilities.model = ? AND abilities.enabled = ? AND channels.status = ?",
					modelName,
					true,
					common.ChannelStatusEnabled,
				).
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
	if err := model.DB.Model(&model.ChannelModel{}).
		Select("channel_models.*").
		Joins("JOIN channels ON channels.id = channel_models.channel_id").
		Where(
			"channel_models.runtime_mode = ? AND channel_models.status <> ? AND channels.status = ?",
			RuntimeModeV2,
			0,
			common.ChannelStatusEnabled,
		).
		Find(&channelModels).Error; err != nil {
		return err
	}
	next := &CatalogSnapshot{
		CreatedAt:              time.Now(),
		RevisionByChannelModel: make(map[int]string, len(channelModels)),
		BundleByChannelModel:   make(map[int]ActivePriceBundle, len(channelModels)),
		CandidatesByGroupModel: make(map[string][]int),
		CompleteV2ByGroupModel: make(map[string]bool),
		OfficialByModelName:    make(map[string]model.OfficialModelPriceVersion),
	}
	for _, channelModel := range channelModels {
		bundle, err := ValidateV2Activation(channelModel.Id)
		if err != nil {
			common.SysError(fmt.Sprintf(
				"skip invalid v2 channel model %d and make its model unavailable: %v",
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
	var officialPointers []model.ModelOfficialPrice
	if err := model.DB.Find(&officialPointers).Error; err != nil {
		return err
	}
	if len(officialPointers) > 0 {
		revisionIDs := make([]int, 0, len(officialPointers))
		modelIDByRevisionID := make(map[int]int, len(officialPointers))
		for _, pointer := range officialPointers {
			revisionIDs = append(revisionIDs, pointer.CurrentRevisionId)
			modelIDByRevisionID[pointer.CurrentRevisionId] = pointer.ModelId
		}
		var officialVersions []model.OfficialModelPriceVersion
		if err := model.DB.Where("id IN ?", revisionIDs).
			Find(&officialVersions).Error; err != nil {
			return err
		}
		for _, version := range officialVersions {
			modelName := modelNameById[modelIDByRevisionID[version.Id]]
			if modelName != "" {
				next.OfficialByModelName[modelName] = version
			}
		}
	}
	var abilities []model.Ability
	if err := model.DB.Model(&model.Ability{}).
		Select("abilities.*").
		Joins("JOIN channels ON channels.id = abilities.channel_id").
		Where("abilities.enabled = ? AND channels.status = ?", true, common.ChannelStatusEnabled).
		Find(&abilities).Error; err != nil {
		return err
	}
	channelModelsByRoute := make(map[string][]int, len(channelModels))
	for _, channelModel := range channelModels {
		modelName := modelNameById[channelModel.ModelId]
		if modelName == "" {
			continue
		}
		key := fmt.Sprintf("%d\x00%s", channelModel.ChannelId, modelName)
		channelModelsByRoute[key] = append(
			channelModelsByRoute[key],
			channelModel.Id,
		)
	}
	enabledCount := make(map[string]int)
	for _, ability := range abilities {
		key := ability.Group + "\x00" + ability.Model
		enabledCount[key]++
		routeKey := fmt.Sprintf("%d\x00%s", ability.ChannelId, ability.Model)
		for _, channelModelID := range channelModelsByRoute[routeKey] {
			if _, valid := next.BundleByChannelModel[channelModelID]; !valid {
				continue
			}
			next.CandidatesByGroupModel[key] = append(
				next.CandidatesByGroupModel[key],
				channelModelID,
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
				"skip incompatible v2 candidate pool %q and make it unavailable: %v",
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
	readiness := RuntimeReadiness{
		DistributedCircuitState: circuitRedisEnabled(),
		RouteScoreWeights:       GetRouteScoreWeights(),
	}
	activeChannelModels := model.DB.Model(&model.ChannelModel{}).
		Joins("JOIN channels ON channels.id = channel_models.channel_id").
		Joins("JOIN models ON models.id = channel_models.model_id").
		Joins(
			"JOIN abilities ON abilities.channel_id = channel_models.channel_id AND abilities.model = models.model_name",
		).
		Where(
			"channel_models.status <> ? AND channels.status = ? AND abilities.enabled = ?",
			0,
			common.ChannelStatusEnabled,
			true,
		).
		Distinct("channel_models.id")
	if err := activeChannelModels.
		Count(&readiness.TotalChannelModels).Error; err != nil {
		return RuntimeReadiness{}, err
	}
	if err := activeChannelModels.Session(&gorm.Session{}).
		Where("channel_models.runtime_mode = ?", RuntimeModeV2).
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
