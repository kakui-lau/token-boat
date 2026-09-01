package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestModelContextLengthPersistsAndCanBeCleared(t *testing.T) {
	resetPricingEndpointTestTables(t)

	metadata := &Model{
		ModelName:     "context-metadata-model",
		ContextLength: 200_000,
		Status:        1,
		SyncOfficial:  1,
		NameRule:      NameRuleExact,
	}
	require.NoError(t, metadata.Insert())

	var stored Model
	require.NoError(t, DB.First(&stored, metadata.Id).Error)
	assert.Equal(t, 200_000, stored.ContextLength)

	stored.ContextLength = 0
	require.NoError(t, stored.Update())
	require.NoError(t, DB.First(&stored, metadata.Id).Error)
	assert.Zero(t, stored.ContextLength)
}

func TestModelContextLengthRejectsNegativeValues(t *testing.T) {
	resetPricingEndpointTestTables(t)

	err := (&Model{
		ModelName:     "invalid-context-metadata-model",
		ContextLength: -1,
		Status:        1,
		SyncOfficial:  1,
		NameRule:      NameRuleExact,
	}).Insert()

	require.ErrorContains(t, err, "context_length must be non-negative")
}
