package relay

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service/pricingruntime"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestPrepareMidjourneyV2PricingCreatesFrozenRequestAudit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	originalDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	require.NoError(t, db.AutoMigrate(
		&model.Model{},
		&model.Channel{},
		&model.Ability{},
		&model.ChannelModel{},
		&model.ModelOfficialPrice{},
		&model.ChannelModelPurchasePriceVersion{},
		&model.ChannelModelRetailPriceVersion{},
		&model.RequestPricingSnapshot{},
	))
	t.Cleanup(func() {
		pricingruntime.InvalidateCatalog()
		model.DB = originalDB
	})

	const purchaseExpression = `v2:tier("base", req * 1)`
	const retailExpression = `v2:tier("base", req * 2)`
	require.NoError(t, model.DB.Create(&model.Model{
		Id: 1, ModelName: "mj_imagine",
	}).Error)
	require.NoError(t, model.DB.Create(&model.Channel{
		Id: 2, Name: "midjourney", Status: common.ChannelStatusEnabled,
	}).Error)
	require.NoError(t, model.DB.Create(&model.Ability{
		Group: "default", Model: "mj_imagine", ChannelId: 2, Enabled: true,
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 3, ChannelId: 2, ModelId: 1, UpstreamModelName: "mj_imagine",
		Status: 1, RuntimeMode: pricingruntime.RuntimeModeV2,
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModelPurchasePriceVersion{
		Id: 4, ChannelModelId: 3, BillingMode: "request",
		PricingMode: "fixed_unit_price", PriceStructure: "flat",
		PurchaseBillingExpr:     purchaseExpression,
		PurchaseExprHash:        billingexpr.ExprHashString(purchaseExpression),
		ExpressionSchemaVersion: "v2", Currency: "USD", Version: 1,
		Status: model.PricingVersionStatusActive,
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModelRetailPriceVersion{
		Id: 5, ChannelModelId: 3, PurchasePriceVersionId: 4,
		BillingMode: "request", PriceStructure: "flat",
		RetailBillingExpr:       retailExpression,
		RetailExprHash:          billingexpr.ExprHashString(retailExpression),
		ExpressionSchemaVersion: "v2", Currency: "USD", Version: 1,
		Status:            model.PricingVersionStatusActive,
		MinimumMarginRate: "0.1", TargetNetMargin: "0.2",
		TotalVariableCostRate: "0", EffectiveTaxRate: "0",
	}).Error)
	require.NoError(t, pricingruntime.RefreshCatalog())

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodPost,
		"/mj/submit/imagine",
		strings.NewReader(`{"prompt":"test"}`),
	)
	context.Request.Header.Set("Content-Type", "application/json")
	info := &relaycommon.RelayInfo{
		RequestId:       "mj-v2-request",
		UserId:          7,
		UserGroup:       "default",
		UsingGroup:      "default",
		OriginModelName: "mj_imagine",
		ChannelMeta:     &relaycommon.ChannelMeta{ChannelId: 2},
	}

	priceData, err := prepareMidjourneyV2Pricing(context, info, "mj_imagine")
	require.NoError(t, err)
	assert.Equal(t, int(2*common.QuotaPerUnit), priceData.Quota)
	require.NotNil(t, info.DynamicPricingSnapshot)

	var snapshot model.RequestPricingSnapshot
	require.NoError(t, model.DB.Where("request_id = ?", info.RequestId).First(&snapshot).Error)
	assert.Equal(t, pricingruntime.PricingSnapshotStatusReserved, snapshot.Status)
	assert.Equal(t, "1", snapshot.PurchaseCost)
	assert.Equal(t, "2", snapshot.RetailAmount)
}
