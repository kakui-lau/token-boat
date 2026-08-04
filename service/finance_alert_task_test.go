package service

import (
	"context"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestScanFinanceAlertsFindsAndAutoResolvesFinancialAnomalies(t *testing.T) {
	truncate(t)

	now := common.GetTimestamp()
	user := &model.User{
		Username: "finance-alert-user",
		Password: "password",
		AffCode:  "finance-alert-aff",
		Quota:    -10,
	}
	require.NoError(t, model.DB.Create(user).Error)
	require.NoError(t, model.DB.Create(&[]model.TopUp{
		{
			UserId:     user.Id,
			TradeNo:    "finance-alert-stale",
			Status:     common.TopUpStatusPending,
			CreateTime: now - int64(25*time.Hour/time.Second),
		},
		{
			UserId:       user.Id,
			TradeNo:      "finance-alert-incomplete",
			Status:       common.TopUpStatusSuccess,
			CreateTime:   now - 60,
			CompleteTime: 0,
		},
	}).Error)
	require.NoError(t, model.DB.Create(&model.PaymentCallbackEvent{
		Provider:           model.PaymentProviderStripe,
		EventID:            "evt-stale-callback",
		TradeNo:            "finance-alert-stale-callback",
		VerificationStatus: model.PaymentCallbackVerificationPending,
		ProcessingStatus:   model.PaymentCallbackStatusReceived,
		ReceivedAt:         now - int64(10*time.Minute/time.Second),
	}).Error)

	result, err := ScanFinanceAlerts(context.Background())
	require.NoError(t, err)
	assert.Equal(t, int64(1), result.NegativeBalanceCount)
	assert.Equal(t, int64(1), result.StalePendingCount)
	assert.Equal(t, int64(1), result.IncompleteOrderCount)
	assert.Equal(t, int64(1), result.StaleCallbackCount)

	alerts, total, err := model.ListFinanceAlerts(model.FinanceAlertFilter{
		Status: model.FinanceAlertStatusOpen,
	}, 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(4), total)
	require.Len(t, alerts, 4)

	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", user.Id).Update("quota", 100).Error)
	require.NoError(t, model.DB.Model(&model.TopUp{}).Where("trade_no = ?", "finance-alert-stale").Updates(map[string]any{
		"status":        common.TopUpStatusExpired,
		"complete_time": now,
	}).Error)
	require.NoError(t, model.DB.Model(&model.TopUp{}).Where("trade_no = ?", "finance-alert-incomplete").Update("complete_time", now).Error)

	result, err = ScanFinanceAlerts(context.Background())
	require.NoError(t, err)
	assert.Zero(t, result.NegativeBalanceCount)
	assert.Zero(t, result.StalePendingCount)
	assert.Zero(t, result.IncompleteOrderCount)
	assert.Zero(t, result.StaleCallbackCount)

	alerts, total, err = model.ListFinanceAlerts(model.FinanceAlertFilter{
		Status: model.FinanceAlertStatusResolved,
	}, 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(3), total)
	for _, alert := range alerts {
		assert.Positive(t, alert.ResolvedAt)
		assert.NotEmpty(t, alert.ResolutionNote)
	}

	alerts, total, err = model.ListFinanceAlerts(model.FinanceAlertFilter{
		Status: model.FinanceAlertStatusOpen,
		Source: model.FinanceAlertSourceCallback,
	}, 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, alerts, 1)
	assert.Equal(t, model.FinanceAlertCodeCallbackFailed, alerts[0].Code)
}
