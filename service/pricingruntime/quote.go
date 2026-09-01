package pricingruntime

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/service/pricingengine"
	"github.com/QuantumNous/new-api/service/pricingpolicy"
	"github.com/shopspring/decimal"
)

type Quote struct {
	ChannelModelId         int    `json:"channel_model_id"`
	ChannelId              int    `json:"channel_id"`
	PurchasePriceVersion   int    `json:"purchase_price_version_id"`
	OfficialPriceVersion   int    `json:"official_price_version_id,omitempty"`
	PricingRevision        string `json:"pricing_revision"`
	PurchaseCost           string `json:"purchase_cost"`
	OfficialAmount         string `json:"official_amount,omitempty"`
	SalesAmount            string `json:"sales_amount"`
	CustomerCharge         string `json:"customer_charge"`
	Currency               string `json:"currency"`
	PurchaseMatchedTier    string `json:"purchase_matched_tier"`
	SalesMatchedTier       string `json:"sales_matched_tier"`
	MeetsMinimumMargin     bool   `json:"meets_minimum_margin"`
	MinimumMarginRate      string `json:"minimum_margin_rate"`
	EstimatedNetMarginRate string `json:"estimated_net_margin_rate"`
	ChannelModelOverrideId int    `json:"channel_model_override_id"`
	PaymentFeeRate         string `json:"payment_fee_rate"`
	DistributionFeeRate    string `json:"distribution_fee_rate"`
	OperationsLaborRate    string `json:"operations_labor_rate"`
	TotalVariableCostRate  string `json:"total_variable_cost_rate"`
	EffectiveTaxRate       string `json:"effective_tax_rate"`
	TargetNetMargin        string `json:"target_net_margin"`
}

type SalesQuoteRange struct {
	Currency                 string `json:"currency"`
	SalesAmount              string `json:"sales_amount"`
	MaximumReservationAmount string `json:"maximum_reservation_amount"`
	EligibleCandidateCount   int    `json:"eligible_candidate_count"`
}

var ErrNoEligiblePriceCandidate = errors.New(
	"no purchase candidate meets the minimum margin for estimated usage",
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

func QuoteCandidates(
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
		return nil, errors.New("no complete purchase price is available for this model and group")
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
	channelModelIds := make([]int, 0, len(bundles))
	for _, bundle := range bundles {
		channelModelIds = append(channelModelIds, bundle.ChannelModel.Id)
	}
	var overrideRows []model.SalesPriceBookChannelModelOverride
	if err := model.DB.Where(
		"price_book_version_id = ? AND channel_model_id IN ?",
		resolved.Version.Id, channelModelIds,
	).Find(&overrideRows).Error; err != nil {
		return nil, err
	}
	overridesByChannelModel := make(map[int]model.SalesPriceBookChannelModelOverride, len(overrideRows))
	for _, override := range overrideRows {
		overridesByChannelModel[override.ChannelModelId] = override
	}
	quotes := make([]Quote, 0, len(bundles))
	for _, bundle := range bundles {
		if bundle.Purchase.BillingMode != resolved.Item.BillingMode {
			continue
		}
		if bundle.Purchase.Currency != resolved.Book.Currency {
			continue
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
		officialPriceVersion := 0
		officialAmount := ""
		if bundle.Official != nil {
			official, evaluateErr := pricingengine.EvaluateWithRequest(
				bundle.Official.BillingExpr,
				bundle.Official.ExprHash,
				usage,
				requestInput,
			)
			if evaluateErr != nil {
				return nil, fmt.Errorf(
					"evaluate official price for channel model %d: %w",
					bundle.ChannelModel.Id,
					evaluateErr,
				)
			}
			officialPriceVersion = bundle.Official.Id
			officialAmount = official.Amount.String()
		}
		var override *model.SalesPriceBookChannelModelOverride
		if configured, exists := overridesByChannelModel[bundle.ChannelModel.Id]; exists {
			override = &configured
		}
		effective, err := pricingpolicy.Resolve(resolved.Version, override)
		if err != nil {
			return nil, fmt.Errorf(
				"resolve channel model %d commercial policy: %w",
				bundle.ChannelModel.Id, err,
			)
		}
		variableCostRate, err := parseRate(
			"total variable cost rate", effective.TotalVariableCostRate,
		)
		if err != nil {
			return nil, err
		}
		taxRate, err := parseRate("effective tax rate", effective.EffectiveTaxRate)
		if err != nil {
			return nil, err
		}
		minimumMargin, err := parseMargin(effective.MinimumMarginRate)
		if err != nil {
			return nil, err
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
			OfficialPriceVersion:   officialPriceVersion,
			PricingRevision:        resolved.Version.ContentHash,
			PurchaseCost:           purchase.Amount.String(),
			OfficialAmount:         officialAmount,
			SalesAmount:            sales.Amount.String(),
			CustomerCharge:         sales.Amount.String(),
			Currency:               resolved.Book.Currency,
			PurchaseMatchedTier:    purchase.MatchedTier,
			SalesMatchedTier:       sales.MatchedTier,
			MeetsMinimumMargin:     meetsMinimumMargin(netMargin, minimumMargin),
			MinimumMarginRate:      minimumMargin.String(),
			EstimatedNetMarginRate: netMargin.String(),
			ChannelModelOverrideId: effective.OverrideId,
			PaymentFeeRate:         effective.PaymentFeeRate,
			DistributionFeeRate:    effective.DistributionFeeRate,
			OperationsLaborRate:    effective.OperationsLaborRate,
			TotalVariableCostRate:  effective.TotalVariableCostRate,
			EffectiveTaxRate:       effective.EffectiveTaxRate,
			TargetNetMargin:        effective.TargetNetMargin,
		})
	}
	if len(quotes) == 0 {
		return nil, ErrNoEligiblePriceCandidate
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

func QuoteSalesPrice(
	userId int,
	group string,
	modelName string,
	usage pricingengine.Usage,
) (SalesQuoteRange, error) {
	resolved, err := ResolveSalesPrice(userId, modelName, 0)
	if err != nil {
		return SalesQuoteRange{}, err
	}
	quotes, err := QuoteCandidates(
		group,
		modelName,
		usage,
		billingexpr.RequestInput{Body: []byte(usage.RequestBody)},
		resolved,
	)
	if err != nil {
		return SalesQuoteRange{}, err
	}
	return quoteRange(quotes, resolved.Book.Currency)
}

func quoteRange(quotes []Quote, currency string) (SalesQuoteRange, error) {
	minimum := decimal.Zero
	maximum := decimal.Zero
	eligibleCount := 0
	for _, quote := range quotes {
		if !quote.MeetsMinimumMargin {
			continue
		}
		amount, err := decimal.NewFromString(quote.CustomerCharge)
		if err != nil {
			return SalesQuoteRange{}, err
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
		return SalesQuoteRange{}, ErrNoEligiblePriceCandidate
	}
	return SalesQuoteRange{
		Currency:                 currency,
		SalesAmount:              minimum.String(),
		MaximumReservationAmount: maximum.String(),
		EligibleCandidateCount:   eligibleCount,
	}, nil
}
