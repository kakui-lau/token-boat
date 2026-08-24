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
	CustomerCharge         string `json:"customer_charge"`
	AppliedGroupRatio      string `json:"applied_group_ratio"`
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

var ErrNoEligiblePriceCandidate = errors.New(
	"no v2 candidate meets the minimum margin for estimated usage",
)

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
	return QuoteCandidatesWithRequestAndGroupRatio(
		group,
		modelName,
		usage,
		billingexpr.RequestInput{Body: []byte(usage.RequestBody)},
		1,
	)
}

func QuoteCandidatesWithRequest(
	group string,
	modelName string,
	usage pricingengine.Usage,
	requestInput billingexpr.RequestInput,
) ([]Quote, error) {
	return QuoteCandidatesWithRequestAndGroupRatio(
		group,
		modelName,
		usage,
		requestInput,
		1,
	)
}

func QuoteCandidatesWithRequestAndGroupRatio(
	group string,
	modelName string,
	usage pricingengine.Usage,
	requestInput billingexpr.RequestInput,
	groupRatio float64,
) ([]Quote, error) {
	if groupRatio < 0 || math.IsNaN(groupRatio) || math.IsInf(groupRatio, 0) {
		return nil, errors.New("group ratio must be a finite non-negative number")
	}
	requestInput = billingexpr.FreezeRequestInput(requestInput)
	if err := pricingengine.ValidateUsage(usage); err != nil {
		return nil, err
	}
	bundles := GetCandidateBundles(group, modelName)
	if len(bundles) == 0 {
		return nil, errors.New("no complete v2 price is available for this model and group")
	}
	quotes := make([]Quote, 0, len(bundles))
	ratio := decimal.NewFromFloat(groupRatio)
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
		customerCharge := retail.Amount.Mul(ratio)
		netMargin := calculateNetMargin(
			purchase.Amount,
			customerCharge,
			variableCostRate,
			taxRate,
		)
		minimumMargin, err := parseMargin(bundle.Retail.MinimumMarginRate)
		if err != nil {
			return nil, fmt.Errorf("channel model %d: %w", bundle.ChannelModel.Id, err)
		}
		marginCompliant := meetsMinimumMargin(netMargin, minimumMargin)
		quotes = append(quotes, Quote{
			ChannelModelId:         bundle.ChannelModel.Id,
			ChannelId:              bundle.ChannelModel.ChannelId,
			PurchasePriceVersion:   bundle.Purchase.Id,
			RetailPriceVersion:     bundle.Retail.Id,
			PricingRevision:        bundle.Revision,
			PurchaseCost:           purchase.Amount.String(),
			RetailAmount:           retail.Amount.String(),
			CustomerCharge:         customerCharge.String(),
			AppliedGroupRatio:      ratio.String(),
			Currency:               bundle.Retail.Currency,
			PurchaseMatchedTier:    purchase.MatchedTier,
			RetailMatchedTier:      retail.MatchedTier,
			MeetsMinimumMargin:     marginCompliant,
			MinimumMarginRate:      minimumMargin.String(),
			EstimatedNetMarginRate: netMargin.String(),
		})
	}
	return quotes, nil
}

func QuoteCandidatesWithSalesPrice(
	group string,
	modelName string,
	usage pricingengine.Usage,
	requestInput billingexpr.RequestInput,
	resolved ResolvedSalesPrice,
) ([]Quote, error) {
	requestInput = billingexpr.FreezeRequestInput(requestInput)
	if err := pricingengine.ValidateUsage(usage); err != nil {
		return nil, err
	}
	bundles := GetCandidateBundles(group, modelName)
	if len(bundles) == 0 {
		return nil, errors.New("no complete v2 purchase price is available for this model and group")
	}
	sales, err := pricingengine.EvaluateWithRequest(
		resolved.Item.SalesBillingExpr,
		resolved.Item.SalesExprHash,
		usage,
		requestInput,
	)
	if err != nil {
		return nil, fmt.Errorf("evaluate sales price book item %d: %w", resolved.Item.Id, err)
	}
	variableCostRate, err := parseRate(
		"total variable cost rate",
		resolved.Version.TotalVariableCostRate,
	)
	if err != nil {
		return nil, err
	}
	taxRate, err := parseRate("effective tax rate", resolved.Version.EffectiveTaxRate)
	if err != nil {
		return nil, err
	}
	minimumMarginValue := resolved.Version.MinimumMarginRate
	if resolved.Item.MinimumMarginOverride != "" {
		minimumMarginValue = resolved.Item.MinimumMarginOverride
	}
	minimumMargin, err := parseMargin(minimumMarginValue)
	if err != nil {
		return nil, err
	}
	quotes := make([]Quote, 0, len(bundles))
	for _, bundle := range bundles {
		if bundle.Purchase.BillingMode != resolved.Item.BillingMode {
			return nil, fmt.Errorf(
				"channel model %d purchase billing mode %q does not match sales price book mode %q",
				bundle.ChannelModel.Id,
				bundle.Purchase.BillingMode,
				resolved.Item.BillingMode,
			)
		}
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
		netMargin := calculateNetMargin(
			purchase.Amount,
			sales.Amount,
			variableCostRate,
			taxRate,
		)
		quotes = append(quotes, Quote{
			ChannelModelId:         bundle.ChannelModel.Id,
			ChannelId:              bundle.ChannelModel.ChannelId,
			PurchasePriceVersion:   bundle.Purchase.Id,
			RetailPriceVersion:     0,
			PricingRevision:        resolved.Version.ContentHash,
			PurchaseCost:           purchase.Amount.String(),
			RetailAmount:           sales.Amount.String(),
			CustomerCharge:         sales.Amount.String(),
			AppliedGroupRatio:      "1",
			Currency:               resolved.Item.Currency,
			PurchaseMatchedTier:    purchase.MatchedTier,
			RetailMatchedTier:      sales.MatchedTier,
			MeetsMinimumMargin:     meetsMinimumMargin(netMargin, minimumMargin),
			MinimumMarginRate:      minimumMargin.String(),
			EstimatedNetMarginRate: netMargin.String(),
		})
	}
	return quotes, nil
}

func calculateNetMargin(
	purchaseCost decimal.Decimal,
	customerCharge decimal.Decimal,
	variableCostRate decimal.Decimal,
	taxRate decimal.Decimal,
) decimal.Decimal {
	netProfit := customerCharge.
		Sub(customerCharge.Mul(variableCostRate)).
		Sub(purchaseCost)
	if netProfit.IsPositive() {
		netProfit = netProfit.Sub(netProfit.Mul(taxRate))
	}
	if customerCharge.IsPositive() {
		return netProfit.Div(customerCharge)
	}
	return netProfit
}

func meetsMinimumMargin(netMargin decimal.Decimal, minimumMargin decimal.Decimal) bool {
	// Expression evaluation uses float64 before converting back to Decimal.
	// Treat sub-trillionth differences as numerical noise so a generated
	// selling price that is mathematically equal to the configured floor is
	// not removed from routing. Material shortfalls still fail closed.
	return netMargin.GreaterThanOrEqual(minimumMargin) ||
		minimumMargin.Sub(netMargin).LessThanOrEqual(decimal.New(1, -12))
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
	quotes, err := QuoteCandidatesWithRequestAndGroupRatio(
		group,
		modelName,
		usage,
		billingexpr.RequestInput{Body: []byte(usage.RequestBody)},
		groupRatio,
	)
	if err != nil {
		return RetailQuoteRange{}, err
	}
	minimum := decimal.Zero
	maximum := decimal.Zero
	eligibleCount := 0
	for _, quote := range quotes {
		if !quote.MeetsMinimumMargin {
			continue
		}
		amount, err := decimal.NewFromString(quote.CustomerCharge)
		if err != nil {
			return RetailQuoteRange{}, err
		}
		if eligibleCount == 0 || amount.LessThan(minimum) {
			minimum = amount
		}
		if eligibleCount == 0 || amount.GreaterThan(maximum) {
			maximum = amount
		}
		eligibleCount++
	}
	if eligibleCount == 0 {
		return RetailQuoteRange{}, ErrNoEligiblePriceCandidate
	}
	return RetailQuoteRange{
		Currency:                 "USD",
		MinimumRetailAmount:      minimum.String(),
		MaximumReservationAmount: maximum.String(),
		EligibleCandidateCount:   eligibleCount,
	}, nil
}
