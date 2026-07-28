package billingexpr

import "github.com/QuantumNous/new-api/common"

// quotaConversion converts raw expression output to quota based on the
// expression version. This is the central dispatch point for future versions
// that may use a different conversion formula.
func quotaConversion(exprOutput float64, snap *BillingSnapshot) float64 {
	switch snap.ExprVersion {
	case 2:
		// V2 expressions normalize every component to an actual currency
		// amount. Token rules include their own per-million divisor.
		return exprOutput * snap.QuotaPerUnit
	default: // v1: coefficients are $/1M tokens prices
		return exprOutput / 1_000_000 * snap.QuotaPerUnit
	}
}

// CurrencyAmount converts an expression result to its actual currency amount.
// V1 returns a per-million-token weighted value; V2 returns currency directly.
func CurrencyAmount(exprString string, exprOutput float64) float64 {
	if ExprVersion(exprString) == 2 {
		return exprOutput
	}
	return exprOutput / 1_000_000
}

// ComputeTieredQuota runs the Expr from a frozen BillingSnapshot against
// actual token counts and returns the settlement result.
func ComputeTieredQuota(snap *BillingSnapshot, params TokenParams) (TieredResult, error) {
	return ComputeTieredQuotaWithRequest(snap, params, RequestInput{})
}

func ComputeTieredQuotaWithRequest(snap *BillingSnapshot, params TokenParams, request RequestInput) (TieredResult, error) {
	cost, trace, err := RunExprByHashWithRequest(snap.ExprString, snap.ExprHash, params, request)
	if err != nil {
		return TieredResult{}, err
	}

	quotaBeforeGroup := quotaConversion(cost, snap)
	afterGroup, clamp := common.QuotaRoundChecked(quotaBeforeGroup * snap.GroupRatio)
	crossed := trace.MatchedTier != snap.EstimatedTier

	return TieredResult{
		ActualQuotaBeforeGroup: quotaBeforeGroup,
		ActualQuotaAfterGroup:  afterGroup,
		MatchedTier:            trace.MatchedTier,
		CrossedTier:            crossed,
		Clamp:                  clamp,
	}, nil
}
