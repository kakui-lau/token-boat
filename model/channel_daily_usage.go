package model

import (
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	ChannelDailyUsageStatusOpen   = "open"
	ChannelDailyUsageStatusLocked = "locked"
)

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

// ReplaceChannelDailyUsages atomically replaces one UTC day's unlocked rows.
func ReplaceChannelDailyUsages(start, end int64, rows []ChannelDailyUsage) error {
	date := time.Unix(start, 0).UTC().Format("2006-01-02")
	return DB.Transaction(func(tx *gorm.DB) error {
		var locked int64
		if err := tx.Model(&ChannelDailyUsage{}).
			Where("usage_date = ? AND timezone = ? AND status = ?", date, "UTC", ChannelDailyUsageStatusLocked).
			Count(&locked).Error; err != nil {
			return err
		}
		if locked > 0 {
			return gorm.ErrInvalidData
		}
		if err := tx.Where("usage_date = ? AND timezone = ?", date, "UTC").Delete(&ChannelDailyUsage{}).Error; err != nil {
			return err
		}
		if len(rows) == 0 {
			return nil
		}
		return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&rows).Error
	})
}

func SetChannelDailyUsageLock(startDate, endDate string, locked bool) error {
	now := common.GetTimestamp()
	values := map[string]any{"status": ChannelDailyUsageStatusOpen, "locked_at": int64(0), "updated_at": now}
	if locked {
		values["status"] = ChannelDailyUsageStatusLocked
		values["locked_at"] = now
	}
	return DB.Model(&ChannelDailyUsage{}).
		Where("timezone = ? AND usage_date >= ? AND usage_date <= ?", "UTC", startDate, endDate).
		Updates(values).Error
}
