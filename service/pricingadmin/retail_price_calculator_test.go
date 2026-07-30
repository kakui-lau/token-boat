package pricingadmin

import (
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRetailPriceCalculatorCalculatesExactSellingPrice(t *testing.T) {
	calculator, err := NewRetailPriceCalculator("0.12", "0.165", "0.20")
	require.NoError(t, err)

	price, err := calculator.CalculateSellingPrice(decimal.NewFromInt(100))
	require.NoError(t, err)
	assert.Equal(t, "156.13314", price.StringFixed(5))
}

func TestRetailPriceCalculatorRejectsImpossibleMargin(t *testing.T) {
	calculator, err := NewRetailPriceCalculator("0.12", "0.165", "0.8")
	require.NoError(t, err)

	_, err = calculator.CalculateSellingPrice(decimal.NewFromInt(100))
	require.ErrorContains(t, err, "target margin must be lower than 0.7348")
}

func TestRetailPriceCalculatorRejectsNegativeProcurementCost(t *testing.T) {
	calculator, err := NewRetailPriceCalculator("0.12", "0.165", "0.2")
	require.NoError(t, err)

	_, err = calculator.CalculateSellingPrice(decimal.NewFromInt(-1))
	require.ErrorContains(t, err, "cannot be negative")
}

func TestRetailPriceCalculatorRejectsExtremeSellingFactor(t *testing.T) {
	calculator, err := NewRetailPriceCalculator("0", "0", "0.9999999")
	require.NoError(t, err)

	_, err = calculator.SellingFactor()
	require.ErrorContains(t, err, "selling factor exceeds the supported maximum")
}
