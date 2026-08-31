package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestLegacyChannelRetailPricingMigrationConvergesToSalesPricing(t *testing.T) {
	originalDB := DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	DB = db
	t.Cleanup(func() { DB = originalDB })

	require.NoError(t, DB.Exec(`
		CREATE TABLE request_pricing_snapshots (
			id integer primary key,
			retail_amount text,
			base_retail_amount text,
			retail_price_version_id integer,
			applied_group_ratio text
		)
	`).Error)
	require.NoError(t, DB.Exec(`
		INSERT INTO request_pricing_snapshots
			(id, retail_amount, base_retail_amount, retail_price_version_id)
		VALUES (1, '1.25', '1.10', 9)
	`).Error)
	require.NoError(t, DB.Exec(`CREATE TABLE channel_models (id integer primary key, runtime_mode text)`).Error)
	require.NoError(t, DB.Exec(`CREATE TABLE channel_model_retail_price_versions (id integer primary key)`).Error)

	require.NoError(t, renameLegacyPricingSnapshotColumns())
	require.True(t, DB.Migrator().HasColumn(&RequestPricingSnapshot{}, "sales_amount"))
	require.True(t, DB.Migrator().HasColumn(&RequestPricingSnapshot{}, "base_sales_amount"))
	require.False(t, DB.Migrator().HasColumn(&RequestPricingSnapshot{}, "retail_amount"))
	require.False(t, DB.Migrator().HasColumn(&RequestPricingSnapshot{}, "base_retail_amount"))

	var migrated struct {
		SalesAmount     string `gorm:"column:sales_amount"`
		BaseSalesAmount string `gorm:"column:base_sales_amount"`
	}
	require.NoError(t, DB.Table("request_pricing_snapshots").Where("id = ?", 1).Take(&migrated).Error)
	assert.Equal(t, "1.25", migrated.SalesAmount)
	assert.Equal(t, "1.10", migrated.BaseSalesAmount)

	require.NoError(t, retireLegacyChannelRetailPricing())
	assert.False(t, DB.Migrator().HasTable("channel_model_retail_price_versions"))
	var retiredColumnCount int64
	require.NoError(t, DB.Raw(`
		SELECT COUNT(*) FROM pragma_table_info('channel_models') WHERE name = 'runtime_mode'
	`).Scan(&retiredColumnCount).Error)
	assert.Zero(t, retiredColumnCount)
	require.NoError(t, DB.Raw(`
		SELECT COUNT(*) FROM pragma_table_info('request_pricing_snapshots')
		WHERE name = 'retail_price_version_id'
	`).Scan(&retiredColumnCount).Error)
	assert.Zero(t, retiredColumnCount)
	require.NoError(t, DB.Raw(`
		SELECT COUNT(*) FROM pragma_table_info('request_pricing_snapshots')
		WHERE name = 'applied_group_ratio'
	`).Scan(&retiredColumnCount).Error)
	assert.Zero(t, retiredColumnCount)
	require.NoError(t, renameLegacyPricingSnapshotColumns())
	require.NoError(t, retireLegacyChannelRetailPricing())
}

func TestPricingAuditMigrationRenamesLegacyApprovalTableAndPreservesRows(t *testing.T) {
	originalDB := DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	DB = db
	t.Cleanup(func() { DB = originalDB })
	require.NoError(t, DB.Exec(`
		CREATE TABLE pricing_approval_records (
			id integer primary key,
			object_type text,
			object_id integer,
			action text,
			operator_id integer,
			comment text,
			created_at integer
		)
	`).Error)
	require.NoError(t, DB.Exec(`
		INSERT INTO pricing_approval_records
			(id, object_type, object_id, action, operator_id, comment, created_at)
		VALUES (1, 'sales_price_book_version', 8, 'publish', 3, '', 100)
	`).Error)
	require.NoError(t, DB.Exec(`
		CREATE INDEX idx_pricing_approval_object
		ON pricing_approval_records (object_type, object_id)
	`).Error)

	require.NoError(t, renamePricingAuditTable())
	require.NoError(t, DB.Migrator().CreateIndex(&PricingAuditRecord{}, "idx_pricing_audit_object"))
	require.NoError(t, retirePricingApprovalIndex())
	assert.False(t, DB.Migrator().HasTable("pricing_approval_records"))
	assert.True(t, DB.Migrator().HasTable("pricing_audit_records"))
	assert.False(t, DB.Migrator().HasIndex(&PricingAuditRecord{}, "idx_pricing_approval_object"))
	assert.True(t, DB.Migrator().HasIndex(&PricingAuditRecord{}, "idx_pricing_audit_object"))
	var audit PricingAuditRecord
	require.NoError(t, DB.First(&audit, 1).Error)
	assert.Equal(t, "publish", audit.Action)
	assert.Equal(t, 3, audit.OperatorId)
	require.NoError(t, renamePricingAuditTable())
}

func TestPricingChangeBatchMigrationRemovesApprovalWorkflowColumns(t *testing.T) {
	originalDB := DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	DB = db
	t.Cleanup(func() { DB = originalDB })
	require.NoError(t, DB.Exec(`
		CREATE TABLE pricing_change_batches (
			id integer primary key,
			batch_no text,
			approved_by integer,
			approved_at integer,
			applied_by integer,
			applied_at integer
		)
	`).Error)
	require.NoError(t, DB.Exec(`
		INSERT INTO pricing_change_batches
			(id, batch_no, approved_by, approved_at, applied_by, applied_at)
		VALUES (1, 'legacy-batch', 2, 100, 3, 200)
	`).Error)

	require.NoError(t, retirePricingChangeBatchApprovalColumns())
	for _, column := range []string{"approved_by", "approved_at", "applied_by", "applied_at"} {
		assert.False(t, DB.Migrator().HasColumn(&legacyPricingChangeBatchApprovalMigration{}, column))
	}
	var batchNo string
	require.NoError(t, DB.Table("pricing_change_batches").Where("id = ?", 1).
		Pluck("batch_no", &batchNo).Error)
	assert.Equal(t, "legacy-batch", batchNo)
	require.NoError(t, retirePricingChangeBatchApprovalColumns())
}

func TestSalesPriceBookMigrationRemovesPlaceholderPolicyColumns(t *testing.T) {
	t.Setenv("PRICING_SCHEMA_FINALIZE", "true")
	originalDB := DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	DB = db
	t.Cleanup(func() { DB = originalDB })
	require.NoError(t, DB.Exec(`
		CREATE TABLE sales_price_book_versions (
			id integer primary key,
			reprice_mode text,
			rounding_mode text,
			rounding_scale integer,
			risk_action text,
			price_locked_until integer
		)
	`).Error)
	require.NoError(t, DB.Exec(`
		CREATE TABLE user_price_book_assignments (
			id integer primary key,
			price_locked_until integer
		)
	`).Error)
	require.NoError(t, DB.Exec(`
		CREATE TABLE sales_price_book_items (
			id integer primary key,
			price_book_version_id integer,
			model_id integer,
			minimum_margin_override text,
			currency text
		)
	`).Error)
	require.NoError(t, DB.AutoMigrate(
		&SalesPriceBookItemCostSource{},
		&legacySalesPriceBookItemBasisSourceMigration{},
		&SalesPriceBookChannelModelOverride{},
	))
	require.NoError(t, DB.Exec(`
		INSERT INTO sales_price_book_items
			(id, price_book_version_id, model_id, minimum_margin_override, currency)
		VALUES (1, 2, 3, '0.015', 'USD')
	`).Error)
	require.NoError(t, DB.Create(&legacySalesPriceBookItemBasisSourceMigration{
		PriceBookItemId: 1, ChannelModelId: 4, PurchasePriceVersionId: 5,
		SourceRole: "selected",
	}).Error)

	require.NoError(t, migrateSalesPriceBookSchema())
	for _, column := range []string{
		"reprice_mode", "rounding_mode", "rounding_scale", "risk_action", "price_locked_until",
	} {
		assert.False(t, DB.Migrator().HasColumn(&legacySalesPriceBookVersionPlaceholderMigration{}, column))
	}
	assert.False(t, DB.Migrator().HasColumn(&legacyUserPriceBookAssignmentPlaceholderMigration{}, "price_locked_until"))
	assert.False(t, DB.Migrator().HasColumn(&legacySalesPriceBookItemPlaceholderMigration{}, "minimum_margin_override"))
	assert.False(t, DB.Migrator().HasColumn(&legacySalesPriceBookItemPlaceholderMigration{}, "currency"))
	var override SalesPriceBookChannelModelOverride
	require.NoError(t, DB.Where(
		"price_book_version_id = ? AND channel_model_id = ?", 2, 4,
	).First(&override).Error)
	require.NotNil(t, override.MinimumMarginRate)
	assert.Equal(t, "0.015", *override.MinimumMarginRate)
	require.NoError(t, migrateSalesPriceBookSchema())
	require.NoError(t, DB.AutoMigrate(&SalesPriceBookVersion{}))
	assert.False(t, DB.Migrator().HasColumn(
		&legacySalesPriceBookVersionPricingMigration{}, "total_variable_cost_rate",
	))
}

func TestSalesPriceBookSchemaMigrationPreservesLegacyCommercialData(t *testing.T) {
	t.Setenv("PRICING_SCHEMA_FINALIZE", "true")
	originalDB := DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	DB = db
	t.Cleanup(func() { DB = originalDB })
	require.NoError(t, DB.AutoMigrate(
		&SalesPriceBook{},
		&SalesPriceBookVersion{},
		&SalesPriceBookItem{},
		&SalesPriceBookItemCostSource{},
		&SalesPriceBookChannelModelOverride{},
		&ChannelModelPurchasePriceVersion{},
	))
	for _, statement := range []string{
		"ALTER TABLE sales_price_books ADD COLUMN owner_user_id integer",
		"ALTER TABLE sales_price_book_versions ADD COLUMN total_variable_cost_rate text",
		"ALTER TABLE sales_price_book_items ADD COLUMN primary_purchase_version_id integer",
		"ALTER TABLE sales_price_book_items ADD COLUMN selling_factor text",
		"ALTER TABLE sales_price_book_items ADD COLUMN official_discount text",
		"ALTER TABLE sales_price_book_items ADD COLUMN currency text",
		"ALTER TABLE channel_model_purchase_price_versions ADD COLUMN purchase_discount text",
		"ALTER TABLE channel_model_purchase_price_versions ADD COLUMN input_unit_price text",
		"ALTER TABLE channel_model_purchase_price_versions ADD COLUMN output_unit_price text",
		"ALTER TABLE channel_model_purchase_price_versions ADD COLUMN cache_read_unit_price text",
		"ALTER TABLE channel_model_purchase_price_versions ADD COLUMN cache_write_unit_price text",
		"ALTER TABLE channel_model_purchase_price_versions ADD COLUMN price_unit text",
		`CREATE TABLE sales_price_book_item_basis_sources (
			id integer primary key, price_book_item_id integer, channel_model_id integer,
			purchase_price_version_id integer, source_role text
		)`,
	} {
		require.NoError(t, DB.Exec(statement).Error)
	}
	require.NoError(t, DB.Create(&SalesPriceBook{
		Id: 1, Code: "legacy", Name: "Legacy", Audience: "tob", Currency: "USD",
	}).Error)
	require.NoError(t, DB.Create(&SalesPriceBookVersion{
		Id: 2, PriceBookId: 1, Version: 1, Status: SalesPriceBookVersionStatusDraft,
		CostBasisStrategy: "designated_channel", PaymentFeeRate: "0.04",
		DistributionFeeRate: "0.05", OperationsLaborRate: "0.02",
		EffectiveTaxRate: "0.16", TargetNetMargin: "0.03", MinimumMarginRate: "0.02",
	}).Error)
	require.NoError(t, DB.Create(&ChannelModelPurchasePriceVersion{
		Id: 3, ChannelModelId: 4, BillingMode: "token", PricingMode: "official_ratio",
		PriceStructure: "flat", PurchaseBillingExpr: "v2:p / 1000000", Currency: "USD",
		Version: 1, Status: PricingVersionStatusActive,
	}).Error)
	require.NoError(t, DB.Create(&SalesPriceBookItem{
		Id: 5, PriceBookVersionId: 2, ModelId: 6, Status: "enabled",
		BillingMode: "token", PriceStructure: "flat", SalesBillingExpr: "v2:p / 1000000",
		PricingMethod: "official_discount",
	}).Error)
	require.NoError(t, DB.Exec(`UPDATE sales_price_book_items
		SET primary_purchase_version_id = 3, official_discount = '0.85', currency = 'USD'
		WHERE id = 5`).Error)
	require.NoError(t, DB.Exec(`UPDATE channel_model_purchase_price_versions
		SET purchase_discount = '0.7', input_unit_price = '1.25', output_unit_price = '5',
			price_unit = 'per_1m_tokens' WHERE id = 3`).Error)
	require.NoError(t, DB.Exec(`INSERT INTO sales_price_book_item_basis_sources
		(id, price_book_item_id, channel_model_id, purchase_price_version_id, source_role)
		VALUES (1, 5, 4, 3, 'selected')`).Error)

	require.NoError(t, migrateSalesPriceBookSchema())
	assert.False(t, DB.Migrator().HasTable(&legacySalesPriceBookItemBasisSourceMigration{}))
	for migrationModel, columns := range map[any][]string{
		&legacySalesPriceBookItemPlaceholderMigration{}:           {"primary_purchase_version_id", "selling_factor", "official_discount", "currency"},
		&legacyChannelModelPurchasePriceVersionPricingMigration{}: {"purchase_discount", "input_unit_price", "output_unit_price", "price_unit"},
	} {
		for _, column := range columns {
			assert.False(t, DB.Migrator().HasColumn(migrationModel, column))
		}
	}
	var item SalesPriceBookItem
	require.NoError(t, DB.First(&item, 5).Error)
	assert.JSONEq(t, `{"official_discount":"0.85"}`, item.PricingConfig)
	var purchase ChannelModelPurchasePriceVersion
	require.NoError(t, DB.First(&purchase, 3).Error)
	assert.Equal(t, "0.7", purchase.PurchaseDiscount)
	assert.Equal(t, "1.25", purchase.InputUnitPrice)
	assert.Equal(t, "5", purchase.OutputUnitPrice)
	var source SalesPriceBookItemCostSource
	require.NoError(t, DB.First(&source,
		"price_book_item_id = ? AND channel_model_id = ?", 5, 4).Error)
	assert.Equal(t, 3, source.PurchasePriceVersionId)
	assert.Equal(t, "selected", source.SourceRole)
	require.NoError(t, migrateSalesPriceBookSchema())
}

func TestBackfillProviderCostTrackingClassifiesExistingSnapshots(t *testing.T) {
	resetChannelModelPricingTestTables(t)
	require.NoError(t, DB.Create([]Channel{
		{Id: 301, Name: "openai-compatible", Type: constant.ChannelTypeOpenAI},
		{Id: 302, Name: "openrouter", Type: constant.ChannelTypeOpenRouter},
	}).Error)
	require.NoError(t, DB.Create([]Model{
		{Id: 301, ModelName: "estimated-model"},
		{Id: 302, ModelName: "reported-model"},
	}).Error)
	require.NoError(t, DB.Create([]ChannelModel{
		{Id: 301, ChannelId: 301, ModelId: 301, UpstreamModelName: "estimated-model"},
		{Id: 302, ChannelId: 302, ModelId: 302, UpstreamModelName: "reported-model"},
	}).Error)
	require.NoError(t, DB.Create([]RequestPricingSnapshot{
		{
			RequestId: "existing-estimated", UserId: 1, ModelId: 301, ChannelModelId: 301,
			PurchasePriceVersionId: 1, BillingMode: "token",
			PurchaseCost: "0.1", SalesAmount: "0.2", Currency: "USD", Status: "settled",
		},
		{
			RequestId: "existing-pending", UserId: 1, ModelId: 302, ChannelModelId: 302,
			PurchasePriceVersionId: 1, BillingMode: "token",
			PurchaseCost: "0.1", SalesAmount: "0.2", Currency: "USD", Status: "settled",
		},
		{
			RequestId: "existing-confirmed", UserId: 1, ModelId: 302, ChannelModelId: 302,
			PurchasePriceVersionId: 1, BillingMode: "token",
			PurchaseCost: "0.1", ProviderReportedCost: "0.11", ProviderCostKnown: true,
			SalesAmount: "0.2", Currency: "USD", Status: "settled",
		},
	}).Error)
	require.NoError(t, DB.Model(&Channel{}).Where("id IN ?", []int{301, 302}).
		Update("provider_cost_mode", "").Error)
	require.NoError(t, DB.Model(&RequestPricingSnapshot{}).
		Where("request_id IN ?", []string{"existing-estimated", "existing-pending", "existing-confirmed"}).
		Updates(map[string]any{
			"provider_cost_mode":         "",
			"provider_cost_status":       "",
			"provider_cost_source":       "",
			"provider_cost_confirmed_at": 0,
		}).Error)

	require.NoError(t, BackfillProviderCostTracking())

	var channels []Channel
	require.NoError(t, DB.Where("id IN ?", []int{301, 302}).Order("id").Find(&channels).Error)
	require.Len(t, channels, 2)
	assert.Equal(t, ProviderCostModeEstimated, channels[0].ProviderCostMode)
	assert.Equal(t, ProviderCostModeResponseReported, channels[1].ProviderCostMode)
	var snapshots []RequestPricingSnapshot
	require.NoError(t, DB.Where(
		"request_id IN ?",
		[]string{"existing-estimated", "existing-pending", "existing-confirmed"},
	).Order("request_id").Find(&snapshots).Error)
	require.Len(t, snapshots, 3)
	assert.Equal(t, ProviderCostStatusConfirmed, snapshots[0].ProviderCostStatus)
	assert.Equal(t, ProviderCostSourceLegacy, snapshots[0].ProviderCostSource)
	assert.Positive(t, snapshots[0].ProviderCostConfirmedAt)
	assert.Equal(t, ProviderCostStatusEstimated, snapshots[1].ProviderCostStatus)
	assert.Equal(t, ProviderCostStatusPending, snapshots[2].ProviderCostStatus)
}

func resetChannelModelPricingTestTables(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(
		&Ability{},
		&Channel{},
		&Model{},
		&ChannelModel{},
		&OfficialModelPriceVersion{},
		&ChannelModelPurchasePriceVersion{},
		&RequestPricingSnapshot{},
	))
	for _, table := range []string{
		"request_pricing_snapshots",
		"channel_model_purchase_price_versions",
		"official_model_price_versions",
		"channel_models",
		"abilities",
		"models",
		"channels",
	} {
		require.NoError(t, DB.Exec("DELETE FROM "+table).Error)
	}
}

func TestSearchChannelsByRoutingAbilityUsesLogicalModelAndExactGroup(t *testing.T) {
	resetChannelModelPricingTestTables(t)

	mapping := `{"openai/gpt-test":"provider-gpt-test"}`
	relevantPriority := int64(20)
	otherPriority := int64(10)
	require.NoError(t, DB.Create([]Channel{
		{
			Id: 401, Name: "mapped-internal", Status: common.ChannelStatusEnabled,
			Models: "provider-gpt-test", Group: "internal-model", ModelMapping: &mapping,
			Priority: &relevantPriority,
		},
		{
			Id: 402, Name: "mapped-public", Status: common.ChannelStatusEnabled,
			Models: "provider-gpt-test", Group: "default", ModelMapping: &mapping,
			Priority: &otherPriority,
		},
	}).Error)
	require.NoError(t, DB.Create([]Ability{
		{Group: "internal-model", Model: "openai/gpt-test", ChannelId: 401, Enabled: true},
		{Group: "default", Model: "openai/gpt-test", ChannelId: 402, Enabled: true},
	}).Error)

	channels, err := SearchChannelsByRoutingAbility("internal-model", "openai/gpt-test", false)
	require.NoError(t, err)
	require.Len(t, channels, 1)
	assert.Equal(t, 401, channels[0].Id)
	assert.Equal(t, "mapped-internal", channels[0].Name)
}

func TestInitializeChannelModelsFromAbilitiesAggregatesGroups(t *testing.T) {
	resetChannelModelPricingTestTables(t)

	modelMapping := `{"gpt-test":"provider-gpt-test"}`
	require.NoError(t, DB.Create(&Channel{
		Id:           201,
		Name:         "mapped-channel",
		ModelMapping: &modelMapping,
	}).Error)
	require.NoError(t, DB.Create(&Model{Id: 101, ModelName: "gpt-test"}).Error)
	priorityLow := int64(5)
	priorityHigh := int64(20)
	require.NoError(t, DB.Create([]Ability{
		{
			Group:     "default",
			Model:     "gpt-test",
			ChannelId: 201,
			Enabled:   true,
			Priority:  &priorityLow,
			Weight:    10,
		},
		{
			Group:     "vip",
			Model:     "gpt-test",
			ChannelId: 201,
			Enabled:   false,
			Priority:  &priorityHigh,
			Weight:    30,
		},
		{
			Group:     "default",
			Model:     "missing-model",
			ChannelId: 201,
			Enabled:   true,
		},
	}).Error)

	result, err := InitializeChannelModelsFromAbilities()
	require.NoError(t, err)
	assert.Equal(t, 1, result.Created)
	assert.Equal(t, 1, result.SkippedUnknown)
	assert.Equal(t, []string{"missing-model"}, result.UnknownModelNames)

	var channelModel ChannelModel
	require.NoError(t, DB.First(&channelModel).Error)
	assert.Equal(t, 201, channelModel.ChannelId)
	assert.Equal(t, 101, channelModel.ModelId)
	assert.Equal(t, "provider-gpt-test", channelModel.UpstreamModelName)
	assert.Equal(t, 1, channelModel.Status)
	assert.Equal(t, int64(20), channelModel.Priority)
	assert.Equal(t, uint(30), channelModel.Weight)
}

func TestInitializeChannelModelsFromAbilitiesRepairsUpstreamModelName(t *testing.T) {
	resetChannelModelPricingTestTables(t)

	modelMapping := `{"gpt-test":"provider-gpt-test"}`
	require.NoError(t, DB.Create(&Channel{
		Id:           201,
		Name:         "mapped-channel",
		ModelMapping: &modelMapping,
	}).Error)
	require.NoError(t, DB.Create(&Model{Id: 101, ModelName: "gpt-test"}).Error)
	require.NoError(t, DB.Create(&Ability{
		Group:     "default",
		Model:     "gpt-test",
		ChannelId: 201,
		Enabled:   true,
	}).Error)
	require.NoError(t, DB.Create(&ChannelModel{
		ChannelId:         201,
		ModelId:           101,
		UpstreamModelName: "gpt-test",
		Status:            1,
	}).Error)

	result, err := InitializeChannelModelsFromAbilities()
	require.NoError(t, err)
	assert.Zero(t, result.Created)
	assert.Equal(t, 1, result.Updated)

	var channelModels []ChannelModel
	require.NoError(t, DB.Find(&channelModels).Error)
	require.Len(t, channelModels, 1)
	assert.Equal(t, "provider-gpt-test", channelModels[0].UpstreamModelName)
}

func TestInitializeChannelModelsFromAbilitiesDoesNotRecreateDisabledInventory(t *testing.T) {
	resetChannelModelPricingTestTables(t)

	require.NoError(t, DB.Create(&Channel{Id: 202, Name: "removed-channel"}).Error)
	require.NoError(t, DB.Create(&Model{Id: 102, ModelName: "removed-model"}).Error)
	require.NoError(t, DB.Create(&Ability{
		Group: "default", Model: "removed-model", ChannelId: 202, Enabled: false,
	}).Error)

	result, err := InitializeChannelModelsFromAbilities()
	require.NoError(t, err)
	assert.Zero(t, result.Created)

	var count int64
	require.NoError(t, DB.Model(&ChannelModel{}).Count(&count).Error)
	assert.Zero(t, count)
}

func TestPublishedOfficialPriceVersionCannotBeMutated(t *testing.T) {
	resetChannelModelPricingTestTables(t)

	version := OfficialModelPriceVersion{
		ModelId:                 101,
		BillingMode:             "token",
		PriceStructure:          "flat",
		PriceComponents:         "{}",
		BillingExpr:             "v1:tier(\"base\", p * 1 + c * 2)",
		ExprHash:                "hash",
		ExpressionSource:        "generated",
		ExpressionSchemaVersion: "v1",
		Currency:                "USD",
		Source:                  "manual",
		Version:                 1,
		Status:                  PricingVersionStatusActive,
		EffectiveFrom:           1,
	}
	require.NoError(t, DB.Create(&version).Error)

	version.Remark = "must not change"
	err := DB.Save(&version).Error
	require.ErrorContains(t, err, "published pricing versions are immutable")

	var stored OfficialModelPriceVersion
	require.NoError(t, DB.First(&stored, version.Id).Error)
	assert.Empty(t, stored.Remark)
}

func TestBackfillOfficialPriceSourceURLsUsesStoredEvidence(t *testing.T) {
	resetChannelModelPricingTestTables(t)
	versions := []OfficialModelPriceVersion{
		{
			Id: 301, ModelId: 101, BillingMode: "token", PriceStructure: "flat",
			PriceComponents: `{"provider_reference":{"source_url":"https://docs.example.com/components"}}`,
			BillingExpr:     "v2:p / 1000000", ExprHash: "hash", ExpressionSchemaVersion: "v2",
			Currency: "USD", Source: "vendor-official", Version: 1, Status: PricingVersionStatusActive,
		},
		{
			Id: 302, ModelId: 102, BillingMode: "token", PriceStructure: "flat",
			PriceComponents: `{}`, BillingExpr: "v2:p / 1000000", ExprHash: "hash",
			ExpressionSchemaVersion: "v2", Currency: "USD", Source: "vendor-official",
			Version: 1, Status: PricingVersionStatusActive,
			Remark: "Regenerated price. Official source: https://docs.example.com/remark; reviewed.",
		},
	}
	require.NoError(t, DB.Create(&versions).Error)

	require.NoError(t, BackfillOfficialPriceSourceURLs())

	var stored []OfficialModelPriceVersion
	require.NoError(t, DB.Where("id IN ?", []int{301, 302}).Order("id ASC").Find(&stored).Error)
	require.Len(t, stored, 2)
	assert.Equal(t, "https://docs.example.com/components", stored[0].SourceUrl)
	assert.Equal(t, "https://docs.example.com/remark", stored[1].SourceUrl)
}
