package controller

import (
	"errors"
	"fmt"
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
const maxAdminTaskRangeSeconds int64 = 31 * 24 * 60 * 60

func taskStatusesForGroup(group string) []model.TaskStatus {
	switch group {
	case "queued":
		return []model.TaskStatus{model.TaskStatusNotStart, model.TaskStatusSubmitted, model.TaskStatusQueued}
	case "processing":
		return []model.TaskStatus{model.TaskStatusInProgress}
	case "succeeded":
		return []model.TaskStatus{model.TaskStatusSuccess}
	case "failed":
		return []model.TaskStatus{model.TaskStatusFailure}
	case "cancelled":
		return []model.TaskStatus{model.TaskStatusCancelled}
	case "expired":
		return []model.TaskStatus{model.TaskStatusExpired}
	default:
		return nil
	}
}

func GetAllTask(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)

	summaryOnly := c.Query("view") == "summary"
	var startTimestamp, endTimestamp int64
	if summaryOnly {
		var ok bool
		startTimestamp, endTimestamp, ok = parseAdminTaskTimeRange(c)
		if !ok {
			return
		}
	} else {
		startTimestamp, _ = strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
		endTimestamp, _ = strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	}
	// 解析其他查询参数
	queryParams := model.SyncTaskQueryParams{
		Platform:       constant.TaskPlatform(c.Query("platform")),
		TaskID:         c.Query("task_id"),
		Status:         c.Query("status"),
		Statuses:       taskStatusesForGroup(c.Query("status_group")),
		TaskType:       c.Query("task_type"),
		SortOrder:      c.Query("order"),
		Action:         c.Query("action"),
		StartTimestamp: startTimestamp,
		EndTimestamp:   endTimestamp,
		ChannelID:      c.Query("channel_id"),
	}

	if summaryOnly {
		items, err := model.TaskGetAllTaskSummaries(pageInfo.GetStartIdx(), pageInfo.GetPageSize(), queryParams)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		total, err := model.TaskCountAllTaskSummaries(queryParams)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		summaries, err := adminTasksToDto(items)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		pageInfo.SetTotal(int(total))
		pageInfo.SetItems(summaries)
		common.ApiSuccess(c, pageInfo)
		return
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
		Statuses:       taskStatusesForGroup(c.Query("status_group")),
		TaskType:       c.Query("task_type"),
		SortOrder:      c.Query("order"),
		Action:         c.Query("action"),
		StartTimestamp: startTimestamp,
		EndTimestamp:   endTimestamp,
	}

	items := model.TaskGetAllUserTask(userId, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), queryParams)
	total := model.TaskCountAllUserTask(userId, queryParams)
	if c.Query("include_type_counts") == "true" {
		typeCounts := make(map[string]int64, 4)
		for _, taskType := range []string{"all", "image", "video", "audio"} {
			countParams := queryParams
			countParams.TaskType = taskType
			typeCounts[taskType] = model.TaskCountAllUserTask(userId, countParams)
		}
		common.ApiSuccess(c, gin.H{
			"page":        pageInfo.GetPage(),
			"page_size":   pageInfo.GetPageSize(),
			"total":       total,
			"items":       tasksToDto(items, false),
			"type_counts": typeCounts,
		})
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(tasksToDto(items, false))
	common.ApiSuccess(c, pageInfo)
}

func GetUserTaskArtifact(c *gin.Context) {
	position, err := strconv.Atoi(c.Param("position"))
	if err != nil || position < 0 {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	artifact, exists, err := model.GetUserTaskArtifact(c.GetInt("id"), c.Param("task_id"), position)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !exists {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}

	c.Header("Cache-Control", "private, max-age=31536000, immutable")
	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=\"task-result-%d\"", position+1))
	c.Header("Content-Security-Policy", "default-src 'none'; sandbox")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, artifact.ContentType, artifact.Content)
}

func ManuallyFailAndRefundTask(c *gin.Context) {
	taskID := strings.TrimSpace(c.Param("task_id"))
	if taskID == "" {
		common.ApiErrorMsg(c, "task_id is required")
		return
	}
	var request dto.AdminTaskRefundRequest
	if err := c.ShouldBindJSON(&request); err != nil || request.InternalID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "valid internal_id is required",
		})
		return
	}

	result, err := service.ManuallyFailAndRefundTaskByIdentity(c, request.InternalID, taskID, manualTaskRefundReason)
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
		"internal_id":      request.InternalID,
		"task_id":          taskID,
		"refunded_quota":   result.RefundedQuota,
		"refunded_usd":     result.RefundedUSD,
		"already_refunded": result.AlreadyRefunded,
	})
	common.ApiSuccess(c, gin.H{
		"task_id":          taskID,
		"refunded_quota":   result.RefundedQuota,
		"refunded_usd":     result.RefundedUSD,
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
	properties := task.Properties
	if strings.TrimSpace(properties.Input) == "" && task.PrivateData.AdminUpstreamRequest != nil {
		var request struct {
			Prompt string `json:"prompt"`
		}
		if err := common.Unmarshal([]byte(task.PrivateData.AdminUpstreamRequest.Body), &request); err == nil {
			properties.Input = strings.TrimSpace(request.Prompt)
			result.Properties = properties
		}
	}
	if result.Quota == 0 &&
		task.RefundStatus != model.TaskRefundStatusCompleted &&
		task.SettlementStatus == model.TaskSettlementStatusCompleted &&
		task.SettlementTargetQuota > 0 {
		result.Quota = task.SettlementTargetQuota
	}
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

func parseAdminTaskTimeRange(c *gin.Context) (int64, int64, bool) {
	startRaw := strings.TrimSpace(c.Query("start_timestamp"))
	endRaw := strings.TrimSpace(c.Query("end_timestamp"))
	startTimestamp, startErr := strconv.ParseInt(startRaw, 10, 64)
	endTimestamp, endErr := strconv.ParseInt(endRaw, 10, 64)
	if startErr != nil || endErr != nil || startTimestamp <= 0 || endTimestamp <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "valid start_timestamp and end_timestamp are required",
		})
		return 0, 0, false
	}
	if startTimestamp > endTimestamp {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "start_timestamp must not be after end_timestamp",
		})
		return 0, 0, false
	}
	if endTimestamp-startTimestamp > maxAdminTaskRangeSeconds {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "task date range must not exceed 31 days",
		})
		return 0, 0, false
	}
	return startTimestamp, endTimestamp, true
}

func adminTasksToDto(tasks []*model.Task) ([]*dto.AdminTaskListDto, error) {
	userIdMap := make(map[int]*model.UserBase)
	userIds := types.NewSet[int]()
	taskIds := make([]int64, 0, len(tasks))
	for _, task := range tasks {
		userIds.Add(task.UserId)
		taskIds = append(taskIds, task.ID)
	}
	for _, userId := range userIds.Items() {
		cacheUser, err := model.GetUserCache(userId)
		if err == nil {
			userIdMap[userId] = cacheUser
		}
	}
	quotaPerUnits, err := model.TaskBillingQuotaPerUnitSnapshots(taskIds)
	if err != nil {
		return nil, err
	}

	result := make([]*dto.AdminTaskListDto, len(tasks))
	for i, task := range tasks {
		username := ""
		if user, ok := userIdMap[task.UserId]; ok {
			username = user.Username
		}
		result[i] = adminTaskToDto(task, username, quotaPerUnits[task.ID])
	}
	return result, nil
}

func adminTaskToDto(task *model.Task, username string, quotaPerUnit float64) *dto.AdminTaskListDto {
	quota := task.Quota
	if quota == 0 &&
		task.RefundStatus != model.TaskRefundStatusCompleted &&
		task.SettlementStatus == model.TaskSettlementStatusCompleted &&
		task.SettlementTargetQuota > 0 {
		quota = task.SettlementTargetQuota
	}
	modelName := strings.TrimSpace(task.Properties.OriginModelName)
	if modelName == "" {
		modelName = strings.TrimSpace(task.Properties.UpstreamModelName)
	}
	failureReason := ""
	if task.Status == model.TaskStatusFailure ||
		task.Status == model.TaskStatusCancelled ||
		task.Status == model.TaskStatusExpired {
		failureReason = boundedTaskText(task.FailReason, 1_000)
	}
	return &dto.AdminTaskListDto{
		ID:            task.ID,
		CreatedAt:     task.CreatedAt,
		UpdatedAt:     task.UpdatedAt,
		TaskID:        task.TaskID,
		TaskType:      model.CanonicalTaskType(task),
		Platform:      string(task.Platform),
		Model:         modelName,
		PromptPreview: boundedTaskText(task.Properties.Input, 240),
		UserId:        task.UserId,
		Username:      username,
		Group:         task.Group,
		ChannelId:     task.ChannelId,
		CostUSD:       model.TaskQuotaUSD(quota, quotaPerUnit),
		Action:        task.Action,
		Status:        string(task.Status),
		FailureReason: failureReason,
		SubmitTime:    task.SubmitTime,
		StartTime:     task.StartTime,
		FinishTime:    task.FinishTime,
		Progress:      task.Progress,
		AdminBilling: &dto.AdminTaskBilling{
			RefundStatus:        task.RefundStatus,
			RefundedUSD:         model.TaskQuotaUSD(task.RefundQuota, quotaPerUnit),
			SettlementStatus:    task.SettlementStatus,
			SettlementTargetUSD: model.TaskQuotaUSD(task.SettlementTargetQuota, quotaPerUnit),
			SettlementError:     boundedTaskText(task.SettlementError, 500),
			BillingAuditStatus:  task.BillingAuditStatus,
			BillingAuditError:   boundedTaskText(task.BillingAuditError, 500),
		},
	}
}

func boundedTaskText(value string, limit int) string {
	value = strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
	if value == "" || limit <= 0 {
		return ""
	}
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	if limit == 1 {
		return "…"
	}
	return string(runes[:limit-1]) + "…"
}
