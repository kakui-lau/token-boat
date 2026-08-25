package middleware

import (
	"net/http"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestAccessLogFormatterSamplesSuccessfulHealthChecks(t *testing.T) {
	formatter := newAccessLogFormatter()
	startedAt := time.Date(2026, 8, 25, 5, 43, 0, 0, time.UTC)

	first := formatter(gin.LogFormatterParams{
		TimeStamp:  startedAt,
		StatusCode: http.StatusOK,
		Method:     http.MethodGet,
		Path:       "/health",
	})
	withinInterval := formatter(gin.LogFormatterParams{
		TimeStamp:  startedAt.Add(successfulHealthAccessLogInterval - time.Second),
		StatusCode: http.StatusOK,
		Method:     http.MethodGet,
		Path:       "/health",
	})
	afterInterval := formatter(gin.LogFormatterParams{
		TimeStamp:  startedAt.Add(successfulHealthAccessLogInterval),
		StatusCode: http.StatusOK,
		Method:     http.MethodGet,
		Path:       "/health",
	})

	assert.NotEmpty(t, first)
	assert.Empty(t, withinInterval)
	assert.NotEmpty(t, afterInterval)
}

func TestAccessLogFormatterAlwaysPrintsFailedHealthChecks(t *testing.T) {
	formatter := newAccessLogFormatter()
	startedAt := time.Date(2026, 8, 25, 5, 43, 0, 0, time.UTC)
	_ = formatter(gin.LogFormatterParams{
		TimeStamp:  startedAt,
		StatusCode: http.StatusOK,
		Method:     http.MethodGet,
		Path:       "/health",
	})

	failed := formatter(gin.LogFormatterParams{
		TimeStamp:  startedAt.Add(time.Second),
		StatusCode: http.StatusServiceUnavailable,
		Method:     http.MethodGet,
		Path:       "/health",
	})
	ordinary := formatter(gin.LogFormatterParams{
		TimeStamp:  startedAt.Add(2 * time.Second),
		StatusCode: http.StatusOK,
		Method:     http.MethodGet,
		Path:       "/api/status",
	})

	assert.NotEmpty(t, failed)
	assert.NotEmpty(t, ordinary)
}
