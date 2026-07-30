package pricingadmin

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/service/pricingruntime"
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

func officialPriceCanBeReferenced(status string) bool {
	return status == model.PricingVersionStatusActive ||
		status == model.PricingVersionStatusExpired
}

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
		&input.BillingExpr,
	)
	if err := validateOfficialPriceCurrency(input.Currency); err != nil {
		return err
	}
	if err := validateExpressionMetadata(input.ExpressionSchemaVersion, input.BillingExpr); err != nil {
		return err
	}
	if err := validateCommonPrice(
		input.ModelId,
		input.BillingMode,
		input.PriceStructure,
		input.Currency,
		input.BillingExpr,
	); err != nil {
		return err
	}
	if err := validatePriceComponents(
		input.BillingMode,
		input.PriceStructure,
		input.PriceComponents,
	); err != nil {
		return err
	}
	input.ExprHash = billingexpr.ExprHashString(input.BillingExpr)
	input.ContentHash = officialPriceContentHash(*input)
	return model.DB.Transaction(func(tx *gorm.DB) error {
		if _, err := model.GetLogicalModelForUpdate(tx, input.ModelId); err != nil {
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

func UpdateOfficialPriceVersionDraft(
	id int,
	input *model.OfficialModelPriceVersion,
) (model.OfficialModelPriceVersion, error) {
	var updated model.OfficialModelPriceVersion
	if input == nil {
		return updated, errors.New("official price is required")
	}
	normalizeExpressionMetadata(
		&input.ExpressionSource,
		&input.ExpressionSchemaVersion,
		&input.Currency,
		&input.BillingExpr,
	)
	if err := validateOfficialPriceCurrency(input.Currency); err != nil {
		return updated, err
	}
	if err := validateExpressionMetadata(input.ExpressionSchemaVersion, input.BillingExpr); err != nil {
		return updated, err
	}
	if err := validateCommonPrice(
		input.ModelId,
		input.BillingMode,
		input.PriceStructure,
		input.Currency,
		input.BillingExpr,
	); err != nil {
		return updated, err
	}
	if err := validatePriceComponents(
		input.BillingMode,
		input.PriceStructure,
		input.PriceComponents,
	); err != nil {
		return updated, err
	}
	input.ExprHash = billingexpr.ExprHashString(input.BillingExpr)
	input.ContentHash = officialPriceContentHash(*input)
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		current, err := model.GetOfficialPriceVersionForUpdate(tx, id)
		if err != nil {
			return err
		}
		if current.Status != model.PricingVersionStatusDraft {
			return errors.New("only official price drafts can be updated")
		}
		if current.ModelId != input.ModelId {
			return errors.New("official price draft model cannot be changed")
		}
		updates := map[string]any{
			"billing_mode":              input.BillingMode,
			"price_structure":           input.PriceStructure,
			"price_components":          input.PriceComponents,
			"billing_expr":              input.BillingExpr,
			"expr_hash":                 input.ExprHash,
			"expression_source":         input.ExpressionSource,
			"expression_schema_version": input.ExpressionSchemaVersion,
			"currency":                  input.Currency,
			"content_hash":              input.ContentHash,
			"remark":                    strings.TrimSpace(input.Remark),
			"updated_at":                common.GetTimestamp(),
		}
		if err := tx.Model(&model.OfficialModelPriceVersion{}).
			Where("id = ? AND status = ?", id, model.PricingVersionStatusDraft).
			UpdateColumns(updates).Error; err != nil {
			return err
		}
		return tx.First(&updated, id).Error
	})
	return updated, err
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
		&input.PurchaseBillingExpr,
	)
	if err := validateExpressionMetadata(input.ExpressionSchemaVersion, input.PurchaseBillingExpr); err != nil {
		return err
	}
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
		channelModel, err := model.GetChannelModelForUpdate(tx, input.ChannelModelId)
		if err != nil {
			return err
		}
		if input.OfficialPriceVersionId != nil {
			var official model.OfficialModelPriceVersion
			if err := tx.First(&official, *input.OfficialPriceVersionId).Error; err != nil {
				return err
			}
			if official.ModelId != channelModel.ModelId {
				return errors.New("official price and channel model belong to different logical models")
			}
			if input.PricingMode == "official_ratio" ||
				input.PricingMode == "component_ratio" ||
				input.PricingMode == "hybrid" {
				if err := validatePurchaseOfficialBillingContract(*input, official); err != nil {
					return err
				}
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
		&input.RetailBillingExpr,
	)
	if err := validateExpressionMetadata(input.ExpressionSchemaVersion, input.RetailBillingExpr); err != nil {
		return err
	}
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
		if _, err := model.GetChannelModelForUpdate(tx, input.ChannelModelId); err != nil {
			return err
		}
		var purchase model.ChannelModelPurchasePriceVersion
		if err := tx.First(&purchase, input.PurchasePriceVersionId).Error; err != nil {
			return err
		}
		if purchase.ChannelModelId != input.ChannelModelId {
			return errors.New("purchase and retail versions belong to different channel models")
		}
		if !sameBillingContract(
			purchase.BillingMode,
			purchase.PriceStructure,
			purchase.Currency,
			input.BillingMode,
			input.PriceStructure,
			input.Currency,
		) {
			return errors.New("retail billing contract does not match purchase price")
		}
		if err := validateRetailPriceLimits(tx, purchase, *input); err != nil {
			return err
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
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		return publishOfficialPriceVersion(tx, id)
	})
	if err == nil {
		pricingruntime.InvalidateCatalog()
	}
	return err
}

type PublishLatestOfficialPriceDraftsResult struct {
	Published          int `json:"published"`
	SkippedUnsupported int `json:"skipped_unsupported"`
}

func PublishLatestOfficialPriceDrafts() (PublishLatestOfficialPriceDraftsResult, error) {
	var result PublishLatestOfficialPriceDraftsResult
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		var drafts []model.OfficialModelPriceVersion
		if err := tx.Where("status = ?", model.PricingVersionStatusDraft).
			Order("model_id ASC, version DESC").
			Find(&drafts).Error; err != nil {
			return err
		}
		latestDraftIds := make([]int, 0, len(drafts))
		seenModels := make(map[int]struct{}, len(drafts))
		for _, draft := range drafts {
			if _, exists := seenModels[draft.ModelId]; exists {
				continue
			}
			seenModels[draft.ModelId] = struct{}{}
			latestDraftIds = append(latestDraftIds, draft.Id)
		}
		for _, id := range latestDraftIds {
			if err := publishOfficialPriceVersion(tx, id); err != nil {
				return fmt.Errorf("publish official price draft %d: %w", id, err)
			}
			result.Published++
		}
		return nil
	})
	if err != nil {
		result.Published = 0
	} else {
		pricingruntime.InvalidateCatalog()
	}
	return result, err
}

func publishOfficialPriceVersion(tx *gorm.DB, id int) error {
	version, err := model.GetOfficialPriceVersionForUpdate(tx, id)
	if err != nil {
		return err
	}
	if version.Status != model.PricingVersionStatusDraft {
		return errors.New("only draft official prices can be published")
	}
	if err := validateExpressionMetadata(version.ExpressionSchemaVersion, version.BillingExpr); err != nil {
		return err
	}
	if version.ExprHash != "" &&
		version.ExprHash != billingexpr.ExprHashString(version.BillingExpr) {
		return errors.New("official price expression hash does not match")
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
}

func officialPriceContentHash(version model.OfficialModelPriceVersion) string {
	components := strings.TrimSpace(version.PriceComponents)
	if components != "" {
		var canonical any
		if err := common.UnmarshalJsonStr(components, &canonical); err == nil {
			if encoded, err := common.Marshal(canonical); err == nil {
				components = string(encoded)
			}
		}
	}
	payload := strings.Join([]string{
		strings.TrimSpace(version.BillingMode),
		strings.TrimSpace(version.PriceStructure),
		components,
		strings.TrimSpace(version.BillingExpr),
		strings.ToUpper(strings.TrimSpace(version.Currency)),
	}, "\x00")
	return fmt.Sprintf("%x", sha256.Sum256([]byte(payload)))
}

func validatePriceComponents(
	billingMode string,
	priceStructure string,
	components string,
) error {
	components = strings.TrimSpace(components)
	if components == "" {
		return nil
	}
	var parsed map[string]any
	if err := common.UnmarshalJsonStr(components, &parsed); err != nil {
		return fmt.Errorf("price_components must be a JSON object: %w", err)
	}
	return validateBusinessPriceRules(billingMode, priceStructure, parsed)
}

func validatePurchasePricePublication(
	tx *gorm.DB,
	version model.ChannelModelPurchasePriceVersion,
) error {
	if err := validateExpressionMetadata(version.ExpressionSchemaVersion, version.PurchaseBillingExpr); err != nil {
		return err
	}
	var channelModel model.ChannelModel
	if err := tx.First(&channelModel, version.ChannelModelId).Error; err != nil {
		return err
	}
	if channelModel.Status == 0 {
		return errors.New("disabled channel model cannot publish a purchase price")
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
	if !requiresOfficialPrice {
		return nil
	}
	var official model.OfficialModelPriceVersion
	if err := tx.First(&official, *version.OfficialPriceVersionId).Error; err != nil {
		return err
	}
	if !officialPriceCanBeReferenced(official.Status) {
		return errors.New("referenced official price must be published")
	}
	if official.ModelId != channelModel.ModelId {
		return errors.New("official price and channel model belong to different logical models")
	}
	return validatePurchaseOfficialBillingContract(version, official)
}

func validatePurchaseOfficialBillingContract(
	purchase model.ChannelModelPurchasePriceVersion,
	official model.OfficialModelPriceVersion,
) error {
	if !sameBillingContract(
		purchase.BillingMode,
		purchase.PriceStructure,
		purchase.Currency,
		official.BillingMode,
		official.PriceStructure,
		official.Currency,
	) {
		return errors.New("purchase billing contract does not match official price")
	}
	if purchase.PricingMode == "component_ratio" &&
		(official.BillingMode != "token" || official.PriceStructure != "flat") {
		return errors.New("component discounts require a flat token official price")
	}
	return nil
}

func sameBillingContract(
	leftBillingMode string,
	leftPriceStructure string,
	leftCurrency string,
	rightBillingMode string,
	rightPriceStructure string,
	rightCurrency string,
) bool {
	return leftBillingMode == rightBillingMode &&
		leftPriceStructure == rightPriceStructure &&
		leftCurrency == rightCurrency
}

func PublishPurchasePriceVersion(id int) error {
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		version, err := model.GetPurchasePriceVersionForUpdate(tx, id)
		if err != nil {
			return err
		}
		if version.Status != model.PricingVersionStatusDraft {
			return errors.New("only draft purchase prices can be published")
		}
		if err := validatePurchasePricePublication(tx, version); err != nil {
			return err
		}
		var activeRetailCount int64
		if err := tx.Model(&model.ChannelModelRetailPriceVersion{}).
			Where(
				"channel_model_id = ? AND status = ? AND purchase_price_version_id <> ?",
				version.ChannelModelId,
				model.PricingVersionStatusActive,
				version.Id,
			).
			Count(&activeRetailCount).Error; err != nil {
			return err
		}
		if activeRetailCount > 0 {
			return errors.New(
				"cannot replace purchase price while an active retail price references the current version",
			)
		}
		return model.ActivatePurchasePriceVersion(tx, version, common.GetTimestamp())
	})
	if err == nil {
		pricingruntime.InvalidateCatalog()
	}
	return err
}

func PublishRetailPriceVersion(id int) error {
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		version, err := model.GetRetailPriceVersionForUpdate(tx, id)
		if err != nil {
			return err
		}
		if version.Status != model.PricingVersionStatusDraft {
			return errors.New("only draft retail prices can be published")
		}
		if err := validateExpressionMetadata(version.ExpressionSchemaVersion, version.RetailBillingExpr); err != nil {
			return err
		}
		if version.RetailExprHash != "" &&
			version.RetailExprHash != billingexpr.ExprHashString(version.RetailBillingExpr) {
			return errors.New("retail price expression hash does not match")
		}
		purchase, err := model.GetPurchasePriceVersionForUpdate(tx, version.PurchasePriceVersionId)
		if err != nil {
			return err
		}
		if purchase.Status != model.PricingVersionStatusActive &&
			purchase.Status != model.PricingVersionStatusDraft {
			return errors.New("retail price requires an active or draft purchase price")
		}
		if purchase.ChannelModelId != version.ChannelModelId {
			return errors.New("purchase and retail versions belong to different channel models")
		}
		if !sameBillingContract(
			purchase.BillingMode,
			purchase.PriceStructure,
			purchase.Currency,
			version.BillingMode,
			version.PriceStructure,
			version.Currency,
		) {
			return errors.New("retail billing contract does not match purchase price")
		}
		if purchase.Status == model.PricingVersionStatusDraft {
			if err := validatePurchasePricePublication(tx, purchase); err != nil {
				return err
			}
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
		if err := validateRetailPriceLimits(tx, purchase, version); err != nil {
			return err
		}
		targetMargin, _ := validateRate("target_net_margin", version.TargetNetMargin)
		minimumMargin, _ := validateRate("minimum_margin_rate", version.MinimumMarginRate)
		if minimumMargin.GreaterThan(targetMargin) {
			return errors.New("retail price does not meet the configured minimum margin")
		}
		now := common.GetTimestamp()
		if purchase.Status == model.PricingVersionStatusDraft {
			if err := model.ActivatePurchasePriceVersion(tx, purchase, now); err != nil {
				return err
			}
		}
		return model.ActivateRetailPriceVersion(tx, version, now)
	})
	if err == nil {
		pricingruntime.InvalidateCatalog()
	}
	return err
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
		expressionVersion, expressionBody := billingexpr.ParseExprVersion(expression)
		if expressionVersion == 1 {
			expression = fmt.Sprintf("v2:(%s) / 1000000", expressionBody)
		} else {
			expression = "v2:" + expressionBody
		}
		priceStructure = "tiered"
	case billing_setting.BillingModePerRequest:
		price, ok := ratio_setting.GetModelPrice(logicalModel.ModelName, false)
		if !ok {
			return model.OfficialModelPriceVersion{}, false
		}
		billingMode = "request"
		expression = fmt.Sprintf(
			`v2:tier("legacy_import", req * %s)`,
			decimal.NewFromFloat(price).String(),
		)
		priceComponents["request_unit_price"] = decimal.NewFromFloat(price).String()
	case billing_setting.BillingModeVideoSecond:
		price, ok := ratio_setting.GetModelPrice(logicalModel.ModelName, false)
		if !ok {
			return model.OfficialModelPriceVersion{}, false
		}
		billingMode = "video_duration"
		expression = fmt.Sprintf(
			`v2:tier("legacy_import", video_s * %s)`,
			decimal.NewFromFloat(price).String(),
		)
		priceComponents["video_second_unit_price"] = decimal.NewFromFloat(price).String()
	default:
		ratio, ok, _ := ratio_setting.GetModelRatio(logicalModel.ModelName)
		if !ok {
			return model.OfficialModelPriceVersion{}, false
		}
		inputPrice := decimal.NewFromFloat(ratio).Mul(decimal.NewFromInt(2))
		outputPrice := inputPrice.Mul(decimal.NewFromFloat(ratio_setting.GetCompletionRatio(logicalModel.ModelName)))
		expression = fmt.Sprintf(
			`v2:(tier("legacy_import", p * %s + c * %s)) / 1000000`,
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
		ExpressionSchemaVersion: "v2",
		Currency:                "USD",
		Source:                  "legacy_import",
		SourceVersion:           "new-api-legacy",
		Remark:                  "Imported as draft; financial confirmation required before publication.",
	}, true
}

func normalizeExpressionMetadata(source *string, schemaVersion *string, currency *string, expression *string) {
	*source = strings.TrimSpace(*source)
	if *source == "" {
		*source = "generated"
	}
	*schemaVersion = strings.TrimSpace(*schemaVersion)
	if *schemaVersion == "" {
		*schemaVersion = "v2"
	}
	*currency = strings.ToUpper(strings.TrimSpace(*currency))
	*expression = strings.TrimSpace(*expression)
	if *expression == "" {
		return
	}
	if strings.HasPrefix(*expression, "v2:") {
		return
	}
	if hasExpressionVersionPrefix(*expression) {
		return
	}
	*expression = *schemaVersion + ":" + *expression
}

func validateOfficialPriceCurrency(currency string) error {
	if currency != "USD" {
		return errors.New("official price currency must be USD")
	}
	return nil
}

func validateExpressionMetadata(schemaVersion string, expression string) error {
	schemaVersion = strings.TrimSpace(schemaVersion)
	if schemaVersion != "v2" {
		return fmt.Errorf("unsupported expression schema version %q", schemaVersion)
	}
	expression = strings.TrimSpace(expression)
	expectedVersion := ""
	switch {
	case strings.HasPrefix(expression, "v2:"):
		expectedVersion = "v2"
	case hasExpressionVersionPrefix(expression):
		prefix := expression[:strings.IndexByte(expression, ':')]
		return fmt.Errorf("unsupported expression prefix %q", prefix)
	default:
		expectedVersion = "v2"
	}
	if schemaVersion != expectedVersion {
		return fmt.Errorf(
			"expression schema version %q does not match expression prefix %q",
			schemaVersion,
			expectedVersion,
		)
	}
	return nil
}

func hasExpressionVersionPrefix(expression string) bool {
	colon := strings.IndexByte(expression, ':')
	if colon < 2 || expression[0] != 'v' {
		return false
	}
	for _, char := range expression[1:colon] {
		if char < '0' || char > '9' {
			return false
		}
	}
	return true
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
	if currency != "USD" {
		return errors.New("pricing currency must be USD")
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
	if number.GreaterThan(maxPricingUnitPrice) {
		return fmt.Errorf("%s must not exceed %s USD", name, maxPricingUnitPrice)
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
