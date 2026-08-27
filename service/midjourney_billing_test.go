package service

import (
	"context"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRefundMidjourneyQuotaReversesAllAccountingOnce(t *testing.T) {
	truncate(t)
	const (
		userId    = 901
		tokenId   = 902
		channelId = 903
		quota     = 100
	)
	seedUser(t, userId, 900)
	seedToken(t, tokenId, userId, "mj-refund-token", 900)
	seedChannel(t, channelId)
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", userId).Update("used_quota", quota).Error)
	require.NoError(t, model.DB.Model(&model.Token{}).Where("id = ?", tokenId).Update("used_quota", quota).Error)
	require.NoError(t, model.DB.Model(&model.Channel{}).Where("id = ?", channelId).Update("used_quota", quota).Error)

	task := &model.Midjourney{
		UserId:        userId,
		MjId:          "mj-refund-task",
		Action:        "IMAGINE",
		Status:        "FAILURE",
		Progress:      "100%",
		ChannelId:     channelId,
		Quota:         quota,
		BillingSource: BillingSourceWallet,
		TokenId:       tokenId,
	}
	require.NoError(t, task.Insert())

	assert.True(t, RefundMidjourneyQuota(context.Background(), task, "upstream failed"))
	assert.True(t, RefundMidjourneyQuota(context.Background(), task, "duplicate poll"))

	var user model.User
	require.NoError(t, model.DB.First(&user, userId).Error)
	assert.Equal(t, 1000, user.Quota)
	assert.Equal(t, 0, user.UsedQuota)
	var token model.Token
	require.NoError(t, model.DB.First(&token, tokenId).Error)
	assert.Equal(t, 1000, token.RemainQuota)
	assert.Equal(t, 0, token.UsedQuota)
	var channel model.Channel
	require.NoError(t, model.DB.First(&channel, channelId).Error)
	assert.Equal(t, int64(0), channel.UsedQuota)
	var persisted model.Midjourney
	require.NoError(t, model.DB.First(&persisted, task.Id).Error)
	assert.Equal(t, 0, persisted.Quota)
	assert.Equal(t, model.MidjourneyRefundStatusCompleted, persisted.RefundStatus)
	assert.Equal(t, quota, persisted.RefundQuota)
}

func TestRefundMidjourneyQuotaRestoresSubscriptionCharge(t *testing.T) {
	truncate(t)
	const (
		userId         = 911
		tokenId        = 912
		channelId      = 913
		subscriptionId = 914
		quota          = 120
	)
	seedUser(t, userId, 500)
	seedToken(t, tokenId, userId, "mj-subscription-token", 880)
	seedChannel(t, channelId)
	seedSubscription(t, subscriptionId, userId, 1000, quota)
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", userId).Update("used_quota", quota).Error)
	require.NoError(t, model.DB.Model(&model.Token{}).Where("id = ?", tokenId).Update("used_quota", quota).Error)
	require.NoError(t, model.DB.Model(&model.Channel{}).Where("id = ?", channelId).Update("used_quota", quota).Error)

	task := &model.Midjourney{
		UserId:         userId,
		MjId:           "mj-subscription-refund",
		Action:         "IMAGINE",
		Status:         "FAILURE",
		Progress:       "100%",
		ChannelId:      channelId,
		Quota:          quota,
		BillingSource:  BillingSourceSubscription,
		SubscriptionId: subscriptionId,
		TokenId:        tokenId,
	}
	require.NoError(t, task.Insert())

	assert.True(t, RefundMidjourneyQuota(context.Background(), task, "upstream failed"))

	var user model.User
	require.NoError(t, model.DB.First(&user, userId).Error)
	assert.Equal(t, 500, user.Quota)
	assert.Equal(t, 0, user.UsedQuota)
	var subscription model.UserSubscription
	require.NoError(t, model.DB.First(&subscription, subscriptionId).Error)
	assert.Equal(t, int64(0), subscription.AmountUsed)
	var token model.Token
	require.NoError(t, model.DB.First(&token, tokenId).Error)
	assert.Equal(t, 1000, token.RemainQuota)
	assert.Equal(t, 0, token.UsedQuota)
}
