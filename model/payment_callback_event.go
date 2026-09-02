package model

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

const (
	PaymentCallbackVerificationPending  = "pending"
	PaymentCallbackVerificationVerified = "verified"
	PaymentCallbackVerificationRejected = "rejected"

	PaymentCallbackStatusReceived  = "received"
	PaymentCallbackStatusProcessed = "processed"
	PaymentCallbackStatusRejected  = "rejected"
	PaymentCallbackStatusFailed    = "failed"
)

// PaymentCallbackEvent is an immutable inbound-attempt audit record. Only the
// outcome fields are updated after the request has passed through the provider
// handler. PayloadPreview is sanitized before persistence and never contains
// signature headers or payment credentials.
type PaymentCallbackEvent struct {
	ID                 int64  `json:"id"`
	Provider           string `json:"provider" gorm:"type:varchar(32);not null;index:idx_payment_callback_provider_received,priority:1;index:idx_payment_callback_provider_event,priority:1"`
	EventID            string `json:"event_id" gorm:"type:varchar(255);index:idx_payment_callback_provider_event,priority:2"`
	EventType          string `json:"event_type" gorm:"type:varchar(128)"`
	TradeNo            string `json:"trade_no" gorm:"type:varchar(255)"`
	RequestMethod      string `json:"request_method" gorm:"type:varchar(16)"`
	RequestPath        string `json:"request_path" gorm:"type:varchar(255)"`
	ClientIP           string `json:"client_ip" gorm:"type:varchar(64)"`
	PayloadDigest      string `json:"payload_digest" gorm:"type:char(64)"`
	PayloadPreview     string `json:"payload_preview" gorm:"type:text"`
	VerificationStatus string `json:"verification_status" gorm:"type:varchar(32);not null"`
	ProcessingStatus   string `json:"processing_status" gorm:"type:varchar(32);not null;index:idx_payment_callback_status_received,priority:1"`
	HTTPStatus         int    `json:"http_status"`
	ErrorMessage       string `json:"error_message" gorm:"type:text"`
	Duplicate          bool   `json:"duplicate"`
	ReceivedAt         int64  `json:"received_at" gorm:"not null;index;index:idx_payment_callback_provider_received,priority:2;index:idx_payment_callback_status_received,priority:2"`
	CompletedAt        int64  `json:"completed_at"`
	DurationMs         int64  `json:"duration_ms"`
}

type AdminPaymentCallbackFilter struct {
	Provider string
	Status   string
	Keyword  string
	StartAt  int64
	EndAt    int64
}

type PaymentCallbackSummary struct {
	TotalCount     int64 `json:"total_count"`
	ProcessedCount int64 `json:"processed_count"`
	RejectedCount  int64 `json:"rejected_count"`
	FailedCount    int64 `json:"failed_count"`
	DuplicateCount int64 `json:"duplicate_count"`
}

func CreatePaymentCallbackEvent(event *PaymentCallbackEvent) error {
	if event == nil || strings.TrimSpace(event.Provider) == "" {
		return errors.New("invalid payment callback event")
	}
	if event.ReceivedAt <= 0 {
		event.ReceivedAt = common.GetTimestamp()
	}
	if event.VerificationStatus == "" {
		event.VerificationStatus = PaymentCallbackVerificationPending
	}
	if event.ProcessingStatus == "" {
		event.ProcessingStatus = PaymentCallbackStatusReceived
	}
	return DB.Create(event).Error
}

func FinishPaymentCallbackEvent(event *PaymentCallbackEvent) error {
	if event == nil || event.ID <= 0 {
		return errors.New("invalid payment callback event")
	}
	if event.CompletedAt <= 0 {
		event.CompletedAt = common.GetTimestamp()
	}
	if event.EventID != "" {
		var previousCount int64
		if err := DB.Model(&PaymentCallbackEvent{}).
			Where("provider = ? AND event_id = ? AND id < ?", event.Provider, event.EventID, event.ID).
			Count(&previousCount).Error; err != nil {
			return err
		}
		event.Duplicate = previousCount > 0
	}
	return DB.Model(&PaymentCallbackEvent{}).Where("id = ?", event.ID).Updates(map[string]any{
		"event_id":            event.EventID,
		"event_type":          event.EventType,
		"trade_no":            event.TradeNo,
		"verification_status": event.VerificationStatus,
		"processing_status":   event.ProcessingStatus,
		"http_status":         event.HTTPStatus,
		"error_message":       event.ErrorMessage,
		"duplicate":           event.Duplicate,
		"completed_at":        event.CompletedAt,
		"duration_ms":         event.DurationMs,
	}).Error
}

func normalizeAdminPaymentCallbackFilter(filter AdminPaymentCallbackFilter) (AdminPaymentCallbackFilter, error) {
	filter.Provider = strings.TrimSpace(filter.Provider)
	filter.Status = strings.TrimSpace(filter.Status)
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	if filter.StartAt < 0 || filter.EndAt < 0 || (filter.StartAt > 0 && filter.EndAt > 0 && filter.StartAt > filter.EndAt) {
		return AdminPaymentCallbackFilter{}, errors.New("invalid payment callback time range")
	}
	switch filter.Status {
	case "", PaymentCallbackStatusReceived, PaymentCallbackStatusProcessed, PaymentCallbackStatusRejected, PaymentCallbackStatusFailed:
	default:
		return AdminPaymentCallbackFilter{}, errors.New("invalid payment callback status")
	}
	return filter, nil
}

func applyAdminPaymentCallbackFilter(query *gorm.DB, filter AdminPaymentCallbackFilter) (*gorm.DB, error) {
	filter, err := normalizeAdminPaymentCallbackFilter(filter)
	if err != nil {
		return nil, err
	}
	if filter.Provider != "" {
		query = query.Where("provider = ?", filter.Provider)
	}
	if filter.Status != "" {
		query = query.Where("processing_status = ?", filter.Status)
	}
	if filter.Keyword != "" {
		pattern, err := sanitizeLikePattern("%" + filter.Keyword + "%")
		if err != nil {
			return nil, err
		}
		query = query.Where("trade_no LIKE ? ESCAPE '!' OR event_id LIKE ? ESCAPE '!'", pattern, pattern)
	}
	if filter.StartAt > 0 {
		query = query.Where("received_at >= ?", filter.StartAt)
	}
	if filter.EndAt > 0 {
		query = query.Where("received_at <= ?", filter.EndAt)
	}
	return query, nil
}

func ListAdminPaymentCallbackEvents(filter AdminPaymentCallbackFilter, offset int, limit int) ([]PaymentCallbackEvent, int64, error) {
	if offset < 0 || limit <= 0 || limit > 100 {
		return nil, 0, errors.New("invalid payment callback pagination")
	}
	query, err := applyAdminPaymentCallbackFilter(DB.Model(&PaymentCallbackEvent{}), filter)
	if err != nil {
		return nil, 0, err
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []PaymentCallbackEvent
	if err := query.Order("id DESC").Offset(offset).Limit(limit).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

func GetPaymentCallbackSummary(startAt int64, endAt int64) (*PaymentCallbackSummary, error) {
	filter, err := normalizeAdminPaymentCallbackFilter(AdminPaymentCallbackFilter{StartAt: startAt, EndAt: endAt})
	if err != nil {
		return nil, err
	}
	query := DB.Model(&PaymentCallbackEvent{})
	if filter.StartAt > 0 {
		query = query.Where("received_at >= ?", filter.StartAt)
	}
	if filter.EndAt > 0 {
		query = query.Where("received_at <= ?", filter.EndAt)
	}
	var summary PaymentCallbackSummary
	err = query.Select(`COUNT(*) AS total_count,
		COALESCE(SUM(CASE WHEN processing_status = ? THEN 1 ELSE 0 END), 0) AS processed_count,
		COALESCE(SUM(CASE WHEN processing_status = ? THEN 1 ELSE 0 END), 0) AS rejected_count,
		COALESCE(SUM(CASE WHEN processing_status = ? THEN 1 ELSE 0 END), 0) AS failed_count,
		COALESCE(SUM(CASE WHEN duplicate = ? THEN 1 ELSE 0 END), 0) AS duplicate_count`,
		PaymentCallbackStatusProcessed,
		PaymentCallbackStatusRejected,
		PaymentCallbackStatusFailed,
		commonTrueVal,
	).Scan(&summary).Error
	return &summary, err
}
