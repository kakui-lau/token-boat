package controller

import (
	"encoding/csv"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

func channelDailyUsageFilter(c *gin.Context) model.ChannelDailyUsageFilter {
	channelID, _ := strconv.Atoi(c.Query("channel_id"))
	return model.ChannelDailyUsageFilter{
		StartDate:     c.Query("start_date"),
		EndDate:       c.Query("end_date"),
		ChannelID:     channelID,
		ModelName:     c.Query("model_name"),
		UpstreamModel: c.Query("upstream_model"),
		Status:        c.Query("status"),
	}
}

func parseUTCDateRange(startDate, endDate string, maxDays int) (time.Time, time.Time, error) {
	start, err := time.ParseInLocation("2006-01-02", startDate, time.UTC)
	if err != nil {
		return time.Time{}, time.Time{}, errors.New("invalid start_date, expected YYYY-MM-DD")
	}
	end, err := time.ParseInLocation("2006-01-02", endDate, time.UTC)
	if err != nil {
		return time.Time{}, time.Time{}, errors.New("invalid end_date, expected YYYY-MM-DD")
	}
	if end.Before(start) {
		return time.Time{}, time.Time{}, errors.New("end_date must not be before start_date")
	}
	if maxDays > 0 && int(end.Sub(start).Hours()/24)+1 > maxDays {
		return time.Time{}, time.Time{}, fmt.Errorf("date range must not exceed %d days", maxDays)
	}
	return start, end, nil
}

func AdminListChannelDailyUsages(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	rows, total, err := model.ListChannelDailyUsages(
		channelDailyUsageFilter(c), pageInfo.GetStartIdx(), pageInfo.GetPageSize(),
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(rows)
	common.ApiSuccess(c, pageInfo)
}

func AdminSummarizeChannelDailyUsages(c *gin.Context) {
	summary, err := model.SummarizeChannelDailyUsages(channelDailyUsageFilter(c))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, summary)
}

func AdminExportChannelDailyUsages(c *gin.Context) {
	filter := channelDailyUsageFilter(c)
	rows, _, err := model.ListChannelDailyUsages(filter, 0, 1_000_000)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="channel-daily-usages.csv"`)
	writer := csv.NewWriter(c.Writer)
	defer writer.Flush()
	_ = writer.Write([]string{
		"usage_date", "timezone", "period_start", "period_end", "channel_id", "channel_name",
		"model_name", "upstream_model", "billed_request_count", "prompt_tokens",
		"cache_read_tokens", "cache_write_tokens", "completion_tokens", "total_tokens",
		"customer_quota", "customer_revenue_usd", "provider_reported_cost_usd",
		"provider_cost_known_count", "missing_usage_count", "manual_review_count", "status",
	})
	for _, row := range rows {
		_ = writer.Write([]string{
			row.UsageDate, row.Timezone, strconv.FormatInt(row.PeriodStart, 10),
			strconv.FormatInt(row.PeriodEnd, 10), strconv.Itoa(row.ChannelID), row.ChannelName,
			row.ModelName, row.UpstreamModel, strconv.FormatInt(row.BilledRequestCount, 10),
			strconv.FormatInt(row.PromptTokens, 10), strconv.FormatInt(row.CacheReadTokens, 10),
			strconv.FormatInt(row.CacheWriteTokens, 10), strconv.FormatInt(row.CompletionTokens, 10),
			strconv.FormatInt(row.TotalTokens, 10), strconv.FormatInt(row.CustomerQuota, 10),
			row.CustomerRevenueUSD, row.ProviderReportedCostUSD,
			strconv.FormatInt(row.ProviderCostKnownCount, 10), strconv.FormatInt(row.MissingUsageCount, 10),
			strconv.FormatInt(row.ManualReviewCount, 10), row.Status,
		})
	}
	if err := writer.Error(); err != nil {
		common.SysError("channel daily usage CSV export failed: " + err.Error())
	}
}

type channelDailyUsageRangeRequest struct {
	StartDate string `json:"start_date" binding:"required"`
	EndDate   string `json:"end_date" binding:"required"`
}

func AdminRecalculateChannelDailyUsages(c *gin.Context) {
	var request channelDailyUsageRangeRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	start, end, err := parseUTCDateRange(request.StartDate, request.EndDate, 31)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	if !end.Before(time.Now().UTC().Truncate(24 * time.Hour)) {
		common.ApiErrorMsg(c, "only completed UTC days can be recalculated")
		return
	}
	for day := start; !day.After(end); day = day.AddDate(0, 0, 1) {
		if err := service.RecalculateChannelDailyUsage(c.Request.Context(), day); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	common.ApiSuccess(c, gin.H{"start_date": request.StartDate, "end_date": request.EndDate, "timezone": "UTC"})
}

func setChannelDailyUsageLock(c *gin.Context, locked bool) {
	var request channelDailyUsageRangeRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	if _, _, err := parseUTCDateRange(request.StartDate, request.EndDate, 366); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	if err := model.SetChannelDailyUsageLock(request.StartDate, request.EndDate, locked); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"start_date": request.StartDate, "end_date": request.EndDate, "locked": locked})
}

func AdminLockChannelDailyUsages(c *gin.Context) {
	setChannelDailyUsageLock(c, true)
}

func AdminUnlockChannelDailyUsages(c *gin.Context) {
	setChannelDailyUsageLock(c, false)
}
