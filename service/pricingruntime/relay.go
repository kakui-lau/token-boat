package pricingruntime

import (
	"errors"
	"fmt"
	"math"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service/pricingengine"
	"github.com/QuantumNous/new-api/setting"
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

func validateVideoPricingRequest(expressions []string, request billingexpr.RequestInput) error {
	requiresResolution := false
	for _, expression := range expressions {
		if strings.Contains(expression, `param("resolution")`) ||
			strings.Contains(expression, `param("metadata.resolution")`) {
			requiresResolution = true
			break
		}
	}
	if !requiresResolution {
		return nil
	}
	var params struct {
		Resolution string `json:"resolution"`
		Metadata   struct {
			Resolution string `json:"resolution"`
		} `json:"metadata"`
	}
	if len(request.Body) == 0 {
		return errors.New("video pricing requires a normalized resolution")
	}
	if err := common.Unmarshal(request.Body, &params); err != nil {
		return fmt.Errorf("video pricing request is invalid: %w", err)
	}
	if strings.TrimSpace(params.Resolution) == "" && strings.TrimSpace(params.Metadata.Resolution) == "" {
		return errors.New("video pricing requires a normalized resolution")
	}
	return nil
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
	selectedIsV2 := selectedChannelId == 0
	for _, bundle := range bundles {
		if bundle.ChannelModel.ChannelId == selectedChannelId {
			selectedIsV2 = true
			break
		}
	}
	// A specifically selected channel bypasses automatic V2 route planning in
	// the distributor. Refresh once on a miss so a price chain published by a
	// different process cannot remain unusable on this pod until its local TTL
	// expires. Automatic traffic already fails closed in the distributor and
	// does not enter this recovery path.
	if selectedChannelId > 0 && (len(bundles) == 0 || !selectedIsV2) {
		if err := RefreshCatalog(); err != nil {
			return hosttypes.PriceData{}, false, fmt.Errorf(
				"refresh V2 pricing catalog for selected channel: %w",
				err,
			)
		}
		bundles = GetCandidateBundles(group, info.OriginModelName)
		selectedIsV2 = false
		for _, bundle := range bundles {
			if bundle.ChannelModel.ChannelId == selectedChannelId {
				selectedIsV2 = true
				break
			}
		}
	}
	if len(bundles) == 0 {
		return hosttypes.PriceData{}, false, nil
	}
	if !selectedIsV2 {
		return hosttypes.PriceData{}, false, nil
	}
	var resolvedSales *ResolvedSalesPrice
	if setting.SalesPriceBookRuntimeEnabled {
		resolved, err := ResolveSalesPrice(info.UserId, info.OriginModelName, 0)
		if err != nil {
			return hosttypes.PriceData{}, false, fmt.Errorf("resolve sales price book: %w", err)
		}
		resolvedSales = &resolved
	}
	billingMode := bundles[0].Purchase.BillingMode
	if resolvedSales != nil {
		billingMode = resolvedSales.Item.BillingMode
	}
	usedVars := usedPricingVars(bundles)
	if resolvedSales != nil {
		for name, used := range billingexpr.UsedVars(resolvedSales.Item.SalesBillingExpr) {
			if used {
				usedVars[name] = true
			}
		}
	}
	if !usedVars["param"] {
		requestInput.Body = nil
	}
	requestInput = billingexpr.FreezeRequestInput(requestInput)
	if maxCompletionTokens <= 0 &&
		groupRatioInfo.GroupRatio != 0 &&
		usedVars["c"] {
		maxCompletionTokens = defaultEstimatedCompletionTokens
	}
	usage := businessUsage
	usage.PromptTokens = float64(promptTokens)
	usage.CompletionTokens = float64(maxCompletionTokens)
	usage.RequestBody = string(requestInput.Body)
	if billingMode == "video_duration" {
		expressions := make([]string, 0, len(bundles)*2+1)
		for _, bundle := range bundles {
			expressions = append(expressions, bundle.Purchase.PurchaseBillingExpr)
			if resolvedSales == nil {
				expressions = append(expressions, bundle.Retail.RetailBillingExpr)
			}
		}
		if resolvedSales != nil {
			expressions = append(expressions, resolvedSales.Item.SalesBillingExpr)
		}
		if err := validateVideoPricingRequest(expressions, requestInput); err != nil {
			return hosttypes.PriceData{}, false, err
		}
	}
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
	var quotes []Quote
	if resolvedSales != nil {
		quotes, err = QuoteCandidatesWithSalesPrice(
			group,
			info.OriginModelName,
			usage,
			requestInput,
			*resolvedSales,
		)
	} else {
		quotes, err = QuoteCandidatesWithRequestAndGroupRatio(
			group,
			info.OriginModelName,
			usage,
			requestInput,
			groupRatioInfo.GroupRatio,
		)
	}
	if err != nil {
		return hosttypes.PriceData{}, false, err
	}
	bundleById := make(map[int]ActivePriceBundle, len(bundles))
	for _, bundle := range bundles {
		bundleById[bundle.ChannelModel.Id] = bundle
	}
	candidates := make(map[int]hosttypes.DynamicPriceCandidate, len(bundles))
	routeCandidates := make([]RouteCandidate, 0, len(bundles))
	maximumCustomerCharge := decimal.Zero
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
		customerCharge, err := decimal.NewFromString(quote.CustomerCharge)
		if err != nil {
			return hosttypes.PriceData{}, false, err
		}
		if customerCharge.GreaterThan(maximumCustomerCharge) {
			maximumCustomerCharge = customerCharge
		}
		retailPriceVersion := bundle.Retail.Id
		retailExpression := bundle.Retail.RetailBillingExpr
		retailExpressionHash := bundle.Retail.RetailExprHash
		currency := bundle.Retail.Currency
		totalVariableCostRate := bundle.Retail.TotalVariableCostRate
		effectiveTaxRate := bundle.Retail.EffectiveTaxRate
		minimumMarginRate := bundle.Retail.MinimumMarginRate
		salesPriceBookId := 0
		salesPriceBookVersionId := 0
		salesPriceBookItemId := 0
		priceBookAssignmentId := 0
		salesPricingSource := "legacy_channel_retail"
		paymentFeeRate := ""
		distributionFeeRate := ""
		operationsLaborRate := ""
		targetNetMargin := bundle.Retail.TargetNetMargin
		if resolvedSales != nil {
			retailPriceVersion = 0
			retailExpression = resolvedSales.Item.SalesBillingExpr
			retailExpressionHash = resolvedSales.Item.SalesExprHash
			currency = resolvedSales.Item.Currency
			totalVariableCostRate = resolvedSales.Version.TotalVariableCostRate
			effectiveTaxRate = resolvedSales.Version.EffectiveTaxRate
			minimumMarginRate = quote.MinimumMarginRate
			salesPriceBookId = resolvedSales.PriceBookId
			salesPriceBookVersionId = resolvedSales.PriceBookVersionId
			salesPriceBookItemId = resolvedSales.PriceBookItemId
			priceBookAssignmentId = resolvedSales.AssignmentId
			salesPricingSource = resolvedSales.Source
			paymentFeeRate = resolvedSales.Version.PaymentFeeRate
			distributionFeeRate = resolvedSales.Version.DistributionFeeRate
			operationsLaborRate = resolvedSales.Version.OperationsLaborRate
			targetNetMargin = resolvedSales.Version.TargetNetMargin
		}
		candidates[bundle.ChannelModel.ChannelId] = hosttypes.DynamicPriceCandidate{
			ChannelModelId:             bundle.ChannelModel.Id,
			ChannelId:                  bundle.ChannelModel.ChannelId,
			ModelId:                    bundle.ChannelModel.ModelId,
			BillingMode:                bundle.Purchase.BillingMode,
			PurchasePriceVersion:       bundle.Purchase.Id,
			RetailPriceVersion:         retailPriceVersion,
			PurchaseExpression:         bundle.Purchase.PurchaseBillingExpr,
			PurchaseExpressionHash:     bundle.Purchase.PurchaseExprHash,
			RetailExpression:           retailExpression,
			RetailExpressionHash:       retailExpressionHash,
			PricingRevision:            bundle.Revision,
			Currency:                   currency,
			ProviderCostMode:           bundle.ProviderCostMode,
			EstimatedPurchaseUSD:       purchaseAmount.String(),
			EstimatedRetailUSD:         retailAmount.String(),
			EstimatedCustomerChargeUSD: customerCharge.String(),
			TotalVariableCostRate:      totalVariableCostRate,
			EffectiveTaxRate:           effectiveTaxRate,
			MinimumMarginRate:          minimumMarginRate,
			EstimatedNetMarginRate:     quote.EstimatedNetMarginRate,
			MarginCompliant:            quote.MeetsMinimumMargin,
			SalesPriceBookId:           salesPriceBookId,
			SalesPriceBookVersionId:    salesPriceBookVersionId,
			SalesPriceBookItemId:       salesPriceBookItemId,
			PriceBookAssignmentId:      priceBookAssignmentId,
			SalesPricingSource:         salesPricingSource,
			PaymentFeeRate:             paymentFeeRate,
			DistributionFeeRate:        distributionFeeRate,
			OperationsLaborRate:        operationsLaborRate,
			TargetNetMargin:            targetNetMargin,
		}
		routeCandidates = append(routeCandidates, RouteCandidate{
			ChannelId:      bundle.ChannelModel.ChannelId,
			ChannelModelId: bundle.ChannelModel.Id,
			ModelId:        bundle.ChannelModel.ModelId,
			Priority:       bundle.ChannelModel.Priority,
			Weight:         bundle.ChannelModel.Weight,
			PurchaseCost:   purchaseAmount,
			QualityScore:   float64(bundle.ChannelModel.Weight),
		})
	}
	scoreRouteCandidates(routeCandidates)
	sortRouteCandidates(routeCandidates)
	routeChannelIds := make([]int, 0, len(routeCandidates))
	for _, candidate := range routeCandidates {
		routeChannelIds = append(routeChannelIds, candidate.ChannelId)
	}
	if len(routeChannelIds) == 0 {
		return hosttypes.PriceData{}, false, ErrNoEligiblePriceCandidate
	}
	maximumCustomerChargeFloat, _ := maximumCustomerCharge.Float64()
	reservationQuota, err := common.QuotaCeilStrict(
		maximumCustomerChargeFloat * common.QuotaPerUnit,
	)
	if err != nil {
		return hosttypes.PriceData{}, false, err
	}
	effectiveGroupRatio := groupRatioInfo.GroupRatio
	if resolvedSales != nil {
		effectiveGroupRatio = 1
	}
	info.DynamicPricingSnapshot = &hosttypes.DynamicPricingSnapshot{
		CandidatesByChannelId:     candidates,
		RouteChannelIds:           routeChannelIds,
		ReservationQuota:          reservationQuota,
		EstimatedPromptTokens:     promptTokens,
		EstimatedCompletionTokens: maxCompletionTokens,
		Group:                     group,
		GroupRatio:                effectiveGroupRatio,
		QuotaPerUnit:              common.QuotaPerUnit,
		EstimatedUsage:            string(estimatedUsageJSON),
	}
	info.BillingRequestInput = &requestInput
	effectiveGroupRatioInfo := groupRatioInfo
	if resolvedSales != nil {
		effectiveGroupRatioInfo.GroupRatio = 1
	}
	info.PriceData = hosttypes.PriceData{
		GroupRatioInfo:    effectiveGroupRatioInfo,
		QuotaToPreConsume: reservationQuota,
	}
	if selectedChannelId > 0 {
		if err := BindSelectedChannel(info, selectedChannelId); err != nil {
			return hosttypes.PriceData{}, false, err
		}
	}
	return info.PriceData, true, nil
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
	quotaPerUnit := info.DynamicPricingSnapshot.QuotaPerUnit
	if quotaPerUnit <= 0 || math.IsNaN(quotaPerUnit) || math.IsInf(quotaPerUnit, 0) {
		return errors.New("selected channel has no valid frozen quota conversion rate")
	}
	selectedCustomerCharge, err := decimal.NewFromString(candidate.EstimatedCustomerChargeUSD)
	if err != nil || selectedCustomerCharge.IsNegative() {
		return errors.New("selected channel has no valid frozen customer charge")
	}
	selectedCustomerChargeFloat, _ := selectedCustomerCharge.Float64()
	selectedQuota, err := common.QuotaCeilStrict(selectedCustomerChargeFloat * quotaPerUnit)
	if err != nil {
		return fmt.Errorf("selected channel customer charge is not representable: %w", err)
	}
	info.DynamicPricingSnapshot.Selected = &candidate
	// Quota is the final charge for the selected route. QuotaToPreConsume stays
	// at the highest eligible customer charge so retries remain fully reserved.
	info.PriceData.Quota = selectedQuota
	info.TieredBillingSnapshot = &billingexpr.BillingSnapshot{
		BillingMode:               "tiered_expr",
		ModelName:                 info.OriginModelName,
		ExprString:                candidate.RetailExpression,
		ExprHash:                  candidate.RetailExpressionHash,
		GroupRatio:                info.DynamicPricingSnapshot.GroupRatio,
		EstimatedPromptTokens:     info.DynamicPricingSnapshot.EstimatedPromptTokens,
		EstimatedCompletionTokens: info.DynamicPricingSnapshot.EstimatedCompletionTokens,
		EstimatedQuotaAfterGroup:  info.DynamicPricingSnapshot.ReservationQuota,
		QuotaPerUnit:              quotaPerUnit,
		ExprVersion:               billingexpr.ExprVersion(candidate.RetailExpression),
	}
	return nil
}
