package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/pricingadmin"
	"github.com/QuantumNous/new-api/service/pricingruntime"
	"github.com/glebarez/sqlite"
	"github.com/joho/godotenv"
	"gorm.io/gorm"
)

const localBootstrapUserId = 1

func main() {
	databasePath := flag.String("database", "", "local SQLite database file")
	currentEnv := flag.Bool(
		"current-env",
		false,
		"load .env and use its local database connection",
	)
	apply := flag.Bool("apply", false, "write generated local-test prices")
	flag.Parse()

	if *currentEnv == (strings.TrimSpace(*databasePath) != "") {
		exitWithError(errors.New("choose exactly one of --database or --current-env"))
	}
	if *currentEnv {
		if !*apply {
			fmt.Println("dry run: would bootstrap V2 prices using the local .env database")
			fmt.Println("re-run with --current-env --apply after confirming the target")
			return
		}
		if err := openCurrentEnvironmentDatabase(); err != nil {
			exitWithError(err)
		}
		if err := bootstrapAndReport(""); err != nil {
			exitWithError(err)
		}
		return
	}
	absolutePath, err := filepath.Abs(*databasePath)
	if err != nil {
		exitWithError(err)
	}
	if !*apply {
		fmt.Printf("dry run: would bootstrap V2 prices in %s\n", absolutePath)
		fmt.Println("re-run with --apply after confirming this is a local-test database")
		return
	}
	backupPath, err := backupDatabase(absolutePath)
	if err != nil {
		exitWithError(fmt.Errorf("backup database: %w", err))
	}
	fmt.Printf("backup: %s\n", backupPath)

	db, err := gorm.Open(sqlite.Open(absolutePath), &gorm.Config{})
	if err != nil {
		exitWithError(err)
	}
	model.DB = db
	if err := migratePricingTables(db); err != nil {
		exitWithError(fmt.Errorf("migrate pricing tables: %w", err))
	}
	if err := bootstrapAndReport(backupPath); err != nil {
		exitWithError(err)
	}
}

func bootstrapAndReport(backupPath string) error {
	if err := bootstrapPrices(); err != nil {
		if backupPath != "" {
			return fmt.Errorf("%w; restore from %s if needed", err, backupPath)
		}
		return err
	}
	readiness, err := pricingruntime.GetRuntimeReadiness()
	if err != nil {
		return err
	}
	fmt.Printf(
		"ready: %d/%d channel models use V2, %d model/group scopes active\n",
		readiness.V2ChannelModels,
		readiness.TotalChannelModels,
		readiness.CompleteGroupModelScopes,
	)
	return nil
}

func openCurrentEnvironmentDatabase() error {
	if err := godotenv.Load(".env"); err != nil {
		return fmt.Errorf("load .env: %w", err)
	}
	dsn := strings.TrimSpace(os.Getenv("SQL_DSN"))
	if dsn == "" || strings.HasPrefix(dsn, "local") {
		return errors.New(
			"--current-env requires an explicit local PostgreSQL or MySQL SQL_DSN",
		)
	}
	if strings.HasPrefix(dsn, "postgres://") ||
		strings.HasPrefix(dsn, "postgresql://") {
		parsed, err := url.Parse(dsn)
		if err != nil {
			return fmt.Errorf("parse SQL_DSN: %w", err)
		}
		if !isLoopbackHost(parsed.Hostname()) {
			return fmt.Errorf(
				"refusing non-local PostgreSQL host %q",
				parsed.Hostname(),
			)
		}
	} else {
		host := mysqlDSNHost(dsn)
		if !isLoopbackHost(host) {
			return fmt.Errorf("refusing non-local MySQL host %q", host)
		}
	}
	if err := model.InitDB(); err != nil {
		return fmt.Errorf("initialize current database: %w", err)
	}
	return nil
}

func mysqlDSNHost(dsn string) string {
	start := strings.Index(dsn, "@tcp(")
	if start < 0 {
		return ""
	}
	start += len("@tcp(")
	end := strings.Index(dsn[start:], ")")
	if end < 0 {
		return ""
	}
	host, _, err := net.SplitHostPort(dsn[start : start+end])
	if err == nil {
		return host
	}
	return dsn[start : start+end]
}

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func backupDatabase(sourcePath string) (string, error) {
	source, err := os.Open(sourcePath)
	if err != nil {
		return "", err
	}
	defer source.Close()
	backupPath := fmt.Sprintf(
		"%s.before-v2-local-bootstrap-%s",
		sourcePath,
		time.Now().Format("20060102-150405"),
	)
	target, err := os.OpenFile(backupPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(target, source); err != nil {
		_ = target.Close()
		return "", err
	}
	if err := target.Sync(); err != nil {
		_ = target.Close()
		return "", err
	}
	return backupPath, target.Close()
}

func migratePricingTables(db *gorm.DB) error {
	if err := db.AutoMigrate(&model.ModelOfficialPrice{}); err != nil {
		return err
	}
	official := &model.OfficialModelPriceVersion{}
	for _, field := range []string{
		"ContentHash", "SyncBatchId", "SourceUpdatedAt", "ChangeType",
	} {
		if !db.Migrator().HasColumn(official, field) {
			if err := db.Migrator().AddColumn(official, field); err != nil {
				return fmt.Errorf("add official price column %s: %w", field, err)
			}
		}
	}
	return nil
}

func bootstrapPrices() error {
	var logicalModels []model.Model
	if err := model.DB.
		Joins("JOIN channel_models ON channel_models.model_id = models.id").
		Group("models.id").
		Order("models.model_name ASC").
		Find(&logicalModels).Error; err != nil {
		return err
	}
	for _, logicalModel := range logicalModels {
		official, err := ensureV2OfficialPrice(logicalModel.Id)
		if err != nil {
			return fmt.Errorf("model %s official price: %w", logicalModel.ModelName, err)
		}
		var channelModels []model.ChannelModel
		if err := model.DB.
			Where("model_id = ? AND status <> 0", logicalModel.Id).
			Order("id ASC").
			Find(&channelModels).Error; err != nil {
			return err
		}
		for _, channelModel := range channelModels {
			if err := ensureChannelPriceChain(channelModel, official); err != nil {
				return fmt.Errorf(
					"model %s channel model %d: %w",
					logicalModel.ModelName,
					channelModel.Id,
					err,
				)
			}
		}
		updated, err := pricingruntime.SetModelRuntimeMode(
			logicalModel.ModelName,
			pricingruntime.RuntimeModeV2,
		)
		if err != nil {
			return fmt.Errorf("enable V2: %w", err)
		}
		fmt.Printf("%s: %d channel model(s) enabled\n", logicalModel.ModelName, updated)
	}
	return pricingruntime.RefreshCatalog()
}

func ensureV2OfficialPrice(modelId int) (model.OfficialModelPriceVersion, error) {
	var active model.OfficialModelPriceVersion
	err := model.DB.
		Where(
			"model_id = ? AND status = ? AND expression_schema_version = ?",
			modelId,
			model.PricingVersionStatusActive,
			"v2",
		).
		Order("version DESC").
		First(&active).Error
	if err == nil {
		return active, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return active, err
	}
	var source model.OfficialModelPriceVersion
	if err := model.DB.
		Where("model_id = ?", modelId).
		Order("version DESC").
		First(&source).Error; err != nil {
		return source, errors.New("no official price draft is available")
	}
	expression, err := convertTokenExpressionToV2(source.BillingExpr)
	if err != nil {
		return source, err
	}
	components := source.PriceComponents
	if source.PriceStructure != "flat" {
		components = `{"unit_price":"1"}`
	}
	version := model.OfficialModelPriceVersion{
		ModelId:                 modelId,
		BillingMode:             source.BillingMode,
		PriceStructure:          source.PriceStructure,
		PriceComponents:         components,
		BillingExpr:             expression,
		ExpressionSource:        "generated",
		ExpressionSchemaVersion: "v2",
		Currency:                "USD",
		Source:                  "local_bootstrap",
		Remark:                  "Local V2 test price converted from the latest official draft",
	}
	if err := pricingadmin.CreateOfficialPriceVersion(&version, localBootstrapUserId); err != nil {
		return version, err
	}
	if err := pricingadmin.PublishOfficialPriceVersion(version.Id); err != nil {
		return version, err
	}
	return version, model.DB.First(&version, version.Id).Error
}

func convertTokenExpressionToV2(expression string) (string, error) {
	body := strings.TrimSpace(expression)
	switch {
	case strings.HasPrefix(body, "v2:"):
		return body, nil
	case strings.HasPrefix(body, "v1:"):
		body = strings.TrimSpace(strings.TrimPrefix(body, "v1:"))
	}
	if body == "" {
		return "", errors.New("official billing expression is empty")
	}
	return "v2:(" + body + ") / 1000000", nil
}

func ensureChannelPriceChain(
	channelModel model.ChannelModel,
	official model.OfficialModelPriceVersion,
) error {
	var activeRetail model.ChannelModelRetailPriceVersion
	err := model.DB.
		Where(
			"channel_model_id = ? AND status = ?",
			channelModel.Id,
			model.PricingVersionStatusActive,
		).
		First(&activeRetail).Error
	if err == nil {
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	officialId := official.Id
	var purchase model.ChannelModelPurchasePriceVersion
	if official.PriceStructure == "flat" {
		purchase, err = pricingadmin.CreatePurchaseDraft(pricingadmin.PurchaseDraftInput{
			ChannelModelId:         channelModel.Id,
			OfficialPriceVersionId: &officialId,
			PricingMode:            "official_ratio",
			PurchaseDiscount:       "0.6",
			Currency:               "USD",
			QuoteReference:         "local-test-60-percent-of-official",
			Remark:                 "Generated for local V2 testing",
		}, localBootstrapUserId)
		if err != nil {
			return err
		}
	} else {
		body := strings.TrimSpace(strings.TrimPrefix(official.BillingExpr, "v2:"))
		purchase = model.ChannelModelPurchasePriceVersion{
			ChannelModelId:          channelModel.Id,
			OfficialPriceVersionId:  &officialId,
			BillingMode:             official.BillingMode,
			PricingMode:             "custom_expr",
			PriceStructure:          official.PriceStructure,
			PriceComponents:         `{"unit_price":"0.6"}`,
			PurchaseDiscount:        "0.6",
			PriceUnit:               "expression",
			PurchaseBillingExpr:     "v2:(" + body + ") * 0.6",
			ExpressionSource:        "generated",
			ExpressionSchemaVersion: "v2",
			Currency:                "USD",
			QuoteReference:          "local-test-60-percent-of-official",
			Remark:                  "Generated for local V2 testing",
		}
		if err := pricingadmin.CreatePurchasePriceVersion(
			&purchase,
			localBootstrapUserId,
		); err != nil {
			return err
		}
	}
	retail, err := pricingadmin.CreateRetailDraft(pricingadmin.RetailDraftInput{
		ChannelModelId:         channelModel.Id,
		PurchasePriceVersionId: purchase.Id,
		TotalVariableCostRate:  "0.11",
		EffectiveTaxRate:       "0.16",
		TargetNetMargin:        "0.10",
		MinimumMarginRate:      "0.05",
		Remark:                 "Generated for local V2 testing",
	}, localBootstrapUserId)
	if err != nil {
		return err
	}
	return pricingadmin.PublishRetailPriceVersion(retail.Id)
}

func exitWithError(err error) {
	fmt.Fprintln(os.Stderr, "error:", err)
	os.Exit(1)
}
