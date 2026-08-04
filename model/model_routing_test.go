package model

import (
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupModelRoutingTestDB(t *testing.T) {
	t.Helper()
	originalDB := DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Model{}))
	DB = db
	InvalidateModelRoutingCache()
	t.Cleanup(func() {
		InvalidateModelRoutingCache()
		DB = originalDB
	})
}

func TestResolveModelRoutingUsesDirectModelNameAndAliasTarget(t *testing.T) {
	setupModelRoutingTestDB(t)
	target := Model{
		ModelName:    "openai/gpt-5.6-terra",
		Status:       1,
		NameRule:     NameRuleExact,
		Visibility:   ModelVisibilityPublic,
		SyncOfficial: 1,
	}
	require.NoError(t, DB.Create(&target).Error)
	alias := Model{
		ModelName:            "codex-auto-review",
		Status:               1,
		NameRule:             NameRuleExact,
		Visibility:           ModelVisibilityInternal,
		ModelPurpose:         ModelPurposeApprovalReview,
		RoutingTargetModelId: &target.Id,
	}
	require.NoError(t, DB.Create(&alias).Error)
	InvalidateModelRoutingCache()

	direct, err := ResolveModelRouting(target.ModelName)
	require.NoError(t, err)
	assert.False(t, direct.IsAlias)
	assert.Equal(t, target.ModelName, direct.ResolvedModelName)

	resolved, err := ResolveModelRouting(alias.ModelName)
	require.NoError(t, err)
	assert.True(t, resolved.IsAlias)
	assert.Equal(t, alias.ModelName, resolved.RequestedModelName)
	assert.Equal(t, target.ModelName, resolved.ResolvedModelName)
	assert.Equal(t, ModelPurposeApprovalReview, resolved.Purpose)
}

func TestModelAliasValidationRejectsInvalidTargets(t *testing.T) {
	setupModelRoutingTestDB(t)
	target := Model{
		ModelName:  "target-model",
		Status:     1,
		NameRule:   NameRuleExact,
		Visibility: ModelVisibilityPublic,
	}
	require.NoError(t, target.Insert())

	missingPurpose := Model{
		ModelName:            "missing-purpose",
		Status:               1,
		NameRule:             NameRuleExact,
		RoutingTargetModelId: &target.Id,
	}
	err := missingPurpose.Insert()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "supported purpose")

	validAlias := Model{
		ModelName:            "valid-alias",
		Status:               1,
		NameRule:             NameRuleExact,
		ModelPurpose:         ModelPurposeApprovalReview,
		RoutingTargetModelId: &target.Id,
	}
	require.NoError(t, validAlias.Insert())
	assert.Equal(t, ModelVisibilityInternal, validAlias.Visibility)
	assert.Equal(t, 0, validAlias.SyncOfficial)

	aliasTarget := Model{
		ModelName:            "alias-chain",
		Status:               1,
		NameRule:             NameRuleExact,
		ModelPurpose:         ModelPurposeApprovalReview,
		RoutingTargetModelId: &validAlias.Id,
	}
	err = aliasTarget.Insert()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "cannot target another alias")
}

func TestReferencedRoutingTargetCannotBeDisabledChangedOrDeleted(t *testing.T) {
	setupModelRoutingTestDB(t)
	target := Model{
		ModelName:  "protected-target",
		Status:     1,
		NameRule:   NameRuleExact,
		Visibility: ModelVisibilityPublic,
	}
	require.NoError(t, target.Insert())
	alias := Model{
		ModelName:            "protected-alias",
		Status:               1,
		NameRule:             NameRuleExact,
		ModelPurpose:         ModelPurposeApprovalReview,
		RoutingTargetModelId: &target.Id,
	}
	require.NoError(t, alias.Insert())

	err := ValidateModelStatusChange(DB, target.Id, 0)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "active routing target")

	target.Status = 0
	err = target.Update()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "active routing target")

	target.Status = 1
	target.NameRule = NameRulePrefix
	err = target.Update()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "exact name matching")

	err = target.Delete()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "referenced by a system alias")
}

func TestListModelRoutingTargetsReturnsOnlyEnabledDirectExactModels(t *testing.T) {
	setupModelRoutingTestDB(t)
	direct := Model{ModelName: "direct", Status: 1, NameRule: NameRuleExact}
	require.NoError(t, DB.Create(&direct).Error)
	excluded := Model{ModelName: "excluded", Status: 1, NameRule: NameRuleExact}
	require.NoError(t, DB.Create(&excluded).Error)
	disabled := Model{ModelName: "disabled", Status: 1, NameRule: NameRuleExact}
	require.NoError(t, DB.Create(&disabled).Error)
	require.NoError(t, DB.Model(&Model{}).Where("id = ?", disabled.Id).Update("status", 0).Error)
	require.NoError(t, DB.Create(&Model{
		ModelName: "prefix-", Status: 1, NameRule: NameRulePrefix,
	}).Error)
	require.NoError(t, DB.Create(&Model{
		ModelName:            "alias",
		Status:               1,
		NameRule:             NameRuleExact,
		ModelPurpose:         ModelPurposeApprovalReview,
		RoutingTargetModelId: &direct.Id,
	}).Error)

	targets, err := ListModelRoutingTargets(excluded.Id)
	require.NoError(t, err)
	require.Len(t, targets, 1)
	assert.Equal(t, direct.Id, targets[0].Id)
	assert.Equal(t, direct.ModelName, targets[0].ModelName)
}

func TestDisabledAliasCannotBeEnabledWhenItsTargetIsDisabled(t *testing.T) {
	setupModelRoutingTestDB(t)
	target := Model{ModelName: "disabled-target", Status: 1, NameRule: NameRuleExact}
	require.NoError(t, target.Insert())
	alias := Model{
		ModelName:            "disabled-alias",
		Status:               0,
		NameRule:             NameRuleExact,
		ModelPurpose:         ModelPurposeApprovalReview,
		RoutingTargetModelId: &target.Id,
	}
	require.NoError(t, alias.Insert())
	require.NoError(t, UpdateModelStatus(target.Id, 0))

	err := UpdateModelStatus(alias.Id, 1)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "target model must be enabled")
}
