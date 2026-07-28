package controller

import (
	"bytes"
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
