package pricingruntime

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service/pricingengine"
	hosttypes "github.com/QuantumNous/new-api/types"
	"github.com/shopspring/decimal"
)

const defaultEstimatedCompletionTokens = 8192

func PrepareRelayPricing(
	info *relaycommon.RelayInfo,
	group string,
	selectedChannelId int,
	promptTokens int,
	maxCompletionTokens int,
	groupRatioInfo hosttypes.GroupRatioInfo,
	requestInput billingexpr.RequestInput,
	businessUsage pricingengine.Usage,
) (hosttypes.PriceData, bool, error) {
	if !ShouldUseV2(
		info.UserId,
		group,
		info.RequestId,
		info.OriginModelName,
	) {
		return hosttypes.PriceData{}, false, nil
	}
	bundles := GetCandidateBundles(group, info.OriginModelName)
	if len(bundles) == 0 {
		return hosttypes.PriceData{}, false, nil
	}
	selectedIsV2 := false
	for _, bundle := range bundles {
		if bundle.ChannelModel.ChannelId == selectedChannelId {
			selectedIsV2 = true
			break
		}
	}
	if !selectedIsV2 {
		return hosttypes.PriceData{}, false, nil
	}
	if maxCompletionTokens <= 0 && groupRatioInfo.GroupRatio != 0 {
		maxCompletionTokens = defaultEstimatedCompletionTokens
	}
	usage := businessUsage
	usage.PromptTokens = float64(promptTokens)
	usage.CompletionTokens = float64(maxCompletionTokens)
	usage.RequestBody = string(requestInput.Body)
	estimatedUsageJSON, err := common.Marshal(usage)
	if err != nil {
		return hosttypes.PriceData{}, false, err
	}
	quotes, err := QuoteCandidates(group, info.OriginModelName, usage)
	if err != nil {
		return hosttypes.PriceData{}, false, err
	}
	bundleById := make(map[int]ActivePriceBundle, len(bundles))
	for _, bundle := range bundles {
		bundleById[bundle.ChannelModel.Id] = bundle
	}
	candidates := make(map[int]hosttypes.DynamicPriceCandidate, len(bundles))
	routeCandidates := make([]RouteCandidate, 0, len(bundles))
	maximumRetailAmount := 0.0
	for _, quote := range quotes {
		if !quote.MeetsMinimumMargin {
			continue
		}
		bundle := bundleById[quote.ChannelModelId]
		purchaseAmount, err := decimal.NewFromString(quote.PurchaseCost)
		if err != nil {
			return hosttypes.PriceData{}, false, err
		}
		retailAmount, err := decimal.NewFromString(quote.RetailAmount)
		if err != nil {
			return hosttypes.PriceData{}, false, err
		}
		retailFloat, _ := retailAmount.Float64()
		if retailFloat > maximumRetailAmount {
			maximumRetailAmount = retailFloat
		}
		candidates[bundle.ChannelModel.ChannelId] = hosttypes.DynamicPriceCandidate{
			ChannelModelId:         bundle.ChannelModel.Id,
			ChannelId:              bundle.ChannelModel.ChannelId,
			ModelId:                bundle.ChannelModel.ModelId,
			PurchasePriceVersion:   bundle.Purchase.Id,
			RetailPriceVersion:     bundle.Retail.Id,
			PurchaseExpression:     bundle.Purchase.PurchaseBillingExpr,
			PurchaseExpressionHash: bundle.Purchase.PurchaseExprHash,
			RetailExpression:       bundle.Retail.RetailBillingExpr,
			RetailExpressionHash:   bundle.Retail.RetailExprHash,
			PricingRevision:        bundle.Revision,
			Currency:               bundle.Retail.Currency,
			EstimatedPurchaseUSD:   purchaseAmount.String(),
			EstimatedRetailUSD:     retailAmount.String(),
		}
		routeCandidates = append(routeCandidates, RouteCandidate{
			ChannelId:      bundle.ChannelModel.ChannelId,
			ChannelModelId: bundle.ChannelModel.Id,
			Priority:       bundle.ChannelModel.Priority,
			Weight:         bundle.ChannelModel.Weight,
			PurchaseCost:   purchaseAmount,
		})
	}
	sortRouteCandidates(routeCandidates)
	routeChannelIds := make([]int, 0, len(routeCandidates))
	for _, candidate := range routeCandidates {
		routeChannelIds = append(routeChannelIds, candidate.ChannelId)
	}
	if len(routeChannelIds) == 0 {
		return hosttypes.PriceData{}, false, errors.New(
			"no v2 candidate meets the minimum margin for estimated usage",
		)
	}
	quotaBeforeGroup := maximumRetailAmount * common.QuotaPerUnit
	reservationQuota, err := billingexpr.QuotaRoundStrict(
		quotaBeforeGroup * groupRatioInfo.GroupRatio,
	)
	if err != nil {
		return hosttypes.PriceData{}, false, err
	}
	info.DynamicPricingSnapshot = &hosttypes.DynamicPricingSnapshot{
		CandidatesByChannelId:     candidates,
		RouteChannelIds:           routeChannelIds,
		ReservationQuota:          reservationQuota,
		EstimatedPromptTokens:     promptTokens,
		EstimatedCompletionTokens: maxCompletionTokens,
		GroupRatio:                groupRatioInfo.GroupRatio,
		EstimatedUsage:            string(estimatedUsageJSON),
	}
	info.BillingRequestInput = &requestInput
	if err := BindSelectedChannel(info, selectedChannelId); err != nil {
		return hosttypes.PriceData{}, false, err
	}
	priceData := hosttypes.PriceData{
		GroupRatioInfo:    groupRatioInfo,
		QuotaToPreConsume: reservationQuota,
	}
	info.PriceData = priceData
	return priceData, true, nil
}

func BindSelectedChannel(
	info *relaycommon.RelayInfo,
	channelId int,
) error {
	if info.DynamicPricingSnapshot == nil {
		return nil
	}
	candidate, ok := info.DynamicPricingSnapshot.CandidatesByChannelId[channelId]
	if !ok {
		return errors.New("selected channel has no frozen v2 price candidate")
	}
	info.DynamicPricingSnapshot.Selected = &candidate
	info.TieredBillingSnapshot = &billingexpr.BillingSnapshot{
		BillingMode:               "tiered_expr",
		ModelName:                 info.OriginModelName,
		ExprString:                candidate.RetailExpression,
		ExprHash:                  candidate.RetailExpressionHash,
		GroupRatio:                info.DynamicPricingSnapshot.GroupRatio,
		EstimatedPromptTokens:     info.DynamicPricingSnapshot.EstimatedPromptTokens,
		EstimatedCompletionTokens: info.DynamicPricingSnapshot.EstimatedCompletionTokens,
		EstimatedQuotaAfterGroup:  info.DynamicPricingSnapshot.ReservationQuota,
		QuotaPerUnit:              common.QuotaPerUnit,
		ExprVersion:               billingexpr.ExprVersion(candidate.RetailExpression),
	}
	return nil
}
