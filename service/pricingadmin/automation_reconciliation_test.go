package pricingadmin

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPricingAutomationReconciliationSkipsPreMigrationVersions(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.AutoMigrate(&model.Option{}))
	createSalesPriceBookPurchaseSource(t, 1501, 1511, 1521, "legacy-priced-model", "1", "2")
	require.NoError(t, model.DB.Create(&model.OfficialModelPriceVersion{
		ModelId: 1521, BillingMode: "token", PriceStructure: "flat",
		BillingExpr: `v2:tier("base", p)`, ExprHash: "legacy-official",
		ExpressionSchemaVersion: "v2", Currency: "USD",
		Version: 1, Status: model.PricingVersionStatusActive,
	}).Error)

	require.NoError(t, model.InitializePricingAutomationBaselines())
	summary, err := ReconcilePricingAutomation(1)
	require.NoError(t, err)
	assert.Zero(t, summary.OfficialVersionsChecked)
	assert.Zero(t, summary.PurchaseVersionsChecked)
	var historicalBatchCount int64
	require.NoError(t, model.DB.Model(&model.PricingChangeBatch{}).Count(&historicalBatchCount).Error)
	assert.Zero(t, historicalBatchCount)

	createSalesPriceBookPurchaseSource(t, 1502, 1512, 1522, "post-migration-model", "2", "4")
	summary, err = ReconcilePricingAutomation(1)
	require.NoError(t, err)
	assert.Zero(t, summary.OfficialVersionsChecked)
	assert.Equal(t, 1, summary.PurchaseVersionsChecked)
	assert.Equal(t, 1, summary.PurchaseGapsRepaired)
	var newBatchCount int64
	require.NoError(t, model.DB.Model(&model.PricingChangeBatch{}).
		Where("trigger_type = ?", SalesPriceBookTriggerPurchasePricePublished).
		Count(&newBatchCount).Error)
	assert.Equal(t, int64(1), newBatchCount)
}
