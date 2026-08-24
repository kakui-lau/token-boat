package model

import (
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestRetireLegacyModelPricingOptions(t *testing.T) {
	originalDB := DB
	t.Cleanup(func() { DB = originalDB })

	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	DB = db
	require.NoError(t, DB.AutoMigrate(&Option{}))
	require.NoError(t, DB.Create([]Option{
		{Key: "ModelRatio", Value: `{}`},
		{Key: "billing_setting.billing_expr", Value: `{}`},
		{Key: "GroupRatio", Value: `{"default":1}`},
	}).Error)

	require.NoError(t, retireLegacyModelPricingOptions())
	require.NoError(t, retireLegacyModelPricingOptions())

	var options []Option
	require.NoError(t, DB.Order("key").Find(&options).Error)
	assert.Equal(t, []Option{{Key: "GroupRatio", Value: `{"default":1}`}}, options)
}
