package controller

import (
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/stretchr/testify/assert"
)

func TestRelayRetryLimitUsesEveryFrozenV2Candidate(t *testing.T) {
	info := &relaycommon.RelayInfo{
		DynamicPricingSnapshot: &types.DynamicPricingSnapshot{
			RouteChannelIds: []int{11, 12, 13},
		},
	}

	assert.Equal(t, 2, relayRetryLimit(info))
}

func TestRelayRetryLimitDoesNotRetrySingleV2Candidate(t *testing.T) {
	info := &relaycommon.RelayInfo{
		DynamicPricingSnapshot: &types.DynamicPricingSnapshot{
			RouteChannelIds: []int{11},
		},
	}

	assert.Zero(t, relayRetryLimit(info))
}
