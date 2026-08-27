package model

import (
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/bytedance/gopkg/util/gopool"
	"gorm.io/gorm"
)

const MidjourneyRefundStatusCompleted = "completed"

type Midjourney struct {
	Id             int    `json:"id"`
	Code           int    `json:"code"`
	UserId         int    `json:"user_id" gorm:"index"`
	Action         string `json:"action" gorm:"type:varchar(40);index"`
	MjId           string `json:"mj_id" gorm:"index"`
	Prompt         string `json:"prompt"`
	PromptEn       string `json:"prompt_en"`
	Description    string `json:"description"`
	State          string `json:"state"`
	SubmitTime     int64  `json:"submit_time" gorm:"index"`
	StartTime      int64  `json:"start_time" gorm:"index"`
	FinishTime     int64  `json:"finish_time" gorm:"index"`
	ImageUrl       string `json:"image_url"`
	VideoUrl       string `json:"video_url"`
	VideoUrls      string `json:"video_urls"`
	Status         string `json:"status" gorm:"type:varchar(20);index"`
	Progress       string `json:"progress" gorm:"type:varchar(30);index"`
	FailReason     string `json:"fail_reason"`
	ChannelId      int    `json:"channel_id"`
	Quota          int    `json:"quota"`
	BillingSource  string `json:"-" gorm:"type:varchar(16);index"`
	SubscriptionId int    `json:"-" gorm:"index"`
	TokenId        int    `json:"-" gorm:"index"`
	RequestId      string `json:"-" gorm:"type:varchar(64);index"`
	RefundStatus   string `json:"-" gorm:"type:varchar(20);index"`
	RefundQuota    int    `json:"-"`
	RefundedAt     int64  `json:"-"`
	Buttons        string `json:"buttons"`
	Properties     string `json:"properties"`
}

// TaskQueryParams 用于包含所有搜索条件的结构体，可以根据需求添加更多字段
type TaskQueryParams struct {
	ChannelID      string
	MjID           string
	StartTimestamp string
	EndTimestamp   string
}

func GetAllUserTask(userId int, startIdx int, num int, queryParams TaskQueryParams) []*Midjourney {
	var tasks []*Midjourney
	var err error

	// 初始化查询构建器
	query := DB.Where("user_id = ?", userId)

	if queryParams.MjID != "" {
		query = query.Where("mj_id = ?", queryParams.MjID)
	}
	if queryParams.StartTimestamp != "" {
		// 假设您已将前端传来的时间戳转换为数据库所需的时间格式，并处理了时间戳的验证和解析
		query = query.Where("submit_time >= ?", queryParams.StartTimestamp)
	}
	if queryParams.EndTimestamp != "" {
		query = query.Where("submit_time <= ?", queryParams.EndTimestamp)
	}

	// 获取数据
	err = query.Order("id desc").Limit(num).Offset(startIdx).Find(&tasks).Error
	if err != nil {
		return nil
	}

	return tasks
}

func GetAllTasks(startIdx int, num int, queryParams TaskQueryParams) []*Midjourney {
	var tasks []*Midjourney
	var err error

	// 初始化查询构建器
	query := DB

	// 添加过滤条件
	if queryParams.ChannelID != "" {
		query = query.Where("channel_id = ?", queryParams.ChannelID)
	}
	if queryParams.MjID != "" {
		query = query.Where("mj_id = ?", queryParams.MjID)
	}
	if queryParams.StartTimestamp != "" {
		query = query.Where("submit_time >= ?", queryParams.StartTimestamp)
	}
	if queryParams.EndTimestamp != "" {
		query = query.Where("submit_time <= ?", queryParams.EndTimestamp)
	}

	// 获取数据
	err = query.Order("id desc").Limit(num).Offset(startIdx).Find(&tasks).Error
	if err != nil {
		return nil
	}

	return tasks
}

func GetAllUnFinishTasks() []*Midjourney {
	var tasks []*Midjourney
	var err error
	// get all tasks progress is not 100%
	err = DB.Where("progress != ?", "100%").Find(&tasks).Error
	if err != nil {
		return nil
	}
	return tasks
}

// HasUnfinishedMidjourneyTasks reports whether at least one Midjourney task is
// still in progress. It is a cheap existence check (LIMIT 1) used to decide
// whether the midjourney_poll system task needs to run; when no task is pending
// the scheduler skips creating a row entirely.
func HasUnfinishedMidjourneyTasks() bool {
	var id int
	err := DB.Model(&Midjourney{}).
		Where("progress != ?", "100%").
		Limit(1).
		Pluck("id", &id).Error
	return err == nil && id != 0
}

func GetByOnlyMJId(mjId string) *Midjourney {
	var mj *Midjourney
	var err error
	err = DB.Where("mj_id = ?", mjId).First(&mj).Error
	if err != nil {
		return nil
	}
	return mj
}

func GetByMJId(userId int, mjId string) *Midjourney {
	var mj *Midjourney
	var err error
	err = DB.Where("user_id = ? and mj_id = ?", userId, mjId).First(&mj).Error
	if err != nil {
		return nil
	}
	return mj
}

func GetByMJIds(userId int, mjIds []string) []*Midjourney {
	var mj []*Midjourney
	var err error
	err = DB.Where("user_id = ? and mj_id in (?)", userId, mjIds).Find(&mj).Error
	if err != nil {
		return nil
	}
	return mj
}

func GetMjByuId(id int) *Midjourney {
	var mj *Midjourney
	var err error
	err = DB.Where("id = ?", id).First(&mj).Error
	if err != nil {
		return nil
	}
	return mj
}

func UpdateProgress(id int, progress string) error {
	return DB.Model(&Midjourney{}).Where("id = ?", id).Update("progress", progress).Error
}

func (midjourney *Midjourney) Insert() error {
	var err error
	err = DB.Create(midjourney).Error
	return err
}

func (midjourney *Midjourney) Update() error {
	var err error
	err = DB.Save(midjourney).Error
	return err
}

// UpdateWithStatus performs a conditional UPDATE guarded by fromStatus (CAS).
// Returns (true, nil) if this caller won the update, (false, nil) if
// another process already moved the task out of fromStatus.
// UpdateWithStatus performs a conditional UPDATE guarded by fromStatus (CAS).
// Uses Model().Select("*").Updates() to avoid GORM Save()'s INSERT fallback.
func (midjourney *Midjourney) UpdateWithStatus(fromStatus string) (bool, error) {
	result := DB.Model(midjourney).Where("status = ?", fromStatus).Select("*").Updates(midjourney)
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected > 0, nil
}

// ApplyMidjourneyRefund atomically reverses the durable accounting recorded
// when a legacy Midjourney request was accepted. The quota marker is cleared
// in the same transaction, making repeated polling/notify failures idempotent.
func ApplyMidjourneyRefund(id int, expectedQuota int) (applied bool, task *Midjourney, tokenKey string, err error) {
	if id <= 0 || expectedQuota <= 0 {
		return false, nil, "", errors.New("invalid Midjourney refund request")
	}

	err = DB.Transaction(func(tx *gorm.DB) error {
		var current Midjourney
		if err := lockForUpdate(tx).Where("id = ?", id).First(&current).Error; err != nil {
			return err
		}
		task = &current
		if current.RefundStatus == MidjourneyRefundStatusCompleted && current.Quota == 0 {
			return nil
		}
		if current.Quota != expectedQuota {
			return fmt.Errorf("Midjourney refund quota changed: expected=%d actual=%d", expectedQuota, current.Quota)
		}

		if current.BillingSource == "subscription" && current.SubscriptionId > 0 {
			var subscription UserSubscription
			if err := lockForUpdate(tx).Where("id = ?", current.SubscriptionId).First(&subscription).Error; err != nil {
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
			result := tx.Model(&User{}).Where("id = ?", current.UserId).
				Update("quota", gorm.Expr("quota + ?", expectedQuota))
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return fmt.Errorf("refund user not found: %d", current.UserId)
			}
		}

		if current.TokenId > 0 {
			var token Token
			findErr := lockForUpdate(tx).Unscoped().Where("id = ?", current.TokenId).First(&token).Error
			if findErr != nil && !errors.Is(findErr, gorm.ErrRecordNotFound) {
				return findErr
			}
			if findErr == nil {
				tokenKey = token.Key
				if err := tx.Unscoped().Model(&Token{}).Where("id = ?", token.Id).
					Updates(map[string]any{
						"remain_quota":  gorm.Expr("remain_quota + ?", expectedQuota),
						"used_quota":    gorm.Expr("CASE WHEN used_quota < ? THEN 0 ELSE used_quota - ? END", expectedQuota, expectedQuota),
						"accessed_time": common.GetTimestamp(),
					}).Error; err != nil {
					return err
				}
			}
		}

		userResult := tx.Model(&User{}).Where("id = ?", current.UserId).
			Update("used_quota", gorm.Expr("CASE WHEN used_quota < ? THEN 0 ELSE used_quota - ? END", expectedQuota, expectedQuota))
		if userResult.Error != nil {
			return userResult.Error
		}
		if userResult.RowsAffected != 1 {
			return fmt.Errorf("refund usage user not found: %d", current.UserId)
		}
		if current.ChannelId > 0 {
			if err := tx.Model(&Channel{}).Where("id = ?", current.ChannelId).
				Update("used_quota", gorm.Expr("CASE WHEN used_quota < ? THEN 0 ELSE used_quota - ? END", expectedQuota, expectedQuota)).Error; err != nil {
				return err
			}
		}

		refundedAt := time.Now().Unix()
		result := tx.Model(&Midjourney{}).Where("id = ? AND quota = ?", current.Id, expectedQuota).
			Updates(map[string]any{
				"quota":         0,
				"refund_status": MidjourneyRefundStatusCompleted,
				"refund_quota":  expectedQuota,
				"refunded_at":   refundedAt,
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errors.New("Midjourney refund completion lost")
		}
		current.Quota = 0
		current.RefundStatus = MidjourneyRefundStatusCompleted
		current.RefundQuota = expectedQuota
		current.RefundedAt = refundedAt
		task = &current
		applied = true
		return nil
	})
	if err != nil || !applied || task == nil {
		return applied, task, tokenKey, err
	}

	if task.BillingSource != "subscription" {
		gopool.Go(func() {
			if cacheErr := cacheIncrUserQuota(task.UserId, int64(expectedQuota)); cacheErr != nil {
				common.SysLog("failed to update refunded Midjourney user quota cache: " + cacheErr.Error())
			}
		})
	}
	if common.RedisEnabled && tokenKey != "" {
		gopool.Go(func() {
			if cacheErr := cacheIncrTokenQuota(tokenKey, int64(expectedQuota)); cacheErr != nil {
				common.SysLog("failed to update refunded Midjourney token quota cache: " + cacheErr.Error())
			}
		})
	}
	return true, task, tokenKey, nil
}

func MjBulkUpdate(mjIds []string, params map[string]any) error {
	return DB.Model(&Midjourney{}).
		Where("mj_id in (?)", mjIds).
		Updates(params).Error
}

func MjBulkUpdateByTaskIds(taskIDs []int, params map[string]any) error {
	return DB.Model(&Midjourney{}).
		Where("id in (?)", taskIDs).
		Updates(params).Error
}

// CountAllTasks returns total midjourney tasks for admin query
func CountAllTasks(queryParams TaskQueryParams) int64 {
	var total int64
	query := DB.Model(&Midjourney{})
	if queryParams.ChannelID != "" {
		query = query.Where("channel_id = ?", queryParams.ChannelID)
	}
	if queryParams.MjID != "" {
		query = query.Where("mj_id = ?", queryParams.MjID)
	}
	if queryParams.StartTimestamp != "" {
		query = query.Where("submit_time >= ?", queryParams.StartTimestamp)
	}
	if queryParams.EndTimestamp != "" {
		query = query.Where("submit_time <= ?", queryParams.EndTimestamp)
	}
	_ = query.Count(&total).Error
	return total
}

// CountAllUserTask returns total midjourney tasks for user
func CountAllUserTask(userId int, queryParams TaskQueryParams) int64 {
	var total int64
	query := DB.Model(&Midjourney{}).Where("user_id = ?", userId)
	if queryParams.MjID != "" {
		query = query.Where("mj_id = ?", queryParams.MjID)
	}
	if queryParams.StartTimestamp != "" {
		query = query.Where("submit_time >= ?", queryParams.StartTimestamp)
	}
	if queryParams.EndTimestamp != "" {
		query = query.Where("submit_time <= ?", queryParams.EndTimestamp)
	}
	_ = query.Count(&total).Error
	return total
}
