package pricingadmin

import (
	"sort"
	"strings"

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
	ModelId            int                   `json:"model_id"`
	ModelName          string                `json:"model_name"`
	ActiveChannelCount int                   `json:"active_channel_count"`
	Input              *LowestPriceComponent `json:"input,omitempty"`
	Output             *LowestPriceComponent `json:"output,omitempty"`
	CacheRead          *LowestPriceComponent `json:"cache_read,omitempty"`
	CacheWrite         *LowestPriceComponent `json:"cache_write,omitempty"`
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
}

func ListModelPriceOverview(keyword string) ([]ModelPriceOverview, error) {
	query := model.DB.Table("channel_model_retail_price_versions AS retail").
		Select(`channel_models.model_id, models.model_name, retail.channel_model_id,
			channels.name AS channel_name, retail.currency, retail.input_unit_price,
			retail.output_unit_price, retail.cache_read_unit_price, retail.cache_write_unit_price`).
		Joins("JOIN channel_models ON channel_models.id = retail.channel_model_id").
		Joins("JOIN models ON models.id = channel_models.model_id").
		Joins("JOIN channels ON channels.id = channel_models.channel_id").
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

	overviewByModel := make(map[int]*ModelPriceOverview)
	channelsByModel := make(map[int]map[int]struct{})
	for _, candidate := range candidates {
		overview := overviewByModel[candidate.ModelId]
		if overview == nil {
			overview = &ModelPriceOverview{
				ModelId: candidate.ModelId, ModelName: candidate.ModelName,
			}
			overviewByModel[candidate.ModelId] = overview
			channelsByModel[candidate.ModelId] = make(map[int]struct{})
		}
		channelsByModel[candidate.ModelId][candidate.ChannelModelId] = struct{}{}
		updateLowestPrice(&overview.Input, candidate.InputUnitPrice, candidate)
		updateLowestPrice(&overview.Output, candidate.OutputUnitPrice, candidate)
		updateLowestPrice(&overview.CacheRead, candidate.CacheReadUnitPrice, candidate)
		updateLowestPrice(&overview.CacheWrite, candidate.CacheWriteUnitPrice, candidate)
	}
	result := make([]ModelPriceOverview, 0, len(overviewByModel))
	for modelId, overview := range overviewByModel {
		overview.ActiveChannelCount = len(channelsByModel[modelId])
		result = append(result, *overview)
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].ModelName == result[j].ModelName {
			return result[i].ModelId < result[j].ModelId
		}
		return result[i].ModelName < result[j].ModelName
	})
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
