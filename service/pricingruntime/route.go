package pricingruntime

import (
	"math"
	"os"
	"sort"
	"strconv"

	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/service/pricingengine"
	"github.com/shopspring/decimal"
)

type RouteCandidate struct {
	ChannelId      int
	ChannelModelId int
	ModelId        int
	Priority       int64
	Weight         uint
	PurchaseCost   decimal.Decimal
	SuccessRate    float64
	LatencyMs      float64
	QualityScore   float64
	RouteScore     float64
}

type RouteScoreWeights struct {
	Cost    float64 `json:"cost"`
	Success float64 `json:"success"`
	Latency float64 `json:"latency"`
	Quality float64 `json:"quality"`
}

func GetRouteScoreWeights() RouteScoreWeights {
	weights := RouteScoreWeights{
		Cost: 0.5, Success: 0.25, Latency: 0.15, Quality: 0.1,
	}
	values := []*float64{
		&weights.Cost, &weights.Success, &weights.Latency, &weights.Quality,
	}
	names := []string{
		"PRICING_ROUTE_COST_WEIGHT",
		"PRICING_ROUTE_SUCCESS_WEIGHT",
		"PRICING_ROUTE_LATENCY_WEIGHT",
		"PRICING_ROUTE_QUALITY_WEIGHT",
	}
	for index, name := range names {
		raw := os.Getenv(name)
		if raw == "" {
			continue
		}
		value, err := strconv.ParseFloat(raw, 64)
		if err == nil && value >= 0 && !math.IsNaN(value) && !math.IsInf(value, 0) {
			*values[index] = value
		}
	}
	total := weights.Cost + weights.Success + weights.Latency + weights.Quality
	if total <= 0 {
		return RouteScoreWeights{
			Cost: 0.5, Success: 0.25, Latency: 0.15, Quality: 0.1,
		}
	}
	weights.Cost /= total
	weights.Success /= total
	weights.Latency /= total
	weights.Quality /= total
	return weights
}

func PlanRoute(
	userId int,
	group string,
	modelName string,
) ([]RouteCandidate, error) {
	usage := pricingengine.Usage{
		PromptTokens: 1_000_000, CompletionTokens: 1_000_000,
		RequestCount: 1, ImageCount: 1, AudioSeconds: 1,
		VideoSeconds: 1, CharacterCount: 1_000,
	}
	bundles := GetCandidateBundles(group, modelName)
	if len(bundles) == 0 {
		return nil, nil
	}
	resolved, err := ResolveSalesPrice(userId, modelName, 0)
	if err != nil {
		return nil, err
	}
	quotes, err := QuoteCandidates(
		group,
		modelName,
		usage,
		billingexpr.RequestInput{},
		resolved,
	)
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
			ChannelId: bundle.ChannelModel.ChannelId, ChannelModelId: bundle.ChannelModel.Id,
			ModelId: bundle.ChannelModel.ModelId, Priority: bundle.ChannelModel.Priority,
			Weight: bundle.ChannelModel.Weight, PurchaseCost: cost,
			QualityScore: float64(bundle.ChannelModel.Weight),
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
	weights := GetRouteScoreWeights()
	for index := range candidates {
		if candidates[index].PurchaseCost.LessThan(minCost) {
			minCost = candidates[index].PurchaseCost
		}
		if candidates[index].QualityScore > maxQuality {
			maxQuality = candidates[index].QualityScore
		}
	}
	for index := range candidates {
		metrics := GetChannelRouteMetrics(
			candidates[index].ChannelId,
			candidates[index].ModelId,
		)
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
			costScore*weights.Cost +
				candidates[index].SuccessRate*weights.Success +
				latencyScore*weights.Latency +
				qualityScore*weights.Quality
	}
}
