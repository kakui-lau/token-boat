package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPaymentCallbackEventsDetectDuplicatesAndReportOutcomes(t *testing.T) {
	truncateTables(t)

	first := &PaymentCallbackEvent{
		Provider:           PaymentProviderStripe,
		EventID:            "evt-finance-1",
		TradeNo:            "order-finance-1",
		VerificationStatus: PaymentCallbackVerificationVerified,
		ProcessingStatus:   PaymentCallbackStatusProcessed,
		ReceivedAt:         100,
		CompletedAt:        101,
		HTTPStatus:         200,
	}
	require.NoError(t, CreatePaymentCallbackEvent(first))
	require.NoError(t, FinishPaymentCallbackEvent(first))
	assert.False(t, first.Duplicate)

	duplicate := &PaymentCallbackEvent{
		Provider:           PaymentProviderStripe,
		EventID:            first.EventID,
		TradeNo:            first.TradeNo,
		VerificationStatus: PaymentCallbackVerificationVerified,
		ProcessingStatus:   PaymentCallbackStatusFailed,
		ReceivedAt:         102,
		CompletedAt:        103,
		HTTPStatus:         200,
		ErrorMessage:       "database unavailable",
	}
	require.NoError(t, CreatePaymentCallbackEvent(duplicate))
	require.NoError(t, FinishPaymentCallbackEvent(duplicate))
	assert.True(t, duplicate.Duplicate)

	rows, total, err := ListAdminPaymentCallbackEvents(AdminPaymentCallbackFilter{
		Status:  PaymentCallbackStatusFailed,
		Keyword: "order-finance",
		StartAt: 100,
		EndAt:   103,
	}, 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, rows, 1)
	assert.True(t, rows[0].Duplicate)
	assert.Equal(t, "database unavailable", rows[0].ErrorMessage)

	summary, err := GetPaymentCallbackSummary(100, 103)
	require.NoError(t, err)
	assert.Equal(t, int64(2), summary.TotalCount)
	assert.Equal(t, int64(1), summary.ProcessedCount)
	assert.Equal(t, int64(1), summary.FailedCount)
	assert.Equal(t, int64(1), summary.DuplicateCount)
}

func TestFinanceAlertLifecycleCoalescesAndReopensRecurringFindings(t *testing.T) {
	truncateTables(t)

	input := FinanceAlertInput{
		Fingerprint: "negative_wallet:user:42",
		Source:      FinanceAlertSourceBalance,
		Severity:    FinanceAlertSeverityCritical,
		Title:       "Negative user wallet balance",
		Message:     "User #42 has a negative balance.",
		EntityType:  "user",
		EntityID:    "42",
	}
	alert, err := UpsertFinanceAlert(input)
	require.NoError(t, err)
	assert.Equal(t, FinanceAlertStatusOpen, alert.Status)
	assert.Equal(t, int64(1), alert.OccurrenceCount)

	alert, err = UpdateFinanceAlertStatus(alert.ID, FinanceAlertStatusAcknowledged, 7, "")
	require.NoError(t, err)
	assert.Equal(t, FinanceAlertStatusAcknowledged, alert.Status)
	assert.Equal(t, 7, alert.AcknowledgedBy)

	alert, err = UpsertFinanceAlert(input)
	require.NoError(t, err)
	assert.Equal(t, FinanceAlertStatusAcknowledged, alert.Status)
	assert.Equal(t, int64(2), alert.OccurrenceCount)

	alert, err = UpdateFinanceAlertStatus(alert.ID, FinanceAlertStatusResolved, 7, "balance corrected")
	require.NoError(t, err)
	assert.Equal(t, FinanceAlertStatusResolved, alert.Status)
	assert.Equal(t, "balance corrected", alert.ResolutionNote)

	alert, err = UpsertFinanceAlert(input)
	require.NoError(t, err)
	assert.Equal(t, FinanceAlertStatusOpen, alert.Status)
	assert.Equal(t, int64(3), alert.OccurrenceCount)
	assert.Zero(t, alert.ResolvedAt)
	assert.Empty(t, alert.ResolutionNote)
}

func TestFinanceTrendAndUserFundsUseExternalRevenueAndCurrentBalances(t *testing.T) {
	truncateTables(t)

	const daySeconds int64 = 24 * 60 * 60
	start := int64(1_900_000_000)
	start -= start % daySeconds
	user := &User{
		Username:  "finance-detail-user",
		Password:  "password",
		AffCode:   "finance-detail-aff",
		Quota:     100,
		AffQuota:  50,
		UsedQuota: 25,
	}
	require.NoError(t, DB.Create(user).Error)
	plan := &SubscriptionPlan{Title: "Finance plan", PriceAmount: 9.9, Enabled: true}
	require.NoError(t, DB.Create(plan).Error)
	require.NoError(t, DB.Create(&UserSubscription{
		UserId:      user.Id,
		PlanId:      plan.Id,
		AmountTotal: 1_000,
		AmountUsed:  250,
		Status:      "active",
		StartTime:   start,
		EndTime:     start + 10*daySeconds,
	}).Error)
	require.NoError(t, DB.Create(&[]TopUp{
		{
			UserId:          user.Id,
			TradeNo:         "finance-stripe-success",
			PaymentProvider: PaymentProviderStripe,
			PaymentMethod:   PaymentMethodStripe,
			Money:           2,
			Status:          common.TopUpStatusSuccess,
			CreateTime:      start + 100,
			CompleteTime:    start + 101,
		},
		{
			UserId:          user.Id,
			TradeNo:         "finance-balance-success",
			PaymentProvider: PaymentProviderBalance,
			PaymentMethod:   PaymentMethodBalance,
			Money:           6,
			Status:          common.TopUpStatusSuccess,
			CreateTime:      start + 200,
			CompleteTime:    start + 201,
		},
		{
			UserId:          user.Id,
			TradeNo:         "finance-pending",
			PaymentProvider: PaymentProviderStripe,
			Money:           3,
			Status:          common.TopUpStatusPending,
			CreateTime:      start + daySeconds + 100,
		},
	}).Error)
	require.NoError(t, DB.Create(&Redemption{
		Name:       "finance-user-credit",
		Key:        "finance-user-credit-key",
		Status:     common.RedemptionCodeStatusUsed,
		Quota:      500,
		UsedUserId: user.Id,
	}).Error)

	report, err := GetFinanceTrend(start, start+2*daySeconds)
	require.NoError(t, err)
	require.Len(t, report.Points, 3)
	assert.Equal(t, int64(2), report.Points[0].SuccessOrders)
	assert.Equal(t, float64(2), report.Points[0].SuccessAmount)
	assert.Equal(t, int64(1), report.Points[1].PendingOrders)

	detail, err := GetFinanceUserDetail(user.Id)
	require.NoError(t, err)
	assert.Equal(t, int64(750), detail.ActiveSubscriptionQuota)
	assert.Equal(t, int64(900), detail.TotalAvailableQuota)
	assert.Equal(t, int64(1), detail.Funding.SuccessfulOrderCount)
	assert.Equal(t, float64(2), detail.Funding.SuccessfulAmount)
	assert.Equal(t, int64(500), detail.Funding.RedemptionQuota)
	require.Len(t, detail.Subscriptions, 1)
	assert.Equal(t, "Finance plan", detail.Subscriptions[0].PlanTitle)
	require.Len(t, detail.RecentOrders, 3)
}
