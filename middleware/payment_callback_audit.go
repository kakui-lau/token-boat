package middleware

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

const (
	paymentCallbackPreviewLimit = 16 * 1024
	paymentCallbackOutcomeKey   = "payment_callback_audit_outcome"
)

type paymentCallbackAuditOutcome struct {
	verificationStatus string
	processingStatus   string
	errorMessage       string
}

var paymentCallbackSensitiveKeys = map[string]struct{}{
	"account_number":         {},
	"authorization":          {},
	"billing_details":        {},
	"card":                   {},
	"card_number":            {},
	"client_secret":          {},
	"customer_email":         {},
	"customer_name":          {},
	"cvv":                    {},
	"email":                  {},
	"key":                    {},
	"name":                   {},
	"payer_email":            {},
	"payment_method_details": {},
	"phone":                  {},
	"secret":                 {},
	"shipping_details":       {},
	"sign":                   {},
	"signature":              {},
	"token":                  {},
}

// PaymentCallbackAudit records every inbound provider callback attempt without
// affecting payment delivery. Database failures are logged and callbacks keep
// flowing through the provider-specific handler.
func PaymentCallbackAudit(provider string) gin.HandlerFunc {
	provider = strings.TrimSpace(provider)
	return func(c *gin.Context) {
		outcome := &paymentCallbackAuditOutcome{}
		c.Set(paymentCallbackOutcomeKey, outcome)
		startedAt := time.Now()
		rawPayload, readErr := readPaymentCallbackPayload(c)
		payloadDigest := sha256.Sum256(rawPayload)
		payloadValue := parsePaymentCallbackPayload(rawPayload, c.Request.URL.Query())
		eventID, eventType, tradeNo := paymentCallbackMetadata(provider, payloadValue)
		preview := sanitizePaymentCallbackPreview(payloadValue)
		event := &model.PaymentCallbackEvent{
			Provider:           provider,
			EventID:            eventID,
			EventType:          eventType,
			TradeNo:            tradeNo,
			RequestMethod:      c.Request.Method,
			RequestPath:        c.Request.URL.Path,
			ClientIP:           c.ClientIP(),
			PayloadDigest:      hex.EncodeToString(payloadDigest[:]),
			PayloadPreview:     preview,
			VerificationStatus: model.PaymentCallbackVerificationPending,
			ProcessingStatus:   model.PaymentCallbackStatusReceived,
			ReceivedAt:         common.GetTimestamp(),
		}
		if readErr != nil {
			event.ErrorMessage = readErr.Error()
		}
		persisted := model.CreatePaymentCallbackEvent(event) == nil
		if !persisted {
			logger.LogError(c.Request.Context(), fmt.Sprintf("payment callback audit create failed provider=%s path=%s", provider, c.Request.URL.Path))
		}

		c.Next()

		event.HTTPStatus = c.Writer.Status()
		if event.HTTPStatus == 0 {
			event.HTTPStatus = http.StatusOK
		}
		event.CompletedAt = common.GetTimestamp()
		event.DurationMs = time.Since(startedAt).Milliseconds()
		if outcome.processingStatus != "" {
			event.VerificationStatus = outcome.verificationStatus
			event.ProcessingStatus = outcome.processingStatus
			event.ErrorMessage = outcome.errorMessage
		} else {
			switch {
			case event.HTTPStatus >= http.StatusOK && event.HTTPStatus < http.StatusMultipleChoices:
				event.VerificationStatus = model.PaymentCallbackVerificationVerified
				event.ProcessingStatus = model.PaymentCallbackStatusProcessed
			case event.HTTPStatus >= http.StatusInternalServerError:
				event.ProcessingStatus = model.PaymentCallbackStatusFailed
				event.ErrorMessage = http.StatusText(event.HTTPStatus)
			default:
				event.VerificationStatus = model.PaymentCallbackVerificationRejected
				event.ProcessingStatus = model.PaymentCallbackStatusRejected
				event.ErrorMessage = http.StatusText(event.HTTPStatus)
			}
		}
		if persisted {
			if err := model.FinishPaymentCallbackEvent(event); err != nil {
				logger.LogError(c.Request.Context(), fmt.Sprintf("payment callback audit finish failed provider=%s event_id=%s error=%q", provider, event.EventID, err.Error()))
				return
			}
			createPaymentCallbackAlert(c, event)
		}
	}
}

// MarkPaymentCallbackProcessed records a provider-verified callback that was
// accepted by the business handler. It is mainly needed by providers such as
// Epay and Waffo that always respond with HTTP 200 and encode the result in the
// response body.
func MarkPaymentCallbackProcessed(c *gin.Context) {
	setPaymentCallbackOutcome(c, model.PaymentCallbackVerificationVerified, model.PaymentCallbackStatusProcessed, "")
}

// MarkPaymentCallbackRejected records a callback that failed authentication or
// request validation, independently of the HTTP status required by a provider.
func MarkPaymentCallbackRejected(c *gin.Context, message string) {
	setPaymentCallbackOutcome(c, model.PaymentCallbackVerificationRejected, model.PaymentCallbackStatusRejected, message)
}

// MarkPaymentCallbackFailed records a verified callback whose business
// processing failed, independently of the HTTP status returned to the provider.
func MarkPaymentCallbackFailed(c *gin.Context, message string) {
	setPaymentCallbackOutcome(c, model.PaymentCallbackVerificationVerified, model.PaymentCallbackStatusFailed, message)
}

// MarkPaymentCallbackUnavailable records infrastructure or configuration
// failures that happen before provider verification can be completed.
func MarkPaymentCallbackUnavailable(c *gin.Context, message string) {
	setPaymentCallbackOutcome(c, model.PaymentCallbackVerificationPending, model.PaymentCallbackStatusFailed, message)
}

func setPaymentCallbackOutcome(c *gin.Context, verificationStatus string, processingStatus string, message string) {
	value, exists := c.Get(paymentCallbackOutcomeKey)
	if !exists {
		return
	}
	outcome, ok := value.(*paymentCallbackAuditOutcome)
	if !ok || outcome == nil {
		return
	}
	outcome.verificationStatus = verificationStatus
	outcome.processingStatus = processingStatus
	outcome.errorMessage = strings.TrimSpace(message)
}

func readPaymentCallbackPayload(c *gin.Context) ([]byte, error) {
	if c.Request.Method == http.MethodGet || c.Request.Body == nil {
		return []byte(c.Request.URL.RawQuery), nil
	}
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		return nil, err
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(body))
	return body, nil
}

func parsePaymentCallbackPayload(raw []byte, query url.Values) any {
	if len(raw) > 0 {
		var payload any
		if common.Unmarshal(raw, &payload) == nil {
			return payload
		}
		if form, err := url.ParseQuery(string(raw)); err == nil && len(form) > 0 {
			return paymentCallbackValuesMap(form)
		}
	}
	return paymentCallbackValuesMap(query)
}

func paymentCallbackValuesMap(values url.Values) map[string]any {
	result := make(map[string]any, len(values))
	for key, entries := range values {
		if len(entries) == 1 {
			result[key] = entries[0]
		} else if len(entries) > 1 {
			result[key] = entries
		}
	}
	return result
}

func sanitizePaymentCallbackPreview(payload any) string {
	sanitized := sanitizePaymentCallbackValue(payload)
	data, err := common.Marshal(sanitized)
	if err != nil {
		return ""
	}
	if len(data) <= paymentCallbackPreviewLimit {
		return string(data)
	}
	limit := paymentCallbackPreviewLimit
	for limit > 0 && !utf8.Valid(data[:limit]) {
		limit--
	}
	return string(data[:limit]) + "…"
}

func sanitizePaymentCallbackValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		result := make(map[string]any, len(typed))
		for key, child := range typed {
			if _, sensitive := paymentCallbackSensitiveKeys[strings.ToLower(strings.TrimSpace(key))]; sensitive {
				result[key] = "[REDACTED]"
				continue
			}
			result[key] = sanitizePaymentCallbackValue(child)
		}
		return result
	case []any:
		result := make([]any, 0, len(typed))
		for _, child := range typed {
			result = append(result, sanitizePaymentCallbackValue(child))
		}
		return result
	default:
		return value
	}
}

func paymentCallbackMetadata(provider string, payload any) (string, string, string) {
	root, ok := payload.(map[string]any)
	if !ok {
		return "", "", ""
	}
	switch provider {
	case model.PaymentProviderStripe:
		return callbackStringAt(root, "id"), callbackStringAt(root, "type"), callbackStringAt(root, "data", "object", "client_reference_id")
	case model.PaymentProviderCreem:
		return callbackStringAt(root, "id"), callbackStringAt(root, "eventType"), callbackStringAt(root, "object", "request_id")
	case model.PaymentProviderWaffo:
		return callbackStringAt(root, "eventId"), callbackStringAt(root, "eventType"), callbackStringAt(root, "result", "merchantOrderId")
	case model.PaymentProviderWaffoPancake:
		return callbackStringAt(root, "id"), firstCallbackString(root, []string{"event_type"}, []string{"type"}), firstCallbackString(root, []string{"data", "orderMerchantExternalId"}, []string{"data", "order_merchant_external_id"})
	case model.PaymentProviderEpay:
		return callbackStringAt(root, "trade_no"), callbackStringAt(root, "trade_status"), firstCallbackString(root, []string{"out_trade_no"}, []string{"trade_no"})
	default:
		return callbackStringAt(root, "id"), callbackStringAt(root, "type"), callbackStringAt(root, "trade_no")
	}
}

func firstCallbackString(root map[string]any, paths ...[]string) string {
	for _, path := range paths {
		if value := callbackStringAt(root, path...); value != "" {
			return value
		}
	}
	return ""
}

func callbackStringAt(root map[string]any, path ...string) string {
	var current any = root
	for _, key := range path {
		object, ok := current.(map[string]any)
		if !ok {
			return ""
		}
		current, ok = object[key]
		if !ok {
			return ""
		}
	}
	switch value := current.(type) {
	case string:
		return strings.TrimSpace(value)
	case float64:
		return strconv.FormatFloat(value, 'f', -1, 64)
	case int:
		return strconv.Itoa(value)
	case int64:
		return strconv.FormatInt(value, 10)
	default:
		return ""
	}
}

func createPaymentCallbackAlert(c *gin.Context, event *model.PaymentCallbackEvent) {
	if event.ProcessingStatus == model.PaymentCallbackStatusProcessed && !event.Duplicate {
		return
	}
	severity := model.FinanceAlertSeverityWarning
	title := "Payment callback requires review"
	code := model.FinanceAlertCodeCallbackRejected
	if event.ProcessingStatus == model.PaymentCallbackStatusFailed {
		severity = model.FinanceAlertSeverityCritical
		title = "Payment callback processing failed"
		code = model.FinanceAlertCodeCallbackFailed
	} else if event.Duplicate {
		title = "Duplicate payment callback received"
		code = model.FinanceAlertCodeCallbackDuplicate
	}
	entityID := event.EventID
	if entityID == "" {
		entityID = event.PayloadDigest
	}
	alertIdentity := sha256.Sum256([]byte(entityID))
	details, _ := common.Marshal(map[string]any{
		"callback_event_id": event.ID,
		"provider":          event.Provider,
		"provider_event_id": event.EventID,
		"event_type":        event.EventType,
		"trade_no":          event.TradeNo,
		"http_status":       event.HTTPStatus,
		"duplicate":         event.Duplicate,
	})
	_, err := model.UpsertFinanceAlert(model.FinanceAlertInput{
		Fingerprint: "payment_callback:" + event.Provider + ":" + hex.EncodeToString(alertIdentity[:]) + ":" + event.ProcessingStatus,
		Code:        code,
		Source:      model.FinanceAlertSourceCallback,
		Severity:    severity,
		Title:       title,
		Message:     fmt.Sprintf("Provider %s callback returned HTTP %d.", event.Provider, event.HTTPStatus),
		EntityType:  "payment_callback_event",
		EntityID:    strconv.FormatInt(event.ID, 10),
		Details:     string(details),
	})
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("payment callback alert create failed event_id=%d error=%q", event.ID, err.Error()))
	}
}
