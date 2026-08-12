package channel

import (
	"net/http/httptest"
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestLogFailedUpstreamRequestNeverPanicsWhenTaskPersistenceFails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	request := httptest.NewRequest("POST", "https://provider.example/v1/images/generations", nil)

	require.NotPanics(t, func() {
		logFailedUpstreamRequest(context, request, []byte(`{"model":"image"}`), "400 Bad Request", &relaycommon.RelayInfo{})
	})
	require.NotPanics(t, func() {
		logFailedUpstreamRequest(context, request, []byte(`{"model":"image"}`), "400 Bad Request", &relaycommon.RelayInfo{
			TaskRelayInfo: &relaycommon.TaskRelayInfo{PersistedTaskID: 1},
		})
	})
}
