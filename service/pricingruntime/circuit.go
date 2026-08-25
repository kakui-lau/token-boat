package pricingruntime

import (
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

const (
	channelFailureThreshold  = 3
	channelFailureCooldown   = 30 * time.Second
	channelRateLimitCooldown = 15 * time.Second
	channelProbeTimeout      = 30 * time.Second
	channelCircuitEventLimit = 200
)

type channelCircuitState struct {
	ConsecutiveFailures int
	OpenUntil           time.Time
	ProbeUntil          time.Time
	SuccessCount        int64
	FailureCount        int64
	AverageLatencyMs    float64
}

// ChannelCircuitStatus describes circuit state for one channel-model pair.
type ChannelCircuitStatus struct {
	ChannelId           int     `json:"channel_id"`
	ModelId             int     `json:"model_id"`
	ModelName           string  `json:"model_name,omitempty"`
	State               string  `json:"state"`
	ConsecutiveFailures int     `json:"consecutive_failures"`
	OpenUntil           int64   `json:"open_until"`
	ProbeUntil          int64   `json:"probe_until"`
	SuccessCount        int64   `json:"success_count"`
	FailureCount        int64   `json:"failure_count"`
	SuccessRate         float64 `json:"success_rate"`
	AverageLatencyMs    float64 `json:"average_latency_ms"`
}

type ChannelCircuitEvent struct {
	Id         int64  `json:"id"`
	ChannelId  int    `json:"channel_id"`
	ModelId    int    `json:"model_id"`
	Event      string `json:"event"`
	StatusCode int    `json:"status_code"`
	OccurredAt int64  `json:"occurred_at"`
}

type ChannelCircuitOverview struct {
	Channels    []ChannelCircuitStatus `json:"channels"`
	Events      []ChannelCircuitEvent  `json:"events"`
	Distributed bool                   `json:"distributed"`
	Enabled     bool                   `json:"enabled"`
}

// channelCircuits keeps per (channel, model) circuit state. The outer map is
// keyed by channel id so that removing a channel can drop every model circuit
// at once; the inner map is keyed by model id.
var channelCircuits = struct {
	sync.Mutex
	byChannelId map[int]map[int]channelCircuitState
	events      []ChannelCircuitEvent
	nextEventId int64
}{
	byChannelId: make(map[int]map[int]channelCircuitState),
	events:      make([]ChannelCircuitEvent, 0, channelCircuitEventLimit),
}

var circuitMonitoringWasEnabled atomic.Bool

func init() {
	circuitMonitoringWasEnabled.Store(true)
}

func circuitMonitoringEnabled() bool {
	if operation_setting.IsCircuitBreakerEnabled() {
		circuitMonitoringWasEnabled.Store(true)
		return true
	}
	if circuitMonitoringWasEnabled.Swap(false) {
		clearChannelCircuitRuntimeState()
	}
	return false
}

func clearChannelCircuitRuntimeState() {
	if circuitRedisEnabled() {
		if err := clearChannelCircuitStatesRedis(); err != nil {
			common.SysError("pricing circuit Redis clear failed: " + err.Error())
		}
	}
	channelCircuits.Lock()
	channelCircuits.byChannelId = make(map[int]map[int]channelCircuitState)
	channelCircuits.Unlock()
}

func TryAcquireChannel(channelId int, modelId int) bool {
	if !circuitMonitoringEnabled() {
		return true
	}
	if circuitRedisEnabled() {
		acquired, err := tryAcquireChannelRedis(channelId, modelId, time.Now())
		if err == nil {
			return acquired
		}
		common.SysError("pricing circuit Redis acquire failed: " + err.Error())
	}
	return tryAcquireChannelAt(channelId, modelId, time.Now())
}

func tryAcquireChannelAt(channelId int, modelId int, now time.Time) bool {
	channelCircuits.Lock()
	defer channelCircuits.Unlock()

	state, exists := channelCircuitStateAt(channelId, modelId)
	if !exists {
		return true
	}
	if now.Before(state.OpenUntil) {
		return false
	}
	if !state.ProbeUntil.IsZero() && now.Before(state.ProbeUntil) {
		return false
	}
	if !state.OpenUntil.IsZero() {
		state.ProbeUntil = now.Add(channelProbeTimeout)
		channelCircuits.byChannelId[channelId][modelId] = state
		appendChannelCircuitEventLocked(channelId, modelId, "half_open_probe", 0, now)
	}
	return true
}

func RecordChannelSuccess(channelId int, modelId int) {
	RecordChannelSuccessWithLatency(channelId, modelId, 0)
}

func RecordChannelSuccessWithLatency(channelId int, modelId int, latency time.Duration) {
	if !circuitMonitoringEnabled() {
		return
	}
	if circuitRedisEnabled() {
		if err := recordChannelSuccessRedis(channelId, modelId, latency, time.Now()); err == nil {
			return
		} else {
			common.SysError("pricing circuit Redis success update failed: " + err.Error())
		}
	}
	channelCircuits.Lock()
	state, exists := channelCircuitStateAt(channelId, modelId)
	if exists && (!state.OpenUntil.IsZero() || !state.ProbeUntil.IsZero()) {
		appendChannelCircuitEventLocked(channelId, modelId, "recovered", 0, time.Now())
	}
	state.ConsecutiveFailures = 0
	state.OpenUntil = time.Time{}
	state.ProbeUntil = time.Time{}
	state.SuccessCount++
	if latency > 0 {
		latencyMs := float64(latency.Milliseconds())
		if state.AverageLatencyMs == 0 {
			state.AverageLatencyMs = latencyMs
		} else {
			state.AverageLatencyMs = state.AverageLatencyMs*0.8 + latencyMs*0.2
		}
	}
	setChannelCircuitState(channelId, modelId, state)
	channelCircuits.Unlock()
}

func ResetChannelCircuit(channelId int, modelId int) bool {
	if !circuitMonitoringEnabled() {
		return false
	}
	if channelId <= 0 {
		return false
	}
	if circuitRedisEnabled() {
		reset, err := resetChannelCircuitRedis(channelId, modelId, time.Now())
		if err == nil {
			return reset
		}
		common.SysError("pricing circuit Redis reset failed: " + err.Error())
	}
	channelCircuits.Lock()
	defer channelCircuits.Unlock()
	state, exists := channelCircuitStateAt(channelId, modelId)
	if !exists {
		return false
	}
	if state.ConsecutiveFailures == 0 &&
		state.OpenUntil.IsZero() &&
		state.ProbeUntil.IsZero() {
		return false
	}
	state.ConsecutiveFailures = 0
	state.OpenUntil = time.Time{}
	state.ProbeUntil = time.Time{}
	setChannelCircuitState(channelId, modelId, state)
	appendChannelCircuitEventLocked(channelId, modelId, "manual_reset", 0, time.Now())
	return true
}

// RemoveChannelCircuit drops live circuit state when a channel is deleted.
// Persistent transition events remain as historical audit records.
func RemoveChannelCircuit(channelId int) {
	if channelId <= 0 {
		return
	}
	if circuitRedisEnabled() {
		if err := removeChannelCircuitRedis(channelId); err != nil {
			common.SysError("pricing circuit Redis cleanup failed: " + err.Error())
		}
	}
	channelCircuits.Lock()
	delete(channelCircuits.byChannelId, channelId)
	channelCircuits.Unlock()
}

func RecordChannelFailure(channelId int, modelId int, statusCode int) {
	if !circuitMonitoringEnabled() {
		return
	}
	if circuitRedisEnabled() {
		if err := recordChannelFailureRedis(channelId, modelId, statusCode, time.Now()); err == nil {
			return
		} else {
			common.SysError("pricing circuit Redis failure update failed: " + err.Error())
		}
	}
	recordChannelFailureAt(channelId, modelId, statusCode, time.Now())
}

func recordChannelFailureAt(channelId int, modelId int, statusCode int, now time.Time) {
	channelCircuits.Lock()
	defer channelCircuits.Unlock()

	state, exists := channelCircuitStateAt(channelId, modelId)
	switch {
	case statusCode == 429:
		state.ProbeUntil = time.Time{}
		state.FailureCount++
		state.ConsecutiveFailures = 0
		state.OpenUntil = now.Add(channelRateLimitCooldown)
		appendChannelCircuitEventLocked(channelId, modelId, "rate_limited", statusCode, now)
	case statusCode == 0 || statusCode == 408 || statusCode >= 500:
		state.ProbeUntil = time.Time{}
		state.FailureCount++
		state.ConsecutiveFailures++
		if state.ConsecutiveFailures >= channelFailureThreshold || !state.OpenUntil.IsZero() {
			state.OpenUntil = now.Add(channelFailureCooldown)
			appendChannelCircuitEventLocked(channelId, modelId, "opened", statusCode, now)
		} else {
			appendChannelCircuitEventLocked(channelId, modelId, "failure", statusCode, now)
		}
	default:
		if !exists {
			return
		}
		setChannelCircuitState(channelId, modelId, state)
		return
	}
	setChannelCircuitState(channelId, modelId, state)
}

func GetChannelCircuitOverview() ChannelCircuitOverview {
	if !circuitMonitoringEnabled() {
		return ChannelCircuitOverview{Distributed: circuitRedisEnabled()}
	}
	if circuitRedisEnabled() {
		overview, err := getChannelCircuitOverviewRedis(time.Now())
		if err == nil {
			overview.Enabled = true
			return overview
		}
		common.SysError("pricing circuit Redis overview failed: " + err.Error())
	}
	now := time.Now()
	channelCircuits.Lock()
	defer channelCircuits.Unlock()

	channels := make([]ChannelCircuitStatus, 0, len(channelCircuits.byChannelId))
	for channelId, modelStates := range channelCircuits.byChannelId {
		for modelId, state := range modelStates {
			status := "monitoring"
			switch {
			case now.Before(state.OpenUntil):
				status = "open"
			case !state.ProbeUntil.IsZero() && now.Before(state.ProbeUntil):
				status = "half_open"
			}
			openUntil := int64(0)
			if !state.OpenUntil.IsZero() {
				openUntil = state.OpenUntil.Unix()
			}
			probeUntil := int64(0)
			if !state.ProbeUntil.IsZero() {
				probeUntil = state.ProbeUntil.Unix()
			}
			channels = append(channels, ChannelCircuitStatus{
				ChannelId:           channelId,
				ModelId:             modelId,
				State:               status,
				ConsecutiveFailures: state.ConsecutiveFailures,
				OpenUntil:           openUntil,
				ProbeUntil:          probeUntil,
				SuccessCount:        state.SuccessCount,
				FailureCount:        state.FailureCount,
				SuccessRate:         channelSuccessRate(state),
				AverageLatencyMs:    state.AverageLatencyMs,
			})
		}
	}
	sort.Slice(channels, func(i, j int) bool {
		if channels[i].ChannelId != channels[j].ChannelId {
			return channels[i].ChannelId < channels[j].ChannelId
		}
		return channels[i].ModelId < channels[j].ModelId
	})
	events := append([]ChannelCircuitEvent(nil), channelCircuits.events...)
	return ChannelCircuitOverview{
		Channels: channels,
		Events:   events,
		Enabled:  true,
	}
}

type ChannelRouteMetrics struct {
	SuccessRate      float64
	AverageLatencyMs float64
}

func GetChannelRouteMetrics(channelId int, modelId int) ChannelRouteMetrics {
	if !circuitMonitoringEnabled() {
		return ChannelRouteMetrics{SuccessRate: 0.99, AverageLatencyMs: 1000}
	}
	if circuitRedisEnabled() {
		metrics, err := getChannelRouteMetricsRedis(channelId, modelId)
		if err == nil {
			return metrics
		}
		common.SysError("pricing circuit Redis metrics failed: " + err.Error())
	}
	channelCircuits.Lock()
	defer channelCircuits.Unlock()
	state, _ := channelCircuitStateAt(channelId, modelId)
	latency := state.AverageLatencyMs
	if latency <= 0 {
		latency = 1000
	}
	return ChannelRouteMetrics{
		SuccessRate:      channelSuccessRate(state),
		AverageLatencyMs: latency,
	}
}

func channelCircuitStateAt(channelId int, modelId int) (channelCircuitState, bool) {
	modelStates, exists := channelCircuits.byChannelId[channelId]
	if !exists {
		return channelCircuitState{}, false
	}
	state, exists := modelStates[modelId]
	return state, exists
}

func setChannelCircuitState(channelId int, modelId int, state channelCircuitState) {
	modelStates, exists := channelCircuits.byChannelId[channelId]
	if !exists {
		modelStates = make(map[int]channelCircuitState)
		channelCircuits.byChannelId[channelId] = modelStates
	}
	modelStates[modelId] = state
}

func channelSuccessRate(state channelCircuitState) float64 {
	// A small Bayesian prior keeps new channels competitive without allowing
	// one early success or failure to dominate route selection.
	return float64(state.SuccessCount+99) /
		float64(state.SuccessCount+state.FailureCount+100)
}

func appendChannelCircuitEventLocked(
	channelId int,
	modelId int,
	event string,
	statusCode int,
	occurredAt time.Time,
) {
	persistedEvent := ChannelCircuitEvent{
		Id:         channelCircuits.nextEventId + 1,
		ChannelId:  channelId,
		ModelId:    modelId,
		Event:      event,
		StatusCode: statusCode,
		OccurredAt: occurredAt.Unix(),
	}
	channelCircuits.events = append(channelCircuits.events, persistedEvent)
	enqueueCircuitEventPersistence(persistedEvent)
	channelCircuits.nextEventId++
	if len(channelCircuits.events) > channelCircuitEventLimit {
		channelCircuits.events = append(
			channelCircuits.events[:0],
			channelCircuits.events[len(channelCircuits.events)-channelCircuitEventLimit:]...,
		)
	}
}
