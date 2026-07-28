package pricingadmin

import (
	"errors"
	"fmt"
	"math"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/shopspring/decimal"
)

const maxSimulationTokens = 1_000_000_000

type PriceSimulationInput struct {
	ChannelModelId         int     `json:"channel_model_id"`
	PurchasePriceVersionId int     `json:"purchase_price_version_id"`
	RetailPriceVersionId   int     `json:"retail_price_version_id"`
	PromptTokens           float64 `json:"prompt_tokens"`
	CompletionTokens       float64 `json:"completion_tokens"`
	CacheReadTokens        float64 `json:"cache_read_tokens"`
	CacheWriteTokens       float64 `json:"cache_write_tokens"`
	ImageInputTokens       float64 `json:"image_input_tokens"`
	ImageOutputTokens      float64 `json:"image_output_tokens"`
	AudioInputTokens       float64 `json:"audio_input_tokens"`
	AudioOutputTokens      float64 `json:"audio_output_tokens"`
}

type PriceSimulationResult struct {
	PurchaseCost        string `json:"purchase_cost"`
	RetailAmount        string `json:"retail_amount"`
	VariableCost        string `json:"variable_cost"`
	PreTaxProfit        string `json:"pre_tax_profit"`
	TaxExpense          string `json:"tax_expense"`
	NetProfit           string `json:"net_profit"`
	GrossMarginRate     string `json:"gross_margin_rate"`
	NetMarginRate       string `json:"net_margin_rate"`
	MinimumMarginRate   string `json:"minimum_margin_rate"`
	MeetsMinimumMargin  bool   `json:"meets_minimum_margin"`
	Currency            string `json:"currency"`
	PurchaseMatchedTier string `json:"purchase_matched_tier"`
	RetailMatchedTier   string `json:"retail_matched_tier"`
}

func SimulatePrice(input PriceSimulationInput) (PriceSimulationResult, error) {
	if input.ChannelModelId <= 0 || input.PurchasePriceVersionId <= 0 || input.RetailPriceVersionId <= 0 {
		return PriceSimulationResult{}, errors.New("channel model, purchase price and retail price are required")
	}
	values := map[string]float64{
		"prompt_tokens": input.PromptTokens, "completion_tokens": input.CompletionTokens,
		"cache_read_tokens": input.CacheReadTokens, "cache_write_tokens": input.CacheWriteTokens,
		"image_input_tokens": input.ImageInputTokens, "image_output_tokens": input.ImageOutputTokens,
		"audio_input_tokens": input.AudioInputTokens, "audio_output_tokens": input.AudioOutputTokens,
	}
	for name, value := range values {
		if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 || value > maxSimulationTokens {
			return PriceSimulationResult{}, fmt.Errorf("%s must be between 0 and %d", name, maxSimulationTokens)
		}
	}

	var purchase model.ChannelModelPurchasePriceVersion
	if err := model.DB.First(&purchase, input.PurchasePriceVersionId).Error; err != nil {
		return PriceSimulationResult{}, err
	}
	var retail model.ChannelModelRetailPriceVersion
	if err := model.DB.First(&retail, input.RetailPriceVersionId).Error; err != nil {
		return PriceSimulationResult{}, err
	}
	if purchase.ChannelModelId != input.ChannelModelId || retail.ChannelModelId != input.ChannelModelId {
		return PriceSimulationResult{}, errors.New("price versions do not belong to the selected channel model")
	}
	if retail.PurchasePriceVersionId != purchase.Id {
		return PriceSimulationResult{}, errors.New("retail price does not reference the selected purchase price")
	}
	if purchase.Currency != retail.Currency {
		return PriceSimulationResult{}, errors.New("purchase and retail currencies do not match")
	}

	params := billingexpr.TokenParams{
		P: input.PromptTokens, C: input.CompletionTokens, Len: input.PromptTokens,
		CR: input.CacheReadTokens, CC: input.CacheWriteTokens,
		Img: input.ImageInputTokens, ImgO: input.ImageOutputTokens,
		AI: input.AudioInputTokens, AO: input.AudioOutputTokens,
	}
	purchaseRaw, purchaseTrace, err := billingexpr.RunExprByHash(
		purchase.PurchaseBillingExpr,
		purchase.PurchaseExprHash,
		params,
	)
	if err != nil {
		return PriceSimulationResult{}, fmt.Errorf("evaluate purchase price: %w", err)
	}
	retailRaw, retailTrace, err := billingexpr.RunExprByHash(
		retail.RetailBillingExpr,
		retail.RetailExprHash,
		params,
	)
	if err != nil {
		return PriceSimulationResult{}, fmt.Errorf("evaluate retail price: %w", err)
	}
	purchaseCost := decimal.NewFromFloat(purchaseRaw).Div(decimal.NewFromInt(1_000_000))
	retailAmount := decimal.NewFromFloat(retailRaw).Div(decimal.NewFromInt(1_000_000))
	vcr, err := decimal.NewFromString(retail.TotalVariableCostRate)
	if err != nil {
		return PriceSimulationResult{}, err
	}
	taxRate, err := decimal.NewFromString(retail.EffectiveTaxRate)
	if err != nil {
		return PriceSimulationResult{}, err
	}
	minimumMargin, err := decimal.NewFromString(retail.MinimumMarginRate)
	if err != nil {
		return PriceSimulationResult{}, err
	}
	variableCost := retailAmount.Mul(vcr)
	preTaxProfit := retailAmount.Sub(variableCost).Sub(purchaseCost)
	taxExpense := decimal.Zero
	if preTaxProfit.IsPositive() {
		taxExpense = preTaxProfit.Mul(taxRate)
	}
	netProfit := preTaxProfit.Sub(taxExpense)
	grossMargin := decimal.Zero
	netMargin := decimal.Zero
	if retailAmount.IsPositive() {
		grossMargin = retailAmount.Sub(purchaseCost).Div(retailAmount)
		netMargin = netProfit.Div(retailAmount)
	}
	return PriceSimulationResult{
		PurchaseCost: purchaseCost.String(), RetailAmount: retailAmount.String(),
		VariableCost: variableCost.String(), PreTaxProfit: preTaxProfit.String(),
		TaxExpense: taxExpense.String(), NetProfit: netProfit.String(),
		GrossMarginRate: grossMargin.String(), NetMarginRate: netMargin.String(),
		MinimumMarginRate:  minimumMargin.String(),
		MeetsMinimumMargin: netMargin.GreaterThanOrEqual(minimumMargin),
		Currency:           retail.Currency, PurchaseMatchedTier: purchaseTrace.MatchedTier,
		RetailMatchedTier: retailTrace.MatchedTier,
	}, nil
}
