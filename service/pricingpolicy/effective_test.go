package pricingpolicy

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResolveUsesOnlyConfiguredChannelModelRates(t *testing.T) {
	zero := "0"
	target := "0.01"
	minimum := "0.01"
	policy, err := Resolve(model.SalesPriceBookVersion{
		PaymentFeeRate: "0.04", DistributionFeeRate: "0.05",
		OperationsLaborRate: "0.02", EffectiveTaxRate: "0.16",
		TargetNetMargin: "0.03", MinimumMarginRate: "0.02",
	}, &model.SalesPriceBookChannelModelOverride{
		Id: 9, PaymentFeeRate: &zero, TargetNetMargin: &target, MinimumMarginRate: &minimum,
	})
	require.NoError(t, err)
	assert.Equal(t, 9, policy.OverrideId)
	assert.Equal(t, "0", policy.PaymentFeeRate)
	assert.Equal(t, "0.05", policy.DistributionFeeRate)
	assert.Equal(t, "0.02", policy.OperationsLaborRate)
	assert.Equal(t, "0.07", policy.TotalVariableCostRate)
	assert.Equal(t, "0.01", policy.TargetNetMargin)
}

func TestValidateOverrideDistinguishesInheritanceFromExplicitZero(t *testing.T) {
	blank := "  "
	zero := "0.000"
	override := model.SalesPriceBookChannelModelOverride{
		PaymentFeeRate: &blank, DistributionFeeRate: &zero,
	}
	require.NoError(t, ValidateOverride(&override))
	assert.Nil(t, override.PaymentFeeRate)
	require.NotNil(t, override.DistributionFeeRate)
	assert.Equal(t, "0", *override.DistributionFeeRate)
}
