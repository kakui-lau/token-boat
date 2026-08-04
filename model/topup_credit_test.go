package model

import (
	"errors"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTopUpQuotaToCreditUsesProviderSpecificAmountSemantics(t *testing.T) {
	originalQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 500_000
	t.Cleanup(func() {
		common.QuotaPerUnit = originalQuotaPerUnit
	})

	tests := []struct {
		name     string
		topUp    TopUp
		expected int
	}{
		{
			name:     "stripe credits the settled wallet amount",
			topUp:    TopUp{PaymentProvider: PaymentProviderStripe, Money: 2.5, Amount: 99},
			expected: 1_250_000,
		},
		{
			name:     "creem amount is already stored as raw quota",
			topUp:    TopUp{PaymentProvider: PaymentProviderCreem, Money: 10, Amount: 2_500},
			expected: 2_500,
		},
		{
			name:     "standard gateway amount is stored in USD units",
			topUp:    TopUp{PaymentProvider: PaymentProviderWaffo, Money: 8, Amount: 10},
			expected: 5_000_000,
		},
		{
			name:     "legacy stripe rows fall back to payment method",
			topUp:    TopUp{PaymentMethod: PaymentMethodStripe, Money: 3, Amount: 99},
			expected: 1_500_000,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			quota, err := topUpQuotaToCredit(&test.topUp)
			require.NoError(t, err)
			assert.Equal(t, test.expected, quota)
		})
	}
}

func TestTopUpQuotaToCreditRejectsInvalidOrUnrepresentableCredit(t *testing.T) {
	_, err := topUpQuotaToCredit(nil)
	require.Error(t, err)

	_, err = topUpQuotaToCredit(&TopUp{PaymentProvider: PaymentProviderCreem})
	require.Error(t, err)

	_, err = topUpQuotaToCredit(&TopUp{
		PaymentProvider: PaymentProviderCreem,
		Amount:          int64(common.MaxQuota) + 1,
	})
	require.Error(t, err)
}

func TestRechargeEpayCreditsWalletExactlyOnceInTheCompletionTransaction(t *testing.T) {
	truncateTables(t)
	originalQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 500_000
	t.Cleanup(func() {
		common.QuotaPerUnit = originalQuotaPerUnit
	})

	user := &User{
		Username: "epay-credit-user",
		Password: "password",
		AffCode:  "epay-credit-aff",
		Quota:    100,
	}
	require.NoError(t, DB.Create(user).Error)
	topUp := &TopUp{
		UserId:          user.Id,
		TradeNo:         "epay-credit-order",
		Amount:          2,
		Money:           1.5,
		PaymentProvider: PaymentProviderEpay,
		PaymentMethod:   "wxpay",
		Status:          common.TopUpStatusPending,
		CreateTime:      common.GetTimestamp(),
	}
	require.NoError(t, DB.Create(topUp).Error)

	require.NoError(t, RechargeEpay(topUp.TradeNo, "alipay", "127.0.0.1"))
	require.NoError(t, RechargeEpay(topUp.TradeNo, "alipay", "127.0.0.1"))

	var reloadedUser User
	require.NoError(t, DB.First(&reloadedUser, user.Id).Error)
	assert.Equal(t, 1_000_100, reloadedUser.Quota)
	reloadedTopUp := GetTopUpByTradeNo(topUp.TradeNo)
	require.NotNil(t, reloadedTopUp)
	assert.Equal(t, common.TopUpStatusSuccess, reloadedTopUp.Status)
	assert.Equal(t, "alipay", reloadedTopUp.PaymentMethod)
	assert.Positive(t, reloadedTopUp.CompleteTime)
}

func TestRechargeEpayRejectsAnOrderOwnedByAnotherProvider(t *testing.T) {
	truncateTables(t)
	user := &User{
		Username: "epay-provider-guard-user",
		Password: "password",
		AffCode:  "epay-provider-guard-aff",
		Quota:    100,
	}
	require.NoError(t, DB.Create(user).Error)
	require.NoError(t, DB.Create(&TopUp{
		UserId:          user.Id,
		TradeNo:         "epay-provider-guard-order",
		Amount:          2,
		PaymentProvider: PaymentProviderStripe,
		Status:          common.TopUpStatusPending,
	}).Error)

	err := RechargeEpay("epay-provider-guard-order", "alipay", "127.0.0.1")
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrPaymentMethodMismatch))

	var reloadedUser User
	require.NoError(t, DB.First(&reloadedUser, user.Id).Error)
	assert.Equal(t, 100, reloadedUser.Quota)
}
