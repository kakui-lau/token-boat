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
) (*hosttypes.PricingShadowComparison, error) {
	if !CurrentRolloutPolicy().ShadowEnabled {
		return nil, nil
	}
	if maxCompletionTokens <= 0 && groupRatio != 0 {
		maxCompletionTokens = defaultEstimatedCompletionTokens
	}
	quotes, err := QuoteCandidates(group, info.OriginModelName, pricingengine.Usage{
		PromptTokens:     float64(promptTokens),
		CompletionTokens: float64(maxCompletionTokens),
		RequestBody:      string(requestInput.Body),
	})
	if err != nil {
		return nil, nil
	}
	maximumRetail := 0.0
	for _, quote := range quotes {
		amount, parseErr := strconv.ParseFloat(quote.RetailAmount, 64)
		if parseErr != nil {
			return nil, parseErr
		}
		if amount > maximumRetail {
			maximumRetail = amount
		}
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
