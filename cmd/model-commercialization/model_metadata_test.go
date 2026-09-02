package main

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestValidateModelMetadataCatalogRejectsTagsThatDoNotMatchFamily(t *testing.T) {
	catalog := modelMetadataCatalog{
		Version: 1,
		Models: []modelMetadataCatalogItem{{
			ModelName:       "vendor/model",
			Family:          "reasoning",
			Tags:            []string{"文本"},
			SourceURL:       "https://vendor.example/models/model",
			SourceCheckedAt: "2026-09-02",
		}},
	}
	require.ErrorContains(t, validateModelMetadataCatalog(catalog), "infer family")
}

func TestReconcileModelMetadataUsesExpectedCurrentTagsAsOptimisticGuard(t *testing.T) {
	originalDB := model.DB
	t.Cleanup(func() { model.DB = originalDB })

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Model{}))
	model.DB = db
	require.NoError(t, db.Create(&model.Model{
		ModelName: "vendor/model", Description: "preserve me", Tags: "文本", Status: 1,
		Visibility: model.ModelVisibilityPublic,
	}).Error)

	catalog := modelMetadataCatalog{
		Version: 1,
		Models: []modelMetadataCatalogItem{{
			ModelName:           "vendor/model",
			Family:              "reasoning",
			ExpectedCurrentTags: []string{"文本"},
			Tags:                []string{"文本", "推理"},
			SourceURL:           "https://vendor.example/models/model",
			SourceCheckedAt:     "2026-09-02",
		}},
	}
	require.NoError(t, reconcileModelMetadata(catalog, true))

	var stored model.Model
	require.NoError(t, db.Where("model_name = ?", "vendor/model").First(&stored).Error)
	assert.Equal(t, "文本,推理", stored.Tags)
	assert.Equal(t, "preserve me", stored.Description)

	require.NoError(t, db.Model(&stored).Update("tags", "operator-change").Error)
	require.ErrorContains(t, reconcileModelMetadata(catalog, true), "metadata drift")
	require.NoError(t, db.Where("model_name = ?", "vendor/model").First(&stored).Error)
	assert.Equal(t, "operator-change", stored.Tags)
}
