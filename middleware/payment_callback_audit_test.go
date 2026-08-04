package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestPaymentCallbackAuditUsesExplicitBusinessOutcomeAndRedactsPayload(t *testing.T) {
	gin.SetMode(gin.TestMode)
	originalDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	model.DB = db
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	require.NoError(t, db.AutoMigrate(&model.PaymentCallbackEvent{}, &model.FinanceAlert{}))
	t.Cleanup(func() {
		model.DB = originalDB
	})

	router := gin.New()
	router.POST("/callback", PaymentCallbackAudit(model.PaymentProviderEpay), func(c *gin.Context) {
		MarkPaymentCallbackFailed(c, "quota credit failed")
		c.String(http.StatusOK, "fail")
	})

	request := httptest.NewRequest(http.MethodPost, "/callback", strings.NewReader(`{
		"trade_no":"provider-trade-1",
		"out_trade_no":"local-order-1",
		"trade_status":"TRADE_SUCCESS",
		"sign":"secret-signature",
		"payer_email":"payer@example.com"
	}`))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	assert.Equal(t, http.StatusOK, recorder.Code)
	var event model.PaymentCallbackEvent
	require.NoError(t, db.First(&event).Error)
	assert.Equal(t, model.PaymentCallbackVerificationVerified, event.VerificationStatus)
	assert.Equal(t, model.PaymentCallbackStatusFailed, event.ProcessingStatus)
	assert.Equal(t, "quota credit failed", event.ErrorMessage)
	assert.Equal(t, "provider-trade-1", event.EventID)
	assert.Equal(t, "local-order-1", event.TradeNo)
	assert.NotContains(t, event.PayloadPreview, "secret-signature")
	assert.NotContains(t, event.PayloadPreview, "payer@example.com")
	assert.Contains(t, event.PayloadPreview, "[REDACTED]")

	var alert model.FinanceAlert
	require.NoError(t, db.First(&alert).Error)
	assert.Equal(t, model.FinanceAlertSeverityCritical, alert.Severity)
	assert.Equal(t, model.FinanceAlertSourceCallback, alert.Source)
}
