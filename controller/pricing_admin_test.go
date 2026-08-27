package controller

import (
	"bytes"
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
		&model.SalesPriceBookItem{}, &model.SalesPriceBookDefault{},
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
	require.NoError(t, model.DB.Create(&model.SalesPriceBookItem{
		PriceBookVersionId: 92,
		ModelId:            91,
		Status:             pricingadmin.SalesPriceItemStatusEnabled,
		BillingMode:        "token",
		PriceStructure:     "flat",
		PricingMethod:      "official_discount",
		OfficialDiscount:   "0.7504123144584937",
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
	assert.Contains(t, body, "模型名称,状态,计费模式,客户售价规则,采购折扣,销售折扣,定价详情")
	assert.Contains(t, body, "'=unsafe-model-name")
	assert.Contains(t, body, "已启用,按 Token 用量,自定义计费表达式,—,7.5041折（官方价 × 75.0412%）")
	assert.NotContains(t, body, "官方折扣")
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
