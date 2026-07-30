package pricingruntime

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service/pricingengine"
	hosttypes "github.com/QuantumNous/new-api/types"
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
	if maxCompletionTokens <= 0 && groupRatioInfo.GroupRatio != 0 {
		maxCompletionTokens = defaultEstimatedCompletionTokens
	}
	usage := pricingengine.Usage{
		PromptTokens:     float64(promptTokens),
		CompletionTokens: float64(maxCompletionTokens),
		RequestBody:      string(requestInput.Body),
	}
	estimatedUsage, err := common.Marshal(usage)
	if err != nil {
		return hosttypes.PriceData{}, false, err
	}
	candidates := make(map[int]hosttypes.DynamicPriceCandidate, len(bundles))
	maximumRetailAmount := 0.0
	for _, bundle := range bundles {
		purchase, err := pricingengine.Evaluate(
			bundle.Purchase.PurchaseBillingExpr,
			bundle.Purchase.PurchaseExprHash,
			usage,
		)
		if err != nil {
			return hosttypes.PriceData{}, false, fmt.Errorf(
				"evaluate v2 purchase price for channel model %d: %w",
				bundle.ChannelModel.Id,
				err,
			)
		}
		retail, err := pricingengine.Evaluate(
			bundle.Retail.RetailBillingExpr,
			bundle.Retail.RetailExprHash,
			usage,
		)
		if err != nil {
			return hosttypes.PriceData{}, false, fmt.Errorf(
				"evaluate v2 retail price for channel model %d: %w",
				bundle.ChannelModel.Id,
				err,
			)
		}
		retailFloat, _ := retail.Amount.Float64()
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
			EstimatedPurchaseUSD:   purchase.Amount.String(),
			EstimatedRetailUSD:     retail.Amount.String(),
		}
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
		ReservationQuota:          reservationQuota,
		EstimatedPromptTokens:     promptTokens,
		EstimatedCompletionTokens: maxCompletionTokens,
		GroupRatio:                groupRatioInfo.GroupRatio,
		EstimatedUsage:            string(estimatedUsage),
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
