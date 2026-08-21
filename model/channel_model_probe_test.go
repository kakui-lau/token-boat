package model

import (
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestListChannelModelProbesFiltersAndSummarizesProbeHistory(t *testing.T) {
	originalDB := DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	DB = db
	require.NoError(t, DB.AutoMigrate(&ChannelModelProbe{}))
	t.Cleanup(func() { DB = originalDB })

	require.NoError(t, DB.Create(&[]ChannelModelProbe{
		{ChannelId: 11, ChannelName: "alpha", ModelName: "openai/gpt-test", EndpointType: "openai", Success: true, LatencyMs: 120, ProbedAt: 1_000},
		{ChannelId: 11, ChannelName: "alpha", ModelName: "openai/gpt-test", EndpointType: "openai", Success: false, LatencyMs: 300, ErrorCode: "bad_response", ErrorMessage: "upstream unavailable", ProbedAt: 1_100},
		{ChannelId: 12, ChannelName: "beta", ModelName: "anthropic/claude-test", EndpointType: "anthropic", Success: true, LatencyMs: 180, ProbedAt: 1_200},
	}).Error)

	failed := false
	rows, total, summary, err := ListChannelModelProbes(ChannelModelProbeFilter{
		Keyword:   "gpt",
		ChannelId: 11,
		Success:   &failed,
		StartAt:   900,
		EndAt:     1_300,
	}, 0, 200)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, int64(1), summary.TotalCount)
	assert.Zero(t, summary.SuccessCount)
	assert.Equal(t, int64(1), summary.FailedCount)
	assert.Equal(t, int64(300), summary.AvgLatencyMs)
	assert.Equal(t, int64(1_100), summary.LastProbedAt)
	assert.Equal(t, "bad_response", rows[0].ErrorCode)
	assert.Equal(t, "upstream unavailable", rows[0].ErrorMessage)

	channels, err := ListChannelModelProbeChannels(900, 1_300)
	require.NoError(t, err)
	assert.Equal(t, []ChannelModelProbeChannel{
		{ChannelId: 11, ChannelName: "alpha"},
		{ChannelId: 12, ChannelName: "beta"},
	}, channels)
}

func TestDeleteChannelModelProbesBeforeKeepsRecentRows(t *testing.T) {
	originalDB := DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	DB = db
	require.NoError(t, DB.AutoMigrate(&ChannelModelProbe{}))
	t.Cleanup(func() { DB = originalDB })

	require.NoError(t, DB.Create(&[]ChannelModelProbe{
		{ChannelId: 1, ModelName: "old", ProbedAt: 100},
		{ChannelId: 1, ModelName: "new", ProbedAt: 200},
	}).Error)
	require.NoError(t, DeleteChannelModelProbesBefore(150))

	var rows []ChannelModelProbe
	require.NoError(t, DB.Order("probed_at ASC").Find(&rows).Error)
	require.Len(t, rows, 1)
	assert.Equal(t, "new", rows[0].ModelName)
}
