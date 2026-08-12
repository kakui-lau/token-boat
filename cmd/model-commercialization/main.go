package main

import (
	"bytes"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/pricingadmin"
	"github.com/QuantumNous/new-api/service/pricingruntime"
	"github.com/shopspring/decimal"
	"gopkg.in/yaml.v3"
	"gorm.io/gorm"
)

type config struct {
	ChannelID          int      `yaml:"channel_id"`
	StagingGroup       string   `yaml:"staging_group"`
	LogicalModel       string   `yaml:"logical_model"`
	UpstreamModel      string   `yaml:"upstream_model"`
	Vendor             string   `yaml:"vendor"`
	Icon               string   `yaml:"icon"`
	Description        string   `yaml:"description"`
	Tags               []string `yaml:"tags"`
	Endpoints          []string `yaml:"endpoints"`
	OfficialSourceURL  string   `yaml:"official_source_url"`
	OfficialInput      string   `yaml:"official_input_per_1m"`
	OfficialOutput     string   `yaml:"official_output_per_1m"`
	OfficialCacheRead  string   `yaml:"official_cache_read_per_1m"`
	OfficialCacheWrite string   `yaml:"official_cache_write_per_1m"`
	PurchaseDiscount   string   `yaml:"purchase_discount"`
	VariableCostRate   string   `yaml:"variable_cost_rate"`
	TaxRate            string   `yaml:"tax_rate"`
	TargetMargin       string   `yaml:"target_margin"`
	MinimumMargin      string   `yaml:"minimum_margin"`
}

type plan struct {
	PurchaseInput      string
	PurchaseOutput     string
	PurchaseCacheRead  string
	PurchaseCacheWrite string
	RetailInput        string
	RetailOutput       string
	RetailCacheRead    string
	RetailCacheWrite   string
	SellingFactor      string
}

func main() {
	if len(os.Args) < 2 {
		exitWithError(errors.New("usage: model-commercialization <plan|inspect|apply|verify> --config FILE"))
	}
	command := os.Args[1]
	flags := flag.NewFlagSet(command, flag.ContinueOnError)
	configPath := flags.String("config", "", "model commercialization YAML file")
	yes := flags.Bool("yes", false, "confirm database changes")
	probe := flags.Bool("probe", false, "send one billable upstream request during verify")
	channelID := flags.Int("channel-id", 0, "channel ID for channel-wide pricing")
	stagingGroup := flags.String("staging-group", "", "isolated internal-test group")
	openAIDiscount := flags.String("openai-discount", "", "OpenAI purchase discount")
	googleDiscount := flags.String("google-discount", "", "Google purchase discount")
	zAIDiscount := flags.String("z-ai-discount", "", "Z-AI purchase discount")
	anthropicDiscount := flags.String("anthropic-discount", "", "Anthropic purchase discount")
	moonshotDiscount := flags.String("moonshotai-discount", "", "Moonshot purchase discount")
	variableCostRate := flags.String("variable-cost-rate", "", "retail variable cost rate")
	taxRate := flags.String("tax-rate", "", "retail effective tax rate")
	targetMargin := flags.String("target-margin", "", "retail target and minimum margin")
	if err := flags.Parse(os.Args[2:]); err != nil {
		exitWithError(err)
	}
	if command == "price-channel" {
		if !*yes {
			exitWithError(errors.New("price-channel requires --yes"))
		}
		params := channelPricingParams{
			ChannelID: *channelID, StagingGroup: strings.TrimSpace(*stagingGroup),
			Discounts: map[string]string{
				"openai": *openAIDiscount, "google": *googleDiscount, "z-ai": *zAIDiscount,
				"anthropic": *anthropicDiscount, "moonshotai": *moonshotDiscount,
			},
			VariableCostRate: *variableCostRate, TaxRate: *taxRate, TargetMargin: *targetMargin,
		}
		if err := validateChannelPricingParams(params); err != nil {
			exitWithError(err)
		}
		if err := openDatabase(); err != nil {
			exitWithError(err)
		}
		exitWithError(priceChannel(params))
	}
	if strings.TrimSpace(*configPath) == "" {
		exitWithError(errors.New("--config is required"))
	}
	cfg, err := loadConfig(*configPath)
	if err != nil {
		exitWithError(err)
	}
	computed, err := buildPlan(cfg)
	if err != nil {
		exitWithError(err)
	}

	switch command {
	case "plan":
		printPlan(cfg, computed)
		return
	case "inspect", "apply", "verify":
		if err := openDatabase(); err != nil {
			exitWithError(err)
		}
	default:
		exitWithError(fmt.Errorf("unsupported command %q", command))
	}

	switch command {
	case "inspect":
		exitWithError(inspect(cfg))
	case "apply":
		if !*yes {
			exitWithError(errors.New("apply requires --yes"))
		}
		exitWithError(apply(cfg))
	case "verify":
		exitWithError(verify(cfg, computed, *probe))
	}
}

type channelPricingParams struct {
	ChannelID        int
	StagingGroup     string
	Discounts        map[string]string
	VariableCostRate string
	TaxRate          string
	TargetMargin     string
}

type channelPricingTarget struct {
	ChannelModel model.ChannelModel
	ModelName    string
	Official     model.OfficialModelPriceVersion
	Discount     string
	AlreadyReady bool
}

func validateChannelPricingParams(params channelPricingParams) error {
	if params.ChannelID <= 0 {
		return errors.New("channel-id is required")
	}
	if params.StagingGroup == "" {
		return errors.New("staging-group is required")
	}
	for family, value := range params.Discounts {
		if strings.TrimSpace(value) == "" {
			return fmt.Errorf("%s discount is required", family)
		}
		if err := validateUnitRate(family+" discount", value, true); err != nil {
			return err
		}
	}
	for name, value := range map[string]string{
		"variable-cost-rate": params.VariableCostRate,
		"tax-rate":           params.TaxRate,
		"target-margin":      params.TargetMargin,
	} {
		if err := validateUnitRate(name, value, false); err != nil {
			return err
		}
	}
	return nil
}

func validateUnitRate(name string, value string, positive bool) error {
	rate, err := decimal.NewFromString(strings.TrimSpace(value))
	if err != nil || rate.IsNegative() || rate.GreaterThan(decimal.NewFromInt(1)) ||
		(positive && rate.IsZero()) {
		return fmt.Errorf("%s must be a decimal %s 0 and 1", name, map[bool]string{true: "above", false: "between"}[positive])
	}
	return nil
}

func priceChannel(params channelPricingParams) error {
	var channel model.Channel
	if err := model.DB.First(&channel, params.ChannelID).Error; err != nil {
		return err
	}
	if err := validateStagingChannel(channel, params.StagingGroup); err != nil {
		return err
	}

	var rows []struct {
		model.ChannelModel
		ModelName string `gorm:"column:model_name"`
	}
	if err := model.DB.Table("channel_models").
		Select("channel_models.*, models.model_name").
		Joins("JOIN models ON models.id = channel_models.model_id").
		Where("channel_models.channel_id = ? AND channel_models.status = ?", params.ChannelID, 1).
		Order("models.model_name ASC").
		Scan(&rows).Error; err != nil {
		return err
	}
	if len(rows) == 0 {
		return errors.New("channel has no enabled channel models")
	}

	targets := make([]channelPricingTarget, 0, len(rows))
	for _, row := range rows {
		family := strings.SplitN(row.ModelName, "/", 2)[0]
		discount, exists := params.Discounts[family]
		if !exists {
			return fmt.Errorf("model %s has no explicit family discount", row.ModelName)
		}
		var pointer model.ModelOfficialPrice
		if err := model.DB.First(&pointer, "model_id = ?", row.ModelId).Error; err != nil {
			return fmt.Errorf("model %s has no current official price: %w", row.ModelName, err)
		}
		var official model.OfficialModelPriceVersion
		if err := model.DB.First(&official, pointer.CurrentRevisionId).Error; err != nil {
			return fmt.Errorf("model %s official price cannot be loaded: %w", row.ModelName, err)
		}
		if official.Status != model.PricingVersionStatusActive || official.Source != "vendor-official" ||
			!strings.Contains(official.Remark, "https://") {
			return fmt.Errorf("model %s lacks an active authoritative official-price source", row.ModelName)
		}

		target := channelPricingTarget{
			ChannelModel: row.ChannelModel, ModelName: row.ModelName, Official: official, Discount: discount,
		}
		bundle, err := pricingadmin.GetActivePriceBundle(row.Id)
		if err == nil {
			if bundle.Purchase.PurchaseDiscount != discount ||
				bundle.Retail.TotalVariableCostRate != decimalString(params.VariableCostRate) ||
				bundle.Retail.EffectiveTaxRate != decimalString(params.TaxRate) ||
				bundle.Retail.TargetNetMargin != decimalString(params.TargetMargin) ||
				bundle.Retail.MinimumMarginRate != decimalString(params.TargetMargin) {
				return fmt.Errorf("model %s already has a different active price chain", row.ModelName)
			}
			target.AlreadyReady = true
		}
		targets = append(targets, target)
	}

	for index := range targets {
		target := &targets[index]
		if target.AlreadyReady {
			continue
		}
		officialID := target.Official.Id
		purchase, err := pricingadmin.CreatePurchaseDraft(pricingadmin.PurchaseDraftInput{
			ChannelModelId: target.ChannelModel.Id, OfficialPriceVersionId: &officialID,
			PricingMode: "official_ratio", Currency: target.Official.Currency,
			PurchaseDiscount: target.Discount,
			QuoteReference:   fmt.Sprintf("channel %d %s of official", params.ChannelID, target.Discount),
			Remark:           "Anispark tenant API internal-test procurement price",
		}, 1)
		if err != nil {
			return fmt.Errorf("create %s purchase price: %w", target.ModelName, err)
		}
		retail, err := pricingadmin.CreateRetailDraft(pricingadmin.RetailDraftInput{
			ChannelModelId: target.ChannelModel.Id, PurchasePriceVersionId: purchase.Id,
			TotalVariableCostRate: params.VariableCostRate, EffectiveTaxRate: params.TaxRate,
			TargetNetMargin: params.TargetMargin, MinimumMarginRate: params.TargetMargin,
			Remark: "Anispark tenant API internal-test retail price",
		}, 1)
		if err != nil {
			return fmt.Errorf("create %s retail price: %w", target.ModelName, err)
		}
		if err := pricingadmin.PublishRetailPriceVersion(retail.Id); err != nil {
			return fmt.Errorf("publish %s price chain: %w", target.ModelName, err)
		}
		fmt.Printf(
			"priced model=%s channel_model_id=%d official_id=%d purchase_id=%d retail_id=%d discount=%s\n",
			target.ModelName, target.ChannelModel.Id, officialID, purchase.Id, retail.Id, target.Discount,
		)
	}

	for _, target := range targets {
		if _, err := pricingruntime.SetModelRuntimeMode(target.ModelName, pricingruntime.RuntimeModeV2); err != nil {
			return fmt.Errorf("activate V2 for %s: %w", target.ModelName, err)
		}
	}
	pricingruntime.InvalidateCatalog()
	return verifyChannelPricing(params, targets)
}

func verifyChannelPricing(params channelPricingParams, targets []channelPricingTarget) error {
	for _, target := range targets {
		bundle, err := pricingadmin.GetActivePriceBundle(target.ChannelModel.Id)
		if err != nil {
			return fmt.Errorf("verify %s active bundle: %w", target.ModelName, err)
		}
		if bundle.Purchase.PurchaseDiscount != target.Discount ||
			bundle.Retail.TotalVariableCostRate != decimalString(params.VariableCostRate) ||
			bundle.Retail.EffectiveTaxRate != decimalString(params.TaxRate) ||
			bundle.Retail.TargetNetMargin != decimalString(params.TargetMargin) ||
			bundle.Retail.MinimumMarginRate != decimalString(params.TargetMargin) {
			return fmt.Errorf("verify %s price rates differ from requested values", target.ModelName)
		}
		var abilityCount int64
		if err := model.DB.Model(&model.Ability{}).
			Where("channel_id = ? AND model = ? AND enabled = ?", params.ChannelID, target.ModelName, true).
			Where("\"group\" = ?", params.StagingGroup).
			Count(&abilityCount).Error; err != nil || abilityCount != 1 {
			return fmt.Errorf("verify %s staging ability count=%d: %w", target.ModelName, abilityCount, err)
		}
	}
	fmt.Printf("verified channel_id=%d staging_group=%s priced_models=%d\n", params.ChannelID, params.StagingGroup, len(targets))
	return nil
}

func loadConfig(path string) (config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return config{}, err
	}
	var cfg config
	decoder := yaml.NewDecoder(bytes.NewReader(data))
	decoder.KnownFields(true)
	if err := decoder.Decode(&cfg); err != nil {
		return config{}, err
	}
	if cfg.MinimumMargin == "" {
		cfg.MinimumMargin = cfg.TargetMargin
	}
	if len(cfg.Endpoints) == 0 {
		cfg.Endpoints = []string{"openai"}
	}
	cfg.StagingGroup = strings.TrimSpace(cfg.StagingGroup)
	return cfg, validateConfig(cfg)
}

func validateConfig(cfg config) error {
	if cfg.ChannelID <= 0 {
		return errors.New("channel_id is required; ask the user for the target channel ID")
	}
	if strings.TrimSpace(cfg.StagingGroup) == "" {
		return errors.New("staging_group is required; ask the user for the isolated internal-test group")
	}
	if strings.TrimSpace(cfg.LogicalModel) == "" {
		return errors.New("logical_model is required; ask the user for the customer-facing model name")
	}
	if strings.TrimSpace(cfg.UpstreamModel) == "" {
		return errors.New("upstream_model is required; ask the user for or verify the provider model name")
	}
	if strings.TrimSpace(cfg.PurchaseDiscount) == "" {
		return errors.New("purchase_discount is required; ask the user for the channel procurement discount")
	}
	if strings.TrimSpace(cfg.Vendor) == "" || strings.TrimSpace(cfg.Description) == "" {
		return errors.New("vendor and description are required")
	}
	if strings.TrimSpace(cfg.OfficialSourceURL) == "" {
		return errors.New("official_source_url is required")
	}
	if cfg.OfficialInput == "" && cfg.OfficialOutput == "" {
		return errors.New("at least one official token price is required")
	}
	for name, value := range map[string]string{
		"purchase_discount": cfg.PurchaseDiscount, "variable_cost_rate": cfg.VariableCostRate,
		"tax_rate": cfg.TaxRate, "target_margin": cfg.TargetMargin, "minimum_margin": cfg.MinimumMargin,
	} {
		rate, err := decimal.NewFromString(value)
		if err != nil || rate.IsNegative() || rate.GreaterThan(decimal.NewFromInt(1)) {
			return fmt.Errorf("%s must be a decimal between 0 and 1", name)
		}
	}
	minimum, _ := decimal.NewFromString(cfg.MinimumMargin)
	target, _ := decimal.NewFromString(cfg.TargetMargin)
	if minimum.GreaterThan(target) {
		return errors.New("minimum_margin cannot exceed target_margin")
	}
	return nil
}

func buildPlan(cfg config) (plan, error) {
	calculator, err := pricingadmin.NewRetailPriceCalculator(cfg.VariableCostRate, cfg.TaxRate, cfg.TargetMargin)
	if err != nil {
		return plan{}, err
	}
	factor, err := calculator.SellingFactor()
	if err != nil {
		return plan{}, err
	}
	discount, _ := decimal.NewFromString(cfg.PurchaseDiscount)
	result := plan{SellingFactor: factor.String()}
	components := []struct {
		official string
		purchase *string
		retail   *string
	}{
		{cfg.OfficialInput, &result.PurchaseInput, &result.RetailInput},
		{cfg.OfficialOutput, &result.PurchaseOutput, &result.RetailOutput},
		{cfg.OfficialCacheRead, &result.PurchaseCacheRead, &result.RetailCacheRead},
		{cfg.OfficialCacheWrite, &result.PurchaseCacheWrite, &result.RetailCacheWrite},
	}
	for _, item := range components {
		if strings.TrimSpace(item.official) == "" {
			continue
		}
		official, err := decimal.NewFromString(item.official)
		if err != nil || official.IsNegative() {
			return plan{}, fmt.Errorf("official price %q is invalid", item.official)
		}
		purchase := official.Mul(discount)
		retail, err := calculator.CalculateSellingPrice(purchase)
		if err != nil {
			return plan{}, err
		}
		*item.purchase = purchase.String()
		*item.retail = retail.StringFixed(5)
		if !retail.LessThan(official) {
			return plan{}, fmt.Errorf("calculated retail price %s must be lower than official price %s", retail, official)
		}
	}
	return result, nil
}

func printPlan(cfg config, computed plan) {
	fmt.Printf("model=%s channel_id=%d upstream=%s staging_group=%s\n", cfg.LogicalModel, cfg.ChannelID, cfg.UpstreamModel, cfg.StagingGroup)
	fmt.Printf("official input=%s output=%s cache_read=%s cache_write=%s USD/1M\n", cfg.OfficialInput, cfg.OfficialOutput, cfg.OfficialCacheRead, cfg.OfficialCacheWrite)
	fmt.Printf("purchase input=%s output=%s cache_read=%s cache_write=%s USD/1M\n", computed.PurchaseInput, computed.PurchaseOutput, computed.PurchaseCacheRead, computed.PurchaseCacheWrite)
	fmt.Printf("retail input=%s output=%s cache_read=%s cache_write=%s USD/1M factor=%s\n", computed.RetailInput, computed.RetailOutput, computed.RetailCacheRead, computed.RetailCacheWrite, computed.SellingFactor)
}

func openDatabase() error {
	if os.Getenv("SQL_DSN") == "" && os.Getenv("DATABASE_URL") != "" {
		if err := os.Setenv("SQL_DSN", os.Getenv("DATABASE_URL")); err != nil {
			return err
		}
	}
	if err := os.Setenv("MIGRATION_ENABLED", "false"); err != nil {
		return err
	}
	return model.InitDB()
}

func inspect(cfg config) error {
	var channel model.Channel
	if err := model.DB.First(&channel, cfg.ChannelID).Error; err != nil {
		return err
	}
	var logicalModel model.Model
	modelErr := model.DB.Where("model_name = ?", cfg.LogicalModel).First(&logicalModel).Error
	fmt.Printf("channel id=%d name=%q status=%d groups=%q configured=%v\n", channel.Id, channel.Name, channel.Status, channel.Group, csvContains(channel.Models, cfg.LogicalModel))
	if errors.Is(modelErr, gorm.ErrRecordNotFound) {
		fmt.Println("model: missing")
		return nil
	}
	if modelErr != nil {
		return modelErr
	}
	fmt.Printf("model id=%d vendor_id=%d status=%d description=%q\n", logicalModel.Id, logicalModel.VendorID, logicalModel.Status, logicalModel.Description)
	var channelModel model.ChannelModel
	err := model.DB.Where("channel_id = ? AND model_id = ?", cfg.ChannelID, logicalModel.Id).First(&channelModel).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		fmt.Println("channel_model: missing")
		return nil
	}
	if err != nil {
		return err
	}
	fmt.Printf("channel_model id=%d upstream=%q status=%d runtime=%q\n", channelModel.Id, channelModel.UpstreamModelName, channelModel.Status, channelModel.RuntimeMode)
	return nil
}

func apply(cfg config) error {
	var channel model.Channel
	if err := model.DB.First(&channel, cfg.ChannelID).Error; err != nil {
		return err
	}
	if err := validateStagingChannel(channel, cfg.StagingGroup); err != nil {
		return err
	}
	if err := validateOtherEnabledChannelsReady(cfg); err != nil {
		return err
	}
	var vendor model.Vendor
	err := model.DB.Where("name = ?", cfg.Vendor).First(&vendor).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		vendor = model.Vendor{Name: cfg.Vendor, Icon: cfg.Icon, Status: 1}
		if err := vendor.Insert(); err != nil {
			return err
		}
	} else if err != nil {
		return err
	}

	endpoints, err := common.Marshal(cfg.Endpoints)
	if err != nil {
		return err
	}
	var logicalModel model.Model
	err = model.DB.Where("model_name = ?", cfg.LogicalModel).First(&logicalModel).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		logicalModel = model.Model{ModelName: cfg.LogicalModel, VendorID: vendor.Id, Icon: cfg.Icon, Description: cfg.Description, Tags: strings.Join(cfg.Tags, ","), Endpoints: string(endpoints), Status: 1, SyncOfficial: 0, Visibility: "public"}
		if err := logicalModel.Insert(); err != nil {
			return err
		}
	} else if err != nil {
		return err
	} else {
		logicalModel.VendorID, logicalModel.Icon, logicalModel.Description = vendor.Id, cfg.Icon, cfg.Description
		logicalModel.Tags, logicalModel.Endpoints, logicalModel.Status, logicalModel.SyncOfficial, logicalModel.Visibility = strings.Join(cfg.Tags, ","), string(endpoints), 1, 0, "public"
		if err := logicalModel.Update(); err != nil {
			return err
		}
	}

	channelChanged := false
	if !csvContains(channel.Models, cfg.LogicalModel) {
		if strings.TrimSpace(channel.Models) == "" {
			channel.Models = cfg.LogicalModel
		} else {
			channel.Models += "," + cfg.LogicalModel
		}
		channelChanged = true
	}
	mapping := map[string]string{}
	if channel.ModelMapping != nil && strings.TrimSpace(*channel.ModelMapping) != "" {
		if err := common.UnmarshalJsonStr(*channel.ModelMapping, &mapping); err != nil {
			return err
		}
	}
	if mapping[cfg.LogicalModel] != cfg.UpstreamModel {
		mapping[cfg.LogicalModel] = cfg.UpstreamModel
		channelChanged = true
	}
	if channelChanged {
		mappingJSON, err := common.Marshal(mapping)
		if err != nil {
			return err
		}
		mappingText := string(mappingJSON)
		channel.ModelMapping = &mappingText
		if err := channel.Update(); err != nil {
			return err
		}
	}

	var channelModel model.ChannelModel
	err = model.DB.Where("channel_id = ? AND model_id = ?", cfg.ChannelID, logicalModel.Id).First(&channelModel).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		channelModel = model.ChannelModel{ChannelId: cfg.ChannelID, ModelId: logicalModel.Id, UpstreamModelName: cfg.UpstreamModel, Status: 1, Priority: int64Value(channel.Priority), Weight: uint(channel.GetWeight()), RuntimeMode: pricingruntime.RuntimeModeLegacy}
		if err := model.DB.Create(&channelModel).Error; err != nil {
			return err
		}
	} else if err != nil {
		return err
	} else if channelModel.UpstreamModelName != cfg.UpstreamModel {
		return fmt.Errorf("channel model %d uses upstream %q; identity is immutable", channelModel.Id, channelModel.UpstreamModelName)
	}

	official, err := ensureOfficialPrice(cfg, logicalModel.Id)
	if err != nil {
		return err
	}
	if err := ensurePriceChain(cfg, channelModel.Id, official.Id); err != nil {
		return err
	}
	updated, err := pricingruntime.SetModelRuntimeMode(cfg.LogicalModel, pricingruntime.RuntimeModeV2)
	if err != nil {
		return err
	}
	fmt.Printf("applied model_id=%d channel_model_id=%d runtime_updated=%d\n", logicalModel.Id, channelModel.Id, updated)
	return nil
}

func validateOtherEnabledChannelsReady(cfg config) error {
	var logicalModel model.Model
	err := model.DB.Where("model_name = ?", cfg.LogicalModel).First(&logicalModel).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	var channelIDs []int
	if err := model.DB.Model(&model.Ability{}).
		Where("model = ? AND enabled = ? AND channel_id <> ?", cfg.LogicalModel, true, cfg.ChannelID).
		Distinct("channel_id").Pluck("channel_id", &channelIDs).Error; err != nil {
		return err
	}
	for _, channelID := range channelIDs {
		var channelModel model.ChannelModel
		if err := model.DB.Where("channel_id = ? AND model_id = ?", channelID, logicalModel.Id).First(&channelModel).Error; err != nil {
			return fmt.Errorf("enabled channel %d has no channel model for %s", channelID, cfg.LogicalModel)
		}
		if _, err := pricingadmin.GetActivePriceBundle(channelModel.Id); err != nil {
			return fmt.Errorf("enabled channel %d is not ready for V2: %w", channelID, err)
		}
	}
	return nil
}

func validateStagingChannel(channel model.Channel, stagingGroup string) error {
	groups := strings.Split(channel.Group, ",")
	uniqueGroups := make(map[string]struct{}, len(groups))
	for _, group := range groups {
		group = strings.TrimSpace(group)
		if group != "" {
			uniqueGroups[group] = struct{}{}
		}
	}
	if len(uniqueGroups) != 1 {
		return fmt.Errorf(
			"channel %d must belong only to staging_group %q before apply; current groups=%q",
			channel.Id,
			stagingGroup,
			channel.Group,
		)
	}
	if _, ok := uniqueGroups[stagingGroup]; !ok {
		return fmt.Errorf(
			"channel %d is not isolated in staging_group %q; current groups=%q",
			channel.Id,
			stagingGroup,
			channel.Group,
		)
	}
	return nil
}

func ensureOfficialPrice(cfg config, modelID int) (model.OfficialModelPriceVersion, error) {
	prices := pricingadmin.FlatTokenPriceInput{InputUnitPrice: cfg.OfficialInput, OutputUnitPrice: cfg.OfficialOutput, CacheReadUnitPrice: cfg.OfficialCacheRead, CacheWriteUnitPrice: cfg.OfficialCacheWrite}
	var active model.OfficialModelPriceVersion
	err := model.DB.Where("model_id = ? AND status = ?", modelID, model.PricingVersionStatusActive).Order("version DESC").First(&active).Error
	if err == nil {
		var components map[string]string
		if decodeErr := common.UnmarshalJsonStr(active.PriceComponents, &components); decodeErr == nil &&
			components["input_unit_price"] == cfg.OfficialInput && components["output_unit_price"] == cfg.OfficialOutput &&
			components["cache_read_unit_price"] == cfg.OfficialCacheRead && components["cache_write_unit_price"] == cfg.OfficialCacheWrite {
			return active, nil
		}
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return active, err
	}
	draft, err := pricingadmin.CreateOfficialFlatDraft(pricingadmin.OfficialFlatDraftInput{ModelId: modelID, Currency: "USD", Prices: prices, Source: "vendor-official", Remark: "Official source: " + cfg.OfficialSourceURL}, 1)
	if err != nil {
		return draft, err
	}
	if err := pricingadmin.PublishOfficialPriceVersion(draft.Id); err != nil {
		return draft, err
	}
	return draft, model.DB.First(&draft, draft.Id).Error
}

func ensurePriceChain(cfg config, channelModelID int, officialID int) error {
	var retail model.ChannelModelRetailPriceVersion
	err := model.DB.Where("channel_model_id = ? AND status = ?", channelModelID, model.PricingVersionStatusActive).First(&retail).Error
	if err == nil {
		var purchase model.ChannelModelPurchasePriceVersion
		if err := model.DB.First(&purchase, retail.PurchasePriceVersionId).Error; err != nil {
			return err
		}
		if purchase.OfficialPriceVersionId != nil && *purchase.OfficialPriceVersionId == officialID && purchase.PurchaseDiscount == cfg.PurchaseDiscount &&
			retail.TotalVariableCostRate == decimalString(cfg.VariableCostRate) && retail.EffectiveTaxRate == decimalString(cfg.TaxRate) &&
			retail.TargetNetMargin == decimalString(cfg.TargetMargin) && retail.MinimumMarginRate == decimalString(cfg.MinimumMargin) {
			return nil
		}
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	purchase, err := pricingadmin.CreatePurchaseDraft(pricingadmin.PurchaseDraftInput{ChannelModelId: channelModelID, OfficialPriceVersionId: &officialID, PricingMode: "official_ratio", Currency: "USD", PurchaseDiscount: cfg.PurchaseDiscount, QuoteReference: fmt.Sprintf("channel %d official price %s", channelModelID, cfg.PurchaseDiscount)}, 1)
	if err != nil {
		return err
	}
	retail, err = pricingadmin.CreateRetailDraft(pricingadmin.RetailDraftInput{ChannelModelId: channelModelID, PurchasePriceVersionId: purchase.Id, TotalVariableCostRate: cfg.VariableCostRate, EffectiveTaxRate: cfg.TaxRate, TargetNetMargin: cfg.TargetMargin, MinimumMarginRate: cfg.MinimumMargin}, 1)
	if err != nil {
		return err
	}
	return pricingadmin.PublishRetailPriceVersion(retail.Id)
}

func verify(cfg config, expected plan, probe bool) error {
	var logicalModel model.Model
	if err := model.DB.Where("model_name = ?", cfg.LogicalModel).First(&logicalModel).Error; err != nil {
		return err
	}
	var channelModel model.ChannelModel
	if err := model.DB.Where("channel_id = ? AND model_id = ? AND upstream_model_name = ?", cfg.ChannelID, logicalModel.Id, cfg.UpstreamModel).First(&channelModel).Error; err != nil {
		return err
	}
	if channelModel.RuntimeMode != pricingruntime.RuntimeModeV2 || channelModel.Status != 1 {
		return errors.New("channel model is not active in V2 runtime")
	}
	bundle, err := pricingadmin.GetActivePriceBundle(channelModel.Id)
	if err != nil {
		return err
	}
	if bundle.Retail.InputUnitPrice != expected.RetailInput || bundle.Retail.OutputUnitPrice != expected.RetailOutput || bundle.Retail.CacheReadUnitPrice != expected.RetailCacheRead {
		return fmt.Errorf("retail prices differ from plan: got %s/%s/%s", bundle.Retail.InputUnitPrice, bundle.Retail.OutputUnitPrice, bundle.Retail.CacheReadUnitPrice)
	}
	var abilityCount int64
	groupColumn := "`group`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		groupColumn = `"group"`
	}
	if err := model.DB.Model(&model.Ability{}).Where(
		"channel_id = ? AND model = ? AND "+groupColumn+" = ? AND enabled = ?",
		cfg.ChannelID,
		cfg.LogicalModel,
		cfg.StagingGroup,
		true,
	).Count(&abilityCount).Error; err != nil {
		return err
	}
	if abilityCount == 0 {
		return errors.New("no enabled routing ability exists")
	}
	fmt.Printf("verified model_id=%d channel_model_id=%d purchase_id=%d retail_id=%d abilities=%d\n", logicalModel.Id, channelModel.Id, bundle.Purchase.Id, bundle.Retail.Id, abilityCount)
	if probe {
		return probeUpstream(cfg)
	}
	return nil
}

func probeUpstream(cfg config) error {
	var channel model.Channel
	if err := model.DB.First(&channel, cfg.ChannelID).Error; err != nil {
		return err
	}
	payload, err := common.Marshal(map[string]any{"model": cfg.UpstreamModel, "messages": []map[string]string{{"role": "user", "content": "Reply OK"}}, "max_tokens": 1, "stream": false})
	if err != nil {
		return err
	}
	request, err := http.NewRequest(http.MethodPost, strings.TrimRight(stringValue(channel.BaseURL), "/")+"/v1/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+channel.Key)
	request.Header.Set("Content-Type", "application/json")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	var body map[string]any
	if err := common.DecodeJson(response.Body, &body); err != nil {
		return err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("upstream probe failed with HTTP %d: %v", response.StatusCode, body["error"])
	}
	fmt.Printf("probe status=%d model=%v usage=%v\n", response.StatusCode, body["model"], body["usage"])
	return nil
}

func csvContains(raw string, target string) bool {
	for _, item := range strings.Split(raw, ",") {
		if strings.TrimSpace(item) == target {
			return true
		}
	}
	return false
}

func decimalString(value string) string {
	parsed, err := decimal.NewFromString(value)
	if err != nil {
		return value
	}
	return parsed.StringFixed(12)
}

func int64Value(value *int64) int64 {
	if value == nil {
		return 0
	}
	return *value
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func exitWithError(err error) {
	if err == nil {
		return
	}
	fmt.Fprintln(os.Stderr, "error:", err)
	os.Exit(1)
}
