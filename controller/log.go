package controller

import (
	"errors"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const maxUserUsageRangeSeconds int64 = 366 * 24 * 60 * 60
const maxAdminLogRangeSeconds int64 = 31 * 24 * 60 * 60
const maxTimezoneOffsetMinutes = 14 * 60

var allowedUsageBucketSeconds = map[int64]struct{}{
	300:    {},
	3_600:  {},
	21_600: {},
	86_400: {},
}

func GetAllLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	logType, _ := strconv.Atoi(c.Query("type"))
	scope := strings.ToLower(strings.TrimSpace(c.Query("scope")))
	startTimestamp, endTimestamp, err := parseAdminLogTimeRange(c, scope == "request")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	username := c.Query("username")
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	group := c.Query("group")
	requestId := c.Query("request_id")
	upstreamRequestId := c.Query("upstream_request_id")
	logs, total, err := model.GetAllLogs(logType, startTimestamp, endTimestamp, modelName, username, tokenName, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), channel, group, requestId, upstreamRequestId, scope, c.Query("order"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	if scope == "request" {
		items := make([]dto.AdminRequestLog, 0, len(logs))
		for _, log := range logs {
			items = append(items, adminRequestLogDto(log))
		}
		pageInfo.SetItems(items)
	} else {
		pageInfo.SetItems(logs)
	}
	common.ApiSuccess(c, pageInfo)
	return
}

func GetUserLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	userId := c.GetInt("id")
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	group := c.Query("group")
	requestId := c.Query("request_id")
	upstreamRequestId := c.Query("upstream_request_id")
	logs, total, err := model.GetUserLogs(userId, logType, startTimestamp, endTimestamp, modelName, tokenName, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), group, requestId, upstreamRequestId, c.Query("scope"), c.Query("order"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
	return
}

func GetUserRequestLog(c *gin.Context) {
	requestId := strings.TrimSpace(c.Param("request_id"))
	if requestId == "" {
		common.ApiErrorMsg(c, "request id is required")
		return
	}
	log, err := model.GetUserRequestLog(c.GetInt("id"), requestId)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		common.ApiErrorMsg(c, "request not found")
		return
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, log)
}

func GetUserUsageAnalytics(c *gin.Context) {
	startTimestamp, startErr := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, endErr := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	if startErr != nil || endErr != nil || startTimestamp <= 0 || endTimestamp <= 0 {
		common.ApiErrorMsg(c, "valid start_timestamp and end_timestamp are required")
		return
	}
	if startTimestamp > endTimestamp {
		common.ApiErrorMsg(c, "start_timestamp must not be after end_timestamp")
		return
	}
	if endTimestamp-startTimestamp > maxUserUsageRangeSeconds {
		common.ApiErrorMsg(c, "usage date range must not exceed 366 days")
		return
	}
	timezoneOffsetMinutes := 0
	if rawOffset := strings.TrimSpace(c.Query("timezone_offset_minutes")); rawOffset != "" {
		parsedOffset, err := strconv.Atoi(rawOffset)
		if err != nil || parsedOffset < -maxTimezoneOffsetMinutes || parsedOffset > maxTimezoneOffsetMinutes {
			common.ApiErrorMsg(c, "timezone_offset_minutes must be between -840 and 840")
			return
		}
		timezoneOffsetMinutes = parsedOffset
	}
	bucketSeconds := int64(86_400)
	if rawBucket := strings.TrimSpace(c.Query("bucket_seconds")); rawBucket != "" {
		parsedBucket, err := strconv.ParseInt(rawBucket, 10, 64)
		if err != nil {
			common.ApiErrorMsg(c, "bucket_seconds is invalid")
			return
		}
		if _, allowed := allowedUsageBucketSeconds[parsedBucket]; !allowed {
			common.ApiErrorMsg(c, "bucket_seconds must be one of 300, 3600, 21600, or 86400")
			return
		}
		bucketSeconds = parsedBucket
	}
	logType := model.LogTypeUnknown
	if rawType := strings.TrimSpace(c.Query("type")); rawType != "" {
		parsedType, err := strconv.Atoi(rawType)
		if err != nil || (parsedType != model.LogTypeConsume && parsedType != model.LogTypeError) {
			common.ApiErrorMsg(c, "type must be a request success or failure log type")
			return
		}
		logType = parsedType
	}
	analytics, err := model.GetUserUsageAnalyticsWithQuery(c.GetInt("id"), model.UserUsageAnalyticsQuery{
		StartTimestamp:        startTimestamp,
		EndTimestamp:          endTimestamp,
		TimezoneOffsetMinutes: timezoneOffsetMinutes,
		BucketSeconds:         bucketSeconds,
		LogType:               logType,
		TokenName:             c.Query("token_name"),
		ModelName:             c.Query("model_name"),
		RequestID:             c.Query("request_id"),
		UpstreamRequestID:     c.Query("upstream_request_id"),
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, analytics)
}

// Deprecated: SearchAllLogs 已废弃，前端未使用该接口。
func SearchAllLogs(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": false,
		"message": "该接口已废弃",
	})
}

// Deprecated: SearchUserLogs 已废弃，前端未使用该接口。
func SearchUserLogs(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": false,
		"message": "该接口已废弃",
	})
}

func GetLogByKey(c *gin.Context) {
	tokenId := c.GetInt("token_id")
	if tokenId == 0 {
		c.JSON(200, gin.H{
			"success": false,
			"message": "无效的令牌",
		})
		return
	}
	logs, err := model.GetLogByTokenId(tokenId)
	if err != nil {
		c.JSON(200, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(200, gin.H{
		"success": true,
		"message": "",
		"data":    logs,
	})
}

func GetLogsStat(c *gin.Context) {
	logType, _ := strconv.Atoi(c.Query("type"))
	scope := strings.ToLower(strings.TrimSpace(c.Query("scope")))
	startTimestamp, endTimestamp, err := parseAdminLogTimeRange(c, scope == "request")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	tokenName := c.Query("token_name")
	username := c.Query("username")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	group := c.Query("group")
	requestId := c.Query("request_id")
	upstreamRequestId := c.Query("upstream_request_id")
	stat, err := model.SumUsedQuotaWithScope(logType, startTimestamp, endTimestamp, modelName, username, tokenName, channel, group, requestId, upstreamRequestId, scope)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	//tokenNum := model.SumUsedToken(logType, startTimestamp, endTimestamp, modelName, username, "")
	data := gin.H{
		"request_count":     stat.RequestCount,
		"failure_count":     stat.FailureCount,
		"failure_rate":      stat.FailureRate,
		"peak_rpm":          stat.PeakRpm,
		"peak_tpm":          stat.PeakTpm,
		"total_tokens":      stat.TotalTokens,
		"prompt_tokens":     stat.PromptTokens,
		"completion_tokens": stat.CompletionTokens,
		"cache_hit_tokens":  stat.CacheHitTokens,
		"cache_hit_rate":    stat.CacheHitRate,
	}
	if scope == "request" {
		data["cost_usd"] = stat.CostUSD
	} else {
		data["quota"] = stat.Quota
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": data})
	return
}

func adminRequestLogDto(log *model.Log) dto.AdminRequestLog {
	other := make(map[string]interface{})
	_ = common.UnmarshalJsonStr(log.Other, &other)
	result := dto.AdminRequestLog{
		ID:                log.Id,
		CreatedAt:         log.CreatedAt,
		Type:              log.Type,
		Username:          log.Username,
		APIKeyName:        log.TokenName,
		ModelName:         log.ModelName,
		PromptTokens:      log.PromptTokens,
		CompletionTokens:  log.CompletionTokens,
		IsStream:          log.IsStream,
		ChannelID:         log.ChannelId,
		ChannelName:       log.ChannelName,
		Group:             log.Group,
		SourceIP:          log.Ip,
		RequestID:         log.RequestId,
		UpstreamRequestID: log.UpstreamRequestId,
		TaskID:            log.TaskId,
		Endpoint:          adminLogString(other["request_path"]),
		ErrorCode:         adminLogString(other["error_code"]),
	}
	if statusCode, ok := adminLogNumber(other["status_code"]); ok && statusCode >= 100 && statusCode <= 999 && math.Trunc(statusCode) == statusCode {
		value := int(statusCode)
		result.StatusCode = &value
	}
	if latency, ok := adminLogNumber(other["response_time_ms"]); ok && latency >= 0 {
		result.LatencyMilliseconds = &latency
	} else if log.UseTime >= 0 {
		latency = float64(log.UseTime) * 1_000
		result.LatencyMilliseconds = &latency
	}
	if firstTokenLatency, ok := adminLogNumber(other["frt"]); ok && firstTokenLatency >= 0 {
		result.FirstTokenLatencyMS = &firstTokenLatency
	}
	if log.Type == model.LogTypeError {
		zero := float64(0)
		result.CostUSD = &zero
		result.ErrorMessage = boundedAdminLogText(log.Content, 1_000)
	} else if log.Quota == 0 {
		zero := float64(0)
		result.CostUSD = &zero
	} else if quotaPerUnit, ok := adminLogNumber(other["quota_per_unit"]); ok && quotaPerUnit > 0 {
		costUSD := float64(log.Quota) / quotaPerUnit
		result.CostUSD = &costUSD
	}
	return result
}

func adminLogNumber(value interface{}) (float64, bool) {
	switch number := value.(type) {
	case float64:
		return number, !math.IsNaN(number) && !math.IsInf(number, 0)
	case float32:
		parsed := float64(number)
		return parsed, !math.IsNaN(parsed) && !math.IsInf(parsed, 0)
	case int:
		return float64(number), true
	case int64:
		return float64(number), true
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(number), 64)
		return parsed, err == nil && !math.IsNaN(parsed) && !math.IsInf(parsed, 0)
	default:
		return 0, false
	}
}

func adminLogString(value interface{}) string {
	text, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(text)
}

func boundedAdminLogText(value string, limit int) string {
	text := strings.TrimSpace(common.MaskSensitiveInfo(value))
	runes := []rune(text)
	if len(runes) <= limit {
		return text
	}
	return string(runes[:limit]) + "…"
}

func parseAdminLogTimeRange(c *gin.Context, required bool) (int64, int64, error) {
	if !required {
		startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
		endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
		return startTimestamp, endTimestamp, nil
	}

	startRaw, hasStart := c.GetQuery("start_timestamp")
	endRaw, hasEnd := c.GetQuery("end_timestamp")
	if !hasStart || !hasEnd {
		return 0, 0, errors.New("valid start_timestamp and end_timestamp are required")
	}

	startTimestamp, startErr := strconv.ParseInt(strings.TrimSpace(startRaw), 10, 64)
	endTimestamp, endErr := strconv.ParseInt(strings.TrimSpace(endRaw), 10, 64)
	if startErr != nil || endErr != nil || startTimestamp <= 0 || endTimestamp <= 0 {
		return 0, 0, errors.New("valid start_timestamp and end_timestamp are required")
	}
	if startTimestamp > endTimestamp {
		return 0, 0, errors.New("start_timestamp must not be after end_timestamp")
	}
	if endTimestamp-startTimestamp > maxAdminLogRangeSeconds {
		return 0, 0, errors.New("log date range must not exceed 31 days")
	}
	return startTimestamp, endTimestamp, nil
}

func GetLogsSelfStat(c *gin.Context) {
	username := c.GetString("username")
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	group := c.Query("group")
	requestId := c.Query("request_id")
	upstreamRequestId := c.Query("upstream_request_id")
	quotaNum, err := model.SumUsedQuota(logType, startTimestamp, endTimestamp, modelName, username, tokenName, channel, group, requestId, upstreamRequestId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	//tokenNum := model.SumUsedToken(logType, startTimestamp, endTimestamp, modelName, username, tokenName)
	c.JSON(200, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"quota":             quotaNum.Quota,
			"request_count":     quotaNum.RequestCount,
			"failure_count":     quotaNum.FailureCount,
			"failure_rate":      quotaNum.FailureRate,
			"peak_rpm":          quotaNum.PeakRpm,
			"peak_tpm":          quotaNum.PeakTpm,
			"total_tokens":      quotaNum.TotalTokens,
			"prompt_tokens":     quotaNum.PromptTokens,
			"completion_tokens": quotaNum.CompletionTokens,
			"cache_hit_tokens":  quotaNum.CacheHitTokens,
			"cache_hit_rate":    quotaNum.CacheHitRate,
			//"token": tokenNum,
		},
	})
	return
}
