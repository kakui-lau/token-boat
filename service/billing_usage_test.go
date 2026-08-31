package service

import (
	"testing"

	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
)

func TestAppendUsageBillingPathForLogExposesOnlyUserSafeSource(t *testing.T) {
	testCases := []struct {
		name     string
		local    bool
		usage    *dto.Usage
		expected string
	}{
		{name: "local", local: true, expected: "locally_counted"},
		{name: "service reported", usage: &dto.Usage{}, expected: "service_reported"},
		{
			name: "normalized exact",
			usage: &dto.Usage{BillingUsage: &dto.BillingUsage{
				Source:      dto.BillingUsageSourceOAIChat,
				Semantic:    dto.BillingUsageSemanticOpenAI,
				OpenAIUsage: &dto.Usage{},
			}},
			expected: "normalized_usage",
		},
		{
			name: "normalized estimate",
			usage: &dto.Usage{BillingUsage: &dto.BillingUsage{
				Source:      dto.BillingUsageSourceOAIChat,
				Semantic:    dto.BillingUsageSemanticOpenAI,
				Estimated:   true,
				OpenAIUsage: &dto.Usage{},
			}},
			expected: "normalized_estimate",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			other := map[string]interface{}{}

			appendUsageBillingPathForLog(other, testCase.local, testCase.usage)

			assert.Equal(t, testCase.expected, other["usage_count_source"])
			assert.NotContains(t, other, "usage_billing_path")
			adminInfo := other["admin_info"].(map[string]interface{})
			assert.Contains(t, adminInfo, "usage_billing_path")
		})
	}
}

func TestAppendUsageBillingPathForLogDoesNotClaimMissingUsageWasReported(t *testing.T) {
	other := map[string]interface{}{}

	appendUsageBillingPathForLog(other, false, nil)

	assert.NotContains(t, other, "usage_count_source")
}
