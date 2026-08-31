package pricingadmin

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
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
		&model.SalesPriceBookItemCostSource{},
		&model.SalesPriceBookChannelModelOverride{},
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

func TestListSalesPriceBookItemsWarnsWithoutBlockingAboveOfficialPrice(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{
		Id: 690, ModelName: "above-official-model", Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.SalesPriceBook{
		Id: 691, Code: "above-official-book", Name: "Above Official Book",
		Audience: "tob", Currency: "USD", Status: model.SalesPriceBookStatusDraft,
	}).Error)
	require.NoError(t, model.DB.Create(&model.SalesPriceBookVersion{
		Id: 692, PriceBookId: 691, Version: 1,
		Status:         model.SalesPriceBookVersionStatusDraft,
		PaymentFeeRate: "0.04", DistributionFeeRate: "0.05",
		OperationsLaborRate: "0.02", TotalVariableCostRate: "0.11",
		EffectiveTaxRate: "0.16", TargetNetMargin: "0.03",
		MinimumMarginRate: "0.02",
	}).Error)
	pricingConfig, err := common.Marshal(map[string]string{"official_discount": "1.05"})
	require.NoError(t, err)
	require.NoError(t, model.DB.Create(&model.SalesPriceBookItem{
		Id: 693, PriceBookVersionId: 692, ModelId: 690,
		Status: SalesPriceItemStatusEnabled, BillingMode: "token",
		PriceStructure: "flat", SalesBillingExpr: `v2:tier("base", p)`,
		SalesExprHash:    billingexpr.ExprHashString(`v2:tier("base", p)`),
		ExpressionSource: "manual", ExpressionSchemaVersion: "v2",
		PricingMethod: "official_discount", PricingConfig: string(pricingConfig),
		Currency: "USD",
	}).Error)

	items, err := ListSalesPriceBookItems(692)
	require.NoError(t, err)
	require.Len(t, items, 1)
	assert.Equal(t, SalesPriceItemStatusEnabled, items[0].Status)
	assert.Equal(t, "above_official_price", items[0].WarningCode)
	assert.Equal(t, "1.05", items[0].WarningSalesDiscount)
}

func TestChannelModelOverrideMarksGeneratedLogicalModelPriceForRegeneration(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{
		Id: 701, ModelName: "special-policy-model", Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.Channel{
		Id: 702, Name: "special-policy-channel", Status: common.ChannelStatusEnabled,
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 703, ChannelId: 702, ModelId: 701,
		UpstreamModelName: "special-policy-model", Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.SalesPriceBook{
		Id: 704, Code: "special-policy-book", Name: "Special Policy Book",
		Audience: "tob", Currency: "USD", Status: model.SalesPriceBookStatusDraft,
	}).Error)
	require.NoError(t, model.DB.Create(&model.SalesPriceBookVersion{
		Id: 705, PriceBookId: 704, Version: 1,
		Status:            model.SalesPriceBookVersionStatusDraft,
		CostBasisStrategy: "max_eligible_cost",
		PaymentFeeRate:    "0.04", DistributionFeeRate: "0.05",
		OperationsLaborRate: "0.02", TotalVariableCostRate: "0.11",
		EffectiveTaxRate: "0.16", TargetNetMargin: "0.03",
		MinimumMarginRate: "0.02",
	}).Error)
	require.NoError(t, model.DB.Create(&model.SalesPriceBookItem{
		Id: 706, PriceBookVersionId: 705, ModelId: 701,
		Status: SalesPriceItemStatusEnabled, BillingMode: "token",
		PriceStructure: "flat", SalesBillingExpr: `v2:tier("base", p)`,
		SalesExprHash:    billingexpr.ExprHashString(`v2:tier("base", p)`),
		ExpressionSource: "generated", ExpressionSchemaVersion: "v2",
		PricingMethod: "cost_plus", Currency: "USD",
	}).Error)

	zero := "0"
	saved, err := SaveSalesPriceBookChannelModelOverride(
		705, 703,
		&model.SalesPriceBookChannelModelOverride{
			PaymentFeeRate: &zero, Remark: "direct contract processing",
		},
		99,
	)
	require.NoError(t, err)
	require.NotNil(t, saved.PaymentFeeRate)
	assert.Equal(t, "0", *saved.PaymentFeeRate)
	var item model.SalesPriceBookItem
	require.NoError(t, model.DB.First(&item, 706).Error)
	assert.Equal(t, SalesPriceItemStatusReviewRequired, item.Status)
	require.NotNil(t, item.GeneratedByBatchId)
	var review model.PricingChangeBatchItem
	require.NoError(t, model.DB.Where(
		"batch_id = ? AND target_id = ?", *item.GeneratedByBatchId, item.Id,
	).First(&review).Error)
	assert.Equal(t, "channel_model_policy_changed", review.RiskCode)
	err = AcceptSalesPriceBookItemReview(item.Id, 99, "accept stale price")
	require.ErrorContains(t, err, "regenerate the model price")
	err = RejectSalesPriceBookItemReview(item.Id, 99, "reject stale price")
	require.ErrorContains(t, err, "regenerate the model price")
	priceInput, expression, _, err := normalizeFlatTokenPrices(FlatTokenPriceInput{
		InputUnitPrice: "1", OutputUnitPrice: "2",
	})
	require.NoError(t, err)
	components, err := marshalFlatPriceComponents(priceInput)
	require.NoError(t, err)
	require.NoError(t, model.DB.Create(&model.ChannelModelPurchasePriceVersion{
		ChannelModelId: 703, BillingMode: "token", PricingMode: "fixed",
		PriceStructure: "flat", PriceComponents: components,
		PurchaseBillingExpr: expression, PurchaseExprHash: billingexpr.ExprHashString(expression),
		ExpressionSource: "generated", ExpressionSchemaVersion: "v2", Currency: "USD",
		Version: 1, Status: model.PricingVersionStatusActive, EffectiveFrom: 1,
	}).Error)
	result, err := GenerateSalesPriceBookItems(705, SalesPriceBookGenerationInput{
		ChannelModelIds: []int{703}, IdempotencyKey: "regenerate-special-policy-model",
	}, 99)
	require.NoError(t, err)
	require.Len(t, result.GeneratedItems, 1)
	assert.Equal(t, 706, result.GeneratedItems[0].Id)
	require.NoError(t, model.DB.First(&item, 706).Error)
	assert.Equal(t, SalesPriceItemStatusEnabled, item.Status)
	require.NoError(t, model.DB.First(&review, review.Id).Error)
	assert.Equal(t, PricingChangeBatchItemStatusRejected, review.Status)
	var audit model.PricingAuditRecord
	require.NoError(t, model.DB.First(
		&audit,
		"object_type = ? AND object_id = ? AND action = ?",
		"sales_price_book_version", 705, "save_channel_model_override",
	).Error)
	assert.Equal(t, 99, audit.OperatorId)

	rows, err := ListSalesPriceBookChannelModelOverrides(705)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, "0.07", rows[0].EffectiveTotalVariableCostRate)

	minimumMargin := "0.01"
	saved, err = SaveSalesPriceBookChannelModelOverride(
		705, 703,
		&model.SalesPriceBookChannelModelOverride{
			MinimumMarginRate: &minimumMargin,
			Remark:            "payment fee inherits version default",
		},
		99,
	)
	require.NoError(t, err)
	assert.Nil(t, saved.PaymentFeeRate)
	require.NotNil(t, saved.MinimumMarginRate)
	assert.Equal(t, "0.01", *saved.MinimumMarginRate)
	rows, err = ListSalesPriceBookChannelModelOverrides(705)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, "0.11", rows[0].EffectiveTotalVariableCostRate)
}

func TestListSalesPriceBookChannelModelOverridesReturnsEmptyList(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	book := model.SalesPriceBook{
		Code: "empty-overrides", Name: "Empty Overrides", Audience: "tob", Currency: "USD",
	}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	version := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&version, 1))

	rows, err := ListSalesPriceBookChannelModelOverrides(version.Id)
	require.NoError(t, err)
	require.NotNil(t, rows)
	assert.Empty(t, rows)
}

func TestChannelModelOverrideRequiresReviewForManualLogicalModelPrice(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{
		Id: 711, ModelName: "manual-policy-model", Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.Channel{
		Id: 712, Name: "manual-policy-channel", Status: common.ChannelStatusEnabled,
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 713, ChannelId: 712, ModelId: 711,
		UpstreamModelName: "manual-policy-model", Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.SalesPriceBook{
		Id: 714, Code: "manual-policy-book", Name: "Manual Policy Book",
		Audience: "tob", Currency: "USD", Status: model.SalesPriceBookStatusDraft,
	}).Error)
	require.NoError(t, model.DB.Create(&model.SalesPriceBookVersion{
		Id: 715, PriceBookId: 714, Version: 1,
		Status:            model.SalesPriceBookVersionStatusDraft,
		CostBasisStrategy: "max_eligible_cost",
		PaymentFeeRate:    "0.04", DistributionFeeRate: "0.05",
		OperationsLaborRate: "0.02", TotalVariableCostRate: "0.11",
		EffectiveTaxRate: "0.16", TargetNetMargin: "0.03",
		MinimumMarginRate: "0.02",
	}).Error)
	require.NoError(t, model.DB.Create(&model.SalesPriceBookItem{
		Id: 716, PriceBookVersionId: 715, ModelId: 711,
		Status: SalesPriceItemStatusEnabled, BillingMode: "token",
		PriceStructure: "flat", SalesBillingExpr: `v2:tier("base", p)`,
		SalesExprHash:    billingexpr.ExprHashString(`v2:tier("base", p)`),
		ExpressionSource: "manual", ExpressionSchemaVersion: "v2",
		PricingMethod: "manual", Currency: "USD",
	}).Error)

	reduced := "0.01"
	_, err := SaveSalesPriceBookChannelModelOverride(
		715, 713,
		&model.SalesPriceBookChannelModelOverride{PaymentFeeRate: &reduced},
		99,
	)
	require.NoError(t, err)
	var item model.SalesPriceBookItem
	require.NoError(t, model.DB.First(&item, 716).Error)
	assert.Equal(t, SalesPriceItemStatusReviewRequired, item.Status)
	require.NotNil(t, item.GeneratedByBatchId)
	var review model.PricingChangeBatchItem
	require.NoError(t, model.DB.Where(
		"batch_id = ? AND target_id = ?", *item.GeneratedByBatchId, item.Id,
	).First(&review).Error)
	assert.Equal(t, "channel_model_policy_changed", review.RiskCode)
}

func validSalesPriceBookVersion(bookId int) model.SalesPriceBookVersion {
	return model.SalesPriceBookVersion{
		PriceBookId:           bookId,
		CostBasisStrategy:     "max_eligible_cost",
		PaymentFeeRate:        "0.04",
		DistributionFeeRate:   "0.05",
		OperationsLaborRate:   "0.02",
		TotalVariableCostRate: "0.11",
		EffectiveTaxRate:      "0.16",
		TargetNetMargin:       "0.03",
		MinimumMarginRate:     "0.02",
	}
}

func TestCreateSalesPriceBookVersionDerivesVariableCostWithoutLegacyColumn(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	book := model.SalesPriceBook{
		Code: "derived-variable-cost", Name: "Derived Variable Cost",
		Audience: "tob", Currency: "USD",
	}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	version := validSalesPriceBookVersion(book.Id)
	version.TotalVariableCostRate = ""

	require.NoError(t, CreateSalesPriceBookVersion(&version, 1))
	assert.Equal(t, "0.11", version.TotalVariableCostRate)
	assert.False(t, model.DB.Migrator().HasColumn(
		&legacySalesPriceBookVersionInsert{}, "LegacyTotalVariableCostRate",
	))
}

func TestSalesPriceBookVersionWritesSupportLegacyRequiredVariableCostColumn(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Exec(
		"ALTER TABLE sales_price_book_versions ADD COLUMN total_variable_cost_rate decimal(18,12) NOT NULL",
	).Error)
	book := model.SalesPriceBook{
		Code: "legacy-variable-cost", Name: "Legacy Variable Cost",
		Audience: "tob", Currency: "USD",
	}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	version := validSalesPriceBookVersion(book.Id)
	version.TotalVariableCostRate = ""
	require.NoError(t, CreateSalesPriceBookVersion(&version, 1))

	var stored string
	require.NoError(t, model.DB.Table("sales_price_book_versions").
		Where("id = ?", version.Id).
		Pluck("total_variable_cost_rate", &stored).Error)
	assert.Equal(t, "0.11", stored)

	version.DistributionFeeRate = "0.03"
	require.NoError(t, UpdateSalesPriceBookVersionDraft(&version, 1))
	require.NoError(t, model.DB.Table("sales_price_book_versions").
		Where("id = ?", version.Id).
		Pluck("total_variable_cost_rate", &stored).Error)
	assert.Equal(t, "0.09", stored)

	cloned, err := CloneSalesPriceBookVersion(book.Id, version.Id, 1)
	require.NoError(t, err)
	require.NoError(t, model.DB.Table("sales_price_book_versions").
		Where("id = ?", cloned.Id).
		Pluck("total_variable_cost_rate", &stored).Error)
	assert.Equal(t, "0.09", stored)
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
	require.NoError(t, SaveSalesPriceBookItem(&item, 1))
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

func TestSalesPriceBookDerivesVariableCostFromBreakdown(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	book := model.SalesPriceBook{Code: "invalid-rates", Name: "Invalid Rates", Audience: "tob", Currency: "USD"}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	version := validSalesPriceBookVersion(book.Id)
	version.TotalVariableCostRate = "0.12"

	require.NoError(t, CreateSalesPriceBookVersion(&version, 1))
	var stored model.SalesPriceBookVersion
	require.NoError(t, model.DB.First(&stored, version.Id).Error)
	assert.Equal(t, "0.11", stored.TotalVariableCostRate)
}

func TestSalesPriceBookVersionDefaultsOptionalIncreaseCapToZero(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	book := model.SalesPriceBook{
		Code: "default-increase-cap", Name: "Default Increase Cap", Audience: "toc", Currency: "USD",
	}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	version := validSalesPriceBookVersion(book.Id)
	version.IncreaseCapRate = ""

	require.NoError(t, CreateSalesPriceBookVersion(&version, 1))

	var stored model.SalesPriceBookVersion
	require.NoError(t, model.DB.First(&stored, version.Id).Error)
	assert.Equal(t, "0", stored.IncreaseCapRate)
}

func TestUpdatingDraftPolicyClearsOnlyStaleGeneratedPrices(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 590, ModelName: "policy-edit-model"}).Error)
	book := model.SalesPriceBook{
		Code: "policy-edit", Name: "Policy Edit", Audience: "tob", Currency: "USD",
	}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	version := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&version, 1))
	item := model.SalesPriceBookItem{
		PriceBookVersionId: version.Id, ModelId: 590, Status: SalesPriceItemStatusEnabled,
		BillingMode: "token", PriceStructure: "flat", PriceComponents: `{}`,
		SalesBillingExpr: `tier("base", (p * 2 + c * 4) / 1000000)`,
		ExpressionSource: "generated", ExpressionSchemaVersion: "v2",
		PricingMethod: "cost_plus", Currency: "USD",
	}
	require.NoError(t, SaveSalesPriceBookItem(&item, 1))

	unchanged := version
	unchanged.PaymentFeeRate = "0.040000000000"
	unchanged.DistributionFeeRate = "0.050000000000"
	unchanged.OperationsLaborRate = "0.020000000000"
	unchanged.TotalVariableCostRate = "0.110000000000"
	require.NoError(t, UpdateSalesPriceBookVersionDraft(&unchanged, 2))
	var count int64
	require.NoError(t, model.DB.Model(&model.SalesPriceBookItem{}).
		Where("price_book_version_id = ?", version.Id).Count(&count).Error)
	assert.EqualValues(t, 1, count)

	changed := unchanged
	changed.PaymentFeeRate = "0.03"
	changed.TotalVariableCostRate = "0.10"
	require.NoError(t, UpdateSalesPriceBookVersionDraft(&changed, 2))
	require.NoError(t, model.DB.Model(&model.SalesPriceBookItem{}).
		Where("price_book_version_id = ?", version.Id).Count(&count).Error)
	assert.Zero(t, count)
	var stored model.SalesPriceBookVersion
	require.NoError(t, model.DB.First(&stored, version.Id).Error)
	assert.Equal(t, "0.03", stored.PaymentFeeRate)
	assert.Equal(t, "0.1", stored.TotalVariableCostRate)
}

func TestDeleteSalesPriceBookItemDeletesDraftPriceAndBasisSources(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 502, ModelName: "delete-draft-price"}).Error)

	book := model.SalesPriceBook{Code: "delete-draft", Name: "Delete Draft", Audience: "toc", Currency: "USD"}
	require.NoError(t, CreateSalesPriceBook(&book, 7))
	version := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&version, 7))
	item := model.SalesPriceBookItem{
		PriceBookVersionId:      version.Id,
		ModelId:                 502,
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
	require.NoError(t, SaveSalesPriceBookItem(&item, 1))
	require.NoError(t, model.DB.Create(&model.SalesPriceBookItemCostSource{
		PriceBookItemId: item.Id, ChannelModelId: 11, PurchasePriceVersionId: 12,
		SourceRole: "selected",
	}).Error)

	require.NoError(t, DeleteSalesPriceBookItem(item.Id, 9))

	var itemCount int64
	require.NoError(t, model.DB.Model(&model.SalesPriceBookItem{}).
		Where("id = ?", item.Id).Count(&itemCount).Error)
	assert.Zero(t, itemCount)
	var sourceCount int64
	require.NoError(t, model.DB.Model(&model.SalesPriceBookItemCostSource{}).
		Where("price_book_item_id = ?", item.Id).Count(&sourceCount).Error)
	assert.Zero(t, sourceCount)
	var audit model.PricingAuditRecord
	require.NoError(t, model.DB.Where("object_type = ? AND object_id = ? AND action = ?",
		"sales_price_book_item", item.Id, "delete_item").First(&audit).Error)
	assert.Equal(t, 9, audit.OperatorId)
}

func TestDeleteSalesPriceBookItemRejectsActiveVersion(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 503, ModelName: "keep-active-price"}).Error)

	book := model.SalesPriceBook{Code: "keep-active", Name: "Keep Active", Audience: "toc", Currency: "USD"}
	require.NoError(t, CreateSalesPriceBook(&book, 7))
	version := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&version, 7))
	item := model.SalesPriceBookItem{
		PriceBookVersionId:      version.Id,
		ModelId:                 503,
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
	require.NoError(t, SaveSalesPriceBookItem(&item, 1))
	require.NoError(t, PublishSalesPriceBookVersion(version.Id, 8))

	err := DeleteSalesPriceBookItem(item.Id, 9)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "only draft price book items can be deleted")
	var itemCount int64
	require.NoError(t, model.DB.Model(&model.SalesPriceBookItem{}).
		Where("id = ?", item.Id).Count(&itemCount).Error)
	assert.EqualValues(t, 1, itemCount)
}

func TestSalesPriceBookEmptyVersionAndItemListsSerializeAsArrays(t *testing.T) {
	setupSalesPriceBookTestDB(t)

	versions, err := ListSalesPriceBookVersions(404)
	require.NoError(t, err)
	assert.NotNil(t, versions)
	assert.Empty(t, versions)

	items, err := ListSalesPriceBookItems(404)
	require.NoError(t, err)
	assert.NotNil(t, items)
	assert.Empty(t, items)
}

func TestSalesPriceBookRejectsItemCurrencyDifferentFromBook(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 502, ModelName: "currency-model"}).Error)
	book := model.SalesPriceBook{Code: "currency-book", Name: "Currency Book", Audience: "toc", Currency: "USD"}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	version := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&version, 1))
	item := model.SalesPriceBookItem{
		PriceBookVersionId: version.Id, ModelId: 502, Status: SalesPriceItemStatusEnabled,
		BillingMode: "token", PriceStructure: "flat", PriceComponents: `{}`,
		SalesBillingExpr: `v2:p / 1000000`, ExpressionSource: "generated",
		ExpressionSchemaVersion: "v2", PricingMethod: "fixed", Currency: "EUR",
	}

	err := SaveSalesPriceBookItem(&item, 1)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "currency must be USD")
}

func TestSalesPriceBookReviewCanBeAcceptedWithAuditComment(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 503, ModelName: "review-accept-model"}).Error)
	book := model.SalesPriceBook{Code: "review-accept", Name: "Review Accept", Audience: "tob", Currency: "USD"}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	version := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&version, 1))
	item := model.SalesPriceBookItem{
		PriceBookVersionId: version.Id, ModelId: 503, Status: SalesPriceItemStatusReviewRequired,
		BillingMode: "token", PriceStructure: "flat", PriceComponents: `{}`,
		SalesBillingExpr: `v2:p / 1000000`, ExpressionSource: "generated",
		ExpressionSchemaVersion: "v2", PricingMethod: "fixed", Currency: "USD",
	}
	require.NoError(t, SaveSalesPriceBookItem(&item, 1))

	require.NoError(t, AcceptSalesPriceBookItemReview(item.Id, 9, "accepted enterprise margin exception"))
	var stored model.SalesPriceBookItem
	require.NoError(t, model.DB.First(&stored, item.Id).Error)
	assert.Equal(t, SalesPriceItemStatusEnabled, stored.Status)
	var audit model.PricingAuditRecord
	require.NoError(t, model.DB.First(&audit, "object_type = ? AND object_id = ? AND action = ?",
		"sales_price_book_item", item.Id, "accept_risk").Error)
	assert.Equal(t, 9, audit.OperatorId)
	assert.Equal(t, "accepted enterprise margin exception", audit.Comment)
}

func TestListSalesPriceBookItemsIncludesPendingReviewReason(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 504, ModelName: "review-reason-model"}).Error)
	book := model.SalesPriceBook{Code: "review-reason", Name: "Review Reason", Audience: "tob", Currency: "USD"}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	version := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&version, 1))
	batch := model.PricingChangeBatch{
		BatchNo: "PB-review-reason", IdempotencyKey: "review-reason",
		TriggerType: "manual_price_book_generation", Status: PricingChangeBatchStatusReviewRequired,
		RequestedBy: 1, ReviewCount: 1,
	}
	require.NoError(t, model.DB.Create(&batch).Error)
	item := model.SalesPriceBookItem{
		PriceBookVersionId: version.Id, ModelId: 504, Status: SalesPriceItemStatusReviewRequired,
		BillingMode: "token", PriceStructure: "flat", PriceComponents: `{}`,
		SalesBillingExpr: `v2:p / 1000000`, ExpressionSource: "generated",
		ExpressionSchemaVersion: "v2", PricingMethod: "fixed", Currency: "USD",
		GeneratedByBatchId: &batch.Id,
	}
	require.NoError(t, SaveSalesPriceBookItem(&item, 1))
	itemId := item.Id
	require.NoError(t, model.DB.Create(&model.PricingChangeBatchItem{
		BatchId: batch.Id, TargetType: "sales_price_book_item", TargetId: &itemId,
		ModelId: 504, PriceBookId: &book.Id, Action: "create",
		RiskCode: "below_minimum_margin", Status: PricingChangeBatchItemStatusReview,
		ErrorMessage: "generated margin is lower than the configured minimum",
	}).Error)

	items, err := ListSalesPriceBookItems(version.Id)
	require.NoError(t, err)
	require.Len(t, items, 1)
	assert.Equal(t, "below_minimum_margin", items[0].ReviewRiskCode)
	assert.Equal(t, "generated margin is lower than the configured minimum", items[0].ReviewReason)

	err = PublishSalesPriceBookVersion(version.Id, 1)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "review-reason-model")
	assert.Contains(t, err.Error(), "below_minimum_margin")
	assert.Contains(t, err.Error(), "generated margin is lower than the configured minimum")
}

func TestListSalesPriceBookItemsIncludesPurchaseAndSalesDiscounts(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 505, ModelName: "discount-model"}).Error)
	book := model.SalesPriceBook{
		Code: "discounts", Name: "Discounts", Audience: "tob", Currency: "USD",
	}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	version := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&version, 1))
	item := model.SalesPriceBookItem{
		PriceBookVersionId: version.Id, ModelId: 505, Status: SalesPriceItemStatusEnabled,
		BillingMode: "token", PriceStructure: "flat", PriceComponents: `{}`,
		SalesBillingExpr: `v2:p * 0.88 / 1000000`,
		SalesExprHash:    billingexpr.ExprHashString(`v2:p * 0.88 / 1000000`),
		ExpressionSource: "generated", ExpressionSchemaVersion: "v2",
		PricingMethod: "cost_plus", SellingFactor: "1.1", Currency: "USD",
	}
	require.NoError(t, model.DB.Create(&item).Error)

	for index, discount := range []string{"0.7", "0.8"} {
		channelId := 810 + index
		channelModelId := 910 + index
		require.NoError(t, model.DB.Create(&model.Channel{
			Id: channelId, Name: "discount-channel", Key: "test-key", Status: 1,
		}).Error)
		require.NoError(t, model.DB.Create(&model.ChannelModel{
			Id: channelModelId, ChannelId: channelId, ModelId: 505,
			UpstreamModelName: "discount-model", Status: 1,
		}).Error)
		purchase := model.ChannelModelPurchasePriceVersion{
			ChannelModelId: channelModelId, BillingMode: "token",
			PricingMode: "official_ratio", PriceStructure: "flat",
			PurchaseDiscount: discount, PurchaseBillingExpr: `v2:p / 1000000`,
			PurchaseExprHash: billingexpr.ExprHashString(`v2:p / 1000000`),
			ExpressionSource: "generated", ExpressionSchemaVersion: "v2",
			Currency: "USD", Version: 1, Status: model.PricingVersionStatusActive,
			EffectiveFrom: 1,
		}
		require.NoError(t, model.DB.Create(&purchase).Error)
		require.NoError(t, model.DB.Create(&model.SalesPriceBookItemCostSource{
			PriceBookItemId: item.Id, ChannelModelId: channelModelId,
			PurchasePriceVersionId: purchase.Id, SourceRole: "cost_basis",
		}).Error)
	}

	items, err := ListSalesPriceBookItems(version.Id)
	require.NoError(t, err)
	require.Len(t, items, 1)
	assert.Equal(t, "0.8", items[0].PurchaseDiscount)
	assert.Empty(t, items[0].SalesDiscount)
	assert.Equal(t, "0.88", items[0].ReferenceSalesPrice)
	require.Len(t, items[0].ChannelMargins, 2)
	assert.ElementsMatch(t, []string{"0.7", "0.8"}, []string{
		items[0].ChannelMargins[0].PurchaseDiscount,
		items[0].ChannelMargins[1].PurchaseDiscount,
	})
	assert.Equal(t, "cost_basis", items[0].ChannelMargins[0].SourceRole)
	assert.Equal(t, "official_ratio", items[0].ChannelMargins[0].PurchasePricingMode)
	assert.NotEmpty(t, items[0].ChannelMargins[0].ReferenceCost)
	assert.NotEmpty(t, items[0].ChannelMargins[0].MarginRate)

	require.NoError(t, model.DB.Model(&model.SalesPriceBookVersion{}).
		Where("id = ?", version.Id).Update("cost_basis_strategy", "min_eligible_cost").Error)
	items, err = ListSalesPriceBookItems(version.Id)
	require.NoError(t, err)
	require.Len(t, items, 1)
	assert.Equal(t, "0.7", items[0].PurchaseDiscount)
	assert.Empty(t, items[0].SalesDiscount)
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
	version := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&version, 1))
	require.NoError(t, model.DB.Create([]model.UserPriceBookAssignment{
		{
			UserId: 611, PriceBookId: book.Id, VersionPolicy: "pin_version",
			PinnedVersionId: &version.Id,
			Status:          model.PriceBookAssignmentStatusActive, EffectiveFrom: 1,
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
	assert.Equal(t, int64(1), items[0].PinnedVersionNumber)
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
		require.NoError(t, SaveSalesPriceBookItem(&item, 1))
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

func TestScheduledAssignmentKeepsCurrentBindingUntilCutover(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create(&model.User{Id: 613, Username: "scheduled-user", Password: "12345678"}).Error)
	now := common.GetTimestamp()
	first := model.UserPriceBookAssignment{
		UserId: 613, PriceBookId: 1, VersionPolicy: "follow_current",
		Status: model.PriceBookAssignmentStatusActive, EffectiveFrom: now - 100,
	}
	require.NoError(t, model.DB.Create(&first).Error)
	second := model.UserPriceBookAssignment{
		UserId: 613, PriceBookId: 2, VersionPolicy: "follow_current", EffectiveFrom: now + 100,
	}
	require.NoError(t, model.DB.Transaction(func(tx *gorm.DB) error {
		return model.ReplaceUserPriceBookAssignment(tx, &second)
	}))

	var storedFirst model.UserPriceBookAssignment
	require.NoError(t, model.DB.First(&storedFirst, first.Id).Error)
	assert.Equal(t, model.PriceBookAssignmentStatusActive, storedFirst.Status)
	assert.Zero(t, storedFirst.EffectiveTo)
	var storedSecond model.UserPriceBookAssignment
	require.NoError(t, model.DB.First(&storedSecond, second.Id).Error)
	assert.Equal(t, model.PriceBookAssignmentStatusScheduled, storedSecond.Status)
}

func TestInvalidAssignmentWindowDoesNotReplaceCurrentBinding(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create(&model.User{
		Id: 614, Username: "invalid-window-user", Password: "12345678",
	}).Error)
	now := common.GetTimestamp()
	current := model.UserPriceBookAssignment{
		UserId: 614, PriceBookId: 1, VersionPolicy: "follow_current",
		Status: model.PriceBookAssignmentStatusActive, EffectiveFrom: now - 100,
	}
	require.NoError(t, model.DB.Create(&current).Error)
	invalid := model.UserPriceBookAssignment{
		UserId: 614, PriceBookId: 2, VersionPolicy: "follow_current",
		EffectiveFrom: now + 100, EffectiveTo: now + 50,
	}

	err := model.DB.Transaction(func(tx *gorm.DB) error {
		return model.ReplaceUserPriceBookAssignment(tx, &invalid)
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "effective end must be after its start")

	require.NoError(t, model.DB.First(&current, current.Id).Error)
	assert.Equal(t, model.PriceBookAssignmentStatusActive, current.Status)
	assert.Zero(t, current.EffectiveTo)
	var assignmentCount int64
	require.NoError(t, model.DB.Model(&model.UserPriceBookAssignment{}).
		Where("user_id = ?", 614).Count(&assignmentCount).Error)
	assert.Equal(t, int64(1), assignmentCount)
}

func TestRefreshAssignmentStatusesDoesNotActivateEndedSchedule(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create(&model.User{
		Id: 615, Username: "ended-schedule-user", Password: "12345678",
	}).Error)
	now := common.GetTimestamp()
	current := model.UserPriceBookAssignment{
		UserId: 615, PriceBookId: 1, VersionPolicy: "follow_current",
		Status:        model.PriceBookAssignmentStatusActive,
		EffectiveFrom: now - 300, EffectiveTo: now - 200,
	}
	endedSchedule := model.UserPriceBookAssignment{
		UserId: 615, PriceBookId: 2, VersionPolicy: "follow_current",
		Status:        model.PriceBookAssignmentStatusScheduled,
		EffectiveFrom: now - 200, EffectiveTo: now - 100,
	}
	require.NoError(t, model.DB.Create(&current).Error)
	require.NoError(t, model.DB.Create(&endedSchedule).Error)

	require.NoError(t, RefreshUserPriceBookAssignmentStatuses())
	require.NoError(t, model.DB.First(&current, current.Id).Error)
	require.NoError(t, model.DB.First(&endedSchedule, endedSchedule.Id).Error)
	assert.Equal(t, model.PriceBookAssignmentStatusExpired, current.Status)
	assert.Equal(t, model.PriceBookAssignmentStatusExpired, endedSchedule.Status)
}

func TestListSalesPriceBooksCountsAssignedUsersNotAssignmentRows(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	book := model.SalesPriceBook{
		Code: "distinct-assignment-book", Name: "Distinct Assignment Book",
		Audience: "tob", Currency: "USD",
	}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	require.NoError(t, model.DB.Create(&model.User{
		Id: 616, Username: "distinct-assignment-user", Password: "12345678",
	}).Error)
	now := common.GetTimestamp()
	require.NoError(t, model.DB.Create([]model.UserPriceBookAssignment{
		{
			UserId: 616, PriceBookId: book.Id, VersionPolicy: "follow_current",
			Status: model.PriceBookAssignmentStatusActive, EffectiveFrom: now - 100,
		},
		{
			UserId: 616, PriceBookId: book.Id, VersionPolicy: "follow_current",
			Status: model.PriceBookAssignmentStatusScheduled, EffectiveFrom: now + 100,
		},
	}).Error)

	books, total, err := ListSalesPriceBooks(SalesPriceBookListFilter{
		Keyword: "distinct-assignment-book", Page: 1, PageSize: 200,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, books, 1)
	assert.Equal(t, int64(1), books[0].AssignedUsers)
}

func TestPriceBookAuditIncludesAssignmentDefaultAndBatchActivity(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	book := model.SalesPriceBook{
		Code: "complete-audit-book", Name: "Complete Audit Book",
		Audience: "tob", Currency: "USD",
	}
	require.NoError(t, CreateSalesPriceBook(&book, 11))
	version := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&version, 11))
	assignment := model.UserPriceBookAssignment{
		UserId: 901, PriceBookId: book.Id, VersionPolicy: "follow_current",
		Status: model.PriceBookAssignmentStatusActive, EffectiveFrom: 1,
	}
	require.NoError(t, model.DB.Create(&assignment).Error)
	batchId := 902
	require.NoError(t, model.DB.Create(&model.PricingChangeBatchItem{
		BatchId: batchId, TargetType: "sales_price_book_item",
		ModelId: 903, PriceBookId: &book.Id, Action: "generate", Status: "generated",
	}).Error)
	require.NoError(t, model.DB.Create([]model.PricingAuditRecord{
		{
			ObjectType: "user_price_book_assignment", ObjectId: assignment.Id,
			Action: "assign", OperatorId: 11,
		},
		{
			ObjectType: "sales_price_book_default", ObjectId: book.Id,
			Action: "set_default", OperatorId: 11,
		},
		{
			ObjectType: "pricing_change_batch", ObjectId: batchId,
			Action: "generate", OperatorId: 11,
		},
	}).Error)

	records, total, err := ListSalesPriceBookAuditRecords(book.Id, 1, 200)
	require.NoError(t, err)
	assert.Equal(t, int64(5), total)
	actions := make([]string, 0, len(records))
	for _, record := range records {
		actions = append(actions, record.Action)
	}
	assert.ElementsMatch(t, []string{
		"create", "create_version", "assign", "set_default", "generate",
	}, actions)
}

func TestDeletingDraftPreservesVisibleAuditHistory(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	book := model.SalesPriceBook{
		Code: "delete-draft-audit-book", Name: "Delete Draft Audit Book",
		Audience: "tob", Currency: "USD",
	}
	require.NoError(t, CreateSalesPriceBook(&book, 12))
	version := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&version, 12))

	require.NoError(t, DeleteSalesPriceBookVersionDraft(version.Id, 13))
	records, total, err := ListSalesPriceBookAuditRecords(book.Id, 1, 200)
	require.NoError(t, err)
	assert.Equal(t, int64(3), total)
	actions := make([]string, 0, len(records))
	for _, record := range records {
		actions = append(actions, record.Action)
	}
	assert.ElementsMatch(t, []string{"create", "create_version", "delete_draft"}, actions)
	var versionCount int64
	require.NoError(t, model.DB.Model(&model.SalesPriceBookVersion{}).
		Where("id = ?", version.Id).Count(&versionCount).Error)
	assert.Zero(t, versionCount)
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
	require.NoError(t, SaveSalesPriceBookItem(&item, 1))
	require.NoError(t, model.DB.Create(&model.SalesPriceBookItemCostSource{
		PriceBookItemId: item.Id, ChannelModelId: 801, PurchasePriceVersionId: 901,
		SourceRole: "selected",
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
	var clonedSources []model.SalesPriceBookItemCostSource
	require.NoError(t, model.DB.Where("price_book_item_id = ?", clonedItems[0].Id).Find(&clonedSources).Error)
	require.Len(t, clonedSources, 1)

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
	require.NoError(t, SaveSalesPriceBookItem(&item, 1))
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

func TestCancelScheduledAssignmentPreservesCurrentAssignmentWindow(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create(&model.User{
		Id: 704, Username: "scheduled-cancel-user", Password: "12345678",
	}).Error)
	book := model.SalesPriceBook{
		Code: "scheduled-cancel-book", Name: "Scheduled Cancel Book",
		Audience: "tob", Currency: "USD", Status: model.SalesPriceBookStatusEnabled,
	}
	require.NoError(t, model.DB.Create(&book).Error)
	currentVersionId := 1
	require.NoError(t, model.DB.Model(&model.SalesPriceBook{}).Where("id = ?", book.Id).
		Update("current_version_id", currentVersionId).Error)
	now := common.GetTimestamp()
	currentEnd := now + 7200
	current := model.UserPriceBookAssignment{
		UserId: 704, PriceBookId: book.Id, VersionPolicy: "follow_current",
		EffectiveTo: currentEnd,
	}
	require.NoError(t, AssignUserToSalesPriceBook(&current, 1))
	future := model.UserPriceBookAssignment{
		UserId: 704, PriceBookId: book.Id, VersionPolicy: "follow_current",
		EffectiveFrom: now + 3600,
	}
	require.NoError(t, AssignUserToSalesPriceBook(&future, 1))
	require.NoError(t, model.DB.First(&current, current.Id).Error)
	assert.Equal(t, currentEnd, current.EffectiveTo)

	require.NoError(t, CancelUserPriceBookAssignment(future.Id, 1))
	require.NoError(t, model.DB.First(&current, current.Id).Error)
	assert.Equal(t, currentEnd, current.EffectiveTo)
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

	var basisSources []model.SalesPriceBookItemCostSource
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

func TestGenerateSalesPriceBookItemsSupportsLegacyRequiredCurrencyColumn(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Exec(
		"ALTER TABLE sales_price_book_items ADD COLUMN currency varchar(8) NOT NULL",
	).Error)
	createSalesPriceBookPurchaseSource(t, 851, 852, 853, "legacy-currency-model", "1", "2")
	book := model.SalesPriceBook{
		Code: "legacy-currency-book", Name: "Legacy Currency Book", Audience: "tob", Currency: "USD",
	}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	version := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&version, 1))

	generated, err := GenerateSalesPriceBookItems(version.Id, SalesPriceBookGenerationInput{
		ChannelModelIds: []int{852}, IdempotencyKey: "legacy-required-currency",
	}, 1)
	require.NoError(t, err)
	require.Len(t, generated.GeneratedItems, 1)
	var currency string
	require.NoError(t, model.DB.Table("sales_price_book_items").
		Select("currency").Where("id = ?", generated.GeneratedItems[0].Id).
		Scan(&currency).Error)
	assert.Equal(t, "USD", currency)
	regenerated, err := GenerateSalesPriceBookItems(version.Id, SalesPriceBookGenerationInput{
		ChannelModelIds: []int{852}, IdempotencyKey: "legacy-required-currency-update",
	}, 1)
	require.NoError(t, err)
	require.Len(t, regenerated.GeneratedItems, 1)
	assert.Equal(t, "USD", regenerated.GeneratedItems[0].Currency)
	assert.NotZero(t, regenerated.GeneratedItems[0].CreatedAt)

	createSalesPriceBookPurchaseSource(t, 854, 855, 856, "legacy-manual-model", "1", "2")
	manual := generated.GeneratedItems[0]
	manual.Id = 0
	manual.ModelId = 856
	manual.GeneratedByBatchId = nil
	manual.CreatedAt = 0
	require.NoError(t, SaveSalesPriceBookItem(&manual, 1))
	require.NoError(t, model.DB.Table("sales_price_book_items").
		Select("currency").Where("id = ?", manual.Id).
		Scan(&currency).Error)
	assert.Equal(t, "USD", currency)

	cloned, err := CloneSalesPriceBookVersion(book.Id, version.Id, 1)
	require.NoError(t, err)
	var clonedCurrencies []string
	require.NoError(t, model.DB.Table("sales_price_book_items").
		Where("price_book_version_id = ?", cloned.Id).
		Order("model_id ASC").Pluck("currency", &clonedCurrencies).Error)
	assert.Equal(t, []string{"USD", "USD"}, clonedCurrencies)
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
	require.NoError(t, SaveSalesPriceBookItem(&targetItem, 1))

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
	assert.NotNil(t, diff.PolicyChanges)
	assert.NotNil(t, diff.Items[0].OldChannelMargins)
	assert.NotNil(t, diff.Items[0].NewChannelMargins)

	require.NoError(t, model.DB.Delete(&targetItem).Error)
	removedDiff, err := CompareSalesPriceBookVersions(base.Id, target.Id)
	require.NoError(t, err)
	require.Len(t, removedDiff.Items, 1)
	assert.Equal(t, "removed", removedDiff.Items[0].ChangeType)
	assert.NotNil(t, removedDiff.Items[0].NewPurchaseVersions)
	assert.NotNil(t, removedDiff.Items[0].NewChannelMargins)
}

func TestChannelModelOverrideCompleteRegenerationFlow(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	createSalesPriceBookPurchaseSource(t, 1311, 1321, 1331, "override-flow-model", "1", "2")
	book := model.SalesPriceBook{
		Code: "override-flow-book", Name: "Override Flow Book", Audience: "tob", Currency: "USD",
	}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	base := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&base, 1))
	baseGeneration, err := GenerateSalesPriceBookItems(base.Id, SalesPriceBookGenerationInput{
		ChannelModelIds: []int{1321}, IdempotencyKey: "override-flow-base",
	}, 1)
	require.NoError(t, err)
	require.Len(t, baseGeneration.GeneratedItems, 1)
	require.NoError(t, PublishSalesPriceBookVersion(base.Id, 1))

	target, err := CloneSalesPriceBookVersion(book.Id, base.Id, 2)
	require.NoError(t, err)
	zero := "0"
	_, err = SaveSalesPriceBookChannelModelOverride(
		target.Id,
		1321,
		&model.SalesPriceBookChannelModelOverride{PaymentFeeRate: &zero},
		2,
	)
	require.NoError(t, err)

	items, err := ListSalesPriceBookItems(target.Id)
	require.NoError(t, err)
	require.Len(t, items, 1)
	assert.Equal(t, SalesPriceItemStatusReviewRequired, items[0].Status)
	assert.Equal(t, "channel_model_policy_changed", items[0].ReviewRiskCode)
	staleBatchId := items[0].GeneratedByBatchId
	require.NotNil(t, staleBatchId)

	diff, err := CompareSalesPriceBookVersions(base.Id, target.Id)
	require.NoError(t, err)
	require.Len(t, diff.Items, 1)
	assert.Equal(t, "changed", diff.Items[0].ChangeType)
	assert.Zero(t, diff.RemovedCount)
	assert.Contains(t, diff.Items[0].RiskCodes, "channel_model_policy_changed")

	err = PublishSalesPriceBookVersion(target.Id, 2)
	require.ErrorContains(t, err, "channel_model_policy_changed")
	err = AcceptSalesPriceBookItemReview(items[0].Id, 2, "keep stale price")
	require.ErrorContains(t, err, "regenerate the model price")
	err = RejectSalesPriceBookItemReview(items[0].Id, 2, "disable stale price")
	require.ErrorContains(t, err, "regenerate the model price")

	regenerated, err := GenerateSalesPriceBookItems(target.Id, SalesPriceBookGenerationInput{
		ChannelModelIds: []int{1321}, IdempotencyKey: "override-flow-regenerated",
	}, 2)
	require.NoError(t, err)
	require.Len(t, regenerated.GeneratedItems, 1)
	assert.Equal(t, PricingChangeBatchStatusCompleted, regenerated.Batch.Status)
	items, err = ListSalesPriceBookItems(target.Id)
	require.NoError(t, err)
	require.Len(t, items, 1)
	assert.Equal(t, SalesPriceItemStatusEnabled, items[0].Status)
	assert.Empty(t, items[0].ReviewRiskCode)

	var staleReview model.PricingChangeBatchItem
	require.NoError(t, model.DB.First(
		&staleReview,
		"batch_id = ? AND target_id = ? AND risk_code = ?",
		*staleBatchId,
		items[0].Id,
		"channel_model_policy_changed",
	).Error)
	assert.Equal(t, PricingChangeBatchItemStatusRejected, staleReview.Status)

	diff, err = CompareSalesPriceBookVersions(base.Id, target.Id)
	require.NoError(t, err)
	require.Len(t, diff.Items, 1)
	assert.Equal(t, "changed", diff.Items[0].ChangeType)
	assert.Zero(t, diff.RemovedCount)
	assert.NotContains(t, diff.Items[0].RiskCodes, "channel_model_policy_changed")
	require.NoError(t, PublishSalesPriceBookVersion(target.Id, 2))
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

func TestMaximumCostGenerationSupportsSingleExpressionPriceSource(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{
		Id: 1071, ModelName: "single-video-model", Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.Channel{
		Id: 1072, Name: "single-video-channel", Key: "test", Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 1073, ChannelId: 1072, ModelId: 1071, UpstreamModelName: "single-video-model", Status: 1,
	}).Error)
	expression := `v2:tier("720p", video_s * 0.12)`
	require.NoError(t, model.DB.Create(&model.ChannelModelPurchasePriceVersion{
		Id: 1074, ChannelModelId: 1073, BillingMode: "video_duration",
		PricingMode: "custom_expr", PriceStructure: "expression",
		PriceComponents:     `{"rules":[{"name":"720p","component":"video_output","unit":"second","unit_size":"1","unit_price":"0.12"}]}`,
		PurchaseBillingExpr: expression, PurchaseExprHash: billingexpr.ExprHashString(expression),
		ExpressionSource: "generated", ExpressionSchemaVersion: "v2", Currency: "USD",
		Version: 1, Status: model.PricingVersionStatusActive, EffectiveFrom: 1,
	}).Error)
	book := model.SalesPriceBook{
		Code: "single-expression", Name: "Single Expression", Audience: "toc", Currency: "USD",
	}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	version := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&version, 1))

	generated, err := GenerateSalesPriceBookItems(version.Id, SalesPriceBookGenerationInput{
		ChannelModelIds: []int{1073}, IdempotencyKey: "single-expression-generation",
	}, 1)

	require.NoError(t, err)
	require.Len(t, generated.GeneratedItems, 1)
	assert.Equal(t, SalesPriceItemStatusEnabled, generated.GeneratedItems[0].Status)
	assert.Equal(t, "video_duration", generated.GeneratedItems[0].BillingMode)
}

func TestMaximumCostGenerationSelectsHighestComparableOfficialRatio(t *testing.T) {
	officialVersionId := 2001
	sources := []salesPriceBookPurchaseSource{
		{Purchase: model.ChannelModelPurchasePriceVersion{
			Id: 2002, BillingMode: "token", PriceStructure: "expression",
			PricingMode: "official_ratio", OfficialPriceVersionId: &officialVersionId,
			PurchaseDiscount: "0.50", Currency: "USD",
		}},
		{Purchase: model.ChannelModelPurchasePriceVersion{
			Id: 2003, BillingMode: "token", PriceStructure: "expression",
			PricingMode: "official_ratio", OfficialPriceVersionId: &officialVersionId,
			PurchaseDiscount: "0.64", Currency: "USD",
		}},
	}

	selected, err := mergeComparablePurchaseSources(sources, true)

	require.NoError(t, err)
	assert.Equal(t, 2003, selected.Id)
}

func TestDesignatedChannelAutoRepricePreservesSelectedChannel(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	createSalesPriceBookPurchaseSource(t, 1081, 1082, 1083, "designated-reprice", "2", "4")
	book := model.SalesPriceBook{
		Code: "designated-reprice", Name: "Designated Reprice", Audience: "tob", Currency: "USD",
	}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	base := validSalesPriceBookVersion(book.Id)
	base.CostBasisStrategy = "designated_channel"
	require.NoError(t, CreateSalesPriceBookVersion(&base, 1))
	generated, err := GenerateSalesPriceBookItems(base.Id, SalesPriceBookGenerationInput{
		ChannelModelIds: []int{1082}, IdempotencyKey: "designated-reprice-base",
		DesignatedChannelModel: map[int]int{1083: 1082},
	}, 1)
	require.NoError(t, err)
	require.Len(t, generated.GeneratedItems, 1)
	require.NoError(t, PublishSalesPriceBookVersion(base.Id, 1))
	prices, expression, components, err := normalizeFlatTokenPrices(FlatTokenPriceInput{
		InputUnitPrice: "2.5", OutputUnitPrice: "5",
	})
	require.NoError(t, err)
	purchase := model.ChannelModelPurchasePriceVersion{
		ChannelModelId: 1082, BillingMode: "token", PricingMode: "fixed_unit_price",
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
	assert.Equal(t, PricingChangeBatchStatusCompleted, results[0].Status)
	var item model.SalesPriceBookItem
	require.NoError(t, model.DB.First(&item,
		"price_book_version_id = ? AND model_id = ?", results[0].PriceBookVersionId, 1083).Error)
	var selectedSource model.SalesPriceBookItemCostSource
	require.NoError(t, model.DB.First(&selectedSource,
		"price_book_item_id = ? AND source_role = ?", item.Id, "selected").Error)
	assert.Equal(t, purchase.Id, selectedSource.PurchasePriceVersionId)
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

func TestPurchasePriceReconciliationDoesNotKeepAnUnchangedDraft(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	createSalesPriceBookPurchaseSource(t, 1141, 1142, 1143, "unchanged-reprice-model", "1", "2")
	book := model.SalesPriceBook{
		Code: "unchanged-reprice-book", Name: "Unchanged Reprice Book", Audience: "toc", Currency: "USD",
	}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	base := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&base, 1))
	_, err := GenerateSalesPriceBookItems(base.Id, SalesPriceBookGenerationInput{
		ChannelModelIds: []int{1142}, IdempotencyKey: "unchanged-reprice-base",
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishSalesPriceBookVersion(base.Id, 1))
	var purchase model.ChannelModelPurchasePriceVersion
	require.NoError(t, model.DB.First(&purchase,
		"channel_model_id = ? AND status = ?", 1142, model.PricingVersionStatusActive).Error)

	results, err := AutoRepriceSalesPriceBooksForPurchaseVersion(purchase.Id, 2)

	require.NoError(t, err)
	require.Len(t, results, 1)
	assert.Zero(t, results[0].PriceBookVersionId)
	assert.Equal(t, PricingChangeBatchStatusCompleted, results[0].Status)
	var versionCount int64
	require.NoError(t, model.DB.Model(&model.SalesPriceBookVersion{}).
		Where("price_book_id = ?", book.Id).Count(&versionCount).Error)
	assert.Equal(t, int64(1), versionCount)
	var batch model.PricingChangeBatch
	require.NoError(t, model.DB.First(&batch, results[0].BatchId).Error)
	assert.Equal(t, 0, batch.ChangedCount)
	assert.Equal(t, 1, batch.UnchangedCount)

	repeated, err := AutoRepriceSalesPriceBooksForPurchaseVersion(purchase.Id, 2)
	require.NoError(t, err)
	assert.Equal(t, results, repeated)
}

func TestPurchasePriceAutomationAccumulatesPendingModelChanges(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	createSalesPriceBookPurchaseSource(t, 1151, 1152, 1153, "first-pending-model", "1", "2")
	createSalesPriceBookPurchaseSource(t, 1161, 1162, 1163, "second-pending-model", "2", "4")
	book := model.SalesPriceBook{
		Code: "pending-reprice-book", Name: "Pending Reprice Book", Audience: "toc", Currency: "USD",
	}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	base := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&base, 1))
	_, err := GenerateSalesPriceBookItems(base.Id, SalesPriceBookGenerationInput{
		ChannelModelIds: []int{1152, 1162}, IdempotencyKey: "pending-reprice-base",
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishSalesPriceBookVersion(base.Id, 1))

	firstPrices, firstExpression, firstComponents, err := normalizeFlatTokenPrices(FlatTokenPriceInput{
		InputUnitPrice: "1.5", OutputUnitPrice: "3",
	})
	require.NoError(t, err)
	firstPurchase := model.ChannelModelPurchasePriceVersion{
		ChannelModelId: 1152, BillingMode: "token", PricingMode: "fixed_unit_price",
		PriceStructure: "flat", PriceComponents: firstComponents,
		InputUnitPrice: firstPrices.InputUnitPrice, OutputUnitPrice: firstPrices.OutputUnitPrice,
		PurchaseBillingExpr: firstExpression, ExpressionSource: "generated",
		ExpressionSchemaVersion: "v2", Currency: "USD",
	}
	require.NoError(t, CreatePurchasePriceVersion(&firstPurchase, 2))
	require.NoError(t, PublishPurchasePriceVersion(firstPurchase.Id))
	firstResults, err := AutoRepriceSalesPriceBooksForPurchaseVersion(firstPurchase.Id, 2)
	require.NoError(t, err)
	require.Len(t, firstResults, 1)

	secondPrices, secondExpression, secondComponents, err := normalizeFlatTokenPrices(FlatTokenPriceInput{
		InputUnitPrice: "3", OutputUnitPrice: "6",
	})
	require.NoError(t, err)
	secondPurchase := model.ChannelModelPurchasePriceVersion{
		ChannelModelId: 1162, BillingMode: "token", PricingMode: "fixed_unit_price",
		PriceStructure: "flat", PriceComponents: secondComponents,
		InputUnitPrice: secondPrices.InputUnitPrice, OutputUnitPrice: secondPrices.OutputUnitPrice,
		PurchaseBillingExpr: secondExpression, ExpressionSource: "generated",
		ExpressionSchemaVersion: "v2", Currency: "USD",
	}
	require.NoError(t, CreatePurchasePriceVersion(&secondPurchase, 2))
	require.NoError(t, PublishPurchasePriceVersion(secondPurchase.Id))
	secondResults, err := AutoRepriceSalesPriceBooksForPurchaseVersion(secondPurchase.Id, 2)
	require.NoError(t, err)
	require.Len(t, secondResults, 1)

	var firstDraft model.SalesPriceBookVersion
	require.NoError(t, model.DB.First(&firstDraft, firstResults[0].PriceBookVersionId).Error)
	assert.Equal(t, model.SalesPriceBookVersionStatusCancelled, firstDraft.Status)
	var secondDraft model.SalesPriceBookVersion
	require.NoError(t, model.DB.First(&secondDraft, secondResults[0].PriceBookVersionId).Error)
	assert.Equal(t, model.SalesPriceBookVersionStatusDraft, secondDraft.Status)
	diff, err := CompareSalesPriceBookVersions(base.Id, secondDraft.Id)
	require.NoError(t, err)
	assert.Equal(t, 2, diff.ChangedCount)
	require.Len(t, diff.Items, 2)
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

func TestOfficialPriceAutomationRepairsAnIncompleteBatch(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{
		Id: 1221, ModelName: "official-reconcile-model", Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.Channel{
		Id: 1222, Name: "official-reconcile-channel", Key: "test-key", Status: 1,
	}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 1223, ChannelId: 1222, ModelId: 1221,
		UpstreamModelName: "official-reconcile-model", Status: 1,
	}).Error)
	firstOfficial, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 1221, Currency: "USD", Source: "provider-docs",
		Prices: FlatTokenPriceInput{InputUnitPrice: "2", OutputUnitPrice: "4"},
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishOfficialPriceVersion(firstOfficial.Id))
	purchase, err := CreatePurchaseDraft(PurchaseDraftInput{
		ChannelModelId: 1223, OfficialPriceVersionId: &firstOfficial.Id,
		PricingMode: "official_ratio", PurchaseDiscount: "0.5",
		QuoteReference: "reconcile-discount",
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishPurchasePriceVersion(purchase.Id))
	secondOfficial, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 1221, Currency: "USD", Source: "provider-docs",
		Prices: FlatTokenPriceInput{InputUnitPrice: "3", OutputUnitPrice: "6"},
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishOfficialPriceVersion(secondOfficial.Id))
	generated, err := AutoCreatePurchaseDraftsForOfficialPrice(secondOfficial.Id, 1)
	require.NoError(t, err)
	require.Len(t, generated, 1)
	staleBatchId := generated[0].BatchId
	require.NoError(t, model.DB.Where("batch_id = ?", staleBatchId).
		Delete(&model.PricingChangeBatchItem{}).Error)

	repaired, err := AutoCreatePurchaseDraftsForOfficialPrice(secondOfficial.Id, 1)
	require.NoError(t, err)
	require.Len(t, repaired, 1)
	var itemCount int64
	require.NoError(t, model.DB.Model(&model.PricingChangeBatchItem{}).
		Where("batch_id = ?", repaired[0].BatchId).Count(&itemCount).Error)
	assert.Equal(t, int64(1), itemCount)
}

func TestPurchasePriceAutomationCreatesAnIdempotentEmptyMarker(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	createSalesPriceBookPurchaseSource(t, 1231, 1232, 1233, "unassigned-model", "1", "2")
	var purchase model.ChannelModelPurchasePriceVersion
	require.NoError(t, model.DB.First(&purchase,
		"channel_model_id = ? AND status = ?", 1232, model.PricingVersionStatusActive).Error)

	results, err := AutoRepriceSalesPriceBooksForPurchaseVersion(purchase.Id, 1)
	require.NoError(t, err)
	assert.Empty(t, results)
	results, err = AutoRepriceSalesPriceBooksForPurchaseVersion(purchase.Id, 1)
	require.NoError(t, err)
	assert.Empty(t, results)
	var batchCount int64
	require.NoError(t, model.DB.Model(&model.PricingChangeBatch{}).
		Where("trigger_type = ? AND trigger_id = ?",
			SalesPriceBookTriggerPurchasePricePublished, purchase.Id).
		Count(&batchCount).Error)
	assert.Equal(t, int64(1), batchCount)
}

func TestRetryPurchaseDraftRefreshReprocessesReviewFailure(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 1251, ModelName: "retry-official-model", Status: 1}).Error)
	require.NoError(t, model.DB.Create(&model.Channel{Id: 1252, Name: "retry-channel", Key: "test", Status: 1}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelModel{
		Id: 1253, ChannelId: 1252, ModelId: 1251, UpstreamModelName: "retry-official-model", Status: 1,
	}).Error)
	firstOfficial, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 1251, Currency: "USD", Source: "provider-docs",
		Prices: FlatTokenPriceInput{InputUnitPrice: "2", OutputUnitPrice: "4"},
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishOfficialPriceVersion(firstOfficial.Id))
	purchase, err := CreatePurchaseDraft(PurchaseDraftInput{
		ChannelModelId: 1253, OfficialPriceVersionId: &firstOfficial.Id,
		PricingMode: "component_ratio", InputDiscount: "0.5", OutputDiscount: "0.5",
		QuoteReference: "retry-contract",
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishPurchasePriceVersion(purchase.Id))
	require.NoError(t, model.DB.Session(&gorm.Session{SkipHooks: true}).
		Model(&model.ChannelModelPurchasePriceVersion{}).Where("id = ?", purchase.Id).
		UpdateColumn("quote_spec", "not-json").Error)
	secondOfficial, err := CreateOfficialFlatDraft(OfficialFlatDraftInput{
		ModelId: 1251, Currency: "USD", Source: "provider-docs",
		Prices: FlatTokenPriceInput{InputUnitPrice: "3", OutputUnitPrice: "6"},
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishOfficialPriceVersion(secondOfficial.Id))
	failed, err := AutoCreatePurchaseDraftsForOfficialPrice(secondOfficial.Id, 1)
	require.NoError(t, err)
	require.Len(t, failed, 1)
	assert.Equal(t, PricingChangeBatchItemStatusReview, failed[0].Status)
	require.NoError(t, model.DB.Session(&gorm.Session{SkipHooks: true}).
		Model(&model.ChannelModelPurchasePriceVersion{}).Where("id = ?", purchase.Id).
		UpdateColumn("quote_spec", `{"input_discount":"0.5","output_discount":"0.5"}`).Error)
	staleDraft, err := CreatePurchaseDraft(PurchaseDraftInput{
		ChannelModelId: 1253, OfficialPriceVersionId: &secondOfficial.Id,
		PricingMode: "component_ratio", InputDiscount: "0.5", OutputDiscount: "0.5",
		QuoteReference: "retry-contract", Remark: "stale retry draft",
	}, 1)
	require.NoError(t, err)
	staleDraftId := staleDraft.Id
	require.NoError(t, model.DB.Create(&model.PricingChangeBatchItem{
		BatchId: failed[0].BatchId, TargetType: "purchase_price_version",
		TargetId: &staleDraftId, ModelId: 1251, Action: "create_draft",
		NewVersionId: &staleDraftId, Status: PricingChangeBatchItemStatusGenerated,
	}).Error)

	retried, err := RetryPurchaseDraftsForOfficialPrice(secondOfficial.Id, 1)
	require.NoError(t, err)
	require.Len(t, retried, 1)
	assert.Equal(t, PricingChangeBatchItemStatusGenerated, retried[0].Status)
	assert.NotZero(t, retried[0].PurchasePriceVersionId)
	var refreshed model.ChannelModelPurchasePriceVersion
	require.NoError(t, model.DB.First(&refreshed, retried[0].PurchasePriceVersionId).Error)
	assert.NotEqual(t, "stale retry draft", refreshed.Remark)
}

func TestPublishedContentHashIncludesCommercialItemMetadata(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	require.NoError(t, model.DB.Create(&model.Model{Id: 1301, ModelName: "hash-model"}).Error)
	book := model.SalesPriceBook{Code: "hash-book", Name: "Hash Book", Audience: "toc", Currency: "USD"}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	base := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&base, 1))
	item := model.SalesPriceBookItem{
		PriceBookVersionId: base.Id, ModelId: 1301, Status: SalesPriceItemStatusEnabled,
		BillingMode: "token", PriceStructure: "flat", PriceComponents: `{}`,
		SalesBillingExpr: `v2:p / 1000000`, ExpressionSource: "generated",
		ExpressionSchemaVersion: "v2", PricingMethod: "fixed", Currency: "USD",
	}
	require.NoError(t, SaveSalesPriceBookItem(&item, 1))
	require.NoError(t, PublishSalesPriceBookVersion(base.Id, 1))
	require.NoError(t, model.DB.First(&base, base.Id).Error)
	target, err := CloneSalesPriceBookVersion(book.Id, base.Id, 1)
	require.NoError(t, err)
	var targetItem model.SalesPriceBookItem
	require.NoError(t, model.DB.First(&targetItem,
		"price_book_version_id = ? AND model_id = ?", target.Id, 1301).Error)
	targetItem.OfficialDiscount = "0.8"
	targetItem.PricingMethod = "official_discount"
	require.NoError(t, SaveSalesPriceBookItem(&targetItem, 1))
	require.NoError(t, PublishSalesPriceBookVersion(target.Id, 1))
	require.NoError(t, model.DB.First(target, target.Id).Error)

	assert.NotEqual(t, base.ContentHash, target.ContentHash)
}

func TestPurchasePublishAddsNewModelToTOCDefaultDraft(t *testing.T) {
	setupSalesPriceBookTestDB(t)
	createSalesPriceBookPurchaseSource(t, 1401, 1411, 1421, "existing-toc-model", "1", "2")
	createSalesPriceBookPurchaseSource(t, 1402, 1412, 1422, "new-toc-model", "2", "4")
	book := model.SalesPriceBook{Code: "toc-auto-add", Name: "TOC Auto Add", Audience: "toc", Currency: "USD"}
	require.NoError(t, CreateSalesPriceBook(&book, 1))
	base := validSalesPriceBookVersion(book.Id)
	require.NoError(t, CreateSalesPriceBookVersion(&base, 1))
	_, err := GenerateSalesPriceBookItems(base.Id, SalesPriceBookGenerationInput{
		ChannelModelIds: []int{1411}, IdempotencyKey: "toc-auto-add-base",
	}, 1)
	require.NoError(t, err)
	require.NoError(t, PublishSalesPriceBookVersion(base.Id, 1))
	require.NoError(t, SetDefaultSalesPriceBook("toc_default", book.Id, 1))
	var purchase model.ChannelModelPurchasePriceVersion
	require.NoError(t, model.DB.First(&purchase,
		"channel_model_id = ? AND status = ?", 1412, model.PricingVersionStatusActive).Error)

	results, err := AutoRepriceSalesPriceBooksForPurchaseVersion(purchase.Id, 1)
	require.NoError(t, err)
	require.Len(t, results, 1)
	var generated model.SalesPriceBookItem
	require.NoError(t, model.DB.First(&generated,
		"price_book_version_id = ? AND model_id = ?", results[0].PriceBookVersionId, 1422).Error)
	assert.Equal(t, SalesPriceItemStatusEnabled, generated.Status)
}
