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
	hosttypes "github.com/QuantumNous/new-api/types"
	"github.com/shopspring/decimal"
)

const defaultEstimatedCompletionTokens = 8192

func usedPricingVars(bundles []ActivePriceBundle) map[string]bool {
	usedVars := make(map[string]bool)
	for _, bundle := range bundles {
		for name, used := range billingexpr.UsedVars(bundle.Purchase.PurchaseBillingExpr) {
			if used {
				usedVars[name] = true
			}
		}
		if bundle.Official != nil {
			for name, used := range billingexpr.UsedVars(bundle.Official.BillingExpr) {
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

// SupportsFixedVideoTaskPricing reports whether purchase and sales expressions
// can be evaluated before an asynchronous video task is submitted.
func SupportsFixedVideoTaskPricing(userId int, group string, modelName string) bool {
	bundles := GetCandidateBundles(group, modelName)
	if len(bundles) == 0 {
		return false
	}
	resolved, err := ResolveSalesPrice(userId, modelName, 0)
	if err != nil {
		return false
	}
	usedVars := usedPricingVars(bundles)
	for name, used := range billingexpr.UsedVars(resolved.Item.SalesBillingExpr) {
		if used {
			usedVars[name] = true
		}
	}
	unsupported := map[string]bool{
		"p": true, "c": true, "len": true,
		"cr": true, "cc": true, "cc1h": true,
		"img": true, "img_o": true, "ai": true, "ao": true,
		"images": true, "audio_s": true, "chars": true,
		"header": true, "hour": true, "minute": true,
		"weekday": true, "month": true, "day": true,
	}
	for name, used := range usedVars {
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
	requestInput billingexpr.RequestInput,
	businessUsage pricingengine.Usage,
) (hosttypes.PriceData, error) {
	bundles := GetCandidateBundles(group, info.OriginModelName)
	if info.IsChannelTest && selectedChannelId > 0 {
		selected, err := getChannelTestBundle(group, info.OriginModelName, selectedChannelId)
		if err != nil {
			if refreshErr := RefreshCatalog(); refreshErr != nil {
				return hosttypes.PriceData{}, fmt.Errorf(
					"refresh pricing catalog for channel test: %w",
					refreshErr,
				)
			}
			selected, err = getChannelTestBundle(group, info.OriginModelName, selectedChannelId)
			if err != nil {
				return hosttypes.PriceData{}, err
			}
		}
		bundles = []ActivePriceBundle{selected}
	}
	selectedHasCompletePricing := selectedChannelId == 0
	for _, bundle := range bundles {
		if bundle.ChannelModel.ChannelId == selectedChannelId {
			selectedHasCompletePricing = true
			break
		}
	}
	// A specifically selected channel bypasses automatic priced route planning in
	// the distributor. Refresh once on a miss so a price chain published by a
	// different process cannot remain unusable on this pod until its local TTL
	// expires. Automatic traffic already fails closed in the distributor and
	// does not enter this recovery path.
	if selectedChannelId > 0 && (len(bundles) == 0 || !selectedHasCompletePricing) {
		if err := RefreshCatalog(); err != nil {
			return hosttypes.PriceData{}, fmt.Errorf(
				"refresh pricing catalog for selected channel: %w",
				err,
			)
		}
		bundles = GetCandidateBundles(group, info.OriginModelName)
		selectedHasCompletePricing = false
		for _, bundle := range bundles {
			if bundle.ChannelModel.ChannelId == selectedChannelId {
				selectedHasCompletePricing = true
				break
			}
		}
	}
	if len(bundles) == 0 {
		return hosttypes.PriceData{}, fmt.Errorf(
			"model %s has no complete purchase and sales price for group %s",
			info.OriginModelName,
			group,
		)
	}
	if !selectedHasCompletePricing {
		return hosttypes.PriceData{}, errors.New("selected channel has no complete purchase and sales price")
	}
	resolvedSales, err := ResolveSalesPrice(info.UserId, info.OriginModelName, 0)
	if err != nil {
		return hosttypes.PriceData{}, fmt.Errorf("resolve sales price book: %w", err)
	}
	billingMode := resolvedSales.Item.BillingMode
	usedVars := usedPricingVars(bundles)
	for name, used := range billingexpr.UsedVars(resolvedSales.Item.SalesBillingExpr) {
		if used {
			usedVars[name] = true
		}
	}
	if !usedVars["param"] {
		requestInput.Body = nil
	}
	requestInput = billingexpr.FreezeRequestInput(requestInput)
	if maxCompletionTokens <= 0 && usedVars["c"] {
		maxCompletionTokens = defaultEstimatedCompletionTokens
	}
	usage := businessUsage
	usage.PromptTokens = float64(promptTokens)
	usage.CompletionTokens = float64(maxCompletionTokens)
	usage.RequestBody = string(requestInput.Body)
	if billingMode == "video_duration" {
		expressions := make([]string, 0, len(bundles)+1)
		for _, bundle := range bundles {
			expressions = append(expressions, bundle.Purchase.PurchaseBillingExpr)
			if bundle.Official != nil {
				expressions = append(expressions, bundle.Official.BillingExpr)
			}
		}
		expressions = append(expressions, resolvedSales.Item.SalesBillingExpr)
		if err := validateVideoPricingRequest(expressions, requestInput); err != nil {
			return hosttypes.PriceData{}, err
		}
	}
	if billingMode == "audio_duration" && usage.AudioSeconds <= 0 {
		return hosttypes.PriceData{}, errors.New("audio duration is required to calculate the price")
	}
	if billingMode == "video_duration" && usage.VideoSeconds <= 0 {
		return hosttypes.PriceData{}, errors.New("video duration is required to calculate the price")
	}
	if !pricingUsageRequirementsMet(usedVars, usage) {
		return hosttypes.PriceData{}, errors.New("request usage is incomplete for the configured price expression")
	}
	estimatedUsageJSON, err := common.Marshal(usage)
	if err != nil {
		return hosttypes.PriceData{}, err
	}
	quotes, err := quoteCandidateBundles(
		bundles,
		usage,
		requestInput,
		resolvedSales,
	)
	if err != nil {
		return hosttypes.PriceData{}, err
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
			return hosttypes.PriceData{}, err
		}
		salesAmount, err := decimal.NewFromString(quote.SalesAmount)
		if err != nil {
			return hosttypes.PriceData{}, err
		}
		customerCharge, err := decimal.NewFromString(quote.CustomerCharge)
		if err != nil {
			return hosttypes.PriceData{}, err
		}
		if customerCharge.GreaterThan(maximumCustomerCharge) {
			maximumCustomerCharge = customerCharge
		}
		officialExpression := ""
		officialExpressionHash := ""
		if bundle.Official != nil {
			officialExpression = bundle.Official.BillingExpr
			officialExpressionHash = bundle.Official.ExprHash
		}
		candidates[bundle.ChannelModel.ChannelId] = hosttypes.DynamicPriceCandidate{
			ChannelModelId:             bundle.ChannelModel.Id,
			ChannelId:                  bundle.ChannelModel.ChannelId,
			ModelId:                    bundle.ChannelModel.ModelId,
			BillingMode:                bundle.Purchase.BillingMode,
			PurchasePriceVersion:       bundle.Purchase.Id,
			PurchaseExpression:         bundle.Purchase.PurchaseBillingExpr,
			PurchaseExpressionHash:     bundle.Purchase.PurchaseExprHash,
			OfficialPriceVersion:       quote.OfficialPriceVersion,
			OfficialExpression:         officialExpression,
			OfficialExpressionHash:     officialExpressionHash,
			SalesExpression:            resolvedSales.Item.SalesBillingExpr,
			SalesExpressionHash:        resolvedSales.Item.SalesExprHash,
			PricingRevision:            bundle.Revision,
			Currency:                   resolvedSales.Book.Currency,
			ProviderCostMode:           bundle.ProviderCostMode,
			EstimatedPurchaseUSD:       purchaseAmount.String(),
			EstimatedOfficialAmountUSD: quote.OfficialAmount,
			EstimatedSalesUSD:          salesAmount.String(),
			EstimatedCustomerChargeUSD: customerCharge.String(),
			TotalVariableCostRate:      quote.TotalVariableCostRate,
			EffectiveTaxRate:           quote.EffectiveTaxRate,
			MinimumMarginRate:          quote.MinimumMarginRate,
			EstimatedNetMarginRate:     quote.EstimatedNetMarginRate,
			MarginCompliant:            quote.MeetsMinimumMargin,
			SalesPriceBookId:           resolvedSales.PriceBookId,
			SalesPriceBookVersionId:    resolvedSales.PriceBookVersionId,
			SalesPriceBookItemId:       resolvedSales.PriceBookItemId,
			PriceBookAssignmentId:      resolvedSales.AssignmentId,
			SalesPricingSource:         resolvedSales.Source,
			ChannelModelOverrideId:     quote.ChannelModelOverrideId,
			PaymentFeeRate:             quote.PaymentFeeRate,
			DistributionFeeRate:        quote.DistributionFeeRate,
			OperationsLaborRate:        quote.OperationsLaborRate,
			TargetNetMargin:            quote.TargetNetMargin,
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
		return hosttypes.PriceData{}, ErrNoEligiblePriceCandidate
	}
	maximumCustomerChargeFloat, _ := maximumCustomerCharge.Float64()
	reservationQuota, err := common.QuotaCeilStrict(
		maximumCustomerChargeFloat * common.QuotaPerUnit,
	)
	if err != nil {
		return hosttypes.PriceData{}, err
	}
	info.DynamicPricingSnapshot = &hosttypes.DynamicPricingSnapshot{
		CandidatesByChannelId:     candidates,
		RouteChannelIds:           routeChannelIds,
		ReservationQuota:          reservationQuota,
		EstimatedPromptTokens:     promptTokens,
		EstimatedCompletionTokens: maxCompletionTokens,
		Group:                     group,
		QuotaPerUnit:              common.QuotaPerUnit,
		EstimatedUsage:            string(estimatedUsageJSON),
	}
	info.BillingRequestInput = &requestInput
	info.PriceData = hosttypes.PriceData{
		QuotaToPreConsume: reservationQuota,
	}
	if selectedChannelId > 0 {
		if err := BindSelectedChannel(info, selectedChannelId); err != nil {
			return hosttypes.PriceData{}, err
		}
	}
	return info.PriceData, nil
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
		return errors.New("selected channel has no frozen price candidate")
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
		ExprString:                candidate.SalesExpression,
		ExprHash:                  candidate.SalesExpressionHash,
		GroupRatio:                1,
		EstimatedPromptTokens:     info.DynamicPricingSnapshot.EstimatedPromptTokens,
		EstimatedCompletionTokens: info.DynamicPricingSnapshot.EstimatedCompletionTokens,
		EstimatedQuotaAfterGroup:  info.DynamicPricingSnapshot.ReservationQuota,
		QuotaPerUnit:              quotaPerUnit,
		ExprVersion:               billingexpr.ExprVersion(candidate.SalesExpression),
	}
	return nil
}
