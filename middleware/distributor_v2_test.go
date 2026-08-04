package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/pricingruntime"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestDistributorRejectsModelWithoutCompleteV2PriceChain(t *testing.T) {
	gin.SetMode(gin.TestMode)
	originalDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	require.NoError(t, db.AutoMigrate(
		&model.Model{},
		&model.Ability{},
		&model.ChannelModel{},
		&model.OfficialModelPriceVersion{},
		&model.ChannelModelPurchasePriceVersion{},
		&model.ChannelModelRetailPriceVersion{},
	))
	pricingruntime.InvalidateCatalog()
	t.Cleanup(func() {
		pricingruntime.InvalidateCatalog()
		model.DB = originalDB
	})

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodPost,
		"/v1/chat/completions",
		strings.NewReader(`{"model":"missing-v2-model","messages":[]}`),
	)
	context.Request.Header.Set("Content-Type", "application/json")
	context.Set(string(constant.ContextKeyUsingGroup), "default")

	Distribute()(context)

	assert.Equal(t, http.StatusServiceUnavailable, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "V2")
	assert.True(t, context.IsAborted())
}

func TestDistributorResolvesSystemAliasBeforePricing(t *testing.T) {
	gin.SetMode(gin.TestMode)
	originalDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	require.NoError(t, db.AutoMigrate(
		&model.Model{},
		&model.Ability{},
		&model.ChannelModel{},
		&model.OfficialModelPriceVersion{},
		&model.ChannelModelPurchasePriceVersion{},
		&model.ChannelModelRetailPriceVersion{},
	))
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
	pricingruntime.InvalidateCatalog()
	t.Cleanup(func() {
		model.InvalidateModelRoutingCache()
		pricingruntime.InvalidateCatalog()
		model.DB = originalDB
	})

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
	assert.Contains(t, recorder.Body.String(), "openai/gpt-5.6-terra")
	assert.NotContains(t, recorder.Body.String(), "codex-auto-review")
	assert.Equal(
		t,
		"codex-auto-review",
		context.GetString(string(constant.ContextKeyRequestedModel)),
	)
	assert.True(t, context.IsAborted())
}
