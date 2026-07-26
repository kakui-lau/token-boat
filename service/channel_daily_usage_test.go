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
