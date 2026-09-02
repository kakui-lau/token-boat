package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPaymentReturnPathUsesDefaultDashboardRoutes(t *testing.T) {
	previousAddress := system_setting.ServerAddress
	system_setting.ServerAddress = "https://dashboard.example.com/"
	t.Cleanup(func() { system_setting.ServerAddress = previousAddress })

	assert.Equal(
		t,
		"https://dashboard.example.com/wallet?pay=success",
		paymentReturnPath("/wallet?pay=success"),
	)
	assert.Equal(
		t,
		"https://dashboard.example.com/usage-logs",
		paymentReturnPath("/usage-logs"),
	)
}

func TestPaymentRedirectAllowsConfiguredServerHost(t *testing.T) {
	previousAddress := system_setting.ServerAddress
	previousDomains := constant.TrustedRedirectDomains
	system_setting.ServerAddress = "https://tokenboat.com"
	constant.TrustedRedirectDomains = nil
	t.Cleanup(func() {
		system_setting.ServerAddress = previousAddress
		constant.TrustedRedirectDomains = previousDomains
	})

	require.NoError(
		t,
		validatePaymentRedirectURL("https://tokenboat.com/console/recharge?payment=success"),
	)
}

func TestPaymentRedirectDoesNotTrustLookalikeOrSiblingHosts(t *testing.T) {
	previousAddress := system_setting.ServerAddress
	previousDomains := constant.TrustedRedirectDomains
	system_setting.ServerAddress = "https://tokenboat.com"
	constant.TrustedRedirectDomains = nil
	t.Cleanup(func() {
		system_setting.ServerAddress = previousAddress
		constant.TrustedRedirectDomains = previousDomains
	})

	for _, redirectURL := range []string{
		"https://evil-tokenboat.com/console/recharge",
		"https://payments.tokenboat.com/console/recharge",
		"javascript:alert(1)",
	} {
		t.Run(redirectURL, func(t *testing.T) {
			require.Error(t, validatePaymentRedirectURL(redirectURL))
		})
	}
}
