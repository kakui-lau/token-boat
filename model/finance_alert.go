package model

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

const (
	FinanceAlertSeverityCritical = "critical"
	FinanceAlertSeverityWarning  = "warning"
	FinanceAlertSeverityInfo     = "info"

	FinanceAlertStatusOpen         = "open"
	FinanceAlertStatusAcknowledged = "acknowledged"
	FinanceAlertStatusResolved     = "resolved"

	FinanceAlertSourceCallback = "payment_callback"
	FinanceAlertSourceBalance  = "user_balance"
	FinanceAlertSourceOrder    = "recharge_order"

	FinanceAlertCodeCallbackRejected      = "payment_callback_rejected"
	FinanceAlertCodeCallbackFailed        = "payment_callback_failed"
	FinanceAlertCodeCallbackDuplicate     = "payment_callback_duplicate"
	FinanceAlertCodeNegativeWallet        = "negative_wallet_balance"
	FinanceAlertCodeStalePendingOrder     = "stale_pending_order"
	FinanceAlertCodeMissingCompletionTime = "missing_completion_time"
)

type FinanceAlert struct {
	ID              int64  `json:"id"`
	Fingerprint     string `json:"fingerprint" gorm:"type:varchar(255);uniqueIndex"`
	Code            string `json:"code" gorm:"type:varchar(64);index"`
	Source          string `json:"source" gorm:"type:varchar(64);not null;index"`
	Severity        string `json:"severity" gorm:"type:varchar(16);not null;index"`
	Status          string `json:"status" gorm:"type:varchar(24);not null;index;index:idx_finance_alert_status_observed,priority:1"`
	Title           string `json:"title" gorm:"type:varchar(255);not null"`
	Message         string `json:"message" gorm:"type:text"`
	EntityType      string `json:"entity_type" gorm:"type:varchar(64);index"`
	EntityID        string `json:"entity_id" gorm:"type:varchar(255);index"`
	Details         string `json:"details" gorm:"type:text"`
	OccurrenceCount int64  `json:"occurrence_count"`
	FirstObservedAt int64  `json:"first_observed_at" gorm:"index"`
	LastObservedAt  int64  `json:"last_observed_at" gorm:"index;index:idx_finance_alert_status_observed,priority:2"`
	AcknowledgedAt  int64  `json:"acknowledged_at"`
	AcknowledgedBy  int    `json:"acknowledged_by"`
	ResolvedAt      int64  `json:"resolved_at"`
	ResolvedBy      int    `json:"resolved_by"`
	ResolutionNote  string `json:"resolution_note" gorm:"type:text"`
}

type FinanceAlertInput struct {
	Fingerprint string
	Code        string
	Source      string
	Severity    string
	Title       string
	Message     string
	EntityType  string
	EntityID    string
	Details     string
}

type FinanceAlertFilter struct {
	Status   string
	Severity string
	Source   string
	Keyword  string
}

type FinanceAlertSummary struct {
	OpenCount         int64 `json:"open_count"`
	CriticalOpenCount int64 `json:"critical_open_count"`
	WarningOpenCount  int64 `json:"warning_open_count"`
	AcknowledgedCount int64 `json:"acknowledged_count"`
}

func normalizeFinanceAlertInput(input FinanceAlertInput) (FinanceAlertInput, error) {
	input.Fingerprint = strings.TrimSpace(input.Fingerprint)
	input.Code = strings.TrimSpace(input.Code)
	input.Source = strings.TrimSpace(input.Source)
	input.Severity = strings.TrimSpace(input.Severity)
	input.Title = strings.TrimSpace(input.Title)
	input.EntityType = strings.TrimSpace(input.EntityType)
	input.EntityID = strings.TrimSpace(input.EntityID)
	if input.Fingerprint == "" || input.Source == "" || input.Title == "" ||
		len(input.Fingerprint) > 255 || len(input.Code) > 64 || len(input.Source) > 64 ||
		len(input.Title) > 255 || len(input.EntityType) > 64 || len(input.EntityID) > 255 {
		return FinanceAlertInput{}, errors.New("invalid finance alert")
	}
	switch input.Source {
	case FinanceAlertSourceCallback, FinanceAlertSourceBalance, FinanceAlertSourceOrder:
	default:
		return FinanceAlertInput{}, errors.New("invalid finance alert source")
	}
	switch input.Severity {
	case FinanceAlertSeverityCritical, FinanceAlertSeverityWarning, FinanceAlertSeverityInfo:
	default:
		return FinanceAlertInput{}, errors.New("invalid finance alert severity")
	}
	return input, nil
}

// UpsertFinanceAlert coalesces repeated detections by fingerprint while
// retaining acknowledgement state. A resolved issue reopens when observed
// again so operators do not lose a recurring financial anomaly.
func UpsertFinanceAlert(input FinanceAlertInput) (*FinanceAlert, error) {
	input, err := normalizeFinanceAlertInput(input)
	if err != nil {
		return nil, err
	}
	now := common.GetTimestamp()
	var existing FinanceAlert
	err = DB.Where("fingerprint = ?", input.Fingerprint).First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		alert := &FinanceAlert{
			Fingerprint:     input.Fingerprint,
			Code:            input.Code,
			Source:          input.Source,
			Severity:        input.Severity,
			Status:          FinanceAlertStatusOpen,
			Title:           input.Title,
			Message:         input.Message,
			EntityType:      input.EntityType,
			EntityID:        input.EntityID,
			Details:         input.Details,
			OccurrenceCount: 1,
			FirstObservedAt: now,
			LastObservedAt:  now,
		}
		if createErr := DB.Create(alert).Error; createErr == nil {
			return alert, nil
		} else if findErr := DB.Where("fingerprint = ?", input.Fingerprint).First(&existing).Error; findErr != nil {
			return nil, createErr
		}
	}
	if err != nil {
		return nil, err
	}
	status := existing.Status
	acknowledgedAt := existing.AcknowledgedAt
	acknowledgedBy := existing.AcknowledgedBy
	resolvedAt := existing.ResolvedAt
	resolvedBy := existing.ResolvedBy
	resolutionNote := existing.ResolutionNote
	if status == FinanceAlertStatusResolved {
		status = FinanceAlertStatusOpen
		acknowledgedAt = 0
		acknowledgedBy = 0
		resolvedAt = 0
		resolvedBy = 0
		resolutionNote = ""
	}
	err = DB.Model(&FinanceAlert{}).Where("id = ?", existing.ID).Updates(map[string]any{
		"code":             input.Code,
		"source":           input.Source,
		"severity":         input.Severity,
		"status":           status,
		"title":            input.Title,
		"message":          input.Message,
		"entity_type":      input.EntityType,
		"entity_id":        input.EntityID,
		"details":          input.Details,
		"occurrence_count": gorm.Expr("occurrence_count + ?", 1),
		"last_observed_at": now,
		"acknowledged_at":  acknowledgedAt,
		"acknowledged_by":  acknowledgedBy,
		"resolved_at":      resolvedAt,
		"resolved_by":      resolvedBy,
		"resolution_note":  resolutionNote,
	}).Error
	if err != nil {
		return nil, err
	}
	return GetFinanceAlert(existing.ID)
}

func GetFinanceAlert(id int64) (*FinanceAlert, error) {
	if id <= 0 {
		return nil, errors.New("invalid finance alert id")
	}
	var alert FinanceAlert
	if err := DB.Where("id = ?", id).First(&alert).Error; err != nil {
		return nil, err
	}
	return &alert, nil
}

func normalizeFinanceAlertFilter(filter FinanceAlertFilter) (FinanceAlertFilter, error) {
	filter.Status = strings.TrimSpace(filter.Status)
	filter.Severity = strings.TrimSpace(filter.Severity)
	filter.Source = strings.TrimSpace(filter.Source)
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	switch filter.Status {
	case "", FinanceAlertStatusOpen, FinanceAlertStatusAcknowledged, FinanceAlertStatusResolved:
	default:
		return FinanceAlertFilter{}, errors.New("invalid finance alert status")
	}
	switch filter.Severity {
	case "", FinanceAlertSeverityCritical, FinanceAlertSeverityWarning, FinanceAlertSeverityInfo:
	default:
		return FinanceAlertFilter{}, errors.New("invalid finance alert severity")
	}
	switch filter.Source {
	case "", FinanceAlertSourceCallback, FinanceAlertSourceBalance, FinanceAlertSourceOrder:
	default:
		return FinanceAlertFilter{}, errors.New("invalid finance alert source")
	}
	return filter, nil
}

func ListFinanceAlerts(filter FinanceAlertFilter, offset int, limit int) ([]FinanceAlert, int64, error) {
	if offset < 0 || limit <= 0 || limit > 100 {
		return nil, 0, errors.New("invalid finance alert pagination")
	}
	filter, err := normalizeFinanceAlertFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	query := DB.Model(&FinanceAlert{})
	if filter.Status != "" {
		query = query.Where("status = ?", filter.Status)
	}
	if filter.Severity != "" {
		query = query.Where("severity = ?", filter.Severity)
	}
	if filter.Source != "" {
		query = query.Where("source = ?", filter.Source)
	}
	if filter.Keyword != "" {
		pattern, err := sanitizeLikePattern("%" + filter.Keyword + "%")
		if err != nil {
			return nil, 0, err
		}
		query = query.Where("title LIKE ? ESCAPE '!' OR message LIKE ? ESCAPE '!' OR entity_id LIKE ? ESCAPE '!'", pattern, pattern, pattern)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []FinanceAlert
	if err := query.Order("CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END ASC").
		Order("last_observed_at DESC").Offset(offset).Limit(limit).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

func GetFinanceAlertSummary() (*FinanceAlertSummary, error) {
	var summary FinanceAlertSummary
	err := DB.Model(&FinanceAlert{}).Select(`
		COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS open_count,
		COALESCE(SUM(CASE WHEN status = ? AND severity = ? THEN 1 ELSE 0 END), 0) AS critical_open_count,
		COALESCE(SUM(CASE WHEN status = ? AND severity = ? THEN 1 ELSE 0 END), 0) AS warning_open_count,
		COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS acknowledged_count`,
		FinanceAlertStatusOpen,
		FinanceAlertStatusOpen, FinanceAlertSeverityCritical,
		FinanceAlertStatusOpen, FinanceAlertSeverityWarning,
		FinanceAlertStatusAcknowledged,
	).Scan(&summary).Error
	return &summary, err
}

func UpdateFinanceAlertStatus(id int64, status string, operatorID int, note string) (*FinanceAlert, error) {
	if id <= 0 || operatorID <= 0 {
		return nil, errors.New("invalid finance alert operation")
	}
	note = strings.TrimSpace(note)
	now := common.GetTimestamp()
	updates := map[string]any{"status": status}
	switch status {
	case FinanceAlertStatusAcknowledged:
		updates["acknowledged_at"] = now
		updates["acknowledged_by"] = operatorID
	case FinanceAlertStatusResolved:
		if note == "" || len(note) > 500 {
			return nil, errors.New("resolution note is required")
		}
		updates["resolved_at"] = now
		updates["resolved_by"] = operatorID
		updates["resolution_note"] = note
	default:
		return nil, errors.New("invalid finance alert status")
	}
	result := DB.Model(&FinanceAlert{}).
		Where("id = ? AND status <> ?", id, FinanceAlertStatusResolved).
		Updates(updates)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, fmt.Errorf("finance alert not found or already resolved")
	}
	return GetFinanceAlert(id)
}

func ResolveMissingFinanceAlerts(source string, activeFingerprints map[string]struct{}, note string) error {
	var alerts []FinanceAlert
	if err := DB.Where("source = ? AND status IN ?", source, []string{FinanceAlertStatusOpen, FinanceAlertStatusAcknowledged}).Find(&alerts).Error; err != nil {
		return err
	}
	now := common.GetTimestamp()
	for _, alert := range alerts {
		if _, active := activeFingerprints[alert.Fingerprint]; active {
			continue
		}
		if err := DB.Model(&FinanceAlert{}).Where("id = ?", alert.ID).Updates(map[string]any{
			"status":          FinanceAlertStatusResolved,
			"resolved_at":     now,
			"resolution_note": note,
		}).Error; err != nil {
			return err
		}
	}
	return nil
}
