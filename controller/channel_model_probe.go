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

func AdminListChannelModelProbes(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	rawPageSize := strings.TrimSpace(c.Query("page_size"))
	if rawPageSize == "" {
		rawPageSize = strings.TrimSpace(c.Query("ps"))
	}
	if rawPageSize == "" {
		pageInfo.PageSize = 200
	} else if requested, err := strconv.Atoi(rawPageSize); err == nil && requested > 100 {
		pageInfo.PageSize = min(requested, 200)
	}

	hours := 72
	if parsed, err := strconv.Atoi(c.Query("hours")); err == nil && parsed > 0 {
		hours = min(parsed, 24*30)
	}
	channelId, _ := strconv.Atoi(c.Query("channel_id"))
	var success *bool
	switch c.Query("status") {
	case "success":
		value := true
		success = &value
	case "failed":
		value := false
		success = &value
	}

	endAt := time.Now().Unix()
	startAt := endAt - int64(hours)*60*60
	items, total, summary, err := model.ListChannelModelProbes(model.ChannelModelProbeFilter{
		Keyword:   c.Query("keyword"),
		ChannelId: channelId,
		Success:   success,
		StartAt:   startAt,
		EndAt:     endAt,
	}, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	channels, err := model.ListChannelModelProbeChannels(startAt, endAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"items": items, "total": total, "page": pageInfo.GetPage(),
			"page_size": pageInfo.GetPageSize(), "hours": hours, "summary": summary,
			"channels": channels,
		},
	})
}
