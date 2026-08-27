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
	relaykitdto "github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service/pricingruntime"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestMidjourneyPricingAuditIsCreatedOnlyAfterPreConsume(t *testing.T) {
	gin.SetMode(gin.TestMode)
	originalDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	redisEnabled := common.RedisEnabled
	common.RedisEnabled = false
	require.NoError(t, db.AutoMigrate(
		&model.Model{},
		&model.Channel{},
		&model.Ability{},
		&model.ChannelModel{},
		&model.ModelOfficialPrice{},
		&model.ChannelModelPurchasePriceVersion{},
		&model.SalesPriceBook{},
		&model.SalesPriceBookVersion{},
		&model.SalesPriceBookItem{},
		&model.SalesPriceBookDefault{},
		&model.UserPriceBookAssignment{},
		&model.RequestPricingSnapshot{},
		&model.User{},
	))
	t.Cleanup(func() {
		pricingruntime.InvalidateCatalog()
		common.RedisEnabled = redisEnabled
		model.DB = originalDB
	})

	const purchaseExpression = `v2:tier("base", req * 1)`
	const salesExpression = `v2:tier("base", req * 2)`
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
		Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModelPurchasePriceVersion{
		Id: 4, ChannelModelId: 3, BillingMode: "request",
		PricingMode: "fixed_unit_price", PriceStructure: "flat",
		PurchaseBillingExpr:     purchaseExpression,
		PurchaseExprHash:        billingexpr.ExprHashString(purchaseExpression),
		ExpressionSchemaVersion: "v2", Currency: "USD", Version: 1,
		Status: model.PricingVersionStatusActive,
	}).Error)
	currentVersionID := 5
	require.NoError(t, model.DB.Create(&model.SalesPriceBook{
		Id: 5, Code: "toc-default", Name: "TOC Default", Audience: "toc",
		Currency: "USD", Status: model.SalesPriceBookStatusEnabled,
		CurrentVersionId: &currentVersionID,
	}).Error)
	require.NoError(t, model.DB.Create(&model.SalesPriceBookVersion{
		Id: 5, PriceBookId: 5, Version: 1,
		Status:            model.SalesPriceBookVersionStatusActive,
		MinimumMarginRate: "0.1", TargetNetMargin: "0.2",
		TotalVariableCostRate: "0", EffectiveTaxRate: "0", EffectiveFrom: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.SalesPriceBookItem{
		Id: 5, PriceBookVersionId: 5, ModelId: 1, Status: "enabled",
		BillingMode: "request", PriceStructure: "flat",
		SalesBillingExpr:        salesExpression,
		SalesExprHash:           billingexpr.ExprHashString(salesExpression),
		ExpressionSchemaVersion: "v2", Currency: "USD",
	}).Error)
	require.NoError(t, model.DB.Create(&model.SalesPriceBookDefault{
		DefaultKey: "toc_default", PriceBookId: 5,
	}).Error)
	require.NoError(t, pricingruntime.RefreshCatalog())
	require.NoError(t, model.DB.Create(&model.User{Id: 7, Username: "mj-user", Quota: int(10 * common.QuotaPerUnit)}).Error)

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodPost,
		"/mj/submit/imagine",
		strings.NewReader(`{"prompt":"test"}`),
	)
	context.Request.Header.Set("Content-Type", "application/json")
	info := &relaycommon.RelayInfo{
		RequestId:       "mj-priced-request",
		UserId:          7,
		UserGroup:       "default",
		UsingGroup:      "default",
		OriginModelName: "mj_imagine",
		ChannelMeta:     &relaycommon.ChannelMeta{ChannelId: 2},
		IsPlayground:    true,
		UserSetting:     relaykitdto.UserSetting{BillingPreference: "wallet_only"},
	}

	priceData, err := prepareMidjourneyPricing(context, info, "mj_imagine")
	require.NoError(t, err)
	assert.Equal(t, int(2*common.QuotaPerUnit), priceData.Quota)
	require.NotNil(t, info.DynamicPricingSnapshot)

	var snapshot model.RequestPricingSnapshot
	assert.ErrorIs(t, model.DB.Where("request_id = ?", info.RequestId).First(&snapshot).Error, gorm.ErrRecordNotFound)
	require.NoError(t, preConsumeMidjourneyPricing(context, info, priceData))
	require.NoError(t, model.DB.Where("request_id = ?", info.RequestId).First(&snapshot).Error)
	assert.Equal(t, pricingruntime.PricingSnapshotStatusReserved, snapshot.Status)
	assert.True(t, snapshot.PreConsumeCaptured)
	assert.Equal(t, int64(priceData.Quota), snapshot.ActualPreConsumedQuota)
	assert.Equal(t, "1", snapshot.PurchaseCost)
	assert.Equal(t, "2", snapshot.SalesAmount)
	var chargedUser model.User
	require.NoError(t, model.DB.First(&chargedUser, 7).Error)
	assert.Equal(t, int(10*common.QuotaPerUnit)-priceData.Quota, chargedUser.Quota)
	require.NoError(t, refundMidjourneyPreConsume(context, info, "test upstream failure"))
	require.NoError(t, model.DB.First(&chargedUser, 7).Error)
	assert.Equal(t, int(10*common.QuotaPerUnit), chargedUser.Quota)
	require.NoError(t, model.DB.Where("request_id = ?", info.RequestId).First(&snapshot).Error)
	assert.Equal(t, pricingruntime.PricingSnapshotStatusRefunded, snapshot.Status)
}
