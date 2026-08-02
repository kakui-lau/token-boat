package model

import (
	"fmt"
	"sort"
	"strings"

	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"
)

type Pricing struct {
	ID                     int                            `json:"id,omitempty"`
	ModelName              string                         `json:"model_name"`
	Description            string                         `json:"description,omitempty"`
	Icon                   string                         `json:"icon,omitempty"`
	Tags                   string                         `json:"tags,omitempty"`
	VendorID               int                            `json:"vendor_id,omitempty"`
	QuotaType              int                            `json:"quota_type"`
	ModelRatio             float64                        `json:"model_ratio"`
	ModelPrice             float64                        `json:"model_price"`
	OwnerBy                string                         `json:"owner_by"`
	CompletionRatio        float64                        `json:"completion_ratio"`
	CacheRatio             *float64                       `json:"cache_ratio,omitempty"`
	CreateCacheRatio       *float64                       `json:"create_cache_ratio,omitempty"`
	ImageRatio             *float64                       `json:"image_ratio,omitempty"`
	AudioRatio             *float64                       `json:"audio_ratio,omitempty"`
	AudioCompletionRatio   *float64                       `json:"audio_completion_ratio,omitempty"`
	EnableGroup            []string                       `json:"enable_groups"`
	SupportedEndpointTypes []constant.EndpointType        `json:"supported_endpoint_types"`
	BillingMode            string                         `json:"billing_mode,omitempty"`
	BillingExpr            string                         `json:"billing_expr,omitempty"`
	PricingVersion         string                         `json:"pricing_version,omitempty"`
	PricingSource          string                         `json:"pricing_source,omitempty"`
	OfficialPrice          *PublicPriceSummary            `json:"official_price,omitempty"`
	LowestPrice            *PublicPriceSummary            `json:"lowest_price,omitempty"`
	RetailPricesByGroup    map[string]*PublicPriceSummary `json:"retail_prices_by_group,omitempty"`
	PricingGroups          []string                       `json:"pricing_groups,omitempty"`
	Available              bool                           `json:"available"`
	AvailabilityStatus     string                         `json:"availability_status"`
}

const (
	PricingAvailabilityAvailable        = "available"
	PricingAvailabilityPriceUnavailable = "price_unavailable"
	PricingAvailabilityRouteUnavailable = "route_unavailable"
)

// PublicPriceSummary is a normalized, display-safe view of one model price.
// It keeps the public catalog independent from the billing expression grammar:
// expressions remain the runtime source of truth while clients render these
// structured items without attempting to interpret executable formulas.
type PublicPriceSummary struct {
	Currency        string            `json:"currency"`
	BillingMode     string            `json:"billing_mode"`
	PriceStructure  string            `json:"price_structure"`
	ComparisonScope string            `json:"comparison_scope,omitempty"`
	CandidateCount  int               `json:"candidate_count,omitempty"`
	Items           []PublicPriceItem `json:"items"`
}

type PublicPriceItem struct {
	Key               string `json:"key"`
	Component         string `json:"component"`
	Amount            string `json:"amount"`
	BaseAmount        string `json:"base_amount,omitempty"`
	Unit              string `json:"unit"`
	UnitSize          string `json:"unit_size"`
	Tier              string `json:"tier,omitempty"`
	UpperBound        string `json:"upper_bound,omitempty"`
	Operation         string `json:"operation,omitempty"`
	Quality           string `json:"quality,omitempty"`
	Resolution        string `json:"resolution,omitempty"`
	WithAudio         string `json:"with_audio,omitempty"`
	AppliedGroup      string `json:"applied_group,omitempty"`
	AppliedGroupLabel string `json:"applied_group_label,omitempty"`
	AppliedGroupRatio string `json:"applied_group_ratio,omitempty"`
}

type PricingVendor struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Icon        string `json:"icon,omitempty"`
}

var (
	pricingMap           []Pricing
	publicPricingMap     []Pricing
	vendorsList          []PricingVendor
	supportedEndpointMap map[string]common.EndpointInfo
	lastGetPricingTime   time.Time
	updatePricingLock    sync.Mutex

	// 缓存映射：模型名 -> 启用分组 / 计费类型
	modelEnableGroups     = make(map[string][]string)
	modelQuotaTypeMap     = make(map[string]int)
	modelEnableGroupsLock = sync.RWMutex{}
)

var (
	modelSupportEndpointTypes = make(map[string][]constant.EndpointType)
	modelSupportEndpointsLock = sync.RWMutex{}
)

func GetPricing() []Pricing {
	if time.Since(lastGetPricingTime) > time.Minute*1 || len(pricingMap) == 0 {
		updatePricingLock.Lock()
		defer updatePricingLock.Unlock()
		// Double check after acquiring the lock
		if time.Since(lastGetPricingTime) > time.Minute*1 || len(pricingMap) == 0 {
			modelSupportEndpointsLock.Lock()
			defer modelSupportEndpointsLock.Unlock()
			updatePricing()
		}
	}
	return pricingMap
}

// GetPublicPricing returns the model catalog used by the public model square.
// It includes active exact-name model records even when they do not currently
// have an enabled route or a complete price configuration.
func GetPublicPricing() []Pricing {
	GetPricing()
	return publicPricingMap
}

func InvalidatePricingCache() {
	updatePricingLock.Lock()
	defer updatePricingLock.Unlock()

	pricingMap = nil
	publicPricingMap = nil
	vendorsList = nil
	lastGetPricingTime = time.Time{}
}

// GetVendors 返回当前定价接口使用到的供应商信息
func GetVendors() []PricingVendor {
	if time.Since(lastGetPricingTime) > time.Minute*1 || len(pricingMap) == 0 {
		// 保证先刷新一次
		GetPricing()
	}
	return vendorsList
}

func GetModelSupportEndpointTypes(model string) []constant.EndpointType {
	if model == "" {
		return make([]constant.EndpointType, 0)
	}
	modelSupportEndpointsLock.RLock()
	defer modelSupportEndpointsLock.RUnlock()
	if endpoints, ok := modelSupportEndpointTypes[model]; ok {
		return endpoints
	}
	return make([]constant.EndpointType, 0)
}

func getPricingEndpointTypesForAbility(ability AbilityWithChannel, advancedCustomConfigs map[int]*dto.AdvancedCustomConfig) []constant.EndpointType {
	if ability.ChannelType != constant.ChannelTypeAdvancedCustom {
		return common.GetEndpointTypesByChannelType(ability.ChannelType, ability.Model)
	}
	if config := advancedCustomConfigs[ability.ChannelId]; config != nil {
		return config.SupportedEndpointTypesForModel(ability.Model)
	}
	return common.GetEndpointTypesByChannelType(ability.ChannelType, ability.Model)
}

// loadPricingAdvancedCustomConfigs runs inside updatePricing while
// updatePricingLock is held, and nests channelSyncLock.RLock. This defines the
// global lock order updatePricingLock -> channelSyncLock: any code path holding
// channelSyncLock must release it before touching the pricing cache (see
// InitChannelCache / CacheUpdateChannel), otherwise it deadlocks.
// The returned configs are pointers shared with the channel cache; they are
// replaced wholesale on update and never mutated in place, so reading them after
// RUnlock is safe.
func loadPricingAdvancedCustomConfigs(enableAbilities []AbilityWithChannel) map[int]*dto.AdvancedCustomConfig {
	channelIDs := make([]int, 0)
	seen := make(map[int]struct{})
	for _, ability := range enableAbilities {
		if ability.ChannelType != constant.ChannelTypeAdvancedCustom {
			continue
		}
		if _, exists := seen[ability.ChannelId]; exists {
			continue
		}
		seen[ability.ChannelId] = struct{}{}
		channelIDs = append(channelIDs, ability.ChannelId)
	}
	if len(channelIDs) == 0 {
		return nil
	}

	configs := make(map[int]*dto.AdvancedCustomConfig, len(channelIDs))
	if common.MemoryCacheEnabled {
		channelSyncLock.RLock()
		defer channelSyncLock.RUnlock()
		for _, channelID := range channelIDs {
			if config := channel2advancedCustomConfig[channelID]; config != nil {
				configs[channelID] = config
			}
		}
		return configs
	}

	for _, channelID := range channelIDs {
		channel, err := CacheGetChannel(channelID)
		if err != nil {
			common.SysLog(fmt.Sprintf("load advanced custom channel settings error: channel_id=%d, error=%v", channelID, err))
			continue
		}
		if channel.Type != constant.ChannelTypeAdvancedCustom {
			continue
		}
		if config := channel.GetOtherSettings().AdvancedCustom; config != nil {
			configs[channelID] = config
		}
	}
	return configs
}

func appendPricingEndpoint(endpoints []string, endpoint string) []string {
	if endpoint == "" || common.StringsContains(endpoints, endpoint) {
		return endpoints
	}
	return append(endpoints, endpoint)
}

func applyLegacyPricingFields(pricing *Pricing) {
	modelPrice, findPrice := ratio_setting.GetModelPrice(pricing.ModelName, false)
	if findPrice {
		pricing.ModelPrice = modelPrice
		pricing.QuotaType = 1
	} else {
		modelRatio, _, _ := ratio_setting.GetModelRatio(pricing.ModelName)
		pricing.ModelRatio = modelRatio
		pricing.CompletionRatio = ratio_setting.GetCompletionRatio(pricing.ModelName)
		pricing.QuotaType = 0
	}
	if cacheRatio, ok := ratio_setting.GetCacheRatio(pricing.ModelName); ok {
		pricing.CacheRatio = &cacheRatio
	}
	if createCacheRatio, ok := ratio_setting.GetCreateCacheRatio(pricing.ModelName); ok {
		pricing.CreateCacheRatio = &createCacheRatio
	}
	if imageRatio, ok := ratio_setting.GetImageRatio(pricing.ModelName); ok {
		pricing.ImageRatio = &imageRatio
	}
	if ratio_setting.ContainsAudioRatio(pricing.ModelName) {
		audioRatio := ratio_setting.GetAudioRatio(pricing.ModelName)
		pricing.AudioRatio = &audioRatio
	}
	if ratio_setting.ContainsAudioCompletionRatio(pricing.ModelName) {
		audioCompletionRatio := ratio_setting.GetAudioCompletionRatio(pricing.ModelName)
		pricing.AudioCompletionRatio = &audioCompletionRatio
	}
	if billingMode := billing_setting.GetBillingMode(pricing.ModelName); billingMode == "tiered_expr" {
		if expr, ok := billing_setting.GetBillingExpr(pricing.ModelName); ok && strings.TrimSpace(expr) != "" {
			pricing.BillingMode = billingMode
			pricing.BillingExpr = expr
		}
	}
}

func updatePricing() {
	//modelRatios := common.GetModelRatios()
	enableAbilities, err := GetAllEnableAbilityWithChannels()
	if err != nil {
		common.SysLog(fmt.Sprintf("GetAllEnableAbilityWithChannels error: %v", err))
		return
	}
	// 预加载模型元数据与供应商一次，避免循环查询
	var allMeta []Model
	_ = DB.Find(&allMeta).Error
	metaMap := make(map[string]*Model)
	prefixList := make([]*Model, 0)
	suffixList := make([]*Model, 0)
	containsList := make([]*Model, 0)
	for i := range allMeta {
		m := &allMeta[i]
		if m.NameRule == NameRuleExact {
			metaMap[m.ModelName] = m
		} else {
			switch m.NameRule {
			case NameRulePrefix:
				prefixList = append(prefixList, m)
			case NameRuleSuffix:
				suffixList = append(suffixList, m)
			case NameRuleContains:
				containsList = append(containsList, m)
			}
		}
	}

	// 将非精确规则模型匹配到 metaMap
	for _, m := range prefixList {
		for _, pricingModel := range enableAbilities {
			if strings.HasPrefix(pricingModel.Model, m.ModelName) {
				if _, exists := metaMap[pricingModel.Model]; !exists {
					metaMap[pricingModel.Model] = m
				}
			}
		}
	}
	for _, m := range suffixList {
		for _, pricingModel := range enableAbilities {
			if strings.HasSuffix(pricingModel.Model, m.ModelName) {
				if _, exists := metaMap[pricingModel.Model]; !exists {
					metaMap[pricingModel.Model] = m
				}
			}
		}
	}
	for _, m := range containsList {
		for _, pricingModel := range enableAbilities {
			if strings.Contains(pricingModel.Model, m.ModelName) {
				if _, exists := metaMap[pricingModel.Model]; !exists {
					metaMap[pricingModel.Model] = m
				}
			}
		}
	}

	// 预加载供应商
	var vendors []Vendor
	_ = DB.Find(&vendors).Error
	vendorMap := make(map[int]*Vendor)
	for i := range vendors {
		vendorMap[vendors[i].Id] = &vendors[i]
	}

	// 初始化默认供应商映射
	initDefaultVendorMapping(metaMap, vendorMap, enableAbilities)

	// 构建对前端友好的供应商列表
	vendorsList = make([]PricingVendor, 0, len(vendorMap))
	for _, v := range vendorMap {
		vendorsList = append(vendorsList, PricingVendor{
			ID:          v.Id,
			Name:        v.Name,
			Description: v.Description,
			Icon:        v.Icon,
		})
	}

	modelGroupsMap := make(map[string]*types.Set[string])

	for _, ability := range enableAbilities {
		groups, ok := modelGroupsMap[ability.Model]
		if !ok {
			groups = types.NewSet[string]()
			modelGroupsMap[ability.Model] = groups
		}
		groups.Add(ability.Group)
	}

	//这里使用切片而不是Set，因为一个模型可能支持多个端点类型，并且第一个端点是优先使用端点
	modelSupportEndpointsStr := make(map[string][]string)
	advancedCustomConfigs := loadPricingAdvancedCustomConfigs(enableAbilities)

	// 先根据已有能力填充原生端点
	for _, ability := range enableAbilities {
		endpoints := modelSupportEndpointsStr[ability.Model]
		channelTypes := getPricingEndpointTypesForAbility(ability, advancedCustomConfigs)
		for _, channelType := range channelTypes {
			if !common.StringsContains(endpoints, string(channelType)) {
				endpoints = append(endpoints, string(channelType))
			}
		}
		modelSupportEndpointsStr[ability.Model] = endpoints
	}

	// 再补充模型自定义端点：若配置有效则追加到已有推断，不再裁剪渠道真实能力
	for modelName, meta := range metaMap {
		if strings.TrimSpace(meta.Endpoints) == "" {
			continue
		}
		var raw map[string]interface{}
		if err := common.Unmarshal([]byte(meta.Endpoints), &raw); err == nil {
			endpoints := modelSupportEndpointsStr[modelName]
			for k, v := range raw {
				switch v.(type) {
				case string, map[string]interface{}:
					endpoints = appendPricingEndpoint(endpoints, k)
				}
			}
			if len(endpoints) > 0 {
				modelSupportEndpointsStr[modelName] = endpoints
			}
		}
	}

	modelSupportEndpointTypes = make(map[string][]constant.EndpointType)
	for model, endpoints := range modelSupportEndpointsStr {
		supportedEndpoints := make([]constant.EndpointType, 0)
		for _, endpointStr := range endpoints {
			endpointType := constant.EndpointType(endpointStr)
			supportedEndpoints = append(supportedEndpoints, endpointType)
		}
		modelSupportEndpointTypes[model] = supportedEndpoints
	}

	// 构建全局 supportedEndpointMap（默认 + 自定义覆盖）
	supportedEndpointMap = make(map[string]common.EndpointInfo)
	// 1. 默认端点
	for _, endpoints := range modelSupportEndpointTypes {
		for _, et := range endpoints {
			if info, ok := common.GetDefaultEndpointInfo(et); ok {
				if _, exists := supportedEndpointMap[string(et)]; !exists {
					supportedEndpointMap[string(et)] = info
				}
			}
		}
	}
	// 2. 自定义端点（models 表）覆盖默认
	for _, meta := range metaMap {
		if strings.TrimSpace(meta.Endpoints) == "" {
			continue
		}
		var raw map[string]interface{}
		if err := common.Unmarshal([]byte(meta.Endpoints), &raw); err == nil {
			for k, v := range raw {
				switch val := v.(type) {
				case string:
					supportedEndpointMap[k] = common.EndpointInfo{Path: val, Method: "POST"}
				case map[string]interface{}:
					ep := common.EndpointInfo{Method: "POST"}
					if p, ok := val["path"].(string); ok {
						ep.Path = p
					}
					if m, ok := val["method"].(string); ok {
						ep.Method = strings.ToUpper(m)
					}
					supportedEndpointMap[k] = ep
				default:
					// ignore unsupported types
				}
			}
		}
	}

	pricingMap = make([]Pricing, 0)
	for model, groups := range modelGroupsMap {
		pricing := Pricing{
			ModelName:              model,
			EnableGroup:            groups.Items(),
			SupportedEndpointTypes: modelSupportEndpointTypes[model],
		}

		// 补充模型元数据（描述、标签、供应商、状态）
		if meta, ok := metaMap[model]; ok {
			// 若模型被禁用(status!=1)，则直接跳过，不返回给前端
			if meta.Status != 1 {
				continue
			}
			pricing.Description = meta.Description
			pricing.Icon = meta.Icon
			pricing.Tags = meta.Tags
			pricing.VendorID = meta.VendorID
			if meta.NameRule == NameRuleExact && meta.ModelName == model {
				pricing.ID = meta.Id
			}
		}
		applyLegacyPricingFields(&pricing)
		pricingMap = append(pricingMap, pricing)
	}

	// 防止大更新后数据不通用
	if len(pricingMap) > 0 {
		pricingMap[0].PricingVersion = "5a90f2b86c08bd983a9a2e6d66c255f4eaef9c4bc934386d2b6ae84ef0ff1f1f"
	}

	publicPricingMap = make([]Pricing, 0, len(pricingMap)+len(allMeta))
	publicPricingMap = append(publicPricingMap, pricingMap...)
	publicModels := make(map[string]struct{}, len(publicPricingMap))
	for _, pricing := range publicPricingMap {
		publicModels[pricing.ModelName] = struct{}{}
	}
	for _, meta := range allMeta {
		if meta.Status != 1 || meta.NameRule != NameRuleExact || strings.TrimSpace(meta.ModelName) == "" {
			continue
		}
		if _, exists := publicModels[meta.ModelName]; exists {
			continue
		}
		pricing := Pricing{
			ID:                     meta.Id,
			ModelName:              meta.ModelName,
			Description:            meta.Description,
			Icon:                   meta.Icon,
			Tags:                   meta.Tags,
			VendorID:               meta.VendorID,
			EnableGroup:            make([]string, 0),
			SupportedEndpointTypes: modelSupportEndpointTypes[meta.ModelName],
		}
		applyLegacyPricingFields(&pricing)
		publicPricingMap = append(publicPricingMap, pricing)
	}
	sort.Slice(publicPricingMap, func(left int, right int) bool {
		return publicPricingMap[left].ModelName < publicPricingMap[right].ModelName
	})

	// 刷新缓存映射，供高并发快速查询
	modelEnableGroupsLock.Lock()
	modelEnableGroups = make(map[string][]string)
	modelQuotaTypeMap = make(map[string]int)
	for _, p := range pricingMap {
		modelEnableGroups[p.ModelName] = p.EnableGroup
		modelQuotaTypeMap[p.ModelName] = p.QuotaType
	}
	modelEnableGroupsLock.Unlock()

	lastGetPricingTime = time.Now()
}

// GetSupportedEndpointMap 返回全局端点到路径的映射
func GetSupportedEndpointMap() map[string]common.EndpointInfo {
	return supportedEndpointMap
}
