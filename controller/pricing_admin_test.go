package controller

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
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
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	require.NoError(t, db.AutoMigrate(
		&model.Channel{},
		&model.Model{},
		&model.ChannelModel{},
		&model.OfficialModelPriceVersion{},
		&model.ChannelModelPurchasePriceVersion{},
		&model.ChannelModelRetailPriceVersion{},
		&model.RequestPricingSnapshot{},
	))
	t.Cleanup(func() {
		model.DB = originalDB
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

	context, recorder := newPricingAdminJSONContext(
		t,
		http.MethodPost,
		"/api/pricing-admin/drafts/official-flat",
		pricingadmin.OfficialFlatDraftInput{
			ModelId:  51,
			Currency: "USD",
			Prices: pricingadmin.FlatTokenPriceInput{
				InputUnitPrice:  "1.25",
				OutputUnitPrice: "10",
			},
		},
	)
	AdminCreateOfficialFlatPriceDraft(context)
	assert.Equal(t, http.StatusOK, recorder.Code)

	var response struct {
		Success bool                            `json:"success"`
		Data    model.OfficialModelPriceVersion `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.True(t, response.Success)
	assert.Contains(t, response.Data.BillingExpr, "p * 1.25")
	assert.Contains(t, response.Data.BillingExpr, "c * 10")
	assert.NotEmpty(t, response.Data.ExprHash)
	assert.Equal(t, model.PricingVersionStatusDraft, response.Data.Status)
}

func TestAdminUpdateChannelModelRejectsIdentityMutation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	require.NoError(t, model.DB.Create(&model.Channel{Id: 61, Name: "channel-a"}).Error)
	require.NoError(t, model.DB.Create(&model.Channel{Id: 62, Name: "channel-b"}).Error)
	require.NoError(t, model.DB.Create(&model.Model{Id: 63, ModelName: "identity-model"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 64, ChannelId: 61, ModelId: 63, UpstreamModelName: "identity-model",
		Status: 1, RuntimeMode: "legacy",
	}).Error)
	context, recorder := newPricingAdminJSONContext(
		t,
		http.MethodPut,
		"/api/pricing-admin/channel-models/64",
		model.ChannelModel{
			ChannelId: 62, ModelId: 63, UpstreamModelName: "identity-model",
			Status: 1, RuntimeMode: "legacy",
		},
	)
	context.Params = gin.Params{{Key: "id", Value: "64"}}
	AdminUpdateChannelModel(context)
	var response struct {
		Success bool `json:"success"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.False(t, response.Success)

	var stored model.ChannelModel
	require.NoError(t, model.DB.First(&stored, 64).Error)
	assert.Equal(t, 61, stored.ChannelId)
}

func TestAdminListPricingCatalogOptionsOnlyReturnsModelsConfiguredOnChannel(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	modelMapping := `{"configured-model":"provider-configured-model"}`
	require.NoError(t, model.DB.Create(&model.Channel{
		Id:           71,
		Name:         "configured-channel",
		Models:       "configured-model",
		ModelMapping: &modelMapping,
	}).Error)
	require.NoError(t, model.DB.Create([]model.Model{
		{Id: 72, ModelName: "configured-model"},
		{Id: 73, ModelName: "unconfigured-model"},
	}).Error)

	context, recorder := newPricingAdminJSONContext(
		t,
		http.MethodGet,
		"/api/pricing-admin/catalog-options?channel_id=71",
		nil,
	)
	AdminListPricingCatalogOptions(context)

	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Models []pricingAdminCatalogOption `json:"models"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.Len(t, response.Data.Models, 1)
	assert.Equal(t, 72, response.Data.Models[0].Id)
	assert.Equal(t, "configured-model", response.Data.Models[0].Name)
	assert.Equal(t, "provider-configured-model", response.Data.Models[0].UpstreamModelName)
}

func TestAdminCreateChannelModelRejectsModelNotConfiguredOnChannel(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	require.NoError(t, model.DB.Create(&model.Channel{
		Id: 81, Name: "restricted-channel", Models: "allowed-model",
	}).Error)
	require.NoError(t, model.DB.Create([]model.Model{
		{Id: 82, ModelName: "allowed-model"},
		{Id: 83, ModelName: "blocked-model"},
	}).Error)

	context, recorder := newPricingAdminJSONContext(
		t,
		http.MethodPost,
		"/api/pricing-admin/channel-models",
		model.ChannelModel{
			ChannelId:         81,
			ModelId:           83,
			UpstreamModelName: "blocked-model",
		},
	)
	AdminCreateChannelModel(context)

	var response struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.False(t, response.Success)
	assert.Contains(t, response.Message, "未在渠道编辑中配置")

	var count int64
	require.NoError(t, model.DB.Model(&model.ChannelModel{}).Count(&count).Error)
	assert.Zero(t, count)
}

func TestAdminListChannelModelsReturnsAndFiltersActiveRetailPriceStatus(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	require.NoError(t, model.DB.Create(&model.Channel{
		Id: 91, Name: "pricing-status-channel",
	}).Error)
	require.NoError(t, model.DB.Create([]model.Model{
		{Id: 92, ModelName: "published-retail-model"},
		{Id: 93, ModelName: "draft-only-retail-model"},
	}).Error)
	require.NoError(t, model.DB.Create([]model.ChannelModel{
		{
			Id: 94, ChannelId: 91, ModelId: 92, UpstreamModelName: "published-retail-model",
			Status: 1, RuntimeMode: "legacy",
		},
		{
			Id: 95, ChannelId: 91, ModelId: 93, UpstreamModelName: "draft-only-retail-model",
			Status: 1, RuntimeMode: "legacy",
		},
	}).Error)
	require.NoError(t, model.DB.Create([]model.ChannelModelRetailPriceVersion{
		{
			Id: 96, ChannelModelId: 94, PurchasePriceVersionId: 1,
			BillingMode: "token", PriceStructure: "flat",
			RetailBillingExpr: "v2:p / 1000000", RetailExprHash: "active",
			ExpressionSource: "generated", ExpressionSchemaVersion: "v2",
			Currency: "USD", Version: 3, Status: model.PricingVersionStatusActive,
		},
		{
			Id: 97, ChannelModelId: 95, PurchasePriceVersionId: 2,
			BillingMode: "token", PriceStructure: "flat",
			RetailBillingExpr: "v2:p / 1000000", RetailExprHash: "draft",
			ExpressionSource: "generated", ExpressionSchemaVersion: "v2",
			Currency: "USD", Version: 1, Status: model.PricingVersionStatusDraft,
		},
	}).Error)

	list := func(path string) []channelModelAdminRow {
		context, recorder := newPricingAdminJSONContext(t, http.MethodGet, path, nil)
		AdminListChannelModels(context)
		var response struct {
			Success bool `json:"success"`
			Data    struct {
				Items []channelModelAdminRow `json:"items"`
			} `json:"data"`
		}
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
		require.True(t, response.Success)
		return response.Data.Items
	}

	allRows := list("/api/pricing-admin/channel-models")
	require.Len(t, allRows, 2)
	assert.Equal(t, 96, allRows[1].ActiveRetailPriceVersionId)
	assert.EqualValues(t, 3, allRows[1].ActiveRetailPriceVersion)
	assert.Zero(t, allRows[0].ActiveRetailPriceVersionId)
	assert.Zero(t, allRows[0].ActiveRetailPriceVersion)

	publishedRows := list("/api/pricing-admin/channel-models?retail_status=published")
	require.Len(t, publishedRows, 1)
	assert.Equal(t, 94, publishedRows[0].Id)

	unpublishedRows := list("/api/pricing-admin/channel-models?retail_status=unpublished")
	require.Len(t, unpublishedRows, 1)
	assert.Equal(t, 95, unpublishedRows[0].Id)
}

func TestAdminListRequestPricingSnapshotsFiltersPendingReconciliation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	require.NoError(t, model.DB.Create(&model.Channel{
		Id: 101, Name: "audit-channel",
	}).Error)
	require.NoError(t, model.DB.Create(&model.Model{
		Id: 102, ModelName: "audit-video-model",
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 103, ChannelId: 101, ModelId: 102, UpstreamModelName: "audit-video-model",
		Status: 1, RuntimeMode: "v2",
	}).Error)
	require.NoError(t, model.DB.Create([]model.RequestPricingSnapshot{
		{
			RequestId: "request-pending", UserId: 1, ModelId: 102, ChannelModelId: 103,
			PurchasePriceVersionId: 1, RetailPriceVersionId: 2,
			BillingMode: "video_duration", ReservedQuota: 100, SettledQuota: 0,
			PurchaseCost: "0.04", RetailAmount: "0.08", Currency: "USD",
			Status: "pending",
		},
		{
			RequestId: "request-settled", UserId: 2, ModelId: 102, ChannelModelId: 103,
			PurchasePriceVersionId: 1, RetailPriceVersionId: 2,
			BillingMode: "video_duration", ReservedQuota: 100, SettledQuota: 100,
			PurchaseCost: "0.04", RetailAmount: "0.08", Currency: "USD",
			Status: "settled",
		},
	}).Error)

	context, recorder := newPricingAdminJSONContext(
		t,
		http.MethodGet,
		"/api/pricing-admin/request-pricing-snapshots?status=pending&keyword=audit-video",
		nil,
	)
	AdminListRequestPricingSnapshots(context)

	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Items []requestPricingSnapshotAdminRow `json:"items"`
			Total int64                            `json:"total"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	assert.EqualValues(t, 1, response.Data.Total)
	require.Len(t, response.Data.Items, 1)
	assert.Equal(t, "request-pending", response.Data.Items[0].RequestId)
	assert.Equal(t, "audit-video-model", response.Data.Items[0].ModelName)
	assert.Equal(t, 101, response.Data.Items[0].ChannelId)
	assert.Equal(t, "audit-channel", response.Data.Items[0].ChannelName)
}

func TestAdminListRequestPricingSnapshotsRejectsInvalidStatus(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	context, recorder := newPricingAdminJSONContext(
		t,
		http.MethodGet,
		"/api/pricing-admin/request-pricing-snapshots?status=unknown",
		nil,
	)

	AdminListRequestPricingSnapshots(context)

	var response struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.False(t, response.Success)
	assert.Contains(t, response.Message, "status")
}

func TestAdminListRequestPricingSnapshotsKeepsOrphanedAuditRowsVisible(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	require.NoError(t, model.DB.Create(&model.RequestPricingSnapshot{
		RequestId: "request-orphaned", UserId: 1, ModelId: 999, ChannelModelId: 998,
		PurchasePriceVersionId: 1, RetailPriceVersionId: 2,
		BillingMode: "mixed", ReservedQuota: 100, SettledQuota: 0,
		PurchaseCost: "0.04", RetailAmount: "0.08", Currency: "USD",
		Status: "pending",
	}).Error)
	context, recorder := newPricingAdminJSONContext(
		t,
		http.MethodGet,
		"/api/pricing-admin/request-pricing-snapshots?status=pending",
		nil,
	)

	AdminListRequestPricingSnapshots(context)

	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Items []requestPricingSnapshotAdminRow `json:"items"`
			Total int64                            `json:"total"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	assert.EqualValues(t, 1, response.Data.Total)
	require.Len(t, response.Data.Items, 1)
	assert.Equal(t, "request-orphaned", response.Data.Items[0].RequestId)
	assert.Empty(t, response.Data.Items[0].ModelName)
	assert.Zero(t, response.Data.Items[0].ChannelId)
	assert.Empty(t, response.Data.Items[0].ChannelName)
}

func TestAdminListRequestPricingSnapshotsFindsPendingAndStaleReservedRows(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	require.NoError(t, model.DB.Create(&model.Channel{
		Id: 111, Name: "reconciliation-channel",
	}).Error)
	require.NoError(t, model.DB.Create(&model.Model{
		Id: 112, ModelName: "reconciliation-model",
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 113, ChannelId: 111, ModelId: 112, UpstreamModelName: "reconciliation-model",
		Status: 1, RuntimeMode: "v2",
	}).Error)
	for index, status := range []string{"pending", "reserved", "reserved", "settled"} {
		require.NoError(t, model.DB.Create(&model.RequestPricingSnapshot{
			RequestId: fmt.Sprintf("reconciliation-%d", index),
			UserId:    1, ModelId: 112, ChannelModelId: 113,
			PurchasePriceVersionId: 1, RetailPriceVersionId: 2,
			BillingMode: "token", ReservedQuota: 100,
			PurchaseCost: "0.04", RetailAmount: "0.08", Currency: "USD",
			Status: status,
		}).Error)
	}
	require.NoError(t, model.DB.Model(&model.RequestPricingSnapshot{}).
		Where("request_id = ?", "reconciliation-1").
		Update("created_at", common.GetTimestamp()-pricingReconciliationReservedAgeSeconds-1).Error)

	context, recorder := newPricingAdminJSONContext(
		t,
		http.MethodGet,
		"/api/pricing-admin/request-pricing-snapshots?reconciliation=true",
		nil,
	)
	AdminListRequestPricingSnapshots(context)

	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Items []requestPricingSnapshotAdminRow `json:"items"`
			Total int64                            `json:"total"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	assert.EqualValues(t, 2, response.Data.Total)
	require.Len(t, response.Data.Items, 2)
	assert.Equal(t, "reconciliation-1", response.Data.Items[0].RequestId)
	assert.Equal(t, "reconciliation-0", response.Data.Items[1].RequestId)
}
