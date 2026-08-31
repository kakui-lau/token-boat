package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const maxUserUsageRangeSeconds int64 = 366 * 24 * 60 * 60
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
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	username := c.Query("username")
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	group := c.Query("group")
	requestId := c.Query("request_id")
	upstreamRequestId := c.Query("upstream_request_id")
	logs, total, err := model.GetAllLogs(logType, startTimestamp, endTimestamp, modelName, username, tokenName, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), channel, group, requestId, upstreamRequestId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
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
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	username := c.Query("username")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	group := c.Query("group")
	requestId := c.Query("request_id")
	upstreamRequestId := c.Query("upstream_request_id")
	stat, err := model.SumUsedQuota(logType, startTimestamp, endTimestamp, modelName, username, tokenName, channel, group, requestId, upstreamRequestId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	//tokenNum := model.SumUsedToken(logType, startTimestamp, endTimestamp, modelName, username, "")
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"quota":             stat.Quota,
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
		},
	})
	return
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
