package pricingruntime

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/go-redis/redis/v8"
)

const (
	circuitRedisChannelsKey = "pricing:v2:circuit:{shared}:channels"
	circuitRedisEventsKey   = "pricing:v2:circuit:{shared}:events"
	circuitRedisEventIdKey  = "pricing:v2:circuit:{shared}:event_id"
)

func circuitRedisEnabled() bool {
	return common.RedisEnabled && common.RDB != nil
}

func circuitRedisChannelKey(channelId int) string {
	return fmt.Sprintf("pricing:v2:circuit:{shared}:channel:%d", channelId)
}

func tryAcquireChannelRedis(channelId int, now time.Time) (bool, error) {
	result, err := common.RDB.Eval(context.Background(), `
local open_until = tonumber(redis.call('HGET', KEYS[1], 'open_until_ms') or '0')
local probe_until = tonumber(redis.call('HGET', KEYS[1], 'probe_until_ms') or '0')
local now = tonumber(ARGV[1])
if open_until > now or probe_until > now then return 0 end
if open_until > 0 then
  redis.call('HSET', KEYS[1], 'probe_until_ms', ARGV[2])
  return 2
end
return 1
`, []string{circuitRedisChannelKey(channelId)},
		now.UnixMilli(), now.Add(channelProbeTimeout).UnixMilli()).Int()
	if err != nil {
		return false, err
	}
	if result == 2 {
		if eventErr := appendChannelCircuitEventRedis(channelId, "half_open_probe", 0, now); eventErr != nil {
			common.SysError("pricing circuit Redis event append failed: " + eventErr.Error())
		}
	}
	return result > 0, nil
}

func recordChannelSuccessRedis(channelId int, latency time.Duration, now time.Time) error {
	latencyMs := latency.Milliseconds()
	recovered, err := common.RDB.Eval(context.Background(), `
local open_until = tonumber(redis.call('HGET', KEYS[1], 'open_until_ms') or '0')
local probe_until = tonumber(redis.call('HGET', KEYS[1], 'probe_until_ms') or '0')
local success_count = tonumber(redis.call('HGET', KEYS[1], 'success_count') or '0') + 1
local average_latency = tonumber(redis.call('HGET', KEYS[1], 'average_latency_ms') or '0')
local latency = tonumber(ARGV[1])
if latency > 0 then
  if average_latency <= 0 then average_latency = latency
  else average_latency = average_latency * 0.8 + latency * 0.2 end
end
redis.call('HSET', KEYS[1],
  'consecutive_failures', 0, 'open_until_ms', 0, 'probe_until_ms', 0,
  'success_count', success_count, 'average_latency_ms', average_latency)
redis.call('SADD', KEYS[2], ARGV[2])
if open_until > 0 or probe_until > 0 then return 1 end
return 0
`, []string{circuitRedisChannelKey(channelId), circuitRedisChannelsKey},
		latencyMs, channelId).Int()
	if err != nil {
		return err
	}
	if recovered == 1 {
		if eventErr := appendChannelCircuitEventRedis(channelId, "recovered", 0, now); eventErr != nil {
			common.SysError("pricing circuit Redis event append failed: " + eventErr.Error())
		}
	}
	return nil
}

func recordChannelFailureRedis(channelId int, statusCode int, now time.Time) error {
	if statusCode != 0 && statusCode != 408 && statusCode != 429 && statusCode < 500 {
		return nil
	}
	result, err := common.RDB.Eval(context.Background(), `
local failures = tonumber(redis.call('HGET', KEYS[1], 'consecutive_failures') or '0')
local open_until = tonumber(redis.call('HGET', KEYS[1], 'open_until_ms') or '0')
local failure_count = tonumber(redis.call('HGET', KEYS[1], 'failure_count') or '0') + 1
local status = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local event = 3
redis.call('HSET', KEYS[1], 'probe_until_ms', 0, 'failure_count', failure_count)
if status == 429 then
  failures = 0
  open_until = now + tonumber(ARGV[3])
  event = 1
else
  failures = failures + 1
  if failures >= tonumber(ARGV[4]) or open_until > 0 then
    open_until = now + tonumber(ARGV[5])
    event = 2
  end
end
redis.call('HSET', KEYS[1], 'consecutive_failures', failures, 'open_until_ms', open_until)
redis.call('SADD', KEYS[2], ARGV[6])
return event
`, []string{circuitRedisChannelKey(channelId), circuitRedisChannelsKey},
		statusCode, now.UnixMilli(), channelRateLimitCooldown.Milliseconds(),
		channelFailureThreshold, channelFailureCooldown.Milliseconds(), channelId).Int()
	if err != nil {
		return err
	}
	event := "failure"
	if result == 1 {
		event = "rate_limited"
	} else if result == 2 {
		event = "opened"
	}
	if eventErr := appendChannelCircuitEventRedis(channelId, event, statusCode, now); eventErr != nil {
		common.SysError("pricing circuit Redis event append failed: " + eventErr.Error())
	}
	return nil
}

func resetChannelCircuitRedis(channelId int, now time.Time) (bool, error) {
	result, err := common.RDB.Eval(context.Background(), `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
local failures = tonumber(redis.call('HGET', KEYS[1], 'consecutive_failures') or '0')
local open_until = tonumber(redis.call('HGET', KEYS[1], 'open_until_ms') or '0')
local probe_until = tonumber(redis.call('HGET', KEYS[1], 'probe_until_ms') or '0')
if failures == 0 and open_until == 0 and probe_until == 0 then return 0 end
redis.call('HSET', KEYS[1], 'consecutive_failures', 0, 'open_until_ms', 0, 'probe_until_ms', 0)
return 1
`, []string{circuitRedisChannelKey(channelId)}).Int()
	if err != nil || result == 0 {
		return result == 1, err
	}
	if eventErr := appendChannelCircuitEventRedis(channelId, "manual_reset", 0, now); eventErr != nil {
		common.SysError("pricing circuit Redis event append failed: " + eventErr.Error())
	}
	return true, nil
}

func appendChannelCircuitEventRedis(channelId int, event string, statusCode int, occurredAt time.Time) error {
	id, err := common.RDB.Incr(context.Background(), circuitRedisEventIdKey).Result()
	if err != nil {
		return err
	}
	payload, err := common.Marshal(ChannelCircuitEvent{
		Id: id, ChannelId: channelId, Event: event,
		StatusCode: statusCode, OccurredAt: occurredAt.Unix(),
	})
	if err != nil {
		return err
	}
	pipe := common.RDB.TxPipeline()
	pipe.RPush(context.Background(), circuitRedisEventsKey, payload)
	pipe.LTrim(context.Background(), circuitRedisEventsKey, -channelCircuitEventLimit, -1)
	_, err = pipe.Exec(context.Background())
	return err
}

func getChannelCircuitOverviewRedis(now time.Time) (ChannelCircuitOverview, error) {
	channelIds, err := common.RDB.SMembers(context.Background(), circuitRedisChannelsKey).Result()
	if err != nil {
		return ChannelCircuitOverview{}, err
	}
	channels := make([]ChannelCircuitStatus, 0, len(channelIds))
	for _, value := range channelIds {
		channelId, parseErr := strconv.Atoi(value)
		if parseErr != nil {
			continue
		}
		fields, readErr := common.RDB.HGetAll(context.Background(), circuitRedisChannelKey(channelId)).Result()
		if readErr != nil {
			return ChannelCircuitOverview{}, readErr
		}
		channels = append(channels, circuitStatusFromRedis(channelId, fields, now))
	}
	eventPayloads, err := common.RDB.LRange(context.Background(), circuitRedisEventsKey, 0, -1).Result()
	if err != nil && err != redis.Nil {
		return ChannelCircuitOverview{}, err
	}
	events := make([]ChannelCircuitEvent, 0, len(eventPayloads))
	for _, payload := range eventPayloads {
		var event ChannelCircuitEvent
		if unmarshalErr := common.UnmarshalJsonStr(payload, &event); unmarshalErr == nil {
			events = append(events, event)
		}
	}
	sortCircuitStatuses(channels)
	return ChannelCircuitOverview{
		Channels: channels, Events: events, Distributed: true,
	}, nil
}

func getChannelRouteMetricsRedis(channelId int) (ChannelRouteMetrics, error) {
	fields, err := common.RDB.HGetAll(context.Background(), circuitRedisChannelKey(channelId)).Result()
	if err != nil {
		return ChannelRouteMetrics{}, err
	}
	state := circuitStateFromRedis(fields)
	latency := state.AverageLatencyMs
	if latency <= 0 {
		latency = 1000
	}
	return ChannelRouteMetrics{
		SuccessRate: channelSuccessRate(state), AverageLatencyMs: latency,
	}, nil
}

func circuitStatusFromRedis(channelId int, fields map[string]string, now time.Time) ChannelCircuitStatus {
	state := circuitStateFromRedis(fields)
	openUntilMs, _ := strconv.ParseInt(fields["open_until_ms"], 10, 64)
	probeUntilMs, _ := strconv.ParseInt(fields["probe_until_ms"], 10, 64)
	status := "monitoring"
	if openUntilMs > now.UnixMilli() {
		status = "open"
	} else if probeUntilMs > now.UnixMilli() {
		status = "half_open"
	}
	return ChannelCircuitStatus{
		ChannelId: channelId, State: status,
		ConsecutiveFailures: state.ConsecutiveFailures,
		OpenUntil:           openUntilMs / 1000, ProbeUntil: probeUntilMs / 1000,
		SuccessCount: state.SuccessCount, FailureCount: state.FailureCount,
		SuccessRate: channelSuccessRate(state), AverageLatencyMs: state.AverageLatencyMs,
	}
}

func circuitStateFromRedis(fields map[string]string) channelCircuitState {
	consecutiveFailures, _ := strconv.Atoi(fields["consecutive_failures"])
	successCount, _ := strconv.ParseInt(fields["success_count"], 10, 64)
	failureCount, _ := strconv.ParseInt(fields["failure_count"], 10, 64)
	averageLatency, _ := strconv.ParseFloat(fields["average_latency_ms"], 64)
	return channelCircuitState{
		ConsecutiveFailures: consecutiveFailures, SuccessCount: successCount,
		FailureCount: failureCount, AverageLatencyMs: averageLatency,
	}
}

func sortCircuitStatuses(channels []ChannelCircuitStatus) {
	sort.Slice(channels, func(left int, right int) bool {
		return channels[left].ChannelId < channels[right].ChannelId
	})
}
