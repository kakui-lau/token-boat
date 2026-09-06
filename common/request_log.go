package common

import (
	"bytes"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
)

const requestLogContentLimit = 8192

// ClientRequestParametersForLog renders the client-visible method, URL and
// body for request-scoped error logs. It only reads an already-cached body so
// logging can never consume or otherwise change an in-flight request.
func ClientRequestParametersForLog(c *gin.Context) string {
	if c == nil || c.Request == nil {
		return ""
	}

	requestURL := ""
	if c.Request.URL != nil {
		requestURL = SanitizeRequestURLForLog(c.Request.URL.RequestURI())
	}

	body := "{}"
	bodyAvailable := false
	if cached, exists := c.Get(KeyBodyStorage); exists && cached != nil {
		if storage, ok := cached.(BodyStorage); ok {
			requestBody, err := storage.Bytes()
			if err != nil {
				body = fmt.Sprintf("[unavailable: %s]", err.Error())
			} else {
				body = SanitizeRequestBodyForLog(
					requestBody,
					c.Request.Header.Get("Content-Type"),
				)
			}
			bodyAvailable = true
		}
	}
	if !bodyAvailable {
		if cached, exists := c.Get(KeyRequestBody); exists && cached != nil {
			if requestBody, ok := cached.([]byte); ok {
				body = SanitizeRequestBodyForLog(
					requestBody,
					c.Request.Header.Get("Content-Type"),
				)
				bodyAvailable = true
			}
		}
	}
	if !bodyAvailable && c.Request.Body != nil && c.Request.ContentLength != 0 {
		body = "[unavailable: request body not cached]"
	}

	return fmt.Sprintf(
		"method=%s url=%q body=%s",
		c.Request.Method,
		requestURL,
		body,
	)
}

// SanitizeRequestURLForLog preserves routing parameters while masking query
// values that can authenticate a caller or validate a signed request.
func SanitizeRequestURLForLog(rawURL string) string {
	if rawURL == "" {
		return rawURL
	}

	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	query := parsedURL.Query()
	if len(query) == 0 {
		return rawURL
	}

	changed := false
	for key := range query {
		if isSensitiveRequestLogKey(key) {
			query.Set(key, "***masked***")
			changed = true
		}
	}
	if !changed {
		return rawURL
	}

	parsedURL.RawQuery = query.Encode()
	return parsedURL.String()
}

// SanitizeRequestBodyForLog renders request parameters for failure diagnostics
// without writing credentials or unbounded file/base64 content to application
// logs. The returned value is always bounded, including when debug mode is on.
func SanitizeRequestBodyForLog(body []byte, contentType string) string {
	if len(body) == 0 {
		return "{}"
	}
	mediaType, params, _ := mime.ParseMediaType(contentType)
	mediaType = strings.ToLower(strings.TrimSpace(mediaType))

	if mediaType == "application/x-www-form-urlencoded" {
		values, err := url.ParseQuery(string(body))
		if err == nil {
			for key := range values {
				if isSensitiveRequestLogKey(key) {
					values[key] = []string{"***masked***"}
					continue
				}
				for index, value := range values[key] {
					values[key][index] = sanitizeRequestLogString(value)
				}
			}
			return boundedRequestLogContent(values.Encode())
		}
	}

	if mediaType == "multipart/form-data" && params["boundary"] != "" {
		parts := make(map[string]any)
		reader := multipart.NewReader(bytes.NewReader(body), params["boundary"])
		for {
			part, err := reader.NextPart()
			if err == io.EOF {
				break
			}
			if err != nil {
				parts["_parse_error"] = err.Error()
				break
			}
			name := part.FormName()
			if name == "" {
				name = "_unnamed"
			}
			if part.FileName() != "" {
				size, _ := io.Copy(io.Discard, part)
				parts[name] = map[string]any{
					"filename":     part.FileName(),
					"content_type": part.Header.Get("Content-Type"),
					"size":         size,
				}
				continue
			}
			value, readErr := io.ReadAll(part)
			if readErr != nil {
				parts[name] = fmt.Sprintf("[unavailable: %s]", readErr.Error())
			} else if isSensitiveRequestLogKey(name) {
				parts[name] = "***masked***"
			} else {
				parts[name] = sanitizeRequestLogString(string(value))
			}
		}
		if rendered, err := Marshal(parts); err == nil {
			return boundedRequestLogContent(string(rendered))
		}
	}

	var value any
	if err := Unmarshal(body, &value); err == nil {
		value = sanitizeRequestLogValue(value)
		if rendered, marshalErr := Marshal(value); marshalErr == nil {
			return boundedRequestLogContent(string(rendered))
		}
	}

	return boundedRequestLogContent(sanitizeRequestLogString(string(body)))
}

func sanitizeRequestLogValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		for key, item := range typed {
			if isSensitiveRequestLogKey(key) {
				typed[key] = "***masked***"
				continue
			}
			typed[key] = sanitizeRequestLogValue(item)
		}
		return typed
	case []any:
		for index, item := range typed {
			typed[index] = sanitizeRequestLogValue(item)
		}
		return typed
	case string:
		return sanitizeRequestLogString(typed)
	default:
		return value
	}
}

func sanitizeRequestLogString(value string) string {
	masked := MaskSensitiveInfo(value)
	if len(masked) <= requestLogContentLimit/2 {
		return masked
	}
	return fmt.Sprintf(
		"%s... [truncated, original_length=%d]",
		masked[:requestLogContentLimit/2],
		len(masked),
	)
}

func boundedRequestLogContent(content string) string {
	if len(content) <= requestLogContentLimit {
		return content
	}
	return fmt.Sprintf(
		"%s... [truncated, original_length=%d, limit=%d]",
		content[:requestLogContentLimit],
		len(content),
		requestLogContentLimit,
	)
}

func isSensitiveRequestLogKey(key string) bool {
	normalized := strings.ToLower(strings.TrimSpace(key))
	switch normalized {
	case "authorization", "proxy-authorization", "cookie", "set-cookie",
		"key", "api-key", "api_key", "apikey", "x-api-key", "x-goog-api-key",
		"access-token", "access_token", "refresh-token", "refresh_token",
		"id-token", "id_token", "password", "passwd", "client-secret",
		"client_secret", "secret", "signature", "auth", "sig",
		"awsaccesskeyid", "x-amz-credential", "x-amz-security-token",
		"x-amz-signature":
		return true
	}
	return strings.Contains(normalized, "authorization") ||
		strings.Contains(normalized, "password") ||
		strings.Contains(normalized, "secret") ||
		normalized == "token" ||
		strings.HasSuffix(normalized, "_token") ||
		strings.HasSuffix(normalized, "-token") ||
		strings.Contains(normalized, "signature")
}
