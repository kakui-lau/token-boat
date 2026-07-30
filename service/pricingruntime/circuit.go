package pricingruntime

import (
	"sort"
	"sync"
	"time"
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
}

type ChannelCircuitStatus struct {
	ChannelId           int    `json:"channel_id"`
	State               string `json:"state"`
	ConsecutiveFailures int    `json:"consecutive_failures"`
	OpenUntil           int64  `json:"open_until"`
	ProbeUntil          int64  `json:"probe_until"`
}

type ChannelCircuitEvent struct {
	Id         int64  `json:"id"`
	ChannelId  int    `json:"channel_id"`
	Event      string `json:"event"`
	StatusCode int    `json:"status_code"`
	OccurredAt int64  `json:"occurred_at"`
}

type ChannelCircuitOverview struct {
	Channels []ChannelCircuitStatus `json:"channels"`
	Events   []ChannelCircuitEvent  `json:"events"`
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
	channelCircuits.Lock()
	if _, exists := channelCircuits.byChannelId[channelId]; exists {
		appendChannelCircuitEventLocked(channelId, "recovered", 0, time.Now())
	}
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
		appendChannelCircuitEventLocked(channelId, "rate_limited", statusCode, now)
	case statusCode == 0 || statusCode == 408 || statusCode >= 500:
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
		})
	}
	sort.Slice(channels, func(i, j int) bool {
		return channels[i].ChannelId < channels[j].ChannelId
	})
	events := append([]ChannelCircuitEvent(nil), channelCircuits.events...)
	return ChannelCircuitOverview{Channels: channels, Events: events}
}

func appendChannelCircuitEventLocked(
	channelId int,
	event string,
	statusCode int,
	occurredAt time.Time,
) {
	channelCircuits.events = append(channelCircuits.events, ChannelCircuitEvent{
		Id:         channelCircuits.nextEventId + 1,
		ChannelId:  channelId,
		Event:      event,
		StatusCode: statusCode,
		OccurredAt: occurredAt.Unix(),
	})
	channelCircuits.nextEventId++
	if len(channelCircuits.events) > channelCircuitEventLimit {
		channelCircuits.events = append(
			channelCircuits.events[:0],
			channelCircuits.events[len(channelCircuits.events)-channelCircuitEventLimit:]...,
		)
	}
}
