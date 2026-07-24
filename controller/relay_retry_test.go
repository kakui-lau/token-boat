package controller

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/dto"
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
