package dto

import (
	"encoding/json"
)

type TaskError struct {
	Code       string `json:"code"`
	Message    string `json:"message"`
	Data       any    `json:"data"`
	StatusCode int    `json:"-"`
	LocalError bool   `json:"-"`
	Error      error  `json:"-"`
}

type TaskData interface {
	SunoDataResponse | []SunoDataResponse | string | any
}

const TaskSuccessCode = "success"

type TaskResponse[T TaskData] struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Data    T      `json:"data"`
}

func (t *TaskResponse[T]) IsSuccess() bool {
	return t.Code == TaskSuccessCode
}

type TaskDto struct {
	ID                   int64             `json:"id"`
	CreatedAt            int64             `json:"created_at"`
	UpdatedAt            int64             `json:"updated_at"`
	TaskID               string            `json:"task_id"`
	Platform             string            `json:"platform"`
	UserId               int               `json:"user_id"`
	Group                string            `json:"group"`
	ChannelId            int               `json:"channel_id"`
	Quota                int               `json:"quota"`
	Action               string            `json:"action"`
	Status               string            `json:"status"`
	FailReason           string            `json:"fail_reason"`
	ResultURL            string            `json:"result_url,omitempty"` // 任务结果 URL（视频地址等）
	SubmitTime           int64             `json:"submit_time"`
	StartTime            int64             `json:"start_time"`
	FinishTime           int64             `json:"finish_time"`
	Progress             string            `json:"progress"`
	Properties           any               `json:"properties"`
	Username             string            `json:"username,omitempty"`
	Data                 json.RawMessage   `json:"data"`
	AdminUpstreamRequest any               `json:"admin_upstream_request,omitempty"`
	AdminBilling         *TaskAdminBilling `json:"admin_billing,omitempty"`
}

type TaskAdminBilling struct {
	Quota                 int    `json:"quota"`
	RefundStatus          string `json:"refund_status,omitempty"`
	RefundQuota           int    `json:"refund_quota,omitempty"`
	SettlementStatus      string `json:"settlement_status,omitempty"`
	SettlementTargetQuota int    `json:"settlement_target_quota,omitempty"`
	SettlementError       string `json:"settlement_error,omitempty"`
	BillingAuditStatus    string `json:"billing_audit_status,omitempty"`
	BillingAuditError     string `json:"billing_audit_error,omitempty"`
}

// AdminTaskBilling is the unit-safe billing projection for the new
// administrator task workspace. Monetary fields are null when the task does
// not have a valid submission-time quota conversion snapshot.
type AdminTaskBilling struct {
	RefundStatus        string   `json:"refund_status,omitempty"`
	RefundedUSD         *float64 `json:"refunded_usd"`
	SettlementStatus    string   `json:"settlement_status,omitempty"`
	SettlementTargetUSD *float64 `json:"settlement_target_usd"`
	SettlementError     string   `json:"settlement_error,omitempty"`
	BillingAuditStatus  string   `json:"billing_audit_status,omitempty"`
	BillingAuditError   string   `json:"billing_audit_error,omitempty"`
}

// AdminTaskListDto is the deliberately narrow projection returned by the
// administrator task list. Task provider payloads, result URLs, and private
// upstream request snapshots must never be added to this response.
type AdminTaskListDto struct {
	ID            int64             `json:"id"`
	CreatedAt     int64             `json:"created_at"`
	UpdatedAt     int64             `json:"updated_at"`
	TaskID        string            `json:"task_id"`
	TaskType      string            `json:"task_type"`
	Platform      string            `json:"platform"`
	Model         string            `json:"model"`
	PromptPreview string            `json:"prompt_preview,omitempty"`
	UserId        int               `json:"user_id"`
	Username      string            `json:"username,omitempty"`
	Group         string            `json:"group"`
	ChannelId     int               `json:"channel_id"`
	CostUSD       *float64          `json:"cost_usd"`
	Action        string            `json:"action"`
	Status        string            `json:"status"`
	FailureReason string            `json:"fail_reason,omitempty"`
	SubmitTime    int64             `json:"submit_time"`
	StartTime     int64             `json:"start_time"`
	FinishTime    int64             `json:"finish_time"`
	Progress      string            `json:"progress"`
	AdminBilling  *AdminTaskBilling `json:"admin_billing,omitempty"`
}

type FetchReq struct {
	IDs []string `json:"ids"`
}

type AdminTaskRefundRequest struct {
	InternalID int64 `json:"internal_id"`
}
