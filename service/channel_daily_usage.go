package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/shopspring/decimal"
)

const channelDailyUsageBatchSize = 1000

type dailyUsageKey struct {
	ChannelID     int
	ModelName     string
	UpstreamModel string
}

type dailyUsageAccumulator struct {
	row          model.ChannelDailyUsage
	revenue      decimal.Decimal
	providerCost decimal.Decimal
}

func jsonNumberAsInt64(value any) int64 {
	switch number := value.(type) {
	case float64:
		if math.IsNaN(number) || math.IsInf(number, 0) || number <= 0 || number > math.MaxInt64 {
			return 0
		}
		return int64(number)
	case string:
		parsed, err := strconv.ParseInt(number, 10, 64)
		if err == nil && parsed > 0 {
			return parsed
		}
	}
	return 0
}

func jsonNumberAsDecimal(value any) (decimal.Decimal, bool) {
	switch number := value.(type) {
	case float64:
		if math.IsNaN(number) || math.IsInf(number, 0) || number < 0 {
			return decimal.Zero, false
		}
		return decimal.NewFromFloat(number), true
	case string:
		parsed, err := decimal.NewFromString(number)
		if err == nil && !parsed.IsNegative() {
			return parsed, true
		}
	}
	return decimal.Zero, false
}

func channelModelMappings() (map[int]string, map[int]map[string]string, error) {
	var channels []model.Channel
	if err := model.DB.Select("id", "name", "model_mapping").Find(&channels).Error; err != nil {
		return nil, nil, err
	}
	names := make(map[int]string, len(channels))
	mappings := make(map[int]map[string]string, len(channels))
	for _, channel := range channels {
		names[channel.Id] = channel.Name
		if channel.ModelMapping == nil || *channel.ModelMapping == "" {
			continue
		}
		mapping := map[string]string{}
		if err := common.UnmarshalJsonStr(*channel.ModelMapping, &mapping); err == nil {
			mappings[channel.Id] = mapping
		}
	}
	return names, mappings, nil
}

// RecalculateChannelDailyUsage rebuilds a UTC [start,end) day from immutable
// consume logs. It never guesses an upstream cost.
func RecalculateChannelDailyUsage(ctx context.Context, start time.Time) error {
	start = start.UTC().Truncate(24 * time.Hour)
	end := start.Add(24 * time.Hour)
	channelNames, mappings, err := channelModelMappings()
	if err != nil {
		return err
	}

	aggregates := map[dailyUsageKey]*dailyUsageAccumulator{}
	offset := 0
	var lastCreatedAt int64
	var lastID int
	hasCursor := false
	useCursor := !common.UsingLogDatabase(common.DatabaseTypeClickHouse)
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		var logs []model.Log
		query := model.LOG_DB.Where(
			"type = ? AND created_at >= ? AND created_at < ?",
			model.LogTypeConsume, start.Unix(), end.Unix(),
		)
		if useCursor {
			if hasCursor {
				query = query.Where(
					"(created_at > ? OR (created_at = ? AND id > ?))",
					lastCreatedAt, lastCreatedAt, lastID,
				)
			}
			query = query.Order("created_at asc, id asc")
		} else {
			query = query.Order("created_at asc, request_id asc").Offset(offset)
		}
		query = query.Limit(channelDailyUsageBatchSize)
		if err := query.Find(&logs).Error; err != nil {
			return err
		}
		if len(logs) == 0 {
			break
		}
		for _, logEntry := range logs {
			other := map[string]any{}
			if logEntry.Other != "" {
				_ = common.UnmarshalJsonStr(logEntry.Other, &other)
			}
			upstreamModel, _ := other["upstream_model_name"].(string)
			if upstreamModel == "" {
				upstreamModel = mappings[logEntry.ChannelId][logEntry.ModelName]
			}
			if upstreamModel == "" {
				upstreamModel = logEntry.ModelName
			}
			key := dailyUsageKey{ChannelID: logEntry.ChannelId, ModelName: logEntry.ModelName, UpstreamModel: upstreamModel}
			accumulator := aggregates[key]
			if accumulator == nil {
				accumulator = &dailyUsageAccumulator{row: model.ChannelDailyUsage{
					UsageDate:     start.Format("2006-01-02"),
					Timezone:      "UTC",
					PeriodStart:   start.Unix(),
					PeriodEnd:     end.Unix(),
					ChannelID:     logEntry.ChannelId,
					ChannelName:   channelNames[logEntry.ChannelId],
					ModelName:     logEntry.ModelName,
					UpstreamModel: upstreamModel,
					Status:        model.ChannelDailyUsageStatusOpen,
				}}
				aggregates[key] = accumulator
			}

			promptTokens := int64(logEntry.PromptTokens)
			completionTokens := int64(logEntry.CompletionTokens)
			accumulator.row.BilledRequestCount++
			accumulator.row.PromptTokens += promptTokens
			accumulator.row.CompletionTokens += completionTokens
			accumulator.row.TotalTokens += promptTokens + completionTokens
			accumulator.row.CustomerQuota += int64(logEntry.Quota)
			quotaPerUnit, validQuotaPerUnit := jsonNumberAsDecimal(other["quota_per_unit"])
			if !validQuotaPerUnit || quotaPerUnit.IsZero() {
				if common.QuotaPerUnit <= 0 {
					return errors.New("QuotaPerUnit must be positive")
				}
				quotaPerUnit = decimal.NewFromFloat(common.QuotaPerUnit)
			}
			accumulator.revenue = accumulator.revenue.Add(
				decimal.NewFromInt(int64(logEntry.Quota)).Div(quotaPerUnit),
			)
			accumulator.row.CacheReadTokens += jsonNumberAsInt64(other["cache_tokens"])
			cacheWriteTokens := jsonNumberAsInt64(other["cache_write_tokens"])
			if cacheWriteTokens == 0 {
				cacheWriteTokens = jsonNumberAsInt64(other["cache_creation_tokens"])
			}
			accumulator.row.CacheWriteTokens += cacheWriteTokens
			modelPrice, hasModelPrice := jsonNumberAsDecimal(other["model_price"])
			if promptTokens == 0 && completionTokens == 0 &&
				(!hasModelPrice || modelPrice.IsZero()) {
				accumulator.row.MissingUsageCount++
			}

			adminInfo, _ := other["admin_info"].(map[string]any)
			if adminInfo != nil {
				known, _ := adminInfo["provider_cost_known"].(bool)
				scope, _ := adminInfo["provider_cost_scope"].(string)
				if known && scope != "platform_fee_only" {
					if cost, valid := jsonNumberAsDecimal(adminInfo["provider_cost_usd"]); valid {
						accumulator.providerCost = accumulator.providerCost.Add(cost)
						accumulator.row.ProviderCostKnownCount++
					}
				}
				if _, exists := adminInfo["settlement_error"]; exists {
					accumulator.row.ManualReviewCount++
				}
			}
		}
		if len(logs) < channelDailyUsageBatchSize {
			break
		}
		if useCursor {
			lastLog := logs[len(logs)-1]
			lastCreatedAt = lastLog.CreatedAt
			lastID = lastLog.Id
			hasCursor = true
		} else {
			offset += len(logs)
		}
	}

	now := common.GetTimestamp()
	var tasks []model.Task
	if err := model.DB.Where(
		"submit_time >= ? AND submit_time < ? AND (status NOT IN ? OR settlement_status = ?)",
		start.Unix(), end.Unix(), []model.TaskStatus{model.TaskStatusSuccess, model.TaskStatusFailure},
		model.TaskSettlementStatusManual,
	).Find(&tasks).Error; err != nil {
		return err
	}
	for _, task := range tasks {
		modelName := task.Properties.OriginModelName
		if modelName == "" {
			modelName = task.Properties.UpstreamModelName
		}
		upstreamModel := task.Properties.UpstreamModelName
		if upstreamModel == "" {
			upstreamModel = mappings[task.ChannelId][modelName]
		}
		if upstreamModel == "" {
			upstreamModel = modelName
		}
		key := dailyUsageKey{ChannelID: task.ChannelId, ModelName: modelName, UpstreamModel: upstreamModel}
		accumulator := aggregates[key]
		if accumulator == nil {
			accumulator = &dailyUsageAccumulator{row: model.ChannelDailyUsage{
				UsageDate: start.Format("2006-01-02"), Timezone: "UTC",
				PeriodStart: start.Unix(), PeriodEnd: end.Unix(), ChannelID: task.ChannelId,
				ChannelName: channelNames[task.ChannelId], ModelName: modelName,
				UpstreamModel: upstreamModel, Status: model.ChannelDailyUsageStatusOpen,
			}}
			aggregates[key] = accumulator
		}
		if task.Status != model.TaskStatusSuccess && task.Status != model.TaskStatusFailure {
			accumulator.row.PendingTaskCount++
		}
		if task.SettlementStatus == model.TaskSettlementStatusManual {
			accumulator.row.ManualReviewCount++
		}
	}

	rows := make([]model.ChannelDailyUsage, 0, len(aggregates))
	for _, accumulator := range aggregates {
		accumulator.row.CustomerRevenueUSD = accumulator.revenue.StringFixed(12)
		accumulator.row.ProviderReportedCostUSD = accumulator.providerCost.StringFixed(12)
		accumulator.row.CalculatedAt = now
		accumulator.row.CreatedAt = now
		accumulator.row.UpdatedAt = now
		rows = append(rows, accumulator.row)
	}
	return model.ReplaceChannelDailyUsages(start.Unix(), end.Unix(), rows)
}

func RecalculateRecentChannelDailyUsage(ctx context.Context, days int, now time.Time) error {
	if days <= 0 || days > 31 {
		return errors.New("days must be between 1 and 31")
	}
	today := now.UTC().Truncate(24 * time.Hour)
	for daysAgo := days; daysAgo >= 1; daysAgo-- {
		if err := RecalculateChannelDailyUsage(ctx, today.AddDate(0, 0, -daysAgo)); err != nil {
			return fmt.Errorf("recalculate UTC day %s: %w", today.AddDate(0, 0, -daysAgo).Format("2006-01-02"), err)
		}
	}
	return nil
}
