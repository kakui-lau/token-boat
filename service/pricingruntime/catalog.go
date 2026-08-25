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

type ActivePriceBundle struct {
	ChannelModel     model.ChannelModel                     `json:"channel_model"`
	ProviderCostMode string                                 `json:"provider_cost_mode"`
	Official         *model.OfficialModelPriceVersion       `json:"official_price,omitempty"`
	Purchase         model.ChannelModelPurchasePriceVersion `json:"purchase_price"`
	Revision         string                                 `json:"revision"`
}

type CatalogSnapshot struct {
	CreatedAt              time.Time
	RevisionByChannelModel map[int]string
	BundleByChannelModel   map[int]ActivePriceBundle
	CandidatesByGroupModel map[string][]int
	CompleteByGroupModel   map[string]bool
	OfficialByModelName    map[string]model.OfficialModelPriceVersion
}

type RuntimeReadiness struct {
	TotalChannelModels       int64             `json:"total_channel_models"`
	PricedChannelModels      int64             `json:"priced_channel_models"`
	CompleteGroupModelScopes int               `json:"complete_group_model_scopes"`
	LiveTrafficEnabled       bool              `json:"live_traffic_enabled"`
	DistributedCircuitState  bool              `json:"distributed_circuit_state"`
	RouteScoreWeights        RouteScoreWeights `json:"route_score_weights"`
	TocDefaultReady          bool              `json:"toc_default_ready"`
	TocDefaultError          string            `json:"toc_default_error,omitempty"`
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
	bundle.ProviderCostMode = model.ProviderCostModeEstimated
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

func validatePricingActivation(db *gorm.DB, channelModelId int) (ActivePriceBundle, error) {
	bundle, err := loadActivePriceBundle(db, channelModelId)
	if err != nil {
		return ActivePriceBundle{}, err
	}
	if bundle.ChannelModel.Status == 0 {
		return ActivePriceBundle{}, errors.New("disabled channel model cannot use structured pricing")
	}
	var logicalModel model.Model
	if err := db.Select("id", "routing_target_model_id").First(
		&logicalModel,
		bundle.ChannelModel.ModelId,
	).Error; err != nil {
		return ActivePriceBundle{}, err
	}
	if logicalModel.RoutingTargetModelId != nil {
		return ActivePriceBundle{}, errors.New(
			"system model aliases reuse their routing target and cannot own an independent price chain",
		)
	}
	if bundle.Purchase.Currency != "USD" {
		return ActivePriceBundle{}, errors.New("structured pricing requires USD purchase pricing")
	}
	switch bundle.Purchase.PricingMode {
	case "official_ratio", "component_ratio", "fixed_unit_price", "custom_expr":
	default:
		return ActivePriceBundle{}, fmt.Errorf(
			"structured pricing does not support pricing mode %q",
			bundle.Purchase.PricingMode,
		)
	}
	requiresOfficialPrice := bundle.Purchase.PricingMode == "official_ratio" ||
		bundle.Purchase.PricingMode == "component_ratio"
	if requiresOfficialPrice && bundle.Official == nil {
		return ActivePriceBundle{}, errors.New(
			"ratio pricing requires a published official price",
		)
	}
	if bundle.Official != nil {
		if bundle.Official.ModelId != bundle.ChannelModel.ModelId ||
			bundle.Official.BillingMode != bundle.Purchase.BillingMode ||
			bundle.Official.PriceStructure != bundle.Purchase.PriceStructure ||
			bundle.Official.Currency != bundle.Purchase.Currency {
			return ActivePriceBundle{}, errors.New(
				"purchase billing contract does not match official price",
			)
		}
	}
	supportedBillingModes := map[string]struct{}{
		"token": {}, "request": {}, "image": {}, "character": {},
		"audio_duration": {}, "video_duration": {}, "mixed": {},
	}
	if _, supported := supportedBillingModes[bundle.Purchase.BillingMode]; !supported {
		return ActivePriceBundle{}, errors.New("structured pricing does not support this billing mode")
	}
	if bundle.Purchase.ExpressionSchemaVersion != "v2" ||
		billingexpr.ExprVersion(bundle.Purchase.PurchaseBillingExpr) != 2 {
		return ActivePriceBundle{}, errors.New("purchase price expression must use the v2 schema")
	}
	if bundle.Purchase.PurchaseExprHash == "" ||
		bundle.Purchase.PurchaseExprHash != billingexpr.ExprHashString(bundle.Purchase.PurchaseBillingExpr) {
		return ActivePriceBundle{}, errors.New("purchase price expression hash does not match")
	}
	if err := billing_setting.SmokeTestExpr(bundle.Purchase.PurchaseBillingExpr); err != nil {
		return ActivePriceBundle{}, fmt.Errorf("execute purchase price expression smoke test: %w", err)
	}
	return bundle, nil
}

func ValidatePricingActivation(channelModelId int) (ActivePriceBundle, error) {
	return validatePricingActivation(model.DB, channelModelId)
}

func validateCandidateContracts(bundles []ActivePriceBundle) error {
	if len(bundles) < 2 {
		return nil
	}
	reference := bundles[0].Purchase
	for _, candidate := range bundles[1:] {
		if candidate.Purchase.Currency != reference.Currency ||
			candidate.Purchase.BillingMode != reference.BillingMode ||
			candidate.Purchase.PriceStructure != reference.PriceStructure {
			return fmt.Errorf(
				"channel model %d purchase contract does not match channel model %d",
				candidate.ChannelModel.Id,
				bundles[0].ChannelModel.Id,
			)
		}
	}
	return nil
}

func RefreshCatalog() error {
	refreshLock.Lock()
	defer refreshLock.Unlock()

	type catalogChannelModel struct {
		model.ChannelModel
		ChannelType      int    `gorm:"column:channel_type"`
		ProviderCostMode string `gorm:"column:provider_cost_mode"`
	}
	var channelModels []catalogChannelModel
	if err := model.DB.Model(&model.ChannelModel{}).
		Select(
			"channel_models.*, channels.type AS channel_type, "+
				"channels.provider_cost_mode AS provider_cost_mode",
		).
		Joins("JOIN channels ON channels.id = channel_models.channel_id").
		Joins("JOIN models ON models.id = channel_models.model_id").
		Where(
			"channel_models.status <> ? AND channels.status = ? AND models.status = ? AND models.deleted_at IS NULL AND models.routing_target_model_id IS NULL",
			0,
			common.ChannelStatusEnabled,
			1,
		).
		Find(&channelModels).Error; err != nil {
		return err
	}
	next := &CatalogSnapshot{
		CreatedAt:              time.Now(),
		RevisionByChannelModel: make(map[int]string, len(channelModels)),
		BundleByChannelModel:   make(map[int]ActivePriceBundle, len(channelModels)),
		CandidatesByGroupModel: make(map[string][]int),
		CompleteByGroupModel:   make(map[string]bool),
		OfficialByModelName:    make(map[string]model.OfficialModelPriceVersion),
	}
	for _, channelModel := range channelModels {
		providerCostMode, err := model.NormalizeProviderCostMode(
			channelModel.ChannelType,
			channelModel.ProviderCostMode,
		)
		if err != nil {
			common.SysError(fmt.Sprintf(
				"skip invalid priced channel model %d and make its model unavailable: %v",
				channelModel.Id,
				err,
			))
			continue
		}
		bundle, err := validatePricingActivation(model.DB, channelModel.Id)
		if err != nil {
			common.SysError(fmt.Sprintf(
				"skip invalid priced channel model %d: %v",
				channelModel.Id,
				err,
			))
			continue
		}
		bundle.ProviderCostMode = providerCostMode
		bundle.Revision = bundleRevision(bundle)
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
			if _, valid := next.BundleByChannelModel[channelModelID]; valid {
				next.CandidatesByGroupModel[key] = append(
					next.CandidatesByGroupModel[key],
					channelModelID,
				)
			}
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
				"skip incompatible priced candidate pool %q and make it unavailable: %v",
				strings.ReplaceAll(key, "\x00", "/"),
				err,
			))
			continue
		}
		next.CompleteByGroupModel[key] = true
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
	if !snapshot.CompleteByGroupModel[group+"\x00"+modelName] {
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

func HasCompletePricing(group string, modelName string) bool {
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
			"channel_models.status <> ? AND channels.status = ? AND abilities.enabled = ? AND models.status = ? AND models.deleted_at IS NULL AND models.routing_target_model_id IS NULL",
			0,
			common.ChannelStatusEnabled,
			true,
			1,
		).
		Distinct("channel_models.id")
	var activeChannelModelIds []int
	if err := activeChannelModels.
		Pluck("channel_models.id", &activeChannelModelIds).Error; err != nil {
		return RuntimeReadiness{}, err
	}
	readiness.TotalChannelModels = int64(len(activeChannelModelIds))
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
	for _, channelModelId := range activeChannelModelIds {
		if _, ok := snapshot.BundleByChannelModel[channelModelId]; ok {
			readiness.PricedChannelModels++
		}
	}
	for _, complete := range snapshot.CompleteByGroupModel {
		if !complete {
			continue
		}
		readiness.CompleteGroupModelScopes++
	}
	var defaultBook model.SalesPriceBookDefault
	if err := model.DB.First(&defaultBook, "default_key = ?", "toc_default").Error; err != nil {
		readiness.TocDefaultError = "TOC default sales price book is not configured"
	} else {
		var book model.SalesPriceBook
		if err := model.DB.First(&book, defaultBook.PriceBookId).Error; err != nil ||
			book.Audience != "toc" || book.Status != model.SalesPriceBookStatusEnabled ||
			book.CurrentVersionId == nil {
			readiness.TocDefaultError = "TOC default sales price book is invalid or disabled"
		} else {
			var enabledItems int64
			if err := model.DB.Model(&model.SalesPriceBookItem{}).
				Where("price_book_version_id = ? AND status = ?", *book.CurrentVersionId, "enabled").
				Count(&enabledItems).Error; err != nil {
				return RuntimeReadiness{}, err
			}
			readiness.TocDefaultReady = enabledItems > 0
			if !readiness.TocDefaultReady {
				readiness.TocDefaultError = "TOC default sales price book has no enabled model prices"
			}
		}
	}
	readiness.LiveTrafficEnabled = readiness.CompleteGroupModelScopes > 0 && readiness.TocDefaultReady
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
		"cm=%d:%d:%d|provider_cost_mode=%s|official=%s|purchase=%d:%d:%s:%s",
		bundle.ChannelModel.Id,
		bundle.ChannelModel.UpdatedAt,
		bundle.ChannelModel.Status,
		bundle.ProviderCostMode,
		officialIdentity,
		bundle.Purchase.Id,
		bundle.Purchase.UpdatedAt,
		bundle.Purchase.Status,
		bundle.Purchase.PurchaseExprHash,
	)
	return fmt.Sprintf("%x", sha256.Sum256([]byte(payload)))
}
