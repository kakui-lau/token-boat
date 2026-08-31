package controller

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetUserUsageAnalyticsRejectsInvalidRanges(t *testing.T) {
	gin.SetMode(gin.TestMode)
	testCases := []struct {
		name    string
		query   string
		message string
	}{
		{
			name:    "missing timestamps",
			query:   "",
			message: "valid start_timestamp and end_timestamp are required",
		},
		{
			name:    "reversed range",
			query:   "?start_timestamp=200&end_timestamp=100",
			message: "start_timestamp must not be after end_timestamp",
		},
		{
			name:    "range exceeds limit",
			query:   "?start_timestamp=1&end_timestamp=31622402",
			message: "usage date range must not exceed 366 days",
		},
		{
			name:    "timezone offset exceeds limit",
			query:   "?start_timestamp=1&end_timestamp=2&timezone_offset_minutes=841",
			message: "timezone_offset_minutes must be between -840 and 840",
		},
		{
			name:    "unsupported time bucket",
			query:   "?start_timestamp=1&end_timestamp=2&bucket_seconds=60",
			message: "bucket_seconds must be one of 300, 3600, 21600, or 86400",
		},
		{
			name:    "non request log type",
			query:   "?start_timestamp=1&end_timestamp=2&type=7",
			message: "type must be a request success or failure log type",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)
			context.Request = httptest.NewRequest("GET", "/api/log/self/usage"+testCase.query, nil)

			GetUserUsageAnalytics(context)

			var response struct {
				Success bool   `json:"success"`
				Message string `json:"message"`
			}
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
			assert.False(t, response.Success)
			assert.Equal(t, testCase.message, response.Message)
		})
	}
}
