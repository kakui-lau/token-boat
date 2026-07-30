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

func usedPricingVars(bundles []ActivePriceBundle) map[string]bool {
	usedVars := make(map[string]bool)
	for _, bundle := range bundles {
		for _, expression := range []string{
			bundle.Purchase.PurchaseBillingExpr,
			bundle.Retail.RetailBillingExpr,
		} {
			for name, used := range billingexpr.UsedVars(expression) {
				if used {
					usedVars[name] = true
				}
			}
		}
	}
	return usedVars
}

func pricingUsageRequirementsMet(
	usedVars map[string]bool,
	usage pricingengine.Usage,
) bool {
	if usedVars["audio_s"] && usage.AudioSeconds <= 0 {
		return false
	}
	if usedVars["video_s"] && usage.VideoSeconds <= 0 {
		return false
	}
	return true
}

// SupportsFixedVideoTaskPricing reports whether every active expression can be
// evaluated from the business usage known before an asynchronous video task is
// submitted. Token and output-derived quantities are deliberately excluded.
func SupportsFixedVideoTaskPricing(group string, modelName string) bool {
	bundles := GetCandidateBundles(group, modelName)
	if len(bundles) == 0 {
		return false
	}
	unsupported := map[string]bool{
		"p": true, "c": true, "len": true,
		"cr": true, "cc": true, "cc1h": true,
		"img": true, "img_o": true, "ai": true, "ao": true,
		"images": true, "audio_s": true, "chars": true,
		"header": true, "hour": true, "minute": true,
		"weekday": true, "month": true, "day": true,
	}
	for name, used := range usedPricingVars(bundles) {
		if used && unsupported[name] {
			return false
		}
	}
	return true
}

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
	billingMode := bundles[0].Purchase.BillingMode
	usedVars := usedPricingVars(bundles)
	if maxCompletionTokens <= 0 &&
		groupRatioInfo.GroupRatio != 0 &&
		usedVars["c"] {
		maxCompletionTokens = defaultEstimatedCompletionTokens
	}
	usage := businessUsage
	usage.PromptTokens = float64(promptTokens)
	usage.CompletionTokens = float64(maxCompletionTokens)
	usage.RequestBody = string(requestInput.Body)
	if billingMode == "audio_duration" && usage.AudioSeconds <= 0 {
		return hosttypes.PriceData{}, false, nil
	}
	if billingMode == "video_duration" && usage.VideoSeconds <= 0 {
		return hosttypes.PriceData{}, false, nil
	}
	if !pricingUsageRequirementsMet(usedVars, usage) {
		return hosttypes.PriceData{}, false, nil
	}
	estimatedUsageJSON, err := common.Marshal(usage)
	if err != nil {
		return hosttypes.PriceData{}, false, err
	}
	quotes, err := QuoteCandidatesWithRequest(
		group,
		info.OriginModelName,
		usage,
		requestInput,
	)
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
			BillingMode:            bundle.Purchase.BillingMode,
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
