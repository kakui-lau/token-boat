package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestModelLimitsMetadataPersistsAndCanBeCleared(t *testing.T) {
	resetPricingEndpointTestTables(t)

	metadata := &Model{
		ModelName:        "context-metadata-model",
		ContextLength:    200_000,
		MaxOutputTokens:  8192,
		LimitsSourceURL:  "https://vendor.example/models/model",
		LimitsVerifiedAt: 1_788_192_000,
		Status:           1,
		SyncOfficial:     1,
		NameRule:         NameRuleExact,
	}
	require.NoError(t, metadata.Insert())

	var stored Model
	require.NoError(t, DB.First(&stored, metadata.Id).Error)
	assert.Equal(t, 200_000, stored.ContextLength)
	assert.Equal(t, 8192, stored.MaxOutputTokens)
	assert.Equal(t, "https://vendor.example/models/model", stored.LimitsSourceURL)
	assert.EqualValues(t, 1_788_192_000, stored.LimitsVerifiedAt)

	stored.ContextLength = 0
	stored.MaxOutputTokens = 0
	stored.LimitsSourceURL = ""
	stored.LimitsVerifiedAt = 0
	require.NoError(t, stored.Update())
	require.NoError(t, DB.First(&stored, metadata.Id).Error)
	assert.Zero(t, stored.ContextLength)
	assert.Zero(t, stored.MaxOutputTokens)
	assert.Empty(t, stored.LimitsSourceURL)
	assert.Zero(t, stored.LimitsVerifiedAt)
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

func TestModelLimitsMetadataRejectsInvalidValues(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(*Model)
		message string
	}{
		{
			name:    "negative output limit",
			mutate:  func(metadata *Model) { metadata.MaxOutputTokens = -1 },
			message: "max_output_tokens must be non-negative",
		},
		{
			name:    "output exceeds context",
			mutate:  func(metadata *Model) { metadata.MaxOutputTokens = 200_001 },
			message: "max_output_tokens must not exceed context_length",
		},
		{
			name: "non HTTPS source",
			mutate: func(metadata *Model) {
				metadata.LimitsSourceURL = "http://vendor.example/model"
				metadata.LimitsVerifiedAt = 1_788_192_000
			},
			message: "limits_source_url must be an absolute HTTPS URL",
		},
		{
			name:    "negative verification timestamp",
			mutate:  func(metadata *Model) { metadata.LimitsVerifiedAt = -1 },
			message: "limits_verified_at must be non-negative",
		},
		{
			name:    "incomplete provenance",
			mutate:  func(metadata *Model) { metadata.LimitsSourceURL = "https://vendor.example/model" },
			message: "must be provided together",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			resetPricingEndpointTestTables(t)
			metadata := &Model{
				ModelName:     "invalid-limits-metadata-model",
				ContextLength: 200_000,
				Status:        1,
				SyncOfficial:  1,
				NameRule:      NameRuleExact,
			}
			test.mutate(metadata)
			require.ErrorContains(t, metadata.Insert(), test.message)
		})
	}
}
