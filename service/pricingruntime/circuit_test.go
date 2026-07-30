package pricingruntime

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func resetChannelCircuits() {
	channelCircuits.Lock()
	channelCircuits.byChannelId = make(map[int]channelCircuitState)
	channelCircuits.events = nil
	channelCircuits.nextEventId = 0
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

func TestChannelCircuitOverviewExposesStateAndTransitionHistory(t *testing.T) {
	resetChannelCircuits()
	t.Cleanup(resetChannelCircuits)
	now := time.Now()

	recordChannelFailureAt(21, 500, now)
	recordChannelFailureAt(21, 502, now)
	recordChannelFailureAt(21, 503, now)

	overview := GetChannelCircuitOverview()
	require.Len(t, overview.Channels, 1)
	assert.Equal(t, 21, overview.Channels[0].ChannelId)
	assert.Equal(t, "open", overview.Channels[0].State)
	assert.Equal(t, 3, overview.Channels[0].ConsecutiveFailures)
	require.Len(t, overview.Events, 3)
	assert.Equal(t, "opened", overview.Events[2].Event)
	assert.Equal(t, 503, overview.Events[2].StatusCode)
}

func TestChannelCircuitEventHistoryKeepsNewestBoundedEvents(t *testing.T) {
	resetChannelCircuits()
	t.Cleanup(resetChannelCircuits)
	now := time.Now()

	for i := 0; i < channelCircuitEventLimit+3; i++ {
		recordChannelFailureAt(30+i, 429, now.Add(time.Duration(i)*time.Second))
	}

	overview := GetChannelCircuitOverview()
	require.Len(t, overview.Events, channelCircuitEventLimit)
	assert.Equal(t, 33, overview.Events[0].ChannelId)
	assert.Equal(t, 30+channelCircuitEventLimit+2, overview.Events[len(overview.Events)-1].ChannelId)
}

func TestResetChannelCircuitClearsActiveStateAndRecordsAuditEvent(t *testing.T) {
	resetChannelCircuits()
	t.Cleanup(resetChannelCircuits)
	now := time.Now()
	recordChannelFailureAt(41, 429, now)

	assert.True(t, ResetChannelCircuit(41))
	assert.True(t, tryAcquireChannelAt(41, now))
	assert.False(t, ResetChannelCircuit(41))

	overview := GetChannelCircuitOverview()
	assert.Empty(t, overview.Channels)
	require.Len(t, overview.Events, 2)
	assert.Equal(t, "manual_reset", overview.Events[1].Event)
}
