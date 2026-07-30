package pricingruntime

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
)

func setRolloutOptionsForTest(t *testing.T, options map[string]string) {
	t.Helper()
	common.OptionMapRWMutex.Lock()
	original := common.OptionMap
	common.OptionMap = options
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = original
		common.OptionMapRWMutex.Unlock()
	})
}

func TestRolloutAllowsInternalUserBeforeGroupAndPercentage(t *testing.T) {
	setRolloutOptionsForTest(t, map[string]string{
		"PricingV2RolloutPercent": "0",
		"PricingV2RolloutGroups":  "vip",
		"PricingV2RolloutUserIds": "42",
	})

	assert.True(t, ShouldUseV2(42, "default", "request", "model"))
	assert.False(t, ShouldUseV2(43, "default", "request", "model"))
}

func TestRolloutPercentageIsDeterministic(t *testing.T) {
	setRolloutOptionsForTest(t, map[string]string{
		"PricingV2RolloutPercent": "10",
	})
	first := ShouldUseV2(7, "default", "request-a", "model")
	assert.Equal(t, first, ShouldUseV2(7, "default", "request-a", "model"))
}

func TestInvalidRolloutPercentageFailsClosed(t *testing.T) {
	setRolloutOptionsForTest(t, map[string]string{
		"PricingV2RolloutPercent": "101",
	})
	assert.False(t, ShouldUseV2(1, "default", "request", "model"))
}
