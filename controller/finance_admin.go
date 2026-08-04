package controller

import (
	"errors"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func financeTimeRangeFromRequest(c *gin.Context) (int64, int64, error) {
	now := common.GetTimestamp()
	startAt := now - 30*24*60*60
	endAt := now
	if raw := c.Query("start_time"); raw != "" {
		value, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			return 0, 0, errors.New("invalid start_time")
		}
		startAt = value
	}
	if raw := c.Query("end_time"); raw != "" {
		value, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			return 0, 0, errors.New("invalid end_time")
		}
		endAt = value
	}
	return startAt, endAt, nil
}

func GetAdminFinanceTrend(c *gin.Context) {
	startAt, endAt, err := financeTimeRangeFromRequest(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	report, err := model.GetFinanceTrend(startAt, endAt)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, report)
}

func GetAdminPaymentCallbackEvents(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	startAt, endAt, err := financeTimeRangeFromRequest(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	rows, total, err := model.ListAdminPaymentCallbackEvents(model.AdminPaymentCallbackFilter{
		Provider: c.Query("provider"),
		Status:   c.Query("status"),
		Keyword:  c.Query("keyword"),
		StartAt:  startAt,
		EndAt:    endAt,
	}, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(rows)
	common.ApiSuccess(c, pageInfo)
}

func GetAdminPaymentCallbackSummary(c *gin.Context) {
	startAt, endAt, err := financeTimeRangeFromRequest(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	summary, err := model.GetPaymentCallbackSummary(startAt, endAt)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, summary)
}

func GetAdminFinanceUsers(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	rows, total, err := model.ListFinanceUsers(c.Query("keyword"), pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(rows)
	common.ApiSuccess(c, pageInfo)
}

func GetAdminFinanceUserDetail(c *gin.Context) {
	userID, err := strconv.Atoi(c.Param("id"))
	if err != nil || userID <= 0 {
		common.ApiErrorMsg(c, "invalid user id")
		return
	}
	detail, err := model.GetFinanceUserDetail(userID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		common.ApiErrorMsg(c, "user not found")
		return
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, detail)
}

func GetAdminFinanceAlerts(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	rows, total, err := model.ListFinanceAlerts(model.FinanceAlertFilter{
		Status:   c.Query("status"),
		Severity: c.Query("severity"),
		Source:   c.Query("source"),
		Keyword:  c.Query("keyword"),
	}, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(rows)
	common.ApiSuccess(c, pageInfo)
}

func GetAdminFinanceAlertSummary(c *gin.Context) {
	summary, err := model.GetFinanceAlertSummary()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, summary)
}

func ScanAdminFinanceAlerts(c *gin.Context) {
	result, err := service.ScanFinanceAlerts(c.Request.Context())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	operatorID := c.GetInt("id")
	model.RecordOperationAuditLog(operatorID, "Finance anomaly scan completed", c.ClientIP(), "finance.alert.scan", map[string]interface{}{
		"negative_balance_count": result.NegativeBalanceCount,
		"stale_pending_count":    result.StalePendingCount,
		"incomplete_order_count": result.IncompleteOrderCount,
		"stale_callback_count":   result.StaleCallbackCount,
	}, nil, nil)
	common.ApiSuccess(c, result)
}

type financeAlertStatusRequest struct {
	Note string `json:"note"`
}

func AcknowledgeAdminFinanceAlert(c *gin.Context) {
	updateAdminFinanceAlertStatus(c, model.FinanceAlertStatusAcknowledged)
}

func ResolveAdminFinanceAlert(c *gin.Context) {
	updateAdminFinanceAlertStatus(c, model.FinanceAlertStatusResolved)
}

func updateAdminFinanceAlertStatus(c *gin.Context, status string) {
	alertID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || alertID <= 0 {
		common.ApiErrorMsg(c, "invalid finance alert id")
		return
	}
	var request financeAlertStatusRequest
	if c.Request.ContentLength != 0 {
		if err := c.ShouldBindJSON(&request); err != nil {
			common.ApiErrorMsg(c, "invalid request")
			return
		}
	}
	request.Note = strings.TrimSpace(request.Note)
	alert, err := model.UpdateFinanceAlertStatus(alertID, status, c.GetInt("id"), request.Note)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	model.RecordOperationAuditLog(c.GetInt("id"), "Finance alert status updated", c.ClientIP(), "finance.alert.status", map[string]interface{}{
		"alert_id": alertID,
		"status":   status,
	}, nil, nil)
	common.ApiSuccess(c, alert)
}
