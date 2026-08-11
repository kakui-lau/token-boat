package controller

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

const maxUserModelUsageRange = 93 * 24 * time.Hour

func GetUserModelUsage(c *gin.Context) {
	startTimestamp, startErr := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, endErr := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	if startErr != nil || endErr != nil || startTimestamp <= 0 || endTimestamp < startTimestamp {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid time range"})
		return
	}
	if endTimestamp-startTimestamp > int64(maxUserModelUsageRange/time.Second) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "time range cannot exceed 93 days"})
		return
	}

	pageInfo := common.GetPageQuery(c)
	items, total, summary, err := model.QueryUserModelUsage(model.UserModelUsageQuery{
		StartTimestamp: startTimestamp,
		EndTimestamp:   endTimestamp,
		Username:       strings.TrimSpace(c.Query("username")),
		ModelName:      strings.TrimSpace(c.Query("model_name")),
	}, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"items":     items,
			"total":     total,
			"page":      pageInfo.GetPage(),
			"page_size": pageInfo.GetPageSize(),
			"summary":   summary,
		},
	})
}
