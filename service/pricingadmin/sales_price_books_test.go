package pricingadmin

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupSalesPriceBookTestDB(t *testing.T) {
	t.Helper()
	setupPricingAdminTestDB(t)
	require.NoError(t, model.DB.AutoMigrate(
		&model.User{},
		&model.Channel{},
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

func createSalesPriceBookPurchaseSource(
	t *testing.T,
	channelId int,
	channelModelId int,
	modelId int,
	modelName string,
	inputPrice string,
	outputPrice string,
) {
	t.Helper()
	var modelCount int64
	require.NoError(t, model.DB.Model(&model.Model{}).Where("id = ?", modelId).Count(&modelCount).Error)
	if modelCount == 0 {
		require.NoError(t, model.DB.Create(&model.Model{Id: modelId, ModelName: modelName, Status: 1}).Error)
	}
	require.NoError(t, model.DB.Create(&model.Channel{
		Id: channelId, Name: "channel-" + inputPrice, Key: "test-key", Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: channelModelId, ChannelId: channelId, ModelId: modelId,
		UpstreamModelName: modelName, Status: 1, RuntimeMode: "v2",
	}).Error)
	components, err := marshalFlatPriceComponents(FlatTokenPriceInput{
		InputUnitPrice: inputPrice, OutputUnitPrice: outputPrice,
	})
	require.NoError(t, err)
	_, expression, _, err := normalizeFlatTokenPrices(FlatTokenPriceInput{
		InputUnitPrice: inputPrice, OutputUnitPrice: outputPrice,
	})
	require.NoError(t, err)
	require.NoError(t, model.DB.Create(&model.ChannelModelPurchasePriceVersion{
		ChannelModelId: channelModelId, BillingMode: "token", PricingMode: "fixed",
		PriceStructure: "flat", PriceComponents: components,
		PurchaseBillingExpr: expression, PurchaseExprHash: billingexpr.ExprHashString(expression),
		ExpressionSource: "generated", ExpressionSchemaVersion: "v2", Currency: "USD",
		Version: 1, Status: model.PricingVersionStatusActive, EffectiveFrom: 1,
	}).Error)
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

func TestCloneSalesPriceBookVersionCopiesItemsAndBasisSourcesIntoDraft(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 701, ModelName: "clone-model"}).Error)

	book := model.SalesPriceBook{Code: "clone-book", Name: "Clone Book", Audience: "tob", Currency: "USD"}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	version := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&version, 1))
	item := model.SalesPriceBookItem{
		PriceBookVersionId: version.Id, ModelId: 701,
		Status: SalesPriceItemStatusEnabled, BillingMode: "token", PriceStructure: "flat",
		PriceComponents: `{}`, SalesBillingExpr: `v2:p / 1000000`,
		ExpressionSource: "generated", ExpressionSchemaVersion: "v2",
		PricingMethod: "cost_plus", Currency: "USD",
	}
	require.NoError(t, SaveSalesPriceBookItem(&item))
	require.NoError(t, model.DB.Create(&model.SalesPriceBookItemBasisSource{
		PriceBookItemId: item.Id, ChannelModelId: 801, PurchasePriceVersionId: 901,
		TierKey: "base", ComponentKey: "input", SourceRole: "selected",
		SourceValue: "1.25", SelectionReason: "maximum eligible cost",
	}).Error)
	require.NoError(t, PublishSalesPriceBookVersion(version.Id, 2))

	cloned, err := CloneSalesPriceBookVersion(book.Id, version.Id, 3)
	require.NoError(t, err)
	assert.Equal(t, int64(2), cloned.Version)
	assert.Equal(t, model.SalesPriceBookVersionStatusDraft, cloned.Status)
	assert.Zero(t, cloned.PublishedAt)

	var clonedItems []model.SalesPriceBookItem
	require.NoError(t, model.DB.Where("price_book_version_id = ?", cloned.Id).Find(&clonedItems).Error)
	require.Len(t, clonedItems, 1)
	assert.NotEqual(t, item.Id, clonedItems[0].Id)
	assert.Equal(t, item.SalesExprHash, clonedItems[0].SalesExprHash)
	var clonedSources []model.SalesPriceBookItemBasisSource
	require.NoError(t, model.DB.Where("price_book_item_id = ?", clonedItems[0].Id).Find(&clonedSources).Error)
	require.Len(t, clonedSources, 1)
	assert.Equal(t, "maximum eligible cost", clonedSources[0].SelectionReason)

	var audit model.PricingApprovalRecord
	require.NoError(t, model.DB.Where(
		"object_type = ? AND object_id = ? AND action = ?",
		"sales_price_book_version", cloned.Id, "clone",
	).First(&audit).Error)
	assert.Equal(t, 3, audit.OperatorId)
}

func TestCancelUserPriceBookAssignmentPreservesHistory(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create(&model.User{Id: 702, Username: "cancel-user", Password: "12345678"}).Error)
	require.NoError(t, model.DB.Create(&model.Model{Id: 703, ModelName: "cancel-model"}).Error)

	book := model.SalesPriceBook{Code: "cancel-book", Name: "Cancel Book", Audience: "tob", Currency: "USD"}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	version := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&version, 1))
	item := model.SalesPriceBookItem{
		PriceBookVersionId: version.Id, ModelId: 703,
		Status: SalesPriceItemStatusEnabled, BillingMode: "token", PriceStructure: "flat",
		PriceComponents: `{}`, SalesBillingExpr: `v2:p / 1000000`,
		ExpressionSource: "generated", ExpressionSchemaVersion: "v2",
		PricingMethod: "fixed", Currency: "USD",
	}
	require.NoError(t, SaveSalesPriceBookItem(&item))
	require.NoError(t, PublishSalesPriceBookVersion(version.Id, 1))
	assignment := model.UserPriceBookAssignment{
		UserId: 702, PriceBookId: book.Id, VersionPolicy: "follow_current",
		ContractReference: "CONTRACT-2026-001",
	}
	require.NoError(t, AssignUserToSalesPriceBook(&assignment, 4))
	require.NoError(t, CancelUserPriceBookAssignment(assignment.Id, 5))

	var stored model.UserPriceBookAssignment
	require.NoError(t, model.DB.First(&stored, assignment.Id).Error)
	assert.Equal(t, model.PriceBookAssignmentStatusCancelled, stored.Status)
	assert.NotZero(t, stored.EffectiveTo)
	assert.Equal(t, "CONTRACT-2026-001", stored.ContractReference)

	err := CancelUserPriceBookAssignment(assignment.Id, 5)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "only active or scheduled")
}

func TestDisableSalesPriceBookKeepsPublishedHistoryAndWritesAudit(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	book := model.SalesPriceBook{Code: "disable-book", Name: "Disable Book", Audience: "toc", Currency: "USD"}
	require.NoError(t, CreateSalesPriceBook(&book, 1))

	require.NoError(t, DisableSalesPriceBook(book.Id, 9))
	var stored model.SalesPriceBook
	require.NoError(t, model.DB.First(&stored, book.Id).Error)
	assert.Equal(t, model.SalesPriceBookStatusDisabled, stored.Status)

	var audit model.PricingApprovalRecord
	require.NoError(t, model.DB.Where(
		"object_type = ? AND object_id = ? AND action = ?",
		"sales_price_book", book.Id, "disable",
	).First(&audit).Error)
	assert.Equal(t, 9, audit.OperatorId)
}

func TestGenerateSalesPriceBookItemsUsesComponentMaximumAcrossChannels(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	createSalesPriceBookPurchaseSource(t, 811, 821, 831, "generation-model", "2", "3")
	createSalesPriceBookPurchaseSource(t, 812, 822, 831, "generation-model", "1", "5")

	book := model.SalesPriceBook{Code: "generation-book", Name: "Generation Book", Audience: "toc", Currency: "USD"}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	version := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&version, 1))

	result, err := GenerateSalesPriceBookItems(version.Id, SalesPriceBookGenerationInput{
		ChannelModelIds: []int{821, 822, 821}, IdempotencyKey: "generation-maximum-831",
	}, 7)
	require.NoError(t, err)
	assert.Equal(t, PricingChangeBatchStatusCompleted, result.Batch.Status)
	assert.Equal(t, 1, result.Batch.TotalCount)
	assert.Equal(t, 1, result.Batch.ChangedCount)
	require.Len(t, result.GeneratedItems, 1)

	prices, err := unmarshalFlatPriceComponents(result.GeneratedItems[0].PriceComponents)
	require.NoError(t, err)
	assert.Equal(t, "2.34114", prices.InputUnitPrice)
	assert.Equal(t, "5.85285", prices.OutputUnitPrice)
	assert.Nil(t, result.GeneratedItems[0].PrimaryPurchaseVersionId)
	listedItems, err := ListSalesPriceBookItems(version.Id)
	require.NoError(t, err)
	require.Len(t, listedItems, 1)
	assert.Equal(t, "generation-model", listedItems[0].ModelName)

	var basisSources []model.SalesPriceBookItemBasisSource
	require.NoError(t, model.DB.Where(
		"price_book_item_id = ?", result.GeneratedItems[0].Id,
	).Order("channel_model_id ASC").Find(&basisSources).Error)
	require.Len(t, basisSources, 2)
	assert.Equal(t, "cost_basis", basisSources[0].SourceRole)
	assert.Equal(t, "cost_basis", basisSources[1].SourceRole)

	repeated, err := GenerateSalesPriceBookItems(version.Id, SalesPriceBookGenerationInput{
		ChannelModelIds: []int{821, 822}, IdempotencyKey: "generation-maximum-831",
	}, 7)
	require.NoError(t, err)
	assert.Equal(t, result.Batch.Id, repeated.Batch.Id)
	require.Len(t, repeated.GeneratedItems, 1)
}

func TestGenerateSalesPriceBookItemsMarksUnsafeExpressionComparisonForReview(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	createSalesPriceBookPurchaseSource(t, 911, 921, 931, "review-model", "1", "2")
	createSalesPriceBookPurchaseSource(t, 912, 922, 931, "review-model", "1", "2")
	require.NoError(t, model.DB.Model(&model.ChannelModelPurchasePriceVersion{}).
		Where("channel_model_id = ?", 922).
		Updates(map[string]any{
			"billing_mode": "video_duration", "price_structure": "expression",
			"price_components": `{}`, "purchase_billing_expr": `v2:seconds * 0.1`,
		}).Error)

	book := model.SalesPriceBook{Code: "review-book", Name: "Review Book", Audience: "tob", Currency: "USD"}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	version := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&version, 1))

	result, err := GenerateSalesPriceBookItems(version.Id, SalesPriceBookGenerationInput{
		ChannelModelIds: []int{921, 922}, IdempotencyKey: "generation-review-931",
	}, 8)
	require.NoError(t, err)
	assert.Equal(t, PricingChangeBatchStatusReviewRequired, result.Batch.Status)
	assert.Equal(t, 1, result.Batch.ReviewCount)
	assert.Empty(t, result.GeneratedItems)

	var batchItem model.PricingChangeBatchItem
	require.NoError(t, model.DB.First(&batchItem, "batch_id = ?", result.Batch.Id).Error)
	assert.Equal(t, PricingChangeBatchItemStatusReview, batchItem.Status)
	assert.Contains(t, batchItem.ErrorMessage, "same billing mode")
}
