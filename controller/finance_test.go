package controller

import (
	"bytes"
	"encoding/csv"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupFinanceControllerTestDB(t *testing.T) {
	t.Helper()
	originalDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	model.DB = db
	require.NoError(t, db.AutoMigrate(
		&model.User{},
		&model.TopUp{},
		&model.UserSubscription{},
		&model.SubscriptionOrder{},
		&model.Redemption{},
	))
	t.Cleanup(func() {
		model.DB = originalDB
	})
}

func TestGetAdminFinanceOverviewReturnsCurrentPlatformBalance(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupFinanceControllerTestDB(t)
	now := common.GetTimestamp()
	require.NoError(t, model.DB.Create(&model.User{
		Username: "finance-controller-user",
		Password: "password",
		AffCode:  "finance-controller-aff",
		Quota:    1_500,
		AffQuota: 250,
	}).Error)

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodGet,
		"/api/user/topup/summary?start_time="+strconv.FormatInt(now-100, 10)+"&end_time="+strconv.FormatInt(now, 10),
		nil,
	)
	GetAdminFinanceOverview(context)

	assert.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool                       `json:"success"`
		Data    model.AdminFinanceOverview `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.True(t, response.Success)
	assert.Equal(t, int64(1_500), response.Data.Balance.WalletQuota)
	assert.Equal(t, int64(1_750), response.Data.Balance.TotalAvailableQuota)
}

func TestExportAdminTopUpsFiltersRowsAndProtectsSpreadsheetCells(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupFinanceControllerTestDB(t)
	now := common.GetTimestamp()
	require.NoError(t, model.DB.Create(&[]model.TopUp{
		{TradeNo: "=dangerous", PaymentProvider: model.PaymentProviderStripe, PaymentMethod: model.PaymentMethodStripe, Status: common.TopUpStatusSuccess, CreateTime: now, Money: 10},
		{TradeNo: "pending-order", PaymentProvider: model.PaymentProviderStripe, PaymentMethod: model.PaymentMethodStripe, Status: common.TopUpStatusPending, CreateTime: now, Money: 5},
	}).Error)

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodGet,
		"/api/user/topup/export?status=success&provider=stripe",
		nil,
	)
	ExportAdminTopUps(context)

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, "text/csv; charset=utf-8", recorder.Header().Get("Content-Type"))
	body := bytes.TrimPrefix(recorder.Body.Bytes(), []byte{0xEF, 0xBB, 0xBF})
	records, err := csv.NewReader(bytes.NewReader(body)).ReadAll()
	require.NoError(t, err)
	require.Len(t, records, 2)
	assert.Equal(t, "trade_no", records[0][1])
	assert.Equal(t, "'=dangerous", records[1][1])
	assert.Equal(t, common.TopUpStatusSuccess, records[1][6])
	assert.Equal(t, "credited_quota", records[0][7])
	assert.Equal(t, strconv.FormatInt(int64(10*common.QuotaPerUnit), 10), records[1][7])
}
