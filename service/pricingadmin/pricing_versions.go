package pricingadmin

import (
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type LegacyOfficialPriceImportResult struct {
	Created           int      `json:"created"`
	SkippedExisting   int      `json:"skipped_existing"`
	SkippedUnpriced   int      `json:"skipped_unpriced"`
	SkippedModelNames []string `json:"skipped_model_names,omitempty"`
}

var (
	validBillingModes = map[string]struct{}{
		"token": {}, "request": {}, "image": {}, "audio_duration": {},
		"video_duration": {}, "character": {}, "mixed": {},
	}
	validPriceStructures = map[string]struct{}{
		"flat": {}, "tiered": {}, "expression": {},
	}
	validPricingModes = map[string]struct{}{
		"official_ratio": {}, "component_ratio": {}, "fixed_unit_price": {},
		"hybrid": {}, "custom_expr": {},
	}
)

func CreateOfficialPriceVersion(input *model.OfficialModelPriceVersion, userId int) error {
	if input == nil {
		return errors.New("official price is required")
	}
	input.Id = 0
	input.CreatedBy = userId
	input.Status = model.PricingVersionStatusDraft
	input.EffectiveFrom = 0
	input.EffectiveTo = 0
	normalizeExpressionMetadata(
		&input.ExpressionSource,
		&input.ExpressionSchemaVersion,
		&input.Currency,
	)
	if err := validateCommonPrice(
		input.ModelId,
		input.BillingMode,
		input.PriceStructure,
		input.Currency,
		input.BillingExpr,
	); err != nil {
		return err
	}
	input.ExprHash = billingexpr.ExprHashString(input.BillingExpr)
	return model.DB.Transaction(func(tx *gorm.DB) error {
		var logicalModel model.Model
		if err := tx.First(&logicalModel, input.ModelId).Error; err != nil {
			return err
		}
		var maxVersion int64
		if err := tx.Model(&model.OfficialModelPriceVersion{}).
			Where("model_id = ?", input.ModelId).
			Select("COALESCE(MAX(version), 0)").
			Scan(&maxVersion).Error; err != nil {
			return err
		}
		input.Version = maxVersion + 1
		return tx.Create(input).Error
	})
}

func CreatePurchasePriceVersion(input *model.ChannelModelPurchasePriceVersion, userId int) error {
	if input == nil {
		return errors.New("purchase price is required")
	}
	input.Id = 0
	input.CreatedBy = userId
	input.Status = model.PricingVersionStatusDraft
	input.EffectiveFrom = 0
	input.EffectiveTo = 0
	normalizeExpressionMetadata(
		&input.ExpressionSource,
		&input.ExpressionSchemaVersion,
		&input.Currency,
	)
	if err := validateCommonPrice(
		input.ChannelModelId,
		input.BillingMode,
		input.PriceStructure,
		input.Currency,
		input.PurchaseBillingExpr,
	); err != nil {
		return err
	}
	if _, ok := validPricingModes[input.PricingMode]; !ok {
		return fmt.Errorf("unsupported pricing mode %q", input.PricingMode)
	}
	if (input.PricingMode == "official_ratio" || input.PricingMode == "component_ratio") &&
		input.OfficialPriceVersionId == nil {
		return errors.New("official price version is required for ratio pricing")
	}
	if input.PricingMode == "official_ratio" {
		if err := validatePositiveDecimal("purchase_discount", input.PurchaseDiscount, true); err != nil {
			return err
		}
	}
	if err := validateUnitPrices(
		input.InputUnitPrice,
		input.OutputUnitPrice,
		input.CacheReadUnitPrice,
		input.CacheWriteUnitPrice,
	); err != nil {
		return err
	}
	input.PurchaseExprHash = billingexpr.ExprHashString(input.PurchaseBillingExpr)
	return model.DB.Transaction(func(tx *gorm.DB) error {
		var channelModel model.ChannelModel
		if err := tx.First(&channelModel, input.ChannelModelId).Error; err != nil {
			return err
		}
		if input.OfficialPriceVersionId != nil {
			var official model.OfficialModelPriceVersion
			if err := tx.First(&official, *input.OfficialPriceVersionId).Error; err != nil {
				return err
			}
		}
		var maxVersion int64
		if err := tx.Model(&model.ChannelModelPurchasePriceVersion{}).
			Where("channel_model_id = ?", input.ChannelModelId).
			Select("COALESCE(MAX(version), 0)").
			Scan(&maxVersion).Error; err != nil {
			return err
		}
		input.Version = maxVersion + 1
		return tx.Create(input).Error
	})
}

func CreateRetailPriceVersion(input *model.ChannelModelRetailPriceVersion, userId int) error {
	if input == nil {
		return errors.New("retail price is required")
	}
	input.Id = 0
	input.CreatedBy = userId
	input.Status = model.PricingVersionStatusDraft
	input.EffectiveFrom = 0
	input.EffectiveTo = 0
	normalizeExpressionMetadata(
		&input.ExpressionSource,
		&input.ExpressionSchemaVersion,
		&input.Currency,
	)
	if err := validateCommonPrice(
		input.ChannelModelId,
		input.BillingMode,
		input.PriceStructure,
		input.Currency,
		input.RetailBillingExpr,
	); err != nil {
		return err
	}
	if input.PurchasePriceVersionId <= 0 {
		return errors.New("purchase price version is required")
	}
	if err := validateUnitPrices(
		input.InputUnitPrice,
		input.OutputUnitPrice,
		input.CacheReadUnitPrice,
		input.CacheWriteUnitPrice,
	); err != nil {
		return err
	}
	if err := validateRetailEconomics(*input); err != nil {
		return err
	}
	input.RetailExprHash = billingexpr.ExprHashString(input.RetailBillingExpr)
	return model.DB.Transaction(func(tx *gorm.DB) error {
		var purchase model.ChannelModelPurchasePriceVersion
		if err := tx.First(&purchase, input.PurchasePriceVersionId).Error; err != nil {
			return err
		}
		if purchase.ChannelModelId != input.ChannelModelId {
			return errors.New("purchase and retail versions belong to different channel models")
		}
		var maxVersion int64
		if err := tx.Model(&model.ChannelModelRetailPriceVersion{}).
			Where("channel_model_id = ?", input.ChannelModelId).
			Select("COALESCE(MAX(version), 0)").
			Scan(&maxVersion).Error; err != nil {
			return err
		}
		input.Version = maxVersion + 1
		return tx.Create(input).Error
	})
}

func PublishOfficialPriceVersion(id int) error {
	return model.DB.Transaction(func(tx *gorm.DB) error {
		version, err := model.GetOfficialPriceVersionForUpdate(tx, id)
		if err != nil {
			return err
		}
		if version.Status != model.PricingVersionStatusDraft {
			return errors.New("only draft official prices can be published")
		}
		if err := validateV1PublishableBillingMode(version.BillingMode); err != nil {
			return err
		}
		if err := validateCommonPrice(
			version.ModelId,
			version.BillingMode,
			version.PriceStructure,
			version.Currency,
			version.BillingExpr,
		); err != nil {
			return err
		}
		if version.ExprHash != billingexpr.ExprHashString(version.BillingExpr) {
			return errors.New("official price expression hash does not match")
		}
		return model.ActivateOfficialPriceVersion(tx, version, common.GetTimestamp())
	})
}

func PublishPurchasePriceVersion(id int) error {
	return model.DB.Transaction(func(tx *gorm.DB) error {
		version, err := model.GetPurchasePriceVersionForUpdate(tx, id)
		if err != nil {
			return err
		}
		if version.Status != model.PricingVersionStatusDraft {
			return errors.New("only draft purchase prices can be published")
		}
		var channelModel model.ChannelModel
		if err := tx.First(&channelModel, version.ChannelModelId).Error; err != nil {
			return err
		}
		if channelModel.Status == 0 {
			return errors.New("disabled channel model cannot publish a purchase price")
		}
		if err := validateV1PublishableBillingMode(version.BillingMode); err != nil {
			return err
		}
		if err := validateCommonPrice(
			version.ChannelModelId,
			version.BillingMode,
			version.PriceStructure,
			version.Currency,
			version.PurchaseBillingExpr,
		); err != nil {
			return err
		}
		if version.PurchaseExprHash != billingexpr.ExprHashString(version.PurchaseBillingExpr) {
			return errors.New("purchase price expression hash does not match")
		}
		requiresOfficialPrice := version.PricingMode == "official_ratio" ||
			version.PricingMode == "component_ratio" ||
			version.PricingMode == "hybrid"
		if requiresOfficialPrice && version.OfficialPriceVersionId == nil {
			return errors.New("official price version is required for ratio pricing")
		}
		if requiresOfficialPrice {
			var official model.OfficialModelPriceVersion
			if err := tx.First(&official, *version.OfficialPriceVersionId).Error; err != nil {
				return err
			}
			if official.Status != model.PricingVersionStatusActive {
				return errors.New("referenced official price is not active")
			}
		}
		return model.ActivatePurchasePriceVersion(tx, version, common.GetTimestamp())
	})
}

func PublishRetailPriceVersion(id int) error {
	return model.DB.Transaction(func(tx *gorm.DB) error {
		version, err := model.GetRetailPriceVersionForUpdate(tx, id)
		if err != nil {
			return err
		}
		if version.Status != model.PricingVersionStatusDraft {
			return errors.New("only draft retail prices can be published")
		}
		var purchase model.ChannelModelPurchasePriceVersion
		if err := tx.First(&purchase, version.PurchasePriceVersionId).Error; err != nil {
			return err
		}
		if purchase.Status != model.PricingVersionStatusActive {
			return errors.New("retail price requires an active purchase price")
		}
		if purchase.ChannelModelId != version.ChannelModelId {
			return errors.New("purchase and retail versions belong to different channel models")
		}
		if err := validateV1PublishableBillingMode(version.BillingMode); err != nil {
			return err
		}
		if err := validateCommonPrice(
			version.ChannelModelId,
			version.BillingMode,
			version.PriceStructure,
			version.Currency,
			version.RetailBillingExpr,
		); err != nil {
			return err
		}
		if version.RetailExprHash != billingexpr.ExprHashString(version.RetailBillingExpr) {
			return errors.New("retail price expression hash does not match")
		}
		if err := validateRetailEconomics(version); err != nil {
			return err
		}
		return model.ActivateRetailPriceVersion(tx, version, common.GetTimestamp())
	})
}

// ImportLegacyOfficialPriceDrafts snapshots the current legacy pricing config
// into reviewable drafts. It never activates a price or changes legacy runtime.
func ImportLegacyOfficialPriceDrafts(userId int) (LegacyOfficialPriceImportResult, error) {
	result := LegacyOfficialPriceImportResult{}
	var models []model.Model
	if err := model.DB.Order("id ASC").Find(&models).Error; err != nil {
		return result, err
	}
	for _, logicalModel := range models {
		var existing int64
		if err := model.DB.Model(&model.OfficialModelPriceVersion{}).
			Where("model_id = ?", logicalModel.Id).
			Count(&existing).Error; err != nil {
			return result, err
		}
		if existing > 0 {
			result.SkippedExisting++
			continue
		}

		version, ok := buildLegacyOfficialPriceDraft(logicalModel)
		if !ok {
			result.SkippedUnpriced++
			result.SkippedModelNames = append(result.SkippedModelNames, logicalModel.ModelName)
			continue
		}
		if err := CreateOfficialPriceVersion(&version, userId); err != nil {
			return result, fmt.Errorf("import model %q: %w", logicalModel.ModelName, err)
		}
		result.Created++
	}
	sort.Strings(result.SkippedModelNames)
	return result, nil
}

func buildLegacyOfficialPriceDraft(logicalModel model.Model) (model.OfficialModelPriceVersion, bool) {
	mode := billing_setting.GetBillingMode(logicalModel.ModelName)
	expression, hasExpression := billing_setting.GetBillingExpr(logicalModel.ModelName)
	billingMode := "token"
	priceStructure := "flat"
	priceComponents := map[string]any{
		"legacy_model_name": logicalModel.ModelName,
		"legacy_mode":       mode,
	}

	switch mode {
	case billing_setting.BillingModeTieredExpr:
		if !hasExpression || strings.TrimSpace(expression) == "" {
			return model.OfficialModelPriceVersion{}, false
		}
		priceStructure = "tiered"
	case billing_setting.BillingModePerRequest:
		price, ok := ratio_setting.GetModelPrice(logicalModel.ModelName, false)
		if !ok {
			return model.OfficialModelPriceVersion{}, false
		}
		billingMode = "request"
		expression = fmt.Sprintf(`v1:tier("legacy_import", %s)`, decimal.NewFromFloat(price).String())
		priceComponents["request_unit_price"] = decimal.NewFromFloat(price).String()
	case billing_setting.BillingModeVideoSecond:
		price, ok := ratio_setting.GetModelPrice(logicalModel.ModelName, false)
		if !ok {
			return model.OfficialModelPriceVersion{}, false
		}
		billingMode = "video_duration"
		expression = fmt.Sprintf(`v1:tier("legacy_import", %s)`, decimal.NewFromFloat(price).String())
		priceComponents["video_second_unit_price"] = decimal.NewFromFloat(price).String()
	default:
		ratio, ok, _ := ratio_setting.GetModelRatio(logicalModel.ModelName)
		if !ok {
			return model.OfficialModelPriceVersion{}, false
		}
		inputPrice := decimal.NewFromFloat(ratio).Mul(decimal.NewFromInt(2))
		outputPrice := inputPrice.Mul(decimal.NewFromFloat(ratio_setting.GetCompletionRatio(logicalModel.ModelName)))
		expression = fmt.Sprintf(
			`v1:tier("legacy_import", p * %s + c * %s)`,
			inputPrice.String(),
			outputPrice.String(),
		)
		priceComponents["input_unit_price"] = inputPrice.String()
		priceComponents["output_unit_price"] = outputPrice.String()
	}

	componentsJSON, err := common.Marshal(priceComponents)
	if err != nil {
		return model.OfficialModelPriceVersion{}, false
	}
	return model.OfficialModelPriceVersion{
		ModelId:                 logicalModel.Id,
		BillingMode:             billingMode,
		PriceStructure:          priceStructure,
		PriceComponents:         string(componentsJSON),
		BillingExpr:             expression,
		ExpressionSource:        "generated",
		ExpressionSchemaVersion: "v1",
		Currency:                "USD",
		Source:                  "legacy_import",
		SourceVersion:           "new-api-legacy",
		Remark:                  "Imported as draft; financial confirmation required before publication.",
	}, true
}

func normalizeExpressionMetadata(source *string, schemaVersion *string, currency *string) {
	*source = strings.TrimSpace(*source)
	if *source == "" {
		*source = "generated"
	}
	*schemaVersion = strings.TrimSpace(*schemaVersion)
	if *schemaVersion == "" {
		*schemaVersion = "v1"
	}
	*currency = strings.ToUpper(strings.TrimSpace(*currency))
}

func validateCommonPrice(scopeId int, billingMode string, priceStructure string, currency string, expression string) error {
	if scopeId <= 0 {
		return errors.New("price scope is required")
	}
	if _, ok := validBillingModes[billingMode]; !ok {
		return fmt.Errorf("unsupported billing mode %q", billingMode)
	}
	if _, ok := validPriceStructures[priceStructure]; !ok {
		return fmt.Errorf("unsupported price structure %q", priceStructure)
	}
	if strings.TrimSpace(currency) == "" {
		return errors.New("currency is required")
	}
	if strings.TrimSpace(expression) == "" {
		return errors.New("billing expression is required")
	}
	return billing_setting.SmokeTestExpr(expression)
}

func validateUnitPrices(values ...string) error {
	for _, value := range values {
		if err := validatePositiveDecimal("unit_price", value, false); err != nil {
			return err
		}
	}
	return nil
}

func validatePositiveDecimal(name string, value string, required bool) error {
	value = strings.TrimSpace(value)
	if value == "" {
		if required {
			return fmt.Errorf("%s is required", name)
		}
		return nil
	}
	number, err := decimal.NewFromString(value)
	if err != nil {
		return fmt.Errorf("%s is invalid: %w", name, err)
	}
	if number.IsNegative() || (required && number.IsZero()) {
		return fmt.Errorf("%s must be positive", name)
	}
	return nil
}

func validateRate(name string, value string) (decimal.Decimal, error) {
	number, err := decimal.NewFromString(strings.TrimSpace(value))
	if err != nil {
		return decimal.Zero, fmt.Errorf("%s is invalid: %w", name, err)
	}
	if number.IsNegative() || number.GreaterThanOrEqual(decimal.NewFromInt(1)) {
		return decimal.Zero, fmt.Errorf("%s must be in [0, 1)", name)
	}
	return number, nil
}

func validateRetailEconomics(input model.ChannelModelRetailPriceVersion) error {
	vcr, err := validateRate("total_variable_cost_rate", input.TotalVariableCostRate)
	if err != nil {
		return err
	}
	tax, err := validateRate("effective_tax_rate", input.EffectiveTaxRate)
	if err != nil {
		return err
	}
	margin, err := validateRate("target_net_margin", input.TargetNetMargin)
	if err != nil {
		return err
	}
	if _, err := validateRate("minimum_margin_rate", input.MinimumMarginRate); err != nil {
		return err
	}
	denominator := decimal.NewFromInt(1).Sub(vcr).
		Mul(decimal.NewFromInt(1).Sub(tax)).
		Sub(margin)
	if !denominator.IsPositive() {
		return errors.New("VCR, tax rate and target margin produce a non-positive retail denominator")
	}
	return nil
}

func validateV1PublishableBillingMode(billingMode string) error {
	if billingMode != "token" {
		return fmt.Errorf(
			"billing mode %q can be saved as draft but cannot be published until its V2 runtime evaluator is enabled",
			billingMode,
		)
	}
	return nil
}
