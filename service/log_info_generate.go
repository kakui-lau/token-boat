package service

import (
	"encoding/base64"
	"fmt"
	"math"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service/pricingruntime"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

// attachQuotaSaturationToOther nests a quota saturation marker under
// other.admin_info.quota_saturation. Nesting under admin_info makes it
// admin-only for free, since model.formatUserLogs strips the whole admin_info
// object for non-admin viewers. Creates admin_info if absent. No-op when the
// clamp is nil (the common case: no saturation happened).
func attachQuotaSaturationToOther(other map[string]interface{}, clamp *common.QuotaClamp) {
	if clamp == nil || other == nil {
		return
	}
	adminInfo, ok := other["admin_info"].(map[string]interface{})
	if !ok || adminInfo == nil {
		adminInfo = map[string]interface{}{}
		other["admin_info"] = adminInfo
	}
	adminInfo["quota_saturation"] = clamp.AuditMap()
}

// attachQuotaSaturation records the request's quota clamp (if any) onto the
// consume log's other.admin_info and emits a request-correlated backend audit
// line. Called right before RecordConsumeLog on the text/audio/wss paths.
func attachQuotaSaturation(ctx *gin.Context, relayInfo *relaycommon.RelayInfo, other map[string]interface{}) {
	if relayInfo == nil {
		return
	}
	clamp := relayInfo.QuotaClamp
	if clamp == nil {
		return
	}
	attachQuotaSaturationToOther(other, clamp)
	logger.LogWarn(ctx, fmt.Sprintf("quota saturation on consume log: op=%s kind=%s original=%g clamped=%d user=%d model=%s",
		clamp.Op, clamp.Kind, clamp.Original, clamp.Clamped, relayInfo.UserId, relayInfo.OriginModelName))
}

// InjectGeneralBillingAudit adds customer billing reconciliation to every
// synchronous usage log. OpenRouter's usage.cost is supplier cost, so it is
// admin-only and never used as the customer charge.
func InjectGeneralBillingAudit(other map[string]interface{}, relayInfo *relaycommon.RelayInfo, finalQuota int, usage *dto.Usage) {
	if other == nil || relayInfo == nil {
		return
	}
	estimatedQuota := relayInfo.PriceData.QuotaToPreConsume
	if estimatedQuota == 0 {
		estimatedQuota = relayInfo.FinalPreConsumedQuota
	}
	other["billing_stage"] = "completed"
	other["local_estimated_quota"] = estimatedQuota
	other["actual_pre_consumed_quota"] = relayInfo.FinalPreConsumedQuota
	chargedQuota := finalQuota
	if relayInfo.SettlementStatus == "failed" {
		chargedQuota = relayInfo.FinalPreConsumedQuota
		other["billing_stage"] = "settlement_failed"
		other["customer_final_quota"] = chargedQuota
		other["adjustment_quota"] = 0
		other["outstanding_quota"] = finalQuota - relayInfo.FinalPreConsumedQuota
		adminInfo, _ := other["admin_info"].(map[string]interface{})
		if adminInfo == nil {
			adminInfo = make(map[string]interface{})
			other["admin_info"] = adminInfo
		}
		adminInfo["settlement_error"] = relayInfo.SettlementError
	} else {
		other["customer_final_quota"] = finalQuota
		other["adjustment_quota"] = finalQuota - relayInfo.FinalPreConsumedQuota
	}
	quotaPerUnit := common.QuotaPerUnit
	if snapshot := relayInfo.DynamicPricingSnapshot; snapshot != nil && snapshot.QuotaPerUnit > 0 {
		quotaPerUnit = snapshot.QuotaPerUnit
	}
	if quotaPerUnit > 0 {
		other["quota_per_unit"] = quotaPerUnit
	}
	if snapshot := relayInfo.DynamicPricingSnapshot; snapshot != nil && snapshot.Selected != nil {
		other["billing_mode"] = "sales_price_book"
		adminInfo, _ := other["admin_info"].(map[string]interface{})
		if adminInfo == nil {
			adminInfo = make(map[string]interface{})
			other["admin_info"] = adminInfo
		}
		adminInfo["channel_model_id"] = snapshot.Selected.ChannelModelId
		adminInfo["pricing_billing_mode"] = snapshot.Selected.BillingMode
		adminInfo["purchase_price_version_id"] = snapshot.Selected.PurchasePriceVersion
		adminInfo["sales_price_book_id"] = snapshot.Selected.SalesPriceBookId
		adminInfo["sales_price_book_version_id"] = snapshot.Selected.SalesPriceBookVersionId
		adminInfo["sales_price_book_item_id"] = snapshot.Selected.SalesPriceBookItemId
		adminInfo["pricing_revision"] = snapshot.Selected.PricingRevision
		adminInfo["estimated_purchase_usd"] = snapshot.Selected.EstimatedPurchaseUSD
		adminInfo["estimated_sales_usd"] = snapshot.Selected.EstimatedSalesUSD
		adminInfo["estimated_customer_charge_usd"] = snapshot.Selected.EstimatedCustomerChargeUSD
		adminInfo["provider_cost_mode"] = snapshot.Selected.ProviderCostMode
		adminInfo["provider_cost_status"] = model.InitialProviderCostStatus(snapshot.Selected.ProviderCostMode)
		adminInfo["applied_group"] = snapshot.Group
		adminInfo["minimum_margin_rate"] = snapshot.Selected.MinimumMarginRate
		adminInfo["estimated_net_margin_rate"] = snapshot.Selected.EstimatedNetMarginRate
		if snapshot.QuotaPerUnit > 0 {
			adminInfo["customer_charge_usd"] = float64(chargedQuota) / snapshot.QuotaPerUnit
			adminInfo["quota_per_unit"] = snapshot.QuotaPerUnit
		}
	}
	if relayInfo.ChannelMeta == nil || relayInfo.ChannelType != constant.ChannelTypeOpenRouter || usage == nil {
		return
	}
	providerCost, ok := usage.Cost.(float64)
	if !ok || providerCost < 0 || math.IsNaN(providerCost) || math.IsInf(providerCost, 0) || quotaPerUnit <= 0 {
		return
	}
	adminInfo, _ := other["admin_info"].(map[string]interface{})
	if adminInfo == nil {
		adminInfo = make(map[string]interface{})
		other["admin_info"] = adminInfo
	}
	adminInfo["provider_cost_usd"] = providerCost
	adminInfo["provider_cost_known"] = true
	adminInfo["provider_cost_status"] = model.ProviderCostStatusConfirmed
	adminInfo["provider_cost_source"] = model.ProviderCostSourceResponse
	if usage.IsByok != nil {
		adminInfo["provider_is_byok"] = *usage.IsByok
	}
	isByok := usage.IsByok != nil && *usage.IsByok
	providerCostScope := "full_provider_cost"
	if isByok {
		providerCostScope = "platform_fee_only"
		adminInfo["provider_cost_scope"] = "platform_fee_only"
		adminInfo["gross_margin_known"] = false
	} else if relayInfo.BillingSource == BillingSourceSubscription {
		adminInfo["gross_margin_basis"] = "subscription_quota_value"
		adminInfo["gross_margin_known"] = false
	} else {
		adminInfo["gross_margin_basis"] = "customer_charge"
		adminInfo["gross_margin_known"] = true
		adminInfo["gross_margin_usd"] = float64(chargedQuota)/quotaPerUnit - providerCost
	}
	if relayInfo.DynamicPricingSnapshot != nil {
		if err := pricingruntime.RecordProviderReportedCostWithSource(
			relayInfo.RequestId,
			decimal.NewFromFloat(providerCost),
			providerCostScope,
			model.ProviderCostSourceResponse,
		); err != nil {
			common.SysError(fmt.Sprintf(
				"record provider cost on pricing snapshot failed: request=%s error=%s",
				relayInfo.RequestId,
				err.Error(),
			))
		}
	}
}

func appendRequestPath(ctx *gin.Context, relayInfo *relaycommon.RelayInfo, other map[string]interface{}) {
	if other == nil {
		return
	}
	if ctx != nil && ctx.Request != nil && ctx.Request.URL != nil {
		if path := ctx.Request.URL.Path; path != "" {
			other["request_path"] = path
			return
		}
	}
	if relayInfo != nil && relayInfo.RequestURLPath != "" {
		path := relayInfo.RequestURLPath
		if idx := strings.Index(path, "?"); idx != -1 {
			path = path[:idx]
		}
		other["request_path"] = path
	}
}

func GenerateTextOtherInfo(ctx *gin.Context, relayInfo *relaycommon.RelayInfo) map[string]interface{} {
	other := make(map[string]interface{})
	other["frt"] = float64(relayInfo.FirstResponseTime.UnixMilli() - relayInfo.StartTime.UnixMilli())
	if relayInfo.RequestedModelName != "" && relayInfo.RequestedModelName != relayInfo.OriginModelName {
		other["requested_model_name"] = relayInfo.RequestedModelName
		other["resolved_model_name"] = relayInfo.OriginModelName
	}
	if relayInfo.ReasoningEffort != "" {
		other["reasoning_effort"] = relayInfo.ReasoningEffort
	}
	if relayInfo.IsModelMapped {
		other["is_model_mapped"] = true
		other["upstream_model_name"] = relayInfo.UpstreamModelName
	}

	isSystemPromptOverwritten := common.GetContextKeyBool(ctx, constant.ContextKeySystemPromptOverride)
	if isSystemPromptOverwritten {
		other["is_system_prompt_overwritten"] = true
	}

	adminInfo := make(map[string]interface{})
	adminInfo["use_channel"] = ctx.GetStringSlice("use_channel")
	isMultiKey := common.GetContextKeyBool(ctx, constant.ContextKeyChannelIsMultiKey)
	if isMultiKey {
		adminInfo["is_multi_key"] = true
		adminInfo["multi_key_index"] = common.GetContextKeyInt(ctx, constant.ContextKeyChannelMultiKeyIndex)
	}

	isLocalCountTokens := common.GetContextKeyBool(ctx, constant.ContextKeyLocalCountTokens)
	if isLocalCountTokens {
		adminInfo["local_count_tokens"] = isLocalCountTokens
	}

	AppendChannelAffinityAdminInfo(ctx, adminInfo)

	other["admin_info"] = adminInfo
	appendRequestPath(ctx, relayInfo, other)
	appendRequestConversionChain(relayInfo, other)
	appendFinalRequestFormat(relayInfo, other)
	appendBillingInfo(relayInfo, other)
	appendParamOverrideInfo(relayInfo, other)
	appendStreamStatus(relayInfo, other)
	return other
}

func appendParamOverrideInfo(relayInfo *relaycommon.RelayInfo, other map[string]interface{}) {
	if relayInfo == nil || other == nil || len(relayInfo.ParamOverrideAudit) == 0 {
		return
	}
	other["po"] = relayInfo.ParamOverrideAudit
}

func appendStreamStatus(relayInfo *relaycommon.RelayInfo, other map[string]interface{}) {
	if relayInfo == nil || other == nil || !relayInfo.IsStream || relayInfo.StreamStatus == nil {
		return
	}
	ss := relayInfo.StreamStatus
	status := "ok"
	if !ss.IsNormalEnd() || ss.HasErrors() {
		status = "error"
	}
	streamInfo := map[string]interface{}{
		"status":     status,
		"end_reason": string(ss.EndReason),
	}
	if ss.EndError != nil {
		streamInfo["end_error"] = ss.EndError.Error()
	}
	if ss.ErrorCount > 0 {
		streamInfo["error_count"] = ss.ErrorCount
		messages := make([]string, 0, len(ss.Errors))
		for _, e := range ss.Errors {
			messages = append(messages, e.Message)
		}
		streamInfo["errors"] = messages
	}
	other["stream_status"] = streamInfo
}

func appendBillingInfo(relayInfo *relaycommon.RelayInfo, other map[string]interface{}) {
	if relayInfo == nil || other == nil {
		return
	}
	// billing_source: "wallet" or "subscription"
	if relayInfo.BillingSource != "" {
		other["billing_source"] = relayInfo.BillingSource
	}
	if relayInfo.UserSetting.BillingPreference != "" {
		other["billing_preference"] = relayInfo.UserSetting.BillingPreference
	}
	if relayInfo.BillingSource == "subscription" {
		if relayInfo.SubscriptionId != 0 {
			other["subscription_id"] = relayInfo.SubscriptionId
		}
		if relayInfo.SubscriptionPreConsumed > 0 {
			other["subscription_pre_consumed"] = relayInfo.SubscriptionPreConsumed
		}
		// post_delta: settlement delta applied after actual usage is known (can be negative for refund)
		if relayInfo.SubscriptionPostDelta != 0 {
			other["subscription_post_delta"] = relayInfo.SubscriptionPostDelta
		}
		if relayInfo.SubscriptionPlanId != 0 {
			other["subscription_plan_id"] = relayInfo.SubscriptionPlanId
		}
		if relayInfo.SubscriptionPlanTitle != "" {
			other["subscription_plan_title"] = relayInfo.SubscriptionPlanTitle
		}
		// Compute "this request" subscription consumed + remaining
		consumed := relayInfo.SubscriptionPreConsumed + relayInfo.SubscriptionPostDelta
		usedFinal := relayInfo.SubscriptionAmountUsedAfterPreConsume + relayInfo.SubscriptionPostDelta
		if consumed < 0 {
			consumed = 0
		}
		if usedFinal < 0 {
			usedFinal = 0
		}
		if relayInfo.SubscriptionAmountTotal > 0 {
			remain := relayInfo.SubscriptionAmountTotal - usedFinal
			if remain < 0 {
				remain = 0
			}
			other["subscription_total"] = relayInfo.SubscriptionAmountTotal
			other["subscription_used"] = usedFinal
			other["subscription_remain"] = remain
		}
		if consumed > 0 {
			other["subscription_consumed"] = consumed
		}
		// Wallet quota is not deducted when billed from subscription.
		other["wallet_quota_deducted"] = 0
	}
}

func appendRequestConversionChain(relayInfo *relaycommon.RelayInfo, other map[string]interface{}) {
	if relayInfo == nil || other == nil {
		return
	}
	if len(relayInfo.RequestConversionChain) == 0 {
		return
	}
	chain := make([]string, 0, len(relayInfo.RequestConversionChain))
	for _, f := range relayInfo.RequestConversionChain {
		switch f {
		case types.RelayFormatOpenAI:
			chain = append(chain, "OpenAI Compatible")
		case types.RelayFormatClaude:
			chain = append(chain, "Claude Messages")
		case types.RelayFormatGemini:
			chain = append(chain, "Google Gemini")
		case types.RelayFormatOpenAIResponses:
			chain = append(chain, "OpenAI Responses")
		default:
			chain = append(chain, string(f))
		}
	}
	if len(chain) == 0 {
		return
	}
	other["request_conversion"] = chain
}

func appendFinalRequestFormat(relayInfo *relaycommon.RelayInfo, other map[string]interface{}) {
	if relayInfo == nil || other == nil {
		return
	}
	if relayInfo.GetFinalRequestRelayFormat() == types.RelayFormatClaude {
		// claude indicates the final upstream request format is Claude Messages.
		// Frontend log rendering uses this to keep the original Claude input display.
		other["claude"] = true
	}
}

func GenerateWssOtherInfo(ctx *gin.Context, relayInfo *relaycommon.RelayInfo, usage *dto.RealtimeUsage) map[string]interface{} {
	info := GenerateTextOtherInfo(ctx, relayInfo)
	info["ws"] = true
	info["audio_input"] = usage.InputTokenDetails.AudioTokens
	info["audio_output"] = usage.OutputTokenDetails.AudioTokens
	info["text_input"] = usage.InputTokenDetails.TextTokens
	info["text_output"] = usage.OutputTokenDetails.TextTokens
	return info
}

func GenerateMjOtherInfo(relayInfo *relaycommon.RelayInfo) map[string]interface{} {
	other := make(map[string]interface{})
	appendRequestPath(nil, relayInfo, other)
	return other
}

// InjectTieredBillingInfo overlays tiered billing fields onto an existing
// module-specific other map. Call this after GenerateTextOtherInfo /
// GenerateClaudeOtherInfo / etc. when the request used tiered_expr billing.
func InjectTieredBillingInfo(other map[string]interface{}, relayInfo *relaycommon.RelayInfo, result *billingexpr.TieredResult) {
	if relayInfo == nil || other == nil {
		return
	}
	snap := relayInfo.TieredBillingSnapshot
	if snap == nil {
		return
	}
	other["billing_mode"] = "tiered_expr"
	other["expr_b64"] = base64.StdEncoding.EncodeToString([]byte(snap.ExprString))
	if result != nil {
		other["matched_tier"] = result.MatchedTier
	}
}
