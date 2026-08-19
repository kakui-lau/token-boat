package pricingadmin

import (
	"fmt"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/shopspring/decimal"
)

type LowestPriceComponent struct {
	UnitPrice      string `json:"unit_price"`
	Currency       string `json:"currency"`
	ChannelModelId int    `json:"channel_model_id"`
	ChannelName    string `json:"channel_name"`
}

type ModelPriceOverview struct {
	ModelId            int                     `json:"model_id"`
	ModelName          string                  `json:"model_name"`
	Currency           string                  `json:"currency"`
	ActiveChannelCount int                     `json:"active_channel_count"`
	Input              *LowestPriceComponent   `json:"input,omitempty"`
	Output             *LowestPriceComponent   `json:"output,omitempty"`
	CacheRead          *LowestPriceComponent   `json:"cache_read,omitempty"`
	CacheWrite         *LowestPriceComponent   `json:"cache_write,omitempty"`
	Endpoints          []ProviderPriceEndpoint `json:"endpoints"`
}

type ProviderPriceEndpoint struct {
	ChannelModelId            int    `json:"channel_model_id"`
	ChannelName               string `json:"channel_name"`
	UpstreamModelName         string `json:"upstream_model_name"`
	RuntimeMode               string `json:"runtime_mode"`
	BillingMode               string `json:"billing_mode"`
	PriceStructure            string `json:"price_structure"`
	PurchasePricingMode       string `json:"purchase_pricing_mode"`
	PurchaseCurrency          string `json:"purchase_currency"`
	PurchasePriceComponents   string `json:"purchase_price_components"`
	PurchaseInputUnitPrice    string `json:"purchase_input_unit_price"`
	PurchaseOutputUnitPrice   string `json:"purchase_output_unit_price"`
	RetailPriceComponents     string `json:"retail_price_components"`
	RetailInputUnitPrice      string `json:"retail_input_unit_price"`
	RetailOutputUnitPrice     string `json:"retail_output_unit_price"`
	RetailCacheReadUnitPrice  string `json:"retail_cache_read_unit_price"`
	RetailCacheWriteUnitPrice string `json:"retail_cache_write_unit_price"`
	TargetNetMargin           string `json:"target_net_margin"`
}

type OfficialPriceOverview struct {
	ModelId               int    `json:"model_id"`
	ModelName             string `json:"model_name"`
	Status                string `json:"status"`
	Currency              string `json:"currency"`
	BillingMode           string `json:"billing_mode"`
	PriceStructure        string `json:"price_structure"`
	Version               int64  `json:"version"`
	VersionCount          int    `json:"version_count"`
	DraftCount            int    `json:"draft_count"`
	LatestDraftId         int    `json:"latest_draft_id"`
	EffectiveFrom         int64  `json:"effective_from"`
	InputUnitPrice        string `json:"input_unit_price"`
	OutputUnitPrice       string `json:"output_unit_price"`
	CacheReadUnitPrice    string `json:"cache_read_unit_price"`
	CacheWriteUnitPrice   string `json:"cache_write_unit_price"`
	CacheWrite1HUnitPrice string `json:"cache_write_1h_unit_price"`
	ImageInputUnitPrice   string `json:"image_input_unit_price"`
	ImageOutputUnitPrice  string `json:"image_output_unit_price"`
	AudioInputUnitPrice   string `json:"audio_input_unit_price"`
	AudioOutputUnitPrice  string `json:"audio_output_unit_price"`
	RequestUnitPrice      string `json:"request_unit_price"`
	VideoSecondUnitPrice  string `json:"video_second_unit_price"`
}

type officialOverviewComponents struct {
	InputUnitPrice        string `json:"input_unit_price"`
	OutputUnitPrice       string `json:"output_unit_price"`
	CacheReadUnitPrice    string `json:"cache_read_unit_price"`
	CacheWriteUnitPrice   string `json:"cache_write_unit_price"`
	CacheWrite1HUnitPrice string `json:"cache_write_1h_unit_price"`
	ImageInputUnitPrice   string `json:"image_input_unit_price"`
	ImageOutputUnitPrice  string `json:"image_output_unit_price"`
	AudioInputUnitPrice   string `json:"audio_input_unit_price"`
	AudioOutputUnitPrice  string `json:"audio_output_unit_price"`
	RequestUnitPrice      string `json:"request_unit_price"`
	VideoSecondUnitPrice  string `json:"video_second_unit_price"`
}

type modelPriceCandidate struct {
	ModelId             int
	ModelName           string
	ChannelModelId      int
	ChannelName         string
	Currency            string
	InputUnitPrice      string
	OutputUnitPrice     string
	CacheReadUnitPrice  string
	CacheWriteUnitPrice string
	UpstreamModelName   string
	RuntimeMode         string
	BillingMode         string
	PriceStructure      string
	PurchasePricingMode string
	PurchaseCurrency    string
	PurchaseComponents  string
	PurchaseInputPrice  string
	PurchaseOutputPrice string
	RetailComponents    string
	TargetNetMargin     string
}

func ListModelPriceOverview(keyword string) ([]ModelPriceOverview, error) {
	query := model.DB.Table("channel_model_retail_price_versions AS retail").
		Select(`channel_models.model_id, models.model_name, retail.channel_model_id,
			channels.name AS channel_name, retail.currency, retail.input_unit_price,
			retail.output_unit_price, retail.cache_read_unit_price, retail.cache_write_unit_price,
			channel_models.upstream_model_name, channel_models.runtime_mode,
			retail.billing_mode, retail.price_structure, retail.target_net_margin,
			retail.price_components AS retail_components,
			purchase.pricing_mode AS purchase_pricing_mode,
			purchase.currency AS purchase_currency,
			purchase.price_components AS purchase_components,
			purchase.input_unit_price AS purchase_input_price,
			purchase.output_unit_price AS purchase_output_price`).
		Joins("JOIN channel_models ON channel_models.id = retail.channel_model_id").
		Joins("JOIN models ON models.id = channel_models.model_id AND models.deleted_at IS NULL").
		Joins("JOIN channels ON channels.id = channel_models.channel_id").
		Joins("LEFT JOIN channel_model_purchase_price_versions AS purchase ON purchase.id = retail.purchase_price_version_id").
		Where("retail.status = ? AND channel_models.status = ?", model.PricingVersionStatusActive, 1)
	keyword = strings.TrimSpace(keyword)
	if keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where("models.model_name LIKE ? OR channels.name LIKE ?", like, like)
	}
	var candidates []modelPriceCandidate
	if err := query.Find(&candidates).Error; err != nil {
		return nil, err
	}

	overviewByModelCurrency := make(map[string]*ModelPriceOverview)
	channelsByModelCurrency := make(map[string]map[int]struct{})
	for _, candidate := range candidates {
		key := fmt.Sprintf("%d\x00%s", candidate.ModelId, candidate.Currency)
		overview := overviewByModelCurrency[key]
		if overview == nil {
			overview = &ModelPriceOverview{
				ModelId: candidate.ModelId, ModelName: candidate.ModelName,
				Currency: candidate.Currency,
			}
			overviewByModelCurrency[key] = overview
			channelsByModelCurrency[key] = make(map[int]struct{})
		}
		channelsByModelCurrency[key][candidate.ChannelModelId] = struct{}{}
		updateLowestPrice(&overview.Input, candidate.InputUnitPrice, candidate)
		updateLowestPrice(&overview.Output, candidate.OutputUnitPrice, candidate)
		updateLowestPrice(&overview.CacheRead, candidate.CacheReadUnitPrice, candidate)
		updateLowestPrice(&overview.CacheWrite, candidate.CacheWriteUnitPrice, candidate)
		overview.Endpoints = append(overview.Endpoints, ProviderPriceEndpoint{
			ChannelModelId: candidate.ChannelModelId, ChannelName: candidate.ChannelName,
			UpstreamModelName: candidate.UpstreamModelName, RuntimeMode: candidate.RuntimeMode,
			BillingMode: candidate.BillingMode, PriceStructure: candidate.PriceStructure,
			PurchasePricingMode: candidate.PurchasePricingMode, PurchaseCurrency: candidate.PurchaseCurrency,
			PurchasePriceComponents: candidate.PurchaseComponents,
			PurchaseInputUnitPrice:  candidate.PurchaseInputPrice,
			PurchaseOutputUnitPrice: candidate.PurchaseOutputPrice,
			RetailPriceComponents:   candidate.RetailComponents,
			RetailInputUnitPrice:    candidate.InputUnitPrice, RetailOutputUnitPrice: candidate.OutputUnitPrice,
			RetailCacheReadUnitPrice:  candidate.CacheReadUnitPrice,
			RetailCacheWriteUnitPrice: candidate.CacheWriteUnitPrice,
			TargetNetMargin:           candidate.TargetNetMargin,
		})
	}
	result := make([]ModelPriceOverview, 0, len(overviewByModelCurrency))
	for key, overview := range overviewByModelCurrency {
		overview.ActiveChannelCount = len(channelsByModelCurrency[key])
		sort.Slice(overview.Endpoints, func(i, j int) bool {
			if overview.Endpoints[i].ChannelName == overview.Endpoints[j].ChannelName {
				return overview.Endpoints[i].ChannelModelId < overview.Endpoints[j].ChannelModelId
			}
			return overview.Endpoints[i].ChannelName < overview.Endpoints[j].ChannelName
		})
		result = append(result, *overview)
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].ModelName == result[j].ModelName {
			if result[i].ModelId == result[j].ModelId {
				return result[i].Currency < result[j].Currency
			}
			return result[i].ModelId < result[j].ModelId
		}
		return result[i].ModelName < result[j].ModelName
	})
	return result, nil
}

func ListOfficialPriceOverview(keyword string) ([]OfficialPriceOverview, error) {
	query := model.DB.Model(&model.Model{}).
		Where("routing_target_model_id IS NULL").
		Order("model_name ASC")
	keyword = strings.TrimSpace(keyword)
	if keyword != "" {
		query = query.Where("model_name LIKE ?", "%"+keyword+"%")
	}
	var models []model.Model
	if err := query.Find(&models).Error; err != nil {
		return nil, err
	}

	modelIds := make([]int, 0, len(models))
	for _, logicalModel := range models {
		modelIds = append(modelIds, logicalModel.Id)
	}
	var versions []model.OfficialModelPriceVersion
	if len(modelIds) > 0 {
		if err := model.DB.Where("model_id IN ?", modelIds).
			Order("model_id ASC, version DESC").
			Find(&versions).Error; err != nil {
			return nil, err
		}
	}

	versionsByModel := make(map[int][]model.OfficialModelPriceVersion)
	for _, version := range versions {
		versionsByModel[version.ModelId] = append(versionsByModel[version.ModelId], version)
	}
	result := make([]OfficialPriceOverview, 0, len(models))
	for _, logicalModel := range models {
		modelVersions := versionsByModel[logicalModel.Id]
		overview := OfficialPriceOverview{
			ModelId: logicalModel.Id, ModelName: logicalModel.ModelName,
			Status: "unconfigured", VersionCount: len(modelVersions),
		}
		var selected *model.OfficialModelPriceVersion
		hasActive := false
		for index := range modelVersions {
			version := &modelVersions[index]
			if version.Status == model.PricingVersionStatusDraft {
				overview.DraftCount++
				if overview.LatestDraftId == 0 {
					overview.LatestDraftId = version.Id
				}
			}
			if selected == nil {
				selected = version
			}
			if !hasActive && version.Status == model.PricingVersionStatusActive {
				selected = version
				hasActive = true
			}
		}
		if selected != nil {
			overview.Status = selected.Status
			overview.Currency = selected.Currency
			overview.BillingMode = selected.BillingMode
			overview.PriceStructure = selected.PriceStructure
			overview.Version = selected.Version
			overview.EffectiveFrom = selected.EffectiveFrom
			var components officialOverviewComponents
			if err := common.UnmarshalJsonStr(selected.PriceComponents, &components); err == nil {
				overview.InputUnitPrice = components.InputUnitPrice
				overview.OutputUnitPrice = components.OutputUnitPrice
				overview.CacheReadUnitPrice = components.CacheReadUnitPrice
				overview.CacheWriteUnitPrice = components.CacheWriteUnitPrice
				overview.CacheWrite1HUnitPrice = components.CacheWrite1HUnitPrice
				overview.ImageInputUnitPrice = components.ImageInputUnitPrice
				overview.ImageOutputUnitPrice = components.ImageOutputUnitPrice
				overview.AudioInputUnitPrice = components.AudioInputUnitPrice
				overview.AudioOutputUnitPrice = components.AudioOutputUnitPrice
				overview.RequestUnitPrice = components.RequestUnitPrice
				overview.VideoSecondUnitPrice = components.VideoSecondUnitPrice
			}
		}
		result = append(result, overview)
	}
	return result, nil
}

func updateLowestPrice(
	current **LowestPriceComponent,
	value string,
	candidate modelPriceCandidate,
) {
	value = strings.TrimSpace(value)
	if value == "" {
		return
	}
	price, err := decimal.NewFromString(value)
	if err != nil || price.IsNegative() {
		return
	}
	if *current != nil {
		currentPrice, err := decimal.NewFromString((*current).UnitPrice)
		if err == nil && !price.LessThan(currentPrice) {
			return
		}
	}
	*current = &LowestPriceComponent{
		UnitPrice: value, Currency: candidate.Currency,
		ChannelModelId: candidate.ChannelModelId, ChannelName: candidate.ChannelName,
	}
}
