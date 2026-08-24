package pricingadmin

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

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
