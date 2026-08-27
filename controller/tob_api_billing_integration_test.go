package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/service/pricingengine"
	"github.com/QuantumNous/new-api/service/pricingruntime"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAPIKeyRequestUsesAssignedTOBPriceAndSettlesFrozenSnapshot(t *testing.T) {
	withSelfUseModeDisabled(t)
	db := setupModelListControllerTestDB(t)
	const (
		userId         = 2101
		tokenId        = 2102
		channelId      = 2103
		modelId        = 2104
		channelModelId = 2105
		tocBookId      = 2110
		tobBookId      = 2120
		tobVersionId   = 2121
		tobItemId      = 2122
		assignmentId   = 2123
		startingQuota  = 10_000_000
	)
	require.NoError(t, db.Create(&model.User{
		Id: userId, Username: "tob-api-user", Password: "password",
		Group: "default", Status: common.UserStatusEnabled, Quota: startingQuota,
	}).Error)
	require.NoError(t, db.Create(&model.Token{
		Id: tokenId, UserId: userId, Key: "tobapikey", Name: "TOB API key",
		Status: common.TokenStatusEnabled, ExpiredTime: -1, RemainQuota: startingQuota,
	}).Error)
	require.NoError(t, db.Create(&model.Channel{
		Id: channelId, Name: "tob-api-channel", Type: constant.ChannelTypeOpenAI,
		Status: common.ChannelStatusEnabled, Group: "default",
	}).Error)
	require.NoError(t, db.Create(&model.Ability{
		Group: "default", Model: "zz-tob-api-model", ChannelId: channelId, Enabled: true,
	}).Error)
	require.NoError(t, db.Create(&model.Model{
		Id: modelId, ModelName: "zz-tob-api-model", Status: 1,
	}).Error)
	require.NoError(t, db.Create(&model.ChannelModel{
		Id: channelModelId, ChannelId: channelId, ModelId: modelId,
		UpstreamModelName: "zz-tob-api-model", Status: 1,
	}).Error)
	purchaseExpression := `v2:tier("base", p * 1 / 1000000)`
	require.NoError(t, db.Create(&model.ChannelModelPurchasePriceVersion{
		Id: 2106, ChannelModelId: channelModelId, BillingMode: "token",
		PricingMode: "fixed_unit_price", PriceStructure: "flat",
		PriceComponents:         `{"input_unit_price":"1"}`,
		PurchaseBillingExpr:     purchaseExpression,
		PurchaseExprHash:        billingexpr.ExprHashString(purchaseExpression),
		ExpressionSchemaVersion: "v2", Currency: "USD", Version: 1,
		Status: model.PricingVersionStatusActive,
	}).Error)

	tocVersionId := tocBookId
	require.NoError(t, db.Create(&model.SalesPriceBook{
		Id: tocBookId, Code: "toc-api-default", Name: "TOC API Default",
		Audience: "toc", Currency: "USD", Status: model.SalesPriceBookStatusEnabled,
		CurrentVersionId: &tocVersionId,
	}).Error)
	require.NoError(t, db.Create(&model.SalesPriceBookVersion{
		Id: tocVersionId, PriceBookId: tocBookId, Version: 1,
		Status: model.SalesPriceBookVersionStatusActive, EffectiveFrom: 1,
		TotalVariableCostRate: "0", EffectiveTaxRate: "0", MinimumMarginRate: "0",
	}).Error)
	tocExpression := `v2:tier("base", p * 3 / 1000000)`
	require.NoError(t, db.Create(&model.SalesPriceBookItem{
		Id: 2111, PriceBookVersionId: tocVersionId, ModelId: modelId,
		Status: "enabled", BillingMode: "token", PriceStructure: "flat",
		PriceComponents:  `{"input_unit_price":"3"}`,
		SalesBillingExpr: tocExpression, SalesExprHash: billingexpr.ExprHashString(tocExpression),
		ExpressionSchemaVersion: "v2", Currency: "USD",
	}).Error)
	require.NoError(t, db.Create(&model.SalesPriceBookDefault{
		DefaultKey: "toc_default", PriceBookId: tocBookId,
	}).Error)

	tobCurrentVersionId := tobVersionId
	require.NoError(t, db.Create(&model.SalesPriceBook{
		Id: tobBookId, Code: "assigned-tob-api", Name: "Assigned TOB API",
		Audience: "tob", Currency: "USD", Status: model.SalesPriceBookStatusEnabled,
		CurrentVersionId: &tobCurrentVersionId,
	}).Error)
	require.NoError(t, db.Create(&model.SalesPriceBookVersion{
		Id: tobVersionId, PriceBookId: tobBookId, Version: 1,
		Status: model.SalesPriceBookVersionStatusActive, EffectiveFrom: 1,
		TotalVariableCostRate: "0", EffectiveTaxRate: "0", MinimumMarginRate: "0",
	}).Error)
	tobExpression := `v2:tier("base", p * 2 / 1000000)`
	require.NoError(t, db.Create(&model.SalesPriceBookItem{
		Id: tobItemId, PriceBookVersionId: tobVersionId, ModelId: modelId,
		Status: "enabled", BillingMode: "token", PriceStructure: "flat",
		PriceComponents:  `{"input_unit_price":"2"}`,
		SalesBillingExpr: tobExpression, SalesExprHash: billingexpr.ExprHashString(tobExpression),
		ExpressionSchemaVersion: "v2", Currency: "USD",
	}).Error)
	require.NoError(t, db.Create(&model.UserPriceBookAssignment{
		Id: assignmentId, UserId: userId, PriceBookId: tobBookId,
		VersionPolicy: "follow_current", Status: model.PriceBookAssignmentStatusActive,
		EffectiveFrom: 1,
	}).Error)
	require.NoError(t, pricingruntime.RefreshCatalog())
	t.Cleanup(pricingruntime.InvalidateCatalog)

	requestId := "tob-api-key-billing-e2e"
	router := gin.New()
	router.POST("/v1/chat/completions", middleware.TokenAuth(), func(c *gin.Context) {
		info := &relaycommon.RelayInfo{
			UserId: c.GetInt("id"), TokenId: c.GetInt("token_id"),
			TokenKey: c.GetString("token_key"), TokenUnlimited: c.GetBool("token_unlimited_quota"),
			UserGroup: "default", UsingGroup: "default", OriginModelName: "zz-tob-api-model",
			RequestId: requestId, ForcePreConsume: true,
			UserSetting: dto.UserSetting{BillingPreference: "wallet_only"},
		}
		priceData, err := pricingruntime.PrepareRelayPricing(
			info, "default", channelId, 1_000_000, 0,
			billingexpr.RequestInput{}, pricingengine.Usage{},
		)
		require.NoError(t, err)
		require.NoError(t, pricingruntime.CreateRequestPricingSnapshot(info))
		require.Nil(t, service.PreConsumeBilling(c, priceData.QuotaToPreConsume, info))
		require.NoError(t, service.SettleBilling(c, info, priceData.Quota))
		require.NoError(t, pricingruntime.SettleRequestPricingSnapshot(
			info, &dto.Usage{PromptTokens: 1_000_000}, priceData.Quota,
		))
		c.Status(http.StatusOK)
	})

	request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	request.Header.Set("Authorization", "Bearer sk-tobapikey")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	require.Equal(t, http.StatusOK, recorder.Code)

	var snapshot model.RequestPricingSnapshot
	require.NoError(t, db.Where("request_id = ?", requestId).First(&snapshot).Error)
	assert.Equal(t, pricingruntime.PricingSnapshotStatusSettled, snapshot.Status)
	assert.Equal(t, tobBookId, snapshot.SalesPriceBookId)
	assert.Equal(t, tobVersionId, snapshot.SalesPriceBookVersionId)
	assert.Equal(t, tobItemId, snapshot.SalesPriceBookItemId)
	assert.Equal(t, assignmentId, snapshot.PriceBookAssignmentId)
	assert.Equal(t, "user_assignment", snapshot.SalesPricingSource)
	assert.True(t, snapshot.PreConsumeCaptured)
	assert.Equal(t, int64(snapshot.SettledQuota), snapshot.ActualPreConsumedQuota)

	var chargedUser model.User
	require.NoError(t, db.First(&chargedUser, userId).Error)
	assert.Equal(t, startingQuota-int(snapshot.SettledQuota), chargedUser.Quota)
	var chargedToken model.Token
	require.NoError(t, db.First(&chargedToken, tokenId).Error)
	assert.Equal(t, startingQuota-int(snapshot.SettledQuota), chargedToken.RemainQuota)
}
