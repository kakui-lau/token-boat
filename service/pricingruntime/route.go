package pricingruntime

import (
	"sort"

	"github.com/QuantumNous/new-api/service/pricingengine"
	"github.com/shopspring/decimal"
)

type RouteCandidate struct {
	ChannelId      int
	ChannelModelId int
	Priority       int64
	Weight         uint
	PurchaseCost   decimal.Decimal
}

func PlanV2Route(group string, modelName string) ([]RouteCandidate, error) {
	usage := pricingengine.Usage{
		PromptTokens:     1_000_000,
		CompletionTokens: 1_000_000,
		RequestCount:     1,
		ImageCount:       1,
		AudioSeconds:     1,
		VideoSeconds:     1,
		CharacterCount:   1_000,
	}
	bundles := GetCandidateBundles(group, modelName)
	if len(bundles) == 0 {
		return nil, nil
	}
	quotes, err := QuoteCandidates(group, modelName, usage)
	if err != nil {
		return nil, err
	}
	bundleById := make(map[int]ActivePriceBundle, len(bundles))
	for _, bundle := range bundles {
		bundleById[bundle.ChannelModel.Id] = bundle
	}
	candidates := make([]RouteCandidate, 0, len(quotes))
	for _, quote := range quotes {
		if !quote.MeetsMinimumMargin {
			continue
		}
		bundle := bundleById[quote.ChannelModelId]
		cost, err := decimal.NewFromString(quote.PurchaseCost)
		if err != nil {
			return nil, err
		}
		candidates = append(candidates, RouteCandidate{
			ChannelId:      quote.ChannelId,
			ChannelModelId: quote.ChannelModelId,
			Priority:       bundle.ChannelModel.Priority,
			Weight:         bundle.ChannelModel.Weight,
			PurchaseCost:   cost,
		})
	}
	sort.SliceStable(candidates, func(left int, right int) bool {
		if !candidates[left].PurchaseCost.Equal(candidates[right].PurchaseCost) {
			return candidates[left].PurchaseCost.LessThan(candidates[right].PurchaseCost)
		}
		if candidates[left].Priority != candidates[right].Priority {
			return candidates[left].Priority > candidates[right].Priority
		}
		return candidates[left].Weight > candidates[right].Weight
	})
	return candidates, nil
}
