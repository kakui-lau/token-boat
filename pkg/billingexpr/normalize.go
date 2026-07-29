package billingexpr

// NormalizeTokenParams applies the shared token accounting semantics used by
// runtime settlement and administrative simulations.
//
// OpenAI-style usage reports prompt/completion totals that already contain
// cache and media subcategories. When an expression prices one of those
// subcategories explicitly, remove it from P or C to prevent double charging.
// Anthropic-style usage reports text tokens separately, so no subtraction is
// needed. Len always represents the full input context used by tier conditions.
func NormalizeTokenParams(params TokenParams, isAnthropicUsage bool, usedVars map[string]bool) TokenParams {
	if isAnthropicUsage {
		params.Len = params.P + params.CR + params.CC + params.CC1h
		return params
	}

	params.Len = params.P
	if usedVars["cr"] {
		params.P -= params.CR
	}
	if usedVars["cc"] {
		params.P -= params.CC
	}
	if usedVars["cc1h"] {
		params.P -= params.CC1h
	}
	if usedVars["img"] {
		params.P -= params.Img
	}
	if usedVars["ai"] {
		params.P -= params.AI
	}
	if usedVars["img_o"] {
		params.C -= params.ImgO
	}
	if usedVars["ao"] {
		params.C -= params.AO
	}

	if params.P < 0 {
		params.P = 0
	}
	if params.C < 0 {
		params.C = 0
	}
	return params
}
