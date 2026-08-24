package pricingruntime

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/service/pricingengine"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupSalesPriceResolverTestDB(t *testing.T) {
	t.Helper()
	originalDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	require.NoError(t, db.AutoMigrate(
		&model.Model{},
		&model.SalesPriceBook{},
		&model.SalesPriceBookVersion{},
		&model.SalesPriceBookItem{},
		&model.SalesPriceBookDefault{},
		&model.UserPriceBookAssignment{},
	))
	t.Cleanup(func() { model.DB = originalDB })
}

func TestQuoteCandidatesWithSalesPriceKeepsCustomerChargeConstantAcrossChannels(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	createRuntimeBundle(t, 801, RuntimeModeV2)
	createRuntimeBundle(t, 802, RuntimeModeV2)
	require.NoError(t, model.DB.Model(&model.ChannelModel{}).
		Where("id = ?", 802).Update("model_id", 801).Error)
	secondPurchase := `v2:tier("base", p * 1.5 / 1000000)`
	require.NoError(t, model.DB.Model(&model.ChannelModelPurchasePriceVersion{}).
		Where("id = ?", 802).Updates(map[string]any{
		"purchase_billing_expr": secondPurchase,
		"purchase_expr_hash":    billingexpr.ExprHashString(secondPurchase),
	}).Error)
	require.NoError(t, RefreshCatalog())

	salesExpression := `v2:tier("base", p * 2.5 / 1000000)`
	resolved := ResolvedSalesPrice{
		PriceBookId: 11, PriceBookVersionId: 12, PriceBookItemId: 13,
		Version: model.SalesPriceBookVersion{
			TotalVariableCostRate: "0", EffectiveTaxRate: "0", MinimumMarginRate: "0.1",
		},
		Item: model.SalesPriceBookItem{
			Id: 13, BillingMode: "token", Currency: "USD",
			SalesBillingExpr: salesExpression,
			SalesExprHash:    billingexpr.ExprHashString(salesExpression),
		},
	}
	quotes, err := QuoteCandidatesWithSalesPrice(
		"default",
		"runtime-model",
		pricingengine.Usage{PromptTokens: 1_000_000},
		billingexpr.RequestInput{},
		resolved,
	)
	require.NoError(t, err)
	require.Len(t, quotes, 2)
	assert.Equal(t, "2.5", quotes[0].CustomerCharge)
	assert.Equal(t, "2.5", quotes[1].CustomerCharge)
	assert.NotEqual(t, quotes[0].PurchaseCost, quotes[1].PurchaseCost)
	assert.Zero(t, quotes[0].RetailPriceVersion)
	assert.Zero(t, quotes[1].RetailPriceVersion)
}

func createResolvedPriceFixture(
	t *testing.T,
	code string,
	modelId int,
	at int64,
) (model.SalesPriceBook, model.SalesPriceBookVersion, model.SalesPriceBookItem) {
	t.Helper()
	book := model.SalesPriceBook{
		Code: code, Name: code, Audience: "toc", Currency: "USD",
		Status: model.SalesPriceBookStatusEnabled, CreatedBy: 1,
	}
	require.NoError(t, model.DB.Create(&book).Error)
	version := model.SalesPriceBookVersion{
		PriceBookId: book.Id, Version: 1, Status: model.SalesPriceBookVersionStatusActive,
		CostBasisStrategy: "max_eligible_cost", RepriceMode: "review",
		PaymentFeeRate: "0.04", DistributionFeeRate: "0.05", OperationsLaborRate: "0.02",
		TotalVariableCostRate: "0.11", EffectiveTaxRate: "0.16",
		TargetNetMargin: "0.03", MinimumMarginRate: "0.02",
		RoundingMode: "ceil", RoundingScale: 5, RiskAction: "exclude_channel",
		ContentHash: "hash", EffectiveFrom: at - 10, CreatedBy: 1,
	}
	require.NoError(t, model.DB.Create(&version).Error)
	item := model.SalesPriceBookItem{
		PriceBookVersionId: version.Id, ModelId: modelId, Status: "enabled",
		BillingMode: "token", PriceStructure: "flat", PriceComponents: `{}`,
		SalesBillingExpr: `v2:p / 1000000`, SalesExprHash: "hash",
		ExpressionSource: "generated", ExpressionSchemaVersion: "v2",
		PricingMethod: "fixed", Currency: "USD",
	}
	require.NoError(t, model.DB.Create(&item).Error)
	book.CurrentVersionId = &version.Id
	require.NoError(t, model.DB.Model(&model.SalesPriceBook{}).Where("id = ?", book.Id).
		Update("current_version_id", version.Id).Error)
	return book, version, item
}

func TestResolveSalesPriceUsesTOCDefaultWithoutChangingRoute(t *testing.T) {
	setupSalesPriceResolverTestDB(t)
	const at = int64(5000)
	require.NoError(t, model.DB.Create(&model.Model{Id: 701, ModelName: "default-price-model", Status: 1}).Error)
	book, version, item := createResolvedPriceFixture(t, "toc-default", 701, at)
	require.NoError(t, model.DB.Create(&model.SalesPriceBookDefault{
		DefaultKey: "toc_default", PriceBookId: book.Id, UpdatedBy: 1, UpdatedAt: at,
	}).Error)

	resolved, err := ResolveSalesPrice(10, "default-price-model", at)
	require.NoError(t, err)
	assert.Equal(t, "toc_default", resolved.Source)
	assert.Equal(t, book.Id, resolved.PriceBookId)
	assert.Equal(t, version.Id, resolved.PriceBookVersionId)
	assert.Equal(t, item.Id, resolved.PriceBookItemId)
	assert.Zero(t, resolved.AssignmentId)
}

func TestResolveSalesPricePrefersUserAssignmentOverTOCDefault(t *testing.T) {
	setupSalesPriceResolverTestDB(t)
	const at = int64(6000)
	require.NoError(t, model.DB.Create(&model.Model{Id: 702, ModelName: "assigned-price-model", Status: 1}).Error)
	defaultBook, _, _ := createResolvedPriceFixture(t, "toc-default", 702, at)
	tobBook, tobVersion, tobItem := createResolvedPriceFixture(t, "tob-large", 702, at)
	require.NoError(t, model.DB.Create(&model.SalesPriceBookDefault{
		DefaultKey: "toc_default", PriceBookId: defaultBook.Id, UpdatedBy: 1, UpdatedAt: at,
	}).Error)
	assignment := model.UserPriceBookAssignment{
		UserId: 77, PriceBookId: tobBook.Id, VersionPolicy: "follow_current",
		Status: model.PriceBookAssignmentStatusActive, EffectiveFrom: at - 1, CreatedBy: 1,
	}
	require.NoError(t, model.DB.Create(&assignment).Error)

	resolved, err := ResolveSalesPrice(77, "assigned-price-model", at)
	require.NoError(t, err)
	assert.Equal(t, "user_assignment", resolved.Source)
	assert.Equal(t, assignment.Id, resolved.AssignmentId)
	assert.Equal(t, tobVersion.Id, resolved.PriceBookVersionId)
	assert.Equal(t, tobItem.Id, resolved.PriceBookItemId)
}
