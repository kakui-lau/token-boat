package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAbortWithOpenAIMessageUsesOpenRouterVideoErrorContract(t *testing.T) {
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/videos", nil)
	context.Set(common.RequestIdKey, "req_test")

	abortWithOpenAiMessage(context, http.StatusUnauthorized, "invalid token")

	assert.Equal(t, http.StatusUnauthorized, recorder.Code)
	assert.True(t, context.IsAborted())
	require.JSONEq(t, `{"error":{"code":401,"message":"invalid token (request id: req_test)"}}`, recorder.Body.String())
}

func TestAbortWithOpenAIMessageKeepsExistingContractOutsideVideoAPI(t *testing.T) {
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	context.Set(common.RequestIdKey, "req_test")

	abortWithOpenAiMessage(context, http.StatusUnauthorized, "invalid token")

	assert.Equal(t, http.StatusUnauthorized, recorder.Code)
	require.JSONEq(t, `{"error":{"message":"invalid token (request id: req_test)","type":"new_api_error","code":""}}`, recorder.Body.String())
}
