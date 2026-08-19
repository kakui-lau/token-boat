package pricingadmin

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
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

func TestBuildRetailPricePreviewUsesDraftCalculationWithoutPersistence(t *testing.T) {
	purchase := model.ChannelModelPurchasePriceVersion{
		Id: 41, ChannelModelId: 42,
		BillingMode: "token", PriceStructure: "flat",
		PriceComponents:     `{"input_unit_price":"1.5","output_unit_price":"9"}`,
		PurchaseBillingExpr: `v2:(p * 1.5 + c * 9) / 1000000`,
		Currency:            "USD", PriceUnit: "million_tokens",
	}

	preview, err := BuildRetailPricePreview(RetailDraftInput{
		ChannelModelId: 42, PurchasePriceVersionId: 41,
		TotalVariableCostRate: "0.11", EffectiveTaxRate: "0.16",
		TargetNetMargin: "0.03", MinimumMarginRate: "0.03",
	}, purchase)
	require.NoError(t, err)

	assert.Equal(t, "1.75586", preview.InputUnitPrice)
	assert.Equal(t, "10.53512", preview.OutputUnitPrice)
	assert.Equal(t, "0.11", preview.TotalVariableCostRate)
	assert.Equal(t, "0.16", preview.EffectiveTaxRate)
	assert.Equal(t, "0.03", preview.TargetNetMargin)
}
