package controller

import (
	"bytes"
	"encoding/csv"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/pricingadmin"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestAdminExportRequestPricingSnapshotsIncludesOfficialListPriceAmounts(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	officialVersionId := 31
	estimatedOfficialAmount := "1.25"
	officialAmount := "1.1"
	require.NoError(t, model.DB.Create(&model.RequestPricingSnapshot{
		RequestId: "official-amount-export", UserId: 1, ModelId: 1,
		ChannelModelId: 1, PurchasePriceVersionId: 2,
		OfficialPriceVersionId:  &officialVersionId,
		EstimatedOfficialAmount: &estimatedOfficialAmount,
		OfficialAmount:          &officialAmount,
		BillingMode:             "token", PurchaseCost: "0.5", SalesAmount: "0.8",
		Currency: "USD", Status: "settled",
	}).Error)

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodGet,
		"/api/pricing-admin/request-pricing-snapshots/export",
		nil,
	)
	AdminExportRequestPricingSnapshots(context)
	require.Equal(t, http.StatusOK, recorder.Code)
	records, err := csv.NewReader(strings.NewReader(recorder.Body.String())).ReadAll()
	require.NoError(t, err)
	require.Len(t, records, 2)

	columns := make(map[string]int, len(records[0]))
	for index, column := range records[0] {
		columns[column] = index
	}
	assert.Equal(t, "31", records[1][columns["official_price_version_id"]])
	assert.Equal(t, "1.25", records[1][columns["estimated_official_amount"]])
	assert.Equal(t, "1.1", records[1][columns["official_amount"]])
}

func setupPricingAdminControllerTestDB(t *testing.T) {
	t.Helper()
	originalDB := model.DB
	originalLogDB := model.LOG_DB
	originalRedisEnabled := common.RedisEnabled
	common.RedisEnabled = false
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	model.LOG_DB = db
	require.NoError(t, db.AutoMigrate(
		&model.User{}, &model.Log{}, &model.Channel{}, &model.Ability{},
		&model.Model{}, &model.ChannelModel{}, &model.OfficialModelPriceVersion{},
		&model.ModelOfficialPrice{}, &model.ChannelModelPurchasePriceVersion{},
		&model.RequestPricingSnapshot{}, &model.PricingCircuitEvent{},
		&model.SalesPriceBook{}, &model.SalesPriceBookVersion{},
		&model.SalesPriceBookItem{}, &model.SalesPriceBookItemCostSource{},
		&model.SalesPriceBookDefault{}, &model.PricingAuditRecord{},
		&model.SalesPriceBookChannelModelOverride{},
		&model.UserPriceBookAssignment{},
	))
	t.Cleanup(func() {
		model.DB = originalDB
		model.LOG_DB = originalLogDB
		common.RedisEnabled = originalRedisEnabled
	})
}

func newPricingAdminJSONContext(t *testing.T, method string, path string, payload any) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	body, err := common.Marshal(payload)
	require.NoError(t, err)
	request := httptest.NewRequest(method, path, bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = request
	context.Set("id", 99)
	return context, recorder
}

func TestAdminCreateOfficialFlatPriceDraftBuildsServerExpression(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 51, ModelName: "controller-price-test"}).Error)
	context, recorder := newPricingAdminJSONContext(t, http.MethodPost,
		"/api/pricing-admin/drafts/official-flat", pricingadmin.OfficialFlatDraftInput{
			ModelId: 51, Currency: "USD",
			Prices: pricingadmin.FlatTokenPriceInput{InputUnitPrice: "1.25", OutputUnitPrice: "10"},
		})
	AdminCreateOfficialFlatPriceDraft(context)
	assert.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool                            `json:"success"`
		Data    model.OfficialModelPriceVersion `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.True(t, response.Success)
	assert.Contains(t, response.Data.BillingExpr, "p * 1.25")
	assert.Equal(t, model.PricingVersionStatusDraft, response.Data.Status)
}

func TestAdminListChannelModelsReturnsPublishedPurchaseStatus(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	require.NoError(t, model.DB.Create(&model.Channel{Id: 61, Name: "channel-a", Status: 1}).Error)
	require.NoError(t, model.DB.Create(&model.Model{Id: 62, ModelName: "model-a", Status: 1}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 63, ChannelId: 61, ModelId: 62, UpstreamModelName: "model-a", Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModelPurchasePriceVersion{
		Id: 64, ChannelModelId: 63, Version: 2, Status: model.PricingVersionStatusActive,
		PricingMode: "official_ratio", PurchaseDiscount: "0.85",
		BillingMode: "token", PriceStructure: "flat", Currency: "USD",
	}).Error)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet,
		"/api/pricing-admin/channel-models?purchase_status=published", nil)
	AdminListChannelModels(context)
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Items []channelModelAdminRow `json:"items"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.Len(t, response.Data.Items, 1)
	assert.Equal(t, 64, response.Data.Items[0].ActivePurchasePriceVersionId)
	assert.Equal(t, int64(2), response.Data.Items[0].ActivePurchasePriceVersion)
	assert.Equal(t, "official_ratio", response.Data.Items[0].PurchasePricingMode)
	assert.Equal(t, "0.85", response.Data.Items[0].PurchaseDiscount)
}

func TestAdminListChannelModelIdsReturnsNamesForSelectionConfirmation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	require.NoError(t, model.DB.Create(&model.Channel{Id: 65, Name: "selection-channel", Status: 1}).Error)
	require.NoError(t, model.DB.Create(&model.Model{Id: 66, ModelName: "selection-model", Status: 1}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 67, ChannelId: 65, ModelId: 66, UpstreamModelName: "upstream-selection-model", Status: 1,
	}).Error)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet,
		"/api/pricing-admin/channel-models/ids?status=1", nil)

	AdminListChannelModelIds(context)

	var response struct {
		Success bool `json:"success"`
		Data    []struct {
			Id          int    `json:"id"`
			ModelId     int    `json:"model_id"`
			ModelName   string `json:"model_name"`
			ChannelName string `json:"channel_name"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.Len(t, response.Data, 1)
	assert.Equal(t, 67, response.Data[0].Id)
	assert.Equal(t, 66, response.Data[0].ModelId)
	assert.Equal(t, "selection-model", response.Data[0].ModelName)
	assert.Equal(t, "selection-channel", response.Data[0].ChannelName)
}

func TestAdminListSalesPriceBooksUsesServerFiltersAndDefaultPageSize(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	require.NoError(t, model.DB.Create([]model.SalesPriceBook{
		{Code: "consumer", Name: "Consumer", Audience: "toc", Currency: "USD", Status: model.SalesPriceBookStatusDraft},
		{Code: "enterprise", Name: "Enterprise Contract", Audience: "tob", Currency: "USD", Status: model.SalesPriceBookStatusDraft},
	}).Error)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodGet,
		"/api/pricing-admin/price-books?keyword=contract&audience=tob&status=draft",
		nil,
	)

	AdminListSalesPriceBooks(context)

	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Items    []pricingadmin.SalesPriceBookListItem `json:"items"`
			Total    int64                                 `json:"total"`
			Page     int                                   `json:"page"`
			PageSize int                                   `json:"page_size"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	assert.Equal(t, int64(1), response.Data.Total)
	assert.Equal(t, 1, response.Data.Page)
	assert.Equal(t, 200, response.Data.PageSize)
	require.Len(t, response.Data.Items, 1)
	assert.Equal(t, "enterprise", response.Data.Items[0].Code)
}

func TestAdminExportSalesPriceBookItemsWritesSpreadsheetSafeCSV(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{
		Id: 91, ModelName: "=unsafe-model-name",
	}).Error)
	require.NoError(t, model.DB.Create(&model.SalesPriceBook{
		Id: 90, Code: "csv-export", Name: "CSV Export", Audience: "tob", Currency: "USD",
	}).Error)
	require.NoError(t, model.DB.Create(&model.SalesPriceBookVersion{
		Id: 92, PriceBookId: 90, Version: 1, Status: model.SalesPriceBookVersionStatusDraft,
		CostBasisStrategy: "max_eligible_cost", PaymentFeeRate: "0", DistributionFeeRate: "0",
		OperationsLaborRate: "0", EffectiveTaxRate: "0", TargetNetMargin: "0", MinimumMarginRate: "0",
	}).Error)
	require.NoError(t, model.DB.Create(&model.SalesPriceBookItem{
		PriceBookVersionId: 92,
		ModelId:            91,
		Status:             pricingadmin.SalesPriceItemStatusEnabled,
		BillingMode:        "token",
		PriceStructure:     "flat",
		PricingMethod:      "official_discount",
		OfficialDiscount:   "0.7504123144584937",
		PricingConfig:      `{"official_discount":"0.7504123144584937"}`,
		Currency:           "USD",
		SalesBillingExpr:   "v2:p / 1000000",
		SalesExprHash:      "hash",
	}).Error)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodGet,
		"/api/pricing-admin/price-book-versions/92/items/export",
		nil,
	)
	context.Params = gin.Params{{Key: "id", Value: "92"}}

	AdminExportSalesPriceBookItems(context)

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Header().Get("Content-Type"), "text/csv")
	assert.Contains(t, recorder.Header().Get("Content-Disposition"), "sales-price-book-version-92-items")
	body := strings.TrimPrefix(recorder.Body.String(), "\ufeff")
	assert.Contains(t, body, "模型名称,状态,计费模式,客户售价规则,统一售价取价策略,采购折扣,销售折扣,定价详情")
	assert.Contains(t, body, "'=unsafe-model-name")
	assert.Contains(t, body, "已启用,按 Token 用量,自定义计费表达式,按最高符合路由条件的渠道成本定价,—,7.5041折（官方价 × 75.0412%）")
	assert.NotContains(t, body, "官方折扣")
}

func TestAdminExportSalesPriceBookChannelModelsWritesAuditableCSV(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	require.NoError(t, model.DB.Create(&model.Channel{
		Id: 201, Name: "=unsafe-channel", Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.Model{
		Id: 202, ModelName: "channel-model-export", Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 203, ChannelId: 201, ModelId: 202,
		UpstreamModelName: "+unsafe-upstream", Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.OfficialModelPriceVersion{
		Id: 204, ModelId: 202, BillingMode: "token", PriceStructure: "flat",
		PriceComponents: `{"input_unit_price":"2","price_unit":"million_tokens"}`,
		BillingExpr:     `v2:p * 2 / 1000000`, ExprHash: "official-hash",
		ExpressionSource: "manual", ExpressionSchemaVersion: "v2", Currency: "USD",
		Source: "manual", Version: 1, Status: model.PricingVersionStatusActive, EffectiveFrom: 1,
	}).Error)
	officialPriceVersionId := 204
	purchase := model.ChannelModelPurchasePriceVersion{
		Id: 205, ChannelModelId: 203, OfficialPriceVersionId: &officialPriceVersionId,
		BillingMode: "token", PricingMode: "official_ratio", PriceStructure: "flat",
		PurchaseDiscount:    "0.7",
		PriceComponents:     `{"input_unit_price":"1.4","price_unit":"million_tokens"}`,
		PurchaseBillingExpr: `v2:p * 1.4 / 1000000`, PurchaseExprHash: "purchase-hash",
		ExpressionSource: "generated", ExpressionSchemaVersion: "v2", Currency: "USD",
		Version: 3, Status: model.PricingVersionStatusActive, EffectiveFrom: 1,
	}
	require.NoError(t, model.DB.Create(&purchase).Error)
	require.NoError(t, model.DB.Create(&model.SalesPriceBook{
		Id: 206, Code: "channel-export", Name: "Channel Export", Audience: "tob", Currency: "USD",
	}).Error)
	require.NoError(t, model.DB.Create(&model.SalesPriceBookVersion{
		Id: 207, PriceBookId: 206, Version: 4, Status: model.SalesPriceBookVersionStatusDraft,
		CostBasisStrategy: "max_eligible_cost", PaymentFeeRate: "0.04", DistributionFeeRate: "0.05",
		OperationsLaborRate: "0.02", EffectiveTaxRate: "0.165", TargetNetMargin: "0.03", MinimumMarginRate: "0.02",
	}).Error)
	item := model.SalesPriceBookItem{
		PriceBookVersionId: 207, ModelId: 202, Status: pricingadmin.SalesPriceItemStatusEnabled,
		BillingMode: "token", PriceStructure: "flat",
		PriceComponents:  `{"input_unit_price":"1.6","price_unit":"million_tokens"}`,
		SalesBillingExpr: `v2:p * 1.6 / 1000000`, SalesExprHash: "sales-hash",
		ExpressionSource: "generated", ExpressionSchemaVersion: "v2", PricingMethod: "cost_plus",
	}
	require.NoError(t, model.DB.Create(&item).Error)
	require.NoError(t, model.DB.Create(&model.SalesPriceBookItemCostSource{
		PriceBookItemId: item.Id, ChannelModelId: 203,
		PurchasePriceVersionId: 205, SourceRole: "cost_basis",
	}).Error)
	zero := "0"
	require.NoError(t, model.DB.Create(&model.SalesPriceBookChannelModelOverride{
		PriceBookVersionId: 207, ChannelModelId: 203,
		DistributionFeeRate: &zero,
	}).Error)

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodGet,
		"/api/pricing-admin/price-book-versions/207/channel-models/export",
		nil,
	)
	context.Params = gin.Params{{Key: "id", Value: "207"}}

	AdminExportSalesPriceBookChannelModels(context)

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Header().Get("Content-Disposition"), "sales-price-book-version-207-channel-models")
	body := strings.TrimPrefix(recorder.Body.String(), "\ufeff")
	assert.Contains(t, body, "报价组,报价版本,模型名称,渠道名称,渠道模型ID,上游模型名称")
	assert.Contains(t, body, "统一售价取价策略")
	assert.Contains(t, body, "'=unsafe-channel")
	assert.Contains(t, body, "'+unsafe-upstream")
	assert.Contains(t, body, "官方价统一折扣,7折（官方价的70%）,8折（官方价 × 80%）")
	assert.Contains(t, body, "4%,0%,2%,6%,16.5%,3%,2%")
	assert.Contains(t, body, "分销手续费 5% → 0%")
	assert.Contains(t, body, "纳入统一售价基准,v3 (#205),USD")
}

func TestAdminSavesChannelModelSpecialParametersForDraftVersion(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	require.NoError(t, model.DB.Create(&model.Channel{Id: 111, Name: "contract-channel"}).Error)
	require.NoError(t, model.DB.Create(&model.Model{Id: 112, ModelName: "contract-model"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 113, ChannelId: 111, ModelId: 112, UpstreamModelName: "contract-model", Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.SalesPriceBook{Id: 114, Code: "contract", Name: "Contract", Audience: "tob", Currency: "USD"}).Error)
	require.NoError(t, model.DB.Create(&model.SalesPriceBookVersion{
		Id: 115, PriceBookId: 114, Version: 1, Status: model.SalesPriceBookVersionStatusDraft,
		CostBasisStrategy: "max_eligible_cost", PaymentFeeRate: "0.04",
		DistributionFeeRate: "0.05", OperationsLaborRate: "0.02",
		TotalVariableCostRate: "0.11", EffectiveTaxRate: "0.16",
		TargetNetMargin: "0.03", MinimumMarginRate: "0.02",
	}).Error)
	zero := "0"
	context, recorder := newPricingAdminJSONContext(t, http.MethodPut,
		"/api/pricing-admin/price-book-versions/115/channel-model-overrides/113",
		model.SalesPriceBookChannelModelOverride{PaymentFeeRate: &zero},
	)
	context.Params = gin.Params{{Key: "id", Value: "115"}, {Key: "channel_model_id", Value: "113"}}

	AdminSaveSalesPriceBookChannelModelOverride(context)

	assert.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool                                     `json:"success"`
		Data    model.SalesPriceBookChannelModelOverride `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.NotNil(t, response.Data.PaymentFeeRate)
	assert.Equal(t, "0", *response.Data.PaymentFeeRate)
}

func TestAdminUpdateChannelModelRejectsIdentityMutation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	require.NoError(t, model.DB.Create([]model.Channel{{Id: 71, Name: "a"}, {Id: 72, Name: "b"}}).Error)
	require.NoError(t, model.DB.Create(&model.Model{Id: 73, ModelName: "identity-model"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 74, ChannelId: 71, ModelId: 73, UpstreamModelName: "identity-model", Status: 1,
	}).Error)
	context, recorder := newPricingAdminJSONContext(t, http.MethodPut,
		"/api/pricing-admin/channel-models/74", model.ChannelModel{
			ChannelId: 72, ModelId: 73, UpstreamModelName: "identity-model", Status: 1,
		})
	context.Params = gin.Params{{Key: "id", Value: "74"}}
	AdminUpdateChannelModel(context)
	assert.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.False(t, response.Success)
	assert.Contains(t, response.Message, "不可修改")
	var stored model.ChannelModel
	require.NoError(t, model.DB.First(&stored, 74).Error)
	assert.Equal(t, 71, stored.ChannelId)
}
