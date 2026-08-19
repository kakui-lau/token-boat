package service

import (
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	hosttypes "github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestPreWssConsumeQuotaDoesNotChargeLegacyRatioForV2Request(t *testing.T) {
	ctx, _ := gin.CreateTestContext(nil)
	info := &relaycommon.RelayInfo{
		DynamicPricingSnapshot: &hosttypes.DynamicPricingSnapshot{},
	}

	require.NoError(t, PreWssConsumeQuota(ctx, info, &dto.RealtimeUsage{
		TotalTokens: 100,
		InputTokens: 100,
	}))
}
