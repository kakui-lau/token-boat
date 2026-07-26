package service

import (
	"context"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/glebarez/sqlite"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupChannelDailyUsageTestDB(t *testing.T) {
	t.Helper()
	oldDB := model.DB
	oldLogDB := model.LOG_DB
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&model.Channel{}, &model.Log{}, &model.Task{}, &model.ChannelDailyUsage{},
		&model.ChannelDailyUsageMonth{},
	))
	model.DB = db
	model.LOG_DB = db
	t.Cleanup(func() {
		model.DB = oldDB
		model.LOG_DB = oldLogDB
	})
}

func TestRecalculateChannelDailyUsageUsesUTCHalfOpenBoundaryAndIsIdempotent(t *testing.T) {
	setupChannelDailyUsageTestDB(t)
	start := time.Date(2026, 7, 25, 0, 0, 0, 0, time.UTC)
	mapping := `{"openai/gpt-5.4":"wb-openai/gpt-5.4"}`
	require.NoError(t, model.DB.Create(&model.Channel{Id: 14, Name: "Anispark", ModelMapping: &mapping}).Error)

	insideOther := common.MapToJsonStr(map[string]any{
		"cache_tokens":       20,
		"cache_write_tokens": 5,
		"admin_info": map[string]any{
			"provider_cost_known": true,
			"provider_cost_usd":   0.125,
		},
	})
	logs := []model.Log{
		{CreatedAt: start.Unix() - 1, Type: model.LogTypeConsume, ChannelId: 14, ModelName: "openai/gpt-5.4", PromptTokens: 99},
		{CreatedAt: start.Unix(), Type: model.LogTypeConsume, ChannelId: 14, ModelName: "openai/gpt-5.4", PromptTokens: 100, CompletionTokens: 30, Quota: 500, Other: insideOther, RequestId: "start"},
		{CreatedAt: start.Add(24*time.Hour).Unix() - 1, Type: model.LogTypeConsume, ChannelId: 14, ModelName: "openai/gpt-5.4", PromptTokens: 50, CompletionTokens: 10, Quota: 250, RequestId: "end-minus-one"},
		{CreatedAt: start.Add(24 * time.Hour).Unix(), Type: model.LogTypeConsume, ChannelId: 14, ModelName: "openai/gpt-5.4", PromptTokens: 77, RequestId: "end"},
	}
	require.NoError(t, model.LOG_DB.Create(&logs).Error)

	require.NoError(t, RecalculateChannelDailyUsage(context.Background(), start))
	require.NoError(t, RecalculateChannelDailyUsage(context.Background(), start))

	rows, total, err := model.ListChannelDailyUsages(model.ChannelDailyUsageFilter{
		StartDate: "2026-07-25", EndDate: "2026-07-25",
	}, 0, 10)
	require.NoError(t, err)
	require.Equal(t, int64(1), total)
	require.Len(t, rows, 1)
	row := rows[0]
	assert.Equal(t, int64(2), row.BilledRequestCount)
	assert.Equal(t, int64(150), row.PromptTokens)
	assert.Equal(t, int64(40), row.CompletionTokens)
	assert.Equal(t, int64(190), row.TotalTokens)
	assert.Equal(t, int64(20), row.CacheReadTokens)
	assert.Equal(t, int64(5), row.CacheWriteTokens)
	assert.Equal(t, int64(750), row.CustomerQuota)
	revenue, err := decimal.NewFromString(row.CustomerRevenueUSD)
	require.NoError(t, err)
	assert.True(t, revenue.Equal(decimal.RequireFromString("0.0015")))
	providerCost, err := decimal.NewFromString(row.ProviderReportedCostUSD)
	require.NoError(t, err)
	assert.True(t, providerCost.Equal(decimal.RequireFromString("0.125")))
	assert.Equal(t, "wb-openai/gpt-5.4", row.UpstreamModel)

	summary, err := model.SummarizeChannelDailyUsages(model.ChannelDailyUsageFilter{
		StartDate: "2026-07-25", EndDate: "2026-07-25",
	})
	require.NoError(t, err)
	assert.Equal(t, int64(2), summary.BilledRequestCount)
	assert.Equal(t, int64(190), summary.TotalTokens)
}

func TestRecalculateChannelDailyUsageScansMultipleLogBatches(t *testing.T) {
	setupChannelDailyUsageTestDB(t)
	start := time.Date(2026, 7, 25, 0, 0, 0, 0, time.UTC)
	logs := make([]model.Log, channelDailyUsageBatchSize+1)
	for index := range logs {
		logs[index] = model.Log{
			CreatedAt:    start.Unix(),
			Type:         model.LogTypeConsume,
			ChannelId:    14,
			ModelName:    "openai/gpt-5.4",
			PromptTokens: 1,
			RequestId:    "batch-log",
		}
	}
	require.NoError(t, model.LOG_DB.CreateInBatches(&logs, 200).Error)

	require.NoError(t, RecalculateChannelDailyUsage(context.Background(), start))

	rows, total, err := model.ListChannelDailyUsages(model.ChannelDailyUsageFilter{
		StartDate: "2026-07-25", EndDate: "2026-07-25",
	}, 0, 10)
	require.NoError(t, err)
	require.Equal(t, int64(1), total)
	require.Len(t, rows, 1)
	assert.Equal(t, int64(channelDailyUsageBatchSize+1), rows[0].BilledRequestCount)
	assert.Equal(t, int64(channelDailyUsageBatchSize+1), rows[0].PromptTokens)
}

func TestChannelDailyUsageLogScanIndexExists(t *testing.T) {
	setupChannelDailyUsageTestDB(t)
	assert.True(t, model.LOG_DB.Migrator().HasIndex(&model.Log{}, "idx_logs_type_created_id"))
}

func TestRecalculateChannelDailyUsageDoesNotOverwriteLockedMonth(t *testing.T) {
	setupChannelDailyUsageTestDB(t)
	start := time.Date(2026, 7, 25, 0, 0, 0, 0, time.UTC)
	require.NoError(t, model.SetChannelDailyUsageMonthLock(
		"2026-07", "2026-07-01", "2026-07-31", true, 1,
	))

	err := RecalculateChannelDailyUsage(context.Background(), start)
	require.ErrorIs(t, err, model.ErrChannelDailyUsageMonthLocked)

	var count int64
	require.NoError(t, model.DB.Model(&model.ChannelDailyUsage{}).Where("usage_date = ?", "2026-07-25").Count(&count).Error)
	assert.Zero(t, count)
}

func TestRecalculateChannelDailyUsageDoesNotFlagPerCallBillingAsMissingUsage(t *testing.T) {
	setupChannelDailyUsageTestDB(t)
	start := time.Date(2026, 7, 25, 0, 0, 0, 0, time.UTC)
	require.NoError(t, model.LOG_DB.Create(&model.Log{
		CreatedAt: start.Unix(),
		Type:      model.LogTypeConsume,
		ChannelId: 15,
		ModelName: "image-model",
		Quota:     100,
		Other: common.MapToJsonStr(map[string]any{
			"model_price": 0.02,
		}),
		RequestId: "per-call",
	}).Error)

	require.NoError(t, RecalculateChannelDailyUsage(context.Background(), start))
	rows, total, err := model.ListChannelDailyUsages(model.ChannelDailyUsageFilter{
		StartDate: "2026-07-25", EndDate: "2026-07-25",
	}, 0, 10)
	require.NoError(t, err)
	require.Equal(t, int64(1), total)
	require.Len(t, rows, 1)
	assert.Zero(t, rows[0].MissingUsageCount)
	assert.Equal(t, int64(1), rows[0].BilledRequestCount)
}

func TestRecalculateChannelDailyUsageUsesHistoricalQuotaPerUnit(t *testing.T) {
	setupChannelDailyUsageTestDB(t)
	start := time.Date(2026, 7, 25, 0, 0, 0, 0, time.UTC)
	logs := []model.Log{
		{
			CreatedAt: start.Unix(), Type: model.LogTypeConsume, ChannelId: 15,
			ModelName: "priced-model", Quota: 500_000,
			Other: common.MapToJsonStr(map[string]any{
				"quota_per_unit": 500_000,
				"model_price":    1,
			}),
			RequestId: "historical-rate-1",
		},
		{
			CreatedAt: start.Unix(), Type: model.LogTypeConsume, ChannelId: 15,
			ModelName: "priced-model", Quota: 500_000,
			Other: common.MapToJsonStr(map[string]any{
				"quota_per_unit": 1_000_000,
				"model_price":    0.5,
			}),
			RequestId: "historical-rate-2",
		},
	}
	require.NoError(t, model.LOG_DB.Create(&logs).Error)

	require.NoError(t, RecalculateChannelDailyUsage(context.Background(), start))
	rows, total, err := model.ListChannelDailyUsages(model.ChannelDailyUsageFilter{
		StartDate: "2026-07-25", EndDate: "2026-07-25",
	}, 0, 10)
	require.NoError(t, err)
	require.Equal(t, int64(1), total)
	require.Len(t, rows, 1)
	revenue, err := decimal.NewFromString(rows[0].CustomerRevenueUSD)
	require.NoError(t, err)
	assert.True(t, revenue.Equal(decimal.RequireFromString("1.5")))
}

func TestChannelDailyUsageFilterOptionsUseDistinctValuesWithinDateRange(t *testing.T) {
	setupChannelDailyUsageTestDB(t)
	rows := []model.ChannelDailyUsage{
		{
			UsageDate: "2026-07-24", Timezone: "UTC", ChannelID: 10, ChannelName: "Alpha",
			ModelName: "openai/gpt-a", UpstreamModel: "upstream/gpt-a", Status: model.ChannelDailyUsageStatusOpen,
		},
		{
			UsageDate: "2026-07-25", Timezone: "UTC", ChannelID: 10, ChannelName: "Alpha",
			ModelName: "openai/gpt-a", UpstreamModel: "upstream/gpt-a", Status: model.ChannelDailyUsageStatusOpen,
		},
		{
			UsageDate: "2026-07-25", Timezone: "UTC", ChannelID: 20, ChannelName: "Beta",
			ModelName: "anthropic/claude-b", UpstreamModel: "upstream/claude-b", Status: model.ChannelDailyUsageStatusOpen,
		},
	}
	require.NoError(t, model.DB.Create(&rows).Error)

	options, err := model.ListChannelDailyUsageFilterOptions(model.ChannelDailyUsageFilter{
		StartDate: "2026-07-25",
		EndDate:   "2026-07-25",
	})

	require.NoError(t, err)
	assert.Equal(t, []model.ChannelDailyUsageChannelOption{
		{ChannelID: 10, ChannelName: "Alpha"},
		{ChannelID: 20, ChannelName: "Beta"},
	}, options.Channels)
	assert.Equal(t, []string{"anthropic/claude-b", "openai/gpt-a"}, options.ModelNames)
	assert.Equal(t, []string{"upstream/claude-b", "upstream/gpt-a"}, options.UpstreamModels)
}

func TestListChannelMonthlyUsagesAggregatesFilteredDailyRows(t *testing.T) {
	setupChannelDailyUsageTestDB(t)
	rows := []model.ChannelDailyUsage{
		{
			UsageDate: "2026-06-30", Timezone: "UTC", PeriodStart: 1, PeriodEnd: 2,
			ChannelID: 10, ChannelName: "Alpha", ModelName: "gpt-a", UpstreamModel: "upstream-a",
			BilledRequestCount: 99, TotalTokens: 990, CustomerRevenueUSD: "9.9",
			ProviderReportedCostUSD: "8.8", Status: model.ChannelDailyUsageStatusOpen,
		},
		{
			UsageDate: "2026-07-01", Timezone: "UTC", PeriodStart: 10, PeriodEnd: 20,
			ChannelID: 10, ChannelName: "Alpha", ModelName: "gpt-a", UpstreamModel: "upstream-a",
			BilledRequestCount: 2, PromptTokens: 20, CompletionTokens: 5, TotalTokens: 25,
			CustomerQuota: 100, CustomerRevenueUSD: "1.25", ProviderReportedCostUSD: "0.5",
			ProviderCostKnownCount: 2, Status: model.ChannelDailyUsageStatusOpen,
		},
		{
			UsageDate: "2026-07-31", Timezone: "UTC", PeriodStart: 30, PeriodEnd: 40,
			ChannelID: 10, ChannelName: "Alpha Renamed", ModelName: "gpt-a", UpstreamModel: "upstream-a",
			BilledRequestCount: 3, PromptTokens: 30, CompletionTokens: 7, TotalTokens: 37,
			CustomerQuota: 200, CustomerRevenueUSD: "2.75", ProviderReportedCostUSD: "0.75",
			ProviderCostKnownCount: 3, MissingUsageCount: 1, Status: model.ChannelDailyUsageStatusOpen,
		},
		{
			UsageDate: "2026-07-15", Timezone: "UTC", PeriodStart: 21, PeriodEnd: 22,
			ChannelID: 20, ChannelName: "Beta", ModelName: "gpt-a", UpstreamModel: "upstream-a",
			BilledRequestCount: 4, TotalTokens: 44, CustomerRevenueUSD: "4",
			ProviderReportedCostUSD: "2", Status: model.ChannelDailyUsageStatusOpen,
		},
	}
	require.NoError(t, model.DB.Create(&rows).Error)

	monthly, total, err := model.ListChannelMonthlyUsages(model.ChannelDailyUsageFilter{
		StartDate: "2026-07-01", EndDate: "2026-07-31", ChannelID: 10,
	}, 0, 10)

	require.NoError(t, err)
	require.Equal(t, int64(1), total)
	require.Len(t, monthly, 1)
	row := monthly[0]
	assert.Equal(t, "2026-07", row.UsageDate)
	assert.Equal(t, "Alpha Renamed", row.ChannelName)
	assert.Equal(t, int64(10), row.PeriodStart)
	assert.Equal(t, int64(40), row.PeriodEnd)
	assert.Equal(t, int64(5), row.BilledRequestCount)
	assert.Equal(t, int64(50), row.PromptTokens)
	assert.Equal(t, int64(12), row.CompletionTokens)
	assert.Equal(t, int64(62), row.TotalTokens)
	assert.Equal(t, int64(300), row.CustomerQuota)
	assert.Equal(t, int64(5), row.ProviderCostKnownCount)
	assert.Equal(t, int64(1), row.MissingUsageCount)
	revenue, err := decimal.NewFromString(row.CustomerRevenueUSD)
	require.NoError(t, err)
	assert.True(t, revenue.Equal(decimal.RequireFromString("4")))
	providerCost, err := decimal.NewFromString(row.ProviderReportedCostUSD)
	require.NoError(t, err)
	assert.True(t, providerCost.Equal(decimal.RequireFromString("1.25")))
}

func TestListChannelMonthlyUsageSummaryGroupsBySelectedModelDimension(t *testing.T) {
	setupChannelDailyUsageTestDB(t)
	rows := []model.ChannelDailyUsage{
		{
			UsageDate: "2026-07-01", Timezone: "UTC", ChannelID: 10, ChannelName: "Alpha",
			ModelName: "platform-a", UpstreamModel: "upstream-shared", BilledRequestCount: 2,
			TotalTokens: 20, CustomerRevenueUSD: "1.25", ProviderReportedCostUSD: "0.5",
			Status: model.ChannelDailyUsageStatusOpen,
		},
		{
			UsageDate: "2026-07-02", Timezone: "UTC", ChannelID: 10, ChannelName: "Alpha Renamed",
			ModelName: "platform-b", UpstreamModel: "upstream-shared", BilledRequestCount: 3,
			TotalTokens: 30, CustomerRevenueUSD: "2.75", ProviderReportedCostUSD: "1",
			MissingUsageCount: 1, Status: model.ChannelDailyUsageStatusOpen,
		},
		{
			UsageDate: "2026-07-03", Timezone: "UTC", ChannelID: 20, ChannelName: "Beta",
			ModelName: "platform-a", UpstreamModel: "upstream-other", BilledRequestCount: 4,
			TotalTokens: 40, CustomerRevenueUSD: "4", ProviderReportedCostUSD: "2",
			Status: model.ChannelDailyUsageStatusOpen,
		},
		{
			UsageDate: "2026-08-01", Timezone: "UTC", ChannelID: 10, ChannelName: "Alpha",
			ModelName: "platform-a", UpstreamModel: "upstream-shared", BilledRequestCount: 99,
			TotalTokens: 990, CustomerRevenueUSD: "99", ProviderReportedCostUSD: "50",
			Status: model.ChannelDailyUsageStatusOpen,
		},
	}
	require.NoError(t, model.DB.Create(&rows).Error)

	byUpstream, total, err := model.ListChannelMonthlyUsageSummary(
		model.ChannelDailyUsageFilter{}, "2026-07",
		model.ChannelMonthlyUsageGroupByUpstreamModel, 0, 10,
	)
	require.NoError(t, err)
	require.Equal(t, int64(2), total)
	require.Len(t, byUpstream, 2)
	assert.Equal(t, "2026-07", byUpstream[0].Month)
	assert.Equal(t, 10, byUpstream[0].ChannelID)
	assert.Equal(t, "Alpha Renamed", byUpstream[0].ChannelName)
	assert.Equal(t, "upstream-shared", byUpstream[0].UpstreamModel)
	assert.Empty(t, byUpstream[0].ModelName)
	assert.Equal(t, int64(5), byUpstream[0].BilledRequestCount)
	assert.Equal(t, int64(50), byUpstream[0].TotalTokens)
	assert.Equal(t, int64(1), byUpstream[0].MissingUsageCount)

	byPlatform, total, err := model.ListChannelMonthlyUsageSummary(
		model.ChannelDailyUsageFilter{ChannelID: 10}, "2026-07",
		model.ChannelMonthlyUsageGroupByModelName, 1, 1,
	)
	require.NoError(t, err)
	require.Equal(t, int64(2), total)
	require.Len(t, byPlatform, 1)
	assert.Equal(t, "platform-b", byPlatform[0].ModelName)
	assert.Empty(t, byPlatform[0].UpstreamModel)
	assert.Equal(t, int64(3), byPlatform[0].BilledRequestCount)
}

func TestListChannelMonthlyUsageSummaryRejectsUnknownGroup(t *testing.T) {
	setupChannelDailyUsageTestDB(t)

	_, _, err := model.ListChannelMonthlyUsageSummary(
		model.ChannelDailyUsageFilter{}, "2026-07", "status", 0, 10,
	)

	require.EqualError(t, err, "invalid group_by")
}
