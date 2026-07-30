package controller

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/pricingadmin"
	"github.com/QuantumNous/new-api/service/pricingruntime"
	"github.com/gin-gonic/gin"
)

type channelModelAdminRow struct {
	model.ChannelModel
	ChannelName                string `json:"channel_name"`
	ModelName                  string `json:"model_name"`
	ActiveRetailPriceVersionId int    `json:"active_retail_price_version_id"`
	ActiveRetailPriceVersion   int64  `json:"active_retail_price_version"`
}

type pricingAdminCatalogOption struct {
	Id                int    `json:"id"`
	Name              string `json:"name"`
	UpstreamModelName string `json:"upstream_model_name,omitempty"`
}

func AdminListPricingCatalogOptions(c *gin.Context) {
	var channels []pricingAdminCatalogOption
	if err := model.DB.Model(&model.Channel{}).
		Select("id, name").
		Order("name ASC").
		Scan(&channels).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	models := make([]pricingAdminCatalogOption, 0)
	if rawChannelId := strings.TrimSpace(c.Query("channel_id")); rawChannelId != "" {
		channelId, err := strconv.Atoi(rawChannelId)
		if err != nil || channelId <= 0 {
			common.ApiErrorMsg(c, "channel_id 无效")
			return
		}
		models, err = configuredPricingCatalogModels(channelId)
		if err != nil {
			common.ApiError(c, err)
			return
		}
	}
	common.ApiSuccess(c, gin.H{"channels": channels, "models": models})
}

func AdminListModelPriceOverview(c *gin.Context) {
	items, err := pricingadmin.ListModelPriceOverview(c.Query("keyword"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, items)
}

func AdminListOfficialPriceOverview(c *gin.Context) {
	items, err := pricingadmin.ListOfficialPriceOverview(c.Query("keyword"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, items)
}

func AdminListChannelModels(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	keyword := strings.TrimSpace(c.Query("keyword"))
	activeRetailPrices := model.DB.Table("channel_model_retail_price_versions").
		Select(
			"channel_model_id, MAX(id) AS active_retail_price_version_id, "+
				"MAX(version) AS active_retail_price_version",
		).
		Where("status = ?", model.PricingVersionStatusActive).
		Group("channel_model_id")
	query := model.DB.Table("channel_models").
		Select(
			"channel_models.*, channels.name AS channel_name, models.model_name AS model_name, "+
				"COALESCE(active_retail.active_retail_price_version_id, 0) AS active_retail_price_version_id, "+
				"COALESCE(active_retail.active_retail_price_version, 0) AS active_retail_price_version",
		).
		Joins("JOIN channels ON channels.id = channel_models.channel_id").
		Joins("JOIN models ON models.id = channel_models.model_id").
		Joins(
			"LEFT JOIN (?) AS active_retail ON active_retail.channel_model_id = channel_models.id",
			activeRetailPrices,
		)
	if keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where(
			"channels.name LIKE ? OR models.model_name LIKE ? OR channel_models.upstream_model_name LIKE ?",
			like,
			like,
			like,
		)
	}
	if channelId := strings.TrimSpace(c.Query("channel_id")); channelId != "" {
		query = query.Where("channel_models.channel_id = ?", channelId)
	}
	if modelId := strings.TrimSpace(c.Query("model_id")); modelId != "" {
		query = query.Where("channel_models.model_id = ?", modelId)
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		statusValue, err := strconv.Atoi(status)
		if err != nil || (statusValue != 0 && statusValue != 1) {
			common.ApiErrorMsg(c, "status 无效")
			return
		}
		query = query.Where("channel_models.status = ?", statusValue)
	}
	if runtimeMode := strings.TrimSpace(c.Query("runtime_mode")); runtimeMode != "" {
		if runtimeMode != "legacy" && runtimeMode != "v2" {
			common.ApiErrorMsg(c, "runtime_mode 无效")
			return
		}
		query = query.Where("channel_models.runtime_mode = ?", runtimeMode)
	}
	if retailStatus := strings.TrimSpace(c.Query("retail_status")); retailStatus != "" {
		switch retailStatus {
		case "published":
			query = query.Where("active_retail.active_retail_price_version_id IS NOT NULL")
		case "unpublished":
			query = query.Where("active_retail.active_retail_price_version_id IS NULL")
		default:
			common.ApiErrorMsg(c, "retail_status 无效")
			return
		}
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	var rows []channelModelAdminRow
	if err := query.Order("channel_models.id DESC").
		Offset(pageInfo.GetStartIdx()).
		Limit(pageInfo.GetPageSize()).
		Scan(&rows).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"items":     rows,
		"total":     total,
		"page":      pageInfo.GetPage(),
		"page_size": pageInfo.GetPageSize(),
	})
}

func AdminCreateChannelModel(c *gin.Context) {
	var input model.ChannelModel
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	if input.ChannelId <= 0 || input.ModelId <= 0 || strings.TrimSpace(input.UpstreamModelName) == "" {
		common.ApiErrorMsg(c, "渠道、模型和上游模型名称不能为空")
		return
	}
	if input.RuntimeMode != "" && input.RuntimeMode != pricingruntime.RuntimeModeLegacy {
		common.ApiErrorMsg(c, "新渠道模型必须先使用 legacy 模式并发布完整价格链")
		return
	}
	if err := requireChannelModelReferences(input.ChannelId, input.ModelId); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := requireModelConfiguredOnChannel(input.ChannelId, input.ModelId); err != nil {
		common.ApiError(c, err)
		return
	}
	input.Id = 0
	input.RuntimeMode = pricingruntime.RuntimeModeLegacy
	input.UpstreamModelName = strings.TrimSpace(input.UpstreamModelName)
	if err := model.DB.Create(&input).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &input)
}

func AdminUpdateChannelModel(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "渠道模型 ID 无效")
		return
	}
	var input model.ChannelModel
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	if input.ChannelId <= 0 || input.ModelId <= 0 || strings.TrimSpace(input.UpstreamModelName) == "" {
		common.ApiErrorMsg(c, "渠道、模型和上游模型名称不能为空")
		return
	}
	if input.RuntimeMode != "" &&
		input.RuntimeMode != pricingruntime.RuntimeModeLegacy &&
		input.RuntimeMode != pricingruntime.RuntimeModeV2 {
		common.ApiErrorMsg(c, "运行模式必须是 legacy 或 v2")
		return
	}
	if err := requireChannelModelReferences(input.ChannelId, input.ModelId); err != nil {
		common.ApiError(c, err)
		return
	}
	var current model.ChannelModel
	if err := model.DB.First(&current, id).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	if input.ChannelId != current.ChannelId ||
		input.ModelId != current.ModelId ||
		strings.TrimSpace(input.UpstreamModelName) != current.UpstreamModelName {
		common.ApiErrorMsg(c, "渠道模型标识创建后不可修改，请新建渠道模型")
		return
	}
	runtimeMode := input.RuntimeMode
	if runtimeMode == "" {
		runtimeMode = current.RuntimeMode
	}
	if runtimeMode == pricingruntime.RuntimeModeV2 {
		if input.Status == 0 {
			common.ApiErrorMsg(c, "停用的渠道模型不能启用 V2 运行时")
			return
		}
		if _, err := pricingruntime.ValidateV2Activation(current.Id); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	updates := map[string]any{
		"status":            input.Status,
		"priority":          input.Priority,
		"weight":            input.Weight,
		"region":            input.Region,
		"data_policy":       input.DataPolicy,
		"capability_config": input.CapabilityConfig,
		"routing_tags":      input.RoutingTags,
		"runtime_mode":      runtimeMode,
		"updated_at":        common.GetTimestamp(),
	}
	if err := model.DB.Model(&current).Updates(updates).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	pricingruntime.InvalidateCatalog()
	if runtimeMode == pricingruntime.RuntimeModeV2 {
		if err := pricingruntime.RefreshCatalog(); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	if err := model.DB.First(&current, id).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &current)
}

func AdminSyncLegacyChannelModels(c *gin.Context) {
	result, err := model.InitializeChannelModelsFromAbilities()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func AdminListOfficialPriceVersions(c *gin.Context) {
	modelId, ok := positiveQueryId(c, "model_id")
	if !ok {
		return
	}
	var versions []model.OfficialModelPriceVersion
	if err := model.DB.Where("model_id = ?", modelId).
		Order("version DESC").
		Find(&versions).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, versions)
}

func AdminCreateOfficialPriceVersion(c *gin.Context) {
	var input model.OfficialModelPriceVersion
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := pricingadmin.CreateOfficialPriceVersion(&input, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &input)
}

func AdminUpdateOfficialPriceVersionDraft(c *gin.Context) {
	id, ok := positivePathId(c)
	if !ok {
		return
	}
	var input model.OfficialModelPriceVersion
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	updated, err := pricingadmin.UpdateOfficialPriceVersionDraft(id, &input)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &updated)
}

func AdminPublishOfficialPriceVersion(c *gin.Context) {
	id, ok := positivePathId(c)
	if !ok {
		return
	}
	if err := pricingadmin.PublishOfficialPriceVersion(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminPublishLatestOfficialPriceDrafts(c *gin.Context) {
	result, err := pricingadmin.PublishLatestOfficialPriceDrafts()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func AdminSyncOfficialPrices(c *gin.Context) {
	var input pricingadmin.OfficialPriceSyncInput
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	result, err := pricingadmin.SyncOfficialPrices(input, c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func AdminListOfficialPriceSyncBatches(c *gin.Context) {
	limit, _ := strconv.Atoi(c.Query("limit"))
	batches, err := pricingadmin.ListOfficialPriceSyncBatches(limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, batches)
}

func AdminDeleteOfficialPriceDraft(c *gin.Context) {
	id, ok := positivePathId(c)
	if !ok {
		return
	}
	if err := pricingadmin.DeleteOfficialPriceDraft(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminImportLegacyOfficialPriceDrafts(c *gin.Context) {
	result, err := pricingadmin.ImportLegacyOfficialPriceDrafts(c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func AdminCreateOfficialFlatPriceDraft(c *gin.Context) {
	var input pricingadmin.OfficialFlatDraftInput
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	version, err := pricingadmin.CreateOfficialFlatDraft(input, c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, version)
}

func AdminUpdateOfficialFlatPriceDraft(c *gin.Context) {
	id, ok := positivePathId(c)
	if !ok {
		return
	}
	var input pricingadmin.OfficialFlatDraftInput
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	version, err := pricingadmin.UpdateOfficialFlatDraft(id, input)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, version)
}

func AdminListPurchasePriceVersions(c *gin.Context) {
	channelModelId, ok := positiveQueryId(c, "channel_model_id")
	if !ok {
		return
	}
	var versions []model.ChannelModelPurchasePriceVersion
	if err := model.DB.Where("channel_model_id = ?", channelModelId).
		Order("version DESC").
		Find(&versions).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, versions)
}

func AdminCreatePurchasePriceVersion(c *gin.Context) {
	var input model.ChannelModelPurchasePriceVersion
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := pricingadmin.CreatePurchasePriceVersion(&input, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &input)
}

func AdminPublishPurchasePriceVersion(c *gin.Context) {
	id, ok := positivePathId(c)
	if !ok {
		return
	}
	if err := pricingadmin.PublishPurchasePriceVersion(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminSuspendPurchasePriceVersion(c *gin.Context) {
	id, ok := positivePathId(c)
	if !ok {
		return
	}
	if err := pricingadmin.SuspendPurchasePriceVersion(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminDeletePurchasePriceDraft(c *gin.Context) {
	id, ok := positivePathId(c)
	if !ok {
		return
	}
	if err := pricingadmin.DeletePurchasePriceDraft(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminCreateStructuredPurchasePriceDraft(c *gin.Context) {
	var input pricingadmin.PurchaseDraftInput
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	version, err := pricingadmin.CreatePurchaseDraft(input, c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, version)
}

func AdminUpdateStructuredPurchasePriceDraft(c *gin.Context) {
	id, ok := positivePathId(c)
	if !ok {
		return
	}
	var input pricingadmin.PurchaseDraftInput
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	version, err := pricingadmin.UpdatePurchaseDraft(id, input)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, version)
}

func AdminListRetailPriceVersions(c *gin.Context) {
	channelModelId, ok := positiveQueryId(c, "channel_model_id")
	if !ok {
		return
	}
	var versions []model.ChannelModelRetailPriceVersion
	if err := model.DB.Where("channel_model_id = ?", channelModelId).
		Order("version DESC").
		Find(&versions).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, versions)
}

func AdminCreateRetailPriceVersion(c *gin.Context) {
	var input model.ChannelModelRetailPriceVersion
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := pricingadmin.CreateRetailPriceVersion(&input, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &input)
}

func AdminPublishRetailPriceVersion(c *gin.Context) {
	id, ok := positivePathId(c)
	if !ok {
		return
	}
	if err := pricingadmin.PublishRetailPriceVersion(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminSuspendRetailPriceVersion(c *gin.Context) {
	id, ok := positivePathId(c)
	if !ok {
		return
	}
	if err := pricingadmin.SuspendRetailPriceVersion(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminDeleteRetailPriceDraft(c *gin.Context) {
	id, ok := positivePathId(c)
	if !ok {
		return
	}
	if err := pricingadmin.DeleteRetailPriceDraft(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminCreateStructuredRetailPriceDraft(c *gin.Context) {
	var input pricingadmin.RetailDraftInput
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	version, err := pricingadmin.CreateRetailDraft(input, c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, version)
}

func AdminUpdateStructuredRetailPriceDraft(c *gin.Context) {
	id, ok := positivePathId(c)
	if !ok {
		return
	}
	var input pricingadmin.RetailDraftInput
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	version, err := pricingadmin.UpdateRetailDraft(id, input)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, version)
}

func AdminSimulatePrice(c *gin.Context) {
	var input pricingadmin.PriceSimulationInput
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	result, err := pricingadmin.SimulatePrice(input)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func AdminGetActivePriceBundle(c *gin.Context) {
	channelModelId, ok := positiveQueryId(c, "channel_model_id")
	if !ok {
		return
	}
	bundle, err := pricingadmin.GetActivePriceBundle(channelModelId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, bundle)
}

func positivePathId(c *gin.Context) (int, bool) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "价格版本 ID 无效")
		return 0, false
	}
	return id, true
}

func positiveQueryId(c *gin.Context, name string) (int, bool) {
	id, err := strconv.Atoi(c.Query(name))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, name+" 无效")
		return 0, false
	}
	return id, true
}

func requireChannelModelReferences(channelId int, modelId int) error {
	var channelCount int64
	if err := model.DB.Model(&model.Channel{}).Where("id = ?", channelId).Count(&channelCount).Error; err != nil {
		return err
	}
	if channelCount == 0 {
		return errors.New("渠道不存在")
	}
	var modelCount int64
	if err := model.DB.Model(&model.Model{}).Where("id = ?", modelId).Count(&modelCount).Error; err != nil {
		return err
	}
	if modelCount == 0 {
		return errors.New("模型不存在")
	}
	return nil
}

func configuredPricingCatalogModels(channelId int) ([]pricingAdminCatalogOption, error) {
	var channel model.Channel
	if err := model.DB.Select("id", "models", "model_mapping").
		First(&channel, channelId).Error; err != nil {
		return nil, err
	}

	configuredNames := make([]string, 0)
	seen := make(map[string]struct{})
	for _, name := range strings.Split(channel.Models, ",") {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		if _, exists := seen[name]; exists {
			continue
		}
		seen[name] = struct{}{}
		configuredNames = append(configuredNames, name)
	}
	if len(configuredNames) == 0 {
		return []pricingAdminCatalogOption{}, nil
	}

	var configuredModels []model.Model
	if err := model.DB.Select("id", "model_name").
		Where("model_name IN ?", configuredNames).
		Order("model_name ASC").
		Find(&configuredModels).Error; err != nil {
		return nil, err
	}

	modelMapping := make(map[string]string)
	if channel.ModelMapping != nil && strings.TrimSpace(*channel.ModelMapping) != "" {
		if err := common.UnmarshalJsonStr(*channel.ModelMapping, &modelMapping); err != nil {
			return nil, fmt.Errorf("解析渠道模型映射失败: %w", err)
		}
	}

	options := make([]pricingAdminCatalogOption, 0, len(configuredModels))
	for _, configuredModel := range configuredModels {
		upstreamModelName := strings.TrimSpace(modelMapping[configuredModel.ModelName])
		if upstreamModelName == "" {
			upstreamModelName = configuredModel.ModelName
		}
		options = append(options, pricingAdminCatalogOption{
			Id:                configuredModel.Id,
			Name:              configuredModel.ModelName,
			UpstreamModelName: upstreamModelName,
		})
	}
	return options, nil
}

func requireModelConfiguredOnChannel(channelId int, modelId int) error {
	options, err := configuredPricingCatalogModels(channelId)
	if err != nil {
		return err
	}
	for _, option := range options {
		if option.Id == modelId {
			return nil
		}
	}
	return errors.New("该模型未在渠道编辑中配置")
}
