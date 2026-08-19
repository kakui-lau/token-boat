package pricingadmin

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type FlatTokenPriceInput struct {
	InputUnitPrice        string `json:"input_unit_price"`
	OutputUnitPrice       string `json:"output_unit_price"`
	CacheReadUnitPrice    string `json:"cache_read_unit_price"`
	CacheWriteUnitPrice   string `json:"cache_write_unit_price"`
	CacheWrite1HUnitPrice string `json:"cache_write_1h_unit_price"`
	ImageInputUnitPrice   string `json:"image_input_unit_price"`
	ImageOutputUnitPrice  string `json:"image_output_unit_price"`
	AudioInputUnitPrice   string `json:"audio_input_unit_price"`
	AudioOutputUnitPrice  string `json:"audio_output_unit_price"`
}

type OfficialFlatDraftInput struct {
	ModelId  int                 `json:"model_id"`
	Currency string              `json:"currency"`
	Prices   FlatTokenPriceInput `json:"prices"`
	Source   string              `json:"source"`
	Remark   string              `json:"remark"`
}

type PurchaseDraftInput struct {
	ChannelModelId         int                 `json:"channel_model_id"`
	OfficialPriceVersionId *int                `json:"official_price_version_id"`
	PricingMode            string              `json:"pricing_mode"`
	Currency               string              `json:"currency"`
	PurchaseDiscount       string              `json:"purchase_discount"`
	InputDiscount          string              `json:"input_discount"`
	OutputDiscount         string              `json:"output_discount"`
	CacheReadDiscount      string              `json:"cache_read_discount"`
	CacheWriteDiscount     string              `json:"cache_write_discount"`
	ImageInputDiscount     string              `json:"image_input_discount"`
	ImageOutputDiscount    string              `json:"image_output_discount"`
	AudioInputDiscount     string              `json:"audio_input_discount"`
	AudioOutputDiscount    string              `json:"audio_output_discount"`
	Prices                 FlatTokenPriceInput `json:"prices"`
	QuoteReference         string              `json:"quote_reference"`
	ContractReference      string              `json:"contract_reference"`
	Remark                 string              `json:"remark"`
	ExpectedUpdatedAt      int64               `json:"expected_updated_at"`
}

type RetailDraftInput struct {
	ChannelModelId         int    `json:"channel_model_id"`
	PurchasePriceVersionId int    `json:"purchase_price_version_id"`
	TotalVariableCostRate  string `json:"total_variable_cost_rate"`
	EffectiveTaxRate       string `json:"effective_tax_rate"`
	TargetNetMargin        string `json:"target_net_margin"`
	MinimumMarginRate      string `json:"minimum_margin_rate"`
	Remark                 string `json:"remark"`
	ExpectedUpdatedAt      int64  `json:"expected_updated_at"`
}

type flatTokenPriceComponents struct {
	InputUnitPrice        string `json:"input_unit_price,omitempty"`
	OutputUnitPrice       string `json:"output_unit_price,omitempty"`
	CacheReadUnitPrice    string `json:"cache_read_unit_price,omitempty"`
	CacheWriteUnitPrice   string `json:"cache_write_unit_price,omitempty"`
	CacheWrite1HUnitPrice string `json:"cache_write_1h_unit_price,omitempty"`
	ImageInputUnitPrice   string `json:"image_input_unit_price,omitempty"`
	ImageOutputUnitPrice  string `json:"image_output_unit_price,omitempty"`
	AudioInputUnitPrice   string `json:"audio_input_unit_price,omitempty"`
	AudioOutputUnitPrice  string `json:"audio_output_unit_price,omitempty"`
	PriceUnit             string `json:"price_unit"`
}

type purchaseDiscountSpec struct {
	InputDiscount       string `json:"input_discount,omitempty"`
	OutputDiscount      string `json:"output_discount,omitempty"`
	CacheReadDiscount   string `json:"cache_read_discount,omitempty"`
	CacheWriteDiscount  string `json:"cache_write_discount,omitempty"`
	ImageInputDiscount  string `json:"image_input_discount,omitempty"`
	ImageOutputDiscount string `json:"image_output_discount,omitempty"`
	AudioInputDiscount  string `json:"audio_input_discount,omitempty"`
	AudioOutputDiscount string `json:"audio_output_discount,omitempty"`
}

func CreateOfficialFlatDraft(input OfficialFlatDraftInput, userId int) (model.OfficialModelPriceVersion, error) {
	version, err := buildOfficialFlatDraft(input)
	if err != nil {
		return model.OfficialModelPriceVersion{}, err
	}
	if err := CreateOfficialPriceVersion(&version, userId); err != nil {
		return model.OfficialModelPriceVersion{}, err
	}
	return version, nil
}

func UpdateOfficialFlatDraft(id int, input OfficialFlatDraftInput) (model.OfficialModelPriceVersion, error) {
	replacement, err := buildOfficialFlatDraft(input)
	if err != nil {
		return model.OfficialModelPriceVersion{}, err
	}
	err = model.DB.Transaction(func(tx *gorm.DB) error {
		current, err := model.GetOfficialPriceVersionForUpdate(tx, id)
		if err != nil {
			return err
		}
		if current.Status != model.PricingVersionStatusDraft {
			return errors.New("only official price drafts can be updated")
		}
		if current.ModelId != replacement.ModelId {
			return errors.New("official price draft model cannot be changed")
		}
		replacement.Id = current.Id
		replacement.Version = current.Version
		replacement.Status = current.Status
		replacement.CreatedBy = current.CreatedBy
		replacement.CreatedAt = current.CreatedAt
		replacement.Source = current.Source
		replacement.ContentHash = officialPriceContentHash(replacement)
		if err := tx.Model(&replacement).Select(
			"billing_mode",
			"price_structure",
			"price_components",
			"billing_expr",
			"expr_hash",
			"expression_source",
			"expression_schema_version",
			"currency",
			"source",
			"content_hash",
			"remark",
			"updated_at",
		).Updates(&replacement).Error; err != nil {
			return err
		}
		return tx.First(&replacement, id).Error
	})
	return replacement, err
}

func buildOfficialFlatDraft(input OfficialFlatDraftInput) (model.OfficialModelPriceVersion, error) {
	_, expression, components, err := normalizeFlatTokenPrices(input.Prices)
	if err != nil {
		return model.OfficialModelPriceVersion{}, err
	}
	version := model.OfficialModelPriceVersion{
		ModelId:                 input.ModelId,
		BillingMode:             "token",
		PriceStructure:          "flat",
		PriceComponents:         components,
		BillingExpr:             expression,
		ExpressionSource:        "generated",
		ExpressionSchemaVersion: "v2",
		Currency:                input.Currency,
		Source:                  strings.TrimSpace(input.Source),
		Remark:                  strings.TrimSpace(input.Remark),
	}
	if version.Source == "" {
		version.Source = "manual"
	}
	normalizeExpressionMetadata(
		&version.ExpressionSource,
		&version.ExpressionSchemaVersion,
		&version.Currency,
		&version.BillingExpr,
	)
	if err := validateOfficialPriceCurrency(version.Currency); err != nil {
		return model.OfficialModelPriceVersion{}, err
	}
	if err := validateCommonPrice(
		version.ModelId,
		version.BillingMode,
		version.PriceStructure,
		version.Currency,
		version.BillingExpr,
	); err != nil {
		return model.OfficialModelPriceVersion{}, err
	}
	version.ExprHash = billingexpr.ExprHashString(version.BillingExpr)
	return version, nil
}

func CreatePurchaseDraft(input PurchaseDraftInput, userId int) (model.ChannelModelPurchasePriceVersion, error) {
	version, err := buildPurchaseDraft(input)
	if err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
	}
	if err := CreatePurchasePriceVersion(&version, userId); err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
	}
	return version, nil
}

func buildPurchaseDraft(input PurchaseDraftInput) (model.ChannelModelPurchasePriceVersion, error) {
	switch input.PricingMode {
	case "official_ratio":
		return buildOfficialRatioPurchaseDraft(input)
	case "component_ratio":
		return buildComponentRatioPurchaseDraft(input)
	case "fixed_unit_price":
		return buildFixedPurchaseDraft(input)
	default:
		return model.ChannelModelPurchasePriceVersion{}, fmt.Errorf(
			"structured purchase form does not support pricing mode %q",
			input.PricingMode,
		)
	}
}

func UpdatePurchaseDraft(id int, input PurchaseDraftInput) (model.ChannelModelPurchasePriceVersion, error) {
	if input.ExpectedUpdatedAt <= 0 {
		return model.ChannelModelPurchasePriceVersion{}, errors.New("expected_updated_at is required")
	}
	replacement, err := buildPurchaseDraft(input)
	if err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
	}
	var updated model.ChannelModelPurchasePriceVersion
	err = model.DB.Transaction(func(tx *gorm.DB) error {
		current, err := model.GetPurchasePriceVersionForUpdate(tx, id)
		if err != nil {
			return err
		}
		if current.Status != model.PricingVersionStatusDraft {
			return errors.New("only purchase price drafts can be updated")
		}
		if current.UpdatedAt != input.ExpectedUpdatedAt {
			return errors.New("purchase price draft was updated by another administrator; reload before saving")
		}
		if current.ChannelModelId != replacement.ChannelModelId {
			return errors.New("purchase price draft channel model cannot be changed")
		}
		if replacement.OfficialPriceVersionId != nil {
			var official model.OfficialModelPriceVersion
			if err := tx.First(&official, *replacement.OfficialPriceVersionId).Error; err != nil {
				return err
			}
			var channelModel model.ChannelModel
			if err := tx.First(&channelModel, replacement.ChannelModelId).Error; err != nil {
				return err
			}
			if official.ModelId != channelModel.ModelId {
				return errors.New("official price and channel model belong to different logical models")
			}
		}
		replacement.PurchaseExprHash = billingexpr.ExprHashString(replacement.PurchaseBillingExpr)
		updatedAt := common.GetTimestamp()
		if updatedAt <= current.UpdatedAt {
			updatedAt = current.UpdatedAt + 1
		}
		updates := map[string]any{
			"official_price_version_id": replacement.OfficialPriceVersionId,
			"billing_mode":              replacement.BillingMode,
			"pricing_mode":              replacement.PricingMode,
			"price_structure":           replacement.PriceStructure,
			"quote_spec":                replacement.QuoteSpec,
			"price_components":          replacement.PriceComponents,
			"purchase_discount":         replacement.PurchaseDiscount,
			"input_unit_price":          replacement.InputUnitPrice,
			"output_unit_price":         replacement.OutputUnitPrice,
			"cache_read_unit_price":     replacement.CacheReadUnitPrice,
			"cache_write_unit_price":    replacement.CacheWriteUnitPrice,
			"price_unit":                replacement.PriceUnit,
			"purchase_billing_expr":     replacement.PurchaseBillingExpr,
			"purchase_expr_hash":        replacement.PurchaseExprHash,
			"expression_source":         replacement.ExpressionSource,
			"expression_schema_version": replacement.ExpressionSchemaVersion,
			"currency":                  replacement.Currency,
			"quote_reference":           replacement.QuoteReference,
			"contract_reference":        replacement.ContractReference,
			"remark":                    replacement.Remark,
			"updated_at":                updatedAt,
		}
		if err := tx.Model(&model.ChannelModelPurchasePriceVersion{}).
			Where("id = ? AND status = ?", id, model.PricingVersionStatusDraft).
			UpdateColumns(updates).Error; err != nil {
			return err
		}
		return tx.First(&updated, id).Error
	})
	return updated, err
}

func CreateRetailDraft(input RetailDraftInput, userId int) (model.ChannelModelRetailPriceVersion, error) {
	version, err := buildRetailDraft(input)
	if err != nil {
		return model.ChannelModelRetailPriceVersion{}, err
	}
	if err := CreateRetailPriceVersion(&version, userId); err != nil {
		return model.ChannelModelRetailPriceVersion{}, err
	}
	return version, nil
}

func UpdateRetailDraft(id int, input RetailDraftInput) (model.ChannelModelRetailPriceVersion, error) {
	if input.ExpectedUpdatedAt <= 0 {
		return model.ChannelModelRetailPriceVersion{}, errors.New("expected_updated_at is required")
	}
	replacement, err := buildRetailDraft(input)
	if err != nil {
		return model.ChannelModelRetailPriceVersion{}, err
	}
	var updated model.ChannelModelRetailPriceVersion
	err = model.DB.Transaction(func(tx *gorm.DB) error {
		current, err := model.GetRetailPriceVersionForUpdate(tx, id)
		if err != nil {
			return err
		}
		if current.Status != model.PricingVersionStatusDraft {
			return errors.New("only retail price drafts can be updated")
		}
		if current.UpdatedAt != input.ExpectedUpdatedAt {
			return errors.New("retail price draft was updated by another administrator; reload before saving")
		}
		if current.ChannelModelId != replacement.ChannelModelId {
			return errors.New("retail price draft channel model cannot be changed")
		}
		var purchase model.ChannelModelPurchasePriceVersion
		if err := tx.First(&purchase, replacement.PurchasePriceVersionId).Error; err != nil {
			return err
		}
		if err := validateRetailPriceLimits(tx, purchase, replacement); err != nil {
			return err
		}
		replacement.RetailExprHash = billingexpr.ExprHashString(replacement.RetailBillingExpr)
		updatedAt := common.GetTimestamp()
		if updatedAt <= current.UpdatedAt {
			updatedAt = current.UpdatedAt + 1
		}
		updates := map[string]any{
			"purchase_price_version_id": replacement.PurchasePriceVersionId,
			"billing_mode":              replacement.BillingMode,
			"price_structure":           replacement.PriceStructure,
			"price_components":          replacement.PriceComponents,
			"input_unit_price":          replacement.InputUnitPrice,
			"output_unit_price":         replacement.OutputUnitPrice,
			"cache_read_unit_price":     replacement.CacheReadUnitPrice,
			"cache_write_unit_price":    replacement.CacheWriteUnitPrice,
			"price_unit":                replacement.PriceUnit,
			"retail_billing_expr":       replacement.RetailBillingExpr,
			"retail_expr_hash":          replacement.RetailExprHash,
			"expression_source":         replacement.ExpressionSource,
			"expression_schema_version": replacement.ExpressionSchemaVersion,
			"currency":                  replacement.Currency,
			"total_variable_cost_rate":  replacement.TotalVariableCostRate,
			"effective_tax_rate":        replacement.EffectiveTaxRate,
			"target_net_margin":         replacement.TargetNetMargin,
			"minimum_margin_rate":       replacement.MinimumMarginRate,
			"remark":                    replacement.Remark,
			"updated_at":                updatedAt,
		}
		if err := tx.Model(&model.ChannelModelRetailPriceVersion{}).
			Where("id = ? AND status = ?", id, model.PricingVersionStatusDraft).
			UpdateColumns(updates).Error; err != nil {
			return err
		}
		return tx.First(&updated, id).Error
	})
	return updated, err
}

func buildRetailDraft(input RetailDraftInput) (model.ChannelModelRetailPriceVersion, error) {
	var purchase model.ChannelModelPurchasePriceVersion
	if err := model.DB.First(&purchase, input.PurchasePriceVersionId).Error; err != nil {
		return model.ChannelModelRetailPriceVersion{}, err
	}
	return BuildRetailPricePreview(input, purchase)
}

// BuildRetailPricePreview applies the same retail pricing rules used by draft
// creation without persisting a new price version.
func BuildRetailPricePreview(
	input RetailDraftInput,
	purchase model.ChannelModelPurchasePriceVersion,
) (model.ChannelModelRetailPriceVersion, error) {
	if purchase.ChannelModelId != input.ChannelModelId {
		return model.ChannelModelRetailPriceVersion{}, errors.New(
			"purchase and retail versions belong to different channel models",
		)
	}
	calculator, err := NewRetailPriceCalculator(
		input.TotalVariableCostRate,
		input.EffectiveTaxRate,
		input.TargetNetMargin,
	)
	if err != nil {
		return model.ChannelModelRetailPriceVersion{}, err
	}
	if _, err := validateRate("minimum_margin_rate", input.MinimumMarginRate); err != nil {
		return model.ChannelModelRetailPriceVersion{}, err
	}
	if _, err := calculator.SellingFactor(); err != nil {
		return model.ChannelModelRetailPriceVersion{}, err
	}
	if purchase.BillingMode != "token" || purchase.PriceStructure != "flat" {
		return buildExpressionRetailDraft(input, purchase, calculator)
	}
	purchasePrices, err := unmarshalFlatPriceComponents(purchase.PriceComponents)
	if err != nil {
		return model.ChannelModelRetailPriceVersion{}, err
	}
	retailPrices, err := calculateRetailFlatPrices(purchasePrices, calculator)
	if err != nil {
		return model.ChannelModelRetailPriceVersion{}, err
	}
	_, retailExpression, componentsJSON, err := normalizeFlatTokenPrices(retailPrices)
	if err != nil {
		return model.ChannelModelRetailPriceVersion{}, err
	}
	version := model.ChannelModelRetailPriceVersion{
		ChannelModelId:          input.ChannelModelId,
		PurchasePriceVersionId:  input.PurchasePriceVersionId,
		BillingMode:             purchase.BillingMode,
		PriceStructure:          purchase.PriceStructure,
		PriceComponents:         componentsJSON,
		InputUnitPrice:          retailPrices.InputUnitPrice,
		OutputUnitPrice:         retailPrices.OutputUnitPrice,
		CacheReadUnitPrice:      retailPrices.CacheReadUnitPrice,
		CacheWriteUnitPrice:     retailPrices.CacheWriteUnitPrice,
		PriceUnit:               purchase.PriceUnit,
		RetailBillingExpr:       retailExpression,
		ExpressionSource:        "generated",
		ExpressionSchemaVersion: "v2",
		Currency:                purchase.Currency,
		TotalVariableCostRate:   input.TotalVariableCostRate,
		EffectiveTaxRate:        input.EffectiveTaxRate,
		TargetNetMargin:         input.TargetNetMargin,
		MinimumMarginRate:       input.MinimumMarginRate,
		Remark:                  strings.TrimSpace(input.Remark),
	}
	return version, nil
}

func calculateRetailFlatPrices(
	input FlatTokenPriceInput,
	calculator RetailPriceCalculator,
) (FlatTokenPriceInput, error) {
	result := FlatTokenPriceInput{}
	type component struct {
		name   string
		value  string
		target *string
	}
	components := []component{
		{"input_unit_price", input.InputUnitPrice, &result.InputUnitPrice},
		{"output_unit_price", input.OutputUnitPrice, &result.OutputUnitPrice},
		{"cache_read_unit_price", input.CacheReadUnitPrice, &result.CacheReadUnitPrice},
		{"cache_write_unit_price", input.CacheWriteUnitPrice, &result.CacheWriteUnitPrice},
		{"cache_write_1h_unit_price", input.CacheWrite1HUnitPrice, &result.CacheWrite1HUnitPrice},
		{"image_input_unit_price", input.ImageInputUnitPrice, &result.ImageInputUnitPrice},
		{"image_output_unit_price", input.ImageOutputUnitPrice, &result.ImageOutputUnitPrice},
		{"audio_input_unit_price", input.AudioInputUnitPrice, &result.AudioInputUnitPrice},
		{"audio_output_unit_price", input.AudioOutputUnitPrice, &result.AudioOutputUnitPrice},
	}
	for _, item := range components {
		if strings.TrimSpace(item.value) == "" {
			continue
		}
		procurementCost, err := decimal.NewFromString(item.value)
		if err != nil {
			return result, fmt.Errorf("%s is invalid: %w", item.name, err)
		}
		sellingPrice, err := calculator.CalculateSellingPrice(procurementCost)
		if err != nil {
			return result, err
		}
		*item.target = sellingPrice.StringFixed(retailSellingPriceDecimalPlaces)
	}
	return result, nil
}

func buildExpressionRetailDraft(
	input RetailDraftInput,
	purchase model.ChannelModelPurchasePriceVersion,
	calculator RetailPriceCalculator,
) (model.ChannelModelRetailPriceVersion, error) {
	factor, err := calculator.SellingFactor()
	if err != nil {
		return model.ChannelModelRetailPriceVersion{}, err
	}
	expression, err := scaleBillingExpression(purchase.PurchaseBillingExpr, factor)
	if err != nil {
		return model.ChannelModelRetailPriceVersion{}, err
	}
	componentsJSON, err := scalePriceComponents(
		purchase.PriceComponents,
		factor,
		true,
	)
	if err != nil {
		return model.ChannelModelRetailPriceVersion{}, err
	}
	version := model.ChannelModelRetailPriceVersion{
		ChannelModelId:          input.ChannelModelId,
		PurchasePriceVersionId:  input.PurchasePriceVersionId,
		BillingMode:             purchase.BillingMode,
		PriceStructure:          purchase.PriceStructure,
		PriceComponents:         componentsJSON,
		PriceUnit:               purchase.PriceUnit,
		RetailBillingExpr:       expression,
		ExpressionSource:        "generated",
		ExpressionSchemaVersion: "v2",
		Currency:                purchase.Currency,
		TotalVariableCostRate:   input.TotalVariableCostRate,
		EffectiveTaxRate:        input.EffectiveTaxRate,
		TargetNetMargin:         input.TargetNetMargin,
		MinimumMarginRate:       input.MinimumMarginRate,
		Remark:                  strings.TrimSpace(input.Remark),
	}
	return version, nil
}

func buildOfficialRatioPurchaseDraft(input PurchaseDraftInput) (model.ChannelModelPurchasePriceVersion, error) {
	official, err := requireOfficialPrice(input.OfficialPriceVersionId)
	if err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
	}
	discount, err := parseRequiredPositiveDecimal("purchase_discount", input.PurchaseDiscount)
	if err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
	}
	expression, err := scaleBillingExpression(official.BillingExpr, discount)
	if err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
	}
	if official.BillingMode != "token" || official.PriceStructure != "flat" {
		componentsJSON, err := scalePriceComponents(
			official.PriceComponents,
			discount,
			false,
		)
		if err != nil {
			return model.ChannelModelPurchasePriceVersion{}, err
		}
		return buildExpressionPurchaseDraft(
			input,
			official,
			componentsJSON,
			expression,
			discount.String(),
		)
	}
	officialPrices, err := unmarshalFlatPriceComponents(official.PriceComponents)
	if err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
	}
	prices, err := scaleFlatPrices(officialPrices, discount)
	if err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
	}
	return buildFlatPurchaseDraft(input, official, prices, expression, input.PurchaseDiscount)
}

func buildComponentRatioPurchaseDraft(input PurchaseDraftInput) (model.ChannelModelPurchasePriceVersion, error) {
	official, err := requireOfficialPrice(input.OfficialPriceVersionId)
	if err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
	}
	if official.BillingMode != "token" || official.PriceStructure != "flat" {
		return model.ChannelModelPurchasePriceVersion{}, errors.New(
			"component discounts require a flat token official price",
		)
	}
	officialPrices, err := unmarshalFlatPriceComponents(official.PriceComponents)
	if err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
	}
	prices, err := applyComponentDiscounts(officialPrices, input)
	if err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
	}
	_, expression, _, err := normalizeFlatTokenPrices(prices)
	if err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
	}
	return buildFlatPurchaseDraft(input, official, prices, expression, "")
}

func buildExpressionPurchaseDraft(
	input PurchaseDraftInput,
	official model.OfficialModelPriceVersion,
	componentsJSON string,
	expression string,
	discount string,
) (model.ChannelModelPurchasePriceVersion, error) {
	quoteSpec, err := buildPurchaseDiscountSpec(input)
	if err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
	}
	version := model.ChannelModelPurchasePriceVersion{
		ChannelModelId:          input.ChannelModelId,
		OfficialPriceVersionId:  input.OfficialPriceVersionId,
		BillingMode:             official.BillingMode,
		PricingMode:             input.PricingMode,
		PriceStructure:          official.PriceStructure,
		QuoteSpec:               quoteSpec,
		PriceComponents:         componentsJSON,
		PurchaseDiscount:        discount,
		PriceUnit:               "expression",
		PurchaseBillingExpr:     expression,
		ExpressionSource:        "generated",
		ExpressionSchemaVersion: "v2",
		Currency:                official.Currency,
		QuoteReference:          strings.TrimSpace(input.QuoteReference),
		ContractReference:       strings.TrimSpace(input.ContractReference),
		Remark:                  strings.TrimSpace(input.Remark),
	}
	return version, nil
}

func buildFixedPurchaseDraft(input PurchaseDraftInput) (model.ChannelModelPurchasePriceVersion, error) {
	prices, expression, _, err := normalizeFlatTokenPrices(input.Prices)
	if err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
	}
	official := model.OfficialModelPriceVersion{
		BillingMode:             "token",
		PriceStructure:          "flat",
		ExpressionSchemaVersion: "v2",
		Currency:                strings.ToUpper(strings.TrimSpace(input.Currency)),
	}
	if official.Currency == "" {
		official.Currency = "USD"
	}
	if input.OfficialPriceVersionId != nil {
		if err := model.DB.First(&official, *input.OfficialPriceVersionId).Error; err != nil {
			return model.ChannelModelPurchasePriceVersion{}, err
		}
	}
	return buildFlatPurchaseDraft(input, official, prices, expression, "")
}

func buildFlatPurchaseDraft(
	input PurchaseDraftInput,
	official model.OfficialModelPriceVersion,
	prices FlatTokenPriceInput,
	expression string,
	discount string,
) (model.ChannelModelPurchasePriceVersion, error) {
	componentsJSON, err := marshalFlatPriceComponents(prices)
	if err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
	}
	quoteSpec, err := buildPurchaseDiscountSpec(input)
	if err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
	}
	version := model.ChannelModelPurchasePriceVersion{
		ChannelModelId:          input.ChannelModelId,
		OfficialPriceVersionId:  input.OfficialPriceVersionId,
		BillingMode:             official.BillingMode,
		PricingMode:             input.PricingMode,
		PriceStructure:          "flat",
		QuoteSpec:               quoteSpec,
		PriceComponents:         componentsJSON,
		PurchaseDiscount:        discount,
		InputUnitPrice:          prices.InputUnitPrice,
		OutputUnitPrice:         prices.OutputUnitPrice,
		CacheReadUnitPrice:      prices.CacheReadUnitPrice,
		CacheWriteUnitPrice:     prices.CacheWriteUnitPrice,
		PriceUnit:               "per_1m_tokens",
		PurchaseBillingExpr:     expression,
		ExpressionSource:        "generated",
		ExpressionSchemaVersion: "v2",
		Currency:                official.Currency,
		QuoteReference:          strings.TrimSpace(input.QuoteReference),
		ContractReference:       strings.TrimSpace(input.ContractReference),
		Remark:                  strings.TrimSpace(input.Remark),
	}
	return version, nil
}

func buildPurchaseDiscountSpec(input PurchaseDraftInput) (string, error) {
	if input.PricingMode != "component_ratio" {
		return "", nil
	}
	data, err := common.Marshal(purchaseDiscountSpec{
		InputDiscount:       input.InputDiscount,
		OutputDiscount:      input.OutputDiscount,
		CacheReadDiscount:   input.CacheReadDiscount,
		CacheWriteDiscount:  input.CacheWriteDiscount,
		ImageInputDiscount:  input.ImageInputDiscount,
		ImageOutputDiscount: input.ImageOutputDiscount,
		AudioInputDiscount:  input.AudioInputDiscount,
		AudioOutputDiscount: input.AudioOutputDiscount,
	})
	return string(data), err
}

func normalizeFlatTokenPrices(input FlatTokenPriceInput) (FlatTokenPriceInput, string, string, error) {
	prices := FlatTokenPriceInput{}
	var err error
	prices.InputUnitPrice, err = normalizeOptionalPrice("input_unit_price", input.InputUnitPrice)
	if err != nil {
		return prices, "", "", err
	}
	prices.OutputUnitPrice, err = normalizeOptionalPrice("output_unit_price", input.OutputUnitPrice)
	if err != nil {
		return prices, "", "", err
	}
	prices.CacheReadUnitPrice, err = normalizeOptionalPrice("cache_read_unit_price", input.CacheReadUnitPrice)
	if err != nil {
		return prices, "", "", err
	}
	prices.CacheWriteUnitPrice, err = normalizeOptionalPrice("cache_write_unit_price", input.CacheWriteUnitPrice)
	if err != nil {
		return prices, "", "", err
	}
	prices.CacheWrite1HUnitPrice, err = normalizeOptionalPrice("cache_write_1h_unit_price", input.CacheWrite1HUnitPrice)
	if err != nil {
		return prices, "", "", err
	}
	prices.ImageInputUnitPrice, err = normalizeOptionalPrice("image_input_unit_price", input.ImageInputUnitPrice)
	if err != nil {
		return prices, "", "", err
	}
	prices.ImageOutputUnitPrice, err = normalizeOptionalPrice("image_output_unit_price", input.ImageOutputUnitPrice)
	if err != nil {
		return prices, "", "", err
	}
	prices.AudioInputUnitPrice, err = normalizeOptionalPrice("audio_input_unit_price", input.AudioInputUnitPrice)
	if err != nil {
		return prices, "", "", err
	}
	prices.AudioOutputUnitPrice, err = normalizeOptionalPrice("audio_output_unit_price", input.AudioOutputUnitPrice)
	if err != nil {
		return prices, "", "", err
	}
	if prices.InputUnitPrice == "" && prices.OutputUnitPrice == "" &&
		prices.CacheReadUnitPrice == "" && prices.CacheWriteUnitPrice == "" && prices.CacheWrite1HUnitPrice == "" &&
		prices.ImageInputUnitPrice == "" && prices.ImageOutputUnitPrice == "" &&
		prices.AudioInputUnitPrice == "" && prices.AudioOutputUnitPrice == "" {
		return prices, "", "", errors.New("at least one unit price is required")
	}
	terms := make([]string, 0, 4)
	if prices.InputUnitPrice != "" {
		terms = append(terms, "p * "+prices.InputUnitPrice)
	}
	if prices.OutputUnitPrice != "" {
		terms = append(terms, "c * "+prices.OutputUnitPrice)
	}
	if prices.CacheReadUnitPrice != "" {
		terms = append(terms, "cr * "+prices.CacheReadUnitPrice)
	}
	if prices.CacheWriteUnitPrice != "" {
		terms = append(terms, "cc * "+prices.CacheWriteUnitPrice)
	}
	if prices.CacheWrite1HUnitPrice != "" {
		terms = append(terms, "cc1h * "+prices.CacheWrite1HUnitPrice)
	}
	if prices.ImageInputUnitPrice != "" {
		terms = append(terms, "img * "+prices.ImageInputUnitPrice)
	}
	if prices.ImageOutputUnitPrice != "" {
		terms = append(terms, "img_o * "+prices.ImageOutputUnitPrice)
	}
	if prices.AudioInputUnitPrice != "" {
		terms = append(terms, "ai * "+prices.AudioInputUnitPrice)
	}
	if prices.AudioOutputUnitPrice != "" {
		terms = append(terms, "ao * "+prices.AudioOutputUnitPrice)
	}
	expression := `v2:(tier("base", ` + strings.Join(terms, " + ") + ")) / 1000000"
	components, err := marshalFlatPriceComponents(prices)
	return prices, expression, components, err
}

func marshalFlatPriceComponents(prices FlatTokenPriceInput) (string, error) {
	data, err := common.Marshal(flatTokenPriceComponents{
		InputUnitPrice:        prices.InputUnitPrice,
		OutputUnitPrice:       prices.OutputUnitPrice,
		CacheReadUnitPrice:    prices.CacheReadUnitPrice,
		CacheWriteUnitPrice:   prices.CacheWriteUnitPrice,
		CacheWrite1HUnitPrice: prices.CacheWrite1HUnitPrice,
		ImageInputUnitPrice:   prices.ImageInputUnitPrice,
		ImageOutputUnitPrice:  prices.ImageOutputUnitPrice,
		AudioInputUnitPrice:   prices.AudioInputUnitPrice,
		AudioOutputUnitPrice:  prices.AudioOutputUnitPrice,
		PriceUnit:             "per_1m_tokens",
	})
	return string(data), err
}

func unmarshalFlatPriceComponents(raw string) (FlatTokenPriceInput, error) {
	var components flatTokenPriceComponents
	if err := common.UnmarshalJsonStr(raw, &components); err != nil {
		return FlatTokenPriceInput{}, fmt.Errorf("official flat price components are invalid: %w", err)
	}
	return FlatTokenPriceInput{
		InputUnitPrice:        components.InputUnitPrice,
		OutputUnitPrice:       components.OutputUnitPrice,
		CacheReadUnitPrice:    components.CacheReadUnitPrice,
		CacheWriteUnitPrice:   components.CacheWriteUnitPrice,
		CacheWrite1HUnitPrice: components.CacheWrite1HUnitPrice,
		ImageInputUnitPrice:   components.ImageInputUnitPrice,
		ImageOutputUnitPrice:  components.ImageOutputUnitPrice,
		AudioInputUnitPrice:   components.AudioInputUnitPrice,
		AudioOutputUnitPrice:  components.AudioOutputUnitPrice,
	}, nil
}

func scaleFlatPrices(input FlatTokenPriceInput, factor decimal.Decimal) (FlatTokenPriceInput, error) {
	result := FlatTokenPriceInput{}
	var err error
	result.InputUnitPrice, err = scaleOptionalPrice(input.InputUnitPrice, factor)
	if err != nil {
		return result, err
	}
	result.OutputUnitPrice, err = scaleOptionalPrice(input.OutputUnitPrice, factor)
	if err != nil {
		return result, err
	}
	result.CacheReadUnitPrice, err = scaleOptionalPrice(input.CacheReadUnitPrice, factor)
	if err != nil {
		return result, err
	}
	result.CacheWriteUnitPrice, err = scaleOptionalPrice(input.CacheWriteUnitPrice, factor)
	if err != nil {
		return result, err
	}
	result.CacheWrite1HUnitPrice, err = scaleOptionalPrice(input.CacheWrite1HUnitPrice, factor)
	if err != nil {
		return result, err
	}
	result.ImageInputUnitPrice, err = scaleOptionalPrice(input.ImageInputUnitPrice, factor)
	if err != nil {
		return result, err
	}
	result.ImageOutputUnitPrice, err = scaleOptionalPrice(input.ImageOutputUnitPrice, factor)
	if err != nil {
		return result, err
	}
	result.AudioInputUnitPrice, err = scaleOptionalPrice(input.AudioInputUnitPrice, factor)
	if err != nil {
		return result, err
	}
	result.AudioOutputUnitPrice, err = scaleOptionalPrice(input.AudioOutputUnitPrice, factor)
	return result, err
}

func applyComponentDiscounts(official FlatTokenPriceInput, input PurchaseDraftInput) (FlatTokenPriceInput, error) {
	type component struct {
		name     string
		price    string
		discount string
		target   *string
	}
	result := FlatTokenPriceInput{}
	components := []component{
		{"input", official.InputUnitPrice, input.InputDiscount, &result.InputUnitPrice},
		{"output", official.OutputUnitPrice, input.OutputDiscount, &result.OutputUnitPrice},
		{"cache_read", official.CacheReadUnitPrice, input.CacheReadDiscount, &result.CacheReadUnitPrice},
		{"cache_write", official.CacheWriteUnitPrice, input.CacheWriteDiscount, &result.CacheWriteUnitPrice},
		{"cache_write_1h", official.CacheWrite1HUnitPrice, input.CacheWriteDiscount, &result.CacheWrite1HUnitPrice},
		{"image_input", official.ImageInputUnitPrice, input.ImageInputDiscount, &result.ImageInputUnitPrice},
		{"image_output", official.ImageOutputUnitPrice, input.ImageOutputDiscount, &result.ImageOutputUnitPrice},
		{"audio_input", official.AudioInputUnitPrice, input.AudioInputDiscount, &result.AudioInputUnitPrice},
		{"audio_output", official.AudioOutputUnitPrice, input.AudioOutputDiscount, &result.AudioOutputUnitPrice},
	}
	for _, item := range components {
		if item.price == "" {
			continue
		}
		discount, err := parseRequiredPositiveDecimal(item.name+"_discount", item.discount)
		if err != nil {
			return result, err
		}
		scaled, err := scaleOptionalPrice(item.price, discount)
		if err != nil {
			return result, err
		}
		*item.target = scaled
	}
	return result, nil
}

func requireOfficialPrice(id *int) (model.OfficialModelPriceVersion, error) {
	if id == nil || *id <= 0 {
		return model.OfficialModelPriceVersion{}, errors.New("official price version is required")
	}
	var official model.OfficialModelPriceVersion
	if err := model.DB.First(&official, *id).Error; err != nil {
		return official, err
	}
	if !officialPriceCanBeReferenced(official.Status) {
		return official, errors.New("official price version must be published")
	}
	return official, nil
}

func scaleBillingExpression(expression string, factor decimal.Decimal) (string, error) {
	version, body := billingexpr.ParseExprVersion(expression)
	if version != 2 {
		return "", errors.New("pricing expressions must use schema v2")
	}
	return fmt.Sprintf("v2:(%s) * %s", body, factor.String()), nil
}

func normalizeOptionalPrice(name string, value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", nil
	}
	number, err := decimal.NewFromString(value)
	if err != nil {
		return "", fmt.Errorf("%s is invalid: %w", name, err)
	}
	if number.IsNegative() {
		return "", fmt.Errorf("%s cannot be negative", name)
	}
	if number.GreaterThan(maxPricingUnitPrice) {
		return "", fmt.Errorf("%s must not exceed %s USD", name, maxPricingUnitPrice)
	}
	return number.String(), nil
}

func scaleOptionalPrice(value string, factor decimal.Decimal) (string, error) {
	if strings.TrimSpace(value) == "" {
		return "", nil
	}
	number, err := decimal.NewFromString(value)
	if err != nil {
		return "", err
	}
	return number.Mul(factor).String(), nil
}

func scalePriceComponents(
	raw string,
	factor decimal.Decimal,
	roundRetailPrice bool,
) (string, error) {
	var components map[string]any
	if err := common.UnmarshalJsonStr(raw, &components); err != nil {
		return "", fmt.Errorf("price components are invalid: %w", err)
	}
	var scaleValue func(value any, key string) (any, error)
	scaleValue = func(value any, key string) (any, error) {
		switch typed := value.(type) {
		case map[string]any:
			for childKey, childValue := range typed {
				scaled, err := scaleValue(childValue, childKey)
				if err != nil {
					return nil, err
				}
				typed[childKey] = scaled
			}
			return typed, nil
		case []any:
			for index, childValue := range typed {
				scaled, err := scaleValue(childValue, key)
				if err != nil {
					return nil, err
				}
				typed[index] = scaled
			}
			return typed, nil
		case string:
			if key != "unit_price" && !strings.HasSuffix(key, "_unit_price") {
				return typed, nil
			}
			trimmed := strings.TrimSpace(typed)
			if trimmed == "" {
				return "", nil
			}
			number, err := decimal.NewFromString(trimmed)
			if err != nil {
				return nil, fmt.Errorf("%s is invalid: %w", key, err)
			}
			if number.IsNegative() {
				return nil, fmt.Errorf("%s cannot be negative", key)
			}
			scaled := number.Mul(factor)
			if scaled.GreaterThan(maxPricingUnitPrice) {
				return nil, fmt.Errorf("%s must not exceed %s USD", key, maxPricingUnitPrice)
			}
			if roundRetailPrice {
				scaled = scaled.RoundCeil(retailSellingPriceDecimalPlaces)
				return scaled.StringFixed(retailSellingPriceDecimalPlaces), nil
			}
			return scaled.String(), nil
		default:
			return typed, nil
		}
	}
	scaled, err := scaleValue(components, "")
	if err != nil {
		return "", err
	}
	encoded, err := common.Marshal(scaled)
	return string(encoded), err
}

func parseRequiredPositiveDecimal(name string, value string) (decimal.Decimal, error) {
	number, err := decimal.NewFromString(strings.TrimSpace(value))
	if err != nil {
		return decimal.Zero, fmt.Errorf("%s is invalid: %w", name, err)
	}
	if !number.IsPositive() {
		return decimal.Zero, fmt.Errorf("%s must be positive", name)
	}
	return number, nil
}
