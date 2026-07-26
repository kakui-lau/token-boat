package model

import (
	"errors"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	ChannelDailyUsageStatusOpen             = "open"
	ChannelDailyUsageStatusLocked           = "locked"
	ChannelMonthlyUsageGroupByModelName     = "model_name"
	ChannelMonthlyUsageGroupByUpstreamModel = "upstream_model"
	channelDailyUsageWriteRetries           = 5
)

var ErrChannelDailyUsageMonthLocked = errors.New("channel daily usage month is locked")

// ChannelDailyUsageMonth stores the settlement state independently from daily
// rows, so an empty day cannot bypass a locked accounting month.
type ChannelDailyUsageMonth struct {
	ID        int64  `json:"id" gorm:"primaryKey"`
	Month     string `json:"month" gorm:"type:varchar(7);not null;uniqueIndex:uk_channel_daily_usage_month,priority:1"`
	Timezone  string `json:"timezone" gorm:"type:varchar(32);not null;uniqueIndex:uk_channel_daily_usage_month,priority:2"`
	Status    string `json:"status" gorm:"type:varchar(24);not null;index"`
	LockedAt  int64  `json:"locked_at" gorm:"bigint"`
	LockedBy  int    `json:"locked_by" gorm:"index"`
	CreatedAt int64  `json:"created_at" gorm:"bigint"`
	UpdatedAt int64  `json:"updated_at" gorm:"bigint"`
}

// ChannelDailyUsage is an immutable-after-lock UTC usage aggregate. Money
// values are decimal strings so all supported databases preserve precision.
type ChannelDailyUsage struct {
	ID                      int64  `json:"id" gorm:"primaryKey"`
	UsageDate               string `json:"usage_date" gorm:"type:varchar(10);not null;uniqueIndex:uk_channel_daily_usage,priority:1"`
	Timezone                string `json:"timezone" gorm:"type:varchar(32);not null;uniqueIndex:uk_channel_daily_usage,priority:2"`
	PeriodStart             int64  `json:"period_start" gorm:"bigint;not null;index"`
	PeriodEnd               int64  `json:"period_end" gorm:"bigint;not null;index"`
	ChannelID               int    `json:"channel_id" gorm:"not null;index;uniqueIndex:uk_channel_daily_usage,priority:3"`
	ChannelName             string `json:"channel_name" gorm:"type:varchar(128)"`
	ModelName               string `json:"model_name" gorm:"type:varchar(128);not null;index;uniqueIndex:uk_channel_daily_usage,priority:4"`
	UpstreamModel           string `json:"upstream_model" gorm:"type:varchar(192);not null;index;uniqueIndex:uk_channel_daily_usage,priority:5"`
	BilledRequestCount      int64  `json:"billed_request_count"`
	PromptTokens            int64  `json:"prompt_tokens"`
	CacheReadTokens         int64  `json:"cache_read_tokens"`
	CacheWriteTokens        int64  `json:"cache_write_tokens"`
	CompletionTokens        int64  `json:"completion_tokens"`
	TotalTokens             int64  `json:"total_tokens"`
	CustomerQuota           int64  `json:"customer_quota"`
	CustomerRevenueUSD      string `json:"customer_revenue_usd" gorm:"type:decimal(24,12)"`
	ProviderReportedCostUSD string `json:"provider_reported_cost_usd" gorm:"type:decimal(24,12)"`
	ProviderCostKnownCount  int64  `json:"provider_cost_known_count"`
	MissingUsageCount       int64  `json:"missing_usage_count"`
	PendingTaskCount        int64  `json:"pending_task_count"`
	ManualReviewCount       int64  `json:"manual_review_count"`
	Status                  string `json:"status" gorm:"type:varchar(24);not null;index"`
	CalculatedAt            int64  `json:"calculated_at" gorm:"bigint"`
	LockedAt                int64  `json:"locked_at" gorm:"bigint"`
	CreatedAt               int64  `json:"created_at" gorm:"bigint"`
	UpdatedAt               int64  `json:"updated_at" gorm:"bigint"`
}

type ChannelDailyUsageFilter struct {
	StartDate     string
	EndDate       string
	ChannelID     int
	ModelName     string
	UpstreamModel string
	Status        string
}

type ChannelDailyUsageChannelOption struct {
	ChannelID   int    `json:"channel_id"`
	ChannelName string `json:"channel_name"`
}

type ChannelDailyUsageFilterOptions struct {
	Channels       []ChannelDailyUsageChannelOption `json:"channels"`
	ModelNames     []string                         `json:"model_names"`
	UpstreamModels []string                         `json:"upstream_models"`
}

type ChannelDailyUsageSummary struct {
	BilledRequestCount      int64  `json:"billed_request_count"`
	PromptTokens            int64  `json:"prompt_tokens"`
	CacheReadTokens         int64  `json:"cache_read_tokens"`
	CacheWriteTokens        int64  `json:"cache_write_tokens"`
	CompletionTokens        int64  `json:"completion_tokens"`
	TotalTokens             int64  `json:"total_tokens"`
	CustomerQuota           int64  `json:"customer_quota"`
	CustomerRevenueUSD      string `json:"customer_revenue_usd"`
	ProviderReportedCostUSD string `json:"provider_reported_cost_usd"`
	ProviderCostKnownCount  int64  `json:"provider_cost_known_count"`
	MissingUsageCount       int64  `json:"missing_usage_count"`
	PendingTaskCount        int64  `json:"pending_task_count"`
	ManualReviewCount       int64  `json:"manual_review_count"`
}

// ChannelMonthlyUsage is a channel total for one model dimension in a UTC
// calendar month. Exactly one of ModelName and UpstreamModel identifies the
// selected group.
type ChannelMonthlyUsage struct {
	Month                   string `json:"month"`
	ChannelID               int    `json:"channel_id"`
	ChannelName             string `json:"channel_name"`
	ModelName               string `json:"model_name,omitempty"`
	UpstreamModel           string `json:"upstream_model,omitempty"`
	BilledRequestCount      int64  `json:"billed_request_count"`
	PromptTokens            int64  `json:"prompt_tokens"`
	CacheReadTokens         int64  `json:"cache_read_tokens"`
	CacheWriteTokens        int64  `json:"cache_write_tokens"`
	CompletionTokens        int64  `json:"completion_tokens"`
	TotalTokens             int64  `json:"total_tokens"`
	CustomerQuota           int64  `json:"customer_quota"`
	CustomerRevenueUSD      string `json:"customer_revenue_usd"`
	ProviderReportedCostUSD string `json:"provider_reported_cost_usd"`
	ProviderCostKnownCount  int64  `json:"provider_cost_known_count"`
	MissingUsageCount       int64  `json:"missing_usage_count"`
	PendingTaskCount        int64  `json:"pending_task_count"`
	ManualReviewCount       int64  `json:"manual_review_count"`
}

func channelDailyUsageQuery(filter ChannelDailyUsageFilter) *gorm.DB {
	tx := DB.Model(&ChannelDailyUsage{}).Where("timezone = ?", "UTC")
	if filter.StartDate != "" {
		tx = tx.Where("usage_date >= ?", filter.StartDate)
	}
	if filter.EndDate != "" {
		tx = tx.Where("usage_date <= ?", filter.EndDate)
	}
	if filter.ChannelID != 0 {
		tx = tx.Where("channel_id = ?", filter.ChannelID)
	}
	if filter.ModelName != "" {
		tx = tx.Where("model_name = ?", filter.ModelName)
	}
	if filter.UpstreamModel != "" {
		tx = tx.Where("upstream_model = ?", filter.UpstreamModel)
	}
	if filter.Status != "" {
		tx = tx.Where("status = ?", filter.Status)
	}
	return tx
}

func ListChannelDailyUsages(filter ChannelDailyUsageFilter, offset, limit int) ([]ChannelDailyUsage, int64, error) {
	var total int64
	tx := channelDailyUsageQuery(filter)
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []ChannelDailyUsage
	err := tx.Order("usage_date desc, channel_id asc, model_name asc, upstream_model asc").
		Offset(offset).Limit(limit).Find(&rows).Error
	return rows, total, err
}

// ListChannelMonthlyUsages rolls the filtered daily rows up by calendar month
// while preserving the channel and model dimensions used by the daily report.
// It intentionally reads from ChannelDailyUsage instead of persisting a second
// aggregate, so recalculation and month locking keep a single source of truth.
func ListChannelMonthlyUsages(filter ChannelDailyUsageFilter, offset, limit int) ([]ChannelDailyUsage, int64, error) {
	fields := []string{
		"SUBSTRING(usage_date, 1, 7) AS usage_date",
		"timezone",
		"MIN(period_start) AS period_start",
		"MAX(period_end) AS period_end",
		"channel_id",
		"MAX(channel_name) AS channel_name",
		"model_name",
		"upstream_model",
		"SUM(billed_request_count) AS billed_request_count",
		"SUM(prompt_tokens) AS prompt_tokens",
		"SUM(cache_read_tokens) AS cache_read_tokens",
		"SUM(cache_write_tokens) AS cache_write_tokens",
		"SUM(completion_tokens) AS completion_tokens",
		"SUM(total_tokens) AS total_tokens",
		"SUM(customer_quota) AS customer_quota",
		"SUM(customer_revenue_usd) AS customer_revenue_usd",
		"SUM(provider_reported_cost_usd) AS provider_reported_cost_usd",
		"SUM(provider_cost_known_count) AS provider_cost_known_count",
		"SUM(missing_usage_count) AS missing_usage_count",
		"SUM(pending_task_count) AS pending_task_count",
		"SUM(manual_review_count) AS manual_review_count",
		"status",
		"MAX(calculated_at) AS calculated_at",
		"MAX(locked_at) AS locked_at",
		"MIN(created_at) AS created_at",
		"MAX(updated_at) AS updated_at",
	}
	grouped := channelDailyUsageQuery(filter).
		Select(strings.Join(fields, ", ")).
		Group("SUBSTRING(usage_date, 1, 7), timezone, channel_id, model_name, upstream_model, status")

	var total int64
	if err := DB.Table("(?) AS channel_monthly_usages", grouped).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var rows []ChannelDailyUsage
	err := DB.Table("(?) AS channel_monthly_usages", grouped).
		Order("usage_date DESC, channel_id ASC, model_name ASC, upstream_model ASC").
		Offset(offset).Limit(limit).Scan(&rows).Error
	return rows, total, err
}

func SummarizeChannelDailyUsages(filter ChannelDailyUsageFilter) (ChannelDailyUsageSummary, error) {
	var summary ChannelDailyUsageSummary
	fields := []string{
		"COALESCE(SUM(billed_request_count),0) AS billed_request_count",
		"COALESCE(SUM(prompt_tokens),0) AS prompt_tokens",
		"COALESCE(SUM(cache_read_tokens),0) AS cache_read_tokens",
		"COALESCE(SUM(cache_write_tokens),0) AS cache_write_tokens",
		"COALESCE(SUM(completion_tokens),0) AS completion_tokens",
		"COALESCE(SUM(total_tokens),0) AS total_tokens",
		"COALESCE(SUM(customer_quota),0) AS customer_quota",
		"COALESCE(SUM(customer_revenue_usd),0) AS customer_revenue_usd",
		"COALESCE(SUM(provider_reported_cost_usd),0) AS provider_reported_cost_usd",
		"COALESCE(SUM(provider_cost_known_count),0) AS provider_cost_known_count",
		"COALESCE(SUM(missing_usage_count),0) AS missing_usage_count",
		"COALESCE(SUM(pending_task_count),0) AS pending_task_count",
		"COALESCE(SUM(manual_review_count),0) AS manual_review_count",
	}
	err := channelDailyUsageQuery(filter).Select(strings.Join(fields, ", ")).Scan(&summary).Error
	return summary, err
}

// ListChannelMonthlyUsageSummary groups one month by channel and one explicitly
// whitelisted model dimension. Keeping the column choice here prevents callers
// from passing arbitrary SQL identifiers.
func ListChannelMonthlyUsageSummary(filter ChannelDailyUsageFilter, month, groupBy string, offset, limit int) ([]ChannelMonthlyUsage, int64, error) {
	groupColumn := ""
	switch groupBy {
	case ChannelMonthlyUsageGroupByModelName:
		groupColumn = "model_name"
	case ChannelMonthlyUsageGroupByUpstreamModel:
		groupColumn = "upstream_model"
	default:
		return nil, 0, errors.New("invalid group_by")
	}

	filter.StartDate = month + "-01"
	monthStart, err := time.ParseInLocation("2006-01-02", filter.StartDate, time.UTC)
	if err != nil {
		return nil, 0, errors.New("invalid month")
	}
	filter.EndDate = monthStart.AddDate(0, 1, -1).Format("2006-01-02")

	fields := []string{
		"? AS month",
		"channel_id",
		"MAX(channel_name) AS channel_name",
		groupColumn,
		"SUM(billed_request_count) AS billed_request_count",
		"SUM(prompt_tokens) AS prompt_tokens",
		"SUM(cache_read_tokens) AS cache_read_tokens",
		"SUM(cache_write_tokens) AS cache_write_tokens",
		"SUM(completion_tokens) AS completion_tokens",
		"SUM(total_tokens) AS total_tokens",
		"SUM(customer_quota) AS customer_quota",
		"SUM(customer_revenue_usd) AS customer_revenue_usd",
		"SUM(provider_reported_cost_usd) AS provider_reported_cost_usd",
		"SUM(provider_cost_known_count) AS provider_cost_known_count",
		"SUM(missing_usage_count) AS missing_usage_count",
		"SUM(pending_task_count) AS pending_task_count",
		"SUM(manual_review_count) AS manual_review_count",
	}
	grouped := channelDailyUsageQuery(filter).
		Select(strings.Join(fields, ", "), month).
		Group("channel_id, " + groupColumn)

	var total int64
	if err := DB.Table("(?) AS channel_monthly_summary", grouped).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []ChannelMonthlyUsage
	err = DB.Table("(?) AS channel_monthly_summary", grouped).
		Order("channel_id ASC, " + groupColumn + " ASC").
		Offset(offset).Limit(limit).Scan(&rows).Error
	return rows, total, err
}

func ListChannelDailyUsageFilterOptions(filter ChannelDailyUsageFilter) (ChannelDailyUsageFilterOptions, error) {
	baseQuery := func() *gorm.DB {
		tx := DB.Model(&ChannelDailyUsage{}).Where("timezone = ?", "UTC")
		if filter.StartDate != "" {
			tx = tx.Where("usage_date >= ?", filter.StartDate)
		}
		if filter.EndDate != "" {
			tx = tx.Where("usage_date <= ?", filter.EndDate)
		}
		return tx
	}

	options := ChannelDailyUsageFilterOptions{
		Channels:       []ChannelDailyUsageChannelOption{},
		ModelNames:     []string{},
		UpstreamModels: []string{},
	}
	if err := baseQuery().
		Select("channel_id, MAX(channel_name) AS channel_name").
		Group("channel_id").
		Order("channel_name ASC, channel_id ASC").
		Scan(&options.Channels).Error; err != nil {
		return ChannelDailyUsageFilterOptions{}, err
	}
	if err := baseQuery().
		Distinct("model_name").
		Where("model_name <> ?", "").
		Order("model_name ASC").
		Pluck("model_name", &options.ModelNames).Error; err != nil {
		return ChannelDailyUsageFilterOptions{}, err
	}
	if err := baseQuery().
		Distinct("upstream_model").
		Where("upstream_model <> ?", "").
		Order("upstream_model ASC").
		Pluck("upstream_model", &options.UpstreamModels).Error; err != nil {
		return ChannelDailyUsageFilterOptions{}, err
	}
	return options, nil
}

// ReplaceChannelDailyUsages atomically replaces one UTC day's unlocked rows.
func ReplaceChannelDailyUsages(start, end int64, rows []ChannelDailyUsage) error {
	date := time.Unix(start, 0).UTC().Format("2006-01-02")
	month := date[:7]
	now := common.GetTimestamp()
	period := ChannelDailyUsageMonth{
		Month: month, Timezone: "UTC", Status: ChannelDailyUsageStatusOpen,
		CreatedAt: now, UpdatedAt: now,
	}
	if err := DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&period).Error; err != nil {
		return err
	}
	for attempt := 0; ; attempt++ {
		err := DB.Transaction(func(tx *gorm.DB) error {
			var settlementMonth ChannelDailyUsageMonth
			if err := lockForUpdate(tx).
				Where("month = ? AND timezone = ?", month, "UTC").
				First(&settlementMonth).Error; err != nil {
				return err
			}
			if settlementMonth.Status == ChannelDailyUsageStatusLocked {
				return ErrChannelDailyUsageMonthLocked
			}
			if err := tx.Where("usage_date = ? AND timezone = ?", date, "UTC").Delete(&ChannelDailyUsage{}).Error; err != nil {
				return err
			}
			if len(rows) == 0 {
				return nil
			}
			return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&rows).Error
		})
		if err == nil || !common.UsingMainDatabase(common.DatabaseTypeSQLite) ||
			!strings.Contains(err.Error(), "SQLITE_BUSY") || attempt == channelDailyUsageWriteRetries {
			return err
		}
		time.Sleep(time.Duration(attempt+1) * 25 * time.Millisecond)
	}
}

func GetChannelDailyUsageMonth(month string) (ChannelDailyUsageMonth, error) {
	var settlementMonth ChannelDailyUsageMonth
	err := DB.Where("month = ? AND timezone = ?", month, "UTC").First(&settlementMonth).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ChannelDailyUsageMonth{Month: month, Timezone: "UTC", Status: ChannelDailyUsageStatusOpen}, nil
	}
	return settlementMonth, err
}

func SetChannelDailyUsageMonthLock(month, startDate, endDate string, locked bool, operatorID int) error {
	now := common.GetTimestamp()
	period := ChannelDailyUsageMonth{
		Month: month, Timezone: "UTC", Status: ChannelDailyUsageStatusOpen,
		CreatedAt: now, UpdatedAt: now,
	}
	if err := DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&period).Error; err != nil {
		return err
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var settlementMonth ChannelDailyUsageMonth
		if err := lockForUpdate(tx).
			Where("month = ? AND timezone = ?", month, "UTC").
			First(&settlementMonth).Error; err != nil {
			return err
		}
		status := ChannelDailyUsageStatusOpen
		lockedAt := int64(0)
		lockedBy := 0
		if locked {
			status = ChannelDailyUsageStatusLocked
			lockedAt = now
			lockedBy = operatorID
		}
		if err := tx.Model(&settlementMonth).Updates(map[string]any{
			"status": status, "locked_at": lockedAt, "locked_by": lockedBy, "updated_at": now,
		}).Error; err != nil {
			return err
		}
		return tx.Model(&ChannelDailyUsage{}).
			Where("timezone = ? AND usage_date >= ? AND usage_date <= ?", "UTC", startDate, endDate).
			Updates(map[string]any{"status": status, "locked_at": lockedAt, "updated_at": now}).Error
	})
}
