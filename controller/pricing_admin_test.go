package controller

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/pricingadmin"
	"github.com/QuantumNous/new-api/service/pricingruntime"
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
		&model.PricingCircuitEvent{},
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

func TestAdminUpdateChannelModelRejectsIndividualRuntimeSwitch(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	require.NoError(t, model.DB.Create(&model.Channel{Id: 65, Name: "channel-runtime"}).Error)
	require.NoError(t, model.DB.Create(&model.Model{Id: 66, ModelName: "runtime-model"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 67, ChannelId: 65, ModelId: 66, UpstreamModelName: "runtime-model",
		Status: 1, RuntimeMode: "legacy",
	}).Error)
	context, recorder := newPricingAdminJSONContext(
		t,
		http.MethodPut,
		"/api/pricing-admin/channel-models/67",
		model.ChannelModel{
			ChannelId: 65, ModelId: 66, UpstreamModelName: "runtime-model",
			Status: 1, RuntimeMode: "v2",
		},
	)
	context.Params = gin.Params{{Key: "id", Value: "67"}}

	AdminUpdateChannelModel(context)

	var response struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.False(t, response.Success)
	assert.Contains(t, response.Message, "模型级")

	var stored model.ChannelModel
	require.NoError(t, model.DB.First(&stored, 67).Error)
	assert.Equal(t, "legacy", stored.RuntimeMode)
}

func TestAdminSetPricingModelRuntimeRejectsLegacyRollback(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	context, recorder := newPricingAdminJSONContext(
		t,
		http.MethodPost,
		"/api/pricing-admin/model-runtime",
		map[string]string{
			"model_name":   "runtime-model",
			"runtime_mode": "legacy",
		},
	)

	AdminSetPricingModelRuntime(context)

	var response struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.False(t, response.Success)
	assert.Contains(t, response.Message, "不允许回退旧版")
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

func TestAdminListRequestPricingSnapshotsFiltersCreatedRange(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	require.NoError(t, model.DB.Create([]model.RequestPricingSnapshot{
		{RequestId: "before-range", UserId: 1, ModelId: 1, ChannelModelId: 1,
			BillingMode: "token", Currency: "USD", Status: "settled", CreatedAt: 100},
		{RequestId: "inside-range", UserId: 1, ModelId: 1, ChannelModelId: 1,
			BillingMode: "token", Currency: "USD", Status: "settled", CreatedAt: 200},
	}).Error)
	require.NoError(t, model.DB.Model(&model.RequestPricingSnapshot{}).
		Where("request_id = ?", "before-range").
		Update("created_at", 100).Error)
	require.NoError(t, model.DB.Model(&model.RequestPricingSnapshot{}).
		Where("request_id = ?", "inside-range").
		Update("created_at", 200).Error)
	context, recorder := newPricingAdminJSONContext(
		t, http.MethodGet,
		"/api/pricing-admin/request-pricing-snapshots?created_from=150&created_to=250",
		nil,
	)

	AdminListRequestPricingSnapshots(context)

	var response struct {
		Data struct {
			Items []requestPricingSnapshotAdminRow `json:"items"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.Len(t, response.Data.Items, 1)
	assert.Equal(t, "inside-range", response.Data.Items[0].RequestId)
}

func TestAdminListRequestPricingSnapshotsRejectsReversedCreatedRange(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	context, recorder := newPricingAdminJSONContext(
		t, http.MethodGet,
		"/api/pricing-admin/request-pricing-snapshots?created_from=250&created_to=150",
		nil,
	)

	AdminListRequestPricingSnapshots(context)

	assert.Contains(t, recorder.Body.String(), "created_from 不能晚于 created_to")
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

func TestAdminPricingCircuitOverviewNamesAndResetsActiveChannel(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	require.NoError(t, model.DB.Create(&model.Channel{
		Id: 121, Name: "circuit-provider",
	}).Error)
	pricingruntime.RecordChannelFailure(121, 500)
	pricingruntime.RecordChannelFailure(121, 502)
	pricingruntime.RecordChannelFailure(121, 503)
	t.Cleanup(func() {
		pricingruntime.ResetChannelCircuit(121)
	})

	overviewContext, overviewRecorder := newPricingAdminJSONContext(
		t,
		http.MethodGet,
		"/api/pricing-admin/circuit-overview",
		nil,
	)
	AdminGetPricingCircuitOverview(overviewContext)

	var overviewResponse struct {
		Success bool `json:"success"`
		Data    struct {
			Channels []pricingCircuitChannelAdminRow `json:"channels"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(overviewRecorder.Body.Bytes(), &overviewResponse))
	require.True(t, overviewResponse.Success)
	require.Len(t, overviewResponse.Data.Channels, 1)
	assert.Equal(t, "circuit-provider", overviewResponse.Data.Channels[0].ChannelName)
	assert.Equal(t, "open", overviewResponse.Data.Channels[0].State)

	resetContext, resetRecorder := newPricingAdminJSONContext(
		t,
		http.MethodPost,
		"/api/pricing-admin/circuit-overview/121/reset",
		nil,
	)
	resetContext.Params = gin.Params{{Key: "channel_id", Value: "121"}}
	AdminResetPricingCircuit(resetContext)

	var resetResponse struct {
		Success bool `json:"success"`
		Data    struct {
			ChannelId int  `json:"channel_id"`
			Reset     bool `json:"reset"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(resetRecorder.Body.Bytes(), &resetResponse))
	assert.True(t, resetResponse.Success)
	assert.True(t, resetResponse.Data.Reset)
	assert.Equal(t, 121, resetResponse.Data.ChannelId)
}

func TestAdminPricingReconciliationSummarySeparatesBacklogAndRecentOutcomes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	now := common.GetTimestamp()
	snapshots := []model.RequestPricingSnapshot{
		{RequestId: "summary-pending", Status: pricingruntime.PricingSnapshotStatusPending},
		{RequestId: "summary-stale", Status: pricingruntime.PricingSnapshotStatusReserved},
		{RequestId: "summary-fresh", Status: pricingruntime.PricingSnapshotStatusReserved},
		{RequestId: "summary-settled", Status: pricingruntime.PricingSnapshotStatusSettled},
		{RequestId: "summary-refunded", Status: pricingruntime.PricingSnapshotStatusRefunded},
	}
	for index := range snapshots {
		snapshots[index].UserId = 1
		snapshots[index].ModelId = 1
		snapshots[index].ChannelModelId = 1
		snapshots[index].BillingMode = "token"
		snapshots[index].Currency = "USD"
		snapshots[index].PurchaseCost = "0"
		snapshots[index].RetailAmount = "0"
		require.NoError(t, model.DB.Create(&snapshots[index]).Error)
	}
	require.NoError(t, model.DB.Model(&model.RequestPricingSnapshot{}).
		Where("request_id IN ?", []string{"summary-pending", "summary-stale"}).
		Updates(map[string]interface{}{
			"created_at": now - pricingReconciliationReservedAgeSeconds - 60,
			"updated_at": now - pricingReconciliationReservedAgeSeconds - 60,
		}).Error)
	require.NoError(t, model.DB.Model(&model.RequestPricingSnapshot{}).
		Where("request_id IN ?", []string{"summary-settled", "summary-refunded"}).
		UpdateColumn("updated_at", now-60).Error)

	context, recorder := newPricingAdminJSONContext(
		t,
		http.MethodGet,
		"/api/pricing-admin/request-pricing-snapshots/summary",
		nil,
	)
	AdminGetPricingReconciliationSummary(context)

	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Pending                int64 `json:"pending"`
			StaleReserved          int64 `json:"stale_reserved"`
			SettledLast24h         int64 `json:"settled_last_24h"`
			RefundedLast24h        int64 `json:"refunded_last_24h"`
			OldestAnomalyCreatedAt int64 `json:"oldest_anomaly_created_at"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	assert.EqualValues(t, 1, response.Data.Pending)
	assert.EqualValues(t, 1, response.Data.StaleReserved)
	assert.EqualValues(t, 1, response.Data.SettledLast24h)
	assert.EqualValues(t, 1, response.Data.RefundedLast24h)
	assert.Equal(t, now-pricingReconciliationReservedAgeSeconds-60, response.Data.OldestAnomalyCreatedAt)
}

func TestAdminExportRequestPricingSnapshotsProducesSafeFilteredCSV(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	require.NoError(t, model.DB.Create(&model.Channel{Id: 131, Name: "@provider"}).Error)
	require.NoError(t, model.DB.Create(&model.Model{Id: 132, ModelName: "=model"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 133, ChannelId: 131, ModelId: 132, UpstreamModelName: "=model",
		Status: 1, RuntimeMode: "v2",
	}).Error)
	require.NoError(t, model.DB.Create(&model.RequestPricingSnapshot{
		RequestId: "+request", UserId: 1, ModelId: 132, ChannelModelId: 133,
		PurchasePriceVersionId: 1, RetailPriceVersionId: 2,
		BillingMode: "token", ReservedQuota: 100, SettledQuota: 0,
		PurchaseCost: "0.04", RetailAmount: "0.08", Currency: "USD",
		Status: pricingruntime.PricingSnapshotStatusPending,
	}).Error)
	require.NoError(t, model.DB.Create(&model.RequestPricingSnapshot{
		RequestId: "settled-not-exported", UserId: 1, ModelId: 132, ChannelModelId: 133,
		PurchasePriceVersionId: 1, RetailPriceVersionId: 2,
		BillingMode: "token", ReservedQuota: 100, SettledQuota: 100,
		PurchaseCost: "0.04", RetailAmount: "0.08", Currency: "USD",
		Status: pricingruntime.PricingSnapshotStatusSettled,
	}).Error)
	context, recorder := newPricingAdminJSONContext(
		t,
		http.MethodGet,
		"/api/pricing-admin/request-pricing-snapshots/export?reconciliation=true",
		nil,
	)

	AdminExportRequestPricingSnapshots(context)

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, "text/csv; charset=utf-8", recorder.Header().Get("Content-Type"))
	assert.Contains(t, recorder.Header().Get("Content-Disposition"), "pricing-reconciliation-")
	records, err := csv.NewReader(strings.NewReader(recorder.Body.String())).ReadAll()
	require.NoError(t, err)
	require.Len(t, records, 2)
	assert.Equal(t, "'+request", records[1][0])
	assert.Equal(t, "'=model", records[1][1])
	assert.Equal(t, "'@provider", records[1][2])
	assert.Equal(t, "pending", records[1][9])
}

func TestAdminConfirmRequestPricingSnapshotRefundedFinalizesPendingOnly(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	snapshot := model.RequestPricingSnapshot{
		RequestId: "confirm-refunded", UserId: 7, ModelId: 1, ChannelModelId: 1,
		PurchasePriceVersionId: 1, RetailPriceVersionId: 1, BillingMode: "token",
		PurchaseCost: "0.01", RetailAmount: "0.02", Currency: "USD",
		ReservedQuota: 10, Status: pricingruntime.PricingSnapshotStatusPending,
	}
	require.NoError(t, model.DB.Create(&snapshot).Error)
	context, recorder := newPricingAdminJSONContext(
		t, http.MethodPost,
		fmt.Sprintf("/api/pricing-admin/request-pricing-snapshots/%d/confirm-refunded", snapshot.Id),
		nil,
	)
	context.Params = gin.Params{{Key: "id", Value: strconv.Itoa(snapshot.Id)}}
	context.Set("id", 1)

	AdminConfirmRequestPricingSnapshotRefunded(context)

	assert.Equal(t, http.StatusOK, recorder.Code)
	require.NoError(t, model.DB.First(&snapshot, snapshot.Id).Error)
	assert.Equal(t, pricingruntime.PricingSnapshotStatusRefunded, snapshot.Status)
	assert.Zero(t, snapshot.SettledQuota)
}

func TestAdminRecordProviderCostAndFinancialSummary(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	snapshot := model.RequestPricingSnapshot{
		RequestId: "provider-cost-summary", UserId: 7,
		ModelId: 1, ChannelModelId: 1,
		PurchasePriceVersionId: 1, RetailPriceVersionId: 1,
		BillingMode: "token", PurchaseCost: "0.40", RetailAmount: "1.00",
		Currency: "USD", ReservedQuota: 100, SettledQuota: 100,
		Status: pricingruntime.PricingSnapshotStatusSettled,
	}
	require.NoError(t, model.DB.Create(&snapshot).Error)
	context, recorder := newPricingAdminJSONContext(
		t,
		http.MethodPost,
		fmt.Sprintf(
			"/api/pricing-admin/request-pricing-snapshots/%d/provider-cost",
			snapshot.Id,
		),
		providerReportedCostInput{Cost: "0.45", Scope: "full_provider_cost"},
	)
	context.Params = gin.Params{{Key: "id", Value: strconv.Itoa(snapshot.Id)}}

	AdminRecordProviderReportedCost(context)

	assert.Equal(t, http.StatusOK, recorder.Code)
	summaryContext, summaryRecorder := newPricingAdminJSONContext(
		t,
		http.MethodGet,
		"/api/pricing-admin/request-pricing-snapshots/financial-summary",
		nil,
	)
	AdminGetPricingFinancialSummary(summaryContext)
	assert.Equal(t, http.StatusOK, summaryRecorder.Code)
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			SettledCount             int    `json:"settled_count"`
			RevenueUSD               string `json:"revenue_usd"`
			EstimatedPurchaseUSD     string `json:"estimated_purchase_usd"`
			ProviderReportedCostUSD  string `json:"provider_reported_cost_usd"`
			CostVarianceUSD          string `json:"cost_variance_usd"`
			GrossMarginUSD           string `json:"gross_margin_usd"`
			ProviderCostMissingCount int    `json:"provider_cost_missing_count"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(summaryRecorder.Body.Bytes(), &response))
	assert.True(t, response.Success)
	assert.Equal(t, 1, response.Data.SettledCount)
	assert.Equal(t, "1", response.Data.RevenueUSD)
	assert.Equal(t, "0.4", response.Data.EstimatedPurchaseUSD)
	assert.Equal(t, "0.45", response.Data.ProviderReportedCostUSD)
	assert.Equal(t, "0.05", response.Data.CostVarianceUSD)
	assert.Equal(t, "0.55", response.Data.GrossMarginUSD)
	assert.Zero(t, response.Data.ProviderCostMissingCount)
}

func TestAdminListPersistentCircuitEventsFiltersEventType(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupPricingAdminControllerTestDB(t)
	require.NoError(t, model.DB.Create(&model.Channel{
		Id: 77, Name: "persistent-circuit-channel",
	}).Error)
	require.NoError(t, model.DB.Create([]model.PricingCircuitEvent{
		{ChannelId: 77, Event: "opened", StatusCode: 500, OccurredAt: 100},
		{ChannelId: 77, Event: "recovered", OccurredAt: 200},
	}).Error)
	context, recorder := newPricingAdminJSONContext(
		t,
		http.MethodGet,
		"/api/pricing-admin/circuit-events?event=opened",
		nil,
	)

	AdminListPricingCircuitEvents(context)

	assert.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Items []persistentPricingCircuitEventAdminRow `json:"items"`
			Total int64                                   `json:"total"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.True(t, response.Success)
	assert.Equal(t, int64(1), response.Data.Total)
	require.Len(t, response.Data.Items, 1)
	assert.Equal(t, "opened", response.Data.Items[0].Event)
	assert.Equal(t, "persistent-circuit-channel", response.Data.Items[0].ChannelName)
}
