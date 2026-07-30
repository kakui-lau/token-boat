package pricingruntime

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
)

func ShadowComparisonEnabled() bool {
	common.OptionMapRWMutex.RLock()
	shadowText := common.OptionMap["PricingV2ShadowEnabled"]
	common.OptionMapRWMutex.RUnlock()
	return strings.EqualFold(strings.TrimSpace(shadowText), "true")
}
