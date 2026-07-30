package pricingruntime

import (
	"sync"
	"time"
)

const (
	channelFailureThreshold  = 3
	channelFailureCooldown   = 30 * time.Second
	channelRateLimitCooldown = 15 * time.Second
	channelProbeTimeout      = 30 * time.Second
)

type channelCircuitState struct {
	ConsecutiveFailures int
	OpenUntil           time.Time
	ProbeUntil          time.Time
}

var channelCircuits = struct {
	sync.Mutex
	byChannelId map[int]channelCircuitState
}{
	byChannelId: make(map[int]channelCircuitState),
}

func TryAcquireChannel(channelId int) bool {
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
	}
	return true
}

func RecordChannelSuccess(channelId int) {
	channelCircuits.Lock()
	delete(channelCircuits.byChannelId, channelId)
	channelCircuits.Unlock()
}

func RecordChannelFailure(channelId int, statusCode int) {
	recordChannelFailureAt(channelId, statusCode, time.Now())
}

func recordChannelFailureAt(channelId int, statusCode int, now time.Time) {
	channelCircuits.Lock()
	defer channelCircuits.Unlock()

	state, exists := channelCircuits.byChannelId[channelId]
	state.ProbeUntil = time.Time{}
	switch {
	case statusCode == 429:
		state.ConsecutiveFailures = 0
		state.OpenUntil = now.Add(channelRateLimitCooldown)
	case statusCode == 0 || statusCode == 408 || statusCode >= 500:
		state.ConsecutiveFailures++
		if state.ConsecutiveFailures >= channelFailureThreshold || !state.OpenUntil.IsZero() {
			state.OpenUntil = now.Add(channelFailureCooldown)
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
