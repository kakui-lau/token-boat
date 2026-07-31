package pricingruntime

import (
	"sort"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
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

type ChannelCircuitStatus struct {
	ChannelId           int     `json:"channel_id"`
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
	Event      string `json:"event"`
	StatusCode int    `json:"status_code"`
	OccurredAt int64  `json:"occurred_at"`
}

type ChannelCircuitOverview struct {
	Channels    []ChannelCircuitStatus `json:"channels"`
	Events      []ChannelCircuitEvent  `json:"events"`
	Distributed bool                   `json:"distributed"`
}

var channelCircuits = struct {
	sync.Mutex
	byChannelId map[int]channelCircuitState
	events      []ChannelCircuitEvent
	nextEventId int64
}{
	byChannelId: make(map[int]channelCircuitState),
	events:      make([]ChannelCircuitEvent, 0, channelCircuitEventLimit),
}

func TryAcquireChannel(channelId int) bool {
	if circuitRedisEnabled() {
		acquired, err := tryAcquireChannelRedis(channelId, time.Now())
		if err == nil {
			return acquired
		}
		common.SysError("pricing circuit Redis acquire failed: " + err.Error())
	}
	return tryAcquireChannelAt(channelId, time.Now())
}

func tryAcquireChannelAt(channelId int, now time.Time) bool {
	channelCircuits.Lock()
	defer channelCircuits.Unlock()

	state, exists := channelCircuits.byChannelId[channelId]
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
		channelCircuits.byChannelId[channelId] = state
		appendChannelCircuitEventLocked(channelId, "half_open_probe", 0, now)
	}
	return true
}

func RecordChannelSuccess(channelId int) {
	RecordChannelSuccessWithLatency(channelId, 0)
}

func RecordChannelSuccessWithLatency(channelId int, latency time.Duration) {
	if circuitRedisEnabled() {
		if err := recordChannelSuccessRedis(channelId, latency, time.Now()); err == nil {
			return
		} else {
			common.SysError("pricing circuit Redis success update failed: " + err.Error())
		}
	}
	channelCircuits.Lock()
	state, exists := channelCircuits.byChannelId[channelId]
	if exists && (!state.OpenUntil.IsZero() || !state.ProbeUntil.IsZero()) {
		appendChannelCircuitEventLocked(channelId, "recovered", 0, time.Now())
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
	channelCircuits.byChannelId[channelId] = state
	channelCircuits.Unlock()
}

func ResetChannelCircuit(channelId int) bool {
	if channelId <= 0 {
		return false
	}
	if circuitRedisEnabled() {
		reset, err := resetChannelCircuitRedis(channelId, time.Now())
		if err == nil {
			return reset
		}
		common.SysError("pricing circuit Redis reset failed: " + err.Error())
	}
	channelCircuits.Lock()
	defer channelCircuits.Unlock()
	state, exists := channelCircuits.byChannelId[channelId]
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
	channelCircuits.byChannelId[channelId] = state
	appendChannelCircuitEventLocked(channelId, "manual_reset", 0, time.Now())
	return true
}

func RecordChannelFailure(channelId int, statusCode int) {
	if circuitRedisEnabled() {
		if err := recordChannelFailureRedis(channelId, statusCode, time.Now()); err == nil {
			return
		} else {
			common.SysError("pricing circuit Redis failure update failed: " + err.Error())
		}
	}
	recordChannelFailureAt(channelId, statusCode, time.Now())
}

func recordChannelFailureAt(channelId int, statusCode int, now time.Time) {
	channelCircuits.Lock()
	defer channelCircuits.Unlock()

	state, exists := channelCircuits.byChannelId[channelId]
	switch {
	case statusCode == 429:
		state.ProbeUntil = time.Time{}
		state.FailureCount++
		state.ConsecutiveFailures = 0
		state.OpenUntil = now.Add(channelRateLimitCooldown)
		appendChannelCircuitEventLocked(channelId, "rate_limited", statusCode, now)
	case statusCode == 0 || statusCode == 408 || statusCode >= 500:
		state.ProbeUntil = time.Time{}
		state.FailureCount++
		state.ConsecutiveFailures++
		if state.ConsecutiveFailures >= channelFailureThreshold || !state.OpenUntil.IsZero() {
			state.OpenUntil = now.Add(channelFailureCooldown)
			appendChannelCircuitEventLocked(channelId, "opened", statusCode, now)
		} else {
			appendChannelCircuitEventLocked(channelId, "failure", statusCode, now)
		}
	default:
		if !exists {
			return
		}
		channelCircuits.byChannelId[channelId] = state
		return
	}
	channelCircuits.byChannelId[channelId] = state
}

func GetChannelCircuitOverview() ChannelCircuitOverview {
	if circuitRedisEnabled() {
		overview, err := getChannelCircuitOverviewRedis(time.Now())
		if err == nil {
			return overview
		}
		common.SysError("pricing circuit Redis overview failed: " + err.Error())
	}
	now := time.Now()
	channelCircuits.Lock()
	defer channelCircuits.Unlock()

	channels := make([]ChannelCircuitStatus, 0, len(channelCircuits.byChannelId))
	for channelId, state := range channelCircuits.byChannelId {
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
	sort.Slice(channels, func(i, j int) bool {
		return channels[i].ChannelId < channels[j].ChannelId
	})
	events := append([]ChannelCircuitEvent(nil), channelCircuits.events...)
	return ChannelCircuitOverview{Channels: channels, Events: events}
}

type ChannelRouteMetrics struct {
	SuccessRate      float64
	AverageLatencyMs float64
}

func GetChannelRouteMetrics(channelId int) ChannelRouteMetrics {
	if circuitRedisEnabled() {
		metrics, err := getChannelRouteMetricsRedis(channelId)
		if err == nil {
			return metrics
		}
		common.SysError("pricing circuit Redis metrics failed: " + err.Error())
	}
	channelCircuits.Lock()
	defer channelCircuits.Unlock()
	state := channelCircuits.byChannelId[channelId]
	latency := state.AverageLatencyMs
	if latency <= 0 {
		latency = 1000
	}
	return ChannelRouteMetrics{
		SuccessRate:      channelSuccessRate(state),
		AverageLatencyMs: latency,
	}
}

func channelSuccessRate(state channelCircuitState) float64 {
	// A small Bayesian prior keeps new channels competitive without allowing
	// one early success or failure to dominate route selection.
	return float64(state.SuccessCount+99) /
		float64(state.SuccessCount+state.FailureCount+100)
}

func appendChannelCircuitEventLocked(
	channelId int,
	event string,
	statusCode int,
	occurredAt time.Time,
) {
	persistedEvent := ChannelCircuitEvent{
		Id:         channelCircuits.nextEventId + 1,
		ChannelId:  channelId,
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
