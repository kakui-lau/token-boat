package common

import (
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSanitizeRequestBodyForLogKeepsParametersAndMasksCredentials(t *testing.T) {
	body := []byte(`{
		"model":"gpt-5.6-sol",
		"max_tokens":1024,
		"messages":[{"role":"user","content":"hello"}],
		"metadata":{"access_token":"token-value","trace_id":"trace-1"},
		"api_key":"secret-key"
	}`)

	result := SanitizeRequestBodyForLog(body, "application/json")

	assert.Contains(t, result, `"model":"gpt-5.6-sol"`)
	assert.Contains(t, result, `"max_tokens":1024`)
	assert.Contains(t, result, `"content":"hello"`)
	assert.Contains(t, result, `"trace_id":"trace-1"`)
	assert.NotContains(t, result, "token-value")
	assert.NotContains(t, result, "secret-key")
	assert.Equal(t, 2, strings.Count(result, "***masked***"))
}

func TestSanitizeRequestBodyForLogMasksFormCredentials(t *testing.T) {
	result := SanitizeRequestBodyForLog(
		[]byte("model=gpt-5.6-sol&prompt=hello&api_key=secret-key"),
		"application/x-www-form-urlencoded",
	)

	assert.Contains(t, result, "model=gpt-5.6-sol")
	assert.Contains(t, result, "prompt=hello")
	assert.NotContains(t, result, "secret-key")
	assert.Contains(t, result, "%2A%2A%2Amasked%2A%2A%2A")
}

func TestSanitizeRequestBodyForLogSummarizesMultipartFiles(t *testing.T) {
	boundary := "request-log-boundary"
	body := strings.Join([]string{
		"--" + boundary,
		`Content-Disposition: form-data; name="model"`,
		"",
		"gpt-image-1",
		"--" + boundary,
		`Content-Disposition: form-data; name="image"; filename="input.png"`,
		"Content-Type: image/png",
		"",
		"binary-image-content",
		"--" + boundary + "--",
		"",
	}, "\r\n")

	result := SanitizeRequestBodyForLog(
		[]byte(body),
		fmt.Sprintf("multipart/form-data; boundary=%s", boundary),
	)

	require.NotEmpty(t, result)
	assert.Contains(t, result, `"model":"gpt-image-1"`)
	assert.Contains(t, result, `"filename":"input.png"`)
	assert.Contains(t, result, `"content_type":"image/png"`)
	assert.NotContains(t, result, "binary-image-content")
}

func TestSanitizeRequestBodyForLogIsAlwaysBounded(t *testing.T) {
	result := SanitizeRequestBodyForLog(
		[]byte(`{"prompt":"`+strings.Repeat("x", requestLogContentLimit*2)+`"}`),
		"application/json",
	)

	assert.Less(t, len(result), requestLogContentLimit+200)
	assert.Contains(t, result, "truncated")
}
