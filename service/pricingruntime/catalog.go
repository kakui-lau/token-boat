package pricingruntime

import (
	"crypto/sha256"
	"errors"
	"fmt"
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

var (
	currentCatalog atomic.Pointer[CatalogSnapshot]
	refreshLock    sync.Mutex
)

func LoadActivePriceBundle(channelModelId int) (ActivePriceBundle, error) {
	var bundle ActivePriceBundle
	if channelModelId <= 0 {
		return bundle, errors.New("channel model is required")
	}
	if err := model.DB.First(&bundle.ChannelModel, channelModelId).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return bundle, fmt.Errorf("channel model %d was not found", channelModelId)
		}
		return bundle, err
	}
	if err := model.DB.Where(
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
	if err := model.DB.Where(
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
		if err := model.DB.First(&official, *bundle.Purchase.OfficialPriceVersionId).Error; err != nil {
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
	bundle, err := LoadActivePriceBundle(channelModelId)
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
	}
	if bundle.Purchase.BillingMode != bundle.Retail.BillingMode {
		return ActivePriceBundle{}, errors.New(
			"v2 runtime requires matching purchase and retail billing modes",
		)
	}
	if _, supported := supportedBillingModes[bundle.Purchase.BillingMode]; !supported {
		return ActivePriceBundle{}, errors.New(
			"v2 runtime supports token, request, image, and character billing; keep duration pricing on legacy runtime",
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
		next.CompleteV2ByGroupModel[key] =
			count > 0 && len(next.CandidatesByGroupModel[key]) == count
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

func SetRuntimeMode(channelModelId int, runtimeMode string) error {
	if runtimeMode != RuntimeModeLegacy && runtimeMode != RuntimeModeV2 {
		return fmt.Errorf("unsupported runtime mode %q", runtimeMode)
	}
	if runtimeMode == RuntimeModeV2 {
		if _, err := ValidateV2Activation(channelModelId); err != nil {
			return err
		}
	}
	result := model.DB.Model(&model.ChannelModel{}).
		Where("id = ?", channelModelId).
		Updates(map[string]any{
			"runtime_mode": runtimeMode,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return fmt.Errorf("channel model %d was not found", channelModelId)
	}
	InvalidateCatalog()
	if runtimeMode == RuntimeModeV2 {
		return RefreshCatalog()
	}
	return nil
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
