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
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/pricingadmin"
	"github.com/QuantumNous/new-api/service/pricingruntime"
	"github.com/glebarez/sqlite"
	"github.com/joho/godotenv"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

const localBootstrapUserId = 1
const productionBootstrapConfirmation = "BOOTSTRAP_TOC_DEFAULT"

func main() {
	databasePath := flag.String("database", "", "local SQLite database file")
	currentEnv := flag.Bool(
		"current-env",
		false,
		"load .env and use its local database connection",
	)
	apply := flag.Bool("apply", false, "write generated local-test prices")
	verify := flag.Bool(
		"verify",
		false,
		"read and validate every enabled V2 route and representative quote",
	)
	production := flag.Bool(
		"production",
		false,
		"require production price evidence and distributed Redis circuit state",
	)
	allowRemoteReadOnly := flag.Bool(
		"allow-remote-read-only",
		false,
		"allow --verify to connect to a non-loopback database using a read-only session",
	)
	productionBootstrap := flag.Bool(
		"production-bootstrap",
		false,
		"create and publish the production TOC default price book from audited active prices",
	)
	flag.Parse()

	if *currentEnv == (strings.TrimSpace(*databasePath) != "") {
		exitWithError(errors.New("choose exactly one of --database or --current-env"))
	}
	if *apply && *verify {
		exitWithError(errors.New("choose exactly one of --apply or --verify"))
	}
	if *production && !*verify {
		exitWithError(errors.New("--production requires --verify"))
	}
	if *allowRemoteReadOnly && !*verify {
		exitWithError(errors.New("--allow-remote-read-only requires --verify"))
	}
	if *productionBootstrap {
		if !*currentEnv || !*apply || *verify {
			exitWithError(errors.New("--production-bootstrap requires --current-env --apply"))
		}
		if os.Getenv("PRICING_BOOTSTRAP_CONFIRM") != productionBootstrapConfirmation {
			exitWithError(fmt.Errorf(
				"production bootstrap requires PRICING_BOOTSTRAP_CONFIRM=%s",
				productionBootstrapConfirmation,
			))
		}
	}
	if *currentEnv {
		if !*apply && !*verify {
			fmt.Println("dry run: would bootstrap V2 prices using the local .env database")
			fmt.Println("re-run with --current-env --apply or --current-env --verify")
			return
		}
		if err := openCurrentEnvironmentDatabase(
			*verify,
			*allowRemoteReadOnly || *productionBootstrap,
		); err != nil {
			exitWithError(err)
		}
		if *verify {
			if *production {
				if err := common.InitRedisClient(); err != nil {
					exitWithError(fmt.Errorf("initialize Redis: %w", err))
				}
			}
			if err := verifyAndReport(*production); err != nil {
				exitWithError(err)
			}
			return
		}
		if *productionBootstrap {
			if err := common.InitRedisClient(); err != nil {
				exitWithError(fmt.Errorf("initialize Redis: %w", err))
			}
			if err := validateProductionPriceEvidence(); err != nil {
				exitWithError(err)
			}
			if err := ensureTocDefaultPriceBook(true); err != nil {
				exitWithError(err)
			}
			if err := verifyAndReport(true); err != nil {
				exitWithError(err)
			}
			return
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
	if !*apply && !*verify {
		fmt.Printf("dry run: would bootstrap V2 prices in %s\n", absolutePath)
		fmt.Println("re-run with --apply or --verify")
		return
	}
	if *verify {
		db, err := gorm.Open(sqlite.Open(absolutePath), &gorm.Config{})
		if err != nil {
			exitWithError(err)
		}
		model.DB = db
		model.InitOptionMap()
		if *production {
			exitWithError(errors.New(
				"--production requires --current-env so Redis and database settings are explicit",
			))
		}
		if err := verifyAndReport(false); err != nil {
			exitWithError(err)
		}
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
	model.InitOptionMap()
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
	if err := ensureTocDefaultPriceBook(false); err != nil {
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
		"ready: %d/%d channel models have structured purchase pricing, %d model/group scopes active\n",
		readiness.PricedChannelModels,
		readiness.TotalChannelModels,
		readiness.CompleteGroupModelScopes,
	)
	return nil
}

func ensureTocDefaultPriceBook(production bool) error {
	var currentDefault model.SalesPriceBookDefault
	err := model.DB.First(&currentDefault, "default_key = ?", "toc_default").Error
	if err == nil {
		readiness, readinessErr := pricingruntime.GetRuntimeReadiness()
		if readinessErr != nil {
			return readinessErr
		}
		if !readiness.TocDefaultReady {
			return fmt.Errorf("existing TOC default sales price book is not ready: %s", readiness.TocDefaultError)
		}
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	var channelModelIds []int
	if err := model.DB.Model(&model.ChannelModel{}).
		Joins("JOIN channels ON channels.id = channel_models.channel_id").
		Joins("JOIN models ON models.id = channel_models.model_id").
		Joins(
			"JOIN abilities ON abilities.channel_id = channel_models.channel_id AND abilities.model = models.model_name",
		).
		Where(
			"channel_models.status <> ? AND channels.status = ? AND abilities.enabled = ? AND models.status = ? AND models.deleted_at IS NULL AND models.routing_target_model_id IS NULL",
			0,
			common.ChannelStatusEnabled,
			true,
			1,
		).
		Distinct("channel_models.id").
		Order("channel_models.id ASC").
		Pluck("channel_models.id", &channelModelIds).Error; err != nil {
		return err
	}
	if len(channelModelIds) == 0 {
		return errors.New("cannot create a local TOC default without enabled channel models")
	}

	bookCode := "local-toc-default"
	bookName := "Local TOC Default"
	bookRemark := "local acceptance price book generated from restored purchase prices"
	versionRemark := "local acceptance default policy"
	idempotencyKey := "local-toc-default-v1"
	if production {
		bookCode = "toc-default"
		bookName = "TOC Default"
		bookRemark = "production TOC price book generated from audited active purchase prices"
		versionRemark = "production default policy migrated with the pricing V2 rollout"
		idempotencyKey = "production-toc-default-v1"
	}

	var book model.SalesPriceBook
	err = model.DB.First(&book, "code = ?", bookCode).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		book = model.SalesPriceBook{
			Code: bookCode, Name: bookName, Audience: "toc", Currency: "USD", Remark: bookRemark,
		}
		if err := pricingadmin.CreateSalesPriceBook(&book, localBootstrapUserId); err != nil {
			return fmt.Errorf("create local TOC price book: %w", err)
		}
	} else if err != nil {
		return err
	} else if book.Status == model.SalesPriceBookStatusEnabled && book.CurrentVersionId != nil {
		return pricingadmin.SetDefaultSalesPriceBook("toc_default", book.Id, localBootstrapUserId)
	} else if book.Status != model.SalesPriceBookStatusDraft || book.CurrentVersionId != nil ||
		book.Audience != "toc" || book.Currency != "USD" {
		return errors.New("existing local TOC price book cannot be resumed")
	}
	var version model.SalesPriceBookVersion
	err = model.DB.First(
		&version,
		"price_book_id = ? AND status = ?",
		book.Id,
		model.SalesPriceBookVersionStatusDraft,
	).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		version = model.SalesPriceBookVersion{
			PriceBookId: book.Id, CostBasisStrategy: "max_eligible_cost",
			PaymentFeeRate: "0.04", DistributionFeeRate: "0.05", OperationsLaborRate: "0.02",
			TotalVariableCostRate: "0.11", EffectiveTaxRate: "0.165", TargetNetMargin: "0.03",
			MinimumMarginRate: "0.02", Remark: versionRemark,
		}
		if err := pricingadmin.CreateSalesPriceBookVersion(&version, localBootstrapUserId); err != nil {
			return fmt.Errorf("create local TOC price book version: %w", err)
		}
	} else if err != nil {
		return err
	}
	generation, err := pricingadmin.GenerateSalesPriceBookItems(
		version.Id,
		pricingadmin.SalesPriceBookGenerationInput{
			ChannelModelIds: channelModelIds,
			IdempotencyKey:  idempotencyKey,
		},
		localBootstrapUserId,
	)
	if err != nil {
		return fmt.Errorf("generate local TOC price book: %w", err)
	}
	if generation.Batch.ReviewCount > 0 {
		return fmt.Errorf(
			"local TOC price book has %d item(s) requiring pricing review",
			generation.Batch.ReviewCount,
		)
	}
	if err := pricingadmin.PublishSalesPriceBookVersion(version.Id, localBootstrapUserId); err != nil {
		return fmt.Errorf("publish local TOC price book: %w", err)
	}
	if err := pricingadmin.SetDefaultSalesPriceBook("toc_default", book.Id, localBootstrapUserId); err != nil {
		return fmt.Errorf("set local TOC default price book: %w", err)
	}
	return nil
}

func verifyAndReport(production bool) error {
	if err := pricingruntime.RefreshCatalog(); err != nil {
		return fmt.Errorf("refresh V2 price catalog: %w", err)
	}
	var abilities []model.Ability
	if err := model.DB.Model(&model.Ability{}).
		Select("abilities.*").
		Joins("JOIN channels ON channels.id = abilities.channel_id").
		Where(
			"abilities.enabled = ? AND channels.status = ?",
			true,
			common.ChannelStatusEnabled,
		).
		Find(&abilities).Error; err != nil {
		return err
	}
	type routeScope struct {
		group string
		model string
	}
	scopes := make([]routeScope, 0)
	seen := make(map[routeScope]struct{})
	for _, ability := range abilities {
		scope := routeScope{group: ability.Group, model: ability.Model}
		if _, exists := seen[scope]; exists {
			continue
		}
		seen[scope] = struct{}{}
		scopes = append(scopes, scope)
	}
	sort.Slice(scopes, func(left int, right int) bool {
		if scopes[left].group != scopes[right].group {
			return scopes[left].group < scopes[right].group
		}
		return scopes[left].model < scopes[right].model
	})
	verifiedCandidates := 0
	for _, scope := range scopes {
		candidates := pricingruntime.GetCandidateBundles(scope.group, scope.model)
		if len(candidates) == 0 {
			return fmt.Errorf("%s/%s has no complete purchase-price route", scope.group, scope.model)
		}
		verifiedCandidates += len(candidates)
	}
	readiness, err := pricingruntime.GetRuntimeReadiness()
	if err != nil {
		return err
	}
	if len(scopes) != readiness.CompleteGroupModelScopes {
		return fmt.Errorf(
			"catalog has %d complete scopes, but %d enabled scopes were verified",
			readiness.CompleteGroupModelScopes,
			len(scopes),
		)
	}
	if readiness.PricedChannelModels != readiness.TotalChannelModels {
		return fmt.Errorf(
			"%d of %d channel models lack structured purchase pricing",
			readiness.TotalChannelModels-readiness.PricedChannelModels,
			readiness.TotalChannelModels,
		)
	}
	if !readiness.TocDefaultReady {
		return fmt.Errorf("TOC default sales price book is not ready: %s", readiness.TocDefaultError)
	}
	if !readiness.LiveTrafficEnabled {
		return errors.New("structured pricing is not ready for live traffic")
	}
	if production {
		if !readiness.DistributedCircuitState {
			return errors.New(
				"production requires a reachable REDIS_CONN_STRING for distributed circuit state",
			)
		}
		if err := validateProductionPriceEvidence(); err != nil {
			return err
		}
	}
	fmt.Printf(
		"verified: %d model/group scopes, %d eligible purchase-price candidates, %d/%d channel models use structured pricing\n",
		len(scopes),
		verifiedCandidates,
		readiness.PricedChannelModels,
		readiness.TotalChannelModels,
	)
	return nil
}

func validateProductionPriceEvidence() error {
	var channelModels []model.ChannelModel
	if err := model.DB.Model(&model.ChannelModel{}).
		Select("DISTINCT channel_models.*").
		Joins("JOIN channels ON channels.id = channel_models.channel_id").
		Joins("JOIN models ON models.id = channel_models.model_id").
		Joins(
			"JOIN abilities ON abilities.channel_id = channel_models.channel_id AND abilities.model = models.model_name",
		).
		Where(
			"channel_models.status <> ? AND channels.status = ? AND abilities.enabled = ?",
			0,
			common.ChannelStatusEnabled,
			true,
		).
		Order("channel_models.id ASC").
		Find(&channelModels).Error; err != nil {
		return err
	}
	for _, channelModel := range channelModels {
		bundle, err := pricingruntime.LoadActivePriceBundle(channelModel.Id)
		if err != nil {
			return err
		}
		requiresOfficial := bundle.Purchase.PricingMode == "official_ratio" ||
			bundle.Purchase.PricingMode == "component_ratio"
		if requiresOfficial && bundle.Official == nil {
			return fmt.Errorf(
				"channel model %d has no frozen official price evidence",
				channelModel.Id,
			)
		}
		if bundle.Official != nil {
			source := strings.ToLower(strings.TrimSpace(bundle.Official.Source))
			if source == "" || source == "local_bootstrap" || source == "legacy_import" {
				return fmt.Errorf(
					"channel model %d uses non-production official source %q",
					channelModel.Id,
					bundle.Official.Source,
				)
			}
			if strings.TrimSpace(bundle.Official.SourceVersion) == "" ||
				bundle.Official.SourceUpdatedAt <= 0 {
				return fmt.Errorf(
					"channel model %d official price lacks source version or source timestamp",
					channelModel.Id,
				)
			}
		}
		quoteReference := strings.ToLower(strings.TrimSpace(bundle.Purchase.QuoteReference))
		contractReference := strings.TrimSpace(bundle.Purchase.ContractReference)
		if quoteReference == "" && contractReference == "" {
			return fmt.Errorf(
				"channel model %d purchase price lacks quote or contract evidence",
				channelModel.Id,
			)
		}
		if strings.Contains(quoteReference, "local-test") ||
			strings.Contains(strings.ToLower(bundle.Purchase.Remark), "local v2") {
			return fmt.Errorf(
				"channel model %d still uses local-test purchase evidence",
				channelModel.Id,
			)
		}
	}
	return nil
}

func openCurrentEnvironmentDatabase(readOnly bool, allowRemoteReadOnly bool) error {
	if err := godotenv.Load(".env"); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("load .env: %w", err)
	}
	dsn := strings.TrimSpace(os.Getenv("SQL_DSN"))
	if dsn == "" || strings.HasPrefix(dsn, "local") {
		return errors.New(
			"--current-env requires an explicit PostgreSQL or MySQL SQL_DSN",
		)
	}
	isPostgreSQL := strings.HasPrefix(dsn, "postgres://") ||
		strings.HasPrefix(dsn, "postgresql://")
	if isPostgreSQL {
		parsed, err := url.Parse(dsn)
		if err != nil {
			return fmt.Errorf("parse SQL_DSN: %w", err)
		}
		if !isLoopbackHost(parsed.Hostname()) && !allowRemoteReadOnly {
			return fmt.Errorf(
				"refusing non-local PostgreSQL host %q without --allow-remote-read-only",
				parsed.Hostname(),
			)
		}
	} else {
		host := mysqlDSNHost(dsn)
		if !isLoopbackHost(host) && !allowRemoteReadOnly {
			return fmt.Errorf(
				"refusing non-local MySQL host %q without --allow-remote-read-only",
				host,
			)
		}
	}
	if readOnly {
		var dialector gorm.Dialector
		if isPostgreSQL {
			parsed, err := url.Parse(dsn)
			if err != nil {
				return err
			}
			query := parsed.Query()
			existingOptions := strings.TrimSpace(query.Get("options"))
			if existingOptions != "" {
				existingOptions += " "
			}
			query.Set("options", existingOptions+"-c default_transaction_read_only=on")
			parsed.RawQuery = query.Encode()
			dialector = postgres.Open(parsed.String())
		} else {
			if !strings.Contains(dsn, "parseTime") {
				separator := "?"
				if strings.Contains(dsn, "?") {
					separator = "&"
				}
				dsn += separator + "parseTime=true"
			}
			dialector = mysql.Open(dsn)
		}
		db, err := gorm.Open(dialector, &gorm.Config{})
		if err != nil {
			return fmt.Errorf("open read-only database: %w", err)
		}
		if !isPostgreSQL {
			if err := db.Exec("SET SESSION TRANSACTION READ ONLY").Error; err != nil {
				return fmt.Errorf("enable MySQL read-only session: %w", err)
			}
		}
		model.DB = db
		model.InitOptionMap()
		return nil
	}
	if err := model.InitDB(); err != nil {
		return fmt.Errorf("initialize current database: %w", err)
	}
	model.InitOptionMap()
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
		"ContentHash", "SyncBatchId", "SourceUpdatedAt", "ChangeType", "Region",
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
		fmt.Printf("%s: %d channel model(s) priced\n", logicalModel.ModelName, len(channelModels))
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
	if _, err := pricingadmin.PublishOfficialPriceVersionWithAutomation(version.Id, localBootstrapUserId); err != nil {
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
	var activePurchase model.ChannelModelPurchasePriceVersion
	err := model.DB.
		Where(
			"channel_model_id = ? AND status = ?",
			channelModel.Id,
			model.PricingVersionStatusActive,
		).
		First(&activePurchase).Error
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
	_, err = pricingadmin.PublishPurchasePriceVersionWithAutomation(purchase.Id, localBootstrapUserId)
	return err
}

func exitWithError(err error) {
	fmt.Fprintln(os.Stderr, "error:", err)
	os.Exit(1)
}
