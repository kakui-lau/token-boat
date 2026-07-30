package pricingadmin

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateRetailBelowOfficialRejectsEqualFlatPrice(t *testing.T) {
	err := validateRetailBelowOfficial(
		`{"input_unit_price":"1"}`,
		`{"input_unit_price":"1.00000"}`,
	)

	require.ErrorContains(t, err, "retail price must be lower than the official price")
}

func TestValidateRetailBelowOfficialAllowsOneTickBelowFlatPrice(t *testing.T) {
	err := validateRetailBelowOfficial(
		`{"input_unit_price":"1"}`,
		`{"input_unit_price":"0.99999"}`,
	)

	require.NoError(t, err)
}

func TestValidateRetailBelowOfficialMatchesReorderedRulesByID(t *testing.T) {
	official := `{"rules":[` +
		`{"id":"standard","unit_price":"1"},` +
		`{"id":"premium","unit_price":"2"}` +
		`]}`
	retail := `{"rules":[` +
		`{"id":"premium","unit_price":"1.9"},` +
		`{"id":"standard","unit_price":"0.9"}` +
		`]}`

	require.NoError(t, validateRetailBelowOfficial(official, retail))
}

func TestValidateRetailBelowOfficialRejectsMissingOfficialComponent(t *testing.T) {
	err := validateRetailBelowOfficial(
		`{"input_unit_price":"1"}`,
		`{"output_unit_price":"0.5"}`,
	)

	require.ErrorContains(t, err, "official price is missing for output_unit_price")
}

func TestValidatePriceComponentLimitsRejectsExtremeUnitPrice(t *testing.T) {
	err := validatePriceComponentLimits(`{"input_unit_price":"1000000.00001"}`)

	require.ErrorContains(t, err, "must not exceed 1000000 USD")
}
