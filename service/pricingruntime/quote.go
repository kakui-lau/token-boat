package pricingruntime

import (
	"errors"
	"fmt"
	"math"

	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/service/pricingengine"
	"github.com/shopspring/decimal"
)

type Quote struct {
	ChannelModelId         int    `json:"channel_model_id"`
	ChannelId              int    `json:"channel_id"`
	PurchasePriceVersion   int    `json:"purchase_price_version_id"`
	RetailPriceVersion     int    `json:"retail_price_version_id"`
	PricingRevision        string `json:"pricing_revision"`
	PurchaseCost           string `json:"purchase_cost"`
	RetailAmount           string `json:"retail_amount"`
	Currency               string `json:"currency"`
	PurchaseMatchedTier    string `json:"purchase_matched_tier"`
	RetailMatchedTier      string `json:"retail_matched_tier"`
	MeetsMinimumMargin     bool   `json:"meets_minimum_margin"`
	MinimumMarginRate      string `json:"minimum_margin_rate"`
	EstimatedNetMarginRate string `json:"estimated_net_margin_rate"`
}

type RetailQuoteRange struct {
	Currency                 string `json:"currency"`
	MinimumRetailAmount      string `json:"minimum_retail_amount"`
	MaximumReservationAmount string `json:"maximum_reservation_amount"`
	EligibleCandidateCount   int    `json:"eligible_candidate_count"`
}

func parseMargin(value string) (decimal.Decimal, error) {
	return parseRate("minimum margin rate", value)
}

func parseRate(name string, value string) (decimal.Decimal, error) {
	margin, err := decimal.NewFromString(value)
	if err != nil {
		return decimal.Zero, fmt.Errorf("invalid %s: %w", name, err)
	}
	if margin.IsNegative() || margin.GreaterThan(decimal.NewFromInt(1)) {
		return decimal.Zero, fmt.Errorf("%s must be between 0 and 1", name)
	}
	return margin, nil
}

func QuoteCandidates(group string, modelName string, usage pricingengine.Usage) ([]Quote, error) {
	return QuoteCandidatesWithRequest(
		group,
		modelName,
		usage,
		billingexpr.RequestInput{Body: []byte(usage.RequestBody)},
	)
}

func QuoteCandidatesWithRequest(
	group string,
	modelName string,
	usage pricingengine.Usage,
	requestInput billingexpr.RequestInput,
) ([]Quote, error) {
	requestInput = billingexpr.FreezeRequestInput(requestInput)
	if err := pricingengine.ValidateUsage(usage); err != nil {
		return nil, err
	}
	bundles := GetCandidateBundles(group, modelName)
	if len(bundles) == 0 {
		return nil, errors.New("no complete v2 price is available for this model and group")
	}
	quotes := make([]Quote, 0, len(bundles))
	for _, bundle := range bundles {
		purchase, err := pricingengine.EvaluateWithRequest(
			bundle.Purchase.PurchaseBillingExpr,
			bundle.Purchase.PurchaseExprHash,
			usage,
			requestInput,
		)
		if err != nil {
			return nil, fmt.Errorf(
				"evaluate purchase price for channel model %d: %w",
				bundle.ChannelModel.Id,
				err,
			)
		}
		retail, err := pricingengine.EvaluateWithRequest(
			bundle.Retail.RetailBillingExpr,
			bundle.Retail.RetailExprHash,
			usage,
			requestInput,
		)
		if err != nil {
			return nil, fmt.Errorf(
				"evaluate retail price for channel model %d: %w",
				bundle.ChannelModel.Id,
				err,
			)
		}
		variableCostRate, err := parseRate(
			"total variable cost rate",
			bundle.Retail.TotalVariableCostRate,
		)
		if err != nil {
			return nil, fmt.Errorf("channel model %d: %w", bundle.ChannelModel.Id, err)
		}
		taxRate, err := parseRate("effective tax rate", bundle.Retail.EffectiveTaxRate)
		if err != nil {
			return nil, fmt.Errorf("channel model %d: %w", bundle.ChannelModel.Id, err)
		}
		netProfit := retail.Amount.
			Sub(retail.Amount.Mul(variableCostRate)).
			Sub(purchase.Amount)
		if netProfit.IsPositive() {
			netProfit = netProfit.Sub(netProfit.Mul(taxRate))
		}
		netMargin := netProfit
		if retail.Amount.IsPositive() {
			netMargin = netMargin.Div(retail.Amount)
		}
		minimumMargin, err := parseMargin(bundle.Retail.MinimumMarginRate)
		if err != nil {
			return nil, fmt.Errorf("channel model %d: %w", bundle.ChannelModel.Id, err)
		}
		quotes = append(quotes, Quote{
			ChannelModelId:         bundle.ChannelModel.Id,
			ChannelId:              bundle.ChannelModel.ChannelId,
			PurchasePriceVersion:   bundle.Purchase.Id,
			RetailPriceVersion:     bundle.Retail.Id,
			PricingRevision:        bundle.Revision,
			PurchaseCost:           purchase.Amount.String(),
			RetailAmount:           retail.Amount.String(),
			Currency:               bundle.Retail.Currency,
			PurchaseMatchedTier:    purchase.MatchedTier,
			RetailMatchedTier:      retail.MatchedTier,
			MeetsMinimumMargin:     netMargin.GreaterThanOrEqual(minimumMargin),
			MinimumMarginRate:      minimumMargin.String(),
			EstimatedNetMarginRate: netMargin.String(),
		})
	}
	return quotes, nil
}

func QuoteRetailRange(
	group string,
	modelName string,
	usage pricingengine.Usage,
	groupRatio float64,
) (RetailQuoteRange, error) {
	if groupRatio < 0 || math.IsNaN(groupRatio) || math.IsInf(groupRatio, 0) {
		return RetailQuoteRange{}, errors.New("group ratio must be a finite non-negative number")
	}
	quotes, err := QuoteCandidates(group, modelName, usage)
	if err != nil {
		return RetailQuoteRange{}, err
	}
	ratio := decimal.NewFromFloat(groupRatio)
	minimum := decimal.Zero
	maximum := decimal.Zero
	eligibleCount := 0
	for _, quote := range quotes {
		if !quote.MeetsMinimumMargin {
			continue
		}
		amount, err := decimal.NewFromString(quote.RetailAmount)
		if err != nil {
			return RetailQuoteRange{}, err
		}
		amount = amount.Mul(ratio)
		if eligibleCount == 0 || amount.LessThan(minimum) {
			minimum = amount
		}
		if eligibleCount == 0 || amount.GreaterThan(maximum) {
			maximum = amount
		}
		eligibleCount++
	}
	if eligibleCount == 0 {
		return RetailQuoteRange{}, errors.New(
			"no v2 candidate meets the minimum margin for estimated usage",
		)
	}
	return RetailQuoteRange{
		Currency:                 "USD",
		MinimumRetailAmount:      minimum.String(),
		MaximumReservationAmount: maximum.String(),
		EligibleCandidateCount:   eligibleCount,
	}, nil
}
