package pricingruntime

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func resetChannelCircuits() {
	channelCircuits.Lock()
	channelCircuits.byChannelId = make(map[int]channelCircuitState)
	channelCircuits.Unlock()
}

func TestChannelCircuitOpensAfterConsecutiveFailuresAndRecovers(t *testing.T) {
	resetChannelCircuits()
	t.Cleanup(resetChannelCircuits)
	now := time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC)

	recordChannelFailureAt(11, 500, now)
	recordChannelFailureAt(11, 502, now)
	assert.True(t, tryAcquireChannelAt(11, now))
	recordChannelFailureAt(11, 0, now)
	assert.False(t, tryAcquireChannelAt(11, now))
	assert.True(t, tryAcquireChannelAt(11, now.Add(channelFailureCooldown)))
	assert.False(t, tryAcquireChannelAt(11, now.Add(channelFailureCooldown)))

	RecordChannelSuccess(11)
	assert.True(t, tryAcquireChannelAt(11, now))
}

func TestChannelCircuitUsesIndependentRateLimitCooldown(t *testing.T) {
	resetChannelCircuits()
	t.Cleanup(resetChannelCircuits)
	now := time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC)

	recordChannelFailureAt(12, 429, now)
	assert.False(t, tryAcquireChannelAt(12, now.Add(channelRateLimitCooldown-time.Millisecond)))
	assert.True(t, tryAcquireChannelAt(12, now.Add(channelRateLimitCooldown)))
}

func TestChannelCircuitIgnoresClientErrors(t *testing.T) {
	resetChannelCircuits()
	t.Cleanup(resetChannelCircuits)
	now := time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC)

	recordChannelFailureAt(13, 400, now)
	assert.True(t, tryAcquireChannelAt(13, now))
}
