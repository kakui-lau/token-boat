package model

import (
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type legacyPricingSnapshotMigrationRow struct {
	Id        int    `gorm:"primaryKey"`
	RequestId string `gorm:"type:varchar(64);not null"`
}

type pricingSnapshotPreConsumeMigrationRow struct {
	Id                     int    `gorm:"primaryKey"`
	RequestId              string `gorm:"type:varchar(64);not null"`
	ActualPreConsumedQuota int64  `gorm:"bigint;not null;default:0"`
	TokenPreConsumedQuota  int64  `gorm:"bigint;not null;default:0"`
}

func TestRequestPricingSnapshotPreConsumeMigrationBackfillsLegacyRows(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	const tableName = "request_pricing_snapshot_migration_rows"
	require.NoError(t, db.Table(tableName).AutoMigrate(&legacyPricingSnapshotMigrationRow{}))
	require.NoError(t, db.Table(tableName).Create(&legacyPricingSnapshotMigrationRow{
		Id:        1,
		RequestId: "legacy-request",
	}).Error)

	require.NoError(t, db.Table(tableName).AutoMigrate(&pricingSnapshotPreConsumeMigrationRow{}))

	var migrated pricingSnapshotPreConsumeMigrationRow
	require.NoError(t, db.Table(tableName).First(&migrated, 1).Error)
	assert.Zero(t, migrated.ActualPreConsumedQuota)
	assert.Zero(t, migrated.TokenPreConsumedQuota)
}

func TestRequestPricingSnapshotPreConsumeColumnsHaveZeroDefaults(t *testing.T) {
	statement := &gorm.Statement{DB: DB}
	require.NoError(t, statement.Parse(&RequestPricingSnapshot{}))

	for _, fieldName := range []string{"ActualPreConsumedQuota", "TokenPreConsumedQuota"} {
		field := statement.Schema.LookUpField(fieldName)
		require.NotNil(t, field)
		assert.True(t, field.NotNull)
		assert.Equal(t, "0", field.DefaultValue)
	}
}
