package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service/pricingruntime"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type listModelsResponse struct {
	Success bool               `json:"success"`
	Data    []dto.OpenAIModels `json:"data"`
	Object  string             `json:"object"`
}

type userModelsResponse struct {
	Success bool     `json:"success"`
	Data    []string `json:"data"`
}

func setupModelListControllerTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	initModelListColumnNames(t)

	gin.SetMode(gin.TestMode)
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	common.RedisEnabled = false

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	model.LOG_DB = db

	require.NoError(t, db.AutoMigrate(
		&model.User{},
		&model.Token{},
		&model.Channel{},
		&model.Ability{},
		&model.Model{},
		&model.Vendor{},
		&model.ChannelModel{},
		&model.OfficialModelPriceVersion{},
		&model.ModelOfficialPrice{},
		&model.ChannelModelPurchasePriceVersion{},
		&model.SalesPriceBook{},
		&model.SalesPriceBookVersion{},
		&model.SalesPriceBookItem{},
		&model.SalesPriceBookChannelModelOverride{},
		&model.SalesPriceBookDefault{},
		&model.UserPriceBookAssignment{},
		&model.RequestPricingSnapshot{},
	))

	t.Cleanup(func() {
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})

	return db
}

func initModelListColumnNames(t *testing.T) {
	t.Helper()

	originalIsMasterNode := common.IsMasterNode
	originalSQLitePath := common.SQLitePath
	originalMainDatabaseType := common.MainDatabaseType()
	originalLogDatabaseType := common.LogDatabaseType()
	originalSQLDSN, hadSQLDSN := os.LookupEnv("SQL_DSN")
	defer func() {
		common.IsMasterNode = originalIsMasterNode
		common.SQLitePath = originalSQLitePath
		common.SetDatabaseTypes(originalMainDatabaseType, originalLogDatabaseType)
		if hadSQLDSN {
			require.NoError(t, os.Setenv("SQL_DSN", originalSQLDSN))
		} else {
			require.NoError(t, os.Unsetenv("SQL_DSN"))
		}
	}()

	common.IsMasterNode = false
	common.SQLitePath = fmt.Sprintf("file:%s_init?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	require.NoError(t, os.Setenv("SQL_DSN", "local"))

	require.NoError(t, model.InitDB())
	if model.DB != nil {
		sqlDB, err := model.DB.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	}
}

func withSelfUseModeDisabled(t *testing.T) {
	t.Helper()

	original := operation_setting.SelfUseModeEnabled
	operation_setting.SelfUseModeEnabled = false
	t.Cleanup(func() {
		operation_setting.SelfUseModeEnabled = original
	})
}

func withSelfUseModeEnabled(t *testing.T) {
	t.Helper()

	original := operation_setting.SelfUseModeEnabled
	operation_setting.SelfUseModeEnabled = true
	t.Cleanup(func() {
		operation_setting.SelfUseModeEnabled = original
	})
}

type pricedModelListFixture struct {
	modelId      int
	channelId    int
	channelModel int
	modelName    string
}

func seedPricedModelListCatalog(t *testing.T, db *gorm.DB, fixtureId int, fixtures []pricedModelListFixture) {
	t.Helper()
	purchaseExpression := `v2:tier("base", p * 1 / 1000000)`
	salesExpression := `v2:tier("base", p * 2 / 1000000)`
	bookId := fixtureId
	versionId := fixtureId
	require.NoError(t, db.Create(&model.SalesPriceBook{
		Id: bookId, Code: fmt.Sprintf("test-book-%d", fixtureId), Name: "Test Price Book",
		Audience: "toc", Currency: "USD", Status: model.SalesPriceBookStatusEnabled,
		CurrentVersionId: &versionId,
	}).Error)
	require.NoError(t, db.Create(&model.SalesPriceBookVersion{
		Id: versionId, PriceBookId: bookId, Version: 1,
		Status: model.SalesPriceBookVersionStatusActive, EffectiveFrom: 1,
		TotalVariableCostRate: "0", EffectiveTaxRate: "0", MinimumMarginRate: "0.1",
	}).Error)
	require.NoError(t, db.Create(&model.SalesPriceBookDefault{
		DefaultKey: "toc_default", PriceBookId: bookId,
	}).Error)
	for index, fixture := range fixtures {
		require.NoError(t, db.Create(&model.Model{
			Id: fixture.modelId, ModelName: fixture.modelName, Status: 1,
		}).Error)
		require.NoError(t, db.Create(&model.ChannelModel{
			Id: fixture.channelModel, ChannelId: fixture.channelId, ModelId: fixture.modelId,
			UpstreamModelName: fixture.modelName, Status: 1,
		}).Error)
		require.NoError(t, db.Create(&model.ChannelModelPurchasePriceVersion{
			Id: fixtureId + index + 1, ChannelModelId: fixture.channelModel,
			BillingMode: "token", PricingMode: "fixed_unit_price", PriceStructure: "flat",
			PriceComponents: `{"input_unit_price":"1"}`, PurchaseBillingExpr: purchaseExpression,
			PurchaseExprHash:        billingexpr.ExprHashString(purchaseExpression),
			ExpressionSchemaVersion: "v2", Currency: "USD", Version: 1,
			Status: model.PricingVersionStatusActive,
		}).Error)
		require.NoError(t, db.Create(&model.SalesPriceBookItem{
			Id: fixtureId + index + 1, PriceBookVersionId: versionId, ModelId: fixture.modelId,
			Status: "enabled", BillingMode: "token", PriceStructure: "flat",
			PriceComponents: `{"input_unit_price":"2"}`, SalesBillingExpr: salesExpression,
			SalesExprHash:           billingexpr.ExprHashString(salesExpression),
			ExpressionSchemaVersion: "v2", Currency: "USD",
		}).Error)
	}
	pricingruntime.InvalidateCatalog()
	require.NoError(t, pricingruntime.RefreshCatalog())
	t.Cleanup(pricingruntime.InvalidateCatalog)
}

func decodeListModelsPayload(t *testing.T, recorder *httptest.ResponseRecorder) listModelsResponse {
	t.Helper()

	require.Equal(t, http.StatusOK, recorder.Code)
	var payload listModelsResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
	require.True(t, payload.Success)
	require.Equal(t, "list", payload.Object)
	return payload
}

func decodeListModelsResponse(t *testing.T, recorder *httptest.ResponseRecorder) map[string]struct{} {
	t.Helper()

	payload := decodeListModelsPayload(t, recorder)
	ids := make(map[string]struct{}, len(payload.Data))
	for _, item := range payload.Data {
		ids[item.Id] = struct{}{}
	}
	return ids
}

func pricingByModelName(pricings []model.Pricing) map[string]model.Pricing {
	byName := make(map[string]model.Pricing, len(pricings))
	for _, pricing := range pricings {
		byName[pricing.ModelName] = pricing
	}
	return byName
}

func decodeUserModelsResponse(t *testing.T, recorder *httptest.ResponseRecorder) []string {
	t.Helper()

	require.Equal(t, http.StatusOK, recorder.Code)
	var payload userModelsResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
	require.True(t, payload.Success)
	return payload.Data
}

func TestGetUserModelsFiltersByRequestedGroup(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.Create(&model.User{
		Id:       1002,
		Username: "playground-model-user",
		Password: "password",
		Group:    "default",
		Status:   common.UserStatusEnabled,
	}).Error)
	require.NoError(t, db.Create(&[]model.Ability{
		{Group: "default", Model: "zz-default-only-model", ChannelId: 1, Enabled: true},
		{Group: "default", Model: "zz-disabled-model", ChannelId: 1, Enabled: false},
	}).Error)

	defaultRecorder := httptest.NewRecorder()
	defaultContext, _ := gin.CreateTestContext(defaultRecorder)
	defaultContext.Request = httptest.NewRequest(http.MethodGet, "/api/user/models?group=default", nil)
	defaultContext.Set("id", 1002)

	GetUserModels(defaultContext)

	defaultModels := decodeUserModelsResponse(t, defaultRecorder)
	require.ElementsMatch(t, []string{"zz-default-only-model"}, defaultModels)

	vipRecorder := httptest.NewRecorder()
	vipContext, _ := gin.CreateTestContext(vipRecorder)
	vipContext.Request = httptest.NewRequest(http.MethodGet, "/api/user/models?group=vip", nil)
	vipContext.Set("id", 1002)

	GetUserModels(vipContext)

	require.Empty(t, decodeUserModelsResponse(t, vipRecorder))
}

func TestGetUserModelsExpandsAutoGroupsInConfiguredOrder(t *testing.T) {
	originalAutoGroups := setting.AutoGroups2JsonString()
	originalUsableGroups := setting.UserUsableGroups2JSONString()
	originalSpecialGroups := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.ReadAll()
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateAutoGroupsByJsonString(originalAutoGroups))
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalUsableGroups))
		specialGroups := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup
		specialGroups.Clear()
		specialGroups.AddAll(originalSpecialGroups)
	})

	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`["vip","default","unavailable"]`))
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"auto":"自动分组","default":"默认分组","unavailable":"不可用分组"}`))
	specialGroups := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup
	specialGroups.Clear()
	specialGroups.Set("default", map[string]string{
		"+:vip":         "VIP 分组",
		"-:unavailable": "",
	})

	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.Create(&model.User{
		Id:       1003,
		Username: "playground-auto-model-user",
		Password: "password",
		Group:    "default",
		Status:   common.UserStatusEnabled,
	}).Error)
	require.NoError(t, db.Create(&[]model.Ability{
		{Group: "vip", Model: "zz-vip-model", ChannelId: 1, Enabled: true},
		{Group: "vip", Model: "zz-shared-model", ChannelId: 1, Enabled: true},
		{Group: "default", Model: "zz-default-model", ChannelId: 1, Enabled: true},
		{Group: "default", Model: "zz-shared-model", ChannelId: 2, Enabled: true},
		{Group: "unavailable", Model: "zz-unavailable-model", ChannelId: 1, Enabled: true},
	}).Error)

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/user/models?group=auto", nil)
	context.Set("id", 1003)

	GetUserModels(context)

	models := decodeUserModelsResponse(t, recorder)
	require.Len(t, models, 3)
	assert.ElementsMatch(t, []string{"zz-vip-model", "zz-shared-model"}, models[:2])
	assert.Equal(t, "zz-default-model", models[2])
}

func TestListModelsIncludesModelWithPurchaseAndSalesPricing(t *testing.T) {
	withSelfUseModeDisabled(t)
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.Create(&model.User{
		Id:       1004,
		Username: "priced-model-list-user",
		Password: "password",
		Group:    "default",
		Status:   common.UserStatusEnabled,
	}).Error)
	require.NoError(t, db.Create(&model.Model{
		Id: 801, ModelName: "zz-priced-model", Status: 1,
	}).Error)
	require.NoError(t, db.Create(&model.Channel{
		Id: 801, Name: "priced-channel", Type: constant.ChannelTypeOpenAI,
		Status: common.ChannelStatusEnabled,
	}).Error)
	require.NoError(t, db.Create(&model.Ability{
		Group: "default", Model: "zz-priced-model", ChannelId: 801, Enabled: true,
	}).Error)
	require.NoError(t, db.Create(&model.ChannelModel{
		Id: 801, ChannelId: 801, ModelId: 801, UpstreamModelName: "zz-priced-model",
		Status: 1,
	}).Error)
	purchaseExpression := `v2:tier("base", p * 1 / 1000000)`
	salesExpression := `v2:tier("base", p * 2 / 1000000)`
	require.NoError(t, db.Create(&model.ChannelModelPurchasePriceVersion{
		Id: 801, ChannelModelId: 801, BillingMode: "token",
		PricingMode: "fixed_unit_price", PriceStructure: "flat", PriceComponents: `{"input_unit_price":"1"}`,
		PurchaseBillingExpr:     purchaseExpression,
		PurchaseExprHash:        billingexpr.ExprHashString(purchaseExpression),
		ExpressionSchemaVersion: "v2", Currency: "USD", Version: 1,
		Status: model.PricingVersionStatusActive,
	}).Error)
	currentVersionID := 801
	require.NoError(t, db.Create(&model.SalesPriceBook{
		Id: 801, Code: "toc-default", Name: "TOC Default", Audience: "toc",
		Currency: "USD", Status: model.SalesPriceBookStatusEnabled,
		CurrentVersionId: &currentVersionID,
	}).Error)
	require.NoError(t, db.Create(&model.SalesPriceBookVersion{
		Id: 801, PriceBookId: 801, Version: 1,
		Status:                model.SalesPriceBookVersionStatusActive,
		TotalVariableCostRate: "0", EffectiveTaxRate: "0",
		MinimumMarginRate: "0.1", TargetNetMargin: "0.2",
		EffectiveFrom: 1,
	}).Error)
	require.NoError(t, db.Create(&model.SalesPriceBookItem{
		Id: 801, PriceBookVersionId: 801, ModelId: 801, Status: "enabled",
		BillingMode: "token", PriceStructure: "flat",
		PriceComponents:  `{"input_unit_price":"2"}`,
		SalesBillingExpr: salesExpression, SalesExprHash: billingexpr.ExprHashString(salesExpression),
		ExpressionSchemaVersion: "v2", Currency: "USD",
	}).Error)
	require.NoError(t, db.Create(&model.SalesPriceBookDefault{
		DefaultKey: "toc_default", PriceBookId: 801,
	}).Error)

	pricingruntime.InvalidateCatalog()
	require.NoError(t, pricingruntime.RefreshCatalog())
	t.Cleanup(pricingruntime.InvalidateCatalog)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/v1/models", nil)
	ctx.Set("id", 1004)

	ListModels(ctx, constant.ChannelTypeOpenAI)

	ids := decodeListModelsResponse(t, recorder)
	require.Contains(t, ids, "zz-priced-model")
}

func TestListModelsOnlyAdvertisesModelsInUsersAssignedTOBPriceBook(t *testing.T) {
	withSelfUseModeDisabled(t)
	db := setupModelListControllerTestDB(t)
	const userId = 1104
	require.NoError(t, db.Create(&model.User{
		Id: userId, Username: "tob-model-list-user", Password: "password",
		Group: "default", Status: common.UserStatusEnabled,
	}).Error)
	require.NoError(t, db.Create(&model.Channel{
		Id: 1104, Name: "tob-priced-channel", Type: constant.ChannelTypeOpenAI,
		Status: common.ChannelStatusEnabled, Group: "default",
	}).Error)
	require.NoError(t, db.Create(&[]model.Ability{
		{Group: "default", Model: "zz-tob-included", ChannelId: 1104, Enabled: true},
		{Group: "default", Model: "zz-tob-not-quoted", ChannelId: 1104, Enabled: true},
	}).Error)
	seedPricedModelListCatalog(t, db, 1900, []pricedModelListFixture{
		{modelId: 1901, channelId: 1104, channelModel: 1901, modelName: "zz-tob-included"},
		{modelId: 1902, channelId: 1104, channelModel: 1902, modelName: "zz-tob-not-quoted"},
	})

	tobVersionId := 1951
	require.NoError(t, db.Create(&model.SalesPriceBook{
		Id: 1950, Code: "assigned-tob", Name: "Assigned TOB", Audience: "tob",
		Currency: "USD", Status: model.SalesPriceBookStatusEnabled,
		CurrentVersionId: &tobVersionId,
	}).Error)
	require.NoError(t, db.Create(&model.SalesPriceBookVersion{
		Id: tobVersionId, PriceBookId: 1950, Version: 1,
		Status: model.SalesPriceBookVersionStatusActive, EffectiveFrom: 1,
		TotalVariableCostRate: "0", EffectiveTaxRate: "0", MinimumMarginRate: "0",
	}).Error)
	require.NoError(t, db.Create(&model.SalesPriceBookItem{
		Id: 1952, PriceBookVersionId: tobVersionId, ModelId: 1901,
		Status: "enabled", BillingMode: "token", PriceStructure: "flat",
		PriceComponents:         `{"input_unit_price":"2"}`,
		SalesBillingExpr:        `v2:tier("base", p * 2 / 1000000)`,
		SalesExprHash:           billingexpr.ExprHashString(`v2:tier("base", p * 2 / 1000000)`),
		ExpressionSchemaVersion: "v2", Currency: "USD",
	}).Error)
	require.NoError(t, db.Create(&model.UserPriceBookAssignment{
		Id: 1953, UserId: userId, PriceBookId: 1950,
		VersionPolicy: "follow_current", Status: model.PriceBookAssignmentStatusActive,
		EffectiveFrom: 1,
	}).Error)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/v1/models", nil)
	ctx.Set("id", userId)

	ListModels(ctx, constant.ChannelTypeOpenAI)

	ids := decodeListModelsResponse(t, recorder)
	assert.Equal(t, map[string]struct{}{"zz-tob-included": {}}, ids)
}

func TestListModelsUsesAdvancedCustomEndpointTypesFromPricingCache(t *testing.T) {
	withSelfUseModeEnabled(t)
	db := setupModelListControllerTestDB(t)

	originalMemoryCacheEnabled := common.MemoryCacheEnabled
	common.MemoryCacheEnabled = true
	t.Cleanup(func() {
		common.MemoryCacheEnabled = originalMemoryCacheEnabled
		model.InvalidatePricingCache()
	})

	require.NoError(t, db.Create(&model.User{
		Id:       1003,
		Username: "advanced-custom-model-list-user",
		Password: "password",
		Group:    "default",
		Status:   common.UserStatusEnabled,
	}).Error)

	channel := &model.Channel{
		Id:     701,
		Type:   constant.ChannelTypeAdvancedCustom,
		Key:    "advanced-custom-key",
		Status: common.ChannelStatusEnabled,
		Name:   "advanced-custom-channel",
		Group:  "default",
		Models: "gemini-3.5-flash",
	}
	channel.SetOtherSettings(dto.ChannelOtherSettings{
		AdvancedCustom: &dto.AdvancedCustomConfig{
			Routes: []dto.AdvancedCustomRoute{
				{
					IncomingPath: "/v1/chat/completions",
					UpstreamPath: "/v1/chat/completions",
				},
				{
					IncomingPath: "/v1/responses",
					UpstreamPath: "/v1beta/models/{model}:generateContent",
					Converter:    "openai_responses_to_gemini_generate_content",
					Models:       []string{"re:^gemini-"},
				},
			},
		},
	})
	require.NoError(t, db.Create(channel).Error)
	require.NoError(t, db.Create(&model.Ability{
		Group:     "default",
		Model:     "gemini-3.5-flash",
		ChannelId: 701,
		Enabled:   true,
	}).Error)
	seedPricedModelListCatalog(t, db, 1701, []pricedModelListFixture{{
		modelId: 1701, channelId: 701, channelModel: 1701,
		modelName: "gemini-3.5-flash",
	}})

	model.InitChannelCache()
	model.GetPricing()

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/v1/models", nil)
	ctx.Set("id", 1003)

	ListModels(ctx, constant.ChannelTypeOpenAI)

	payload := decodeListModelsPayload(t, recorder)
	require.Len(t, payload.Data, 1)
	require.Equal(t, "gemini-3.5-flash", payload.Data[0].Id)
	require.Equal(t, []constant.EndpointType{
		constant.EndpointTypeOpenAI,
		constant.EndpointTypeOpenAIResponse,
	}, payload.Data[0].SupportedEndpointTypes)
}

func TestListModelsTokenLimitUsesResolvedCustomAutoGroups(t *testing.T) {
	withSelfUseModeEnabled(t)
	originalMax := setting.GetMaxTokenAutoGroups()
	originalUsableGroups := setting.UserUsableGroups2JSONString()
	originalRatios := ratio_setting.GroupRatio2JSONString()
	require.NoError(t, setting.UpdateMaxTokenAutoGroups("5"))
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default","vip":"VIP"}`))
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"vip":1}`))
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateMaxTokenAutoGroups(fmt.Sprintf("%d", originalMax)))
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalUsableGroups))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalRatios))
	})

	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.Create(&model.Channel{
		Id: 1, Name: "auto-group-channel", Type: constant.ChannelTypeOpenAI,
		Status: common.ChannelStatusEnabled, Group: "vip,default",
	}).Error)
	require.NoError(t, db.Create(&[]model.Ability{
		{Group: "vip", Model: "zz-vip-allowed", ChannelId: 1, Enabled: true},
		{Group: "vip", Model: "zz-vip-denied", ChannelId: 1, Enabled: true},
		{Group: "default", Model: "zz-default-outside-snapshot", ChannelId: 1, Enabled: true},
	}).Error)
	seedPricedModelListCatalog(t, db, 1800, []pricedModelListFixture{
		{modelId: 1801, channelId: 1, channelModel: 1801, modelName: "zz-vip-allowed"},
		{modelId: 1802, channelId: 1, channelModel: 1802, modelName: "zz-vip-denied"},
		{modelId: 1803, channelId: 1, channelModel: 1803, modelName: "zz-default-outside-snapshot"},
	})

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/v1/models", nil)
	common.SetContextKey(ctx, constant.ContextKeyUserGroup, "default")
	common.SetContextKey(ctx, constant.ContextKeyTokenGroup, "auto")
	common.SetContextKey(ctx, constant.ContextKeyTokenAutoGroups, []string{"vip"})
	common.SetContextKey(ctx, constant.ContextKeyTokenModelLimitEnabled, true)
	common.SetContextKey(ctx, constant.ContextKeyTokenModelLimit, map[string]bool{
		"zz-vip-allowed":              true,
		"zz-default-outside-snapshot": true,
		"zz-not-enabled":              true,
	})

	ListModels(ctx, constant.ChannelTypeOpenAI)
	ids := decodeListModelsResponse(t, recorder)
	require.Equal(t, map[string]struct{}{"zz-vip-allowed": {}}, ids)

	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default"}`))
	emptyRecorder := httptest.NewRecorder()
	emptyCtx, _ := gin.CreateTestContext(emptyRecorder)
	emptyCtx.Request = httptest.NewRequest(http.MethodGet, "/v1/models", nil)
	common.SetContextKey(emptyCtx, constant.ContextKeyUserGroup, "default")
	common.SetContextKey(emptyCtx, constant.ContextKeyTokenGroup, "auto")
	common.SetContextKey(emptyCtx, constant.ContextKeyTokenAutoGroups, []string{"vip"})
	common.SetContextKey(emptyCtx, constant.ContextKeyTokenModelLimitEnabled, true)
	common.SetContextKey(emptyCtx, constant.ContextKeyTokenModelLimit, map[string]bool{"zz-vip-allowed": true})

	require.NotPanics(t, func() {
		ListModels(emptyCtx, constant.ChannelTypeAnthropic)
	})
	var anthropicResponse struct {
		Data    []dto.AnthropicModel `json:"data"`
		FirstID string               `json:"first_id"`
		LastID  string               `json:"last_id"`
	}
	require.NoError(t, common.Unmarshal(emptyRecorder.Body.Bytes(), &anthropicResponse))
	require.Empty(t, anthropicResponse.Data)
	require.Empty(t, anthropicResponse.FirstID)
	require.Empty(t, anthropicResponse.LastID)
}

func TestCheckUpdatePasswordRequiresCurrentPassword(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	hashedPassword, err := common.Password2Hash("CurrentPassword123")
	require.NoError(t, err)
	user := &model.User{
		Username: "password-user",
		Password: hashedPassword,
		Status:   common.UserStatusEnabled,
	}
	require.NoError(t, db.Create(user).Error)

	updatePassword, err := checkUpdatePassword("", "", user.Id)
	require.NoError(t, err)
	assert.False(t, updatePassword)

	updatePassword, err = checkUpdatePassword("", "NewPassword123", user.Id)
	require.Error(t, err)
	assert.False(t, updatePassword)
	assert.ErrorIs(t, err, errOriginalPasswordFail)

	updatePassword, err = checkUpdatePassword("CurrentPassword123", "NewPassword123", user.Id)
	require.NoError(t, err)
	assert.True(t, updatePassword)
}

func TestCheckUpdatePasswordRejectsHistoricalEmptyPassword(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	user := &model.User{
		Username: "legacy-passwordless-user",
		Password: "",
		Status:   common.UserStatusEnabled,
	}
	require.NoError(t, db.Create(user).Error)

	updatePassword, err := checkUpdatePassword("", "NewPassword123", user.Id)
	require.Error(t, err)
	assert.False(t, updatePassword)
	assert.ErrorIs(t, err, errUserPasswordUnset)
}

func TestSetupLoginDoesNotTouchPasswordWhenPasswordFieldOmitted(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.Log{}, &model.UserSession{}))

	hashedPassword, err := common.Password2Hash("CurrentPassword123")
	require.NoError(t, err)
	user := &model.User{
		Username: "twofa-user",
		Password: hashedPassword,
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		Group:    "default",
	}
	require.NoError(t, db.Create(user).Error)

	router := gin.New()
	router.GET("/", func(c *gin.Context) {
		setupLogin(&model.User{
			Id:       user.Id,
			Username: user.Username,
			Role:     user.Role,
			Status:   user.Status,
			Group:    user.Group,
		}, c)
	})

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	router.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			User struct {
				HasPassword      bool `json:"has_password"`
				UsernameEditable bool `json:"username_editable"`
			} `json:"user"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success, recorder.Body.String())
	assert.True(t, response.Data.User.HasPassword)
	assert.False(t, response.Data.User.UsernameEditable)
	var stored model.User
	require.NoError(t, db.First(&stored, user.Id).Error)
	assert.Equal(t, hashedPassword, stored.Password)
}
