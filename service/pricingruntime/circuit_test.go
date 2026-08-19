package pricingruntime

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/alicebob/miniredis/v2"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func useCircuitMiniRedis(t *testing.T) {
	t.Helper()
	server := miniredis.RunT(t)
	originalEnabled, originalClient := common.RedisEnabled, common.RDB
	common.RedisEnabled = true
	common.RDB = redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() {
		_ = common.RDB.Close()
		common.RedisEnabled, common.RDB = originalEnabled, originalClient
	})
}

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
	require.Len(t, overview.Channels, 1)
	assert.Equal(t, "monitoring", overview.Channels[0].State)
	assert.Equal(t, int64(1), overview.Channels[0].FailureCount)
	require.Len(t, overview.Events, 2)
	assert.Equal(t, "manual_reset", overview.Events[1].Event)
}

func TestRemoveChannelCircuitDropsLiveState(t *testing.T) {
	resetChannelCircuits()
	t.Cleanup(resetChannelCircuits)

	RecordChannelFailure(43, 500)
	require.Len(t, GetChannelCircuitOverview().Channels, 1)

	RemoveChannelCircuit(43)
	assert.Empty(t, GetChannelCircuitOverview().Channels)
}

func TestChannelCircuitRedisSharesStateMetricsAndEventsAcrossInstances(t *testing.T) {
	useCircuitMiniRedis(t)

	RecordChannelFailure(51, 500)
	RecordChannelFailure(51, 502)
	RecordChannelFailure(51, 503)
	assert.False(t, TryAcquireChannel(51))

	overview := GetChannelCircuitOverview()
	require.Len(t, overview.Channels, 1)
	assert.Equal(t, "open", overview.Channels[0].State)
	assert.Equal(t, int64(3), overview.Channels[0].FailureCount)
	require.Len(t, overview.Events, 3)

	RecordChannelSuccessWithLatency(51, 240*time.Millisecond)
	overview = GetChannelCircuitOverview()
	require.Len(t, overview.Channels, 1)
	assert.Equal(t, "monitoring", overview.Channels[0].State)
	assert.Equal(t, int64(1), overview.Channels[0].SuccessCount)
	assert.Equal(t, float64(240), overview.Channels[0].AverageLatencyMs)
	assert.Equal(t, "recovered", overview.Events[len(overview.Events)-1].Event)

	metrics := GetChannelRouteMetrics(51)
	assert.Equal(t, float64(240), metrics.AverageLatencyMs)
	assert.InDelta(t, float64(100)/104, metrics.SuccessRate, 0.0001)

	RemoveChannelCircuit(51)
	assert.Empty(t, GetChannelCircuitOverview().Channels)
}

func TestChannelCircuitRedisIgnoresClientErrors(t *testing.T) {
	useCircuitMiniRedis(t)

	RecordChannelFailure(52, 400)

	overview := GetChannelCircuitOverview()
	assert.Empty(t, overview.Channels)
	assert.Empty(t, overview.Events)
}

func TestPersistentCircuitEventsAreRetainedAndPurgedInBatches(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	require.NoError(t, storeCircuitEvent(ChannelCircuitEvent{
		ChannelId: 81, Event: "opened", StatusCode: 500, OccurredAt: 100,
	}))
	require.NoError(t, storeCircuitEvent(ChannelCircuitEvent{
		ChannelId: 82, Event: "recovered", OccurredAt: 200,
	}))

	deleted, err := PurgePricingCircuitEvents(150, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(1), deleted)

	var remaining []model.PricingCircuitEvent
	require.NoError(t, model.DB.Order("id ASC").Find(&remaining).Error)
	require.Len(t, remaining, 1)
	assert.Equal(t, 82, remaining[0].ChannelId)
	assert.Equal(t, "recovered", remaining[0].Event)
}
