package controller

import (
	"errors"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/pricingadmin"
	"github.com/gin-gonic/gin"
)

type channelModelAdminRow struct {
	model.ChannelModel
	ChannelName string `json:"channel_name"`
	ModelName   string `json:"model_name"`
}

func AdminListChannelModels(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	keyword := strings.TrimSpace(c.Query("keyword"))
	query := model.DB.Table("channel_models").
		Select("channel_models.*, channels.name AS channel_name, models.model_name AS model_name").
		Joins("JOIN channels ON channels.id = channel_models.channel_id").
		Joins("JOIN models ON models.id = channel_models.model_id")
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
	if input.RuntimeMode != "" && input.RuntimeMode != "legacy" {
		common.ApiErrorMsg(c, "V2 运行时尚未启用，新渠道模型必须使用 legacy 模式")
		return
	}
	if err := requireChannelModelReferences(input.ChannelId, input.ModelId); err != nil {
		common.ApiError(c, err)
		return
	}
	input.Id = 0
	input.RuntimeMode = "legacy"
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
	if input.RuntimeMode != "" && input.RuntimeMode != "legacy" {
		common.ApiErrorMsg(c, "V2 运行时尚未启用，当前只能保存 legacy 模式")
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
	updates := map[string]any{
		"channel_id":          input.ChannelId,
		"model_id":            input.ModelId,
		"upstream_model_name": strings.TrimSpace(input.UpstreamModelName),
		"status":              input.Status,
		"priority":            input.Priority,
		"weight":              input.Weight,
		"region":              input.Region,
		"data_policy":         input.DataPolicy,
		"capability_config":   input.CapabilityConfig,
		"routing_tags":        input.RoutingTags,
		"runtime_mode":        "legacy",
		"updated_at":          common.GetTimestamp(),
	}
	if err := model.DB.Model(&current).Updates(updates).Error; err != nil {
		common.ApiError(c, err)
		return
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

func AdminImportLegacyOfficialPriceDrafts(c *gin.Context) {
	result, err := pricingadmin.ImportLegacyOfficialPriceDrafts(c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
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
