/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

package controller

import (
	"database/sql"
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/pricingadmin"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type salesPriceGenerationInput struct {
	TotalVariableCostRate string `json:"total_variable_cost_rate"`
	EffectiveTaxRate      string `json:"effective_tax_rate"`
	TargetNetMargin       string `json:"target_net_margin"`
	ChannelModelIds       []int  `json:"channel_model_ids,omitempty"`
}

type salesPriceGeneratorSourceItem struct {
	ChannelModelId      int    `json:"channel_model_id"`
	ModelId             int    `json:"model_id"`
	ModelName           string `json:"model_name"`
	ChannelName         string `json:"channel_name"`
	UpstreamModelName   string `json:"upstream_model_name"`
	RuntimeMode         string `json:"runtime_mode"`
	PurchasePricingMode string `json:"purchase_pricing_mode"`
	PurchaseDiscount    string `json:"purchase_discount"`
}

type salesPriceGenerationResult struct {
	Rates salesPriceGenerationInput `json:"rates"`
	pricingComparisonResult
}

func AdminListSalesPriceGeneratorChannelModels(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	rawPageSize := strings.TrimSpace(c.Query("page_size"))
	if rawPageSize == "" {
		pageInfo.PageSize = 200
	} else if requestedPageSize, err := strconv.Atoi(rawPageSize); err == nil && requestedPageSize > 100 {
		pageInfo.PageSize = min(requestedPageSize, 200)
	}

	query, err := salesPriceGeneratorQuery(c)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	var total int64
	if err := query.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	var rows []channelPricingExportRow
	if err := query.
		Order("models.model_name ASC, models.id ASC, channels.name ASC, channel_models.id ASC").
		Offset(pageInfo.GetStartIdx()).
		Limit(pageInfo.GetPageSize()).
		Scan(&rows).Error; err != nil {
		common.ApiError(c, err)
		return
	}

	items := make([]salesPriceGeneratorSourceItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, salesPriceGeneratorSourceItem{
			ChannelModelId:      row.ChannelModelId,
			ModelId:             row.ModelId,
			ModelName:           row.ModelName,
			ChannelName:         row.ChannelName,
			UpstreamModelName:   row.UpstreamModelName,
			RuntimeMode:         row.RuntimeMode,
			PurchasePricingMode: formatPurchasePricingModeForCSV(row.PurchasePricingMode),
			PurchaseDiscount: formatPurchaseDiscountForCSV(
				row.PurchasePricingMode,
				row.PurchaseDiscount,
				row.PurchaseQuoteSpec,
			),
		})
	}
	common.ApiSuccess(c, gin.H{
		"items": items, "total": total,
		"page": pageInfo.GetPage(), "page_size": pageInfo.GetPageSize(),
	})
}

func AdminGenerateSalesPrices(c *gin.Context) {
	input, ok := bindSalesPriceGenerationInput(c)
	if !ok {
		return
	}
	result, err := generateSalesPriceComparison(c, input)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	common.ApiSuccess(c, result)
}

func AdminExportGeneratedSalesPrices(c *gin.Context) {
	input, ok := bindSalesPriceGenerationInput(c)
	if !ok {
		return
	}
	result, err := generateSalesPriceComparison(c, input)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	writePricingComparisonCSV(c, "generated-sales-prices", result.pricingComparisonResult)
}

func bindSalesPriceGenerationInput(c *gin.Context) (salesPriceGenerationInput, bool) {
	var input salesPriceGenerationInput
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return salesPriceGenerationInput{}, false
	}
	calculator, err := pricingadmin.NewRetailPriceCalculator(
		strings.TrimSpace(input.TotalVariableCostRate),
		strings.TrimSpace(input.EffectiveTaxRate),
		strings.TrimSpace(input.TargetNetMargin),
	)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return salesPriceGenerationInput{}, false
	}
	if _, err := calculator.SellingFactor(); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return salesPriceGenerationInput{}, false
	}
	const selectionLimit = 10000
	if len(input.ChannelModelIds) == 0 {
		common.ApiErrorMsg(c, "请至少选择一个渠道模型")
		return salesPriceGenerationInput{}, false
	}
	if len(input.ChannelModelIds) > selectionLimit {
		common.ApiErrorMsg(c, fmt.Sprintf("所选渠道模型不能超过 %d 个", selectionLimit))
		return salesPriceGenerationInput{}, false
	}
	selectedIds := make([]int, 0, len(input.ChannelModelIds))
	seen := make(map[int]struct{}, len(input.ChannelModelIds))
	for _, channelModelId := range input.ChannelModelIds {
		if channelModelId <= 0 {
			common.ApiErrorMsg(c, "channel_model_ids 包含无效值")
			return salesPriceGenerationInput{}, false
		}
		if _, exists := seen[channelModelId]; exists {
			continue
		}
		seen[channelModelId] = struct{}{}
		selectedIds = append(selectedIds, channelModelId)
	}
	return salesPriceGenerationInput{
		TotalVariableCostRate: calculator.VariableCostRate.String(),
		EffectiveTaxRate:      calculator.TaxRate.String(),
		TargetNetMargin:       calculator.TargetNetMargin.String(),
		ChannelModelIds:       selectedIds,
	}, true
}

func generateSalesPriceComparison(c *gin.Context, input salesPriceGenerationInput) (salesPriceGenerationResult, error) {
	query, err := salesPriceGeneratorQuery(c)
	if err != nil {
		return salesPriceGenerationResult{}, err
	}
	query = query.Where("channel_models.id IN ?", input.ChannelModelIds)
	const generationLimit = 10000
	var total int64
	if err := query.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return salesPriceGenerationResult{}, err
	}
	if total > generationLimit {
		return salesPriceGenerationResult{}, fmt.Errorf(
			"支持的渠道模型超过单次生成上限 %d，请先缩小渠道模型范围",
			generationLimit,
		)
	}
	var rows []channelPricingExportRow
	if err := query.
		Order("models.model_name ASC, models.id ASC, channels.name ASC, channel_models.id ASC").
		Limit(generationLimit).
		Scan(&rows).Error; err != nil {
		return salesPriceGenerationResult{}, err
	}

	generatedRows := make([]channelPricingExportRow, 0, len(rows))
	for _, row := range rows {
		purchase := model.ChannelModelPurchasePriceVersion{
			Id:                  int(row.PurchasePriceVersionId.Int64),
			ChannelModelId:      row.ChannelModelId,
			BillingMode:         row.PurchaseBillingMode,
			PricingMode:         row.PurchasePricingMode,
			PriceStructure:      row.PurchasePriceStructure,
			PriceComponents:     row.PurchasePriceComponents,
			PurchaseDiscount:    row.PurchaseDiscount,
			PurchaseBillingExpr: row.PurchaseBillingExpr,
			Currency:            row.PurchaseCurrency,
			PriceUnit:           row.PurchasePriceUnit,
		}
		preview, err := pricingadmin.BuildRetailPricePreview(
			pricingadmin.RetailDraftInput{
				ChannelModelId:         row.ChannelModelId,
				PurchasePriceVersionId: purchase.Id,
				TotalVariableCostRate:  input.TotalVariableCostRate,
				EffectiveTaxRate:       input.EffectiveTaxRate,
				TargetNetMargin:        input.TargetNetMargin,
				MinimumMarginRate:      input.TargetNetMargin,
			},
			purchase,
		)
		if err != nil {
			return salesPriceGenerationResult{}, fmt.Errorf(
				"生成模型 %s、渠道 %s 的销售价格失败: %w",
				row.ModelName,
				row.ChannelName,
				err,
			)
		}
		row.RetailPriceComponents = preview.PriceComponents
		row.RetailBillingExpr = preview.RetailBillingExpr
		row.RetailCurrency = preview.Currency
		row.TotalVariableCostRate = sql.NullString{String: input.TotalVariableCostRate, Valid: true}
		row.EffectiveTaxRate = sql.NullString{String: input.EffectiveTaxRate, Valid: true}
		row.TargetNetMargin = sql.NullString{String: input.TargetNetMargin, Valid: true}
		generatedRows = append(generatedRows, row)
	}

	return salesPriceGenerationResult{
		Rates:                   input,
		pricingComparisonResult: buildPricingComparisonResult(generatedRows),
	}, nil
}

func salesPriceGeneratorQuery(c *gin.Context) (*gorm.DB, error) {
	query, err := channelPricingExportQuery(c)
	if err != nil {
		return nil, err
	}
	return query.
		Where("channels.status = ?", common.ChannelStatusEnabled).
		Where("channel_models.status = ?", 1).
		Where("selected_purchase.id IS NOT NULL").
		Where("COALESCE(selected_purchase.price_components, '') <> ''").
		Where("COALESCE(linked_official.price_components, current_official.price_components, '') <> ''"), nil
}
