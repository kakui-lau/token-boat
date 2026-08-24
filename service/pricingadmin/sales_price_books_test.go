package pricingadmin

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupSalesPriceBookTestDB(t *testing.T) {
	t.Helper()
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.AutoMigrate(
		&model.User{},
		&model.SalesPriceBook{},
		&model.SalesPriceBookVersion{},
		&model.SalesPriceBookItem{},
		&model.SalesPriceBookItemBasisSource{},
		&model.SalesPriceBookDefault{},
		&model.UserPriceBookAssignment{},
		&model.PricingChangeBatch{},
		&model.PricingChangeBatchItem{},
		&model.PricingApprovalRecord{},
	))
}

func validSalesPriceBookVersion(bookId int) model.SalesPriceBookVersion {
	return model.SalesPriceBookVersion{
		PriceBookId:           bookId,
		CostBasisStrategy:     "max_eligible_cost",
		RepriceMode:           "review",
		PaymentFeeRate:        "0.04",
		DistributionFeeRate:   "0.05",
		OperationsLaborRate:   "0.02",
		TotalVariableCostRate: "0.11",
		EffectiveTaxRate:      "0.16",
		TargetNetMargin:       "0.03",
		MinimumMarginRate:     "0.02",
		RoundingMode:          "ceil",
		RoundingScale:         5,
		RiskAction:            "exclude_channel",
	}
}

func TestSalesPriceBookPublishesOneLogicalModelPriceIndependentOfChannel(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 501, ModelName: "price-book-model"}).Error)

	book := model.SalesPriceBook{Code: "toc-default", Name: "TOC Default", Audience: "toc", Currency: "usd"}
	require.NoError(t, CreateSalesPriceBook(&book, 7))
	version := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&version, 7))

	item := model.SalesPriceBookItem{
		PriceBookVersionId:      version.Id,
		ModelId:                 501,
		Status:                  SalesPriceItemStatusEnabled,
		BillingMode:             "token",
		PriceStructure:          "flat",
		PriceComponents:         `{}`,
		SalesBillingExpr:        `tier("base", (p * 2 + c * 4) / 1000000)`,
		ExpressionSource:        "generated",
		ExpressionSchemaVersion: "v2",
		PricingMethod:           "cost_plus",
		Currency:                "USD",
	}
	require.NoError(t, SaveSalesPriceBookItem(&item))
	require.NoError(t, PublishSalesPriceBookVersion(version.Id, 8))

	var storedBook model.SalesPriceBook
	require.NoError(t, model.DB.First(&storedBook, book.Id).Error)
	require.NotNil(t, storedBook.CurrentVersionId)
	assert.Equal(t, version.Id, *storedBook.CurrentVersionId)
	assert.Equal(t, model.SalesPriceBookStatusEnabled, storedBook.Status)

	var storedVersion model.SalesPriceBookVersion
	require.NoError(t, model.DB.First(&storedVersion, version.Id).Error)
	assert.Equal(t, model.SalesPriceBookVersionStatusActive, storedVersion.Status)
	assert.NotEmpty(t, storedVersion.ContentHash)
	assert.Equal(t, "v2:tier(\"base\", (p * 2 + c * 4) / 1000000)", item.SalesBillingExpr)
}

func TestSalesPriceBookRejectsVariableCostBreakdownMismatch(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	book := model.SalesPriceBook{Code: "invalid-rates", Name: "Invalid Rates", Audience: "tob", Currency: "USD"}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	version := validSalesPriceBookVersion(book.Id)
	version.TotalVariableCostRate = "0.12"

	err := CreateSalesPriceBookVersion(&version, 1)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "must equal")
}

func TestUserPriceBookAssignmentReplacesPreviousActiveBinding(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create(&model.User{Id: 601, Username: "enterprise-user", Password: "12345678"}).Error)
	require.NoError(t, model.DB.Create(&model.Model{Id: 602, ModelName: "assignment-model"}).Error)

	books := make([]model.SalesPriceBook, 2)
	for index, code := range []string{"tob-standard", "tob-large"} {
		books[index] = model.SalesPriceBook{Code: code, Name: code, Audience: "tob", Currency: "USD"}
		require.NoError(t, CreateSalesPriceBook(&books[index], 1))
		version := validSalesPriceBookVersion(books[index].Id)
		require.NoError(t, CreateSalesPriceBookVersion(&version, 1))
		item := model.SalesPriceBookItem{
			PriceBookVersionId: version.Id, ModelId: 602,
			Status: SalesPriceItemStatusEnabled, BillingMode: "token", PriceStructure: "flat",
			PriceComponents: `{}`, SalesBillingExpr: `v2:p / 1000000`,
			ExpressionSource: "generated", ExpressionSchemaVersion: "v2",
			PricingMethod: "fixed", Currency: "USD",
		}
		require.NoError(t, SaveSalesPriceBookItem(&item))
		require.NoError(t, PublishSalesPriceBookVersion(version.Id, 1))
	}

	first := model.UserPriceBookAssignment{UserId: 601, PriceBookId: books[0].Id, VersionPolicy: "follow_current"}
	require.NoError(t, AssignUserToSalesPriceBook(&first, 1))
	second := model.UserPriceBookAssignment{UserId: 601, PriceBookId: books[1].Id, VersionPolicy: "follow_current"}
	require.NoError(t, AssignUserToSalesPriceBook(&second, 1))

	var storedFirst model.UserPriceBookAssignment
	require.NoError(t, model.DB.First(&storedFirst, first.Id).Error)
	assert.Equal(t, model.PriceBookAssignmentStatusExpired, storedFirst.Status)
	assert.NotZero(t, storedFirst.EffectiveTo)

	var storedSecond model.UserPriceBookAssignment
	require.NoError(t, model.DB.First(&storedSecond, second.Id).Error)
	assert.Equal(t, model.PriceBookAssignmentStatusActive, storedSecond.Status)
}
