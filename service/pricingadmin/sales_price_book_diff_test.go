package pricingadmin

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSalesPriceBookMarginReviewIgnoresSubPrecisionEvaluationNoise(t *testing.T) {
	version := model.SalesPriceBookVersion{
		PaymentFeeRate: "0.10", DistributionFeeRate: "0", OperationsLaborRate: "0",
		TotalVariableCostRate: "0.10",
		TargetNetMargin:       "0.03",
		EffectiveTaxRate:      "0.16",
		MinimumMarginRate:     "0.02",
	}
	item := SalesPriceBookItemListItem{SalesPriceBookItem: model.SalesPriceBookItem{
		BillingMode: "video_duration",
		SalesBillingExpr: `v2:((param("resolution") == "480p" ? tier("480p", video_s * 0.06) : ` +
			`tier("720p_default", video_s * 0.12)) * 0.7) * 1.141304347826087`,
	}}
	margins, err := salesPriceBookChannelMargins(item, version, []salesPriceBookDiffBasisSource{{
		ChannelModelId: 1, ChannelName: "upstream", PurchasePriceVersionId: 2,
		BillingMode: "video_duration",
		PurchaseBillingExpr: `v2:(param("resolution") == "480p" ? tier("480p", video_s * 0.06) : ` +
			`tier("720p_default", video_s * 0.12)) * 0.7`,
	}})
	require.NoError(t, err)
	require.Len(t, margins, 1)
	assert.True(t, margins[0].MeetsMinimumMargin)

	risks := salesPriceBookDiffRisks(SalesPriceBookItemDiff{
		NewItem:             &item,
		MarginAfter:         "0.019999999999999992",
		NewPurchaseVersions: []int{2},
		NewChannelMargins:   margins,
	}, version)
	assert.Empty(t, risks)
}

func TestSalesPriceBookChannelMarginsIdentifyOverriddenPolicyFields(t *testing.T) {
	version := model.SalesPriceBookVersion{
		PaymentFeeRate: "0.04", DistributionFeeRate: "0.05", OperationsLaborRate: "0.02",
		EffectiveTaxRate: "0.16", TargetNetMargin: "0.03", MinimumMarginRate: "0.02",
	}
	zero := "0"
	target := "0.04"
	margins, err := salesPriceBookChannelMargins(
		SalesPriceBookItemListItem{SalesPriceBookItem: model.SalesPriceBookItem{
			BillingMode: "token", SalesBillingExpr: `v2:p / 1000000`,
		}},
		version,
		[]salesPriceBookDiffBasisSource{{
			ChannelModelId: 1, ChannelName: "special-upstream", PurchasePriceVersionId: 2,
			BillingMode: "token", PurchaseBillingExpr: `v2:p / 2000000`,
		}},
		map[int]model.SalesPriceBookChannelModelOverride{
			1: {
				Id: 3, PaymentFeeRate: &zero, TargetNetMargin: &target,
			},
		},
	)

	require.NoError(t, err)
	require.Len(t, margins, 1)
	assert.Equal(t, 3, margins[0].ChannelModelOverrideId)
	assert.Equal(t, []string{"payment_fee_rate", "target_net_margin"}, margins[0].OverriddenFields)
	assert.Equal(t, "0", margins[0].PaymentFeeRate)
	assert.Equal(t, "0.04", margins[0].TargetNetMargin)
}

func TestLowestSalesPriceBookChannelMarginUsesEffectiveChannelMargins(t *testing.T) {
	margins := []SalesPriceBookChannelMargin{
		{ChannelName: "default", MarginRate: "-0.0117"},
		{ChannelName: "special", MarginRate: "0.030000000001"},
		{ChannelName: "not-comparable", MarginRate: ""},
	}

	assert.Equal(t, "-0.0117", lowestSalesPriceBookChannelMargin(margins))
	assert.Empty(t, lowestSalesPriceBookChannelMargin(nil))
}
