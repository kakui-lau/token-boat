package model

import (
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestRetireRedundantIndexesRemovesLegacyIndexesAndKeepsReplacementIndexes(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&User{},
		&SystemInstance{},
		&RequestPricingSnapshot{},
		&PaymentCallbackEvent{},
		&Log{},
		&QuotaData{},
		&TopUp{},
	))

	legacyIndexes := []struct {
		model any
		name  string
		sql   string
	}{
		{model: &User{}, name: "idx_users_username", sql: "CREATE INDEX idx_users_username ON users(username)"},
		{model: &SystemInstance{}, name: "idx_system_instances_updated_at", sql: "CREATE INDEX idx_system_instances_updated_at ON system_instances(updated_at)"},
		{model: &RequestPricingSnapshot{}, name: "idx_request_pricing_snapshots_status", sql: "CREATE INDEX idx_request_pricing_snapshots_status ON request_pricing_snapshots(status)"},
		{model: &PaymentCallbackEvent{}, name: "idx_payment_callback_events_event_type", sql: "CREATE INDEX idx_payment_callback_events_event_type ON payment_callback_events(event_type)"},
		{model: &Log{}, name: "idx_logs_ip", sql: "CREATE INDEX idx_logs_ip ON logs(ip)"},
	}
	for _, index := range legacyIndexes {
		require.NoError(t, db.Exec(index.sql).Error)
		require.True(t, db.Migrator().HasIndex(index.model, index.name))
	}

	require.NoError(t, retireRedundantIndexes(db))
	for _, index := range legacyIndexes {
		assert.False(t, db.Migrator().HasIndex(index.model, index.name), index.name)
	}

	for _, index := range []struct {
		model any
		name  string
	}{
		{model: &QuotaData{}, name: "uk_quota_data_dimension"},
		{model: &QuotaData{}, name: "idx_qdt_user_created"},
		{model: &QuotaData{}, name: "idx_qdt_username_created"},
		{model: &Log{}, name: "idx_logs_user_type_created_id"},
		{model: &TopUp{}, name: "idx_topups_created"},
		{model: &RequestPricingSnapshot{}, name: "idx_request_pricing_status_created_id"},
		{model: &RequestPricingSnapshot{}, name: "idx_request_pricing_status_updated"},
		{model: &RequestPricingSnapshot{}, name: "idx_request_pricing_status_preconsume"},
	} {
		assert.True(t, db.Migrator().HasIndex(index.model, index.name), index.name)
	}
}
