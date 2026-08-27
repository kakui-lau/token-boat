package pricingadmin

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSalesPriceBookMarginReviewIgnoresSubPrecisionEvaluationNoise(t *testing.T) {
	version := model.SalesPriceBookVersion{
		TotalVariableCostRate: "0.10",
		EffectiveTaxRate:      "0.16",
		MinimumMarginRate:     "0.02",
	}
	item := SalesPriceBookItemListItem{SalesPriceBookItem: model.SalesPriceBookItem{
		BillingMode: "video_duration",
		SalesBillingExpr: `v2:((param("resolution") == "480p" ? tier("480p", video_s * 0.06) : ` +
			`tier("720p_default", video_s * 0.12)) * 0.7) * 1.141304347826087`,
		MinimumMarginOverride: "0.02",
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
