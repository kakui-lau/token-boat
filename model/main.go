package model

import (
	"errors"
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"

	"github.com/glebarez/sqlite"
	"github.com/shopspring/decimal"
	"gorm.io/driver/clickhouse"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var commonGroupCol string
var commonKeyCol string
var commonTrueVal string
var commonFalseVal string

var logKeyCol string
var logGroupCol string

func initCol() {
	// init common column names
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		commonGroupCol = `"group"`
		commonKeyCol = `"key"`
		commonTrueVal = "true"
		commonFalseVal = "false"
	} else {
		commonGroupCol = "`group`"
		commonKeyCol = "`key`"
		commonTrueVal = "1"
		commonFalseVal = "0"
	}
	switch common.LogDatabaseType() {
	case common.DatabaseTypePostgreSQL:
		logGroupCol = `"group"`
		logKeyCol = `"key"`
	default:
		logGroupCol = "`group`"
		logKeyCol = "`key`"
	}
}

var DB *gorm.DB

var LOG_DB *gorm.DB

func createRootAccountIfNeed() error {
	var user User
	//if user.Status != common.UserStatusEnabled {
	if err := DB.First(&user).Error; err != nil {
		common.SysLog("no user exists, create a root user for you: username is root, password is 123456")
		hashedPassword, err := common.Password2Hash("123456")
		if err != nil {
			return err
		}
		rootUser := User{
			Username:    "root",
			Password:    hashedPassword,
			Role:        common.RoleRootUser,
			Status:      common.UserStatusEnabled,
			DisplayName: "Root User",
			AccessToken: nil,
			Quota:       100000000,
		}
		DB.Create(&rootUser)
	}
	return nil
}

func CheckSetup() {
	setup := GetSetup()
	if setup == nil {
		// No setup record exists, check if we have a root user
		if RootUserExists() {
			common.SysLog("system is not initialized, but root user exists")
			// Create setup record
			newSetup := Setup{
				Version:       common.Version,
				InitializedAt: time.Now().Unix(),
			}
			err := DB.Create(&newSetup).Error
			if err != nil {
				common.SysLog("failed to create setup record: " + err.Error())
			}
			constant.Setup = true
		} else {
			common.SysLog("system is not initialized and no root user exists")
			constant.Setup = false
		}
	} else {
		// Setup record exists, system is initialized
		common.SysLog("system is already initialized at: " + time.Unix(setup.InitializedAt, 0).String())
		constant.Setup = true
	}
}

func isClickHouseDSN(dsn string) bool {
	return strings.HasPrefix(dsn, "clickhouse://") ||
		strings.HasPrefix(dsn, "tcp://") ||
		strings.HasPrefix(dsn, "http://") ||
		strings.HasPrefix(dsn, "https://")
}

func normalizeClickHouseDSN(dsn string) string {
	parsed, err := url.Parse(dsn)
	if err != nil || parsed.Scheme != "https" {
		return dsn
	}
	query := parsed.Query()
	if _, ok := query["secure"]; !ok {
		query.Set("secure", "true")
		parsed.RawQuery = query.Encode()
	}
	return parsed.String()
}

func chooseDB(envName string, isLog bool) (*gorm.DB, common.DatabaseType, error) {
	dsn := os.Getenv(envName)
	if dsn != "" {
		if isClickHouseDSN(dsn) {
			if !isLog {
				return nil, "", fmt.Errorf("%s does not support ClickHouse; use SQLite, MySQL, or PostgreSQL for the primary database and LOG_SQL_DSN for ClickHouse logs", envName)
			}
			common.SysLog("using ClickHouse as log database")
			db, err := gorm.Open(clickhouse.Open(normalizeClickHouseDSN(dsn)), newGormConfig(false))
			return db, common.DatabaseTypeClickHouse, err
		}
		if strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") {
			// Use PostgreSQL
			common.SysLog("using PostgreSQL as database")
			db, err := gorm.Open(postgres.New(postgres.Config{
				DSN:                  dsn,
				PreferSimpleProtocol: true, // disables implicit prepared statement usage
			}), newGormConfig(true))
			return db, common.DatabaseTypePostgreSQL, err
		}
		if strings.HasPrefix(dsn, "local") {
			common.SysLog("SQL_DSN not set, using SQLite as database")
			db, err := gorm.Open(sqlite.Open(common.SQLitePath), newGormConfig(true))
			return db, common.DatabaseTypeSQLite, err
		}
		// Use MySQL
		common.SysLog("using MySQL as database")
		// check parseTime
		if !strings.Contains(dsn, "parseTime") {
			if strings.Contains(dsn, "?") {
				dsn += "&parseTime=true"
			} else {
				dsn += "?parseTime=true"
			}
		}
		db, err := gorm.Open(mysql.Open(dsn), newGormConfig(true))
		return db, common.DatabaseTypeMySQL, err
	}
	// Use SQLite
	common.SysLog("SQL_DSN not set, using SQLite as database")
	db, err := gorm.Open(sqlite.Open(common.SQLitePath), newGormConfig(true))
	return db, common.DatabaseTypeSQLite, err
}

func InitDB() (err error) {
	db, dbType, err := chooseDB("SQL_DSN", false)
	if err == nil {
		common.SetMainDatabaseType(dbType)
		if os.Getenv("LOG_SQL_DSN") == "" {
			common.SetLogDatabaseType(dbType)
		}
		initCol()
		if common.DebugEnabled {
			db = db.Debug()
		}
		DB = db
		// MySQL charset/collation startup check: ensure Chinese-capable charset
		if common.UsingMainDatabase(common.DatabaseTypeMySQL) {
			if err := checkMySQLChineseSupport(DB); err != nil {
				panic(err)
			}
		}
		sqlDB, err := DB.DB()
		if err != nil {
			return err
		}
		sqlDB.SetMaxIdleConns(common.GetEnvOrDefault("SQL_MAX_IDLE_CONNS", 100))
		sqlDB.SetMaxOpenConns(common.GetEnvOrDefault("SQL_MAX_OPEN_CONNS", 1000))
		sqlDB.SetConnMaxLifetime(time.Second * time.Duration(common.GetEnvOrDefault("SQL_MAX_LIFETIME", 60)))

		if !common.ShouldRunStartupMigrations() {
			return nil
		}
		if common.UsingMainDatabase(common.DatabaseTypeMySQL) {
			//_, _ = sqlDB.Exec("ALTER TABLE channels MODIFY model_mapping TEXT;") // TODO: delete this line when most users have upgraded
		}
		common.SysLog("database migration started")
		err = migrateDB()
		return err
	} else {
		common.FatalLog(err)
	}
	return err
}

func InitLogDB() (err error) {
	if os.Getenv("LOG_SQL_DSN") == "" {
		LOG_DB = DB
		common.SetLogDatabaseType(common.MainDatabaseType())
		initCol()
		return
	}
	db, dbType, err := chooseDB("LOG_SQL_DSN", true)
	if err == nil {
		common.SetLogDatabaseType(dbType)
		initCol()
		if common.DebugEnabled {
			db = db.Debug()
		}
		LOG_DB = db
		// If log DB is MySQL, also ensure Chinese-capable charset
		if common.UsingLogDatabase(common.DatabaseTypeMySQL) {
			if err := checkMySQLChineseSupport(LOG_DB); err != nil {
				panic(err)
			}
		}
		sqlDB, err := LOG_DB.DB()
		if err != nil {
			return err
		}
		sqlDB.SetMaxIdleConns(common.GetEnvOrDefault("SQL_MAX_IDLE_CONNS", 100))
		sqlDB.SetMaxOpenConns(common.GetEnvOrDefault("SQL_MAX_OPEN_CONNS", 1000))
		sqlDB.SetConnMaxLifetime(time.Second * time.Duration(common.GetEnvOrDefault("SQL_MAX_LIFETIME", 60)))

		if !common.ShouldRunStartupMigrations() {
			return nil
		}
		common.SysLog("database migration started")
		err = migrateLOGDB()
		return err
	} else {
		common.FatalLog(err)
	}
	return err
}

func migrateDB() error {
	pricingChangeBatchTableExisted := DB.Migrator().HasTable(&PricingChangeBatch{})
	// Migrate price_amount column from float/double to decimal for existing tables
	migrateSubscriptionPlanPriceAmount()
	// Migrate model_limits column from varchar to text for existing tables
	if err := migrateTokenModelLimitsToText(); err != nil {
		return err
	}
	if err := renameLegacyPricingSnapshotColumns(); err != nil {
		return err
	}
	if err := renamePricingAuditTable(); err != nil {
		return err
	}

	err := DB.AutoMigrate(
		&Channel{},
		&Token{},
		&User{},
		&UserSession{},
		&AuthFlow{},
		&ExternalIdentityClaim{},
		&PasskeyCredential{},
		&Option{},
		&Redemption{},
		&Ability{},
		&Log{},
		&Midjourney{},
		&TopUp{},
		&QuotaData{},
		&Task{},
		&Model{},
		&Vendor{},
		&PrefillGroup{},
		&Setup{},
		&TwoFA{},
		&TwoFABackupCode{},
		&Checkin{},
		&SubscriptionOrder{},
		&UserSubscription{},
		&SubscriptionPreConsumeRecord{},
		&CustomOAuthProvider{},
		&UserOAuthBinding{},
		&PerfMetric{},
		&ChannelModelProbe{},
		&SystemInstance{},
		&SystemTask{},
		&SystemTaskLock{},
		&ChannelDailyUsage{},
		&ChannelDailyUsageMonth{},
		&CasbinRule{},
		&AuthzRole{},
		&ChannelModel{},
		&ModelOfficialPrice{},
		&OfficialModelPriceVersion{},
		&OfficialPriceSyncBatch{},
		&ChannelModelPurchasePriceVersion{},
		&SalesPriceBook{},
		&SalesPriceBookVersion{},
		&SalesPriceBookItem{},
		&SalesPriceBookItemCostSource{},
		&SalesPriceBookChannelModelOverride{},
		&SalesPriceBookDefault{},
		&UserPriceBookAssignment{},
		&PricingChangeBatch{},
		&PricingChangeBatchItem{},
		&PricingAuditRecord{},
		&RequestPricingSnapshot{},
		&PricingCircuitEvent{},
		&PaymentCallbackEvent{},
		&FinanceAlert{},
	)
	if err != nil {
		return err
	}
	if !pricingChangeBatchTableExisted {
		if err := InitializePricingAutomationBaselines(); err != nil {
			return err
		}
	}
	if err := retireLegacyChannelRetailPricing(); err != nil {
		return err
	}
	if err := retirePricingChangeBatchApprovalColumns(); err != nil {
		return err
	}
	if err := migrateSalesPriceBookSchema(); err != nil {
		return err
	}
	if err := retirePricingApprovalIndex(); err != nil {
		return err
	}
	if err := retireLegacyModelPricingOptions(); err != nil {
		return err
	}
	if err := BackfillOfficialPriceSourceURLs(); err != nil {
		return err
	}
	if err := InitializeModelOfficialPrices(); err != nil {
		return err
	}
	if err := InitializeUserAuthVersions(); err != nil {
		return err
	}
	if err := InitializeExternalIdentityClaims(); err != nil {
		return err
	}
	if err := BackfillProviderCostTracking(); err != nil {
		return err
	}
	if common.UsingMainDatabase(common.DatabaseTypeSQLite) {
		if err := ensureSubscriptionPlanTableSQLite(); err != nil {
			return err
		}
	} else {
		if err := DB.AutoMigrate(&SubscriptionPlan{}); err != nil {
			return err
		}
	}
	return nil
}

func migrateDBFast() error {
	pricingChangeBatchTableExisted := DB.Migrator().HasTable(&PricingChangeBatch{})
	if err := renameLegacyPricingSnapshotColumns(); err != nil {
		return err
	}
	if err := renamePricingAuditTable(); err != nil {
		return err
	}

	var wg sync.WaitGroup

	migrations := []struct {
		model interface{}
		name  string
	}{
		{&Channel{}, "Channel"},
		{&Token{}, "Token"},
		{&User{}, "User"},
		{&UserSession{}, "UserSession"},
		{&AuthFlow{}, "AuthFlow"},
		{&ExternalIdentityClaim{}, "ExternalIdentityClaim"},
		{&PasskeyCredential{}, "PasskeyCredential"},
		{&Option{}, "Option"},
		{&Redemption{}, "Redemption"},
		{&Ability{}, "Ability"},
		{&Log{}, "Log"},
		{&Midjourney{}, "Midjourney"},
		{&TopUp{}, "TopUp"},
		{&QuotaData{}, "QuotaData"},
		{&Task{}, "Task"},
		{&Model{}, "Model"},
		{&Vendor{}, "Vendor"},
		{&PrefillGroup{}, "PrefillGroup"},
		{&Setup{}, "Setup"},
		{&TwoFA{}, "TwoFA"},
		{&TwoFABackupCode{}, "TwoFABackupCode"},
		{&Checkin{}, "Checkin"},
		{&SubscriptionOrder{}, "SubscriptionOrder"},
		{&UserSubscription{}, "UserSubscription"},
		{&SubscriptionPreConsumeRecord{}, "SubscriptionPreConsumeRecord"},
		{&CustomOAuthProvider{}, "CustomOAuthProvider"},
		{&UserOAuthBinding{}, "UserOAuthBinding"},
		{&PerfMetric{}, "PerfMetric"},
		{&ChannelModelProbe{}, "ChannelModelProbe"},
		{&SystemInstance{}, "SystemInstance"},
		{&SystemTask{}, "SystemTask"},
		{&SystemTaskLock{}, "SystemTaskLock"},
		{&ChannelDailyUsage{}, "ChannelDailyUsage"},
		{&ChannelDailyUsageMonth{}, "ChannelDailyUsageMonth"},
		{&ChannelModel{}, "ChannelModel"},
		{&ModelOfficialPrice{}, "ModelOfficialPrice"},
		{&OfficialModelPriceVersion{}, "OfficialModelPriceVersion"},
		{&OfficialPriceSyncBatch{}, "OfficialPriceSyncBatch"},
		{&ChannelModelPurchasePriceVersion{}, "ChannelModelPurchasePriceVersion"},
		{&SalesPriceBook{}, "SalesPriceBook"},
		{&SalesPriceBookVersion{}, "SalesPriceBookVersion"},
		{&SalesPriceBookItem{}, "SalesPriceBookItem"},
		{&SalesPriceBookItemCostSource{}, "SalesPriceBookItemCostSource"},
		{&SalesPriceBookChannelModelOverride{}, "SalesPriceBookChannelModelOverride"},
		{&SalesPriceBookDefault{}, "SalesPriceBookDefault"},
		{&UserPriceBookAssignment{}, "UserPriceBookAssignment"},
		{&PricingChangeBatch{}, "PricingChangeBatch"},
		{&PricingChangeBatchItem{}, "PricingChangeBatchItem"},
		{&PricingAuditRecord{}, "PricingAuditRecord"},
		{&RequestPricingSnapshot{}, "RequestPricingSnapshot"},
		{&PricingCircuitEvent{}, "PricingCircuitEvent"},
		{&PaymentCallbackEvent{}, "PaymentCallbackEvent"},
		{&FinanceAlert{}, "FinanceAlert"},
	}
	// 动态计算migration数量，确保errChan缓冲区足够大
	errChan := make(chan error, len(migrations))

	for _, m := range migrations {
		wg.Add(1)
		go func(model interface{}, name string) {
			defer wg.Done()
			if err := DB.AutoMigrate(model); err != nil {
				errChan <- fmt.Errorf("failed to migrate %s: %v", name, err)
			}
		}(m.model, m.name)
	}

	// Wait for all migrations to complete
	wg.Wait()
	close(errChan)

	// Check for any errors
	for err := range errChan {
		if err != nil {
			return err
		}
	}
	if !pricingChangeBatchTableExisted {
		if err := InitializePricingAutomationBaselines(); err != nil {
			return err
		}
	}
	if err := retireLegacyChannelRetailPricing(); err != nil {
		return err
	}
	if err := retirePricingChangeBatchApprovalColumns(); err != nil {
		return err
	}
	if err := migrateSalesPriceBookSchema(); err != nil {
		return err
	}
	if err := retirePricingApprovalIndex(); err != nil {
		return err
	}
	if err := retireLegacyModelPricingOptions(); err != nil {
		return err
	}
	if err := BackfillOfficialPriceSourceURLs(); err != nil {
		return err
	}
	if err := InitializeModelOfficialPrices(); err != nil {
		return err
	}
	if err := InitializeUserAuthVersions(); err != nil {
		return err
	}
	if err := InitializeExternalIdentityClaims(); err != nil {
		return err
	}
	if err := BackfillProviderCostTracking(); err != nil {
		return err
	}
	if common.UsingMainDatabase(common.DatabaseTypeSQLite) {
		if err := ensureSubscriptionPlanTableSQLite(); err != nil {
			return err
		}
	} else {
		if err := DB.AutoMigrate(&SubscriptionPlan{}); err != nil {
			return err
		}
	}
	common.SysLog("database migrated")
	return nil
}

type legacyChannelModelPricingMigration struct {
	Id          int
	RuntimeMode string `gorm:"column:runtime_mode"`
}

func renamePricingAuditTable() error {
	const oldTable = "pricing_approval_records"
	const newTable = "pricing_audit_records"
	oldExists := DB.Migrator().HasTable(oldTable)
	newExists := DB.Migrator().HasTable(newTable)
	if !oldExists {
		return nil
	}
	if !newExists {
		common.SysLog("renaming pricing approval records to pricing audit records")
		return DB.Migrator().RenameTable(oldTable, newTable)
	}
	var oldCount int64
	if err := DB.Table(oldTable).Count(&oldCount).Error; err != nil {
		return err
	}
	if oldCount == 0 {
		return DB.Migrator().DropTable(oldTable)
	}
	var newCount int64
	if err := DB.Table(newTable).Count(&newCount).Error; err != nil {
		return err
	}
	if newCount > 0 {
		return errors.New("both pricing approval and pricing audit tables contain data")
	}
	if err := DB.Migrator().DropTable(newTable); err != nil {
		return err
	}
	return DB.Migrator().RenameTable(oldTable, newTable)
}

func retirePricingApprovalIndex() error {
	const legacyIndex = "idx_pricing_approval_object"
	if !DB.Migrator().HasTable(&PricingAuditRecord{}) ||
		!DB.Migrator().HasIndex(&PricingAuditRecord{}, legacyIndex) {
		return nil
	}
	common.SysLog("dropping retired pricing approval index")
	return DB.Migrator().DropIndex(&PricingAuditRecord{}, legacyIndex)
}

func (legacyChannelModelPricingMigration) TableName() string {
	return "channel_models"
}

type legacyRequestPricingSnapshotMigration struct {
	Id                   int
	RetailPriceVersionId int    `gorm:"column:retail_price_version_id"`
	AppliedGroupRatio    string `gorm:"column:applied_group_ratio"`
}

func (legacyRequestPricingSnapshotMigration) TableName() string {
	return "request_pricing_snapshots"
}

type legacyPricingChangeBatchApprovalMigration struct {
	Id         int
	ApprovedBy int   `gorm:"column:approved_by"`
	AppliedBy  int   `gorm:"column:applied_by"`
	ApprovedAt int64 `gorm:"column:approved_at"`
	AppliedAt  int64 `gorm:"column:applied_at"`
}

func (legacyPricingChangeBatchApprovalMigration) TableName() string {
	return "pricing_change_batches"
}

func retirePricingChangeBatchApprovalColumns() error {
	if !DB.Migrator().HasTable(&legacyPricingChangeBatchApprovalMigration{}) {
		return nil
	}
	columns := []struct {
		field string
		name  string
	}{
		{field: "ApprovedBy", name: "approved_by"},
		{field: "ApprovedAt", name: "approved_at"},
		{field: "AppliedBy", name: "applied_by"},
		{field: "AppliedAt", name: "applied_at"},
	}
	for _, column := range columns {
		if !DB.Migrator().HasColumn(&legacyPricingChangeBatchApprovalMigration{}, column.field) {
			continue
		}
		common.SysLog("dropping retired pricing change batch approval column " + column.name)
		// DROP COLUMN uses the same syntax on the supported SQLite, MySQL, and
		// PostgreSQL versions. Avoid GORM's SQLite table reconstruction here:
		// the legacy-only migration struct cannot describe the retained columns.
		if err := DB.Exec("ALTER TABLE pricing_change_batches DROP COLUMN " + column.name).Error; err != nil {
			return err
		}
	}
	return nil
}

type legacySalesPriceBookVersionPlaceholderMigration struct {
	Id               int
	RepriceMode      string `gorm:"column:reprice_mode"`
	RoundingMode     string `gorm:"column:rounding_mode"`
	RoundingScale    int    `gorm:"column:rounding_scale"`
	RiskAction       string `gorm:"column:risk_action"`
	PriceLockedUntil int64  `gorm:"column:price_locked_until"`
}

func (legacySalesPriceBookVersionPlaceholderMigration) TableName() string {
	return "sales_price_book_versions"
}

type legacyUserPriceBookAssignmentPlaceholderMigration struct {
	Id               int
	PriceLockedUntil int64 `gorm:"column:price_locked_until"`
}

func (legacyUserPriceBookAssignmentPlaceholderMigration) TableName() string {
	return "user_price_book_assignments"
}

type legacySalesPriceBookItemPlaceholderMigration struct {
	Id                       int
	PriceBookVersionId       int    `gorm:"column:price_book_version_id"`
	ModelId                  int    `gorm:"column:model_id"`
	PricingMethod            string `gorm:"column:pricing_method"`
	MinimumMarginOverride    string `gorm:"column:minimum_margin_override"`
	PrimaryPurchaseVersionId *int   `gorm:"column:primary_purchase_version_id"`
	SellingFactor            string `gorm:"column:selling_factor"`
	OfficialDiscount         string `gorm:"column:official_discount"`
	Currency                 string `gorm:"column:currency"`
}

func (legacySalesPriceBookItemPlaceholderMigration) TableName() string {
	return "sales_price_book_items"
}

type legacySalesPriceBookMigration struct {
	Id          int
	OwnerUserId *int `gorm:"column:owner_user_id"`
}

func (legacySalesPriceBookMigration) TableName() string {
	return "sales_price_books"
}

type legacySalesPriceBookVersionPricingMigration struct {
	Id                    int
	TotalVariableCostRate string `gorm:"column:total_variable_cost_rate"`
}

func (legacySalesPriceBookVersionPricingMigration) TableName() string {
	return "sales_price_book_versions"
}

type legacySalesPriceBookItemBasisSourceMigration struct {
	Id                     int
	PriceBookItemId        int    `gorm:"column:price_book_item_id"`
	ChannelModelId         int    `gorm:"column:channel_model_id"`
	PurchasePriceVersionId int    `gorm:"column:purchase_price_version_id"`
	SourceRole             string `gorm:"column:source_role"`
}

func (legacySalesPriceBookItemBasisSourceMigration) TableName() string {
	return "sales_price_book_item_basis_sources"
}

type legacyChannelModelPurchasePriceVersionPricingMigration struct {
	Id                  int
	PricingMode         string `gorm:"column:pricing_mode"`
	QuoteSpec           string `gorm:"column:quote_spec"`
	PriceComponents     string `gorm:"column:price_components"`
	PurchaseDiscount    string `gorm:"column:purchase_discount"`
	InputUnitPrice      string `gorm:"column:input_unit_price"`
	OutputUnitPrice     string `gorm:"column:output_unit_price"`
	CacheReadUnitPrice  string `gorm:"column:cache_read_unit_price"`
	CacheWriteUnitPrice string `gorm:"column:cache_write_unit_price"`
	PriceUnit           string `gorm:"column:price_unit"`
}

func (legacyChannelModelPurchasePriceVersionPricingMigration) TableName() string {
	return "channel_model_purchase_price_versions"
}

func migrateSalesPriceBookSchema() error {
	if err := migrateLegacySalesPriceBookCostSources(); err != nil {
		return err
	}
	if err := backfillLegacySalesPriceBookItemMinimumMargins(); err != nil {
		return err
	}
	if err := backfillSalesPriceBookItemPricingConfig(); err != nil {
		return err
	}
	if err := backfillPurchasePriceCanonicalFields(); err != nil {
		return err
	}
	if !strings.EqualFold(strings.TrimSpace(os.Getenv("PRICING_SCHEMA_FINALIZE")), "true") {
		return nil
	}
	return finalizeSalesPriceBookSchema()
}

// finalizeSalesPriceBookSchema is the contract phase of the online migration.
// Keep it behind an explicit switch so a rolling deployment can first move all
// readers and writers to the canonical columns before old pods are drained.
func finalizeSalesPriceBookSchema() error {
	tables := []struct {
		model any
		name  string
		cols  []string
	}{
		{model: &legacySalesPriceBookVersionPlaceholderMigration{}, name: "sales_price_book_versions", cols: []string{
			"reprice_mode", "rounding_mode", "rounding_scale", "risk_action", "price_locked_until",
		}},
		{model: &legacyUserPriceBookAssignmentPlaceholderMigration{}, name: "user_price_book_assignments", cols: []string{
			"price_locked_until",
		}},
		{model: &legacySalesPriceBookItemPlaceholderMigration{}, name: "sales_price_book_items", cols: []string{
			"minimum_margin_override", "primary_purchase_version_id", "selling_factor", "official_discount", "currency",
		}},
		{model: &legacySalesPriceBookMigration{}, name: "sales_price_books", cols: []string{
			"owner_user_id",
		}},
		{model: &legacySalesPriceBookVersionPricingMigration{}, name: "sales_price_book_versions", cols: []string{
			"total_variable_cost_rate",
		}},
		{model: &legacyChannelModelPurchasePriceVersionPricingMigration{}, name: "channel_model_purchase_price_versions", cols: []string{
			"purchase_discount", "input_unit_price", "output_unit_price", "cache_read_unit_price", "cache_write_unit_price", "price_unit",
		}},
	}
	for _, table := range tables {
		if !DB.Migrator().HasTable(table.model) {
			continue
		}
		for _, column := range table.cols {
			if !DB.Migrator().HasColumn(table.model, column) {
				continue
			}
			common.SysLog("dropping retired placeholder pricing column " + table.name + "." + column)
			if err := DB.Exec("ALTER TABLE " + table.name + " DROP COLUMN " + column).Error; err != nil {
				return err
			}
		}
	}
	legacySources := &legacySalesPriceBookItemBasisSourceMigration{}
	if DB.Migrator().HasTable(legacySources) {
		common.SysLog("dropping retired sales price-book basis source table")
		if err := DB.Migrator().DropTable(legacySources); err != nil {
			return err
		}
	}
	return nil
}

func migrateLegacySalesPriceBookCostSources() error {
	legacy := &legacySalesPriceBookItemBasisSourceMigration{}
	if !DB.Migrator().HasTable(legacy) || !DB.Migrator().HasTable(&SalesPriceBookItemCostSource{}) {
		return nil
	}
	var rows []legacySalesPriceBookItemBasisSourceMigration
	if err := DB.Table(legacy.TableName()).Order("id ASC").Find(&rows).Error; err != nil {
		return err
	}
	type sourceKey struct {
		itemId         int
		channelModelId int
	}
	merged := make(map[sourceKey]legacySalesPriceBookItemBasisSourceMigration, len(rows))
	for _, row := range rows {
		key := sourceKey{itemId: row.PriceBookItemId, channelModelId: row.ChannelModelId}
		current, ok := merged[key]
		if !ok {
			merged[key] = row
			continue
		}
		if current.PurchasePriceVersionId != row.PurchasePriceVersionId {
			return fmt.Errorf(
				"sales price item %d has conflicting purchase versions for channel model %d",
				row.PriceBookItemId, row.ChannelModelId,
			)
		}
		if pricingSourceRolePriority(row.SourceRole) > pricingSourceRolePriority(current.SourceRole) {
			current.SourceRole = row.SourceRole
			merged[key] = current
		}
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		for _, row := range merged {
			var current SalesPriceBookItemCostSource
			err := tx.Where(
				"price_book_item_id = ? AND channel_model_id = ?",
				row.PriceBookItemId, row.ChannelModelId,
			).First(&current).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				if err := tx.Create(&SalesPriceBookItemCostSource{
					PriceBookItemId:        row.PriceBookItemId,
					ChannelModelId:         row.ChannelModelId,
					PurchasePriceVersionId: row.PurchasePriceVersionId,
					SourceRole:             row.SourceRole,
				}).Error; err != nil {
					return err
				}
				continue
			}
			if err != nil {
				return err
			}
			if current.PurchasePriceVersionId != row.PurchasePriceVersionId {
				return fmt.Errorf(
					"migrated sales price cost source conflicts for item %d channel model %d",
					row.PriceBookItemId, row.ChannelModelId,
				)
			}
		}
		return nil
	})
}

func pricingSourceRolePriority(role string) int {
	switch strings.TrimSpace(role) {
	case "selected", "cost_basis":
		return 2
	case "candidate":
		return 1
	default:
		return 0
	}
}

func backfillSalesPriceBookItemPricingConfig() error {
	legacy := &legacySalesPriceBookItemPlaceholderMigration{}
	if !DB.Migrator().HasTable(legacy) ||
		!DB.Migrator().HasColumn(&SalesPriceBookItem{}, "PricingConfig") {
		return nil
	}
	columns := []string{"id", "price_book_version_id", "model_id", "pricing_method"}
	for _, column := range []string{
		"primary_purchase_version_id", "official_discount", "currency",
	} {
		if DB.Migrator().HasColumn(legacy, column) {
			columns = append(columns, column)
		}
	}
	var items []legacySalesPriceBookItemPlaceholderMigration
	if err := DB.Table(legacy.TableName()).Select(columns).Find(&items).Error; err != nil {
		return err
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		for _, item := range items {
			if strings.TrimSpace(item.Currency) != "" {
				var bookCurrency string
				if err := tx.Table("sales_price_book_versions AS version").
					Select("book.currency").
					Joins("JOIN sales_price_books AS book ON book.id = version.price_book_id").
					Where("version.id = ?", item.PriceBookVersionId).
					Scan(&bookCurrency).Error; err != nil {
					return err
				}
				if bookCurrency == "" || !strings.EqualFold(bookCurrency, item.Currency) {
					return fmt.Errorf(
						"sales price item %d currency %q does not match price book currency %q",
						item.Id, item.Currency, bookCurrency,
					)
				}
			}
			if item.PrimaryPurchaseVersionId != nil {
				var count int64
				if err := tx.Model(&SalesPriceBookItemCostSource{}).
					Where("price_book_item_id = ?", item.Id).Count(&count).Error; err != nil {
					return err
				}
				if count == 0 {
					var purchase ChannelModelPurchasePriceVersion
					if err := tx.Select("id", "channel_model_id").First(
						&purchase, *item.PrimaryPurchaseVersionId,
					).Error; err != nil {
						return fmt.Errorf("load sales price item %d primary purchase version: %w", item.Id, err)
					}
					if err := tx.Create(&SalesPriceBookItemCostSource{
						PriceBookItemId: item.Id, ChannelModelId: purchase.ChannelModelId,
						PurchasePriceVersionId: purchase.Id, SourceRole: "cost_basis",
					}).Error; err != nil {
						return err
					}
				}
			}
			if item.PricingMethod != "official_discount" || strings.TrimSpace(item.OfficialDiscount) == "" {
				continue
			}
			config, err := common.Marshal(map[string]string{
				"official_discount": strings.TrimSpace(item.OfficialDiscount),
			})
			if err != nil {
				return err
			}
			if err := tx.Model(&SalesPriceBookItem{}).Where("id = ?", item.Id).
				Where("pricing_config = ? OR pricing_config IS NULL", "").
				Update("pricing_config", string(config)).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

type legacyFlatPriceComponentsMigration struct {
	InputUnitPrice      string `json:"input_unit_price,omitempty"`
	OutputUnitPrice     string `json:"output_unit_price,omitempty"`
	CacheReadUnitPrice  string `json:"cache_read_unit_price,omitempty"`
	CacheWriteUnitPrice string `json:"cache_write_unit_price,omitempty"`
	PriceUnit           string `json:"price_unit,omitempty"`
}

func backfillPurchasePriceCanonicalFields() error {
	legacy := &legacyChannelModelPurchasePriceVersionPricingMigration{}
	if !DB.Migrator().HasTable(legacy) ||
		!DB.Migrator().HasColumn(legacy, "PurchaseDiscount") {
		return nil
	}
	var versions []legacyChannelModelPurchasePriceVersionPricingMigration
	if err := DB.Table(legacy.TableName()).Select(
		"id", "pricing_mode", "quote_spec", "price_components", "purchase_discount",
		"input_unit_price", "output_unit_price", "cache_read_unit_price", "cache_write_unit_price", "price_unit",
	).Find(&versions).Error; err != nil {
		return err
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		for _, version := range versions {
			components := legacyFlatPriceComponentsMigration{}
			if strings.TrimSpace(version.PriceComponents) != "" {
				if err := common.UnmarshalJsonStr(version.PriceComponents, &components); err != nil {
					return fmt.Errorf("purchase price version %d has invalid price components: %w", version.Id, err)
				}
			} else {
				components = legacyFlatPriceComponentsMigration{
					InputUnitPrice: version.InputUnitPrice, OutputUnitPrice: version.OutputUnitPrice,
					CacheReadUnitPrice: version.CacheReadUnitPrice, CacheWriteUnitPrice: version.CacheWriteUnitPrice,
					PriceUnit: version.PriceUnit,
				}
				encoded, err := common.Marshal(components)
				if err != nil {
					return err
				}
				version.PriceComponents = string(encoded)
			}
			legacyValues := []struct {
				name      string
				legacy    string
				canonical string
			}{
				{"input unit price", version.InputUnitPrice, components.InputUnitPrice},
				{"output unit price", version.OutputUnitPrice, components.OutputUnitPrice},
				{"cache read unit price", version.CacheReadUnitPrice, components.CacheReadUnitPrice},
				{"cache write unit price", version.CacheWriteUnitPrice, components.CacheWriteUnitPrice},
			}
			for _, value := range legacyValues {
				if strings.TrimSpace(value.legacy) != "" &&
					strings.TrimSpace(value.canonical) != strings.TrimSpace(value.legacy) {
					return fmt.Errorf("purchase price version %d has conflicting %s", version.Id, value.name)
				}
			}
			quoteSpec := strings.TrimSpace(version.QuoteSpec)
			if version.PricingMode == "official_ratio" && strings.TrimSpace(version.PurchaseDiscount) != "" {
				var spec map[string]string
				if quoteSpec == "" {
					spec = make(map[string]string)
				} else if err := common.UnmarshalJsonStr(quoteSpec, &spec); err != nil {
					return fmt.Errorf("purchase price version %d has invalid quote spec: %w", version.Id, err)
				}
				if existing := strings.TrimSpace(spec["discount"]); existing != "" &&
					existing != strings.TrimSpace(version.PurchaseDiscount) {
					return fmt.Errorf("purchase price version %d has conflicting uniform discount", version.Id)
				}
				spec["discount"] = strings.TrimSpace(version.PurchaseDiscount)
				encoded, err := common.Marshal(spec)
				if err != nil {
					return err
				}
				quoteSpec = string(encoded)
			}
			if err := tx.Model(&ChannelModelPurchasePriceVersion{}).Where("id = ?", version.Id).
				Updates(map[string]any{
					"quote_spec": quoteSpec, "price_components": version.PriceComponents,
				}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func backfillLegacySalesPriceBookItemMinimumMargins() error {
	legacy := &legacySalesPriceBookItemPlaceholderMigration{}
	if !DB.Migrator().HasTable(legacy) ||
		!DB.Migrator().HasColumn(legacy, "MinimumMarginOverride") ||
		!DB.Migrator().HasTable(&SalesPriceBookChannelModelOverride{}) {
		return nil
	}
	var items []legacySalesPriceBookItemPlaceholderMigration
	if err := DB.Table(legacy.TableName()).Select(
		"id", "price_book_version_id", "model_id", "minimum_margin_override",
	).Find(&items).Error; err != nil {
		return err
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		for _, item := range items {
			minimum, err := decimal.NewFromString(strings.TrimSpace(item.MinimumMarginOverride))
			if err != nil || !minimum.IsPositive() {
				continue
			}
			var channelModelIds []int
			if tx.Migrator().HasTable(&SalesPriceBookItemCostSource{}) {
				if err := tx.Model(&SalesPriceBookItemCostSource{}).
					Where("price_book_item_id = ?", item.Id).
					Distinct("channel_model_id").Pluck("channel_model_id", &channelModelIds).Error; err != nil {
					return err
				}
			}
			if len(channelModelIds) == 0 && tx.Migrator().HasTable(&ChannelModel{}) {
				if err := tx.Model(&ChannelModel{}).Where("model_id = ?", item.ModelId).
					Pluck("id", &channelModelIds).Error; err != nil {
					return err
				}
			}
			minimumValue := minimum.String()
			for _, channelModelId := range channelModelIds {
				var override SalesPriceBookChannelModelOverride
				err := tx.Where(
					"price_book_version_id = ? AND channel_model_id = ?",
					item.PriceBookVersionId, channelModelId,
				).First(&override).Error
				if errors.Is(err, gorm.ErrRecordNotFound) {
					override = SalesPriceBookChannelModelOverride{
						PriceBookVersionId: item.PriceBookVersionId,
						ChannelModelId:     channelModelId,
						MinimumMarginRate:  &minimumValue,
					}
					if err := tx.Create(&override).Error; err != nil {
						return err
					}
					continue
				}
				if err != nil {
					return err
				}
				if override.MinimumMarginRate == nil {
					if err := tx.Model(&SalesPriceBookChannelModelOverride{}).
						Where("id = ?", override.Id).
						Update("minimum_margin_rate", minimumValue).Error; err != nil {
						return err
					}
				}
			}
		}
		return nil
	})
}

func retireLegacyChannelRetailPricing() error {
	const table = "channel_model_retail_price_versions"
	if DB.Migrator().HasTable(table) {
		common.SysLog("dropping retired channel retail pricing table")
		if err := DB.Migrator().DropTable(table); err != nil {
			return err
		}
	}
	if DB.Migrator().HasColumn(&legacyChannelModelPricingMigration{}, "RuntimeMode") {
		common.SysLog("dropping retired channel pricing runtime mode column")
		if common.UsingMainDatabase(common.DatabaseTypeSQLite) {
			if err := DB.Exec("ALTER TABLE `channel_models` DROP COLUMN `runtime_mode`").Error; err != nil {
				return err
			}
		} else if err := DB.Migrator().DropColumn(&legacyChannelModelPricingMigration{}, "RuntimeMode"); err != nil {
			return err
		}
	}
	if DB.Migrator().HasColumn(&legacyRequestPricingSnapshotMigration{}, "RetailPriceVersionId") {
		common.SysLog("dropping retired retail price version from pricing snapshots")
		if common.UsingMainDatabase(common.DatabaseTypeSQLite) {
			if err := DB.Exec("ALTER TABLE `request_pricing_snapshots` DROP COLUMN `retail_price_version_id`").Error; err != nil {
				return err
			}
		} else if err := DB.Migrator().DropColumn(&legacyRequestPricingSnapshotMigration{}, "RetailPriceVersionId"); err != nil {
			return err
		}
	}
	if DB.Migrator().HasColumn(&legacyRequestPricingSnapshotMigration{}, "AppliedGroupRatio") {
		common.SysLog("dropping retired group ratio from pricing snapshots")
		if common.UsingMainDatabase(common.DatabaseTypeSQLite) {
			if err := DB.Exec("ALTER TABLE `request_pricing_snapshots` DROP COLUMN `applied_group_ratio`").Error; err != nil {
				return err
			}
		} else if err := DB.Migrator().DropColumn(&legacyRequestPricingSnapshotMigration{}, "AppliedGroupRatio"); err != nil {
			return err
		}
	}
	return nil
}

func retireLegacyModelPricingOptions() error {
	if !DB.Migrator().HasTable(&Option{}) {
		return nil
	}
	keys := make([]string, 0, len(retiredModelPricingOptionKeys))
	for key := range retiredModelPricingOptionKeys {
		keys = append(keys, key)
	}
	result := DB.Where("key IN ?", keys).Delete(&Option{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected > 0 {
		common.SysLog(fmt.Sprintf("removed %d retired model pricing options", result.RowsAffected))
	}
	return nil
}

func renameLegacyPricingSnapshotColumns() error {
	if !DB.Migrator().HasTable(&RequestPricingSnapshot{}) {
		return nil
	}
	for _, columns := range [][2]string{
		{"retail_amount", "sales_amount"},
		{"base_retail_amount", "base_sales_amount"},
	} {
		if !DB.Migrator().HasColumn(&RequestPricingSnapshot{}, columns[0]) ||
			DB.Migrator().HasColumn(&RequestPricingSnapshot{}, columns[1]) {
			continue
		}
		common.SysLog("renaming retired pricing snapshot column " + columns[0])
		if err := DB.Migrator().RenameColumn(&RequestPricingSnapshot{}, columns[0], columns[1]); err != nil {
			return err
		}
	}
	return nil
}

func migrateLOGDB() error {
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		return migrateClickHouseLogDB()
	}
	return LOG_DB.AutoMigrate(&Log{})
}

// RunDatabaseMigrations applies the primary and optional standalone log
// database schemas after InitDB and InitLogDB have opened their connections.
// It is intended for the explicit one-shot migration command used by
// production deployments where application pods set SKIP_DB_MIGRATION=true.
func RunDatabaseMigrations() error {
	if DB == nil {
		return fmt.Errorf("primary database is not initialized")
	}
	if LOG_DB == nil {
		return fmt.Errorf("log database is not initialized")
	}

	common.SysLog("primary database migration started")
	if err := migrateDB(); err != nil {
		return fmt.Errorf("migrate primary database: %w", err)
	}
	if LOG_DB != DB {
		common.SysLog("log database migration started")
		if err := migrateLOGDB(); err != nil {
			return fmt.Errorf("migrate log database: %w", err)
		}
	}
	common.SysLog("database migration completed")
	return nil
}

func migrateClickHouseLogDB() error {
	ttlDays := clickHouseLogTTLDays()
	if err := LOG_DB.Exec(clickHouseLogCreateTableSQL(ttlDays)).Error; err != nil {
		return err
	}
	if err := LOG_DB.Exec("ALTER TABLE logs ADD COLUMN IF NOT EXISTS task_id String DEFAULT '' AFTER upstream_request_id").Error; err != nil {
		return err
	}
	return syncClickHouseLogTTL(ttlDays)
}

func clickHouseLogTTLDays() int {
	ttlDays := common.GetEnvOrDefault("LOG_SQL_CLICKHOUSE_TTL_DAYS", 0)
	if ttlDays < 0 {
		return 0
	}
	return ttlDays
}

func clickHouseLogTTLExpression(ttlDays int) string {
	if ttlDays <= 0 {
		return ""
	}
	return fmt.Sprintf("toDateTime(created_at) + INTERVAL %d DAY DELETE", ttlDays)
}

func clickHouseLogTTLClause(ttlDays int) string {
	expression := clickHouseLogTTLExpression(ttlDays)
	if expression == "" {
		return ""
	}
	return "\nTTL " + expression
}

func clickHouseLogCreateTableSQL(ttlDays int) string {
	return fmt.Sprintf(`
CREATE TABLE IF NOT EXISTS logs (
	id Int64 DEFAULT 0,
	user_id Int32 DEFAULT 0,
	created_at Int64 DEFAULT 0,
	type Int32 DEFAULT 0,
	content String DEFAULT '',
	username String DEFAULT '',
	token_name String DEFAULT '',
	model_name String DEFAULT '',
	quota Int32 DEFAULT 0,
	prompt_tokens Int32 DEFAULT 0,
	completion_tokens Int32 DEFAULT 0,
	use_time Int32 DEFAULT 0,
	is_stream UInt8 DEFAULT 0,
	channel_id Int32 DEFAULT 0,
	token_id Int32 DEFAULT 0,
	`+"`group`"+` String DEFAULT '',
	ip String DEFAULT '',
	request_id String DEFAULT '',
	upstream_request_id String DEFAULT '',
	task_id String DEFAULT '',
	other String DEFAULT ''
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(toDateTime(created_at))
ORDER BY (created_at, request_id)%s`, clickHouseLogTTLClause(ttlDays))
}

func syncClickHouseLogTTL(ttlDays int) error {
	expression := clickHouseLogTTLExpression(ttlDays)
	if expression != "" {
		return LOG_DB.Exec("ALTER TABLE logs MODIFY TTL " + expression).Error
	}

	hasTTL, err := clickHouseLogTableHasTTL()
	if err != nil {
		return err
	}
	if !hasTTL {
		return nil
	}
	return LOG_DB.Exec("ALTER TABLE logs REMOVE TTL").Error
}

func clickHouseLogTableHasTTL() (bool, error) {
	var createTableSQL string
	if err := LOG_DB.Raw("SHOW CREATE TABLE logs").Scan(&createTableSQL).Error; err != nil {
		return false, err
	}
	return clickHouseCreateTableHasTTL(createTableSQL), nil
}

func clickHouseCreateTableHasTTL(createTableSQL string) bool {
	upperSQL := strings.ToUpper(createTableSQL)
	return strings.Contains(upperSQL, "\nTTL ") || strings.Contains(upperSQL, " TTL ")
}

type sqliteColumnDef struct {
	Name string
	DDL  string
}

func ensureSubscriptionPlanTableSQLite() error {
	if !common.UsingMainDatabase(common.DatabaseTypeSQLite) {
		return nil
	}
	tableName := "subscription_plans"
	if !DB.Migrator().HasTable(tableName) {
		createSQL := `CREATE TABLE ` + "`" + tableName + "`" + ` (
` + "`id`" + ` integer,
` + "`title`" + ` varchar(128) NOT NULL,
` + "`subtitle`" + ` varchar(255) DEFAULT '',
` + "`price_amount`" + ` decimal(10,6) NOT NULL,
` + "`currency`" + ` varchar(8) NOT NULL DEFAULT 'USD',
` + "`duration_unit`" + ` varchar(16) NOT NULL DEFAULT 'month',
` + "`duration_value`" + ` integer NOT NULL DEFAULT 1,
` + "`custom_seconds`" + ` bigint NOT NULL DEFAULT 0,
` + "`enabled`" + ` numeric DEFAULT 1,
` + "`sort_order`" + ` integer DEFAULT 0,
` + "`allow_balance_pay`" + ` numeric DEFAULT 1,
` + "`allow_wallet_overflow`" + ` numeric DEFAULT 1,
` + "`stripe_price_id`" + ` varchar(128) DEFAULT '',
` + "`creem_product_id`" + ` varchar(128) DEFAULT '',
` + "`waffo_pancake_product_id`" + ` varchar(128) DEFAULT '',
` + "`max_purchase_per_user`" + ` integer DEFAULT 0,
` + "`upgrade_group`" + ` varchar(64) DEFAULT '',
` + "`downgrade_group`" + ` varchar(64) DEFAULT '',
` + "`total_amount`" + ` bigint NOT NULL DEFAULT 0,
` + "`quota_reset_period`" + ` varchar(16) DEFAULT 'never',
` + "`quota_reset_custom_seconds`" + ` bigint DEFAULT 0,
` + "`created_at`" + ` bigint,
` + "`updated_at`" + ` bigint,
PRIMARY KEY (` + "`id`" + `)
)`
		return DB.Exec(createSQL).Error
	}
	var cols []struct {
		Name string `gorm:"column:name"`
	}
	if err := DB.Raw("PRAGMA table_info(`" + tableName + "`)").Scan(&cols).Error; err != nil {
		return err
	}
	existing := make(map[string]struct{}, len(cols))
	for _, c := range cols {
		existing[c.Name] = struct{}{}
	}
	required := []sqliteColumnDef{
		{Name: "title", DDL: "`title` varchar(128) NOT NULL"},
		{Name: "subtitle", DDL: "`subtitle` varchar(255) DEFAULT ''"},
		{Name: "price_amount", DDL: "`price_amount` decimal(10,6) NOT NULL"},
		{Name: "currency", DDL: "`currency` varchar(8) NOT NULL DEFAULT 'USD'"},
		{Name: "duration_unit", DDL: "`duration_unit` varchar(16) NOT NULL DEFAULT 'month'"},
		{Name: "duration_value", DDL: "`duration_value` integer NOT NULL DEFAULT 1"},
		{Name: "custom_seconds", DDL: "`custom_seconds` bigint NOT NULL DEFAULT 0"},
		{Name: "enabled", DDL: "`enabled` numeric DEFAULT 1"},
		{Name: "sort_order", DDL: "`sort_order` integer DEFAULT 0"},
		{Name: "allow_balance_pay", DDL: "`allow_balance_pay` numeric DEFAULT 1"},
		{Name: "allow_wallet_overflow", DDL: "`allow_wallet_overflow` numeric DEFAULT 1"},
		{Name: "stripe_price_id", DDL: "`stripe_price_id` varchar(128) DEFAULT ''"},
		{Name: "creem_product_id", DDL: "`creem_product_id` varchar(128) DEFAULT ''"},
		{Name: "waffo_pancake_product_id", DDL: "`waffo_pancake_product_id` varchar(128) DEFAULT ''"},
		{Name: "max_purchase_per_user", DDL: "`max_purchase_per_user` integer DEFAULT 0"},
		{Name: "upgrade_group", DDL: "`upgrade_group` varchar(64) DEFAULT ''"},
		{Name: "downgrade_group", DDL: "`downgrade_group` varchar(64) DEFAULT ''"},
		{Name: "total_amount", DDL: "`total_amount` bigint NOT NULL DEFAULT 0"},
		{Name: "quota_reset_period", DDL: "`quota_reset_period` varchar(16) DEFAULT 'never'"},
		{Name: "quota_reset_custom_seconds", DDL: "`quota_reset_custom_seconds` bigint DEFAULT 0"},
		{Name: "created_at", DDL: "`created_at` bigint"},
		{Name: "updated_at", DDL: "`updated_at` bigint"},
	}
	for _, col := range required {
		if _, ok := existing[col.Name]; ok {
			continue
		}
		if err := DB.Exec("ALTER TABLE `" + tableName + "` ADD COLUMN " + col.DDL).Error; err != nil {
			return err
		}
	}
	return nil
}

// migrateTokenModelLimitsToText migrates model_limits column from varchar(1024) to text
// This is safe to run multiple times - it checks the column type first
func migrateTokenModelLimitsToText() error {
	// SQLite uses type affinity, so TEXT and VARCHAR are effectively the same — no migration needed
	if common.UsingMainDatabase(common.DatabaseTypeSQLite) {
		return nil
	}

	tableName := "tokens"
	columnName := "model_limits"

	if !DB.Migrator().HasTable(tableName) {
		return nil
	}

	if !DB.Migrator().HasColumn(&Token{}, columnName) {
		return nil
	}

	var alterSQL string
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		var dataType string
		if err := DB.Raw(`SELECT data_type FROM information_schema.columns
			WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?`,
			tableName, columnName).Scan(&dataType).Error; err != nil {
			common.SysLog(fmt.Sprintf("Warning: failed to query metadata for %s.%s: %v", tableName, columnName, err))
		} else if dataType == "text" {
			return nil
		}
		alterSQL = fmt.Sprintf(`ALTER TABLE %s ALTER COLUMN %s TYPE text`, tableName, columnName)
	} else if common.UsingMainDatabase(common.DatabaseTypeMySQL) {
		var columnType string
		if err := DB.Raw(`SELECT COLUMN_TYPE FROM information_schema.columns
				WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
			tableName, columnName).Scan(&columnType).Error; err != nil {
			common.SysLog(fmt.Sprintf("Warning: failed to query metadata for %s.%s: %v", tableName, columnName, err))
		} else if strings.ToLower(columnType) == "text" {
			return nil
		}
		alterSQL = fmt.Sprintf("ALTER TABLE %s MODIFY COLUMN %s text", tableName, columnName)
	} else {
		return nil
	}

	if alterSQL != "" {
		if err := DB.Exec(alterSQL).Error; err != nil {
			return fmt.Errorf("failed to migrate %s.%s to text: %w", tableName, columnName, err)
		}
		common.SysLog(fmt.Sprintf("Successfully migrated %s.%s to text", tableName, columnName))
	}
	return nil
}

// migrateSubscriptionPlanPriceAmount migrates price_amount column from float/double to decimal(10,6)
// This is safe to run multiple times - it checks the column type first
func migrateSubscriptionPlanPriceAmount() {
	// SQLite doesn't support ALTER COLUMN, and its type affinity handles this automatically
	// Skip early to avoid GORM parsing the existing table DDL which may cause issues
	if common.UsingMainDatabase(common.DatabaseTypeSQLite) {
		return
	}

	tableName := "subscription_plans"
	columnName := "price_amount"

	// Check if table exists first
	if !DB.Migrator().HasTable(tableName) {
		return
	}

	// Check if column exists
	if !DB.Migrator().HasColumn(&SubscriptionPlan{}, columnName) {
		return
	}

	var alterSQL string
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		// PostgreSQL: Check if already decimal/numeric
		var dataType string
		if err := DB.Raw(`SELECT data_type FROM information_schema.columns
			WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?`,
			tableName, columnName).Scan(&dataType).Error; err != nil {
			common.SysLog(fmt.Sprintf("Warning: failed to query metadata for %s.%s: %v", tableName, columnName, err))
		} else if dataType == "numeric" {
			return // Already decimal/numeric
		}
		alterSQL = fmt.Sprintf(`ALTER TABLE %s ALTER COLUMN %s TYPE decimal(10,6) USING %s::decimal(10,6)`,
			tableName, columnName, columnName)
	} else if common.UsingMainDatabase(common.DatabaseTypeMySQL) {
		// MySQL: Check if already decimal
		var columnType string
		if err := DB.Raw(`SELECT COLUMN_TYPE FROM information_schema.columns
				WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
			tableName, columnName).Scan(&columnType).Error; err != nil {
			common.SysLog(fmt.Sprintf("Warning: failed to query metadata for %s.%s: %v", tableName, columnName, err))
		} else if strings.HasPrefix(strings.ToLower(columnType), "decimal") {
			return // Already decimal
		}
		alterSQL = fmt.Sprintf("ALTER TABLE %s MODIFY COLUMN %s decimal(10,6) NOT NULL DEFAULT 0",
			tableName, columnName)
	} else {
		return
	}

	if alterSQL != "" {
		if err := DB.Exec(alterSQL).Error; err != nil {
			common.SysLog(fmt.Sprintf("Warning: failed to migrate %s.%s to decimal: %v", tableName, columnName, err))
		} else {
			common.SysLog(fmt.Sprintf("Successfully migrated %s.%s to decimal(10,6)", tableName, columnName))
		}
	}
}

func closeDB(db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	err = sqlDB.Close()
	return err
}

func CloseDB() error {
	if LOG_DB != DB {
		err := closeDB(LOG_DB)
		if err != nil {
			return err
		}
	}
	return closeDB(DB)
}

// checkMySQLChineseSupport ensures the MySQL connection and current schema
// default charset/collation can store Chinese characters. It allows common
// Chinese-capable charsets (utf8mb4, utf8, gbk, big5, gb18030) and panics otherwise.
func checkMySQLChineseSupport(db *gorm.DB) error {
	// 仅检测：当前库默认字符集/排序规则 + 各表的排序规则（隐含字符集）

	// Read current schema defaults
	var schemaCharset, schemaCollation string
	err := db.Raw("SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE()").Row().Scan(&schemaCharset, &schemaCollation)
	if err != nil {
		return fmt.Errorf("读取当前库默认字符集/排序规则失败 / Failed to read schema default charset/collation: %v", err)
	}

	toLower := func(s string) string { return strings.ToLower(s) }
	// Allowed charsets that can store Chinese text
	allowedCharsets := map[string]string{
		"utf8mb4": "utf8mb4_",
		"utf8":    "utf8_",
		"gbk":     "gbk_",
		"big5":    "big5_",
		"gb18030": "gb18030_",
	}
	isChineseCapable := func(cs, cl string) bool {
		csLower := toLower(cs)
		clLower := toLower(cl)
		if prefix, ok := allowedCharsets[csLower]; ok {
			if clLower == "" {
				return true
			}
			return strings.HasPrefix(clLower, prefix)
		}
		// 如果仅提供了排序规则，尝试按排序规则前缀判断
		for _, prefix := range allowedCharsets {
			if strings.HasPrefix(clLower, prefix) {
				return true
			}
		}
		return false
	}

	// 1) 当前库默认值必须支持中文
	if !isChineseCapable(schemaCharset, schemaCollation) {
		return fmt.Errorf("当前库默认字符集/排序规则不支持中文：schema(%s/%s)。请将库设置为 utf8mb4/utf8/gbk/big5/gb18030 / Schema default charset/collation is not Chinese-capable: schema(%s/%s). Please set to utf8mb4/utf8/gbk/big5/gb18030",
			schemaCharset, schemaCollation, schemaCharset, schemaCollation)
	}

	// 2) 所有物理表的排序规则（隐含字符集）必须支持中文
	type tableInfo struct {
		Name      string
		Collation *string
	}
	var tables []tableInfo
	if err := db.Raw("SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'").Scan(&tables).Error; err != nil {
		return fmt.Errorf("读取表排序规则失败 / Failed to read table collations: %v", err)
	}

	var badTables []string
	for _, t := range tables {
		// NULL 或空表示继承库默认设置，已在上面校验库默认，视为通过
		if t.Collation == nil || *t.Collation == "" {
			continue
		}
		cl := *t.Collation
		// 仅凭排序规则判断是否中文可用
		ok := false
		lower := strings.ToLower(cl)
		for _, prefix := range allowedCharsets {
			if strings.HasPrefix(lower, prefix) {
				ok = true
				break
			}
		}
		if !ok {
			badTables = append(badTables, fmt.Sprintf("%s(%s)", t.Name, cl))
		}
	}

	if len(badTables) > 0 {
		// 限制输出数量以避免日志过长
		maxShow := 20
		shown := badTables
		if len(shown) > maxShow {
			shown = shown[:maxShow]
		}
		return fmt.Errorf(
			"存在不支持中文的表，请修复其排序规则/字符集。示例（最多展示 %d 项）：%v / Found tables not Chinese-capable. Please fix their collation/charset. Examples (showing up to %d): %v",
			maxShow, shown, maxShow, shown,
		)
	}
	return nil
}

var (
	lastPingTime time.Time
	pingMutex    sync.Mutex
)

func PingDB() error {
	pingMutex.Lock()
	defer pingMutex.Unlock()

	if time.Since(lastPingTime) < time.Second*10 {
		return nil
	}

	sqlDB, err := DB.DB()
	if err != nil {
		log.Printf("Error getting sql.DB from GORM: %v", err)
		return err
	}

	err = sqlDB.Ping()
	if err != nil {
		log.Printf("Error pinging DB: %v", err)
		return err
	}

	lastPingTime = time.Now()
	common.SysLog("Database pinged successfully")
	return nil
}
