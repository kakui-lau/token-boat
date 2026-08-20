package model

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"

	"gorm.io/gorm"
)

func applyExplicitLogTextFilter(tx *gorm.DB, column string, value string) (*gorm.DB, error) {
	if value == "" {
		return tx, nil
	}
	if strings.Contains(value, "%") {
		condition, pattern, err := buildLogLikeCondition(column, value)
		if err != nil {
			return nil, err
		}
		return tx.Where(condition, pattern), nil
	}
	return tx.Where(column+" = ?", value), nil
}

func buildLogLikeCondition(column string, value string) (string, string, error) {
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		pattern, err := sanitizeClickHouseLikePattern(value)
		if err != nil {
			return "", "", err
		}
		return column + " LIKE ?", pattern, nil
	}

	pattern, err := sanitizeLikePattern(value)
	if err != nil {
		return "", "", err
	}
	return column + " LIKE ? ESCAPE '!'", pattern, nil
}

func sanitizeClickHouseLikePattern(input string) (string, error) {
	input = strings.ReplaceAll(input, `\`, `\\`)
	input = strings.ReplaceAll(input, `_`, `\_`)

	if err := validateLikePattern(input); err != nil {
		return "", err
	}
	return input, nil
}

type Log struct {
	Id                int    `json:"id" gorm:"index:idx_created_at_id,priority:2;index:idx_user_id_id,priority:2;index:idx_logs_type_created_id,priority:3"`
	UserId            int    `json:"user_id" gorm:"index;index:idx_user_id_id,priority:1"`
	CreatedAt         int64  `json:"created_at" gorm:"bigint;index:idx_created_at_id,priority:1;index:idx_created_at_type;index:idx_logs_type_created_id,priority:2"`
	Type              int    `json:"type" gorm:"index:idx_created_at_type;index:idx_logs_type_created_id,priority:1"`
	Content           string `json:"content"`
	Username          string `json:"username" gorm:"index;index:index_username_model_name,priority:2;default:''"`
	TokenName         string `json:"token_name" gorm:"index;default:''"`
	ModelName         string `json:"model_name" gorm:"index;index:index_username_model_name,priority:1;default:''"`
	Quota             int    `json:"quota" gorm:"default:0"`
	PromptTokens      int    `json:"prompt_tokens" gorm:"default:0"`
	CompletionTokens  int    `json:"completion_tokens" gorm:"default:0"`
	UseTime           int    `json:"use_time" gorm:"default:0"`
	IsStream          bool   `json:"is_stream"`
	ChannelId         int    `json:"channel" gorm:"index"`
	ChannelName       string `json:"channel_name" gorm:"->"`
	TokenId           int    `json:"token_id" gorm:"default:0;index"`
	Group             string `json:"group" gorm:"index"`
	Ip                string `json:"ip" gorm:"index;default:''"`
	RequestId         string `json:"request_id,omitempty" gorm:"type:varchar(64);index:idx_logs_request_id;default:''"`
	UpstreamRequestId string `json:"upstream_request_id,omitempty" gorm:"type:varchar(128);index:idx_logs_upstream_request_id;default:''"`
	TaskId            string `json:"task_id,omitempty" gorm:"type:varchar(64);index:idx_logs_task_id;default:''"`
	Other             string `json:"other"`
}

type UserModelUsageQuery struct {
	StartTimestamp int64
	EndTimestamp   int64
	Username       string
	ModelName      string
}

type UserModelUsage struct {
	Username         string  `json:"username"`
	UserID           int     `json:"user_id"`
	ModelName        string  `json:"model_name"`
	RequestCount     int64   `json:"request_count"`
	PromptTokens     int64   `json:"prompt_tokens"`
	CompletionTokens int64   `json:"completion_tokens"`
	TotalTokens      int64   `json:"total_tokens"`
	Quota            int64   `json:"quota"`
	AverageUseTime   float64 `json:"average_use_time"`
}

type UserModelUsageSummary struct {
	UserCount        int64 `json:"user_count"`
	ModelCount       int64 `json:"model_count"`
	RequestCount     int64 `json:"request_count"`
	PromptTokens     int64 `json:"prompt_tokens"`
	CompletionTokens int64 `json:"completion_tokens"`
	TotalTokens      int64 `json:"total_tokens"`
	Quota            int64 `json:"quota"`
}

func QueryUserModelUsage(query UserModelUsageQuery, offset, limit int) ([]UserModelUsage, int64, UserModelUsageSummary, error) {
	base := LOG_DB.Model(&Log{}).
		Where("type IN ?", []int{LogTypeConsume, LogTypeRefund}).
		Where("created_at >= ? AND created_at <= ?", query.StartTimestamp, query.EndTimestamp)
	if query.Username != "" {
		base = base.Where("username = ?", query.Username)
	}
	if query.ModelName != "" {
		base = base.Where("model_name = ?", query.ModelName)
	}

	var rows []UserModelUsage
	err := base.Session(&gorm.Session{}).Select(`
		username,
		user_id,
		model_name,
		SUM(CASE WHEN type = ? THEN 1 ELSE 0 END) AS request_count,
		SUM(CASE WHEN type = ? THEN prompt_tokens ELSE 0 END) AS prompt_tokens,
		SUM(CASE WHEN type = ? THEN completion_tokens ELSE 0 END) AS completion_tokens,
		SUM(CASE WHEN type = ? THEN prompt_tokens + completion_tokens ELSE 0 END) AS total_tokens,
		SUM(CASE WHEN type = ? THEN quota WHEN type = ? THEN -quota ELSE 0 END) AS quota,
		COALESCE(AVG(CASE WHEN type = ? THEN use_time END), 0) AS average_use_time`,
		LogTypeConsume,
		LogTypeConsume,
		LogTypeConsume,
		LogTypeConsume,
		LogTypeConsume,
		LogTypeRefund,
		LogTypeConsume,
	).
		Where("model_name != ?", "").
		Group("username, user_id, model_name").
		Order("quota DESC, request_count DESC, model_name ASC").
		Offset(offset).
		Limit(limit).
		Scan(&rows).Error
	if err != nil {
		return nil, 0, UserModelUsageSummary{}, err
	}

	var groupKeys []struct {
		UserID    int
		Username  string
		ModelName string
	}
	if err := base.Session(&gorm.Session{}).
		Select("username, user_id, model_name").
		Where("model_name != ?", "").
		Group("username, user_id, model_name").
		Scan(&groupKeys).Error; err != nil {
		return nil, 0, UserModelUsageSummary{}, err
	}

	users := make(map[int]struct{})
	models := make(map[string]struct{})
	summary := UserModelUsageSummary{}
	for _, key := range groupKeys {
		users[key.UserID] = struct{}{}
		models[key.ModelName] = struct{}{}
	}
	if err := base.Session(&gorm.Session{}).Select(`
		SUM(CASE WHEN type = ? THEN 1 ELSE 0 END) AS request_count,
		SUM(CASE WHEN type = ? THEN prompt_tokens ELSE 0 END) AS prompt_tokens,
		SUM(CASE WHEN type = ? THEN completion_tokens ELSE 0 END) AS completion_tokens,
		SUM(CASE WHEN type = ? THEN prompt_tokens + completion_tokens ELSE 0 END) AS total_tokens,
		SUM(CASE WHEN type = ? THEN quota WHEN type = ? THEN -quota ELSE 0 END) AS quota`,
		LogTypeConsume,
		LogTypeConsume,
		LogTypeConsume,
		LogTypeConsume,
		LogTypeConsume,
		LogTypeRefund,
	).Where("model_name != ?", "").Scan(&summary).Error; err != nil {
		return nil, 0, UserModelUsageSummary{}, err
	}
	summary.UserCount = int64(len(users))
	summary.ModelCount = int64(len(models))
	return rows, int64(len(groupKeys)), summary, nil
}

// don't use iota, avoid change log type value
const (
	LogTypeUnknown = 0
	LogTypeTopup   = 1
	LogTypeConsume = 2
	LogTypeManage  = 3
	LogTypeSystem  = 4
	LogTypeError   = 5
	LogTypeRefund  = 6
	LogTypeLogin   = 7
)

func ensureLogRequestId(log *Log) {
	if log != nil && log.RequestId == "" {
		log.RequestId = common.NewRequestId()
	}
}

func createLog(log *Log) error {
	ensureLogRequestId(log)
	return LOG_DB.Create(log).Error
}

func clickHouseLogOrder(prefix string) string {
	return prefix + "created_at desc, " + prefix + "request_id desc"
}

func assignDisplayLogIds(logs []*Log, startIdx int) {
	for i := range logs {
		logs[i].Id = startIdx + i + 1
	}
}

func formatUserLogs(logs []*Log, startIdx int) {
	adminOnlyFields := []string{
		"provider_cost_usd",
		"provider_cost_known",
		"provider_is_byok",
		"provider_cost_scope",
		"gross_margin_usd",
		"gross_margin_known",
		"gross_margin_basis",
		"settlement_error",
		"quota_saturation",
		"upstream_cost",
		"upstream_actual_cost",
	}
	for i := range logs {
		logs[i].ChannelName = ""
		var otherMap map[string]interface{}
		otherMap, _ = common.StrToMap(logs[i].Other)
		if otherMap != nil {
			// Remove admin-only debug fields.
			delete(otherMap, "admin_info")
			// Remove operation-audit details (operator/route info), admin-only.
			delete(otherMap, "audit_info")
			// Defense in depth for legacy or malformed records that wrote
			// confidential billing fields outside admin_info.
			for _, field := range adminOnlyFields {
				delete(otherMap, field)
			}
		}
		logs[i].Other = common.MapToJsonStr(otherMap)
	}
	assignDisplayLogIds(logs, startIdx)
}

func GetLogByTokenId(tokenId int) (logs []*Log, err error) {
	order := "id desc"
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		order = clickHouseLogOrder("")
	}
	err = LOG_DB.Model(&Log{}).Where("token_id = ?", tokenId).Order(order).Limit(common.MaxRecentItems).Find(&logs).Error
	formatUserLogs(logs, 0)
	return logs, err
}

func RecordLog(userId int, logType int, content string) {
	if logType == LogTypeConsume && !common.LogConsumeEnabled {
		return
	}
	username, _ := GetUsernameById(userId, false)
	log := &Log{
		UserId:    userId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      logType,
		Content:   content,
	}
	err := createLog(log)
	if err != nil {
		common.SysLog("failed to record log: " + err.Error())
	}
}

// RecordLogWithAdminInfo 记录操作日志，并将管理员相关信息存入 Other.admin_info，
func RecordLogWithAdminInfo(userId int, logType int, content string, adminInfo map[string]interface{}) {
	if logType == LogTypeConsume && !common.LogConsumeEnabled {
		return
	}
	username, _ := GetUsernameById(userId, false)
	log := &Log{
		UserId:    userId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      logType,
		Content:   content,
	}
	if len(adminInfo) > 0 {
		other := map[string]interface{}{
			"admin_info": adminInfo,
		}
		log.Other = common.MapToJsonStr(other)
	}
	if err := createLog(log); err != nil {
		common.SysLog("failed to record log: " + err.Error())
	}
}

// buildOpField 构建语言无关的操作描述（写入 Other.op）。
// 前端依据 action(稳定操作标识) + params(结构化参数) 在渲染期用 i18n 本地化展示，
// 因此不在数据库中存储自然语言句子。
func buildOpField(action string, params map[string]interface{}) map[string]interface{} {
	op := map[string]interface{}{
		"action": action,
	}
	if len(params) > 0 {
		op["params"] = params
	}
	return op
}

// RecordLoginLog 记录用户登录成功的审计日志（type=LogTypeLogin）。
// username 由调用方传入（登录流程已持有用户对象），避免额外的数据库查询。
// content 为英文兜底文本（用于导出）；action+params 供前端本地化渲染。
// extra 可携带 login_method、user_agent 等附加信息（普通用户可见）。
func RecordLoginLog(userId int, username string, content string, ip string, action string, params map[string]interface{}, extra map[string]interface{}) {
	other := map[string]interface{}{}
	for k, v := range extra {
		other[k] = v
	}
	other["op"] = buildOpField(action, params)
	log := &Log{
		UserId:    userId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      LogTypeLogin,
		Content:   content,
		Ip:        ip,
		Other:     common.MapToJsonStr(other),
	}
	if err := createLog(log); err != nil {
		common.SysLog("failed to record login log: " + err.Error())
	}
}

// RecordOperationAuditLog 记录管理/高危操作审计日志（type=LogTypeManage）。
// logUserId 为日志归属者，管理审计日志应归属实际操作者；目标资源/用户放入
// action params。username 内部按 logUserId 查询。content 为英文兜底文本（供导出使用）。
// action+params 写入 Other.op，供前端本地化渲染（普通用户可见，不含敏感信息）。
// adminInfo 存放操作者身份（写入 Other.admin_info，普通用户查询时剥离）；
// auditInfo 存放路由/方法/结果等中间件兜底信息（写入 Other.audit_info，普通用户查询时剥离）。
func RecordOperationAuditLog(logUserId int, content string, ip string, action string, params map[string]interface{}, adminInfo map[string]interface{}, auditInfo map[string]interface{}) {
	username, _ := GetUsernameById(logUserId, false)
	other := map[string]interface{}{
		"op": buildOpField(action, params),
	}
	if len(adminInfo) > 0 {
		other["admin_info"] = adminInfo
	}
	if len(auditInfo) > 0 {
		other["audit_info"] = auditInfo
	}
	log := &Log{
		UserId:    logUserId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      LogTypeManage,
		Content:   content,
		Ip:        ip,
		Other:     common.MapToJsonStr(other),
	}
	if err := createLog(log); err != nil {
		common.SysLog("failed to record operation audit log: " + err.Error())
	}
}

func RecordTopupLog(userId int, content string, callerIp string, paymentMethod string, callbackPaymentMethod string) {
	username, _ := GetUsernameById(userId, false)
	adminInfo := map[string]interface{}{
		"server_ip":               common.GetIp(),
		"node_name":               common.NodeName,
		"caller_ip":               callerIp,
		"payment_method":          paymentMethod,
		"callback_payment_method": callbackPaymentMethod,
		"version":                 common.Version,
	}
	other := map[string]interface{}{
		"admin_info": adminInfo,
	}
	log := &Log{
		UserId:    userId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      LogTypeTopup,
		Content:   content,
		Ip:        callerIp,
		Other:     common.MapToJsonStr(other),
	}
	err := createLog(log)
	if err != nil {
		common.SysLog("failed to record topup log: " + err.Error())
	}
}

func RecordErrorLog(c *gin.Context, userId int, channelId int, modelName string, tokenName string, content string, tokenId int, useTimeSeconds int,
	isStream bool, group string, other map[string]interface{}) {
	logger.LogInfo(c, fmt.Sprintf("record error log: userId=%d, channelId=%d, modelName=%s, tokenName=%s, content=%s", userId, channelId, modelName, tokenName, common.LocalLogPreview(content)))
	username := c.GetString("username")
	requestId := c.GetString(common.RequestIdKey)
	upstreamRequestId := c.GetString(common.UpstreamRequestIdKey)
	otherStr := common.MapToJsonStr(other)
	// 判断是否需要记录 IP
	needRecordIp := false
	if settingMap, err := GetUserSetting(userId, false); err == nil {
		if settingMap.RecordIpLog {
			needRecordIp = true
		}
	}
	log := &Log{
		UserId:           userId,
		Username:         username,
		CreatedAt:        common.GetTimestamp(),
		Type:             LogTypeError,
		Content:          content,
		PromptTokens:     0,
		CompletionTokens: 0,
		TokenName:        tokenName,
		ModelName:        modelName,
		Quota:            0,
		ChannelId:        channelId,
		TokenId:          tokenId,
		UseTime:          useTimeSeconds,
		IsStream:         isStream,
		Group:            group,
		Ip: func() string {
			if needRecordIp {
				return c.ClientIP()
			}
			return ""
		}(),
		RequestId:         requestId,
		UpstreamRequestId: upstreamRequestId,
		Other:             otherStr,
	}
	err := createLog(log)
	if err != nil {
		logger.LogError(c, "failed to record log: "+err.Error())
	}
}

type RecordConsumeLogParams struct {
	ChannelId        int                    `json:"channel_id"`
	PromptTokens     int                    `json:"prompt_tokens"`
	CompletionTokens int                    `json:"completion_tokens"`
	ModelName        string                 `json:"model_name"`
	TokenName        string                 `json:"token_name"`
	Quota            int                    `json:"quota"`
	Content          string                 `json:"content"`
	TokenId          int                    `json:"token_id"`
	UseTimeSeconds   int                    `json:"use_time_seconds"`
	IsStream         bool                   `json:"is_stream"`
	Group            string                 `json:"group"`
	TaskId           string                 `json:"task_id"`
	Other            map[string]interface{} `json:"other"`
}

func RecordConsumeLog(c *gin.Context, userId int, params RecordConsumeLogParams) {
	if !common.LogConsumeEnabled {
		return
	}
	if params.Other == nil {
		params.Other = make(map[string]interface{})
	}
	if _, exists := params.Other["quota_per_unit"]; !exists {
		params.Other["quota_per_unit"] = common.QuotaPerUnit
	}
	logger.LogInfo(c, fmt.Sprintf("record consume log: userId=%d, params=%s", userId, common.GetJsonString(params)))
	username := c.GetString("username")
	requestId := c.GetString(common.RequestIdKey)
	upstreamRequestId := c.GetString(common.UpstreamRequestIdKey)
	createdAt := common.GetTimestamp()
	otherStr := common.MapToJsonStr(params.Other)
	// 判断是否需要记录 IP
	needRecordIp := false
	if settingMap, err := GetUserSetting(userId, false); err == nil {
		if settingMap.RecordIpLog {
			needRecordIp = true
		}
	}
	log := &Log{
		UserId:           userId,
		Username:         username,
		CreatedAt:        createdAt,
		Type:             LogTypeConsume,
		Content:          params.Content,
		PromptTokens:     params.PromptTokens,
		CompletionTokens: params.CompletionTokens,
		TokenName:        params.TokenName,
		ModelName:        params.ModelName,
		Quota:            params.Quota,
		ChannelId:        params.ChannelId,
		TokenId:          params.TokenId,
		UseTime:          params.UseTimeSeconds,
		IsStream:         params.IsStream,
		Group:            params.Group,
		Ip: func() string {
			if needRecordIp {
				return c.ClientIP()
			}
			return ""
		}(),
		RequestId:         requestId,
		UpstreamRequestId: upstreamRequestId,
		TaskId:            params.TaskId,
		Other:             otherStr,
	}
	err := createLog(log)
	if err != nil {
		logger.LogError(c, "failed to record log: "+err.Error())
	}
	if common.DataExportEnabled {
		LogQuotaData(QuotaDataLogParams{
			UserID:    userId,
			Username:  username,
			ModelName: params.ModelName,
			Quota:     params.Quota,
			CreatedAt: createdAt,
			TokenUsed: params.PromptTokens + params.CompletionTokens,
			UseGroup:  params.Group,
			TokenID:   params.TokenId,
			ChannelID: params.ChannelId,
			NodeName:  common.NodeName,
		})
	}
}

type RecordTaskBillingLogParams struct {
	UserId           int
	LogType          int
	Content          string
	ChannelId        int
	ModelName        string
	Quota            int
	PromptTokens     int
	CompletionTokens int
	TotalTokens      int
	TokenId          int
	Group            string
	TaskId           string
	Other            map[string]interface{}
	NodeName         string // 任务发起节点；为空时回退当前节点
}

func RecordTaskBillingLog(params RecordTaskBillingLogParams) {
	if params.LogType == LogTypeConsume && !common.LogConsumeEnabled {
		return
	}
	username, _ := GetUsernameById(params.UserId, false)
	tokenName := ""
	if params.TokenId > 0 {
		if token, err := GetTokenById(params.TokenId); err == nil {
			tokenName = token.Name
		}
	}
	createdAt := common.GetTimestamp()
	log := &Log{
		UserId:           params.UserId,
		Username:         username,
		CreatedAt:        createdAt,
		Type:             params.LogType,
		Content:          params.Content,
		PromptTokens:     params.PromptTokens,
		CompletionTokens: params.CompletionTokens,
		TokenName:        tokenName,
		ModelName:        params.ModelName,
		Quota:            params.Quota,
		ChannelId:        params.ChannelId,
		TokenId:          params.TokenId,
		Group:            params.Group,
		TaskId:           params.TaskId,
		Other:            common.MapToJsonStr(params.Other),
	}
	err := createLog(log)
	if err != nil {
		common.SysLog("failed to record task billing log: " + err.Error())
	}
	if params.LogType == LogTypeConsume && common.DataExportEnabled {
		nodeName := params.NodeName
		if nodeName == "" {
			nodeName = common.NodeName
		}
		tokenUsed := params.TotalTokens
		if tokenUsed == 0 {
			tokenUsed = params.PromptTokens + params.CompletionTokens
		}
		LogQuotaData(QuotaDataLogParams{
			UserID:    params.UserId,
			Username:  username,
			ModelName: params.ModelName,
			Quota:     params.Quota,
			CreatedAt: createdAt,
			TokenUsed: tokenUsed,
			UseGroup:  params.Group,
			TokenID:   params.TokenId,
			ChannelID: params.ChannelId,
			NodeName:  nodeName,
		})
	}
}

// UpdateTaskConsumeLogDetails enriches the original async-task consumption
// log after the provider reaches a terminal state. Provider cost fields belong
// under admin_info so normal user log views strip them automatically.
// If promptTokens/completionTokens are > 0, the corresponding columns on the
// original consumption log are updated as well (previously they were always 0
// for async tasks like Seedance), so token aggregations surface those values.
func UpdateTaskConsumeLogDetails(taskID string, fields, adminFields map[string]interface{}, promptTokens, completionTokens int) error {
	if taskID == "" {
		return nil
	}
	var log Log
	if err := LOG_DB.Where(
		"task_id = ? AND type = ?",
		taskID,
		LogTypeConsume,
	).
		Order("created_at, request_id").
		First(&log).Error; err != nil {
		return err
	}
	other := make(map[string]interface{})
	if log.Other != "" {
		if err := common.UnmarshalJsonStr(log.Other, &other); err != nil {
			return err
		}
	}
	for key, value := range fields {
		other[key] = value
	}
	if len(adminFields) > 0 {
		adminInfo, _ := other["admin_info"].(map[string]interface{})
		if adminInfo == nil {
			adminInfo = make(map[string]interface{})
		}
		for key, value := range adminFields {
			adminInfo[key] = value
		}
		other["admin_info"] = adminInfo
	}
	payload, err := common.Marshal(other)
	if err != nil {
		return err
	}
	updates := map[string]interface{}{
		"other": string(payload),
	}
	if promptTokens > 0 {
		updates["prompt_tokens"] = promptTokens
	}
	if completionTokens > 0 {
		updates["completion_tokens"] = completionTokens
	}
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		parts := []string{"other = ?"}
		args := []interface{}{string(payload)}
		if promptTokens > 0 {
			parts = append(parts, "prompt_tokens = ?")
			args = append(args, promptTokens)
		}
		if completionTokens > 0 {
			parts = append(parts, "completion_tokens = ?")
			args = append(args, completionTokens)
		}
		args = append(args, log.RequestId, taskID, LogTypeConsume)
		return LOG_DB.Exec(
			"ALTER TABLE logs UPDATE "+strings.Join(parts, ", ")+" WHERE request_id = ? AND task_id = ? AND type = ? SETTINGS mutations_sync = 1",
			args...,
		).Error
	}
	if err := LOG_DB.Model(&Log{}).Where("id = ?", log.Id).Updates(updates).Error; err != nil {
		return err
	}
	if (promptTokens > 0 || completionTokens > 0) && common.DataExportEnabled {
		newTotal := int64(promptTokens) + int64(completionTokens)
		oldTotal := int64(log.PromptTokens) + int64(log.CompletionTokens)
		delta := int(newTotal - oldTotal)
		if delta != 0 {
			username := ""
			if log.UserId > 0 {
				username, _ = GetUsernameById(log.UserId, false)
			}
			LogQuotaData(QuotaDataLogParams{
				UserID:    log.UserId,
				Username:  username,
				ModelName: log.ModelName,
				CreatedAt: log.CreatedAt,
				TokenUsed: delta,
				UseGroup:  log.Group,
				TokenID:   log.TokenId,
				ChannelID: log.ChannelId,
				NodeName:  common.NodeName,
			})
		}
	}
	return nil
}

func GetAllLogs(logType int, startTimestamp int64, endTimestamp int64, modelName string, username string, tokenName string, startIdx int, num int, channel int, group string, requestId string, upstreamRequestId string) (logs []*Log, total int64, err error) {
	var tx *gorm.DB
	if logType == LogTypeUnknown {
		tx = LOG_DB
	} else {
		tx = LOG_DB.Where("logs.type = ?", logType)
	}

	if tx, err = applyExplicitLogTextFilter(tx, "logs.model_name", modelName); err != nil {
		return nil, 0, err
	}
	if tx, err = applyExplicitLogTextFilter(tx, "logs.username", username); err != nil {
		return nil, 0, err
	}
	if tokenName != "" {
		tx = tx.Where("logs.token_name = ?", tokenName)
	}
	if requestId != "" {
		tx = tx.Where("logs.request_id = ?", requestId)
	}
	if upstreamRequestId != "" {
		tx = tx.Where("logs.upstream_request_id = ?", upstreamRequestId)
	}
	if startTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", endTimestamp)
	}
	if channel != 0 {
		tx = tx.Where("logs.channel_id = ?", channel)
	}
	if group != "" {
		tx = tx.Where("logs."+logGroupCol+" = ?", group)
	}
	err = tx.Model(&Log{}).Count(&total).Error
	if err != nil {
		return nil, 0, err
	}
	order := "logs.created_at desc, logs.id desc"
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		order = clickHouseLogOrder("logs.")
	}
	err = tx.Order(order).Limit(num).Offset(startIdx).Find(&logs).Error
	if err != nil {
		return nil, 0, err
	}
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		assignDisplayLogIds(logs, startIdx)
	}

	channelIds := types.NewSet[int]()
	for _, log := range logs {
		if log.ChannelId != 0 {
			channelIds.Add(log.ChannelId)
		}
	}

	if channelIds.Len() > 0 {
		var channels []struct {
			Id   int    `gorm:"column:id"`
			Name string `gorm:"column:name"`
		}
		if common.MemoryCacheEnabled {
			// Cache get channel
			for _, channelId := range channelIds.Items() {
				if cacheChannel, err := CacheGetChannel(channelId); err == nil {
					channels = append(channels, struct {
						Id   int    `gorm:"column:id"`
						Name string `gorm:"column:name"`
					}{
						Id:   channelId,
						Name: cacheChannel.Name,
					})
				}
			}
		} else {
			// Bulk query channels from DB
			if err = DB.Table("channels").Select("id, name").Where("id IN ?", channelIds.Items()).Find(&channels).Error; err != nil {
				return logs, total, err
			}
		}
		channelMap := make(map[int]string, len(channels))
		for _, channel := range channels {
			channelMap[channel.Id] = channel.Name
		}
		for i := range logs {
			logs[i].ChannelName = channelMap[logs[i].ChannelId]
		}
	}

	return logs, total, err
}

func GetUpstreamRequestIDsByRequestIDs(requestIDs []string) (map[string]string, error) {
	result := make(map[string]string)
	if len(requestIDs) == 0 {
		return result, nil
	}
	var rows []struct {
		RequestId         string `gorm:"column:request_id"`
		UpstreamRequestId string `gorm:"column:upstream_request_id"`
	}
	query := LOG_DB.Model(&Log{}).
		Select("request_id, upstream_request_id").
		Where("request_id IN ? AND upstream_request_id <> ?", requestIDs, "")
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		query = query.Order(clickHouseLogOrder(""))
	} else {
		query = query.Order("created_at DESC, id DESC")
	}
	if err := query.Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		if _, exists := result[row.RequestId]; !exists {
			result[row.RequestId] = row.UpstreamRequestId
		}
	}
	return result, nil
}

func FindRequestIDsByUpstreamRequestIDKeyword(keyword string, limit int) ([]string, error) {
	keyword = strings.TrimSpace(keyword)
	if keyword == "" || limit <= 0 {
		return nil, nil
	}
	var requestIDs []string
	err := LOG_DB.Model(&Log{}).
		Distinct("request_id").
		Where("upstream_request_id LIKE ?", "%"+keyword+"%").
		Where("request_id <> ?", "").
		Limit(limit).
		Pluck("request_id", &requestIDs).Error
	return requestIDs, err
}

const logSearchCountLimit = 10000

func GetUserLogs(userId int, logType int, startTimestamp int64, endTimestamp int64, modelName string, tokenName string, startIdx int, num int, group string, requestId string, upstreamRequestId string) (logs []*Log, total int64, err error) {
	var tx *gorm.DB
	if logType == LogTypeUnknown {
		tx = LOG_DB.Where("logs.user_id = ?", userId)
	} else {
		tx = LOG_DB.Where("logs.user_id = ? and logs.type = ?", userId, logType)
	}

	if tx, err = applyExplicitLogTextFilter(tx, "logs.model_name", modelName); err != nil {
		return nil, 0, err
	}
	if tokenName != "" {
		tx = tx.Where("logs.token_name = ?", tokenName)
	}
	if requestId != "" {
		tx = tx.Where("logs.request_id = ?", requestId)
	}
	if upstreamRequestId != "" {
		tx = tx.Where("logs.upstream_request_id = ?", upstreamRequestId)
	}
	if startTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", endTimestamp)
	}
	if group != "" {
		tx = tx.Where("logs."+logGroupCol+" = ?", group)
	}
	err = tx.Model(&Log{}).Limit(logSearchCountLimit).Count(&total).Error
	if err != nil {
		common.SysError("failed to count user logs: " + err.Error())
		return nil, 0, errors.New("查询日志失败")
	}
	order := "logs.id desc"
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		order = clickHouseLogOrder("logs.")
	}
	err = tx.Order(order).Limit(num).Offset(startIdx).Find(&logs).Error
	if err != nil {
		common.SysError("failed to search user logs: " + err.Error())
		return nil, 0, errors.New("查询日志失败")
	}

	formatUserLogs(logs, startIdx)
	return logs, total, err
}

type Stat struct {
	Quota          int64   `json:"quota"`
	RequestCount   int64   `json:"request_count"`
	FailureCount   int64   `json:"failure_count"`
	FailureRate    float64 `json:"failure_rate"`
	PeakRpm        int64   `json:"peak_rpm"`
	PeakTpm        int64   `json:"peak_tpm"`
	TotalTokens    int64   `json:"total_tokens"`
	CacheHitTokens int64   `json:"cache_hit_tokens"`
	CacheHitRate   float64 `json:"cache_hit_rate"`
}

func cacheTokensSQLExpr() string {
	// 从日志 other JSON 字段里提取 cache_tokens（OpenAI 风格的缓存命中 token 数）。
	// 不同数据库 JSON 语法不同；不支持的库返回空字符串，由调用方回退为 0。
	switch {
	case common.UsingLogDatabase(common.DatabaseTypeMySQL):
		return "COALESCE(SUM(CASE WHEN type = " + strconv.Itoa(LogTypeConsume) + " AND other IS NOT NULL AND other <> '' THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(other, '$.cache_tokens')) AS SIGNED) ELSE 0 END), 0)"
	case common.UsingLogDatabase(common.DatabaseTypePostgreSQL):
		return "COALESCE(SUM(CASE WHEN type = " + strconv.Itoa(LogTypeConsume) + " AND other IS NOT NULL AND other <> '' THEN COALESCE((other::jsonb ->> 'cache_tokens')::bigint, 0) ELSE 0 END), 0)"
	case common.UsingLogDatabase(common.DatabaseTypeSQLite):
		return "COALESCE(SUM(CASE WHEN type = " + strconv.Itoa(LogTypeConsume) + " AND other IS NOT NULL AND other <> '' THEN COALESCE(CAST(json_extract(other, '$.cache_tokens') AS INTEGER), 0) ELSE 0 END), 0)"
	default:
		return ""
	}
}

func peakTimeBucketExpr() string {
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		return "intDiv(created_at, 60)"
	}
	return "created_at / 60"
}

func SumUsedQuota(logType int, startTimestamp int64, endTimestamp int64, modelName string, username string, tokenName string, channel int, group string) (stat Stat, err error) {
	// 构建带统一过滤条件的基础查询。
	base := LOG_DB.Table("logs")
	if logType != LogTypeUnknown {
		base = base.Where("type = ?", logType)
	}
	if base, err = applyExplicitLogTextFilter(base, "username", username); err != nil {
		return stat, err
	}
	if tokenName != "" {
		base = base.Where("token_name = ?", tokenName)
	}
	if startTimestamp != 0 {
		base = base.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		base = base.Where("created_at <= ?", endTimestamp)
	}
	if base, err = applyExplicitLogTextFilter(base, "model_name", modelName); err != nil {
		return stat, err
	}
	if channel != 0 {
		base = base.Where("channel_id = ?", channel)
	}
	if group != "" {
		base = base.Where(logGroupCol + " = ?", group)
	}

	// 1. 费用（消费为正，退款为负）。
	quotaTx := base.Session(&gorm.Session{}).Select(
		"COALESCE(SUM(CASE WHEN type = ? THEN quota WHEN type = ? THEN -quota ELSE 0 END), 0) AS quota",
		LogTypeConsume, LogTypeRefund,
	)
	if err := quotaTx.Scan(&stat).Error; err != nil {
		common.SysError("failed to query log quota stat: " + err.Error())
		return stat, errors.New("查询统计数据失败")
	}

	// 2. 请求数、失败数、总 Token、缓存命中 Token。
	cacheExpr := cacheTokensSQLExpr()
	selects := []string{
		"COUNT(CASE WHEN type = ? THEN 1 END) AS request_count",
		"COUNT(CASE WHEN type = ? THEN 1 END) AS failure_count",
		"COALESCE(SUM(CASE WHEN type = ? THEN prompt_tokens + completion_tokens ELSE 0 END), 0) AS total_tokens",
	}
	if cacheExpr != "" {
		selects = append(selects, cacheExpr+" AS cache_hit_tokens")
	} else {
		selects = append(selects, "0 AS cache_hit_tokens")
	}
	summaryTx := base.Session(&gorm.Session{}).Select(
		strings.Join(selects, ", "),
		LogTypeConsume, LogTypeError, LogTypeConsume,
	)
	summaryTx = summaryTx.Where("type IN ?", []int{LogTypeConsume, LogTypeError})
	if err := summaryTx.Scan(&stat).Error; err != nil {
		common.SysError("failed to query log summary stat: " + err.Error())
		return stat, errors.New("查询统计数据失败")
	}

	// 3. 峰值 RPM / TPM：按分钟桶聚合后取最大值。
	//    注意：子查询 peakSub 本身已经从 base 继承了全部过滤条件（时间范围、
	//    type、用户、模型、渠道、group 等），外层不能再从 base 开始加 WHERE，
	//    否则会在 (subquery) AS peak 外层错误地引用不存在的 created_at 等列，
	//    这在 PostgreSQL 上会报 SQLSTATE 42703。
	bucketExpr := peakTimeBucketExpr()
	peakSub := base.Session(&gorm.Session{}).Select(
		bucketExpr+" AS minute_bucket, COUNT(*) AS rpm, COALESCE(SUM(prompt_tokens + completion_tokens), 0) AS tpm",
	).Where("type = ?", LogTypeConsume).Group(bucketExpr)
	peak := struct {
		PeakRpm int64 `gorm:"column:peak_rpm"`
		PeakTpm int64 `gorm:"column:peak_tpm"`
	}{}
	if err := LOG_DB.Table("(?) AS peak", peakSub).Select(
		"COALESCE(MAX(rpm), 0) AS peak_rpm, COALESCE(MAX(tpm), 0) AS peak_tpm",
	).Scan(&peak).Error; err != nil {
		common.SysError("failed to query log peak stat: " + err.Error())
		return stat, errors.New("查询统计数据失败")
	}
	stat.PeakRpm = peak.PeakRpm
	stat.PeakTpm = peak.PeakTpm

	// 4. 派生比率。
	totalRequests := stat.RequestCount + stat.FailureCount
	if totalRequests > 0 {
		stat.FailureRate = float64(stat.FailureCount) / float64(totalRequests)
	}
	if stat.TotalTokens > 0 {
		stat.CacheHitRate = float64(stat.CacheHitTokens) / float64(stat.TotalTokens)
	}

	return stat, nil
}

func SumUsedToken(logType int, startTimestamp int64, endTimestamp int64, modelName string, username string, tokenName string) (token int) {
	tx := LOG_DB.Table("logs").Select("COALESCE(sum(prompt_tokens), 0) + COALESCE(sum(completion_tokens), 0)")
	if username != "" {
		tx = tx.Where("username = ?", username)
	}
	if tokenName != "" {
		tx = tx.Where("token_name = ?", tokenName)
	}
	if startTimestamp != 0 {
		tx = tx.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("created_at <= ?", endTimestamp)
	}
	if modelName != "" {
		tx = tx.Where("model_name = ?", modelName)
	}
	tx.Where("type = ?", LogTypeConsume).Scan(&token)
	return token
}

func CountOldLog(ctx context.Context, targetTimestamp int64) (int64, error) {
	var total int64
	if err := LOG_DB.WithContext(ctx).Model(&Log{}).Where("created_at < ?", targetTimestamp).Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func DeleteOldLogBatch(ctx context.Context, targetTimestamp int64, limit int) (int64, error) {
	if limit <= 0 {
		limit = 100
	}
	if nil != ctx.Err() {
		return 0, ctx.Err()
	}

	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		// ClickHouse DELETE is a heavy mutation that rewrites data parts, so
		// per-batch mutations would be pathologically slow. Remove all matching
		// rows in a single synchronous mutation regardless of limit; the reported
		// count lets the caller's progress loop complete in one pass.
		total, err := CountOldLog(ctx, targetTimestamp)
		if err != nil {
			return 0, err
		}
		if total == 0 {
			return 0, nil
		}
		if err := LOG_DB.WithContext(ctx).Exec(
			"ALTER TABLE logs DELETE WHERE created_at < ? SETTINGS mutations_sync = 1",
			targetTimestamp,
		).Error; err != nil {
			return 0, err
		}
		return total, nil
	}

	result := LOG_DB.WithContext(ctx).Where("created_at < ?", targetTimestamp).Limit(limit).Delete(&Log{})
	if nil != result.Error {
		return 0, result.Error
	}
	return result.RowsAffected, nil
}
