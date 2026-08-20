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
	"encoding/csv"
	"net/http"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSalesPriceGeneratorListsGeneratesAndExportsSupportedChannelModels(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 201, ModelName: "+generated-model"}).Error)
	require.NoError(t, model.DB.Create([]model.Channel{
		{Id: 202, Name: "=channel-a", Status: common.ChannelStatusEnabled},
		{Id: 203, Name: "channel-b", Status: common.ChannelStatusEnabled},
	}).Error)
	require.NoError(t, model.DB.Create([]model.ChannelModel{
		{
			Id: 204, ChannelId: 202, ModelId: 201, UpstreamModelName: "upstream-a",
			Status: 1, RuntimeMode: "v2",
		},
		{
			Id: 205, ChannelId: 203, ModelId: 201, UpstreamModelName: "upstream-b",
			Status: 1, RuntimeMode: "v2",
		},
	}).Error)
	official := model.OfficialModelPriceVersion{
		Id: 206, ModelId: 201, BillingMode: "token", PriceStructure: "flat",
		PriceComponents: `{"input_unit_price":"2.5","output_unit_price":"15"}`,
		BillingExpr:     `v2:(p * 2.5 + c * 15) / 1000000`,
		Currency:        "USD", Version: 1, Status: model.PricingVersionStatusActive,
	}
	require.NoError(t, model.DB.Create(&official).Error)
	require.NoError(t, model.DB.Create(&model.ModelOfficialPrice{
		ModelId: 201, CurrentRevisionId: official.Id,
	}).Error)
	require.NoError(t, model.DB.Create([]model.ChannelModelPurchasePriceVersion{
		{
			Id: 207, ChannelModelId: 204, OfficialPriceVersionId: &official.Id,
			BillingMode: "token", PricingMode: "official_ratio", PriceStructure: "flat",
			PriceComponents:     `{"input_unit_price":"1.5","output_unit_price":"9"}`,
			PurchaseDiscount:    "0.6",
			PurchaseBillingExpr: `v2:(p * 1.5 + c * 9) / 1000000`,
			Currency:            "USD", Version: 1, Status: model.PricingVersionStatusActive,
		},
		{
			Id: 208, ChannelModelId: 205, OfficialPriceVersionId: &official.Id,
			BillingMode: "token", PricingMode: "component_ratio", PriceStructure: "flat",
			PriceComponents:     `{"input_unit_price":"1.25","output_unit_price":"11.25"}`,
			QuoteSpec:           `{"input_discount":"0.5","output_discount":"0.75"}`,
			PurchaseBillingExpr: `v2:(p * 1.25 + c * 11.25) / 1000000`,
			Currency:            "USD", Version: 1, Status: model.PricingVersionStatusActive,
		},
	}).Error)

	context, recorder := newPricingAdminJSONContext(
		t,
		http.MethodGet,
		"/api/pricing-admin/sales-price-generator/channel-models",
		nil,
	)
	AdminListSalesPriceGeneratorChannelModels(context)
	var listResponse struct {
		Success bool `json:"success"`
		Data    struct {
			Items    []salesPriceGeneratorSourceItem `json:"items"`
			Total    int                             `json:"total"`
			PageSize int                             `json:"page_size"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &listResponse))
	require.True(t, listResponse.Success)
	assert.Equal(t, 2, listResponse.Data.Total)
	assert.Equal(t, 200, listResponse.Data.PageSize)
	require.Len(t, listResponse.Data.Items, 2)
	assert.Equal(t, "6折（官方价的60%）", listResponse.Data.Items[0].PurchaseDiscount)

	context, recorder = newPricingAdminJSONContext(
		t,
		http.MethodGet,
		"/api/pricing-admin/sales-price-generator/channel-models?channel_id=202&runtime_mode=v2",
		nil,
	)
	AdminListSalesPriceGeneratorChannelModels(context)
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &listResponse))
	require.True(t, listResponse.Success)
	assert.Equal(t, 1, listResponse.Data.Total)
	require.Len(t, listResponse.Data.Items, 1)
	assert.Equal(t, "=channel-a", listResponse.Data.Items[0].ChannelName)

	input := salesPriceGenerationInput{
		TotalVariableCostRate: "0.11",
		EffectiveTaxRate:      "0.16",
		TargetNetMargin:       "0.03",
	}
	context, recorder = newPricingAdminJSONContext(
		t,
		http.MethodPost,
		"/api/pricing-admin/sales-price-generator/generate",
		input,
	)
	AdminGenerateSalesPrices(context)
	var generationResponse struct {
		Success bool                       `json:"success"`
		Data    salesPriceGenerationResult `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &generationResponse))
	require.False(t, generationResponse.Success)

	input.ChannelModelIds = []int{204, 205}
	context, recorder = newPricingAdminJSONContext(
		t,
		http.MethodPost,
		"/api/pricing-admin/sales-price-generator/generate",
		input,
	)
	AdminGenerateSalesPrices(context)
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &generationResponse))
	require.True(t, generationResponse.Success)
	assert.Equal(t, input, generationResponse.Data.Rates)
	assert.Equal(t, 2, generationResponse.Data.MaximumChannelCount)
	require.Len(t, generationResponse.Data.Items, 1)
	generated := generationResponse.Data.Items[0]
	assert.Equal(t, "+generated-model", generated.ModelName)
	assert.Equal(t, "VCR 11%；TR 16%；TM 3%", generated.EffectiveRateDetails)
	assert.Equal(t, "5折（50%）", generated.MinimumPurchaseDiscount)
	assert.NotEmpty(t, generated.MinimumRetailDiscount)
	require.Len(t, generated.Channels, 2)
	assert.NotEmpty(t, generated.Channels[0].RetailDiscount)
	assert.NotEmpty(t, generated.Channels[1].RetailDiscount)

	context, recorder = newPricingAdminJSONContext(
		t,
		http.MethodPost,
		"/api/pricing-admin/sales-price-generator/generate?channel_id=202&runtime_mode=v2",
		input,
	)
	AdminGenerateSalesPrices(context)
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &generationResponse))
	require.True(t, generationResponse.Success)
	assert.Equal(t, 1, generationResponse.Data.MaximumChannelCount)
	require.Len(t, generationResponse.Data.Items, 1)
	require.Len(t, generationResponse.Data.Items[0].Channels, 1)
	assert.Equal(t, "=channel-a", generationResponse.Data.Items[0].Channels[0].ChannelName)

	selectedInput := input
	selectedInput.ChannelModelIds = []int{205}
	context, recorder = newPricingAdminJSONContext(
		t,
		http.MethodPost,
		"/api/pricing-admin/sales-price-generator/generate",
		selectedInput,
	)
	AdminGenerateSalesPrices(context)
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &generationResponse))
	require.True(t, generationResponse.Success)
	assert.Equal(t, 1, generationResponse.Data.MaximumChannelCount)
	require.Len(t, generationResponse.Data.Items, 1)
	require.Len(t, generationResponse.Data.Items[0].Channels, 1)
	assert.Equal(t, 205, generationResponse.Data.Items[0].Channels[0].ChannelModelId)

	context, recorder = newPricingAdminJSONContext(
		t,
		http.MethodPost,
		"/api/pricing-admin/sales-price-generator/export",
		input,
	)
	AdminExportGeneratedSalesPrices(context)
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Header().Get("Content-Disposition"), "generated-sales-prices-")
	records, err := csv.NewReader(strings.NewReader(recorder.Body.String())).ReadAll()
	require.NoError(t, err)
	require.Len(t, records, 2)
	assert.Equal(t, []string{
		"\ufeff模型名称",
		"生效费率详情（变动成本率VCR，利得税率TR，目标净利率TM）",
		"最低销售折扣",
		"最低采购折扣",
		"渠道A名称", "渠道A采购折扣", "渠道A售出折扣",
		"渠道B名称", "渠道B采购折扣", "渠道B售出折扣",
	}, records[0])
	assert.Equal(t, "'+generated-model", records[1][0])
	assert.Equal(t, "'=channel-a", records[1][4])
	assert.Equal(t, "VCR 11%；TR 16%；TM 3%", records[1][1])

	overriddenInput := input
	overriddenInput.ModelRates = []salesPriceModelRateInput{
		{ModelId: 201, TotalVariableCostRate: "0.15", EffectiveTaxRate: "0.16", TargetNetMargin: "0.03"},
	}
	context, recorder = newPricingAdminJSONContext(
		t,
		http.MethodPost,
		"/api/pricing-admin/sales-price-generator/generate",
		overriddenInput,
	)
	AdminGenerateSalesPrices(context)
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &generationResponse))
	require.True(t, generationResponse.Success)
	require.Len(t, generationResponse.Data.Items, 1)
	assert.Equal(
		t,
		"VCR 15%；TR 16%；TM 3%",
		generationResponse.Data.Items[0].EffectiveRateDetails,
	)

	context, recorder = newPricingAdminJSONContext(
		t,
		http.MethodPost,
		"/api/pricing-admin/sales-price-generator/export",
		overriddenInput,
	)
	AdminExportGeneratedSalesPrices(context)
	assert.Equal(t, http.StatusOK, recorder.Code)
	records, err = csv.NewReader(strings.NewReader(recorder.Body.String())).ReadAll()
	require.NoError(t, err)
	require.Len(t, records, 2)
	assert.Equal(t, "VCR 15%；TR 16%；TM 3%", records[1][1])

	invalidModelRatesInput := input
	invalidModelRatesInput.ModelRates = []salesPriceModelRateInput{
		{ModelId: -1, TotalVariableCostRate: "0.15", EffectiveTaxRate: "0.16", TargetNetMargin: "0.03"},
	}
	context, recorder = newPricingAdminJSONContext(
		t,
		http.MethodPost,
		"/api/pricing-admin/sales-price-generator/generate",
		invalidModelRatesInput,
	)
	AdminGenerateSalesPrices(context)
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &generationResponse))
	require.False(t, generationResponse.Success)
}
