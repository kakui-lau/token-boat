package pricingadmin

import (
	"errors"

	"github.com/shopspring/decimal"
)

var maxSalesFactor = decimal.NewFromInt(1_000_000)

const salesSellingPriceDecimalPlaces int32 = 5

type SalesPriceCalculator struct {
	VariableCostRate decimal.Decimal
	TaxRate          decimal.Decimal
	TargetNetMargin  decimal.Decimal
}

func NewSalesPriceCalculator(
	variableCostRate string,
	taxRate string,
	targetNetMargin string,
) (SalesPriceCalculator, error) {
	vcr, err := validateRate("total_variable_cost_rate", variableCostRate)
	if err != nil {
		return SalesPriceCalculator{}, err
	}
	tax, err := validateRate("effective_tax_rate", taxRate)
	if err != nil {
		return SalesPriceCalculator{}, err
	}
	margin, err := validateRate("target_net_margin", targetNetMargin)
	if err != nil {
		return SalesPriceCalculator{}, err
	}
	return SalesPriceCalculator{
		VariableCostRate: vcr,
		TaxRate:          tax,
		TargetNetMargin:  margin,
	}, nil
}

func (c SalesPriceCalculator) SellingFactor() (decimal.Decimal, error) {
	one := decimal.NewFromInt(1)
	taxTerm := one.Sub(c.TaxRate)
	denominator := one.Sub(c.VariableCostRate).
		Mul(taxTerm).
		Sub(c.TargetNetMargin)
	if !denominator.IsPositive() {
		maximumTheoreticalMargin := one.Sub(c.VariableCostRate).Mul(taxTerm)
		return decimal.Zero, errors.New(
			"VCR, tax rate and target margin produce a non-positive sales-price denominator; " +
				"target margin must be lower than " + maximumTheoreticalMargin.String(),
		)
	}
	factor := taxTerm.Div(denominator)
	if factor.GreaterThan(maxSalesFactor) {
		return decimal.Zero, errors.New("sales-price factor exceeds the supported maximum")
	}
	return factor, nil
}

func (c SalesPriceCalculator) CalculateSellingPrice(
	procurementCost decimal.Decimal,
) (decimal.Decimal, error) {
	if procurementCost.IsNegative() {
		return decimal.Zero, errors.New("procurement cost cannot be negative")
	}
	factor, err := c.SellingFactor()
	if err != nil {
		return decimal.Zero, err
	}
	return procurementCost.Mul(factor).RoundCeil(salesSellingPriceDecimalPlaces), nil
}
