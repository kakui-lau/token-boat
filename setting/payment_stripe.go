package setting

const (
	StripeTopupPricingModeQuantityPrice = "quantity_price"
	StripeTopupPricingModeInlinePrice   = "inline_price"
)

var StripeApiSecret = ""
var StripeWebhookSecret = ""
var StripePriceId = ""
var StripeTopupPricingMode = StripeTopupPricingModeQuantityPrice
var StripeTopupProductId = ""
var StripeCurrency = "usd"
var StripeUnitPrice = 8.0
var StripeMinTopUp = 1
var StripePromotionCodesEnabled = false

func NormalizeStripeTopupPricingMode(mode string) string {
	switch mode {
	case StripeTopupPricingModeInlinePrice:
		return StripeTopupPricingModeInlinePrice
	default:
		return StripeTopupPricingModeQuantityPrice
	}
}
