package pricingadmin

import (
	"errors"

	"github.com/shopspring/decimal"
)

type RetailPriceCalculator struct {
	VariableCostRate decimal.Decimal
	TaxRate          decimal.Decimal
	TargetNetMargin  decimal.Decimal
}

func NewRetailPriceCalculator(
	variableCostRate string,
	taxRate string,
	targetNetMargin string,
) (RetailPriceCalculator, error) {
	vcr, err := validateRate("total_variable_cost_rate", variableCostRate)
	if err != nil {
		return RetailPriceCalculator{}, err
	}
	tax, err := validateRate("effective_tax_rate", taxRate)
	if err != nil {
		return RetailPriceCalculator{}, err
	}
	margin, err := validateRate("target_net_margin", targetNetMargin)
	if err != nil {
		return RetailPriceCalculator{}, err
	}
	return RetailPriceCalculator{
		VariableCostRate: vcr,
		TaxRate:          tax,
		TargetNetMargin:  margin,
	}, nil
}

func (c RetailPriceCalculator) SellingFactor() (decimal.Decimal, error) {
	one := decimal.NewFromInt(1)
	taxTerm := one.Sub(c.TaxRate)
	denominator := one.Sub(c.VariableCostRate).
		Mul(taxTerm).
		Sub(c.TargetNetMargin)
	if !denominator.IsPositive() {
		maximumTheoreticalMargin := one.Sub(c.VariableCostRate).Mul(taxTerm)
		return decimal.Zero, errors.New(
			"VCR, tax rate and target margin produce a non-positive retail denominator; " +
				"target margin must be lower than " + maximumTheoreticalMargin.String(),
		)
	}
	return taxTerm.Div(denominator), nil
}

func (c RetailPriceCalculator) CalculateSellingPrice(
	procurementCost decimal.Decimal,
) (decimal.Decimal, error) {
	if procurementCost.IsNegative() {
		return decimal.Zero, errors.New("procurement cost cannot be negative")
	}
	factor, err := c.SellingFactor()
	if err != nil {
		return decimal.Zero, err
	}
	return procurementCost.Mul(factor), nil
}
