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
		&model.PricingAuditRecord{},
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
		UpstreamModelName: modelName, Status: 1,
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

func TestListSalesPriceBooksAppliesServerFiltersAndPagination(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	for _, input := range []model.SalesPriceBook{
		{Code: "toc-standard", Name: "Consumer Standard", Audience: "toc", Currency: "USD"},
		{Code: "tob-enterprise-a", Name: "Enterprise Alpha", Audience: "tob", Currency: "USD"},
		{Code: "tob-enterprise-b", Name: "Enterprise Beta", Audience: "tob", Currency: "USD"},
	} {
		book := input
		require.NoError(t, CreateSalesPriceBook(&book, 1))
	}

	items, total, err := ListSalesPriceBooks(SalesPriceBookListFilter{
		Keyword: "ENTERPRISE", Audience: "tob", Status: "draft", Page: 1, PageSize: 1,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	require.Len(t, items, 1)
	assert.Equal(t, "tob-enterprise-b", items[0].Code)

	items, total, err = ListSalesPriceBooks(SalesPriceBookListFilter{
		Keyword: "enterprise", Audience: "tob", Status: "draft", Page: 2, PageSize: 1,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	require.Len(t, items, 1)
	assert.Equal(t, "tob-enterprise-a", items[0].Code)

	_, _, err = ListSalesPriceBooks(SalesPriceBookListFilter{Audience: "partner"})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unsupported")
}

func TestListUserPriceBookAssignmentsSearchesUsernameAndReturnsBookIdentity(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create([]model.User{
		{Id: 611, Username: "acme-owner", Password: "12345678", AffCode: "aff-acme"},
		{Id: 612, Username: "other-owner", Password: "12345678", AffCode: "aff-other"},
	}).Error)
	book := model.SalesPriceBook{
		Code: "acme-contract", Name: "ACME Contract", Audience: "tob", Currency: "USD",
	}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	require.NoError(t, model.DB.Create([]model.UserPriceBookAssignment{
		{
			UserId: 611, PriceBookId: book.Id, VersionPolicy: "follow_current",
			Status: model.PriceBookAssignmentStatusActive, EffectiveFrom: 1,
		},
		{
			UserId: 612, PriceBookId: book.Id, VersionPolicy: "follow_current",
			Status: model.PriceBookAssignmentStatusExpired, EffectiveFrom: 1,
		},
	}).Error)

	items, total, err := ListUserPriceBookAssignments(UserPriceBookAssignmentListFilter{
		Keyword: "ACME-OWNER", Status: model.PriceBookAssignmentStatusActive,
		Page: 1, PageSize: 200,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, items, 1)
	assert.Equal(t, "acme-owner", items[0].Username)
	assert.Equal(t, "ACME Contract", items[0].PriceBookName)
	assert.Equal(t, "acme-contract", items[0].PriceBookCode)
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

	var audit model.PricingAuditRecord
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

	var audit model.PricingAuditRecord
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

func TestCompareSalesPriceBookVersionsReturnsReferencePriceMarginAndSources(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	createSalesPriceBookPurchaseSource(t, 1011, 1021, 1031, "diff-model", "1", "2")
	book := model.SalesPriceBook{
		Code: "diff-book", Name: "Diff Book", Audience: "tob", Currency: "USD",
	}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	base := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&base, 1))
	generated, err := GenerateSalesPriceBookItems(base.Id, SalesPriceBookGenerationInput{
		ChannelModelIds: []int{1021}, IdempotencyKey: "diff-base-generation",
	}, 1)
	require.NoError(t, err)
	require.Len(t, generated.GeneratedItems, 1)
	require.NoError(t, PublishSalesPriceBookVersion(base.Id, 1))
	target, err := CloneSalesPriceBookVersion(book.Id, base.Id, 2)
	require.NoError(t, err)
	var targetItem model.SalesPriceBookItem
	require.NoError(t, model.DB.First(
		&targetItem, "price_book_version_id = ? AND model_id = ?", target.Id, 1031,
	).Error)
	targetItem.SalesBillingExpr = `v2:(p * 2.5 + c * 5) / 1000000`
	targetItem.PriceComponents = `{"input_unit_price":"2.5","output_unit_price":"5"}`
	require.NoError(t, SaveSalesPriceBookItem(&targetItem))

	diff, err := CompareSalesPriceBookVersions(base.Id, target.Id)
	require.NoError(t, err)
	assert.Equal(t, 1, diff.ChangedCount)
	assert.Zero(t, diff.UnchangedCount)
	require.Len(t, diff.Items, 1)
	assert.Equal(t, "changed", diff.Items[0].ChangeType)
	assert.NotEmpty(t, diff.Items[0].OldReferencePrice)
	assert.NotEmpty(t, diff.Items[0].NewReferencePrice)
	assert.NotEmpty(t, diff.Items[0].MarginBefore)
	assert.NotEmpty(t, diff.Items[0].MarginAfter)
	assert.NotEmpty(t, diff.Items[0].PriceChangeRate)
	assert.Len(t, diff.Items[0].OldPurchaseVersions, 1)
	assert.Equal(t, diff.Items[0].OldPurchaseVersions, diff.Items[0].NewPurchaseVersions)
}

func TestDesignatedChannelReferenceMarginUsesOnlySelectedPurchaseCost(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	createSalesPriceBookPurchaseSource(t, 1041, 1051, 1061, "designated-model", "1", "2")
	createSalesPriceBookPurchaseSource(t, 1042, 1052, 1061, "designated-model", "9", "18")
	book := model.SalesPriceBook{
		Code: "designated-book", Name: "Designated Book", Audience: "tob", Currency: "USD",
	}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	version := validSalesPriceBookVersion(book.Id)
	version.CostBasisStrategy = "designated_channel"
	require.NoError(t, CreateSalesPriceBookVersion(&version, 1))
	generated, err := GenerateSalesPriceBookItems(version.Id, SalesPriceBookGenerationInput{
		ChannelModelIds: []int{1051, 1052}, IdempotencyKey: "designated-reference-cost",
		DesignatedChannelModel: map[int]int{1061: 1051},
	}, 1)
	require.NoError(t, err)
	require.Len(t, generated.GeneratedItems, 1)

	_, referenceCost, _, purchaseVersions, err := salesPriceBookItemReferenceTx(
		model.DB, generated.GeneratedItems[0], version,
	)
	require.NoError(t, err)
	assert.Equal(t, "3", referenceCost)
	assert.Len(t, purchaseVersions, 2)
}

func TestPurchasePricePublishCanGenerateIdempotentSalesPriceBookDrafts(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	createSalesPriceBookPurchaseSource(t, 1111, 1121, 1131, "auto-reprice-model", "1", "2")
	book := model.SalesPriceBook{
		Code: "auto-reprice-book", Name: "Auto Reprice Book", Audience: "toc", Currency: "USD",
	}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	base := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&base, 1))
	_, err := GenerateSalesPriceBookItems(base.Id, SalesPriceBookGenerationInput{
		ChannelModelIds: []int{1121}, IdempotencyKey: "auto-reprice-base",
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishSalesPriceBookVersion(base.Id, 1))
	prices, expression, components, err := normalizeFlatTokenPrices(FlatTokenPriceInput{
		InputUnitPrice: "1.5", OutputUnitPrice: "3",
	})
	require.NoError(t, err)
	purchase := model.ChannelModelPurchasePriceVersion{
		ChannelModelId: 1121, BillingMode: "token", PricingMode: "fixed_unit_price",
		PriceStructure: "flat", PriceComponents: components,
		InputUnitPrice: prices.InputUnitPrice, OutputUnitPrice: prices.OutputUnitPrice,
		PurchaseBillingExpr: expression, ExpressionSource: "generated",
		ExpressionSchemaVersion: "v2", Currency: "USD",
	}
	require.NoError(t, CreatePurchasePriceVersion(&purchase, 2))
	require.NoError(t, PublishPurchasePriceVersion(purchase.Id))

	results, err := AutoRepriceSalesPriceBooksForPurchaseVersion(purchase.Id, 2)
	require.NoError(t, err)
	require.Len(t, results, 1)
	assert.Equal(t, book.Id, results[0].PriceBookId)
	assert.Equal(t, PricingChangeBatchStatusCompleted, results[0].Status)
	var draft model.SalesPriceBookVersion
	require.NoError(t, model.DB.First(&draft, results[0].PriceBookVersionId).Error)
	assert.Equal(t, model.SalesPriceBookVersionStatusDraft, draft.Status)
	require.NotNil(t, draft.ChangeBatchId)
	assert.Equal(t, results[0].BatchId, *draft.ChangeBatchId)
	diff, err := CompareSalesPriceBookVersions(base.Id, draft.Id)
	require.NoError(t, err)
	assert.Equal(t, 1, diff.ChangedCount)
	require.Len(t, diff.Items, 1)
	assert.Contains(t, diff.Items[0].NewPurchaseVersions, purchase.Id)
	batches, total, err := ListPricingChangeBatches(PricingChangeBatchListFilter{
		TriggerType: SalesPriceBookTriggerPurchasePricePublished,
		Status:      PricingChangeBatchStatusCompleted, Page: 1, PageSize: 200,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, batches, 1)
	assert.Equal(t, results[0].BatchId, batches[0].Id)
	_, batchItems, err := GetPricingChangeBatch(results[0].BatchId)
	require.NoError(t, err)
	require.Len(t, batchItems, 1)
	assert.Equal(t, "auto-reprice-model", batchItems[0].ModelName)
	assert.Equal(t, "Auto Reprice Book", batchItems[0].PriceBookName)

	repeated, err := AutoRepriceSalesPriceBooksForPurchaseVersion(purchase.Id, 2)
	require.NoError(t, err)
	assert.Equal(t, results, repeated)
	var versionCount int64
	require.NoError(t, model.DB.Model(&model.SalesPriceBookVersion{}).
		Where("price_book_id = ?", book.Id).Count(&versionCount).Error)
	assert.Equal(t, int64(2), versionCount)
}

func TestOfficialPricePublishCanGenerateIdempotentRatioPurchaseDrafts(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{
		Id: 1201, ModelName: "official-refresh-model", Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.Channel{
		Id: 1202, Name: "official-refresh-channel", Key: "test-key", Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 1203, ChannelId: 1202, ModelId: 1201,
		UpstreamModelName: "official-refresh-model", Status: 1,
	}).Error)
	firstOfficial, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 1201, Currency: "USD", Source: "provider-docs",
		Prices: FlatTokenPriceInput{InputUnitPrice: "2", OutputUnitPrice: "4"},
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishOfficialPriceVersion(firstOfficial.Id))
	purchase, err := CreatePurchaseDraft(PurchaseDraftInput{
		ChannelModelId: 1203, OfficialPriceVersionId: &firstOfficial.Id,
		PricingMode: "official_ratio", PurchaseDiscount: "0.5",
		QuoteReference: "contract-discount-50",
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishPurchasePriceVersion(purchase.Id))
	secondOfficial, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 1201, Currency: "USD", Source: "provider-docs",
		Prices: FlatTokenPriceInput{InputUnitPrice: "3", OutputUnitPrice: "6"},
	}, 2)
	require.NoError(t, err)
	require.NoError(t, PublishOfficialPriceVersion(secondOfficial.Id))

	results, err := AutoCreatePurchaseDraftsForOfficialPrice(secondOfficial.Id, 2)
	require.NoError(t, err)
	require.Len(t, results, 1)
	assert.Equal(t, 1203, results[0].ChannelModelId)
	assert.Equal(t, PricingChangeBatchItemStatusGenerated, results[0].Status)
	var refreshed model.ChannelModelPurchasePriceVersion
	require.NoError(t, model.DB.First(&refreshed, results[0].PurchasePriceVersionId).Error)
	assert.Equal(t, model.PricingVersionStatusDraft, refreshed.Status)
	require.NotNil(t, refreshed.OfficialPriceVersionId)
	assert.Equal(t, secondOfficial.Id, *refreshed.OfficialPriceVersionId)
	assert.Equal(t, "0.5", refreshed.PurchaseDiscount)
	assert.NotEqual(t, purchase.PurchaseExprHash, refreshed.PurchaseExprHash)

	repeated, err := AutoCreatePurchaseDraftsForOfficialPrice(secondOfficial.Id, 2)
	require.NoError(t, err)
	assert.Equal(t, results, repeated)
}
