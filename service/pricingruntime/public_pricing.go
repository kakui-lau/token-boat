package pricingruntime

import (
	"github.com/QuantumNous/new-api/model"
	"github.com/shopspring/decimal"
)

func ApplyV2RetailPricing(
	pricing []model.Pricing,
	usableGroups map[string]string,
) []model.Pricing {
	for index := range pricing {
		var selected *ActivePriceBundle
		var selectedInputPrice decimal.Decimal
		hasSelectedInputPrice := false
		for group := range usableGroups {
			bundles := GetCandidateBundles(group, pricing[index].ModelName)
			for bundleIndex := range bundles {
				inputPrice, inputPriceErr := decimal.NewFromString(
					bundles[bundleIndex].Retail.InputUnitPrice,
				)
				hasInputPrice := inputPriceErr == nil
				if selected == nil ||
					(hasInputPrice &&
						(!hasSelectedInputPrice || inputPrice.LessThan(selectedInputPrice))) {
					candidate := bundles[bundleIndex]
					selected = &candidate
					selectedInputPrice = inputPrice
					hasSelectedInputPrice = hasInputPrice
				}
			}
		}
		if selected == nil {
			continue
		}
		pricing[index].BillingMode = "tiered_expr"
		pricing[index].BillingExpr = selected.Retail.RetailBillingExpr
		pricing[index].PricingVersion = selected.Revision
		pricing[index].PricingSource = "v2_dynamic"
	}
	return pricing
}
