package pricingruntime

import (
	"math"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service/pricingengine"
	hosttypes "github.com/QuantumNous/new-api/types"
)

func BuildShadowComparison(
	info *relaycommon.RelayInfo,
	group string,
	promptTokens int,
	maxCompletionTokens int,
	legacyReservationQuota int,
	groupRatio float64,
	requestInput billingexpr.RequestInput,
	businessUsage pricingengine.Usage,
) (*hosttypes.PricingShadowComparison, error) {
	if !ShadowComparisonEnabled() {
		return nil, nil
	}
	bundles := GetCandidateBundles(group, info.OriginModelName)
	if len(bundles) == 0 {
		return nil, nil
	}
	usedVars := usedPricingVars(bundles)
	if maxCompletionTokens <= 0 && groupRatio != 0 && usedVars["c"] {
		maxCompletionTokens = defaultEstimatedCompletionTokens
	}
	usage := businessUsage
	usage.PromptTokens = float64(promptTokens)
	usage.CompletionTokens = float64(maxCompletionTokens)
	usage.RequestBody = string(requestInput.Body)
	if !pricingUsageRequirementsMet(usedVars, usage) {
		return nil, nil
	}
	quotes, err := QuoteCandidatesWithRequest(
		group,
		info.OriginModelName,
		usage,
		requestInput,
	)
	if err != nil {
		return nil, nil
	}
	maximumRetail := 0.0
	hasEligibleCandidate := false
	for _, quote := range quotes {
		if !quote.MeetsMinimumMargin {
			continue
		}
		hasEligibleCandidate = true
		amount, parseErr := strconv.ParseFloat(quote.RetailAmount, 64)
		if parseErr != nil {
			return nil, parseErr
		}
		if amount > maximumRetail {
			maximumRetail = amount
		}
	}
	if !hasEligibleCandidate {
		return nil, nil
	}
	v2Quota, err := billingexpr.QuotaRoundStrict(
		maximumRetail * common.QuotaPerUnit * groupRatio,
	)
	if err != nil {
		return nil, err
	}
	delta := v2Quota - legacyReservationQuota
	deltaRate := 0.0
	if legacyReservationQuota != 0 {
		deltaRate = float64(delta) / math.Abs(float64(legacyReservationQuota))
	}
	comparison := &hosttypes.PricingShadowComparison{
		LegacyReservationQuota: legacyReservationQuota,
		V2ReservationQuota:     v2Quota,
		DeltaQuota:             delta,
		DeltaRate:              deltaRate,
	}
	info.PricingShadowComparison = comparison
	return comparison, nil
}
