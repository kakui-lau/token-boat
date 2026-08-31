package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSubscriptionRequestStripePayRejectsUntrustedReturnURL(t *testing.T) {
	confirmPaymentComplianceForTest(t)
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodPost,
		"/api/subscription/stripe/pay",
		strings.NewReader(`{"plan_id":1,"success_url":"javascript:alert(1)"}`),
	)
	context.Request.Header.Set("Content-Type", "application/json")

	SubscriptionRequestStripePay(context)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "支付成功重定向URL不在可信任域名列表中")
}
