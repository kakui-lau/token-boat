package controller

import (
	"encoding/csv"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/pricingadmin"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

func AdminListSalesPriceBooks(c *gin.Context) {
	page, pageSize, err := salesPriceBookPageQuery(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	books, total, err := pricingadmin.ListSalesPriceBooks(pricingadmin.SalesPriceBookListFilter{
		Keyword:  c.Query("keyword"),
		Audience: c.Query("audience"),
		Status:   c.Query("status"),
		Page:     page,
		PageSize: pageSize,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"items": books, "total": total, "page": page, "page_size": pageSize,
	})
}

func AdminCreateSalesPriceBook(c *gin.Context) {
	var input model.SalesPriceBook
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := pricingadmin.CreateSalesPriceBook(&input, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &input)
}

func AdminUpdateSalesPriceBook(c *gin.Context) {
	priceBookId, ok := positivePathId(c)
	if !ok {
		return
	}
	var input struct {
		Name   string `json:"name" binding:"required"`
		Remark string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := pricingadmin.UpdateSalesPriceBook(priceBookId, input.Name, input.Remark, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminListSalesPriceBookVersions(c *gin.Context) {
	priceBookId, ok := positivePathId(c)
	if !ok {
		return
	}
	versions, err := pricingadmin.ListSalesPriceBookVersions(priceBookId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, versions)
}

func AdminCreateSalesPriceBookVersion(c *gin.Context) {
	priceBookId, ok := positivePathId(c)
	if !ok {
		return
	}
	var input model.SalesPriceBookVersion
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	input.PriceBookId = priceBookId
	if err := pricingadmin.CreateSalesPriceBookVersion(&input, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &input)
}

func AdminUpdateSalesPriceBookVersionDraft(c *gin.Context) {
	versionId, ok := positivePathId(c)
	if !ok {
		return
	}
	var input model.SalesPriceBookVersion
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	input.Id = versionId
	if err := pricingadmin.UpdateSalesPriceBookVersionDraft(&input, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &input)
}

func AdminCloneSalesPriceBookVersion(c *gin.Context) {
	priceBookId, ok := positivePathId(c)
	if !ok {
		return
	}
	var input struct {
		SourceVersionId int `json:"source_version_id"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	version, err := pricingadmin.CloneSalesPriceBookVersion(
		priceBookId,
		input.SourceVersionId,
		c.GetInt("id"),
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, version)
}

func AdminDisableSalesPriceBook(c *gin.Context) {
	priceBookId, ok := positivePathId(c)
	if !ok {
		return
	}
	if err := pricingadmin.DisableSalesPriceBook(priceBookId, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminEnableSalesPriceBook(c *gin.Context) {
	priceBookId, ok := positivePathId(c)
	if !ok {
		return
	}
	if err := pricingadmin.EnableSalesPriceBook(priceBookId, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminArchiveSalesPriceBook(c *gin.Context) {
	priceBookId, ok := positivePathId(c)
	if !ok {
		return
	}
	if err := pricingadmin.ArchiveSalesPriceBook(priceBookId, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminDeleteSalesPriceBookVersionDraft(c *gin.Context) {
	versionId, ok := positivePathId(c)
	if !ok {
		return
	}
	if err := pricingadmin.DeleteSalesPriceBookVersionDraft(versionId, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminListSalesPriceBookItems(c *gin.Context) {
	versionId, ok := positivePathId(c)
	if !ok {
		return
	}
	items, err := pricingadmin.ListSalesPriceBookItems(versionId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, items)
}

func AdminListSalesPriceBookChannelModelOverrides(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	versionId, ok := positivePathId(c)
	if !ok {
		return
	}
	items, err := pricingadmin.ListSalesPriceBookChannelModelOverrides(versionId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, items)
}

func AdminSaveSalesPriceBookChannelModelOverride(c *gin.Context) {
	versionId, ok := positivePathId(c)
	if !ok {
		return
	}
	channelModelId, err := strconv.Atoi(c.Param("channel_model_id"))
	if err != nil || channelModelId <= 0 {
		common.ApiError(c, errors.New("channel_model_id must be a positive integer"))
		return
	}
	var input model.SalesPriceBookChannelModelOverride
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	saved, err := pricingadmin.SaveSalesPriceBookChannelModelOverride(
		versionId, channelModelId, &input, c.GetInt("id"),
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, saved)
}

func AdminDeleteSalesPriceBookChannelModelOverride(c *gin.Context) {
	versionId, ok := positivePathId(c)
	if !ok {
		return
	}
	channelModelId, err := strconv.Atoi(c.Param("channel_model_id"))
	if err != nil || channelModelId <= 0 {
		common.ApiError(c, errors.New("channel_model_id must be a positive integer"))
		return
	}
	if err := pricingadmin.DeleteSalesPriceBookChannelModelOverride(
		versionId, channelModelId, c.GetInt("id"),
	); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminCompareSalesPriceBookVersions(c *gin.Context) {
	targetVersionId, ok := positivePathId(c)
	if !ok {
		return
	}
	baseVersionId, err := optionalPositiveQueryId(c, "base_version_id")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if baseVersionId == 0 {
		common.ApiError(c, errors.New("base_version_id must be provided"))
		return
	}
	diff, err := pricingadmin.CompareSalesPriceBookVersions(baseVersionId, targetVersionId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, diff)
}

func AdminExportSalesPriceBookItems(c *gin.Context) {
	versionId, ok := positivePathId(c)
	if !ok {
		return
	}
	var version model.SalesPriceBookVersion
	if err := model.DB.First(&version, versionId).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	items, err := pricingadmin.ListSalesPriceBookItems(versionId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	filename := fmt.Sprintf(
		"sales-price-book-version-%d-items-%s.csv",
		versionId,
		time.Now().UTC().Format("20060102-150405"),
	)
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	c.Status(200)
	_, _ = c.Writer.Write([]byte{0xEF, 0xBB, 0xBF})
	writer := csv.NewWriter(c.Writer)
	_ = writer.Write([]string{
		"模型名称", "状态", "计费模式", "客户售价规则", "统一售价取价策略", "采购折扣", "销售折扣", "定价详情",
	})
	for _, item := range items {
		_ = writer.Write([]string{
			spreadsheetSafeCSVCell(item.ModelName),
			formatSalesPriceBookItemStatus(item.Status),
			formatSalesPriceBookBillingMode(item.BillingMode),
			formatSalesPriceBookRule(item),
			formatSalesPriceBookCostBasisStrategy(version.CostBasisStrategy),
			formatSalesPriceBookDiscount(item.PurchaseDiscount),
			formatSalesPriceBookDiscount(item.SalesDiscount),
			spreadsheetSafeCSVCell(item.SalesBillingExpr),
		})
	}
	writer.Flush()
}

func AdminExportSalesPriceBookChannelModels(c *gin.Context) {
	versionId, ok := positivePathId(c)
	if !ok {
		return
	}
	var version model.SalesPriceBookVersion
	if err := model.DB.First(&version, versionId).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	var book model.SalesPriceBook
	if err := model.DB.First(&book, version.PriceBookId).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	items, err := pricingadmin.ListSalesPriceBookItems(versionId)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	filename := fmt.Sprintf(
		"sales-price-book-version-%d-channel-models-%s.csv",
		versionId,
		time.Now().UTC().Format("20060102-150405"),
	)
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	c.Status(200)
	_, _ = c.Writer.Write([]byte{0xEF, 0xBB, 0xBF})
	writer := csv.NewWriter(c.Writer)
	_ = writer.Write([]string{
		"报价组", "报价版本", "模型名称", "渠道名称", "渠道模型ID", "上游模型名称",
		"模型状态", "渠道状态", "渠道模型状态", "计费模式", "统一售价取价策略", "客户售价规则",
		"采购定价方式", "采购折扣", "销售折扣", "支付手续费", "分销手续费", "运维人力成本",
		"变动成本率", "利得税率", "目标净利率", "最低净利率", "特殊参数覆盖", "最低利润校验",
		"成本角色", "采购价版本", "币种", "采购价格分项", "销售价格分项", "采购计费表达式", "销售计费表达式",
	})
	for _, item := range items {
		for _, margin := range item.ChannelMargins {
			purchaseDiscount := formatPurchaseDiscountForCSV(
				margin.PurchasePricingMode,
				margin.PurchaseDiscount,
				margin.PurchaseQuoteSpec,
			)
			if purchaseDiscount == "" {
				purchaseDiscount = "—"
			}
			currency := strings.TrimSpace(margin.Currency)
			if currency == "" {
				currency = strings.TrimSpace(item.Currency)
			}
			_ = writer.Write([]string{
				spreadsheetSafeCSVCell(book.Name),
				fmt.Sprintf("v%d (#%d)", version.Version, version.Id),
				spreadsheetSafeCSVCell(item.ModelName),
				spreadsheetSafeCSVCell(margin.ChannelName),
				strconv.Itoa(margin.ChannelModelId),
				spreadsheetSafeCSVCell(margin.UpstreamModelName),
				formatSalesPriceBookItemStatus(item.Status),
				formatSalesPriceBookAvailabilityStatus(margin.ChannelStatus),
				formatSalesPriceBookAvailabilityStatus(margin.ChannelModelStatus),
				formatSalesPriceBookBillingMode(item.BillingMode),
				formatSalesPriceBookCostBasisStrategy(version.CostBasisStrategy),
				formatSalesPriceBookRule(item),
				formatPurchasePricingModeForCSV(margin.PurchasePricingMode),
				purchaseDiscount,
				formatSalesPriceBookDiscount(margin.SalesDiscount),
				formatSalesPriceBookRate(margin.PaymentFeeRate),
				formatSalesPriceBookRate(margin.DistributionFeeRate),
				formatSalesPriceBookRate(margin.OperationsLaborRate),
				formatSalesPriceBookRate(margin.TotalVariableCostRate),
				formatSalesPriceBookRate(margin.EffectiveTaxRate),
				formatSalesPriceBookRate(margin.TargetNetMargin),
				formatSalesPriceBookRate(margin.MinimumMarginRate),
				spreadsheetSafeCSVCell(formatSalesPriceBookOverrides(version, margin)),
				formatSalesPriceBookMarginQualification(margin.MeetsMinimumMargin),
				formatSalesPriceBookCostRole(margin.SourceRole),
				fmt.Sprintf("v%d (#%d)", margin.PurchasePriceVersion, margin.PurchasePriceVersionId),
				currency,
				formatPricingComponentsForCSV(
					margin.PurchasePriceComponents,
					margin.PurchaseBillingExpr,
					currency,
				),
				formatPricingComponentsForCSV(
					item.PriceComponents,
					item.SalesBillingExpr,
					item.Currency,
				),
				spreadsheetSafeCSVCell(margin.PurchaseBillingExpr),
				spreadsheetSafeCSVCell(item.SalesBillingExpr),
			})
		}
	}
	writer.Flush()
}

func formatSalesPriceBookRule(item pricingadmin.SalesPriceBookItemListItem) string {
	if item.PricingMethod != "cost_plus" {
		return "自定义计费表达式"
	}
	factor, err := decimal.NewFromString(strings.TrimSpace(item.SellingFactor))
	if err == nil && factor.IsPositive() {
		return "采购成本 × " + formatSalesPriceBookDecimal(item.SellingFactor)
	}
	return "基于渠道成本及特殊参数统一定价"
}

func formatSalesPriceBookCostBasisStrategy(strategy string) string {
	switch strings.TrimSpace(strategy) {
	case "max_eligible_cost":
		return "按最高符合路由条件的渠道成本定价"
	case "min_eligible_cost":
		return "按最低符合路由条件的渠道成本定价"
	case "designated_channel":
		return "按指定渠道成本定价"
	default:
		return spreadsheetSafeCSVCell(strings.TrimSpace(strategy))
	}
}

func formatSalesPriceBookRate(value string) string {
	parsed, err := decimal.NewFromString(strings.TrimSpace(value))
	if err != nil || parsed.IsNegative() {
		return "—"
	}
	return parsed.Mul(decimal.NewFromInt(100)).Round(4).String() + "%"
}

func formatSalesPriceBookOverrides(
	version model.SalesPriceBookVersion,
	margin pricingadmin.SalesPriceBookChannelMargin,
) string {
	if len(margin.OverriddenFields) == 0 {
		return "无"
	}
	parts := make([]string, 0, len(margin.OverriddenFields))
	for _, field := range margin.OverriddenFields {
		label := field
		defaultValue := ""
		effectiveValue := ""
		switch field {
		case "payment_fee_rate":
			label, defaultValue, effectiveValue = "支付手续费", version.PaymentFeeRate, margin.PaymentFeeRate
		case "distribution_fee_rate":
			label, defaultValue, effectiveValue = "分销手续费", version.DistributionFeeRate, margin.DistributionFeeRate
		case "operations_labor_rate":
			label, defaultValue, effectiveValue = "运维人力成本", version.OperationsLaborRate, margin.OperationsLaborRate
		case "effective_tax_rate":
			label, defaultValue, effectiveValue = "利得税率", version.EffectiveTaxRate, margin.EffectiveTaxRate
		case "target_net_margin":
			label, defaultValue, effectiveValue = "目标净利率", version.TargetNetMargin, margin.TargetNetMargin
		case "minimum_margin_rate":
			label, defaultValue, effectiveValue = "最低净利率", version.MinimumMarginRate, margin.MinimumMarginRate
		}
		parts = append(parts, fmt.Sprintf(
			"%s %s → %s",
			label,
			formatSalesPriceBookRate(defaultValue),
			formatSalesPriceBookRate(effectiveValue),
		))
	}
	return strings.Join(parts, "；")
}

func formatSalesPriceBookAvailabilityStatus(status int) string {
	if status == 1 {
		return "已启用"
	}
	return "已禁用"
}

func formatSalesPriceBookMarginQualification(qualified bool) string {
	if qualified {
		return "通过"
	}
	return "未通过（低于最低净利率）"
}

func formatSalesPriceBookCostRole(role string) string {
	switch strings.TrimSpace(role) {
	case "selected":
		return "指定渠道（纳入统一售价基准）"
	case "cost_basis":
		return "纳入统一售价基准"
	case "candidate":
		return "仅供成本与利润比较"
	default:
		return spreadsheetSafeCSVCell(strings.TrimSpace(role))
	}
}

func formatSalesPriceBookDecimal(value string) string {
	parsed, err := decimal.NewFromString(strings.TrimSpace(value))
	if err != nil {
		return "—"
	}
	return parsed.Round(4).String()
}

func formatSalesPriceBookDiscount(value string) string {
	parsed, err := decimal.NewFromString(strings.TrimSpace(value))
	if err != nil || parsed.IsNegative() {
		return "—"
	}
	discount := parsed.Mul(decimal.NewFromInt(10)).Round(4).String()
	percentage := parsed.Mul(decimal.NewFromInt(100)).Round(4).String()
	return fmt.Sprintf("%s折（官方价 × %s%%）", discount, percentage)
}

func formatSalesPriceBookItemStatus(status string) string {
	switch status {
	case pricingadmin.SalesPriceItemStatusEnabled:
		return "已启用"
	case pricingadmin.SalesPriceItemStatusDisabled:
		return "已禁用"
	case pricingadmin.SalesPriceItemStatusReviewRequired:
		return "需要审核"
	default:
		return status
	}
}

func formatSalesPriceBookBillingMode(mode string) string {
	if mode == "token" {
		return "按 Token 用量"
	}
	return mode
}

func AdminSaveSalesPriceBookItem(c *gin.Context) {
	versionId, ok := positivePathId(c)
	if !ok {
		return
	}
	var input model.SalesPriceBookItem
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	input.PriceBookVersionId = versionId
	if err := pricingadmin.SaveSalesPriceBookItem(&input, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &input)
}

func AdminGenerateSalesPriceBookItems(c *gin.Context) {
	versionId, ok := positivePathId(c)
	if !ok {
		return
	}
	var input pricingadmin.SalesPriceBookGenerationInput
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	result, err := pricingadmin.GenerateSalesPriceBookItems(versionId, input, c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func AdminGetPricingChangeBatch(c *gin.Context) {
	batchId, ok := positivePathId(c)
	if !ok {
		return
	}
	batch, items, err := pricingadmin.GetPricingChangeBatch(batchId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"batch": batch, "items": items})
}

func AdminListPricingChangeBatches(c *gin.Context) {
	page, pageSize, err := salesPriceBookPageQuery(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	items, total, err := pricingadmin.ListPricingChangeBatches(
		pricingadmin.PricingChangeBatchListFilter{
			Keyword: c.Query("keyword"), Status: c.Query("status"),
			TriggerType: c.Query("trigger_type"), Page: page, PageSize: pageSize,
		},
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"items": items, "total": total, "page": page, "page_size": pageSize,
	})
}

func AdminPublishSalesPriceBookVersion(c *gin.Context) {
	versionId, ok := positivePathId(c)
	if !ok {
		return
	}
	if err := pricingadmin.PublishSalesPriceBookVersion(versionId, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminAcceptSalesPriceBookItemReview(c *gin.Context) {
	itemId, ok := positivePathId(c)
	if !ok {
		return
	}
	var input struct {
		Comment string `json:"comment" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := pricingadmin.AcceptSalesPriceBookItemReview(
		itemId, c.GetInt("id"), input.Comment,
	); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminRejectSalesPriceBookItemReview(c *gin.Context) {
	itemId, ok := positivePathId(c)
	if !ok {
		return
	}
	var input struct {
		Comment string `json:"comment" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := pricingadmin.RejectSalesPriceBookItemReview(itemId, c.GetInt("id"), input.Comment); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminSetSalesPriceBookItemStatus(c *gin.Context) {
	itemId, ok := positivePathId(c)
	if !ok {
		return
	}
	var input struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := pricingadmin.SetSalesPriceBookItemEnabled(itemId, input.Enabled, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminDeleteSalesPriceBookItem(c *gin.Context) {
	itemId, ok := positivePathId(c)
	if !ok {
		return
	}
	if err := pricingadmin.DeleteSalesPriceBookItem(itemId, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminDeleteSalesPriceBookItems(c *gin.Context) {
	var input struct {
		ItemIds []int `json:"item_ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := pricingadmin.DeleteSalesPriceBookItems(input.ItemIds, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminListSalesPriceBookAuditRecords(c *gin.Context) {
	priceBookId, ok := positivePathId(c)
	if !ok {
		return
	}
	page, pageSize, err := salesPriceBookPageQuery(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	items, total, err := pricingadmin.ListSalesPriceBookAuditRecords(priceBookId, page, pageSize)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"items": items, "total": total, "page": page, "page_size": pageSize,
	})
}

func AdminPublishGeneratedPricingChangeBatch(c *gin.Context) {
	batchId, ok := positivePathId(c)
	if !ok {
		return
	}
	result, err := pricingadmin.PublishGeneratedPricingChangeBatch(batchId, c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func AdminReconcilePricingAutomation(c *gin.Context) {
	result, err := pricingadmin.ReconcilePricingAutomation(c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func AdminListUserPriceBookAssignments(c *gin.Context) {
	page, pageSize, err := salesPriceBookPageQuery(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	userId, err := optionalPositiveQueryId(c, "user_id")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	priceBookId, err := optionalPositiveQueryId(c, "price_book_id")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	assignments, total, err := pricingadmin.ListUserPriceBookAssignments(
		pricingadmin.UserPriceBookAssignmentListFilter{
			Keyword:     c.Query("keyword"),
			UserId:      userId,
			PriceBookId: priceBookId,
			Status:      c.Query("status"),
			Page:        page,
			PageSize:    pageSize,
		},
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"items": assignments, "total": total, "page": page, "page_size": pageSize,
	})
}

func salesPriceBookPageQuery(c *gin.Context) (int, int, error) {
	page := 1
	if rawPage := strings.TrimSpace(c.Query("p")); rawPage != "" {
		parsed, err := strconv.Atoi(rawPage)
		if err != nil || parsed <= 0 {
			return 0, 0, errors.New("p must be a positive integer")
		}
		page = parsed
	}
	pageSize := pricingadmin.SalesPriceBookDefaultPageSize
	rawPageSize := strings.TrimSpace(c.Query("page_size"))
	if rawPageSize == "" {
		rawPageSize = strings.TrimSpace(c.Query("ps"))
	}
	if rawPageSize == "" {
		rawPageSize = strings.TrimSpace(c.Query("size"))
	}
	if rawPageSize != "" {
		parsed, err := strconv.Atoi(rawPageSize)
		if err != nil || parsed <= 0 {
			return 0, 0, errors.New("page_size must be a positive integer")
		}
		pageSize = min(parsed, pricingadmin.SalesPriceBookMaximumPageSize)
	}
	return page, pageSize, nil
}

func optionalPositiveQueryId(c *gin.Context, key string) (int, error) {
	raw := strings.TrimSpace(c.Query(key))
	if raw == "" {
		return 0, nil
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed <= 0 {
		return 0, fmt.Errorf("%s must be a positive integer", key)
	}
	return parsed, nil
}

func AdminAssignUserToSalesPriceBook(c *gin.Context) {
	var input model.UserPriceBookAssignment
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := pricingadmin.AssignUserToSalesPriceBook(&input, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &input)
}

func AdminCancelUserPriceBookAssignment(c *gin.Context) {
	assignmentId, ok := positivePathId(c)
	if !ok {
		return
	}
	if err := pricingadmin.CancelUserPriceBookAssignment(assignmentId, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminGetDefaultSalesPriceBook(c *gin.Context) {
	defaultKey := c.DefaultQuery("default_key", "toc_default")
	value, err := pricingadmin.GetDefaultSalesPriceBook(defaultKey)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, value)
}

func AdminSetDefaultSalesPriceBook(c *gin.Context) {
	var input struct {
		DefaultKey  string `json:"default_key"`
		PriceBookId int    `json:"price_book_id"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := pricingadmin.SetDefaultSalesPriceBook(
		input.DefaultKey,
		input.PriceBookId,
		c.GetInt("id"),
	); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
