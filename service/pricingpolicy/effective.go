package pricingpolicy

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/model"
	"github.com/shopspring/decimal"
)

// EffectivePolicy is the commercial policy actually applied to one route.
// TotalVariableCostRate is derived and is never independently configured.
type EffectivePolicy struct {
	OverrideId            int
	PaymentFeeRate        string
	DistributionFeeRate   string
	OperationsLaborRate   string
	TotalVariableCostRate string
	EffectiveTaxRate      string
	TargetNetMargin       string
	MinimumMarginRate     string
}

func Resolve(
	version model.SalesPriceBookVersion,
	override *model.SalesPriceBookChannelModelOverride,
) (EffectivePolicy, error) {
	targetWasConfigured := strings.TrimSpace(version.TargetNetMargin) != ""
	paymentDefault := strings.TrimSpace(version.PaymentFeeRate)
	distributionDefault := strings.TrimSpace(version.DistributionFeeRate)
	operationsDefault := strings.TrimSpace(version.OperationsLaborRate)
	paymentDefault = zeroIfBlank(paymentDefault)
	distributionDefault = zeroIfBlank(distributionDefault)
	operationsDefault = zeroIfBlank(operationsDefault)
	result := EffectivePolicy{
		PaymentFeeRate:      paymentDefault,
		DistributionFeeRate: distributionDefault,
		OperationsLaborRate: operationsDefault,
		EffectiveTaxRate:    zeroIfBlank(version.EffectiveTaxRate),
		TargetNetMargin:     zeroIfBlank(version.TargetNetMargin),
		MinimumMarginRate:   zeroIfBlank(version.MinimumMarginRate),
	}
	if override != nil {
		result.OverrideId = override.Id
		applyRateOverride(&result.PaymentFeeRate, override.PaymentFeeRate)
		applyRateOverride(&result.DistributionFeeRate, override.DistributionFeeRate)
		applyRateOverride(&result.OperationsLaborRate, override.OperationsLaborRate)
		applyRateOverride(&result.EffectiveTaxRate, override.EffectiveTaxRate)
		applyRateOverride(&result.TargetNetMargin, override.TargetNetMargin)
		if override.TargetNetMargin != nil {
			targetWasConfigured = true
		}
		applyRateOverride(&result.MinimumMarginRate, override.MinimumMarginRate)
	}
	payment, err := parseRate("payment fee rate", result.PaymentFeeRate)
	if err != nil {
		return EffectivePolicy{}, err
	}
	distribution, err := parseRate("distribution fee rate", result.DistributionFeeRate)
	if err != nil {
		return EffectivePolicy{}, err
	}
	operations, err := parseRate("operations labor rate", result.OperationsLaborRate)
	if err != nil {
		return EffectivePolicy{}, err
	}
	tax, err := parseRate("effective tax rate", result.EffectiveTaxRate)
	if err != nil {
		return EffectivePolicy{}, err
	}
	target, err := parseRate("target net margin", result.TargetNetMargin)
	if err != nil {
		return EffectivePolicy{}, err
	}
	minimum, err := parseRate("minimum margin rate", result.MinimumMarginRate)
	if err != nil {
		return EffectivePolicy{}, err
	}
	if targetWasConfigured && minimum.GreaterThan(target) {
		return EffectivePolicy{}, fmt.Errorf("minimum margin rate cannot exceed target net margin")
	}
	result.PaymentFeeRate = payment.String()
	result.DistributionFeeRate = distribution.String()
	result.OperationsLaborRate = operations.String()
	result.TotalVariableCostRate = payment.Add(distribution).Add(operations).String()
	result.EffectiveTaxRate = tax.String()
	result.TargetNetMargin = target.String()
	result.MinimumMarginRate = minimum.String()
	return result, nil
}

func ValidateOverride(input *model.SalesPriceBookChannelModelOverride) error {
	if input == nil {
		return fmt.Errorf("channel model override is required")
	}
	fields := []struct {
		name  string
		value **string
	}{
		{"payment fee rate", &input.PaymentFeeRate},
		{"distribution fee rate", &input.DistributionFeeRate},
		{"operations labor rate", &input.OperationsLaborRate},
		{"effective tax rate", &input.EffectiveTaxRate},
		{"target net margin", &input.TargetNetMargin},
		{"minimum margin rate", &input.MinimumMarginRate},
	}
	for _, field := range fields {
		if *field.value == nil {
			continue
		}
		trimmed := strings.TrimSpace(**field.value)
		if trimmed == "" {
			*field.value = nil
			continue
		}
		parsed, err := parseRate(field.name, trimmed)
		if err != nil {
			return err
		}
		normalized := parsed.String()
		*field.value = &normalized
	}
	input.Remark = strings.TrimSpace(input.Remark)
	if len(input.Remark) > 255 {
		return fmt.Errorf("remark cannot exceed 255 characters")
	}
	return nil
}

func HasConfiguredRate(input model.SalesPriceBookChannelModelOverride) bool {
	return input.PaymentFeeRate != nil ||
		input.DistributionFeeRate != nil ||
		input.OperationsLaborRate != nil ||
		input.EffectiveTaxRate != nil ||
		input.TargetNetMargin != nil ||
		input.MinimumMarginRate != nil
}

func applyRateOverride(target *string, value *string) {
	if value != nil {
		*target = *value
	}
}

func zeroIfBlank(value string) string {
	if strings.TrimSpace(value) == "" {
		return "0"
	}
	return value
}

func parseRate(name string, value string) (decimal.Decimal, error) {
	parsed, err := decimal.NewFromString(strings.TrimSpace(value))
	if err != nil {
		return decimal.Zero, fmt.Errorf("invalid %s: %w", name, err)
	}
	if parsed.IsNegative() || parsed.GreaterThan(decimal.NewFromInt(1)) {
		return decimal.Zero, fmt.Errorf("%s must be between 0 and 1", name)
	}
	return parsed, nil
}
