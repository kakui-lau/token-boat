package model

import (
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type legacyQuotaDataMigrationRow struct {
	Id        int `gorm:"primaryKey"`
	UserID    int
	Username  string
	ModelName string
	CreatedAt int64
	UseGroup  string
	TokenID   int
	ChannelID int
	NodeName  string
	TokenUsed int
	Count     int
	Quota     int
}

func (legacyQuotaDataMigrationRow) TableName() string {
	return "quota_data"
}

func TestQuotaDataDimensionKeyUsesUnambiguousEncoding(t *testing.T) {
	left := &QuotaData{
		UserID: 1, Username: "a", ModelName: "bc", CreatedAt: 3600,
		UseGroup: "default", TokenID: 2, ChannelID: 3, NodeName: "node-a",
	}
	right := &QuotaData{
		UserID: 1, Username: "ab", ModelName: "c", CreatedAt: 3600,
		UseGroup: "default", TokenID: 2, ChannelID: 3, NodeName: "node-a",
	}

	leftKey := quotaDataDimensionKey(left)
	assert.Len(t, leftKey, 64)
	assert.Equal(t, leftKey, quotaDataDimensionKey(left))
	assert.NotEqual(t, leftKey, quotaDataDimensionKey(right))
}

func TestUpsertQuotaDataAtomicallyAccumulatesOneDimension(t *testing.T) {
	truncateTables(t)

	first := &QuotaData{
		UserID: 1, Username: "alice", ModelName: "gpt-a", CreatedAt: 3600,
		UseGroup: "vip", TokenID: 11, ChannelID: 2, NodeName: "node-a",
		Count: 1, Quota: 100, TokenUsed: 40,
	}
	second := &QuotaData{
		UserID: 1, Username: "alice", ModelName: "gpt-a", CreatedAt: 3600,
		UseGroup: "vip", TokenID: 11, ChannelID: 2, NodeName: "node-a",
		Count: 2, Quota: 50, TokenUsed: 20,
	}

	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		if err := upsertQuotaData(tx, first); err != nil {
			return err
		}
		return upsertQuotaData(tx, second)
	}))

	var rows []QuotaData
	require.NoError(t, DB.Find(&rows).Error)
	require.Len(t, rows, 1)
	assert.Len(t, rows[0].DimensionKey, 64)
	assert.Equal(t, 3, rows[0].Count)
	assert.Equal(t, 150, rows[0].Quota)
	assert.Equal(t, 60, rows[0].TokenUsed)
}

func TestQuotaDataSnapshotRestorationPreservesWritesThatArriveDuringFlush(t *testing.T) {
	CacheQuotaDataLock.Lock()
	CacheQuotaData = make(map[string]*QuotaData)
	CacheQuotaDataLock.Unlock()
	t.Cleanup(func() {
		CacheQuotaDataLock.Lock()
		CacheQuotaData = make(map[string]*QuotaData)
		CacheQuotaDataLock.Unlock()
	})

	LogQuotaData(QuotaDataLogParams{
		UserID: 1, Username: "alice", ModelName: "gpt-a", CreatedAt: 3601,
		UseGroup: "vip", TokenID: 11, ChannelID: 2, NodeName: "node-a",
		Quota: 100, TokenUsed: 40,
	})
	pendingQuotaData := takeQuotaDataCacheSnapshot()
	require.Len(t, pendingQuotaData, 1)

	LogQuotaData(QuotaDataLogParams{
		UserID: 1, Username: "alice", ModelName: "gpt-a", CreatedAt: 3650,
		UseGroup: "vip", TokenID: 11, ChannelID: 2, NodeName: "node-a",
		Quota: 50, TokenUsed: 20,
	})
	restoreQuotaDataCache(pendingQuotaData)

	CacheQuotaDataLock.Lock()
	defer CacheQuotaDataLock.Unlock()
	require.Len(t, CacheQuotaData, 1)
	for _, quotaData := range CacheQuotaData {
		assert.Equal(t, 2, quotaData.Count)
		assert.Equal(t, 150, quotaData.Quota)
		assert.Equal(t, 60, quotaData.TokenUsed)
	}
}

func TestPrepareQuotaDataDimensionKeyBackfillsAndMergesLegacyRows(t *testing.T) {
	originalDB := DB
	t.Cleanup(func() { DB = originalDB })

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	DB = db
	require.NoError(t, DB.AutoMigrate(&legacyQuotaDataMigrationRow{}))
	require.NoError(t, DB.Create([]legacyQuotaDataMigrationRow{
		{
			Id: 1, UserID: 1, Username: "alice", ModelName: "gpt-a", CreatedAt: 3600,
			UseGroup: "vip", TokenID: 11, ChannelID: 2, NodeName: "node-a",
			TokenUsed: 40, Count: 1, Quota: 100,
		},
		{
			Id: 2, UserID: 1, Username: "alice", ModelName: "gpt-a", CreatedAt: 3600,
			UseGroup: "vip", TokenID: 11, ChannelID: 2, NodeName: "node-a",
			TokenUsed: 20, Count: 2, Quota: 50,
		},
	}).Error)

	require.NoError(t, prepareQuotaDataDimensionKey())
	require.True(t, DB.Migrator().HasColumn(&QuotaData{}, "DimensionKey"))
	require.NoError(t, DB.AutoMigrate(&QuotaData{}))
	require.True(t, DB.Migrator().HasIndex(&QuotaData{}, "uk_quota_data_dimension"))
	require.NoError(t, prepareQuotaDataDimensionKey())

	var rows []QuotaData
	require.NoError(t, DB.Find(&rows).Error)
	require.Len(t, rows, 1)
	assert.Len(t, rows[0].DimensionKey, 64)
	assert.Equal(t, 3, rows[0].Count)
	assert.Equal(t, 150, rows[0].Quota)
	assert.Equal(t, 60, rows[0].TokenUsed)

	duplicate := rows[0]
	duplicate.Id = 0
	assert.Error(t, DB.Create(&duplicate).Error)
}
