package model

import (
	"bytes"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	commonRelay "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/bytedance/gopkg/util/gopool"
	"gorm.io/gorm"
)

type TaskStatus string

func (t TaskStatus) ToVideoStatus() string {
	var status string
	switch t {
	case TaskStatusQueued, TaskStatusSubmitted:
		status = dto.VideoStatusQueued
	case TaskStatusInProgress:
		status = dto.VideoStatusInProgress
	case TaskStatusSuccess:
		status = dto.VideoStatusCompleted
	case TaskStatusFailure:
		status = dto.VideoStatusFailed
	default:
		status = dto.VideoStatusUnknown // Default fallback
	}
	return status
}

const (
	TaskStatusNotStart   TaskStatus = "NOT_START"
	TaskStatusSubmitted             = "SUBMITTED"
	TaskStatusQueued                = "QUEUED"
	TaskStatusInProgress            = "IN_PROGRESS"
	TaskStatusFailure               = "FAILURE"
	TaskStatusSuccess               = "SUCCESS"
	TaskStatusUnknown               = "UNKNOWN"

	TaskRefundStatusCompleted     = "completed"
	TaskSettlementStatusPending   = "pending"
	TaskSettlementStatusCompleted = "completed"
	TaskSettlementStatusManual    = "manual_review"
)

// TaskRefundLegacyCutoff separates tasks created before timeout refunds were
// introduced. Those legacy tasks are failed without an automatic refund.
const TaskRefundLegacyCutoff int64 = 1771718400 // 2026-02-22 00:00:00 UTC

type Task struct {
	ID                    int64                 `json:"id" gorm:"primary_key;AUTO_INCREMENT"`
	CreatedAt             int64                 `json:"created_at" gorm:"index"`
	UpdatedAt             int64                 `json:"updated_at"`
	TaskID                string                `json:"task_id" gorm:"type:varchar(191);index"` // 第三方id，不一定有/ song id\ Task id
	Platform              constant.TaskPlatform `json:"platform" gorm:"type:varchar(30);index"` // 平台
	UserId                int                   `json:"user_id" gorm:"index"`
	Group                 string                `json:"group" gorm:"type:varchar(50)"` // 修正计费用
	ChannelId             int                   `json:"channel_id" gorm:"index"`
	Quota                 int                   `json:"quota"`
	RefundStatus          string                `json:"refund_status,omitempty" gorm:"type:varchar(20);index"`
	RefundQuota           int                   `json:"refund_quota,omitempty"`
	RefundedAt            int64                 `json:"refunded_at,omitempty"`
	SettlementStatus      string                `json:"settlement_status,omitempty" gorm:"type:varchar(20);index"`
	SettlementTargetQuota int                   `json:"settlement_target_quota,omitempty"`
	SettlementError       string                `json:"settlement_error,omitempty"`
	BillingAuditStatus    string                `json:"billing_audit_status,omitempty" gorm:"type:varchar(20);index"`
	BillingAuditError     string                `json:"billing_audit_error,omitempty"`
	Action                string                `json:"action" gorm:"type:varchar(40);index"` // 任务类型, song, lyrics, description-mode
	Status                TaskStatus            `json:"status" gorm:"type:varchar(20);index"` // 任务状态
	FailReason            string                `json:"fail_reason"`
	SubmitTime            int64                 `json:"submit_time" gorm:"index"`
	StartTime             int64                 `json:"start_time" gorm:"index"`
	FinishTime            int64                 `json:"finish_time" gorm:"index"`
	Progress              string                `json:"progress" gorm:"type:varchar(20);index"`
	Properties            Properties            `json:"properties" gorm:"type:json"`
	Username              string                `json:"username,omitempty" gorm:"-"`
	// 禁止返回给用户，内部可能包含key等隐私信息
	PrivateData TaskPrivateData `json:"-" gorm:"column:private_data;type:json"`
	Data        json.RawMessage `json:"data" gorm:"type:json"`
}

func (t *Task) SetData(data any) {
	b, _ := common.Marshal(data)
	t.Data = json.RawMessage(b)
}

func (t *Task) GetData(v any) error {
	return common.Unmarshal(t.Data, &v)
}

type Properties struct {
	Input             string `json:"input"`
	UpstreamModelName string `json:"upstream_model_name,omitempty"`
	OriginModelName   string `json:"origin_model_name,omitempty"`
}

func (m *Properties) Scan(val interface{}) error {
	bytesValue, _ := val.([]byte)
	if len(bytesValue) == 0 {
		*m = Properties{}
		return nil
	}
	return common.Unmarshal(bytesValue, m)
}

func (m Properties) Value() (driver.Value, error) {
	if m == (Properties{}) {
		return nil, nil
	}
	return common.Marshal(m)
}

type TaskPrivateData struct {
	Key            string `json:"key,omitempty"`
	UpstreamTaskID string `json:"upstream_task_id,omitempty"` // 上游真实 task ID
	ResultURL      string `json:"result_url,omitempty"`       // 任务成功后的结果 URL（视频地址等）
	// 计费上下文：用于异步退款/差额结算（轮询阶段读取）
	BillingSource     string              `json:"billing_source,omitempty"`  // "wallet" 或 "subscription"
	SubscriptionId    int                 `json:"subscription_id,omitempty"` // 订阅 ID，用于订阅退款
	TokenId           int                 `json:"token_id,omitempty"`        // 令牌 ID，用于令牌额度退款
	NodeName          string              `json:"node_name,omitempty"`       // 发起任务的节点名，轮询结算阶段据此归属日志而非最后查询节点
	BillingContext    *TaskBillingContext `json:"billing_context,omitempty"` // 计费参数快照（用于轮询阶段重新计算）
	ProviderCost      float64             `json:"provider_cost,omitempty"`   // 上游实际成本，仅用于内部成本核算
	ProviderCostKnown bool                `json:"provider_cost_known,omitempty"`
	ProviderIsByok    bool                `json:"provider_is_byok,omitempty"`
}

// TaskBillingContext 记录任务提交时的计费参数，以便轮询阶段可以重新计算额度。
type TaskBillingContext struct {
	RequestId       string                       `json:"request_id,omitempty"`        // V2 价格快照请求 ID
	ModelPrice      float64                      `json:"model_price,omitempty"`       // 模型单价
	GroupRatio      float64                      `json:"group_ratio,omitempty"`       // 分组倍率
	ModelRatio      float64                      `json:"model_ratio,omitempty"`       // 模型倍率
	QuotaPerUnit    float64                      `json:"quota_per_unit,omitempty"`    // 提交时的 USD 额度换算率
	OtherRatios     map[string]float64           `json:"other_ratios,omitempty"`      // 附加倍率（时长、分辨率等）
	OriginModelName string                       `json:"origin_model_name,omitempty"` // 模型名称，必须为OriginModelName
	PerCallBilling  bool                         `json:"per_call_billing,omitempty"`  // 按次计费：跳过轮询阶段的差额结算
	TieredSnapshot  *billingexpr.BillingSnapshot `json:"tiered_snapshot,omitempty"`
	TieredRequest   *billingexpr.RequestInput    `json:"tiered_request,omitempty"`
}

// GetUpstreamTaskID 获取上游真实 task ID（用于与 provider 通信）
// 旧数据没有 UpstreamTaskID 时，TaskID 本身就是上游 ID
func (t *Task) GetUpstreamTaskID() string {
	if t.PrivateData.UpstreamTaskID != "" {
		return t.PrivateData.UpstreamTaskID
	}
	return t.TaskID
}

// GetResultURL 获取任务结果 URL（视频地址等）
// 新数据存在 PrivateData.ResultURL 中；旧数据回退到 FailReason（历史兼容）
func (t *Task) GetResultURL() string {
	if t.PrivateData.ResultURL != "" {
		return t.PrivateData.ResultURL
	}
	return t.FailReason
}

// GenerateTaskID 生成对外暴露的 task_xxxx 格式 ID
func GenerateTaskID() string {
	key, _ := common.GenerateRandomCharsKey(32)
	return "task_" + key
}

func (p *TaskPrivateData) Scan(val interface{}) error {
	bytesValue, _ := val.([]byte)
	if len(bytesValue) == 0 {
		return nil
	}
	return common.Unmarshal(bytesValue, p)
}

func (p TaskPrivateData) Value() (driver.Value, error) {
	if (p == TaskPrivateData{}) {
		return nil, nil
	}
	return common.Marshal(p)
}

// SyncTaskQueryParams 用于包含所有搜索条件的结构体，可以根据需求添加更多字段
type SyncTaskQueryParams struct {
	Platform       constant.TaskPlatform
	ChannelID      string
	TaskID         string
	UserID         string
	Action         string
	Status         string
	StartTimestamp int64
	EndTimestamp   int64
	UserIDs        []int
}

func InitTask(platform constant.TaskPlatform, relayInfo *commonRelay.RelayInfo) *Task {
	properties := Properties{}
	privateData := TaskPrivateData{}
	if relayInfo != nil && relayInfo.ChannelMeta != nil {
		if relayInfo.ChannelMeta.ChannelType == constant.ChannelTypeGemini ||
			relayInfo.ChannelMeta.ChannelType == constant.ChannelTypeVertexAi ||
			relayInfo.ChannelMeta.ChannelType == constant.ChannelTypeOpenRouter {
			privateData.Key = relayInfo.ChannelMeta.ApiKey
		}
		if relayInfo.UpstreamModelName != "" {
			properties.UpstreamModelName = relayInfo.UpstreamModelName
		}
		if relayInfo.OriginModelName != "" {
			properties.OriginModelName = relayInfo.OriginModelName
		}
	}

	// 使用预生成的公开 ID（如果有），否则新生成
	taskID := ""
	if relayInfo.TaskRelayInfo != nil && relayInfo.TaskRelayInfo.PublicTaskID != "" {
		taskID = relayInfo.TaskRelayInfo.PublicTaskID
	} else {
		taskID = GenerateTaskID()
	}

	t := &Task{
		TaskID:      taskID,
		UserId:      relayInfo.UserId,
		Group:       relayInfo.UsingGroup,
		SubmitTime:  time.Now().Unix(),
		Status:      TaskStatusNotStart,
		Progress:    "0%",
		ChannelId:   relayInfo.ChannelId,
		Platform:    platform,
		Properties:  properties,
		PrivateData: privateData,
	}
	return t
}

func TaskGetAllUserTask(userId int, startIdx int, num int, queryParams SyncTaskQueryParams) []*Task {
	var tasks []*Task
	var err error

	// 初始化查询构建器
	query := DB.Where("user_id = ?", userId)

	if queryParams.TaskID != "" {
		query = query.Where("task_id = ?", queryParams.TaskID)
	}
	if queryParams.Action != "" {
		query = query.Where("action = ?", queryParams.Action)
	}
	if queryParams.Status != "" {
		query = query.Where("status = ?", queryParams.Status)
	}
	if queryParams.Platform != "" {
		query = query.Where("platform = ?", queryParams.Platform)
	}
	if queryParams.StartTimestamp != 0 {
		// 假设您已将前端传来的时间戳转换为数据库所需的时间格式，并处理了时间戳的验证和解析
		query = query.Where("submit_time >= ?", queryParams.StartTimestamp)
	}
	if queryParams.EndTimestamp != 0 {
		query = query.Where("submit_time <= ?", queryParams.EndTimestamp)
	}

	// 获取数据
	err = query.Omit("channel_id").Order("id desc").Limit(num).Offset(startIdx).Find(&tasks).Error
	if err != nil {
		return nil
	}

	return tasks
}

func TaskGetAllTasks(startIdx int, num int, queryParams SyncTaskQueryParams) []*Task {
	var tasks []*Task
	var err error

	// 初始化查询构建器
	query := DB

	// 添加过滤条件
	if queryParams.ChannelID != "" {
		query = query.Where("channel_id = ?", queryParams.ChannelID)
	}
	if queryParams.Platform != "" {
		query = query.Where("platform = ?", queryParams.Platform)
	}
	if queryParams.UserID != "" {
		query = query.Where("user_id = ?", queryParams.UserID)
	}
	if len(queryParams.UserIDs) != 0 {
		query = query.Where("user_id in (?)", queryParams.UserIDs)
	}
	if queryParams.TaskID != "" {
		query = query.Where("task_id = ?", queryParams.TaskID)
	}
	if queryParams.Action != "" {
		query = query.Where("action = ?", queryParams.Action)
	}
	if queryParams.Status != "" {
		query = query.Where("status = ?", queryParams.Status)
	}
	if queryParams.StartTimestamp != 0 {
		query = query.Where("submit_time >= ?", queryParams.StartTimestamp)
	}
	if queryParams.EndTimestamp != 0 {
		query = query.Where("submit_time <= ?", queryParams.EndTimestamp)
	}

	// 获取数据
	err = query.Order("id desc").Limit(num).Offset(startIdx).Find(&tasks).Error
	if err != nil {
		return nil
	}

	return tasks
}

func GetTimedOutUnfinishedTasks(cutoffUnix int64, limit int) []*Task {
	var tasks []*Task
	err := DB.Where("progress != ?", "100%").
		Where("status NOT IN ?", []string{TaskStatusFailure, TaskStatusSuccess}).
		Where("submit_time < ?", cutoffUnix).
		Order("submit_time").
		Limit(limit).
		Find(&tasks).Error
	if err != nil {
		return nil
	}
	return tasks
}

func GetAllUnFinishSyncTasks(limit int) []*Task {
	var tasks []*Task
	var err error
	// get all tasks progress is not 100%
	err = DB.Where("progress != ?", "100%").Where("status != ?", TaskStatusFailure).Where("status != ?", TaskStatusSuccess).Limit(limit).Order("id").Find(&tasks).Error
	if err != nil {
		return nil
	}
	return tasks
}

// HasUnfinishedSyncTasks reports whether at least one async (Suno/video) task is
// still in progress. It is a cheap existence check (LIMIT 1) used to decide
// whether the async_task_poll system task needs to run; when no task is pending
// the scheduler skips creating a row entirely.
func HasUnfinishedSyncTasks() bool {
	var id int64
	err := DB.Model(&Task{}).
		Where("progress != ?", "100%").
		Where("status != ?", TaskStatusFailure).
		Where("status != ?", TaskStatusSuccess).
		Limit(1).
		Pluck("id", &id).Error
	return err == nil && id != 0
}

// HasTaskPollingWork reports whether polling has either an unfinished task or
// a failed task with a pending, non-legacy refund. The latter keeps the system
// task scheduler active when reconciliation is the only work left.
func HasTaskPollingWork() bool {
	if HasUnfinishedSyncTasks() {
		return true
	}

	var id int64
	err := DB.Model(&Task{}).
		Where("settlement_status = ? OR billing_audit_status = ?", TaskSettlementStatusPending, TaskSettlementStatusPending).
		Limit(1).
		Pluck("id", &id).Error
	if err == nil && id != 0 {
		return true
	}

	id = 0
	err = DB.Model(&Task{}).
		Where("status = ?", TaskStatusFailure).
		Where("quota != ?", 0).
		Where("(submit_time <= ? OR submit_time >= ?)", 0, TaskRefundLegacyCutoff).
		Limit(1).
		Pluck("id", &id).Error
	return err == nil && id != 0
}

func GetByOnlyTaskId(taskId string) (*Task, bool, error) {
	if taskId == "" {
		return nil, false, nil
	}
	var task *Task
	var err error
	err = DB.Where("task_id = ?", taskId).First(&task).Error
	exist, err := RecordExist(err)
	if err != nil {
		return nil, false, err
	}
	return task, exist, err
}

func GetByTaskId(userId int, taskId string) (*Task, bool, error) {
	if taskId == "" {
		return nil, false, nil
	}
	var task *Task
	var err error
	err = DB.Where("user_id = ? and task_id = ?", userId, taskId).
		First(&task).Error
	exist, err := RecordExist(err)
	if err != nil {
		return nil, false, err
	}
	return task, exist, err
}

func GetByTaskIds(userId int, taskIds []any) ([]*Task, error) {
	if len(taskIds) == 0 {
		return nil, nil
	}
	var task []*Task
	var err error
	err = DB.Where("user_id = ? and task_id in (?)", userId, taskIds).
		Find(&task).Error
	if err != nil {
		return nil, err
	}
	return task, nil
}

func (Task *Task) Insert() error {
	var err error
	err = DB.Create(Task).Error
	return err
}

func GetTaskByID(id int64) (*Task, error) {
	var task Task
	if err := DB.First(&task, id).Error; err != nil {
		return nil, err
	}
	return &task, nil
}

// ApplyTaskRefund atomically refunds the durable database-side accounting for
// a failed task and marks the task completed. Keeping the quota marker until
// the transaction commits makes the operation crash-safe and idempotent.
func ApplyTaskRefund(id int64, expectedQuota int) (applied bool, task *Task, tokenKey string, err error) {
	if id <= 0 || expectedQuota <= 0 {
		return false, nil, "", errors.New("invalid task refund request")
	}

	err = DB.Transaction(func(tx *gorm.DB) error {
		var current Task
		if err := lockForUpdate(tx).Where("id = ?", id).First(&current).Error; err != nil {
			return err
		}
		task = &current
		if current.RefundStatus == TaskRefundStatusCompleted && current.Quota == 0 {
			return nil
		}
		if current.Quota != expectedQuota {
			return fmt.Errorf("task refund quota changed: expected=%d actual=%d", expectedQuota, current.Quota)
		}

		if current.PrivateData.BillingSource == "subscription" && current.PrivateData.SubscriptionId > 0 {
			var subscription UserSubscription
			if err := lockForUpdate(tx).
				Where("id = ?", current.PrivateData.SubscriptionId).
				First(&subscription).Error; err != nil {
				return err
			}
			subscription.AmountUsed -= int64(expectedQuota)
			if subscription.AmountUsed < 0 {
				subscription.AmountUsed = 0
			}
			if err := tx.Model(&subscription).Update("amount_used", subscription.AmountUsed).Error; err != nil {
				return err
			}
		} else {
			result := tx.Model(&User{}).
				Where("id = ?", current.UserId).
				Update("quota", gorm.Expr("quota + ?", expectedQuota))
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return fmt.Errorf("refund user not found: %d", current.UserId)
			}
		}

		if current.PrivateData.TokenId > 0 {
			var token Token
			findErr := lockForUpdate(tx).Unscoped().
				Where("id = ?", current.PrivateData.TokenId).
				First(&token).Error
			if findErr != nil && !errors.Is(findErr, gorm.ErrRecordNotFound) {
				return findErr
			}
			if findErr == nil {
				tokenKey = token.Key
				if err := tx.Unscoped().Model(&Token{}).
					Where("id = ?", token.Id).
					Updates(map[string]any{
						"remain_quota":  gorm.Expr("remain_quota + ?", expectedQuota),
						"used_quota":    gorm.Expr("CASE WHEN used_quota < ? THEN 0 ELSE used_quota - ? END", expectedQuota, expectedQuota),
						"accessed_time": common.GetTimestamp(),
					}).Error; err != nil {
					return err
				}
			}
		}

		userUsageResult := tx.Model(&User{}).Where("id = ?", current.UserId).
			Update("used_quota", gorm.Expr("CASE WHEN used_quota < ? THEN 0 ELSE used_quota - ? END", expectedQuota, expectedQuota))
		if userUsageResult.Error != nil {
			return userUsageResult.Error
		}
		if userUsageResult.RowsAffected != 1 {
			return fmt.Errorf("refund usage user not found: %d", current.UserId)
		}
		if current.ChannelId > 0 {
			if err := tx.Model(&Channel{}).Where("id = ?", current.ChannelId).
				Update("used_quota", gorm.Expr("CASE WHEN used_quota < ? THEN 0 ELSE used_quota - ? END", expectedQuota, expectedQuota)).Error; err != nil {
				return err
			}
		}

		refundedAt := time.Now().Unix()
		taskResult := tx.Model(&Task{}).Where("id = ? AND quota = ?", current.ID, expectedQuota).
			Updates(map[string]any{
				"quota":         0,
				"refund_status": TaskRefundStatusCompleted,
				"refund_quota":  expectedQuota,
				"refunded_at":   refundedAt,
			})
		if taskResult.Error != nil {
			return taskResult.Error
		}
		if taskResult.RowsAffected != 1 {
			return errors.New("task refund completion lost")
		}
		current.Quota = 0
		current.RefundStatus = TaskRefundStatusCompleted
		current.RefundQuota = expectedQuota
		current.RefundedAt = refundedAt
		applied = true
		task = &current
		return nil
	})
	if err != nil || !applied || task == nil {
		return applied, task, tokenKey, err
	}

	if task.PrivateData.BillingSource != "subscription" {
		gopool.Go(func() {
			if cacheErr := cacheIncrUserQuota(task.UserId, int64(expectedQuota)); cacheErr != nil {
				common.SysLog("failed to update refunded user quota cache: " + cacheErr.Error())
			}
		})
	}
	if common.RedisEnabled && tokenKey != "" {
		gopool.Go(func() {
			if cacheErr := cacheIncrTokenQuota(tokenKey, int64(expectedQuota)); cacheErr != nil {
				common.SysLog("failed to update refunded token quota cache: " + cacheErr.Error())
			}
		})
	}
	return true, task, tokenKey, nil
}

// ApplyTaskSettlement atomically applies an asynchronous task's post-completion
// billing delta to the funding source, token, usage counters, channel and task
// marker. The expected quota makes retries idempotent.
func ApplyTaskSettlement(id int64, expectedQuota, actualQuota int) (applied bool, task *Task, tokenKey string, err error) {
	if id <= 0 || expectedQuota < 0 || actualQuota < 0 {
		return false, nil, "", errors.New("invalid task settlement request")
	}

	delta := actualQuota - expectedQuota
	err = DB.Transaction(func(tx *gorm.DB) error {
		var current Task
		if err := lockForUpdate(tx).Where("id = ?", id).First(&current).Error; err != nil {
			return err
		}
		task = &current
		if current.Quota == actualQuota && current.SettlementStatus == TaskSettlementStatusCompleted {
			return nil
		}
		if current.Quota != expectedQuota {
			return fmt.Errorf("task settlement quota changed: expected=%d actual=%d", expectedQuota, current.Quota)
		}

		if delta != 0 {
			if current.PrivateData.BillingSource == "subscription" && current.PrivateData.SubscriptionId > 0 {
				var subscription UserSubscription
				if err := lockForUpdate(tx).Where("id = ?", current.PrivateData.SubscriptionId).First(&subscription).Error; err != nil {
					return err
				}
				newUsed := subscription.AmountUsed + int64(delta)
				if newUsed < 0 {
					newUsed = 0
				}
				if subscription.AmountTotal > 0 && newUsed > subscription.AmountTotal {
					return fmt.Errorf("subscription used exceeds total, used=%d total=%d", newUsed, subscription.AmountTotal)
				}
				if err := tx.Model(&subscription).Update("amount_used", newUsed).Error; err != nil {
					return err
				}
			} else if delta > 0 {
				result := tx.Model(&User{}).Where("id = ? AND quota >= ?", current.UserId, delta).
					Update("quota", gorm.Expr("quota - ?", delta))
				if result.Error != nil {
					return result.Error
				}
				if result.RowsAffected != 1 {
					return fmt.Errorf("insufficient user quota for task settlement: user=%d delta=%d", current.UserId, delta)
				}
			} else {
				result := tx.Model(&User{}).Where("id = ?", current.UserId).
					Update("quota", gorm.Expr("quota + ?", -delta))
				if result.Error != nil {
					return result.Error
				}
				if result.RowsAffected != 1 {
					return fmt.Errorf("task settlement user not found: %d", current.UserId)
				}
			}

			if current.PrivateData.TokenId > 0 {
				var token Token
				findErr := lockForUpdate(tx).Unscoped().Where("id = ?", current.PrivateData.TokenId).First(&token).Error
				if findErr != nil && !errors.Is(findErr, gorm.ErrRecordNotFound) {
					return findErr
				}
				if findErr == nil {
					tokenKey = token.Key
					tokenUpdates := map[string]any{"accessed_time": common.GetTimestamp()}
					if delta > 0 {
						tokenUpdates["remain_quota"] = gorm.Expr("remain_quota - ?", delta)
						tokenUpdates["used_quota"] = gorm.Expr("used_quota + ?", delta)
					} else {
						tokenUpdates["remain_quota"] = gorm.Expr("remain_quota + ?", -delta)
						tokenUpdates["used_quota"] = gorm.Expr("CASE WHEN used_quota < ? THEN 0 ELSE used_quota - ? END", -delta, -delta)
					}
					if err := tx.Unscoped().Model(&Token{}).Where("id = ?", token.Id).Updates(tokenUpdates).Error; err != nil {
						return err
					}
				}
			}

			userUsage := gorm.Expr("used_quota + ?", delta)
			if delta < 0 {
				userUsage = gorm.Expr("CASE WHEN used_quota < ? THEN 0 ELSE used_quota - ? END", -delta, -delta)
			}
			if result := tx.Model(&User{}).Where("id = ?", current.UserId).Update("used_quota", userUsage); result.Error != nil {
				return result.Error
			} else if result.RowsAffected != 1 {
				return fmt.Errorf("task settlement usage user not found: %d", current.UserId)
			}
			if current.ChannelId > 0 {
				channelUsage := gorm.Expr("used_quota + ?", delta)
				if delta < 0 {
					channelUsage = gorm.Expr("CASE WHEN used_quota < ? THEN 0 ELSE used_quota - ? END", -delta, -delta)
				}
				if err := tx.Model(&Channel{}).Where("id = ?", current.ChannelId).Update("used_quota", channelUsage).Error; err != nil {
					return err
				}
			}
		}

		result := tx.Model(&Task{}).Where("id = ? AND quota = ?", current.ID, expectedQuota).
			Updates(map[string]any{
				"quota":                   actualQuota,
				"settlement_status":       TaskSettlementStatusCompleted,
				"settlement_target_quota": actualQuota,
				"settlement_error":        "",
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errors.New("task settlement completion lost")
		}
		current.Quota = actualQuota
		current.SettlementStatus = TaskSettlementStatusCompleted
		current.SettlementTargetQuota = actualQuota
		current.SettlementError = ""
		applied = true
		task = &current
		return nil
	})
	if err != nil || !applied || task == nil || delta == 0 {
		return applied, task, tokenKey, err
	}

	if task.PrivateData.BillingSource != "subscription" {
		gopool.Go(func() {
			if cacheErr := cacheIncrUserQuota(task.UserId, int64(-delta)); cacheErr != nil {
				common.SysLog("failed to update settled user quota cache: " + cacheErr.Error())
			}
		})
	}
	if common.RedisEnabled && tokenKey != "" {
		gopool.Go(func() {
			if cacheErr := cacheIncrTokenQuota(tokenKey, int64(-delta)); cacheErr != nil {
				common.SysLog("failed to update settled token quota cache: " + cacheErr.Error())
			}
		})
	}
	return applied, task, tokenKey, nil
}

func MarkTaskSettlementPending(id int64, targetQuota int, message string) error {
	if id <= 0 || targetQuota < 0 {
		return errors.New("invalid pending task settlement")
	}
	return DB.Model(&Task{}).Where("id = ?", id).Updates(map[string]any{
		"settlement_status":       TaskSettlementStatusPending,
		"settlement_target_quota": targetQuota,
		"settlement_error":        message,
	}).Error
}

func MarkTaskSettlementManualReview(id int64, targetQuota int, message string) error {
	if id <= 0 || targetQuota < 0 {
		return errors.New("invalid manual task settlement")
	}
	return DB.Model(&Task{}).Where("id = ?", id).Updates(map[string]any{
		"settlement_status":       TaskSettlementStatusManual,
		"settlement_target_quota": targetQuota,
		"settlement_error":        message,
	}).Error
}

func UpdateTaskInitialSettlement(id int64, chargedQuota, targetQuota int, status, message string) error {
	if id <= 0 || chargedQuota < 0 || targetQuota < 0 {
		return errors.New("invalid initial task settlement")
	}
	return DB.Model(&Task{}).Where("id = ?", id).Updates(map[string]any{
		"quota":                   chargedQuota,
		"settlement_status":       status,
		"settlement_target_quota": targetQuota,
		"settlement_error":        message,
	}).Error
}

func GetPendingTaskSettlements(limit int) []*Task {
	if limit <= 0 {
		return nil
	}
	var tasks []*Task
	if err := DB.Where("settlement_status = ?", TaskSettlementStatusPending).
		Order("updated_at").
		Limit(limit).
		Find(&tasks).Error; err != nil {
		common.SysLog("failed to query pending task settlements: " + err.Error())
		return nil
	}
	return tasks
}

// GetUnrefundedFailedTasks returns failed tasks that still retain charged
// quota after the reconciliation grace period. Completed refunds and legacy
// tasks are excluded before LIMIT so they cannot starve refundable work.
func GetUnrefundedFailedTasks(updatedBefore int64, limit int) []*Task {
	if limit <= 0 {
		return nil
	}
	var tasks []*Task
	if err := DB.Where("status = ?", TaskStatusFailure).
		Where("quota > ?", 0).
		Where("refund_status <> ? OR refund_status IS NULL OR refund_status = ?", TaskRefundStatusCompleted, "").
		Where("updated_at <= ?", updatedBefore).
		Where("(submit_time <= ? OR submit_time >= ?)", 0, TaskRefundLegacyCutoff).
		Order("id").
		Limit(limit).
		Find(&tasks).Error; err != nil {
		common.SysLog("failed to query unrefunded failed tasks: " + err.Error())
		return nil
	}
	return tasks
}

func UpdateTaskBillingAuditStatus(id int64, status, message string) error {
	if id <= 0 {
		return errors.New("invalid task billing audit status")
	}
	return DB.Model(&Task{}).Where("id = ?", id).Updates(map[string]any{
		"billing_audit_status": status,
		"billing_audit_error":  message,
	}).Error
}

func GetPendingTaskBillingAudits(limit int) []*Task {
	if limit <= 0 {
		return nil
	}
	var tasks []*Task
	if err := DB.Where("billing_audit_status = ?", TaskSettlementStatusPending).
		Order("updated_at").
		Limit(limit).
		Find(&tasks).Error; err != nil {
		common.SysLog("failed to query pending task billing audits: " + err.Error())
		return nil
	}
	return tasks
}

type taskSnapshot struct {
	Status     TaskStatus
	Progress   string
	StartTime  int64
	FinishTime int64
	FailReason string
	ResultURL  string
	Data       json.RawMessage
}

func (s taskSnapshot) Equal(other taskSnapshot) bool {
	return s.Status == other.Status &&
		s.Progress == other.Progress &&
		s.StartTime == other.StartTime &&
		s.FinishTime == other.FinishTime &&
		s.FailReason == other.FailReason &&
		s.ResultURL == other.ResultURL &&
		bytes.Equal(s.Data, other.Data)
}

func (t *Task) Snapshot() taskSnapshot {
	return taskSnapshot{
		Status:     t.Status,
		Progress:   t.Progress,
		StartTime:  t.StartTime,
		FinishTime: t.FinishTime,
		FailReason: t.FailReason,
		ResultURL:  t.PrivateData.ResultURL,
		Data:       t.Data,
	}
}

func (Task *Task) Update() error {
	var err error
	err = DB.Save(Task).Error
	return err
}

func (t *Task) UpdateQuota() error {
	return DB.Model(t).Update("quota", t.Quota).Error
}

// UpdateWithStatus performs a conditional UPDATE guarded by fromStatus (CAS).
// Returns (true, nil) if this caller won the update, (false, nil) if
// another process already moved the task out of fromStatus. MySQL commonly
// reports changed rows rather than matched rows, so a same-value no-op update
// can also return false even when the status predicate still matched.
//
// Uses Model().Select("*").Updates() instead of Save() because GORM's Save
// falls back to INSERT ON CONFLICT when the WHERE-guarded UPDATE matches
// zero rows, which silently bypasses the CAS guard.
func (t *Task) UpdateWithStatus(fromStatus TaskStatus) (bool, error) {
	result := DB.Model(t).Where("status = ?", fromStatus).Select("*").Updates(t)
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected > 0, nil
}

// TaskBulkUpdateByID performs an unconditional bulk UPDATE by primary key IDs.
// WARNING: This function has NO CAS (Compare-And-Swap) guard — it will overwrite
// any concurrent status changes. DO NOT use in billing/quota lifecycle flows
// (e.g., timeout, success, failure transitions that trigger refunds or settlements).
// For status transitions that involve billing, use Task.UpdateWithStatus() instead.
func TaskBulkUpdateByID(ids []int64, params map[string]any) error {
	if len(ids) == 0 {
		return nil
	}
	return DB.Model(&Task{}).
		Where("id in (?)", ids).
		Updates(params).Error
}

type TaskQuotaUsage struct {
	Mode  string  `json:"mode"`
	Count float64 `json:"count"`
}

// TaskCountAllTasks returns total tasks that match the given query params (admin usage)
func TaskCountAllTasks(queryParams SyncTaskQueryParams) int64 {
	var total int64
	query := DB.Model(&Task{})
	if queryParams.ChannelID != "" {
		query = query.Where("channel_id = ?", queryParams.ChannelID)
	}
	if queryParams.Platform != "" {
		query = query.Where("platform = ?", queryParams.Platform)
	}
	if queryParams.UserID != "" {
		query = query.Where("user_id = ?", queryParams.UserID)
	}
	if len(queryParams.UserIDs) != 0 {
		query = query.Where("user_id in (?)", queryParams.UserIDs)
	}
	if queryParams.TaskID != "" {
		query = query.Where("task_id = ?", queryParams.TaskID)
	}
	if queryParams.Action != "" {
		query = query.Where("action = ?", queryParams.Action)
	}
	if queryParams.Status != "" {
		query = query.Where("status = ?", queryParams.Status)
	}
	if queryParams.StartTimestamp != 0 {
		query = query.Where("submit_time >= ?", queryParams.StartTimestamp)
	}
	if queryParams.EndTimestamp != 0 {
		query = query.Where("submit_time <= ?", queryParams.EndTimestamp)
	}
	_ = query.Count(&total).Error
	return total
}

// TaskCountAllUserTask returns total tasks for given user
func TaskCountAllUserTask(userId int, queryParams SyncTaskQueryParams) int64 {
	var total int64
	query := DB.Model(&Task{}).Where("user_id = ?", userId)
	if queryParams.TaskID != "" {
		query = query.Where("task_id = ?", queryParams.TaskID)
	}
	if queryParams.Action != "" {
		query = query.Where("action = ?", queryParams.Action)
	}
	if queryParams.Status != "" {
		query = query.Where("status = ?", queryParams.Status)
	}
	if queryParams.Platform != "" {
		query = query.Where("platform = ?", queryParams.Platform)
	}
	if queryParams.StartTimestamp != 0 {
		query = query.Where("submit_time >= ?", queryParams.StartTimestamp)
	}
	if queryParams.EndTimestamp != 0 {
		query = query.Where("submit_time <= ?", queryParams.EndTimestamp)
	}
	_ = query.Count(&total).Error
	return total
}
func (t *Task) ToOpenAIVideo() *dto.OpenAIVideo {
	openAIVideo := dto.NewOpenAIVideo()
	openAIVideo.ID = t.TaskID
	openAIVideo.Status = t.Status.ToVideoStatus()
	openAIVideo.Model = t.Properties.OriginModelName
	openAIVideo.SetProgressStr(t.Progress)
	openAIVideo.CreatedAt = t.CreatedAt
	openAIVideo.CompletedAt = t.UpdatedAt
	openAIVideo.SetMetadata("url", t.GetResultURL())
	return openAIVideo
}
