package controller

import (
	"testing"

	taskdto "github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/assert"
)

func TestBuildOpenRouterVideoErrorDataUnwrapsUpstreamJSON(t *testing.T) {
	errorData := buildOpenRouterVideoErrorData(&taskdto.TaskError{
		StatusCode: 400,
		Message:    `{"code":400,"message":"视频生成参数不合法","request_id":"req_123","trace_id":"trace_123","timestamp":"2026-08-04T12:39:44Z"}`,
	})

	assert.Equal(t, 400, errorData.Code)
	assert.Equal(t, "视频生成参数不合法", errorData.Message)
	assert.EqualValues(t, 400, errorData.Metadata["upstream_code"])
	assert.Equal(t, "req_123", errorData.Metadata["request_id"])
	assert.Equal(t, "trace_123", errorData.Metadata["trace_id"])
	assert.Equal(t, "2026-08-04T12:39:44Z", errorData.Metadata["timestamp"])
}

func TestBuildOpenRouterVideoErrorDataKeepsPlainMessage(t *testing.T) {
	errorData := buildOpenRouterVideoErrorData(&taskdto.TaskError{
		StatusCode: 429,
		Message:    "Rate limit exceeded",
	})

	assert.Equal(t, 429, errorData.Code)
	assert.Equal(t, "Rate limit exceeded", errorData.Message)
	assert.Nil(t, errorData.Metadata)
}
