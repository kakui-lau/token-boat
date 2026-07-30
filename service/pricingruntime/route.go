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
	SuccessRate    float64
	LatencyMs      float64
	QualityScore   float64
	RouteScore     float64
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
			QualityScore:   float64(bundle.ChannelModel.Weight),
		})
	}
	scoreRouteCandidates(candidates)
	sortRouteCandidates(candidates)
	return candidates, nil
}

func sortRouteCandidates(candidates []RouteCandidate) {
	sort.SliceStable(candidates, func(left int, right int) bool {
		if candidates[left].RouteScore != candidates[right].RouteScore {
			return candidates[left].RouteScore > candidates[right].RouteScore
		}
		if candidates[left].Priority != candidates[right].Priority {
			return candidates[left].Priority > candidates[right].Priority
		}
		return candidates[left].Weight > candidates[right].Weight
	})
}

func scoreRouteCandidates(candidates []RouteCandidate) {
	if len(candidates) == 0 {
		return
	}
	minCost := candidates[0].PurchaseCost
	maxQuality := 0.0
	for index := range candidates {
		if candidates[index].PurchaseCost.LessThan(minCost) {
			minCost = candidates[index].PurchaseCost
		}
		if candidates[index].QualityScore > maxQuality {
			maxQuality = candidates[index].QualityScore
		}
	}
	for index := range candidates {
		metrics := GetChannelRouteMetrics(candidates[index].ChannelId)
		candidates[index].SuccessRate = metrics.SuccessRate
		candidates[index].LatencyMs = metrics.AverageLatencyMs
		costScore := 1.0
		if candidates[index].PurchaseCost.IsPositive() {
			costScore, _ = minCost.Div(candidates[index].PurchaseCost).Float64()
		}
		latencyScore := 1 / (1 + candidates[index].LatencyMs/1000)
		qualityScore := 0.5
		if maxQuality > 0 {
			qualityScore = candidates[index].QualityScore / maxQuality
		}
		candidates[index].RouteScore =
			costScore*0.5 +
				candidates[index].SuccessRate*0.25 +
				latencyScore*0.15 +
				qualityScore*0.1
	}
}
