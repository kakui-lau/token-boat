package pricingadmin

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestListModelPriceOverviewChoosesEachComponentMinimum(t *testing.T) {
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.AutoMigrate(&model.Channel{}))
	require.NoError(t, model.DB.Create(&model.Model{Id: 201, ModelName: "overview-model"}).Error)
	require.NoError(t, model.DB.Create(&model.Channel{Id: 211, Name: "channel-a"}).Error)
	require.NoError(t, model.DB.Create(&model.Channel{Id: 212, Name: "channel-b"}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 221, ChannelId: 211, ModelId: 201, UpstreamModelName: "a",
		Status: 1, RuntimeMode: "legacy",
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 222, ChannelId: 212, ModelId: 201, UpstreamModelName: "b",
		Status: 1, RuntimeMode: "legacy",
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModelRetailPriceVersion{
		ChannelModelId: 221, PurchasePriceVersionId: 1, BillingMode: "token",
		PriceStructure: "flat", RetailBillingExpr: "p * 2 + c * 9",
		RetailExprHash: "a", ExpressionSource: "generated", ExpressionSchemaVersion: "v1",
		Currency: "USD", InputUnitPrice: "2", OutputUnitPrice: "9",
		TotalVariableCostRate: "0", EffectiveTaxRate: "0", TargetNetMargin: "0",
		MinimumMarginRate: "0", Version: 1, Status: model.PricingVersionStatusActive,
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModelRetailPriceVersion{
		ChannelModelId: 222, PurchasePriceVersionId: 2, BillingMode: "token",
		PriceStructure: "flat", RetailBillingExpr: "p * 3 + c * 8",
		RetailExprHash: "b", ExpressionSource: "generated", ExpressionSchemaVersion: "v1",
		Currency: "USD", InputUnitPrice: "3", OutputUnitPrice: "8",
		TotalVariableCostRate: "0", EffectiveTaxRate: "0", TargetNetMargin: "0",
		MinimumMarginRate: "0", Version: 1, Status: model.PricingVersionStatusActive,
	}).Error)

	result, err := ListModelPriceOverview("overview")
	require.NoError(t, err)
	require.Len(t, result, 1)
	assert.Equal(t, 2, result[0].ActiveChannelCount)
	assert.Equal(t, "2", result[0].Input.UnitPrice)
	assert.Equal(t, "channel-a", result[0].Input.ChannelName)
	assert.Equal(t, "8", result[0].Output.UnitPrice)
	assert.Equal(t, "channel-b", result[0].Output.ChannelName)
}
