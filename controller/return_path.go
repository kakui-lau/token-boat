package controller

import (
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/system_setting"
)

func paymentReturnPath(suffix string) string {
	base := strings.TrimRight(system_setting.ServerAddress, "/")
	return base + suffix
}

// validatePaymentRedirectURL accepts the explicit redirect allowlist and the
// exact host configured as ServerAddress. ServerAddress already defines the
// operator-controlled public origin used for payment callbacks and links.
func validatePaymentRedirectURL(rawURL string) error {
	validationErr := common.ValidateRedirectURL(rawURL)
	if validationErr == nil {
		return nil
	}

	redirectURL, err := url.Parse(rawURL)
	if err != nil || (redirectURL.Scheme != "http" && redirectURL.Scheme != "https") || redirectURL.Hostname() == "" {
		return validationErr
	}
	serverURL, err := url.Parse(strings.TrimSpace(system_setting.ServerAddress))
	if err != nil || serverURL.Hostname() == "" {
		return validationErr
	}
	if strings.EqualFold(redirectURL.Hostname(), serverURL.Hostname()) {
		return nil
	}
	return validationErr
}
