package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetAdminFinanceOverviewSeparatesCurrentLiabilityAndPeriodActivity(t *testing.T) {
	truncateTables(t)
	require.NoError(t, DB.AutoMigrate(&Redemption{}))

	now := common.GetTimestamp()
	users := []User{
		{Username: "finance-positive", Password: "password", AffCode: "finance-aff-positive", Quota: 1_000, UsedQuota: 600, AffQuota: 200},
		{Username: "finance-negative", Password: "password", AffCode: "finance-aff-negative", Quota: -100, UsedQuota: 300},
	}
	require.NoError(t, DB.Create(&users).Error)
	require.NoError(t, DB.Create(&[]UserSubscription{
		{UserId: users[0].Id, AmountTotal: 2_000, AmountUsed: 500, Status: "active", EndTime: now + 100},
		{UserId: users[0].Id, AmountTotal: 0, AmountUsed: 0, Status: "active", EndTime: now + 100},
		{UserId: users[1].Id, AmountTotal: 9_000, AmountUsed: 0, Status: "expired", EndTime: now - 100},
	}).Error)
	require.NoError(t, DB.Create(&[]TopUp{
		{UserId: users[0].Id, TradeNo: "stripe-success", PaymentProvider: PaymentProviderStripe, PaymentMethod: PaymentMethodStripe, Money: 10, Status: common.TopUpStatusSuccess, CreateTime: now - 50},
		{UserId: users[0].Id, TradeNo: "stripe-pending", PaymentProvider: PaymentProviderStripe, PaymentMethod: PaymentMethodStripe, Money: 5, Status: common.TopUpStatusPending, CreateTime: now - 40},
		{UserId: users[1].Id, TradeNo: "legacy-failed", PaymentMethod: "alipay", Money: 7, Status: common.TopUpStatusFailed, CreateTime: now - 30},
		{UserId: users[0].Id, TradeNo: "outside-period", PaymentProvider: PaymentProviderWaffo, PaymentMethod: PaymentMethodWaffo, Money: 20, Status: common.TopUpStatusSuccess, CreateTime: now - 500},
		{UserId: users[0].Id, TradeNo: "balance-subscription", PaymentProvider: PaymentProviderBalance, PaymentMethod: PaymentMethodBalance, Money: 4, Status: common.TopUpStatusSuccess, CreateTime: now - 25},
	}).Error)
	require.NoError(t, DB.Create(&[]SubscriptionOrder{
		{UserId: users[0].Id, TradeNo: "stripe-success", PaymentProvider: PaymentProviderStripe, PaymentMethod: PaymentMethodStripe, Money: 10, Status: common.TopUpStatusSuccess, CreateTime: now - 50},
		{UserId: users[0].Id, TradeNo: "balance-subscription", PaymentProvider: PaymentProviderBalance, PaymentMethod: PaymentMethodBalance, Money: 4, Status: common.TopUpStatusSuccess, CreateTime: now - 25},
	}).Error)
	require.NoError(t, DB.Create(&[]Redemption{
		{Name: "available", Key: "finance-available-redemption-001", Status: common.RedemptionCodeStatusEnabled, Quota: 300, ExpiredTime: 0},
		{Name: "redeemed", Key: "finance-redeemed-redemption-001", Status: common.RedemptionCodeStatusUsed, Quota: 400, RedeemedTime: now - 20},
		{Name: "expired", Key: "finance-expired-redemption-0001", Status: common.RedemptionCodeStatusEnabled, Quota: 500, ExpiredTime: now - 10},
	}).Error)

	overview, err := GetAdminFinanceOverview(now-100, now)
	require.NoError(t, err)
	require.NotNil(t, overview)
	assert.Equal(t, int64(1_000), overview.Balance.WalletQuota)
	assert.Equal(t, int64(200), overview.Balance.AffiliateQuota)
	assert.Equal(t, int64(1_500), overview.Balance.SubscriptionQuota)
	assert.Equal(t, int64(2_700), overview.Balance.TotalAvailableQuota)
	assert.Equal(t, int64(100), overview.Balance.NegativeWalletQuota)
	assert.Equal(t, int64(1), overview.Balance.UnlimitedSubscriptionCount)
	assert.Equal(t, int64(4), overview.Orders.TotalCount)
	assert.Equal(t, int64(2), overview.Orders.SuccessCount)
	assert.Equal(t, float64(10), overview.Orders.SuccessAmount)
	assert.Equal(t, int64(1), overview.Orders.ExternalSuccessCount)
	assert.Equal(t, int64(0), overview.Orders.WalletSuccessCount)
	assert.Equal(t, int64(1), overview.Orders.SubscriptionSuccessCount)
	assert.Equal(t, float64(10), overview.Orders.SubscriptionSuccessAmount)
	assert.Equal(t, int64(1), overview.Orders.InternalSubscriptionCount)
	assert.Equal(t, float64(4), overview.Orders.InternalSubscriptionAmount)
	assert.Equal(t, int64(1), overview.Redemptions.AvailableCount)
	assert.Equal(t, int64(300), overview.Redemptions.AvailableQuota)
	assert.Equal(t, int64(1), overview.Redemptions.RedeemedCount)
	assert.Equal(t, int64(400), overview.Redemptions.RedeemedQuota)
	assert.Equal(t, int64(1), overview.Redemptions.ExpiredCount)
	require.Len(t, overview.Providers, 3)
	assert.Equal(t, PaymentProviderStripe, overview.Providers[0].Provider)
	assert.Equal(t, PaymentProviderBalance, overview.Providers[1].Provider)
	assert.True(t, overview.Providers[1].Internal)
	assert.Equal(t, "alipay", overview.Providers[2].Provider)
}

func TestListAdminTopUpsAppliesOperationalFilters(t *testing.T) {
	truncateTables(t)

	require.NoError(t, DB.Create(&[]TopUp{
		{UserId: 1, TradeNo: "matching-stripe", PaymentProvider: PaymentProviderStripe, PaymentMethod: PaymentMethodStripe, Status: common.TopUpStatusSuccess, CreateTime: 200},
		{UserId: 1, TradeNo: "matching-legacy", PaymentMethod: PaymentProviderStripe, Status: common.TopUpStatusSuccess, CreateTime: 210},
		{UserId: 1, TradeNo: "wrong-status", PaymentProvider: PaymentProviderStripe, Status: common.TopUpStatusPending, CreateTime: 220},
		{UserId: 1, TradeNo: "wrong-provider", PaymentProvider: PaymentProviderWaffo, Status: common.TopUpStatusSuccess, CreateTime: 230},
	}).Error)

	rows, total, err := ListAdminTopUps(AdminTopUpFilter{
		Keyword:  "%matching%",
		Status:   common.TopUpStatusSuccess,
		Provider: PaymentProviderStripe,
		StartAt:  190,
		EndAt:    215,
	}, 0, 100)
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	require.Len(t, rows, 2)
	assert.Equal(t, "matching-legacy", rows[0].TradeNo)
	assert.Equal(t, "matching-stripe", rows[1].TradeNo)

	_, _, err = ListAdminTopUps(AdminTopUpFilter{Status: "unknown"}, 0, 10)
	require.Error(t, err)
}

func TestListAdminTopUpsNormalizesCreditedQuotaByProvider(t *testing.T) {
	truncateTables(t)

	require.NoError(t, DB.Create(&[]TopUp{
		{TradeNo: "stripe-quota", PaymentProvider: PaymentProviderStripe, Money: 2.5, Status: common.TopUpStatusSuccess, CreateTime: 200},
		{TradeNo: "creem-quota", PaymentProvider: PaymentProviderCreem, Amount: 800, Status: common.TopUpStatusSuccess, CreateTime: 210},
		{TradeNo: "epay-quota", PaymentProvider: PaymentProviderEpay, Amount: 3, Status: common.TopUpStatusSuccess, CreateTime: 220},
	}).Error)

	rows, total, err := ListAdminTopUps(AdminTopUpFilter{}, 0, 100)
	require.NoError(t, err)
	assert.Equal(t, int64(3), total)
	require.Len(t, rows, 3)
	assert.Equal(t, int64(3*common.QuotaPerUnit), rows[0].CreditedQuota)
	assert.Equal(t, int64(800), rows[1].CreditedQuota)
	assert.Equal(t, int64(2.5*common.QuotaPerUnit), rows[2].CreditedQuota)
}

func TestListAdminTopUpsFiltersWalletAndSubscriptionOrders(t *testing.T) {
	truncateTables(t)

	require.NoError(t, DB.Create(&[]TopUp{
		{TradeNo: "wallet-order", PaymentProvider: PaymentProviderStripe, Money: 2, Status: common.TopUpStatusSuccess, CreateTime: 200},
		{TradeNo: "subscription-order", PaymentProvider: PaymentProviderStripe, Money: 9, Status: common.TopUpStatusSuccess, CreateTime: 210},
	}).Error)
	require.NoError(t, DB.Create(&SubscriptionOrder{
		TradeNo: "subscription-order", PaymentProvider: PaymentProviderStripe, Money: 9, Status: common.TopUpStatusSuccess, CreateTime: 210,
	}).Error)

	walletRows, walletTotal, err := ListAdminTopUps(AdminTopUpFilter{OrderType: TopUpOrderTypeWallet}, 0, 100)
	require.NoError(t, err)
	assert.Equal(t, int64(1), walletTotal)
	require.Len(t, walletRows, 1)
	assert.Equal(t, TopUpOrderTypeWallet, walletRows[0].OrderType)

	subscriptionRows, subscriptionTotal, err := ListAdminTopUps(AdminTopUpFilter{OrderType: TopUpOrderTypeSubscription}, 0, 100)
	require.NoError(t, err)
	assert.Equal(t, int64(1), subscriptionTotal)
	require.Len(t, subscriptionRows, 1)
	assert.Equal(t, TopUpOrderTypeSubscription, subscriptionRows[0].OrderType)
	assert.Zero(t, subscriptionRows[0].CreditedQuota)
}
