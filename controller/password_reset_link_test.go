package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/stretchr/testify/assert"
)

func TestPasswordResetLinkKeepsLegacyPathByDefault(t *testing.T) {
	previousAddress := system_setting.ServerAddress
	system_setting.ServerAddress = "https://dashboard.example.com/"
	t.Cleanup(func() { system_setting.ServerAddress = previousAddress })

	assert.Equal(
		t,
		"https://dashboard.example.com/user/reset?email=member%2Balerts%40example.com&token=reset-token",
		passwordResetLink("member+alerts@example.com", "reset-token", ""),
	)
}

func TestPasswordResetLinkAllowsOnlyConsoleCompatibilityPath(t *testing.T) {
	previousAddress := system_setting.ServerAddress
	system_setting.ServerAddress = "https://dashboard.example.com"
	t.Cleanup(func() { system_setting.ServerAddress = previousAddress })

	assert.Equal(
		t,
		"https://dashboard.example.com/console/user/reset?email=member%40example.com&token=reset-token",
		passwordResetLink("member@example.com", "reset-token", "/console/user/reset"),
	)
	assert.Equal(
		t,
		"https://dashboard.example.com/user/reset?email=member%40example.com&token=reset-token",
		passwordResetLink("member@example.com", "reset-token", "https://evil.example/reset"),
	)
}
