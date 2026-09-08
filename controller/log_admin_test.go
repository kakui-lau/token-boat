package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestAdminRequestLogDtoDoesNotExposeRawLogPayload(t *testing.T) {
	log := &model.Log{
		Id:               42,
		CreatedAt:        1_700_000_000,
		Type:             model.LogTypeConsume,
		Content:          "raw content must not cross the boundary",
		TokenId:          99,
		Quota:            250_000,
		PromptTokens:     12,
		CompletionTokens: 3,
		Other: common.MapToJsonStr(map[string]interface{}{
			"quota_per_unit": 500_000,
			"request_path":   "/v1/responses",
			"admin_info": map[string]interface{}{
				"credential": "must-not-leak",
			},
		}),
	}

	projection := adminRequestLogDto(log)
	payload, err := common.Marshal(projection)
	require.NoError(t, err)

	assert.NotNil(t, projection.CostUSD)
	assert.InDelta(t, 0.5, *projection.CostUSD, 0.000_001)
	assert.Equal(t, "/v1/responses", projection.Endpoint)
	serialized := string(payload)
	assert.NotContains(t, serialized, "must-not-leak")
	assert.NotContains(t, serialized, "admin_info")
	assert.NotContains(t, serialized, "token_id")
	assert.NotContains(t, serialized, "raw content")
}

func TestAdminRequestLogDtoLeavesUnknownHistoricalCostUnavailable(t *testing.T) {
	projection := adminRequestLogDto(&model.Log{Type: model.LogTypeConsume, Quota: 100})
	assert.Nil(t, projection.CostUSD)
}

func TestAdminRequestLogDtoBoundsErrorText(t *testing.T) {
	projection := adminRequestLogDto(&model.Log{
		Type:    model.LogTypeError,
		Content: strings.Repeat("错", 1_100),
	})
	assert.Len(t, []rune(projection.ErrorMessage), 1_001)
}

func TestGetAllLogsRequestScopeReturnsOnlySafeNetworkProjection(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousDB := model.DB
	previousLogDB := model.LOG_DB
	previousMainDatabaseType := common.MainDatabaseType()
	previousLogDatabaseType := common.LogDatabaseType()
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	t.Setenv("LOG_SQL_DSN", "")
	model.DB = database
	model.LOG_DB = database
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		model.DB = previousDB
		model.LOG_DB = previousLogDB
		common.SetDatabaseTypes(previousMainDatabaseType, previousLogDatabaseType)
	})
	require.NoError(t, model.InitLogDB())
	require.NoError(t, database.AutoMigrate(&model.Log{}))
	require.NoError(t, database.Create(&model.Log{
		CreatedAt:         100,
		Type:              model.LogTypeConsume,
		Content:           "raw content must not cross the boundary",
		TokenId:           99,
		Quota:             50,
		RequestId:         "safe-request",
		UpstreamRequestId: "safe-trace",
		Other: common.MapToJsonStr(map[string]interface{}{
			"quota_per_unit": 100,
			"request_path":   "/v1/responses",
			"admin_info": map[string]interface{}{
				"credential": "must-not-leak",
			},
		}),
	}).Error)

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodGet,
		"/api/log/?scope=request&start_timestamp=1&end_timestamp=200&p=1&page_size=10",
		nil,
	)

	GetAllLogs(context)

	assert.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Items []map[string]interface{} `json:"items"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.Len(t, response.Data.Items, 1)
	item := response.Data.Items[0]
	assert.Equal(t, "safe-request", item["request_id"])
	assert.Equal(t, "/v1/responses", item["endpoint"])
	assert.NotContains(t, item, "other")
	assert.NotContains(t, item, "content")
	assert.NotContains(t, item, "token_id")
	serialized := recorder.Body.String()
	assert.NotContains(t, serialized, "must-not-leak")
	assert.NotContains(t, serialized, "raw content")
}

func TestAdminLogHandlersRejectUnsafeTimeRanges(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handlers := []struct {
		name    string
		handler gin.HandlerFunc
	}{
		{name: "list", handler: GetAllLogs},
		{name: "stat", handler: GetLogsStat},
	}
	testCases := []struct {
		name    string
		query   string
		message string
	}{
		{
			name:    "request scope requires timestamps",
			query:   "?scope=request",
			message: "valid start_timestamp and end_timestamp are required",
		},
		{
			name:    "partial range is rejected",
			query:   "?scope=request&start_timestamp=10",
			message: "valid start_timestamp and end_timestamp are required",
		},
		{
			name:    "malformed timestamp is rejected",
			query:   "?scope=request&start_timestamp=bad&end_timestamp=10",
			message: "valid start_timestamp and end_timestamp are required",
		},
		{
			name:    "non-positive timestamp is rejected",
			query:   "?scope=request&start_timestamp=0&end_timestamp=10",
			message: "valid start_timestamp and end_timestamp are required",
		},
		{
			name:    "inverted range is rejected",
			query:   "?scope=request&start_timestamp=20&end_timestamp=10",
			message: "start_timestamp must not be after end_timestamp",
		},
		{
			name:    "range over 31 days is rejected",
			query:   "?scope=request&start_timestamp=1&end_timestamp=2678402",
			message: "log date range must not exceed 31 days",
		},
	}

	for _, handlerCase := range handlers {
		for _, testCase := range testCases {
			t.Run(handlerCase.name+"/"+testCase.name, func(t *testing.T) {
				recorder := httptest.NewRecorder()
				context, _ := gin.CreateTestContext(recorder)
				context.Request = httptest.NewRequest(http.MethodGet, "/api/log/"+testCase.query, nil)

				handlerCase.handler(context)

				var response struct {
					Success bool   `json:"success"`
					Message string `json:"message"`
				}
				require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
				assert.Equal(t, http.StatusBadRequest, recorder.Code)
				assert.False(t, response.Success)
				assert.Equal(t, testCase.message, response.Message)
			})
		}
	}
}

func TestParseAdminLogTimeRangePreservesLegacyIndependentParameters(t *testing.T) {
	gin.SetMode(gin.TestMode)

	testCases := []struct {
		name      string
		query     string
		wantStart int64
		wantEnd   int64
	}{
		{name: "empty range", wantStart: 0, wantEnd: 0},
		{name: "start only", query: "?start_timestamp=100", wantStart: 100, wantEnd: 0},
		{name: "end only", query: "?end_timestamp=200", wantStart: 0, wantEnd: 200},
		{name: "malformed value parses independently", query: "?start_timestamp=bad&end_timestamp=200", wantStart: 0, wantEnd: 200},
		{name: "range may exceed request scope limit", query: "?start_timestamp=1&end_timestamp=2678402", wantStart: 1, wantEnd: 2_678_402},
		{name: "inverted range remains compatible", query: "?start_timestamp=200&end_timestamp=100", wantStart: 200, wantEnd: 100},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			context, _ := gin.CreateTestContext(httptest.NewRecorder())
			context.Request = httptest.NewRequest(http.MethodGet, "/api/log/"+testCase.query, nil)

			start, end, err := parseAdminLogTimeRange(context, false)

			require.NoError(t, err)
			assert.Equal(t, testCase.wantStart, start)
			assert.Equal(t, testCase.wantEnd, end)
		})
	}
}

func TestParseAdminLogTimeRangeAcceptsRequestScopeLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)

	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest(
		http.MethodGet,
		"/api/log/?scope=request&start_timestamp=1&end_timestamp=2678401",
		nil,
	)
	start, end, err := parseAdminLogTimeRange(context, true)
	require.NoError(t, err)
	assert.Equal(t, int64(1), start)
	assert.Equal(t, int64(2_678_401), end)
}
