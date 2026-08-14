package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

const manualTaskRefundReason = "管理员手动终止任务并退款"

func GetAllTask(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)

	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	// 解析其他查询参数
	queryParams := model.SyncTaskQueryParams{
		Platform:       constant.TaskPlatform(c.Query("platform")),
		TaskID:         c.Query("task_id"),
		Status:         c.Query("status"),
		Action:         c.Query("action"),
		StartTimestamp: startTimestamp,
		EndTimestamp:   endTimestamp,
		ChannelID:      c.Query("channel_id"),
	}

	items := model.TaskGetAllTasks(pageInfo.GetStartIdx(), pageInfo.GetPageSize(), queryParams)
	total := model.TaskCountAllTasks(queryParams)
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(tasksToDto(items, true))
	common.ApiSuccess(c, pageInfo)
}

func GetUserTask(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)

	userId := c.GetInt("id")

	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)

	queryParams := model.SyncTaskQueryParams{
		Platform:       constant.TaskPlatform(c.Query("platform")),
		TaskID:         c.Query("task_id"),
		Status:         c.Query("status"),
		Action:         c.Query("action"),
		StartTimestamp: startTimestamp,
		EndTimestamp:   endTimestamp,
	}

	items := model.TaskGetAllUserTask(userId, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), queryParams)
	total := model.TaskCountAllUserTask(userId, queryParams)
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(tasksToDto(items, false))
	common.ApiSuccess(c, pageInfo)
}

func ManuallyFailAndRefundTask(c *gin.Context) {
	taskID := strings.TrimSpace(c.Param("task_id"))
	if taskID == "" {
		common.ApiErrorMsg(c, "task_id is required")
		return
	}

	result, err := service.ManuallyFailAndRefundTask(c, taskID, manualTaskRefundReason)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, service.ErrManualTaskNotFound) {
			status = http.StatusNotFound
		} else if errors.Is(err, service.ErrManualTaskTerminal) {
			status = http.StatusConflict
		}
		c.JSON(status, gin.H{"success": false, "message": err.Error()})
		return
	}

	recordManageAudit(c, "task.fail_and_refund", map[string]interface{}{
		"task_id":          taskID,
		"refunded_quota":   result.RefundedQuota,
		"already_refunded": result.AlreadyRefunded,
	})
	common.ApiSuccess(c, gin.H{
		"task_id":          taskID,
		"refunded_quota":   result.RefundedQuota,
		"already_refunded": result.AlreadyRefunded,
	})
}

func tasksToDto(tasks []*model.Task, fillUser bool) []*dto.TaskDto {
	var userIdMap map[int]*model.UserBase
	if fillUser {
		userIdMap = make(map[int]*model.UserBase)
		userIds := types.NewSet[int]()
		for _, task := range tasks {
			userIds.Add(task.UserId)
		}
		for _, userId := range userIds.Items() {
			cacheUser, err := model.GetUserCache(userId)
			if err == nil {
				userIdMap[userId] = cacheUser
			}
		}
	}
	result := make([]*dto.TaskDto, len(tasks))
	for i, task := range tasks {
		if fillUser {
			if user, ok := userIdMap[task.UserId]; ok {
				task.Username = user.Username
			}
		}
		result[i] = taskToDto(task, fillUser)
	}
	return result
}

func taskToDto(task *model.Task, includeAdminFields bool) *dto.TaskDto {
	result := relay.TaskModel2Dto(task)
	if includeAdminFields {
		result.AdminUpstreamRequest = task.PrivateData.AdminUpstreamRequest
		result.AdminBilling = &dto.TaskAdminBilling{
			Quota:                 task.Quota,
			RefundStatus:          task.RefundStatus,
			RefundQuota:           task.RefundQuota,
			SettlementStatus:      task.SettlementStatus,
			SettlementTargetQuota: task.SettlementTargetQuota,
			SettlementError:       task.SettlementError,
			BillingAuditStatus:    task.BillingAuditStatus,
			BillingAuditError:     task.BillingAuditError,
		}
	}
	return result
}
