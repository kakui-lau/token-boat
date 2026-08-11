package controller

import (
	"database/sql"
	"encoding/csv"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/pricingadmin"
	"github.com/QuantumNous/new-api/service/pricingruntime"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type channelModelAdminRow struct {
	model.ChannelModel
	ChannelName                string `json:"channel_name"`
	ModelName                  string `json:"model_name"`
	RoutingEnabled             bool   `json:"routing_enabled"`
	ActiveRetailPriceVersionId int    `json:"active_retail_price_version_id"`
	ActiveRetailPriceVersion   int64  `json:"active_retail_price_version"`
}

type channelPricingExportRow struct {
	ModelName                  string
	ChannelName                string
	UpstreamModelName          string
	OfficialPriceComponents    string
	OfficialBillingExpr        string
	OfficialCurrency           string
	OfficialPriceVersionId     sql.NullInt64
	OfficialPriceVersion       sql.NullInt64
	PurchasePriceVersionId     sql.NullInt64
	PurchasePriceVersion       sql.NullInt64
	PurchasePricingMode        string
	PurchaseDiscount           string
	PurchaseQuoteSpec          string
	RetailPriceVersionId       sql.NullInt64
	RetailPriceVersion         sql.NullInt64
	RetailPriceComponents      string
	RetailBillingExpr          string
	RetailCurrency             string
	TotalVariableCostRate      sql.NullString
	EffectiveTaxRate           sql.NullString
	TargetNetMargin            sql.NullString
	ActiveRetailPriceVersionId int
}

type pricingCSVPricePoint struct {
	Key   string
	Label string
	Price decimal.Decimal
}

var pricingCSVFlatComponents = []struct {
	Key   string
	Label string
}{
	{Key: "input_unit_price", Label: "输入 / 1M Token"},
	{Key: "output_unit_price", Label: "输出 / 1M Token"},
	{Key: "cache_read_unit_price", Label: "缓存读取 / 1M Token"},
	{Key: "cache_write_unit_price", Label: "缓存写入 / 1M Token"},
	{Key: "image_input_unit_price", Label: "图片输入 / 1M Token"},
	{Key: "image_output_unit_price", Label: "图片输出 / 1M Token"},
	{Key: "audio_input_unit_price", Label: "音频输入 / 1M Token"},
	{Key: "audio_output_unit_price", Label: "音频输出 / 1M Token"},
	{Key: "request_unit_price", Label: "每次请求"},
	{Key: "video_second_unit_price", Label: "每视频秒"},
}

var pricingCSVComponentLabels = map[string]string{
	"token_input":        "输入 Token",
	"token_output":       "输出 Token",
	"cache_read":         "缓存读取",
	"cache_write":        "缓存写入",
	"cache_write_1h":     "1 小时缓存写入",
	"image_input":        "图片输入",
	"image_output":       "图片输出",
	"image_token_input":  "图片输入 Token",
	"image_token_output": "图片输出 Token",
	"audio_input":        "音频输入",
	"audio_output":       "音频输出",
	"audio_token_input":  "音频输入 Token",
	"audio_token_output": "音频输出 Token",
	"video_input":        "视频输入",
	"video_output":       "视频输出",
	"character_input":    "字符输入",
	"character_output":   "字符输出",
	"request":            "请求",
	"tool_call":          "工具调用",
	"generated_item":     "生成项",
}

var pricingCSVUnitLabels = map[string]string{
	"token": "Token", "request": "请求", "image": "图片",
	"second": "秒", "character": "字符",
}

var pricingCSVDiscountComponents = []struct {
	Key   string
	Label string
}{
	{Key: "input_discount", Label: "输入"},
	{Key: "output_discount", Label: "输出"},
	{Key: "cache_read_discount", Label: "缓存读取"},
	{Key: "cache_write_discount", Label: "缓存写入"},
	{Key: "image_input_discount", Label: "图片输入"},
	{Key: "image_output_discount", Label: "图片输出"},
	{Key: "audio_input_discount", Label: "音频输入"},
	{Key: "audio_output_discount", Label: "音频输出"},
}

type pricingAdminCatalogOption struct {
	Id                int    `json:"id"`
	Name              string `json:"name"`
	UpstreamModelName string `json:"upstream_model_name,omitempty"`
}

type pricingModelRuntimeInput struct {
	ModelName   string `json:"model_name"`
	RuntimeMode string `json:"runtime_mode"`
}

type requestPricingSnapshotAdminRow struct {
	model.RequestPricingSnapshot
	ModelName   string `json:"model_name"`
	ChannelId   int    `json:"channel_id"`
	ChannelName string `json:"channel_name"`
}

type pricingCircuitChannelAdminRow struct {
	pricingruntime.ChannelCircuitStatus
	ChannelName string `json:"channel_name"`
}

type pricingCircuitEventAdminRow struct {
	pricingruntime.ChannelCircuitEvent
	ChannelName string `json:"channel_name"`
}

type persistentPricingCircuitEventAdminRow struct {
	model.PricingCircuitEvent
	ChannelName string `json:"channel_name"`
}

type providerReportedCostInput struct {
	Cost  string `json:"cost"`
	Scope string `json:"scope"`
}

const pricingReconciliationReservedAgeSeconds = 15 * 60

func AdminGetPricingRuntimeStatus(c *gin.Context) {
	readiness, err := pricingruntime.GetRuntimeReadiness()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, readiness)
}

func AdminGetPricingCircuitOverview(c *gin.Context) {
	overview := pricingruntime.GetChannelCircuitOverview()
	channelIds := make([]int, 0, len(overview.Channels)+len(overview.Events))
	seenChannelIds := make(map[int]struct{}, len(overview.Channels)+len(overview.Events))
	for _, channel := range overview.Channels {
		if _, exists := seenChannelIds[channel.ChannelId]; !exists {
			seenChannelIds[channel.ChannelId] = struct{}{}
			channelIds = append(channelIds, channel.ChannelId)
		}
	}
	for _, event := range overview.Events {
		if _, exists := seenChannelIds[event.ChannelId]; !exists {
			seenChannelIds[event.ChannelId] = struct{}{}
			channelIds = append(channelIds, event.ChannelId)
		}
	}
	type channelNameRow struct {
		Id   int
		Name string
	}
	var channelNames []channelNameRow
	if len(channelIds) > 0 {
		if err := model.DB.Model(&model.Channel{}).
			Select("id, name").
			Where("id IN ?", channelIds).
			Scan(&channelNames).Error; err != nil {
			common.ApiError(c, err)
			return
		}
	}
	nameByChannelId := make(map[int]string, len(channelNames))
	for _, channel := range channelNames {
		nameByChannelId[channel.Id] = channel.Name
	}
	channels := make([]pricingCircuitChannelAdminRow, 0, len(overview.Channels))
	for _, channel := range overview.Channels {
		channels = append(channels, pricingCircuitChannelAdminRow{
			ChannelCircuitStatus: channel,
			ChannelName:          nameByChannelId[channel.ChannelId],
		})
	}
	events := make([]pricingCircuitEventAdminRow, 0, len(overview.Events))
	for _, event := range overview.Events {
		events = append(events, pricingCircuitEventAdminRow{
			ChannelCircuitEvent: event,
			ChannelName:         nameByChannelId[event.ChannelId],
		})
	}
	common.ApiSuccess(c, gin.H{
		"channels": channels, "events": events,
		"distributed": overview.Distributed,
	})
}

func AdminResetPricingCircuit(c *gin.Context) {
	channelId, err := strconv.Atoi(c.Param("channel_id"))
	if err != nil || channelId <= 0 {
		common.ApiErrorMsg(c, "channel_id 无效")
		return
	}
	reset := pricingruntime.ResetChannelCircuit(channelId)
	recordManageAudit(c, "pricing.channel_circuit.reset", map[string]interface{}{
		"channel_id": channelId,
		"reset":      reset,
	})
	common.ApiSuccess(c, gin.H{"channel_id": channelId, "reset": reset})
}

func AdminListPricingCircuitEvents(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	query := model.DB.Table("pricing_circuit_events").
		Select(
			"pricing_circuit_events.*, COALESCE(channels.name, '') AS channel_name",
		).
		Joins("LEFT JOIN channels ON channels.id = pricing_circuit_events.channel_id")
	if rawChannelId := strings.TrimSpace(c.Query("channel_id")); rawChannelId != "" {
		channelId, err := strconv.Atoi(rawChannelId)
		if err != nil || channelId <= 0 {
			common.ApiErrorMsg(c, "channel_id 无效")
			return
		}
		query = query.Where("pricing_circuit_events.channel_id = ?", channelId)
	}
	if event := strings.TrimSpace(c.Query("event")); event != "" {
		switch event {
		case "failure", "opened", "rate_limited", "half_open_probe", "recovered", "manual_reset":
			query = query.Where("pricing_circuit_events.event = ?", event)
		default:
			common.ApiErrorMsg(c, "event 无效")
			return
		}
	}
	createdFrom, createdTo, err := pricingSummaryTimeRange(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if createdFrom > 0 {
		query = query.Where("pricing_circuit_events.occurred_at >= ?", createdFrom)
	}
	if createdTo > 0 {
		query = query.Where("pricing_circuit_events.occurred_at <= ?", createdTo)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	var rows []persistentPricingCircuitEventAdminRow
	if err := query.Order("pricing_circuit_events.id DESC").
		Offset(pageInfo.GetStartIdx()).
		Limit(pageInfo.GetPageSize()).
		Scan(&rows).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"items": rows, "total": total,
		"page": pageInfo.GetPage(), "page_size": pageInfo.GetPageSize(),
	})
}

func AdminSetPricingModelRuntime(c *gin.Context) {
	var input pricingModelRuntimeInput
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	input.ModelName = strings.TrimSpace(input.ModelName)
	if input.ModelName == "" {
		common.ApiErrorMsg(c, "模型名称不能为空")
		return
	}
	if input.RuntimeMode != pricingruntime.RuntimeModeV2 {
		common.ApiErrorMsg(c, "运行时只允许启用 V2，不允许回退旧版")
		return
	}
	updated, err := pricingruntime.SetModelRuntimeMode(input.ModelName, input.RuntimeMode)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "pricing.model_runtime.update", map[string]interface{}{
		"model_name": input.ModelName, "runtime_mode": input.RuntimeMode,
		"channel_model_count": updated,
	})
	common.ApiSuccess(c, gin.H{
		"model_name": input.ModelName, "runtime_mode": input.RuntimeMode,
		"updated": updated,
	})
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
	query, err := channelModelAdminQuery(c)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	query = query.Select(
		"channel_models.*, channels.name AS channel_name, models.model_name AS model_name, "+
			"CASE WHEN EXISTS (SELECT 1 FROM abilities WHERE abilities.channel_id = channel_models.channel_id AND abilities.model = models.model_name AND abilities.enabled = ?) THEN 1 ELSE 0 END AS routing_enabled, "+
			"COALESCE(active_retail.active_retail_price_version_id, 0) AS active_retail_price_version_id, "+
			"COALESCE(active_retail.active_retail_price_version, 0) AS active_retail_price_version",
		true,
	)

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

func AdminExportChannelPricing(c *gin.Context) {
	query, err := channelModelAdminQuery(c)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	activePurchasePrices := model.DB.Table("channel_model_purchase_price_versions").
		Select("channel_model_id, MAX(id) AS active_purchase_price_version_id").
		Where("status = ?", model.PricingVersionStatusActive).
		Group("channel_model_id")
	query = query.
		Select(`models.model_name, channels.name AS channel_name,
			channel_models.upstream_model_name,
			COALESCE(linked_official.price_components, current_official.price_components, '') AS official_price_components,
			COALESCE(linked_official.billing_expr, current_official.billing_expr, '') AS official_billing_expr,
			COALESCE(linked_official.currency, current_official.currency, '') AS official_currency,
			purchase.official_price_version_id AS official_price_version_id,
			linked_official.version AS official_price_version,
			purchase.id AS purchase_price_version_id,
			purchase.version AS purchase_price_version,
			COALESCE(purchase.pricing_mode, '') AS purchase_pricing_mode,
			COALESCE(purchase.purchase_discount, '') AS purchase_discount,
			COALESCE(purchase.quote_spec, '') AS purchase_quote_spec,
			retail.id AS retail_price_version_id,
			retail.version AS retail_price_version,
			COALESCE(retail.price_components, '') AS retail_price_components,
			COALESCE(retail.retail_billing_expr, '') AS retail_billing_expr,
			COALESCE(retail.currency, '') AS retail_currency,
			retail.total_variable_cost_rate,
			retail.effective_tax_rate,
			retail.target_net_margin,
			COALESCE(active_retail.active_retail_price_version_id, 0) AS active_retail_price_version_id`).
		Joins("LEFT JOIN channel_model_retail_price_versions AS retail ON retail.id = active_retail.active_retail_price_version_id").
		Joins(
			"LEFT JOIN (?) AS active_purchase ON active_purchase.channel_model_id = channel_models.id",
			activePurchasePrices,
		).
		Joins("LEFT JOIN channel_model_purchase_price_versions AS purchase ON purchase.id = COALESCE(retail.purchase_price_version_id, active_purchase.active_purchase_price_version_id)").
		Joins("LEFT JOIN official_model_price_versions AS linked_official ON linked_official.id = purchase.official_price_version_id").
		Joins("LEFT JOIN model_official_prices ON model_official_prices.model_id = channel_models.model_id").
		Joins("LEFT JOIN official_model_price_versions AS current_official ON current_official.id = model_official_prices.current_revision_id")

	const exportLimit = 10000
	var rows []channelPricingExportRow
	if err := query.Order("models.model_name ASC, channels.name ASC, channel_models.id ASC").
		Limit(exportLimit).
		Scan(&rows).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	filename := "channel-pricing-" + time.Now().UTC().Format("20060102-150405") + ".csv"
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	c.Status(200)
	_, _ = c.Writer.Write([]byte{0xEF, 0xBB, 0xBF})
	writer := csv.NewWriter(c.Writer)
	_ = writer.Write([]string{
		"模型名称", "上游渠道", "上游模型", "官方价格", "官方价版本",
		"采购价版本", "采购定价方式", "采购折扣", "销售价格", "销售价版本",
		"销售价折扣（相对官方价）", "币种",
		"变动成本率（VCR）", "利得税率（TR）", "目标净利润率（TM）",
	})
	for _, row := range rows {
		currency := row.RetailCurrency
		if currency == "" {
			currency = row.OfficialCurrency
		}
		retailSummary := ""
		if row.ActiveRetailPriceVersionId > 0 {
			retailSummary = formatPricingComponentsForCSV(
				row.RetailPriceComponents,
				row.RetailBillingExpr,
				row.RetailCurrency,
			)
		}
		_ = writer.Write([]string{
			spreadsheetSafeCSVCell(row.ModelName),
			spreadsheetSafeCSVCell(row.ChannelName),
			spreadsheetSafeCSVCell(row.UpstreamModelName),
			formatPricingComponentsForCSV(
				row.OfficialPriceComponents,
				row.OfficialBillingExpr,
				row.OfficialCurrency,
			),
			formatPriceVersionForCSV(
				row.OfficialPriceVersionId,
				row.OfficialPriceVersion,
			),
			formatPriceVersionForCSV(
				row.PurchasePriceVersionId,
				row.PurchasePriceVersion,
			),
			formatPurchasePricingModeForCSV(row.PurchasePricingMode),
			formatPurchaseDiscountForCSV(
				row.PurchasePricingMode,
				row.PurchaseDiscount,
				row.PurchaseQuoteSpec,
			),
			retailSummary,
			formatPriceVersionForCSV(
				row.RetailPriceVersionId,
				row.RetailPriceVersion,
			),
			formatRetailOfficialDiscountForCSV(
				row.PurchasePricingMode,
				row.OfficialPriceComponents,
				row.RetailPriceComponents,
			),
			currency,
			formatPricingRatePercentage(row.TotalVariableCostRate.String),
			formatPricingRatePercentage(row.EffectiveTaxRate.String),
			formatPricingRatePercentage(row.TargetNetMargin.String),
		})
	}
	writer.Flush()
}

func channelModelAdminQuery(c *gin.Context) (*gorm.DB, error) {
	activeRetailPrices := model.DB.Table("channel_model_retail_price_versions").
		Select(
			"channel_model_id, MAX(id) AS active_retail_price_version_id, "+
				"MAX(version) AS active_retail_price_version",
		).
		Where("status = ?", model.PricingVersionStatusActive).
		Group("channel_model_id")
	query := model.DB.Table("channel_models").
		Joins("JOIN channels ON channels.id = channel_models.channel_id").
		Joins("JOIN models ON models.id = channel_models.model_id").
		Joins(
			"LEFT JOIN (?) AS active_retail ON active_retail.channel_model_id = channel_models.id",
			activeRetailPrices,
		)
	keyword := strings.TrimSpace(c.Query("keyword"))
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
			return nil, errors.New("status 无效")
		}
		query = query.Where("channel_models.status = ?", statusValue)
	}
	if runtimeMode := strings.TrimSpace(c.Query("runtime_mode")); runtimeMode != "" {
		if runtimeMode != "legacy" && runtimeMode != "v2" {
			return nil, errors.New("runtime_mode 无效")
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
			return nil, errors.New("retail_status 无效")
		}
	}
	return query, nil
}

func AdminListRequestPricingSnapshots(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	query, err := requestPricingSnapshotAdminQuery(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	var rows []requestPricingSnapshotAdminRow
	if err := query.Order("request_pricing_snapshots.id DESC").
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

func AdminExportRequestPricingSnapshots(c *gin.Context) {
	query, err := requestPricingSnapshotAdminQuery(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	const exportLimit = 10000
	var rows []requestPricingSnapshotAdminRow
	if err := query.Order("request_pricing_snapshots.id DESC").
		Limit(exportLimit).
		Scan(&rows).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	filename := "pricing-reconciliation-" + time.Now().UTC().Format("20060102-150405") + ".csv"
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	c.Status(200)
	writer := csv.NewWriter(c.Writer)
	_ = writer.Write([]string{
		"request_id", "model", "channel", "billing_mode", "currency",
		"reserved_quota", "settled_quota", "purchase_cost",
		"provider_cost_mode", "provider_cost_status", "provider_cost_source",
		"provider_reported_cost", "provider_cost_scope", "cost_variance",
		"gross_margin", "gross_margin_known", "base_retail_amount",
		"estimated_customer_charge", "customer_charge", "applied_group", "applied_group_ratio", "net_margin_rate",
		"margin_compliant",
		"status", "created_at", "updated_at",
	})
	for _, row := range rows {
		_ = writer.Write([]string{
			spreadsheetSafeCSVCell(row.RequestId),
			spreadsheetSafeCSVCell(row.ModelName),
			spreadsheetSafeCSVCell(row.ChannelName),
			row.BillingMode,
			row.Currency,
			strconv.FormatInt(row.ReservedQuota, 10),
			strconv.FormatInt(row.SettledQuota, 10),
			row.PurchaseCost,
			row.ProviderCostMode,
			row.ProviderCostStatus,
			row.ProviderCostSource,
			row.ProviderReportedCost,
			row.ProviderCostScope,
			row.CostVariance,
			row.GrossMargin,
			strconv.FormatBool(row.GrossMarginKnown),
			row.BaseRetailAmount,
			row.EstimatedCustomerCharge,
			nullablePricingString(row.CustomerCharge),
			spreadsheetSafeCSVCell(row.AppliedGroup),
			row.AppliedGroupRatio,
			row.NetMarginRate,
			strconv.FormatBool(row.MarginCompliant),
			row.Status,
			time.Unix(row.CreatedAt, 0).UTC().Format(time.RFC3339),
			time.Unix(row.UpdatedAt, 0).UTC().Format(time.RFC3339),
		})
	}
	writer.Flush()
}

func nullablePricingString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func AdminConfirmRequestPricingSnapshotRefunded(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "id 无效")
		return
	}
	var snapshot model.RequestPricingSnapshot
	if err := model.DB.First(&snapshot, id).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	if snapshot.Status != pricingruntime.PricingSnapshotStatusPending {
		common.ApiErrorMsg(c, "只有待确认价格快照可以确认已退款")
		return
	}
	result := model.DB.Model(&model.RequestPricingSnapshot{}).
		Where("id = ? AND status = ?", id, pricingruntime.PricingSnapshotStatusPending).
		Updates(map[string]any{
			"settled_quota":    0,
			"customer_charge":  "0",
			"net_margin_rate":  nil,
			"margin_compliant": false,
			"gross_margin": gorm.Expr(
				"CASE WHEN billing_source = ? AND provider_cost_known = ? AND provider_cost_scope = ? THEN -provider_reported_cost ELSE 0 END",
				"wallet",
				true,
				"full_provider_cost",
			),
			"gross_margin_known": gorm.Expr(
				"CASE WHEN billing_source = ? AND provider_cost_known = ? AND provider_cost_scope = ? THEN ? ELSE ? END",
				"wallet",
				true,
				"full_provider_cost",
				true,
				false,
			),
			"status":      pricingruntime.PricingSnapshotStatusRefunded,
			"resolution":  "admin_confirmed_refund",
			"resolved_at": common.GetTimestamp(),
			"resolved_by": c.GetInt("id"),
			"updated_at":  common.GetTimestamp(),
		})
	if result.Error != nil {
		common.ApiError(c, result.Error)
		return
	}
	if result.RowsAffected != 1 {
		common.ApiErrorMsg(c, "价格快照状态已变化，请刷新后重试")
		return
	}
	recordManageAudit(c, "pricing.reconciliation.confirm_refunded", map[string]interface{}{
		"snapshot_id": id,
		"request_id":  snapshot.RequestId,
		"user_id":     snapshot.UserId,
	})
	common.ApiSuccess(c, gin.H{"id": id, "status": pricingruntime.PricingSnapshotStatusRefunded})
}

func AdminRecordProviderReportedCost(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "id 无效")
		return
	}
	var input providerReportedCostInput
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	cost, err := decimal.NewFromString(strings.TrimSpace(input.Cost))
	if err != nil || cost.IsNegative() {
		common.ApiErrorMsg(c, "供应商成本必须是非负 USD 金额")
		return
	}
	var snapshot model.RequestPricingSnapshot
	if err := model.DB.First(&snapshot, id).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	if err := pricingruntime.RecordProviderReportedCostWithSource(
		snapshot.RequestId,
		cost,
		strings.TrimSpace(input.Scope),
		model.ProviderCostSourceManual,
	); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "pricing.reconciliation.provider_cost", map[string]interface{}{
		"snapshot_id": id,
		"request_id":  snapshot.RequestId,
		"cost":        cost.String(),
		"scope":       input.Scope,
	})
	common.ApiSuccess(c, gin.H{
		"id": id, "provider_reported_cost": cost.String(), "scope": input.Scope,
	})
}

func AdminGetPricingFinancialSummary(c *gin.Context) {
	baseQuery := model.DB.Model(&model.RequestPricingSnapshot{})
	createdFrom, createdTo, err := pricingSummaryTimeRange(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if createdFrom > 0 {
		baseQuery = baseQuery.Where("created_at >= ?", createdFrom)
	}
	if createdTo > 0 {
		baseQuery = baseQuery.Where("created_at <= ?", createdTo)
	}
	finalizedStatuses := []string{
		pricingruntime.PricingSnapshotStatusSettled,
		pricingruntime.PricingSnapshotStatusRefunded,
	}
	finalizedQuery := baseQuery.Session(&gorm.Session{}).
		Where("status IN ?", finalizedStatuses)
	settledQuery := baseQuery.Session(&gorm.Session{}).
		Where("status = ?", pricingruntime.PricingSnapshotStatusSettled)
	var settledCount int64
	if err := settledQuery.Session(&gorm.Session{}).Count(&settledCount).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	var refundedCount int64
	if err := baseQuery.Session(&gorm.Session{}).
		Where("status = ?", pricingruntime.PricingSnapshotStatusRefunded).
		Count(&refundedCount).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	type financialTotals struct {
		Count               int64  `gorm:"column:record_count"`
		CustomerChargeCount int64  `gorm:"column:customer_charge_count"`
		Revenue             string `gorm:"column:revenue"`
		EstimatedCost       string `gorm:"column:estimated_cost"`
	}
	var totals financialTotals
	if err := finalizedQuery.Session(&gorm.Session{}).
		Select(
			"COUNT(*) AS record_count, " +
				"COUNT(customer_charge) AS customer_charge_count, " +
				"COALESCE(SUM(customer_charge), 0) AS revenue, " +
				"COALESCE(SUM(purchase_cost), 0) AS estimated_cost",
		).
		Scan(&totals).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	type estimatedCostTotal struct {
		EstimatedCost string `gorm:"column:estimated_cost"`
	}
	var settledEstimatedCost estimatedCostTotal
	if err := settledQuery.Session(&gorm.Session{}).
		Select("COALESCE(SUM(purchase_cost), 0) AS estimated_cost").
		Scan(&settledEstimatedCost).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	var refundedEstimatedCost estimatedCostTotal
	if err := baseQuery.Session(&gorm.Session{}).
		Where("status = ?", pricingruntime.PricingSnapshotStatusRefunded).
		Select("COALESCE(SUM(purchase_cost), 0) AS estimated_cost").
		Scan(&refundedEstimatedCost).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	type providerCostTotals struct {
		Count        int64  `gorm:"column:record_count"`
		ProviderCost string `gorm:"column:provider_cost"`
		CostVariance string `gorm:"column:cost_variance"`
	}
	var providerTotals providerCostTotals
	if err := finalizedQuery.Session(&gorm.Session{}).
		Where("provider_cost_known = ?", true).
		Select(
			"COUNT(*) AS record_count, " +
				"COALESCE(SUM(provider_reported_cost), 0) AS provider_cost, " +
				"COALESCE(SUM(cost_variance), 0) AS cost_variance",
		).
		Scan(&providerTotals).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	type providerCostStatusTotal struct {
		Status string `gorm:"column:provider_cost_status"`
		Count  int64  `gorm:"column:record_count"`
	}
	var providerCostStatusTotals []providerCostStatusTotal
	if err := finalizedQuery.Session(&gorm.Session{}).
		Select("provider_cost_status, COUNT(*) AS record_count").
		Group("provider_cost_status").
		Scan(&providerCostStatusTotals).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	providerCostStatusCounts := make(map[string]int64, len(providerCostStatusTotals))
	for _, total := range providerCostStatusTotals {
		providerCostStatusCounts[total.Status] = total.Count
	}
	providerCostConfirmedCount := providerCostStatusCounts[model.ProviderCostStatusConfirmed] +
		providerCostStatusCounts[model.ProviderCostStatusReconciled]
	type grossMarginTotals struct {
		Count       int64  `gorm:"column:record_count"`
		GrossMargin string `gorm:"column:gross_margin"`
	}
	var marginTotals grossMarginTotals
	if err := finalizedQuery.Session(&gorm.Session{}).
		Where("gross_margin_known = ?", true).
		Select(
			"COUNT(*) AS record_count, " +
				"COALESCE(SUM(gross_margin), 0) AS gross_margin",
		).
		Scan(&marginTotals).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	var fullProviderCostCount int64
	if err := finalizedQuery.Session(&gorm.Session{}).
		Where("provider_cost_known = ? AND provider_cost_scope = ?", true, "full_provider_cost").
		Count(&fullProviderCostCount).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	var marginBreachCount int64
	if err := settledQuery.Session(&gorm.Session{}).
		Where("net_margin_rate IS NOT NULL AND margin_compliant = ? AND customer_charge > ?", false, 0).
		Count(&marginBreachCount).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"settled_count":          settledCount,
		"refunded_count":         refundedCount,
		"finalized_count":        totals.Count,
		"billed_amount_usd":      normalizePricingAmount(totals.Revenue),
		"revenue_usd":            normalizePricingAmount(totals.Revenue),
		"estimated_purchase_usd": normalizePricingAmount(settledEstimatedCost.EstimatedCost),
		"refunded_estimated_purchase_usd": normalizePricingAmount(
			refundedEstimatedCost.EstimatedCost,
		),
		"provider_reported_cost_usd":     normalizePricingAmount(providerTotals.ProviderCost),
		"cost_variance_usd":              normalizePricingAmount(providerTotals.CostVariance),
		"gross_margin_usd":               normalizePricingAmount(marginTotals.GrossMargin),
		"provider_cost_known_count":      providerTotals.Count,
		"provider_cost_estimated_count":  providerCostStatusCounts[model.ProviderCostStatusEstimated],
		"provider_cost_pending_count":    providerCostStatusCounts[model.ProviderCostStatusPending],
		"provider_cost_confirmed_count":  providerCostConfirmedCount,
		"provider_cost_reconciled_count": providerCostStatusCounts[model.ProviderCostStatusReconciled],
		"provider_cost_failed_count":     providerCostStatusCounts[model.ProviderCostStatusFailed],
		// Kept for older clients; "missing" now means an expected actual cost is pending.
		"provider_cost_missing_count": providerCostStatusCounts[model.ProviderCostStatusPending],
		"customer_charge_known_count": totals.CustomerChargeCount,
		"customer_charge_missing_count": totals.Count -
			totals.CustomerChargeCount,
		"full_provider_cost_count": fullProviderCostCount,
		"gross_margin_known_count": marginTotals.Count,
		"gross_margin_missing_count": fullProviderCostCount -
			marginTotals.Count,
		"margin_breach_count": marginBreachCount,
	})
}

func normalizePricingAmount(value string) string {
	amount, err := decimal.NewFromString(strings.TrimSpace(value))
	if err != nil {
		return value
	}
	return amount.Round(12).String()
}

func pricingSummaryTimeRange(c *gin.Context) (int64, int64, error) {
	var createdFrom int64
	var createdTo int64
	for queryName, target := range map[string]*int64{
		"created_from": &createdFrom,
		"created_to":   &createdTo,
	} {
		raw := strings.TrimSpace(c.Query(queryName))
		if raw == "" {
			continue
		}
		value, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || value <= 0 {
			return 0, 0, fmt.Errorf("%s 无效", queryName)
		}
		*target = value
	}
	if createdFrom > 0 && createdTo > 0 && createdFrom > createdTo {
		return 0, 0, errors.New("created_from 不能晚于 created_to")
	}
	return createdFrom, createdTo, nil
}

func requestPricingSnapshotAdminQuery(c *gin.Context) (*gorm.DB, error) {
	query := model.DB.Table("request_pricing_snapshots").
		Select(
			"request_pricing_snapshots.*, COALESCE(models.model_name, '') AS model_name, " +
				"COALESCE(channel_models.channel_id, 0) AS channel_id, " +
				"COALESCE(channels.name, '') AS channel_name",
		).
		Joins("LEFT JOIN models ON models.id = request_pricing_snapshots.model_id").
		Joins("LEFT JOIN channel_models ON channel_models.id = request_pricing_snapshots.channel_model_id").
		Joins("LEFT JOIN channels ON channels.id = channel_models.channel_id")
	if rawReconciliation := strings.TrimSpace(c.Query("reconciliation")); rawReconciliation != "" {
		reconciliation, err := strconv.ParseBool(rawReconciliation)
		if err != nil {
			return nil, errors.New("reconciliation 无效")
		}
		if reconciliation {
			query = query.Where(
				"request_pricing_snapshots.status = ? OR "+
					"(request_pricing_snapshots.status = ? AND request_pricing_snapshots.created_at <= ?)",
				pricingruntime.PricingSnapshotStatusPending,
				pricingruntime.PricingSnapshotStatusReserved,
				common.GetTimestamp()-pricingReconciliationReservedAgeSeconds,
			)
		}
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		switch status {
		case pricingruntime.PricingSnapshotStatusReserved,
			pricingruntime.PricingSnapshotStatusPending,
			pricingruntime.PricingSnapshotStatusSettled,
			pricingruntime.PricingSnapshotStatusRefunded:
			query = query.Where("request_pricing_snapshots.status = ?", status)
		default:
			return nil, errors.New("status 无效")
		}
	}
	if billingMode := strings.TrimSpace(c.Query("billing_mode")); billingMode != "" {
		query = query.Where("request_pricing_snapshots.billing_mode = ?", billingMode)
	}
	var createdFrom int64
	var createdTo int64
	if rawCreatedFrom := strings.TrimSpace(c.Query("created_from")); rawCreatedFrom != "" {
		parsed, err := strconv.ParseInt(rawCreatedFrom, 10, 64)
		createdFrom = parsed
		if err != nil || createdFrom <= 0 {
			return nil, errors.New("created_from 无效")
		}
	}
	if rawCreatedTo := strings.TrimSpace(c.Query("created_to")); rawCreatedTo != "" {
		parsed, err := strconv.ParseInt(rawCreatedTo, 10, 64)
		createdTo = parsed
		if err != nil || createdTo <= 0 {
			return nil, errors.New("created_to 无效")
		}
	}
	if createdFrom > 0 && createdTo > 0 && createdFrom > createdTo {
		return nil, errors.New("created_from 不能晚于 created_to")
	}
	if createdFrom > 0 {
		query = query.Where("request_pricing_snapshots.created_at >= ?", createdFrom)
	}
	if createdTo > 0 {
		query = query.Where("request_pricing_snapshots.created_at <= ?", createdTo)
	}
	if keyword := strings.TrimSpace(c.Query("keyword")); keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where(
			"request_pricing_snapshots.request_id LIKE ? OR models.model_name LIKE ? OR channels.name LIKE ?",
			like,
			like,
			like,
		)
	}
	return query, nil
}

func spreadsheetSafeCSVCell(value string) string {
	if value == "" {
		return value
	}
	switch value[0] {
	case '=', '+', '-', '@', '\t', '\r':
		return "'" + value
	default:
		return value
	}
}

func formatPriceVersionForCSV(id sql.NullInt64, version sql.NullInt64) string {
	if !id.Valid || id.Int64 <= 0 {
		return ""
	}
	if !version.Valid || version.Int64 <= 0 {
		return fmt.Sprintf("#%d", id.Int64)
	}
	return fmt.Sprintf("v%d (#%d)", version.Int64, id.Int64)
}

func formatPurchasePricingModeForCSV(pricingMode string) string {
	switch strings.TrimSpace(pricingMode) {
	case "official_ratio":
		return "官方价统一折扣"
	case "component_ratio":
		return "官方价分项折扣"
	case "fixed_unit_price":
		return "固定采购价"
	case "hybrid":
		return "混合定价"
	case "custom_expr":
		return "自定义表达式"
	default:
		return spreadsheetSafeCSVCell(strings.TrimSpace(pricingMode))
	}
}

func formatPurchaseDiscountForCSV(pricingMode string, purchaseDiscount string, quoteSpec string) string {
	if strings.TrimSpace(pricingMode) == "official_ratio" {
		return formatPurchaseDiscountMultiplierForCSV(purchaseDiscount, true)
	}

	var discounts map[string]any
	if err := common.UnmarshalJsonStr(strings.TrimSpace(quoteSpec), &discounts); err != nil {
		return ""
	}
	parts := make([]string, 0, len(pricingCSVDiscountComponents))
	for _, component := range pricingCSVDiscountComponents {
		value := pricingComponentScalar(discounts[component.Key])
		if value == "" {
			continue
		}
		formatted := formatPurchaseDiscountMultiplierForCSV(value, false)
		if formatted != "" {
			parts = append(parts, component.Label+" "+formatted)
		}
	}
	return strings.Join(parts, "；")
}

func formatPurchaseDiscountMultiplierForCSV(value string, includeOfficialPriceLabel bool) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	multiplier, err := decimal.NewFromString(value)
	if err != nil {
		return spreadsheetSafeCSVCell(value)
	}
	discount := multiplier.Mul(decimal.NewFromInt(10)).String() + "折"
	percentage := multiplier.Mul(decimal.NewFromInt(100)).String() + "%"
	if includeOfficialPriceLabel {
		return discount + "（官方价的" + percentage + "）"
	}
	return discount + "（" + percentage + "）"
}

func formatRetailOfficialDiscountForCSV(pricingMode string, officialRaw string, retailRaw string) string {
	officialPrices := pricingPricePointsForCSV(officialRaw)
	retailPrices := pricingPricePointsForCSV(retailRaw)
	if len(officialPrices) == 0 || len(retailPrices) == 0 {
		return ""
	}

	retailByKey := make(map[string]pricingCSVPricePoint, len(retailPrices))
	for _, point := range retailPrices {
		retailByKey[point.Key] = point
	}
	type componentRatio struct {
		Label string
		Ratio decimal.Decimal
	}
	ratios := make([]componentRatio, 0, len(officialPrices))
	for _, official := range officialPrices {
		retail, exists := retailByKey[official.Key]
		if !exists || !official.Price.IsPositive() || retail.Price.IsNegative() {
			continue
		}
		ratios = append(ratios, componentRatio{
			Label: official.Label,
			Ratio: retail.Price.Div(official.Price),
		})
	}
	if len(ratios) == 0 {
		return ""
	}

	firstRatio := ratios[0].Ratio.Round(4)
	if strings.TrimSpace(pricingMode) == "official_ratio" {
		return formatRetailOfficialMultiplierForCSV(firstRatio)
	}
	uniform := true
	for _, ratio := range ratios[1:] {
		if !ratio.Ratio.Round(4).Equal(firstRatio) {
			uniform = false
			break
		}
	}
	if uniform {
		return formatRetailOfficialMultiplierForCSV(firstRatio)
	}

	parts := make([]string, 0, len(ratios))
	for _, ratio := range ratios {
		parts = append(
			parts,
			ratio.Label+" "+formatRetailOfficialMultiplierForCSV(ratio.Ratio),
		)
	}
	return strings.Join(parts, "；")
}

func formatRetailOfficialMultiplierForCSV(multiplier decimal.Decimal) string {
	discount := multiplier.Mul(decimal.NewFromInt(10)).Round(4).String() + "折"
	percentage := multiplier.Mul(decimal.NewFromInt(100)).Round(4).String() + "%"
	return discount + "（" + percentage + "）"
}

func pricingPricePointsForCSV(raw string) []pricingCSVPricePoint {
	var components map[string]any
	if err := common.UnmarshalJsonStr(strings.TrimSpace(raw), &components); err != nil {
		return nil
	}

	rules, _ := components["rules"].([]any)
	if len(rules) == 0 {
		rules, _ = components["tiers"].([]any)
	}
	if len(rules) > 0 {
		points := make([]pricingCSVPricePoint, 0, len(rules))
		occurrences := make(map[string]int, len(rules))
		for _, rawRule := range rules {
			rule, ok := rawRule.(map[string]any)
			if !ok {
				continue
			}
			identityParts := []string{
				pricingComponentScalar(rule["name"]),
				pricingComponentScalar(rule["component"]),
				pricingComponentScalar(rule["unit"]),
				pricingComponentScalar(rule["unit_size"]),
				pricingComponentScalar(rule["operation"]),
				pricingComponentScalar(rule["quality"]),
				pricingComponentScalar(rule["resolution"]),
				pricingComponentScalar(rule["with_audio"]),
				pricingComponentScalar(rule["upper_bound"]),
			}
			identity := strings.Join(identityParts, "\x1f")
			occurrences[identity]++

			name := pricingComponentScalar(rule["name"])
			component := pricingCSVComponentLabel(pricingComponentScalar(rule["component"]))
			label := component
			if name != "" {
				label = name
				if component != "" && component != name {
					label += " · " + component
				}
			}
			if label == "" {
				label = "价格规则"
			}
			conditions := make([]string, 0, 5)
			if value := pricingComponentScalar(rule["operation"]); value != "" {
				conditions = append(conditions, "操作="+value)
			}
			if value := pricingComponentScalar(rule["quality"]); value != "" {
				conditions = append(conditions, "质量="+value)
			}
			if value := pricingComponentScalar(rule["resolution"]); value != "" {
				conditions = append(conditions, "分辨率="+value)
			}
			if value := pricingComponentScalar(rule["with_audio"]); value == "true" {
				conditions = append(conditions, "含音频")
			} else if value == "false" {
				conditions = append(conditions, "不含音频")
			}
			if value := pricingComponentScalar(rule["upper_bound"]); value != "" {
				conditions = append(conditions, "用量≤"+value)
			}
			if len(conditions) > 0 {
				label += "（" + strings.Join(conditions, "，") + "）"
			}

			unitPrice := pricingComponentScalar(rule["unit_price"])
			if price, err := decimal.NewFromString(unitPrice); err == nil {
				points = append(points, pricingCSVPricePoint{
					Key:   fmt.Sprintf("rule:%s:%d", identity, occurrences[identity]),
					Label: label,
					Price: price,
				})
				continue
			}

			for _, component := range pricingCSVFlatComponents {
				price, err := decimal.NewFromString(
					pricingComponentScalar(rule[component.Key]),
				)
				if err != nil {
					continue
				}
				componentLabel := strings.SplitN(component.Label, " / ", 2)[0]
				points = append(points, pricingCSVPricePoint{
					Key: fmt.Sprintf(
						"rule:%s:%d:%s",
						identity,
						occurrences[identity],
						component.Key,
					),
					Label: label + " · " + componentLabel,
					Price: price,
				})
			}
		}
		return points
	}

	points := make([]pricingCSVPricePoint, 0, len(pricingCSVFlatComponents))
	seen := make(map[string]struct{}, len(pricingCSVFlatComponents))
	for _, component := range pricingCSVFlatComponents {
		seen[component.Key] = struct{}{}
		price, err := decimal.NewFromString(pricingComponentScalar(components[component.Key]))
		if err != nil {
			continue
		}
		label := strings.SplitN(component.Label, " / ", 2)[0]
		points = append(points, pricingCSVPricePoint{
			Key: component.Key, Label: label, Price: price,
		})
	}
	unknownKeys := make([]string, 0)
	for key := range components {
		if _, exists := seen[key]; exists || !strings.HasSuffix(key, "_unit_price") {
			continue
		}
		if _, err := decimal.NewFromString(pricingComponentScalar(components[key])); err == nil {
			unknownKeys = append(unknownKeys, key)
		}
	}
	sort.Strings(unknownKeys)
	for _, key := range unknownKeys {
		price, _ := decimal.NewFromString(pricingComponentScalar(components[key]))
		points = append(points, pricingCSVPricePoint{Key: key, Label: key, Price: price})
	}
	return points
}

func formatPricingComponentsForCSV(raw string, billingExpr string, currency string) string {
	var components map[string]any
	if err := common.UnmarshalJsonStr(strings.TrimSpace(raw), &components); err == nil {
		rules, _ := components["rules"].([]any)
		if len(rules) == 0 {
			rules, _ = components["tiers"].([]any)
		}
		if len(rules) > 0 {
			formattedRules := make([]string, 0, len(rules))
			for index, rawRule := range rules {
				rule, ok := rawRule.(map[string]any)
				if !ok {
					continue
				}
				name := pricingComponentScalar(rule["name"])
				component := pricingComponentScalar(rule["component"])
				label := pricingCSVComponentLabel(component)
				if name != "" {
					if label != "" && name != label {
						label = name + " · " + label
					} else {
						label = name
					}
				}
				if label == "" {
					label = fmt.Sprintf("规则 %d", index+1)
				}
				conditions := make([]string, 0, 5)
				if value := pricingComponentScalar(rule["operation"]); value != "" {
					conditions = append(conditions, "操作="+value)
				}
				if value := pricingComponentScalar(rule["quality"]); value != "" {
					conditions = append(conditions, "质量="+value)
				}
				if value := pricingComponentScalar(rule["resolution"]); value != "" {
					conditions = append(conditions, "分辨率="+value)
				}
				if value := pricingComponentScalar(rule["with_audio"]); value != "" {
					switch value {
					case "true":
						conditions = append(conditions, "含音频")
					case "false":
						conditions = append(conditions, "不含音频")
					}
				}
				if value := pricingComponentScalar(rule["upper_bound"]); value != "" {
					conditions = append(conditions, "用量≤"+value)
				}
				if len(conditions) > 0 {
					label += "（" + strings.Join(conditions, "，") + "）"
				}

				unitPrice := pricingComponentScalar(rule["unit_price"])
				if unitPrice != "" {
					price := unitPrice
					if currency != "" {
						price += " " + currency
					}
					unit := pricingCSVUnit(
						pricingComponentScalar(rule["unit"]),
						pricingComponentScalar(rule["unit_size"]),
					)
					if unit != "" {
						price += " / " + unit
					}
					formattedRules = append(formattedRules, label+": "+price)
					continue
				}

				for _, component := range pricingCSVFlatComponents {
					price := pricingComponentScalar(rule[component.Key])
					if price == "" {
						continue
					}
					if currency != "" {
						price += " " + currency
					}
					formattedRules = append(
						formattedRules,
						label+" · "+component.Label+": "+price,
					)
				}
			}
			if len(formattedRules) > 0 {
				return strings.Join(formattedRules, "；")
			}
		}

		summaries := make([]string, 0, len(pricingCSVFlatComponents))
		seen := make(map[string]struct{}, len(pricingCSVFlatComponents))
		for _, component := range pricingCSVFlatComponents {
			seen[component.Key] = struct{}{}
			value := pricingComponentScalar(components[component.Key])
			if value == "" {
				continue
			}
			if currency != "" {
				value += " " + currency
			}
			summaries = append(summaries, component.Label+": "+value)
		}
		unknownKeys := make([]string, 0)
		for key := range components {
			if _, exists := seen[key]; exists || !strings.HasSuffix(key, "_unit_price") {
				continue
			}
			if pricingComponentScalar(components[key]) != "" {
				unknownKeys = append(unknownKeys, key)
			}
		}
		sort.Strings(unknownKeys)
		for _, key := range unknownKeys {
			value := pricingComponentScalar(components[key])
			if currency != "" {
				value += " " + currency
			}
			summaries = append(summaries, key+": "+value)
		}
		if len(summaries) > 0 {
			return strings.Join(summaries, "；")
		}
	}
	billingExpr = strings.TrimSpace(billingExpr)
	if billingExpr == "" {
		return ""
	}
	return "表达式: " + billingExpr
}

func pricingComponentScalar(value any) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case float64:
		return decimal.NewFromFloat(typed).String()
	case float32:
		return decimal.NewFromFloat32(typed).String()
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	default:
		return ""
	}
}

func pricingCSVComponentLabel(component string) string {
	if label := pricingCSVComponentLabels[component]; label != "" {
		return label
	}
	return component
}

func pricingCSVUnit(unit string, unitSize string) string {
	if unit == "" {
		return ""
	}
	if unitSize == "" {
		unitSize = "1"
	}
	if unit == "token" && unitSize == "1000000" {
		return "1M Token"
	}
	label := pricingCSVUnitLabels[unit]
	if label == "" {
		label = unit
	}
	return unitSize + " " + label
}

func formatPricingRatePercentage(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	rate, err := decimal.NewFromString(value)
	if err != nil {
		return value
	}
	return rate.Mul(decimal.NewFromInt(100)).String() + "%"
}

func AdminGetPricingReconciliationSummary(c *gin.Context) {
	now := common.GetTimestamp()
	staleBefore := now - pricingReconciliationReservedAgeSeconds
	recentSince := now - 24*60*60
	var pendingCount int64
	if err := model.DB.Model(&model.RequestPricingSnapshot{}).
		Where("status = ?", pricingruntime.PricingSnapshotStatusPending).
		Count(&pendingCount).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	var staleReservedCount int64
	if err := model.DB.Model(&model.RequestPricingSnapshot{}).
		Where("status = ? AND created_at <= ?",
			pricingruntime.PricingSnapshotStatusReserved,
			staleBefore,
		).
		Count(&staleReservedCount).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	var settledRecentCount int64
	if err := model.DB.Model(&model.RequestPricingSnapshot{}).
		Where("status = ? AND updated_at >= ?",
			pricingruntime.PricingSnapshotStatusSettled,
			recentSince,
		).
		Count(&settledRecentCount).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	var refundedRecentCount int64
	if err := model.DB.Model(&model.RequestPricingSnapshot{}).
		Where("status = ? AND updated_at >= ?",
			pricingruntime.PricingSnapshotStatusRefunded,
			recentSince,
		).
		Count(&refundedRecentCount).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	var oldestAnomaly model.RequestPricingSnapshot
	oldestAnomalyCreatedAt := int64(0)
	result := model.DB.Model(&model.RequestPricingSnapshot{}).
		Where(
			"status = ? OR (status = ? AND created_at <= ?)",
			pricingruntime.PricingSnapshotStatusPending,
			pricingruntime.PricingSnapshotStatusReserved,
			staleBefore,
		).
		Order("created_at ASC").
		Limit(1).
		Find(&oldestAnomaly)
	if result.Error != nil {
		common.ApiError(c, result.Error)
		return
	}
	if result.RowsAffected == 1 {
		oldestAnomalyCreatedAt = oldestAnomaly.CreatedAt
	}
	common.ApiSuccess(c, gin.H{
		"pending":                   pendingCount,
		"stale_reserved":            staleReservedCount,
		"settled_last_24h":          settledRecentCount,
		"refunded_last_24h":         refundedRecentCount,
		"oldest_anomaly_created_at": oldestAnomalyCreatedAt,
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
	if input.RuntimeMode != "" && input.RuntimeMode != current.RuntimeMode {
		common.ApiErrorMsg(c, "运行模式只能通过模型级启用 V2 或回退操作修改")
		return
	}
	if current.RuntimeMode == pricingruntime.RuntimeModeV2 {
		if input.Status == 0 {
			common.ApiErrorMsg(c, "停用的渠道模型不能启用 V2 运行时")
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
		"updated_at":        common.GetTimestamp(),
	}
	if err := model.DB.Model(&current).Updates(updates).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	pricingruntime.InvalidateCatalog()
	if current.RuntimeMode == pricingruntime.RuntimeModeV2 {
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
	var logicalModel model.Model
	if err := model.DB.First(&logicalModel, modelId).Error; err != nil {
		return err
	}
	if logicalModel.RoutingTargetModelId != nil {
		return errors.New("系统模型别名复用目标模型路由，不能创建独立渠道模型")
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
