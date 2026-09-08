package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestChannelSummaryViewReturnsOnlyAdminWorkspaceFields(t *testing.T) {
	database := setupModelListControllerTestDB(t)
	baseURL := "https://upstream.example.com"
	headerOverride := `{"Authorization":"Bearer sensitive-header"}`
	paramOverride := `{"secret_parameter":"sensitive-param"}`
	setting := `{"proxy":"http://sensitive-proxy.example.com"}`
	tag := "primary"
	priority := int64(7)
	weight := uint(12)
	channel := &model.Channel{
		Type:           constant.ChannelTypeOpenAI,
		Key:            "sensitive-api-key",
		Status:         common.ChannelStatusEnabled,
		Name:           "primary channel",
		Weight:         &weight,
		TestTime:       1_700_000_000,
		ResponseTime:   321,
		BaseURL:        &baseURL,
		Other:          "sensitive-other",
		Balance:        42.5,
		Models:         "gpt-test,gpt-test-mini",
		Group:          "default",
		Priority:       &priority,
		OtherInfo:      "sensitive-other-info",
		Tag:            &tag,
		Setting:        &setting,
		ParamOverride:  &paramOverride,
		HeaderOverride: &headerOverride,
		OtherSettings:  "sensitive-settings",
	}
	require.NoError(t, database.Create(channel).Error)

	tests := []struct {
		name    string
		target  string
		handler gin.HandlerFunc
	}{
		{name: "list", target: "/api/channel?p=1&page_size=20&view=summary", handler: GetAllChannels},
		{name: "search", target: "/api/channel/search?p=1&page_size=20&keyword=primary&view=summary", handler: SearchChannels},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)
			context.Request = httptest.NewRequest(http.MethodGet, test.target, nil)

			test.handler(context)

			require.Equal(t, http.StatusOK, recorder.Code)
			var response struct {
				Success bool `json:"success"`
				Data    struct {
					Items []map[string]any `json:"items"`
				} `json:"data"`
			}
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
			require.True(t, response.Success)
			require.Len(t, response.Data.Items, 1)

			keys := make([]string, 0, len(response.Data.Items[0]))
			for key := range response.Data.Items[0] {
				keys = append(keys, key)
			}
			assert.ElementsMatch(t, []string{
				"id",
				"type",
				"status",
				"name",
				"weight",
				"test_time",
				"response_time",
				"base_url",
				"balance",
				"models",
				"group",
				"priority",
				"tag",
			}, keys)
			assert.NotContains(t, recorder.Body.String(), "sensitive-")
		})
	}
}

func TestChannelListWithoutSummaryViewKeepsLegacyFields(t *testing.T) {
	database := setupModelListControllerTestDB(t)
	headerOverride := `{"Authorization":"Bearer legacy-header"}`
	channel := &model.Channel{
		Type:           constant.ChannelTypeOpenAI,
		Key:            "omitted-key",
		Status:         common.ChannelStatusEnabled,
		Name:           "legacy channel",
		Models:         "gpt-test",
		Group:          "default",
		HeaderOverride: &headerOverride,
	}
	require.NoError(t, database.Create(channel).Error)

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/channel?p=1&page_size=20", nil)

	GetAllChannels(context)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Data struct {
			Items []map[string]any `json:"items"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.Len(t, response.Data.Items, 1)
	assert.Equal(t, headerOverride, response.Data.Items[0]["header_override"])
	assert.Equal(t, "", response.Data.Items[0]["key"])
}
