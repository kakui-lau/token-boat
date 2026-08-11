package controller

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestShouldRetryTaskRelayNeverRetriesLocalServerErrors(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	taskErr := &dto.TaskError{
		StatusCode: http.StatusBadGateway,
		LocalError: true,
		Error:      errors.New("accepted response could not be persisted"),
	}

	assert.False(t, shouldRetryTaskRelay(context, 1, taskErr, 3))
}

func TestShouldRetrySpecifiedChannelNeverFallsThroughOnChannelError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	common.SetContextKey(context, constant.ContextKeyTokenSpecificChannelId, "14")
	channelErr := types.NewError(
		errors.New("specified upstream failed"),
		types.ErrorCodeChannelResponseTimeExceeded,
	)

	assert.False(t, shouldRetry(context, channelErr, 3))
}

func TestShouldRetryChannelErrorWithoutSpecifiedChannel(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	channelErr := types.NewError(
		errors.New("upstream failed"),
		types.ErrorCodeChannelResponseTimeExceeded,
	)

	assert.True(t, shouldRetry(context, channelErr, 3))
}
