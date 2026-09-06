package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/service/pricingruntime"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupDistributorPricingTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	originalDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	require.NoError(t, db.AutoMigrate(
		&model.Model{},
		&model.Channel{},
		&model.Ability{},
		&model.ChannelModel{},
		&model.OfficialModelPriceVersion{},
		&model.ModelOfficialPrice{},
		&model.ChannelModelPurchasePriceVersion{},
		&model.SalesPriceBook{},
		&model.SalesPriceBookVersion{},
		&model.SalesPriceBookItem{},
		&model.SalesPriceBookDefault{},
		&model.UserPriceBookAssignment{},
		&model.SalesPriceBookChannelModelOverride{},
	))
	model.InvalidateModelRoutingCache()
	pricingruntime.InvalidateCatalog()
	t.Cleanup(func() {
		model.InvalidateModelRoutingCache()
		pricingruntime.InvalidateCatalog()
		model.DB = originalDB
	})
	return db
}

func TestDistributorRejectsUnknownModelWithActionableError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupDistributorPricingTestDB(t)

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodPost,
		"/v1/chat/completions",
		strings.NewReader(`{"model":"missing-priced-model","messages":[]}`),
	)
	context.Request.Header.Set("Content-Type", "application/json")
	context.Set(string(constant.ContextKeyUsingGroup), "default")

	Distribute()(context)

	assert.Equal(t, http.StatusNotFound, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "model_not_found")
	assert.Contains(t, recorder.Body.String(), "missing-priced-model")
	assert.True(t, context.IsAborted())
}

func TestDistributorResolvesSystemAliasBeforePricing(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupDistributorPricingTestDB(t)
	target := model.Model{
		ModelName:  "openai/gpt-5.6-terra",
		Status:     1,
		NameRule:   model.NameRuleExact,
		Visibility: model.ModelVisibilityPublic,
	}
	require.NoError(t, db.Create(&target).Error)
	require.NoError(t, db.Create(&model.Model{
		ModelName:            "codex-auto-review",
		Status:               1,
		NameRule:             model.NameRuleExact,
		Visibility:           model.ModelVisibilityInternal,
		ModelPurpose:         model.ModelPurposeApprovalReview,
		RoutingTargetModelId: &target.Id,
	}).Error)
	model.InvalidateModelRoutingCache()

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodPost,
		"/v1/responses",
		strings.NewReader(`{"model":"codex-auto-review","input":"review"}`),
	)
	context.Request.Header.Set("Content-Type", "application/json")
	context.Set(string(constant.ContextKeyUsingGroup), "default")

	Distribute()(context)

	assert.Equal(t, http.StatusServiceUnavailable, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "model_not_available_in_group")
	assert.Contains(t, recorder.Body.String(), "openai/gpt-5.6-terra")
	assert.NotContains(t, recorder.Body.String(), "codex-auto-review")
	assert.Equal(
		t,
		"codex-auto-review",
		context.GetString(string(constant.ContextKeyRequestedModel)),
	)
	assert.True(t, context.IsAborted())
}

func TestDistributorReportsMissingPurchasePrice(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupDistributorPricingTestDB(t)
	require.NoError(t, db.Create(&model.Model{
		Id: 1, ModelName: "unpriced-model", Status: 1,
	}).Error)
	require.NoError(t, db.Create(&model.Channel{
		Id: 1, Name: "unpriced-channel", Status: 1,
	}).Error)
	require.NoError(t, db.Create(&model.ChannelModel{
		Id: 1, ChannelId: 1, ModelId: 1, UpstreamModelName: "unpriced-model", Status: 1,
	}).Error)
	require.NoError(t, db.Create(&model.Ability{
		Group: "default", Model: "unpriced-model", ChannelId: 1, Enabled: true,
	}).Error)

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodPost,
		"/v1/responses",
		strings.NewReader(`{"model":"unpriced-model","input":"hello"}`),
	)
	context.Request.Header.Set("Content-Type", "application/json")
	context.Set(string(constant.ContextKeyUsingGroup), "default")

	Distribute()(context)

	assert.Equal(t, http.StatusServiceUnavailable, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "purchase_price_missing")
	assert.Contains(t, recorder.Body.String(), "1 enabled channel route")
	assert.True(t, context.IsAborted())
}

func TestDistributorPreservesSalesPriceBookFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupDistributorPricingTestDB(t)
	require.NoError(t, db.Create(&model.Model{
		Id: 2, ModelName: "priced-model", Status: 1,
	}).Error)
	require.NoError(t, db.Create(&model.Channel{
		Id: 2, Name: "priced-channel", Status: 1,
	}).Error)
	require.NoError(t, db.Create(&model.ChannelModel{
		Id: 2, ChannelId: 2, ModelId: 2, UpstreamModelName: "priced-model", Status: 1,
	}).Error)
	require.NoError(t, db.Create(&model.Ability{
		Group: "default", Model: "priced-model", ChannelId: 2, Enabled: true,
	}).Error)
	expression := `v2:tier("base", p / 1000000)`
	require.NoError(t, db.Create(&model.ChannelModelPurchasePriceVersion{
		Id: 2, ChannelModelId: 2,
		BillingMode: "token", PricingMode: "fixed_unit_price", PriceStructure: "flat",
		PriceComponents:     `{"input_unit_price":"1"}`,
		PurchaseBillingExpr: expression, PurchaseExprHash: billingexpr.ExprHashString(expression),
		ExpressionSchemaVersion: "v2", Currency: "USD", Version: 1,
		Status: model.PricingVersionStatusActive,
	}).Error)

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodPost,
		"/v1/responses",
		strings.NewReader(`{"model":"priced-model","input":"hello"}`),
	)
	context.Request.Header.Set("Content-Type", "application/json")
	context.Set(string(constant.ContextKeyUsingGroup), "default")
	context.Set("id", 15)

	Distribute()(context)

	assert.Equal(t, http.StatusServiceUnavailable, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "sales_price_book_unavailable")
	assert.NotContains(t, recorder.Body.String(), "minimum_margin_not_met")
	assert.True(t, context.IsAborted())
}
