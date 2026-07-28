package pricingadmin

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/shopspring/decimal"
)

type FlatTokenPriceInput struct {
	InputUnitPrice       string `json:"input_unit_price"`
	OutputUnitPrice      string `json:"output_unit_price"`
	CacheReadUnitPrice   string `json:"cache_read_unit_price"`
	CacheWriteUnitPrice  string `json:"cache_write_unit_price"`
	ImageInputUnitPrice  string `json:"image_input_unit_price"`
	ImageOutputUnitPrice string `json:"image_output_unit_price"`
	AudioInputUnitPrice  string `json:"audio_input_unit_price"`
	AudioOutputUnitPrice string `json:"audio_output_unit_price"`
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
}

type RetailDraftInput struct {
	ChannelModelId         int    `json:"channel_model_id"`
	PurchasePriceVersionId int    `json:"purchase_price_version_id"`
	TotalVariableCostRate  string `json:"total_variable_cost_rate"`
	EffectiveTaxRate       string `json:"effective_tax_rate"`
	TargetNetMargin        string `json:"target_net_margin"`
	MinimumMarginRate      string `json:"minimum_margin_rate"`
	Remark                 string `json:"remark"`
}

type flatTokenPriceComponents struct {
	InputUnitPrice       string `json:"input_unit_price,omitempty"`
	OutputUnitPrice      string `json:"output_unit_price,omitempty"`
	CacheReadUnitPrice   string `json:"cache_read_unit_price,omitempty"`
	CacheWriteUnitPrice  string `json:"cache_write_unit_price,omitempty"`
	ImageInputUnitPrice  string `json:"image_input_unit_price,omitempty"`
	ImageOutputUnitPrice string `json:"image_output_unit_price,omitempty"`
	AudioInputUnitPrice  string `json:"audio_input_unit_price,omitempty"`
	AudioOutputUnitPrice string `json:"audio_output_unit_price,omitempty"`
	PriceUnit            string `json:"price_unit"`
}

func CreateOfficialFlatDraft(input OfficialFlatDraftInput, userId int) (model.OfficialModelPriceVersion, error) {
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
		ExpressionSchemaVersion: "v1",
		Currency:                input.Currency,
		Source:                  strings.TrimSpace(input.Source),
		Remark:                  strings.TrimSpace(input.Remark),
	}
	if version.Source == "" {
		version.Source = "manual"
	}
	if err := CreateOfficialPriceVersion(&version, userId); err != nil {
		return model.OfficialModelPriceVersion{}, err
	}
	return version, nil
}

func CreatePurchaseDraft(input PurchaseDraftInput, userId int) (model.ChannelModelPurchasePriceVersion, error) {
	switch input.PricingMode {
	case "official_ratio":
		return createOfficialRatioPurchaseDraft(input, userId)
	case "component_ratio":
		return createComponentRatioPurchaseDraft(input, userId)
	case "fixed_unit_price":
		return createFixedPurchaseDraft(input, userId)
	default:
		return model.ChannelModelPurchasePriceVersion{}, fmt.Errorf(
			"structured purchase form does not support pricing mode %q",
			input.PricingMode,
		)
	}
}

func CreateRetailDraft(input RetailDraftInput, userId int) (model.ChannelModelRetailPriceVersion, error) {
	var purchase model.ChannelModelPurchasePriceVersion
	if err := model.DB.First(&purchase, input.PurchasePriceVersionId).Error; err != nil {
		return model.ChannelModelRetailPriceVersion{}, err
	}
	if purchase.ChannelModelId != input.ChannelModelId {
		return model.ChannelModelRetailPriceVersion{}, errors.New(
			"purchase and retail versions belong to different channel models",
		)
	}
	vcr, err := validateRate("total_variable_cost_rate", input.TotalVariableCostRate)
	if err != nil {
		return model.ChannelModelRetailPriceVersion{}, err
	}
	tax, err := validateRate("effective_tax_rate", input.EffectiveTaxRate)
	if err != nil {
		return model.ChannelModelRetailPriceVersion{}, err
	}
	margin, err := validateRate("target_net_margin", input.TargetNetMargin)
	if err != nil {
		return model.ChannelModelRetailPriceVersion{}, err
	}
	if _, err := validateRate("minimum_margin_rate", input.MinimumMarginRate); err != nil {
		return model.ChannelModelRetailPriceVersion{}, err
	}
	denominator := decimal.NewFromInt(1).Sub(vcr).
		Mul(decimal.NewFromInt(1).Sub(tax)).
		Sub(margin)
	if !denominator.IsPositive() {
		return model.ChannelModelRetailPriceVersion{}, errors.New(
			"VCR, tax rate and target margin produce a non-positive retail denominator",
		)
	}
	factor := decimal.NewFromInt(1).Sub(tax).Div(denominator)
	retailExpression, err := scaleBillingExpression(purchase.PurchaseBillingExpr, factor)
	if err != nil {
		return model.ChannelModelRetailPriceVersion{}, err
	}
	purchasePrices, err := unmarshalFlatPriceComponents(purchase.PriceComponents)
	if err != nil {
		return model.ChannelModelRetailPriceVersion{}, err
	}
	retailPrices, err := scaleFlatPrices(purchasePrices, factor)
	if err != nil {
		return model.ChannelModelRetailPriceVersion{}, err
	}
	componentsJSON, err := marshalFlatPriceComponents(retailPrices)
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
		ExpressionSchemaVersion: purchase.ExpressionSchemaVersion,
		Currency:                purchase.Currency,
		TotalVariableCostRate:   input.TotalVariableCostRate,
		EffectiveTaxRate:        input.EffectiveTaxRate,
		TargetNetMargin:         input.TargetNetMargin,
		MinimumMarginRate:       input.MinimumMarginRate,
		Remark:                  strings.TrimSpace(input.Remark),
	}
	if err := CreateRetailPriceVersion(&version, userId); err != nil {
		return model.ChannelModelRetailPriceVersion{}, err
	}
	return version, nil
}

func createOfficialRatioPurchaseDraft(input PurchaseDraftInput, userId int) (model.ChannelModelPurchasePriceVersion, error) {
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
	officialPrices, err := unmarshalFlatPriceComponents(official.PriceComponents)
	if err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
	}
	prices, err := scaleFlatPrices(officialPrices, discount)
	if err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
	}
	return persistPurchaseDraft(input, official, prices, expression, input.PurchaseDiscount, userId)
}

func createComponentRatioPurchaseDraft(input PurchaseDraftInput, userId int) (model.ChannelModelPurchasePriceVersion, error) {
	official, err := requireOfficialPrice(input.OfficialPriceVersionId)
	if err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
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
	return persistPurchaseDraft(input, official, prices, expression, "", userId)
}

func createFixedPurchaseDraft(input PurchaseDraftInput, userId int) (model.ChannelModelPurchasePriceVersion, error) {
	prices, expression, _, err := normalizeFlatTokenPrices(input.Prices)
	if err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
	}
	official := model.OfficialModelPriceVersion{
		BillingMode:             "token",
		PriceStructure:          "flat",
		ExpressionSchemaVersion: "v1",
		Currency:                "USD",
	}
	if input.OfficialPriceVersionId != nil {
		if err := model.DB.First(&official, *input.OfficialPriceVersionId).Error; err != nil {
			return model.ChannelModelPurchasePriceVersion{}, err
		}
	}
	return persistPurchaseDraft(input, official, prices, expression, "", userId)
}

func persistPurchaseDraft(
	input PurchaseDraftInput,
	official model.OfficialModelPriceVersion,
	prices FlatTokenPriceInput,
	expression string,
	discount string,
	userId int,
) (model.ChannelModelPurchasePriceVersion, error) {
	componentsJSON, err := marshalFlatPriceComponents(prices)
	if err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
	}
	version := model.ChannelModelPurchasePriceVersion{
		ChannelModelId:          input.ChannelModelId,
		OfficialPriceVersionId:  input.OfficialPriceVersionId,
		BillingMode:             official.BillingMode,
		PricingMode:             input.PricingMode,
		PriceStructure:          "flat",
		PriceComponents:         componentsJSON,
		PurchaseDiscount:        discount,
		InputUnitPrice:          prices.InputUnitPrice,
		OutputUnitPrice:         prices.OutputUnitPrice,
		CacheReadUnitPrice:      prices.CacheReadUnitPrice,
		CacheWriteUnitPrice:     prices.CacheWriteUnitPrice,
		PriceUnit:               "per_1m_tokens",
		PurchaseBillingExpr:     expression,
		ExpressionSource:        "generated",
		ExpressionSchemaVersion: official.ExpressionSchemaVersion,
		Currency:                official.Currency,
		QuoteReference:          strings.TrimSpace(input.QuoteReference),
		ContractReference:       strings.TrimSpace(input.ContractReference),
		Remark:                  strings.TrimSpace(input.Remark),
	}
	if err := CreatePurchasePriceVersion(&version, userId); err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
	}
	return version, nil
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
		prices.CacheReadUnitPrice == "" && prices.CacheWriteUnitPrice == "" &&
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
	expression := `v1:tier("base", ` + strings.Join(terms, " + ") + ")"
	components, err := marshalFlatPriceComponents(prices)
	return prices, expression, components, err
}

func marshalFlatPriceComponents(prices FlatTokenPriceInput) (string, error) {
	data, err := common.Marshal(flatTokenPriceComponents{
		InputUnitPrice:       prices.InputUnitPrice,
		OutputUnitPrice:      prices.OutputUnitPrice,
		CacheReadUnitPrice:   prices.CacheReadUnitPrice,
		CacheWriteUnitPrice:  prices.CacheWriteUnitPrice,
		ImageInputUnitPrice:  prices.ImageInputUnitPrice,
		ImageOutputUnitPrice: prices.ImageOutputUnitPrice,
		AudioInputUnitPrice:  prices.AudioInputUnitPrice,
		AudioOutputUnitPrice: prices.AudioOutputUnitPrice,
		PriceUnit:            "per_1m_tokens",
	})
	return string(data), err
}

func unmarshalFlatPriceComponents(raw string) (FlatTokenPriceInput, error) {
	var components flatTokenPriceComponents
	if err := common.UnmarshalJsonStr(raw, &components); err != nil {
		return FlatTokenPriceInput{}, fmt.Errorf("official flat price components are invalid: %w", err)
	}
	return FlatTokenPriceInput{
		InputUnitPrice:       components.InputUnitPrice,
		OutputUnitPrice:      components.OutputUnitPrice,
		CacheReadUnitPrice:   components.CacheReadUnitPrice,
		CacheWriteUnitPrice:  components.CacheWriteUnitPrice,
		ImageInputUnitPrice:  components.ImageInputUnitPrice,
		ImageOutputUnitPrice: components.ImageOutputUnitPrice,
		AudioInputUnitPrice:  components.AudioInputUnitPrice,
		AudioOutputUnitPrice: components.AudioOutputUnitPrice,
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
	if official.Status != model.PricingVersionStatusActive {
		return official, errors.New("official price version must be active")
	}
	if official.BillingMode != "token" || official.PriceStructure != "flat" {
		return official, errors.New("structured ratio form requires a flat token official price")
	}
	return official, nil
}

func scaleBillingExpression(expression string, factor decimal.Decimal) (string, error) {
	if strings.Contains(expression, "|||") {
		return "", errors.New("request-rule expressions cannot be scaled by the structured form")
	}
	version, body := billingexpr.ParseExprVersion(expression)
	return fmt.Sprintf("v%d:(%s) * %s", version, body, factor.String()), nil
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
