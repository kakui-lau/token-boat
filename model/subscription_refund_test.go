package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestRefundSubscriptionPreConsumeUpdatesUsageAndRecordInOneTransaction(t *testing.T) {
	setupUserUpdateTestState(t)
	require.NoError(t, DB.AutoMigrate(&UserSubscription{}, &SubscriptionPreConsumeRecord{}))

	user := User{
		Id:       12,
		Username: "subscription-refund-user",
		Password: "password",
		Status:   common.UserStatusEnabled,
	}
	subscription := UserSubscription{
		Id:          12,
		UserId:      user.Id,
		PlanId:      1,
		Status:      "active",
		AmountTotal: 1000,
		AmountUsed:  600,
	}
	record := SubscriptionPreConsumeRecord{
		Id:                 12,
		RequestId:          "req-subscription-refund",
		UserId:             user.Id,
		UserSubscriptionId: subscription.Id,
		PreConsumed:        200,
		Status:             "consumed",
	}
	require.NoError(t, DB.Create(&user).Error)
	require.NoError(t, DB.Create(&subscription).Error)
	require.NoError(t, DB.Create(&record).Error)

	require.NoError(t, RefundSubscriptionPreConsume(record.RequestId))

	var gotSubscription UserSubscription
	require.NoError(t, DB.First(&gotSubscription, subscription.Id).Error)
	require.Equal(t, int64(400), gotSubscription.AmountUsed)
	var gotRecord SubscriptionPreConsumeRecord
	require.NoError(t, DB.First(&gotRecord, record.Id).Error)
	require.Equal(t, "refunded", gotRecord.Status)
}
