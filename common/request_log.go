package common

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
)

const (
	requestLogContentLimit   = 8192
	requestLogHeaderLimit    = 4096
	requestLogURLLimit       = 4096
	requestLogURLParseLimit  = 64 << 10
	requestLogBodyParseLimit = 1 << 20
	requestLogEmbeddedLimit  = 16 << 10
	requestLogMaxDepth       = 32
	requestLogMaxNodes       = 4096
	requestLogMaxArrayItems  = 256
	requestLogMaxObjectKeys  = 256

	ClientRequestAccessLogKey = "client_request_access_log"
	ClientRequestAuditKey     = "client_request_audit"
	clientRequestSnapshotKey  = "client_request_snapshot"
)

var (
	requestLogBearerPattern           = regexp.MustCompile(`(?i)\b(bearer|basic|token)\s+([A-Za-z0-9._~+/=-]{8,})`)
	requestLogAPIKeyPattern           = regexp.MustCompile(`(?i)\b(?:sk|rk|pk|ghp|gho|ghu|ghs|github_pat|xoxb|xoxp|xoxa|xoxr|AIza|AKIA)[-_A-Za-z0-9.]{10,}\b`)
	requestLogJWTPattern              = regexp.MustCompile(`\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]{8,})?\b`)
	requestLogAssignmentPrefixPattern = regexp.MustCompile(`(?i)\b([a-z][a-z0-9_.-]{0,127})\s*["']?\s*[:=]\s*`)
)

type clientRequestLogSnapshot struct {
	method        string
	requestURL    string
	contentLength int64
	headers       string
	body          string
	bodyCaptured  bool
}

// BeginClientRequestLog records metadata before authentication or
// compatibility adapters can rewrite it. Request bodies are not read here;
// GetRequestBody captures them when ordinary request processing does.
func BeginClientRequestLog(c *gin.Context) {
	if c == nil || c.Request == nil {
		return
	}
	body := "{}"
	bodyCaptured := true
	if c.Request.Body != nil && c.Request.Body != http.NoBody && c.Request.ContentLength != 0 {
		body = "[not read because request ended before normal body processing]"
		bodyCaptured = false
	}
	snapshot := &clientRequestLogSnapshot{
		method:        c.Request.Method,
		requestURL:    requestURLForLog(c.Request),
		contentLength: c.Request.ContentLength,
		headers:       SanitizeRequestHeadersForLog(c.Request.Header),
		body:          body,
		bodyCaptured:  bodyCaptured,
	}
	c.Set(ClientRequestAuditKey, true)
	c.Set(clientRequestSnapshotKey, snapshot)
}

// FinishClientRequestLog exposes the snapshot to the Gin access formatter.
func FinishClientRequestLog(c *gin.Context) {
	if c == nil {
		return
	}
	c.Set(ClientRequestAccessLogKey, ClientRequestParametersForLog(c))
}

// CaptureClientRequestBodyForLog is called by GetRequestBody on the first
// normal body read. Large bodies are summarized instead of materialized.
func CaptureClientRequestBodyForLog(c *gin.Context, storage BodyStorage) {
	if c == nil || storage == nil {
		return
	}
	snapshot := clientRequestSnapshot(c)
	if snapshot == nil || snapshot.bodyCaptured {
		return
	}
	snapshot.body = sanitizeRequestBodyStorageForLog(storage, c.Request.Header.Get("Content-Type"))
	snapshot.bodyCaptured = true
}

// CaptureClientRequestBodyErrorForLog records a safe body-read failure.
func CaptureClientRequestBodyErrorForLog(c *gin.Context, err error) {
	if c == nil || err == nil {
		return
	}
	snapshot := clientRequestSnapshot(c)
	if snapshot == nil || snapshot.bodyCaptured {
		return
	}
	snapshot.body = fmt.Sprintf("[request body unavailable: %s]", truncateRequestLogString(sanitizeRequestLogString(err.Error()), 1024))
	snapshot.bodyCaptured = true
}

// ClientRequestParametersForLog renders the original client-visible method,
// URL, safe headers and body parameters for request-scoped logs.
func ClientRequestParametersForLog(c *gin.Context) string {
	if c == nil || c.Request == nil {
		return ""
	}
	if snapshot := clientRequestSnapshot(c); snapshot != nil {
		return renderClientRequestLogSnapshot(snapshot)
	}

	snapshot := &clientRequestLogSnapshot{
		method:        c.Request.Method,
		requestURL:    requestURLForLog(c.Request),
		contentLength: c.Request.ContentLength,
		headers:       SanitizeRequestHeadersForLog(c.Request.Header),
		body:          "{}",
		bodyCaptured:  true,
	}
	if cached, exists := c.Get(KeyBodyStorage); exists && cached != nil {
		if storage, ok := cached.(BodyStorage); ok {
			snapshot.body = sanitizeRequestBodyStorageForLog(storage, c.Request.Header.Get("Content-Type"))
			return renderClientRequestLogSnapshot(snapshot)
		}
	}
	if cached, exists := c.Get(KeyRequestBody); exists && cached != nil {
		if requestBody, ok := cached.([]byte); ok {
			snapshot.body = sanitizeBoundedRequestBodyForLog(requestBody, c.Request.Header.Get("Content-Type"))
			return renderClientRequestLogSnapshot(snapshot)
		}
	}
	if c.Request.Body != nil && c.Request.Body != http.NoBody && c.Request.ContentLength != 0 {
		snapshot.body = "[unavailable: request body not cached]"
	}
	return renderClientRequestLogSnapshot(snapshot)
}

func clientRequestSnapshot(c *gin.Context) *clientRequestLogSnapshot {
	value, exists := c.Get(clientRequestSnapshotKey)
	if !exists || value == nil {
		return nil
	}
	snapshot, _ := value.(*clientRequestLogSnapshot)
	return snapshot
}

func renderClientRequestLogSnapshot(snapshot *clientRequestLogSnapshot) string {
	if snapshot == nil {
		return ""
	}
	return boundedRequestLogContent(fmt.Sprintf(
		"method=%s url=%q content_length=%d headers=%s body=%s",
		snapshot.method,
		snapshot.requestURL,
		snapshot.contentLength,
		snapshot.headers,
		snapshot.body,
	))
}

func requestURLForLog(request *http.Request) string {
	if request == nil || request.URL == nil {
		return ""
	}
	return SanitizeRequestURLForLog(request.URL.RequestURI())
}

func sanitizeRequestBodyStorageForLog(storage BodyStorage, contentType string) string {
	if storage.Size() > requestLogBodyParseLimit {
		return fmt.Sprintf(
			"[body content omitted: size=%d bytes exceeds safe logging limit=%d]",
			storage.Size(),
			requestLogBodyParseLimit,
		)
	}
	body, err := storage.Bytes()
	if err != nil {
		return fmt.Sprintf("[request body unavailable: %s]", truncateRequestLogString(sanitizeRequestLogString(err.Error()), 1024))
	}
	return SanitizeRequestBodyForLog(body, contentType)
}

func sanitizeBoundedRequestBodyForLog(body []byte, contentType string) string {
	if len(body) > requestLogBodyParseLimit {
		return fmt.Sprintf(
			"[body content omitted: size=%d bytes exceeds safe logging limit=%d]",
			len(body),
			requestLogBodyParseLimit,
		)
	}
	return SanitizeRequestBodyForLog(body, contentType)
}

// SanitizeRequestURLForLog preserves routing parameters while masking query
// values that can authenticate a caller or validate a signed request.
func SanitizeRequestURLForLog(rawURL string) string {
	if rawURL == "" {
		return rawURL
	}
	if len(rawURL) > requestLogURLParseLimit {
		return fmt.Sprintf("[request URL omitted: size=%d exceeds safe logging limit=%d]", len(rawURL), requestLogURLParseLimit)
	}
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return "[invalid request URL omitted]"
	}
	query, err := url.ParseQuery(parsedURL.RawQuery)
	if err != nil {
		return "[invalid request URL omitted]"
	}
	queryChanged := false
	for key, values := range query {
		if isSensitiveRequestLogKey(key) {
			query[key] = []string{"***masked***"}
			queryChanged = true
			continue
		}
		for index, value := range values {
			sanitized := truncateRequestLogString(sanitizeRequestLogString(value), 2048)
			query[key][index] = sanitized
			queryChanged = queryChanged || sanitized != value
		}
	}
	if queryChanged {
		parsedURL.RawQuery = query.Encode()
	}
	sanitizedPath := sanitizeRequestLogCredentialPatterns(parsedURL.Path)
	if sanitizedPath != parsedURL.Path {
		parsedURL.Path = sanitizedPath
		parsedURL.RawPath = ""
	}
	if parsedURL.User != nil {
		parsedURL.User = url.User("***masked***")
	}
	return boundedRequestLogContentWithLimit(parsedURL.String(), requestLogURLLimit)
}

// SanitizeRequestHeadersForLog keeps values needed to debug supported client
// protocols, masks credentials, and preserves unknown header names only.
func SanitizeRequestHeadersForLog(headers http.Header) string {
	if len(headers) == 0 {
		return "{}"
	}
	sanitized := make(map[string][]string, len(headers))
	for name, values := range headers {
		safeValues := make([]string, len(values))
		for index, value := range values {
			switch {
			case isNeverFingerprintRequestLogKey(name):
				safeValues[index] = "***masked***"
			case isSensitiveRequestLogHeader(name):
				safeValues[index] = maskedRequestLogHeaderCredential(name, value)
			case isSafeRequestLogHeader(name):
				safeValues[index] = truncateRequestLogString(sanitizeRequestLogString(value), 1024)
			default:
				safeValues[index] = "***masked***"
			}
		}
		sanitized[http.CanonicalHeaderKey(name)] = safeValues
	}
	rendered, err := Marshal(sanitized)
	if err != nil {
		return "{\"_error\":\"header rendering failed\"}"
	}
	return boundedRequestLogContentWithLimit(string(rendered), requestLogHeaderLimit)
}

// SanitizeRequestBodyForLog renders request parameters without writing
// credentials or file/base64 content. The returned value is always bounded.
func SanitizeRequestBodyForLog(body []byte, contentType string) string {
	if len(body) == 0 {
		return "{}"
	}
	if len(body) > requestLogBodyParseLimit {
		return fmt.Sprintf(
			"[body content omitted: size=%d bytes exceeds safe logging limit=%d]",
			len(body),
			requestLogBodyParseLimit,
		)
	}
	mediaType, params, _ := mime.ParseMediaType(contentType)
	mediaType = strings.ToLower(strings.TrimSpace(mediaType))
	if isBinaryRequestLogMediaType(mediaType) {
		return fmt.Sprintf("[binary body omitted: content_type=%s size=%d]", mediaType, len(body))
	}

	if mediaType == "application/x-www-form-urlencoded" {
		values, err := url.ParseQuery(string(body))
		if err != nil {
			return invalidRequestBodyLogMessage(mediaType, len(body))
		}
		for key := range values {
			if isSensitiveRequestLogKey(key) {
				for index, value := range values[key] {
					values[key][index] = maskedRequestLogValueForKey(key, value)
				}
				continue
			}
			for index, value := range values[key] {
				values[key][index] = sanitizeRequestLogString(value)
			}
		}
		return boundedRequestLogContent(values.Encode())
	}

	if mediaType == "multipart/form-data" {
		if params["boundary"] == "" {
			return invalidRequestBodyLogMessage(mediaType, len(body))
		}
		parts := make(map[string]any)
		reader := multipart.NewReader(bytes.NewReader(body), params["boundary"])
		for {
			part, err := reader.NextPart()
			if err == io.EOF {
				break
			}
			if err != nil {
				return invalidRequestBodyLogMessage(mediaType, len(body))
			}
			name := part.FormName()
			if name == "" {
				name = "_unnamed"
			}
			if part.FileName() != "" {
				size, _ := io.Copy(io.Discard, part)
				appendRequestLogPart(parts, name, map[string]any{
					"filename":     requestLogFileName(part.FileName()),
					"content_type": truncateRequestLogString(sanitizeSingleLine(part.Header.Get("Content-Type")), 256),
					"size":         size,
				})
				continue
			}
			value, readErr := io.ReadAll(io.LimitReader(part, requestLogContentLimit/2+1))
			if readErr != nil {
				appendRequestLogPart(parts, name, "[unavailable]")
			} else if isSensitiveRequestLogKey(name) {
				appendRequestLogPart(parts, name, maskedRequestLogValueForKey(name, string(value)))
			} else if len(value) > requestLogContentLimit/2 {
				appendRequestLogPart(parts, name, fmt.Sprintf("[field content omitted: size>%d]", requestLogContentLimit/2))
			} else {
				appendRequestLogPart(parts, name, sanitizeRequestLogFieldString(name, string(value)))
			}
		}
		if rendered, err := Marshal(parts); err == nil {
			return boundedRequestLogContent(string(rendered))
		}
		return invalidRequestBodyLogMessage(mediaType, len(body))
	}

	var value any
	if err := UnmarshalUseNumber(body, &value); err == nil {
		value = sanitizeRequestLogValue(value, "")
		if rendered, marshalErr := Marshal(value); marshalErr == nil {
			return boundedRequestLogContent(string(rendered))
		}
	}
	if mediaType == "application/json" || strings.HasSuffix(mediaType, "+json") {
		return invalidRequestBodyLogMessage(mediaType, len(body))
	}
	if !utf8.Valid(body) {
		return fmt.Sprintf("[non-text body omitted: content_type=%s size=%d]", mediaType, len(body))
	}
	return boundedRequestLogContent(strconv.Quote(sanitizeRequestLogString(string(body))))
}

func appendRequestLogPart(parts map[string]any, name string, value any) {
	existing, exists := parts[name]
	if !exists {
		parts[name] = value
		return
	}
	if values, ok := existing.([]any); ok {
		parts[name] = append(values, value)
		return
	}
	parts[name] = []any{existing, value}
}

func requestLogFileName(filename string) string {
	normalized := strings.ReplaceAll(filename, `\`, "/")
	if separator := strings.LastIndexByte(normalized, '/'); separator >= 0 {
		normalized = normalized[separator+1:]
	}
	return truncateRequestLogString(sanitizeRequestLogCredentialPatterns(normalized), 512)
}

func sanitizeRequestLogValue(value any, fieldPath string) any {
	remainingNodes := requestLogMaxNodes
	return sanitizeRequestLogValueWithBudget(value, fieldPath, 0, &remainingNodes)
}

func sanitizeRequestLogValueWithBudget(value any, fieldPath string, depth int, remainingNodes *int) any {
	if depth >= requestLogMaxDepth || *remainingNodes <= 0 {
		return "[nested content omitted: logging budget exceeded]"
	}
	*remainingNodes--
	switch typed := value.(type) {
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		sanitized := make(map[string]any, min(len(keys), requestLogMaxObjectKeys)+1)
		for index, key := range keys {
			if index >= requestLogMaxObjectKeys || *remainingNodes <= 0 {
				sanitized["_request_log_omitted_fields"] = len(keys) - index
				break
			}
			item := typed[key]
			path := key
			if fieldPath != "" {
				path = fieldPath + "." + key
			}
			if isSensitiveRequestLogKey(key) {
				if stringValue, ok := item.(string); ok {
					sanitized[key] = maskedRequestLogValueForKey(key, stringValue)
				} else {
					sanitized[key] = "***masked***"
				}
				continue
			}
			sanitized[key] = sanitizeRequestLogValueWithBudget(item, path, depth+1, remainingNodes)
		}
		return sanitized
	case []any:
		limit := min(len(typed), requestLogMaxArrayItems)
		sanitized := make([]any, 0, limit+1)
		for index := 0; index < limit && *remainingNodes > 0; index++ {
			sanitized = append(sanitized, sanitizeRequestLogValueWithBudget(typed[index], fieldPath, depth+1, remainingNodes))
		}
		if len(sanitized) < len(typed) {
			sanitized = append(sanitized, map[string]any{
				"_request_log_omitted_items": len(typed) - len(sanitized),
			})
		}
		return sanitized
	case string:
		return sanitizeRequestLogFieldStringWithBudget(fieldPath, typed, depth, remainingNodes)
	default:
		return value
	}
}

func sanitizeRequestLogFieldString(fieldPath string, value string) string {
	remainingNodes := requestLogMaxNodes
	return sanitizeRequestLogFieldStringWithBudget(fieldPath, value, 0, &remainingNodes)
}

func sanitizeRequestLogFieldStringWithBudget(fieldPath string, value string, depth int, remainingNodes *int) string {
	if isEncodedMediaRequestLogValue(fieldPath, value) {
		return fmt.Sprintf("[binary content omitted, original_length=%d]", len(value))
	}
	if isStructuredRequestLogStringField(fieldPath, value) {
		if len(value) > requestLogEmbeddedLimit {
			return fmt.Sprintf("[embedded JSON omitted: original_length=%d exceeds safe logging limit=%d]", len(value), requestLogEmbeddedLimit)
		}
		var nestedValue any
		if err := UnmarshalUseNumber([]byte(value), &nestedValue); err != nil {
			return fmt.Sprintf("[invalid embedded JSON omitted, original_length=%d]", len(value))
		}
		sanitized := sanitizeRequestLogValueWithBudget(nestedValue, fieldPath, depth+1, remainingNodes)
		rendered, err := Marshal(sanitized)
		if err != nil {
			return "[embedded JSON rendering failed]"
		}
		return truncateRequestLogString(string(rendered), requestLogContentLimit/2)
	}
	return sanitizeRequestLogString(value)
}

func sanitizeRequestLogString(value string) string {
	if strings.Contains(value, "-----BEGIN") && strings.Contains(value, "PRIVATE KEY-----") {
		return fmt.Sprintf("[private key content omitted, original_length=%d]", len(value))
	}
	return truncateRequestLogString(sanitizeRequestLogCredentialPatterns(MaskSensitiveInfo(value)), requestLogContentLimit/2)
}

func sanitizeRequestLogCredentialPatterns(value string) string {
	masked := value
	masked = requestLogBearerPattern.ReplaceAllStringFunc(masked, func(match string) string {
		separator := strings.IndexByte(match, ' ')
		if separator < 0 {
			return "***masked***"
		}
		if strings.EqualFold(match[:separator], "basic") {
			return match[:separator+1] + "***masked***"
		}
		return match[:separator+1] + maskedRequestLogCredential(match[separator+1:])
	})
	masked = requestLogJWTPattern.ReplaceAllStringFunc(masked, maskedRequestLogCredential)
	masked = requestLogAPIKeyPattern.ReplaceAllStringFunc(masked, maskedRequestLogCredential)
	return sanitizeSingleLine(maskRequestLogAssignments(masked))
}

func maskRequestLogAssignments(value string) string {
	matches := requestLogAssignmentPrefixPattern.FindAllStringSubmatchIndex(value, -1)
	if len(matches) == 0 {
		return value
	}
	var sanitized strings.Builder
	sanitized.Grow(len(value))
	cursor := 0
	for _, match := range matches {
		if len(match) < 4 || match[0] < cursor {
			continue
		}
		prefixEnd := match[1]
		key := value[match[2]:match[3]]
		if !isSensitiveRequestLogKey(key) {
			continue
		}
		sanitized.WriteString(value[cursor:prefixEnd])
		valueStart := prefixEnd
		valueEnd := valueStart
		quote := byte(0)
		if valueStart < len(value) && (value[valueStart] == '\'' || value[valueStart] == '"') {
			quote = value[valueStart]
			valueStart++
			valueEnd = valueStart
			for valueEnd < len(value) {
				if value[valueEnd] == '\\' && valueEnd+1 < len(value) {
					valueEnd += 2
					continue
				}
				if value[valueEnd] == quote {
					break
				}
				valueEnd++
			}
		} else {
			for valueEnd < len(value) && !isRequestLogAssignmentDelimiter(value[valueEnd]) {
				valueEnd++
			}
		}

		credential := value[valueStart:valueEnd]
		maskedCredential := maskedRequestLogValueForKey(key, credential)
		if quote != 0 {
			sanitized.WriteByte(quote)
		}
		sanitized.WriteString(maskedCredential)
		if quote != 0 && valueEnd < len(value) && value[valueEnd] == quote {
			sanitized.WriteByte(quote)
			valueEnd++
		}
		cursor = valueEnd
	}
	sanitized.WriteString(value[cursor:])
	return sanitized.String()
}

func isRequestLogAssignmentDelimiter(character byte) bool {
	switch character {
	case ' ', '\t', '\r', '\n', ',', ';', '&', '}', ']', '"', '\'':
		return true
	default:
		return false
	}
}

func maskedRequestLogCredential(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "***masked***"
	}
	digest := sha256.Sum256([]byte(trimmed))
	return fmt.Sprintf("***masked*** [fingerprint=sha256:%x]", digest[:6])
}

func maskedRequestLogHeaderCredential(name string, value string) string {
	return maskedRequestLogValueForKey(name, value)
}

func maskedRequestLogValueForKey(key string, value string) string {
	if isNeverFingerprintRequestLogKey(key) {
		return "***masked***"
	}
	fields := strings.Fields(value)
	if len(fields) > 0 && strings.EqualFold(fields[0], "basic") {
		return "***masked***"
	}
	compactKey := strings.NewReplacer("-", "", "_", "", ".", "").Replace(strings.ToLower(strings.TrimSpace(key)))
	if strings.Contains(compactKey, "authorization") {
		if len(fields) != 2 || !strings.EqualFold(fields[0], "bearer") {
			return "***masked***"
		}
		return fields[0] + " " + maskedRequestLogCredential(fields[1])
	}
	return maskedRequestLogCredential(value)
}

func invalidRequestBodyLogMessage(mediaType string, size int) string {
	if mediaType == "" {
		mediaType = "unknown"
	}
	return fmt.Sprintf("[invalid %s body omitted: size=%d]", mediaType, size)
}

func boundedRequestLogContent(content string) string {
	return boundedRequestLogContentWithLimit(content, requestLogContentLimit)
}

func boundedRequestLogContentWithLimit(content string, limit int) string {
	if len(content) <= limit {
		return sanitizeSingleLine(content)
	}
	prefix := truncateUTF8(content, limit)
	return fmt.Sprintf(
		"%s... [truncated, original_length=%d, limit=%d]",
		sanitizeSingleLine(prefix),
		len(content),
		limit,
	)
}

func truncateRequestLogString(value string, limit int) string {
	if len(value) <= limit {
		return sanitizeSingleLine(value)
	}
	return fmt.Sprintf(
		"%s... [truncated, original_length=%d]",
		sanitizeSingleLine(truncateUTF8(value, limit)),
		len(value),
	)
}

func truncateUTF8(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	if limit <= 0 {
		return ""
	}
	for limit > 0 && !utf8.ValidString(value[:limit]) {
		limit--
	}
	return value[:limit]
}

func sanitizeSingleLine(value string) string {
	value = strings.ReplaceAll(value, "\r", `\r`)
	return strings.ReplaceAll(value, "\n", `\n`)
}

func isSensitiveRequestLogKey(key string) bool {
	normalized := strings.ToLower(strings.TrimSpace(key))
	compact := strings.NewReplacer("-", "", "_", "", ".", "").Replace(normalized)
	switch compact {
	case "authorization", "proxyauthorization", "cookie", "setcookie",
		"key", "apikey", "xapikey", "xgoogapikey", "mjapisecret",
		"token", "accesstoken", "refreshtoken", "idtoken", "flowtoken", "sessiontoken",
		"session", "sessionid", "csrftoken", "xcsrftoken", "xsrftoken",
		"password", "passwd", "clientsecret", "secret", "privatekey",
		"credential", "credentials", "signature", "sig", "auth",
		"awsaccesskeyid", "xamzcredential", "xamzsecuritytoken", "xamzsignature",
		"turnstiletoken", "securityproof", "cfaccessjwtassertion",
		"verificationcode", "backupcode", "backupcodes":
		return true
	}
	return strings.Contains(compact, "authorization") ||
		strings.Contains(compact, "password") ||
		strings.Contains(compact, "apikey") ||
		strings.Contains(compact, "accesstoken") ||
		strings.Contains(compact, "refreshtoken") ||
		strings.Contains(compact, "sessiontoken") ||
		strings.Contains(compact, "authtoken") ||
		strings.Contains(compact, "secret") ||
		strings.HasSuffix(compact, "token") ||
		strings.Contains(compact, "privatekey") ||
		strings.Contains(compact, "clientsecret") ||
		strings.Contains(compact, "signature")
}

func isNeverFingerprintRequestLogKey(key string) bool {
	compact := strings.NewReplacer("-", "", "_", "", ".", "").Replace(strings.ToLower(strings.TrimSpace(key)))
	return strings.Contains(compact, "password") ||
		strings.Contains(compact, "cookie") ||
		strings.Contains(compact, "session") ||
		strings.Contains(compact, "csrf") ||
		strings.Contains(compact, "xsrf") ||
		strings.Contains(compact, "secret") ||
		strings.Contains(compact, "privatekey") ||
		strings.Contains(compact, "clientsecret") ||
		strings.Contains(compact, "signature") ||
		strings.Contains(compact, "securityproof") ||
		strings.Contains(compact, "turnstile") ||
		strings.Contains(compact, "verificationcode") ||
		strings.Contains(compact, "backupcode")
}

func isSensitiveRequestLogHeader(name string) bool {
	compact := strings.NewReplacer("-", "", "_", "", ".", "").Replace(strings.ToLower(strings.TrimSpace(name)))
	return isSensitiveRequestLogKey(name) ||
		strings.Contains(compact, "auth") ||
		strings.Contains(compact, "token") ||
		strings.Contains(compact, "credential") ||
		compact == "secwebsocketprotocol" ||
		compact == "secwebsocketkey"
}

func isSafeRequestLogHeader(name string) bool {
	normalized := strings.ToLower(strings.TrimSpace(name))
	switch normalized {
	case "accept", "accept-language", "content-type", "content-encoding",
		"user-agent", "anthropic-version", "anthropic-beta", "openai-beta",
		"x-request-id", "x-correlation-id", "idempotency-key", "traceparent", "tracestate":
		return true
	}
	return strings.HasPrefix(normalized, "x-stainless-")
}

func isBinaryRequestLogMediaType(mediaType string) bool {
	return strings.HasPrefix(mediaType, "image/") ||
		strings.HasPrefix(mediaType, "audio/") ||
		strings.HasPrefix(mediaType, "video/") ||
		mediaType == "application/octet-stream" ||
		mediaType == "application/pdf"
}

func isEncodedMediaRequestLogValue(fieldPath string, value string) bool {
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(value)), "data:") {
		return true
	}
	compactPath := strings.NewReplacer("-", "", "_", "", ".", "").Replace(strings.ToLower(fieldPath))
	for _, fragment := range []string{
		"base64", "b64json", "b64image", "inlinedata", "inputaudiodata",
		"binarydata", "filedata", "sourcebase64", "targetbase64", "maskbase64",
	} {
		if strings.Contains(compactPath, fragment) {
			return true
		}
	}
	leafPath := fieldPath
	if separator := strings.LastIndexByte(leafPath, '.'); separator >= 0 {
		leafPath = leafPath[separator+1:]
	}
	compactLeaf := strings.NewReplacer("-", "", "_", "").Replace(strings.ToLower(leafPath))
	if isMediaRequestLogField(compactLeaf) && len(value) >= 64 {
		return looksLikeEncodedRequestLogValue(value)
	}
	if len(value) >= 512 && strings.HasSuffix(compactPath, "data") {
		return looksLikeEncodedRequestLogValue(value)
	}
	return false
}

func isMediaRequestLogField(compactField string) bool {
	switch compactField {
	case "image", "images", "imageurl", "audio", "audios", "video", "videos",
		"file", "files", "mask", "refaudio", "referenceaudio", "refimage",
		"referenceimage", "inputimage", "outputimage", "initimage", "lastframeimage":
		return true
	default:
		return false
	}
}

func looksLikeEncodedRequestLogValue(value string) bool {
	validCharacters := 0
	for _, character := range value {
		if (character >= 'a' && character <= 'z') ||
			(character >= 'A' && character <= 'Z') ||
			(character >= '0' && character <= '9') ||
			strings.ContainsRune("+/=_-", character) {
			validCharacters++
		}
	}
	return validCharacters*100/len(value) >= 98
}

func isStructuredRequestLogStringField(fieldPath string, value string) bool {
	if len(value) == 0 {
		return false
	}
	trimmed := strings.TrimSpace(value)
	if !strings.HasPrefix(trimmed, "{") && !strings.HasPrefix(trimmed, "[") {
		return false
	}
	compactPath := strings.NewReplacer("-", "", "_", "", ".", "").Replace(strings.ToLower(fieldPath))
	for _, suffix := range []string{"metadata", "extrabody", "extrafields", "extraparams", "parameters", "arguments"} {
		if strings.HasSuffix(compactPath, suffix) {
			return true
		}
	}
	return false
}
