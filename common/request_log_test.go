package common

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSanitizeRequestURLForLogMasksCredentialsAndKeepsParameters(t *testing.T) {
	result := SanitizeRequestURLForLog(
		"/v1/responses?access_token=client-secret&token=opaque-token&provider_api_key=provider-secret&model=gpt-5.6-sol&X-Amz-Signature=signed-value",
	)

	parsed, err := url.Parse(result)
	require.NoError(t, err)
	assert.Equal(t, "gpt-5.6-sol", parsed.Query().Get("model"))
	assert.Equal(t, "***masked***", parsed.Query().Get("access_token"))
	assert.Equal(t, "***masked***", parsed.Query().Get("X-Amz-Signature"))
	assert.NotContains(t, result, "client-secret")
	assert.NotContains(t, result, "opaque-token")
	assert.NotContains(t, result, "provider-secret")
	assert.NotContains(t, result, "signed-value")
}

func TestSanitizeRequestURLForLogFailsClosed(t *testing.T) {
	result := SanitizeRequestURLForLog("/v1/responses?api_key=%zz-secret")

	assert.Equal(t, "[invalid request URL omitted]", result)
	assert.NotContains(t, result, "secret")
}

func TestSanitizeRequestURLForLogMasksCredentialsInPath(t *testing.T) {
	for _, rawURL := range []string{
		"/v1/files/sk-client-secret-value/content?trace_id=trace-1",
		"/v1/files/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature12/content",
	} {
		result := SanitizeRequestURLForLog(rawURL)

		assert.Contains(t, result, "masked", rawURL)
		assert.NotContains(t, result, "client-secret-value", rawURL)
		assert.NotContains(t, result, "eyJhbGciOiJIUzI1NiJ9", rawURL)
	}
}

func TestSanitizeRequestURLForLogMasksCredentialsEmbeddedInOrdinaryParametersAndBoundsOutput(t *testing.T) {
	result := SanitizeRequestURLForLog(
		"/v1/responses?prompt=" + url.QueryEscape("debug Bearer sk-embedded-query-secret-value") +
			"&input=" + strings.Repeat("x", requestLogURLLimit*2),
	)

	assert.Contains(t, result, "fingerprint%3Dsha256")
	assert.Contains(t, result, "truncated")
	assert.NotContains(t, result, "embedded-query-secret-value")
	assert.Less(t, len(result), requestLogURLLimit+200)
}

func TestSanitizeRequestHeadersForLogKeepsSafeProtocolHeadersAndMasksCredentials(t *testing.T) {
	headers := http.Header{
		"Authorization":          []string{"Bearer sk-client-secret-value"},
		"Cookie":                 []string{"session=browser-secret"},
		"X-Api-Key":              []string{"anthropic-secret-value"},
		"Sec-Websocket-Protocol": []string{"realtime, openai-insecure-api-key.sk-websocket-secret"},
		"Anthropic-Version":      []string{"2023-06-01"},
		"Content-Type":           []string{"application/json"},
		"X-Custom-Private":       []string{"private-value"},
	}

	result := SanitizeRequestHeadersForLog(headers)

	assert.Contains(t, result, `"Anthropic-Version":["2023-06-01"]`)
	assert.Contains(t, result, `"Content-Type":["application/json"]`)
	assert.Contains(t, result, `"Authorization":["Bearer ***masked*** [fingerprint=sha256:`)
	assert.Contains(t, result, `"X-Api-Key":["***masked*** [fingerprint=sha256:`)
	assert.Contains(t, result, `"Cookie":["***masked***"]`)
	assert.Contains(t, result, `"Sec-Websocket-Protocol":["***masked*** [fingerprint=sha256:`)
	assert.Contains(t, result, `"X-Custom-Private":["***masked***"]`)
	assert.NotContains(t, result, "client-secret-value")
	assert.NotContains(t, result, "browser-secret")
	assert.NotContains(t, result, "anthropic-secret-value")
	assert.NotContains(t, result, "websocket-secret")
	assert.NotContains(t, result, "private-value")
}

func TestSanitizeRequestHeadersForLogDoesNotFingerprintBasicAuth(t *testing.T) {
	result := SanitizeRequestHeadersForLog(http.Header{
		"Authorization":             []string{"Basic dXNlcjpwYXNz"},
		"X-Forwarded-Authorization": []string{"Basic Zm9vOmJhcg=="},
	})

	assert.Contains(t, result, `"Authorization":["***masked***"]`)
	assert.Contains(t, result, `"X-Forwarded-Authorization":["***masked***"]`)
	assert.NotContains(t, result, "fingerprint")
	assert.NotContains(t, result, "dXNlcjpwYXNz")
}

func TestSanitizeRequestBodyForLogDoesNotFingerprintBasicAuth(t *testing.T) {
	jsonResult := SanitizeRequestBodyForLog(
		[]byte(`{"authorization":"Basic dXNlcjpwYXNz"}`),
		"application/json",
	)
	formResult := SanitizeRequestBodyForLog(
		[]byte("authorization=Basic+dXNlcjpwYXNz"),
		"application/x-www-form-urlencoded",
	)

	for _, result := range []string{jsonResult, formResult} {
		assert.Contains(t, result, "masked")
		assert.NotContains(t, result, "fingerprint")
		assert.NotContains(t, result, "dXNlcjpwYXNz")
	}
}

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
	assert.Contains(t, result, "fingerprint=sha256:")
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

func TestSanitizeRequestBodyForLogMasksQualifiedCredentialFieldNames(t *testing.T) {
	result := SanitizeRequestBodyForLog(
		[]byte(`{"provider_api_key":"provider-secret-value","user_session_token":"session-secret-value","webhook_secret":"hook-secret-value","verification_code":"123456","max_tokens":256}`),
		"application/json",
	)

	assert.Contains(t, result, `"max_tokens":256`)
	assert.NotContains(t, result, "provider-secret-value")
	assert.NotContains(t, result, "session-secret-value")
	assert.NotContains(t, result, "hook-secret-value")
	assert.NotContains(t, result, "123456")
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

func TestSanitizeRequestBodyForLogKeepsRepeatedMultipartFields(t *testing.T) {
	var body strings.Builder
	body.WriteString("--boundary\r\n")
	body.WriteString("Content-Disposition: form-data; name=\"tag\"\r\n\r\nfirst\r\n")
	body.WriteString("--boundary\r\n")
	body.WriteString("Content-Disposition: form-data; name=\"tag\"\r\n\r\nsecond\r\n")
	body.WriteString("--boundary--\r\n")

	result := SanitizeRequestBodyForLog([]byte(body.String()), "multipart/form-data; boundary=boundary")

	assert.Contains(t, result, `"tag":["first","second"]`)
}

func TestRequestLogFileNameDropsClientPath(t *testing.T) {
	assert.Equal(t, "secret.png", requestLogFileName(`C:\Users\alice\secret.png`))
	assert.Equal(t, "secret.png", requestLogFileName("/home/alice/secret.png"))
}

func TestSanitizeRequestBodyForLogOmitsInvalidStructuredBody(t *testing.T) {
	result := SanitizeRequestBodyForLog(
		[]byte("{\n\"model\":\"gpt-5.6-sol\",\n\"api_key\":\"leaked-secret\""),
		"application/json",
	)

	assert.Contains(t, result, "invalid application/json body omitted")
	assert.NotContains(t, result, "leaked-secret")
	assert.NotContains(t, result, "\n")
}

func TestSanitizeRequestBodyForLogOmitsEncodedMedia(t *testing.T) {
	encoded := strings.Repeat("QUJDREVGR0g=", 100)
	result := SanitizeRequestBodyForLog(
		[]byte(`{"model":"gpt-image-1","input_audio":{"data":"`+encoded+`"}}`),
		"application/json",
	)

	assert.Contains(t, result, `"model":"gpt-image-1"`)
	assert.Contains(t, result, `"data":"[binary content omitted, original_length=`)
	assert.NotContains(t, result, encoded)
}

func TestSanitizeRequestBodyForLogOmitsBase64InCommonMediaFields(t *testing.T) {
	encoded := strings.Repeat("QUJDREVGR0g=", 8)
	result := SanitizeRequestBodyForLog(
		[]byte(`{"image":"`+encoded+`","images":["`+encoded+`"],"ref_audio":"`+encoded+`"}`),
		"application/json",
	)

	assert.Equal(t, 3, strings.Count(result, "[binary content omitted, original_length="))
	assert.NotContains(t, result, encoded)
}

func TestSanitizeRequestBodyForLogPreservesLargeIntegerParameters(t *testing.T) {
	result := SanitizeRequestBodyForLog(
		[]byte(`{"seed":18446744073709551615,"request_id":9007199254740993}`),
		"application/json",
	)

	assert.Contains(t, result, `"seed":18446744073709551615`)
	assert.Contains(t, result, `"request_id":9007199254740993`)
}

func TestSanitizeRequestBodyForLogKeepsTokenCountersAndMasksEmbeddedCredentials(t *testing.T) {
	result := SanitizeRequestBodyForLog(
		[]byte(`{
			"max_tokens":1024,
			"prompt_tokens":20,
			"prompt":"use Bearer sk-embedded-client-secret-value",
			"metadata":"{\"flowToken\":\"flow-secret-value\",\"trace_id\":\"trace-1\"}"
		}`),
		"application/json",
	)

	assert.Contains(t, result, `"max_tokens":1024`)
	assert.Contains(t, result, `"prompt_tokens":20`)
	assert.Contains(t, result, "fingerprint=sha256:")
	assert.Contains(t, result, `trace_id`)
	assert.NotContains(t, result, "embedded-client-secret-value")
	assert.NotContains(t, result, "flow-secret-value")
}

func TestSanitizeRequestBodyForLogMasksQuotedCredentialsInsidePrompt(t *testing.T) {
	result := SanitizeRequestBodyForLog(
		[]byte(`{"prompt":"debug payload: {\"api_key\":\"!abcDEF-SECRET\",\"password\":\"hunter!22-TAIL\",\"authorization\":\"user:pass-secret\"}"}`),
		"application/json",
	)

	assert.Contains(t, result, "fingerprint=sha256:")
	assert.NotContains(t, result, "abcDEF-SECRET")
	assert.NotContains(t, result, "hunter!22-TAIL")
	assert.NotContains(t, result, "user:pass-secret")
}

func TestSanitizeRequestBodyForLogMasksQualifiedAssignmentsInsidePrompt(t *testing.T) {
	result := SanitizeRequestBodyForLog(
		[]byte(`{"prompt":"provider_api_key=opaque!provider-secret AWS_SECRET_ACCESS_KEY=opaque!aws-secret webhook_secret=opaque!hook-secret max_tokens=256"}`),
		"application/json",
	)

	assert.Contains(t, result, "max_tokens=256")
	assert.NotContains(t, result, "opaque!provider-secret")
	assert.NotContains(t, result, "opaque!aws-secret")
	assert.NotContains(t, result, "opaque!hook-secret")
}

func TestSanitizeRequestBodyForLogOmitsOversizedEmbeddedJSON(t *testing.T) {
	embedded := `{"api_key":"embedded-opaque-secret","padding":"` + strings.Repeat("x", requestLogEmbeddedLimit) + `"}`
	body, err := Marshal(map[string]string{"arguments": embedded})
	require.NoError(t, err)

	result := SanitizeRequestBodyForLog(body, "application/json")

	assert.Contains(t, result, "embedded JSON omitted")
	assert.NotContains(t, result, "embedded-opaque-secret")
}

func TestSanitizeRequestBodyForLogIsAlwaysBounded(t *testing.T) {
	result := SanitizeRequestBodyForLog(
		[]byte(`{"prompt":"`+strings.Repeat("x", requestLogContentLimit*2)+`"}`),
		"application/json",
	)

	assert.Less(t, len(result), requestLogContentLimit+200)
	assert.Contains(t, result, "truncated")
	assert.True(t, utf8.ValidString(result))
}

func TestSanitizeRequestBodyForLogDoesNotParseOversizedBody(t *testing.T) {
	body := []byte(`{"prompt":"` + strings.Repeat("x", requestLogBodyParseLimit) + `"}`)

	result := SanitizeRequestBodyForLog(body, "application/json")

	assert.Contains(t, result, "body content omitted")
	assert.Contains(t, result, fmt.Sprintf("size=%d", len(body)))
	assert.Less(t, len(result), 200)
}

func TestClientRequestLogSnapshotKeepsOriginalRequestAndCapturesBodyWhenRead(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest(
		http.MethodPost,
		"/kling/v1/videos/text2video?trace_id=trace-1&key=query-secret",
		strings.NewReader(`{"model_name":"kling-v2","prompt":"hello"}`),
	)
	context.Request.Header.Set("Content-Type", "application/json")
	context.Request.Header.Set("Authorization", "Bearer sk-client-secret-value")

	BeginClientRequestLog(context)
	_, err := GetBodyStorage(context)
	require.NoError(t, err)
	t.Cleanup(func() {
		CleanupBodyStorage(context)
	})
	context.Request.Method = http.MethodGet
	context.Request.URL.Path = "/v1/video/generations"
	context.Request.URL.RawQuery = ""
	context.Request.Header.Set("Authorization", "Bearer rewritten-secret")
	FinishClientRequestLog(context)

	result := context.GetString(ClientRequestAccessLogKey)
	assert.Contains(t, result, "method=POST")
	assert.Contains(t, result, `url="/kling/v1/videos/text2video?`)
	assert.Contains(t, result, "trace_id=trace-1")
	assert.Contains(t, result, `"model_name":"kling-v2"`)
	assert.Contains(t, result, `"prompt":"hello"`)
	assert.NotContains(t, result, "query-secret")
	assert.NotContains(t, result, "client-secret-value")
	assert.NotContains(t, result, "rewritten-secret")
}

func TestDecodeJsonBodyReusableWithoutContentTypeCapturesAndPreservesBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest(http.MethodPost, "/suno/fetch", strings.NewReader(`{"ids":["task-1"]}`))
	BeginClientRequestLog(context)
	t.Cleanup(func() {
		CleanupBodyStorage(context)
	})

	var payload struct {
		IDs []string `json:"ids"`
	}
	require.NoError(t, DecodeJsonBodyReusable(context, &payload))

	assert.Equal(t, []string{"task-1"}, payload.IDs)
	remaining, err := io.ReadAll(context.Request.Body)
	require.NoError(t, err)
	assert.JSONEq(t, `{"ids":["task-1"]}`, string(remaining))
	FinishClientRequestLog(context)
	assert.Contains(t, context.GetString(ClientRequestAccessLogKey), `"ids":["task-1"]`)
}

func TestClientRequestLogSnapshotDoesNotReadBodyBeforeAuthentication(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	requestBody := strings.NewReader(`{"model":"gpt-5.6-sol","input":"hello"}`)
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", requestBody)
	context.Request.Header.Set("Content-Type", "application/json")

	BeginClientRequestLog(context)
	FinishClientRequestLog(context)

	remaining, err := io.ReadAll(context.Request.Body)
	require.NoError(t, err)
	assert.JSONEq(t, `{"model":"gpt-5.6-sol","input":"hello"}`, string(remaining))
	assert.Contains(t, context.GetString(ClientRequestAccessLogKey), "body=[not read because request ended before normal body processing")
}

type requestLogLargeStorage struct {
	size int64
}

func (storage *requestLogLargeStorage) Read([]byte) (int, error) {
	return 0, io.EOF
}

func (storage *requestLogLargeStorage) Seek(int64, int) (int64, error) {
	return 0, nil
}

func (storage *requestLogLargeStorage) Close() error {
	return nil
}

func (storage *requestLogLargeStorage) Bytes() ([]byte, error) {
	panic("large request log storage must not be materialized")
}

func (storage *requestLogLargeStorage) Size() int64 {
	return storage.size
}

func (storage *requestLogLargeStorage) IsDisk() bool {
	return true
}

func TestClientRequestParametersForLogDoesNotMaterializeLargeStorage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest(http.MethodPost, "/v1/audio/transcriptions", nil)
	context.Request.Header.Set("Content-Type", "multipart/form-data; boundary=test")
	context.Set(KeyBodyStorage, &requestLogLargeStorage{size: requestLogBodyParseLimit + 1})

	result := ClientRequestParametersForLog(context)

	assert.Contains(t, result, "body content omitted")
	assert.Contains(t, result, fmt.Sprintf("size=%d", requestLogBodyParseLimit+1))
}
