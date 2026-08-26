package pricingruntime

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
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
	channelCircuits.byChannelId = make(map[int]map[int]channelCircuitState)
	channelCircuits.events = nil
	channelCircuits.nextEventId = 0
	channelCircuits.Unlock()
}

func TestChannelCircuitOpensAfterConsecutiveFailuresAndRecovers(t *testing.T) {
	resetChannelCircuits()
	t.Cleanup(resetChannelCircuits)
	now := time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC)

	recordChannelFailureAt(11, 1, 500, now)
	recordChannelFailureAt(11, 1, 502, now)
	assert.True(t, tryAcquireChannelAt(11, 1, now))
	recordChannelFailureAt(11, 1, 0, now)
	assert.False(t, tryAcquireChannelAt(11, 1, now))
	assert.True(t, tryAcquireChannelAt(11, 1, now.Add(channelFailureCooldown)))
	assert.False(t, tryAcquireChannelAt(11, 1, now.Add(channelFailureCooldown)))

	RecordChannelSuccess(11, 1)
	assert.True(t, tryAcquireChannelAt(11, 1, now))
}

func TestChannelCircuitIsModelScopedWithinSameChannel(t *testing.T) {
	resetChannelCircuits()
	t.Cleanup(resetChannelCircuits)
	now := time.Now()

	// Model 2 on channel 11 trips, model 1 on the same channel must stay open.
	recordChannelFailureAt(11, 2, 500, now)
	recordChannelFailureAt(11, 2, 502, now)
	recordChannelFailureAt(11, 2, 503, now)
	assert.False(t, tryAcquireChannelAt(11, 2, now))
	assert.True(t, tryAcquireChannelAt(11, 1, now))

	overview := GetChannelCircuitOverview()
	require.Len(t, overview.Channels, 1)
	assert.Equal(t, 11, overview.Channels[0].ChannelId)
	assert.Equal(t, 2, overview.Channels[0].ModelId)
	assert.Equal(t, "open", overview.Channels[0].State)
}

func TestChannelCircuitUsesIndependentRateLimitCooldown(t *testing.T) {
	resetChannelCircuits()
	t.Cleanup(resetChannelCircuits)
	now := time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC)

	recordChannelFailureAt(12, 1, 429, now)
	assert.False(t, tryAcquireChannelAt(12, 1, now.Add(channelRateLimitCooldown-time.Millisecond)))
	assert.True(t, tryAcquireChannelAt(12, 1, now.Add(channelRateLimitCooldown)))
}

func TestChannelCircuitIgnoresClientErrors(t *testing.T) {
	resetChannelCircuits()
	t.Cleanup(resetChannelCircuits)
	now := time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC)

	recordChannelFailureAt(13, 1, 400, now)
	assert.True(t, tryAcquireChannelAt(13, 1, now))
}

func TestDisabledCircuitMonitoringKeepsChannelsEligibleAndStopsRecording(t *testing.T) {
	resetChannelCircuits()
	setting := operation_setting.GetMonitorSetting()
	originalEnabled := setting.CircuitBreakerEnabled
	setting.CircuitBreakerEnabled = true
	circuitMonitoringWasEnabled.Store(true)
	t.Cleanup(func() {
		setting.CircuitBreakerEnabled = originalEnabled
		circuitMonitoringWasEnabled.Store(true)
		resetChannelCircuits()
	})

	RecordChannelFailure(14, 1, 500)
	RecordChannelFailure(14, 1, 502)
	RecordChannelFailure(14, 1, 503)
	assert.False(t, TryAcquireChannel(14, 1))

	setting.CircuitBreakerEnabled = false
	assert.True(t, TryAcquireChannel(14, 1))
	disabledOverview := GetChannelCircuitOverview()
	assert.False(t, disabledOverview.Enabled)
	assert.Empty(t, disabledOverview.Channels)
	assert.Equal(t, ChannelRouteMetrics{
		SuccessRate:      0.99,
		AverageLatencyMs: 1000,
	}, GetChannelRouteMetrics(14, 1))

	RecordChannelFailure(14, 1, 503)
	RecordChannelSuccessWithLatency(14, 1, 250*time.Millisecond)
	setting.CircuitBreakerEnabled = true
	assert.True(t, TryAcquireChannel(14, 1))
	enabledOverview := GetChannelCircuitOverview()
	assert.True(t, enabledOverview.Enabled)
	assert.Empty(t, enabledOverview.Channels)
}

func TestChannelCircuitOverviewExposesStateAndTransitionHistory(t *testing.T) {
	resetChannelCircuits()
	t.Cleanup(resetChannelCircuits)
	now := time.Now()

	recordChannelFailureAt(21, 1, 500, now)
	recordChannelFailureAt(21, 1, 502, now)
	recordChannelFailureAt(21, 1, 503, now)

	overview := GetChannelCircuitOverview()
	require.Len(t, overview.Channels, 1)
	assert.Equal(t, 21, overview.Channels[0].ChannelId)
	assert.Equal(t, 1, overview.Channels[0].ModelId)
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
		recordChannelFailureAt(30+i, 1, 429, now.Add(time.Duration(i)*time.Second))
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
	recordChannelFailureAt(41, 1, 429, now)

	assert.True(t, ResetChannelCircuit(41, 1))
	assert.True(t, tryAcquireChannelAt(41, 1, now))
	assert.False(t, ResetChannelCircuit(41, 1))

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

	RecordChannelFailure(43, 1, 500)
	RecordChannelFailure(43, 2, 502)
	require.Len(t, GetChannelCircuitOverview().Channels, 2)

	RemoveChannelCircuit(43)
	assert.Empty(t, GetChannelCircuitOverview().Channels)
}

func TestChannelCircuitRedisSharesStateMetricsAndEventsAcrossInstances(t *testing.T) {
	useCircuitMiniRedis(t)

	RecordChannelFailure(51, 1, 500)
	RecordChannelFailure(51, 1, 502)
	RecordChannelFailure(51, 1, 503)
	assert.False(t, TryAcquireChannel(51, 1))

	overview := GetChannelCircuitOverview()
	require.Len(t, overview.Channels, 1)
	assert.Equal(t, "open", overview.Channels[0].State)
	assert.Equal(t, int64(3), overview.Channels[0].FailureCount)
	require.Len(t, overview.Events, 3)

	RecordChannelSuccessWithLatency(51, 1, 240*time.Millisecond)
	overview = GetChannelCircuitOverview()
	require.Len(t, overview.Channels, 1)
	assert.Equal(t, "monitoring", overview.Channels[0].State)
	assert.Equal(t, int64(1), overview.Channels[0].SuccessCount)
	assert.Equal(t, float64(240), overview.Channels[0].AverageLatencyMs)
	assert.Equal(t, "recovered", overview.Events[len(overview.Events)-1].Event)

	metrics := GetChannelRouteMetrics(51, 1)
	assert.Equal(t, float64(240), metrics.AverageLatencyMs)
	assert.InDelta(t, float64(100)/104, metrics.SuccessRate, 0.0001)

	RemoveChannelCircuit(51)
	assert.Empty(t, GetChannelCircuitOverview().Channels)
}

func TestChannelCircuitRedisIgnoresClientErrors(t *testing.T) {
	useCircuitMiniRedis(t)

	RecordChannelFailure(52, 1, 400)

	overview := GetChannelCircuitOverview()
	assert.Empty(t, overview.Channels)
	assert.Empty(t, overview.Events)
}

func TestPersistentCircuitEventsAreRetainedAndPurgedInBatches(t *testing.T) {
	setupRuntimeCatalogTestDB(t)
	require.NoError(t, storeCircuitEvent(ChannelCircuitEvent{
		ChannelId: 81, ModelId: 1, Event: "opened", StatusCode: 500, OccurredAt: 100,
	}))
	require.NoError(t, storeCircuitEvent(ChannelCircuitEvent{
		ChannelId: 82, ModelId: 2, Event: "recovered", OccurredAt: 200,
	}))

	deleted, err := PurgePricingCircuitEvents(150, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(1), deleted)

	var remaining []model.PricingCircuitEvent
	require.NoError(t, model.DB.Order("id ASC").Find(&remaining).Error)
	require.Len(t, remaining, 1)
	assert.Equal(t, 82, remaining[0].ChannelId)
	assert.Equal(t, 2, remaining[0].ModelId)
	assert.Equal(t, "recovered", remaining[0].Event)
}
