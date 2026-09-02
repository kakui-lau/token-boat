package model

import (
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
)

var (
	ErrEVMWalletUserUnavailable = errors.New("EVM wallet user is unavailable")
	ErrEVMWalletNotBound        = errors.New("EVM wallet is not bound")
	ErrEVMWalletAlreadyBound    = errors.New("EVM wallet is already bound to another user")
	ErrEVMWalletLastLoginMethod = errors.New("EVM wallet is the user's last login method")
)

// EVMWalletIdentity is the chain-independent view of an EVM external identity.
// The durable record lives in external_identity_claims with provider "evm".
type EVMWalletIdentity struct {
	UserId     int
	Address    string
	LastUsedAt time.Time
	CreatedAt  time.Time
}

func normalizeEVMIdentityAddress(address string) string {
	return strings.ToLower(strings.TrimSpace(address))
}

func GetUserByEVMWalletAddress(address string) (*User, error) {
	return GetUserByEVMWalletAddressWithTx(DB, address)
}

func GetUserByEVMWalletAddressWithTx(tx *gorm.DB, address string) (*User, error) {
	user, err := GetUserByExternalIdentityWithTx(
		tx, ExternalIdentityProviderEVM, normalizeEVMIdentityAddress(address),
	)
	if err == nil {
		return user, nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		var claim ExternalIdentityClaim
		claimErr := tx.Where(
			"provider = ? AND subject = ?",
			ExternalIdentityProviderEVM,
			normalizeEVMIdentityAddress(address),
		).First(&claim).Error
		if claimErr == nil {
			return nil, ErrEVMWalletUserUnavailable
		}
		if errors.Is(claimErr, gorm.ErrRecordNotFound) {
			return nil, gorm.ErrRecordNotFound
		}
		return nil, claimErr
	}
	return nil, err
}

func GetEVMWalletIdentityByUserID(userID int) (*EVMWalletIdentity, error) {
	claim, err := GetExternalIdentityClaimByUserID(ExternalIdentityProviderEVM, userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrEVMWalletNotBound
		}
		return nil, err
	}
	return &EVMWalletIdentity{
		UserId: claim.UserId, Address: claim.Subject,
		LastUsedAt: claim.LastUsedAt, CreatedAt: claim.CreatedAt,
	}, nil
}

func TouchEVMWalletIdentityWithTx(tx *gorm.DB, address string) error {
	return TouchExternalIdentityWithTx(
		tx, ExternalIdentityProviderEVM, normalizeEVMIdentityAddress(address),
	)
}

func ClaimEVMWalletIdentityWithTx(tx *gorm.DB, userID int, address string) error {
	err := ClaimExternalIdentityWithTx(
		tx, ExternalIdentityProviderEVM, normalizeEVMIdentityAddress(address), userID,
	)
	if errors.Is(err, ErrExternalIdentityAlreadyClaimed) {
		return ErrEVMWalletAlreadyBound
	}
	return err
}

// AssertEVMWalletIdentityWithTx verifies that an address is still owned by the
// expected user inside the caller's authentication-flow transaction.
func AssertEVMWalletIdentityWithTx(tx *gorm.DB, userID int, address string) error {
	if tx == nil || userID <= 0 || strings.TrimSpace(address) == "" {
		return ErrEVMWalletNotBound
	}
	var claim ExternalIdentityClaim
	err := tx.Where(
		"provider = ? AND subject = ? AND user_id = ?",
		ExternalIdentityProviderEVM,
		normalizeEVMIdentityAddress(address),
		userID,
	).First(&claim).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrEVMWalletNotBound
	}
	return err
}

// ReplaceEVMWalletIdentityWithAuthVersionTx proves the new address and changes
// the login identity in the caller's one-time authentication-flow transaction.
// Advancing auth_version makes every other browser session fail closed.
func ReplaceEVMWalletIdentityWithAuthVersionTx(tx *gorm.DB, userID int, address string) error {
	address = normalizeEVMIdentityAddress(address)
	if tx == nil || userID <= 0 || address == "" {
		return errors.New("invalid EVM wallet identity")
	}
	if _, err := IncrementUserAuthVersionWithTx(tx, userID); err != nil {
		return err
	}
	var current ExternalIdentityClaim
	err := lockForUpdate(tx).Where(
		"provider = ? AND user_id = ?", ExternalIdentityProviderEVM, userID,
	).First(&current).Error
	if err == nil && current.Subject == address {
		return TouchEVMWalletIdentityWithTx(tx, address)
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	if err := ReleaseExternalIdentityWithTx(tx, ExternalIdentityProviderEVM, userID); err != nil {
		return err
	}
	return ClaimEVMWalletIdentityWithTx(tx, userID, address)
}

func DeleteEVMWalletIdentityWithAuthVersion(userID int) error {
	if userID <= 0 {
		return ErrEVMWalletNotBound
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		var claim ExternalIdentityClaim
		if err := lockForUpdate(tx).Where(
			"provider = ? AND user_id = ?", ExternalIdentityProviderEVM, userID,
		).First(&claim).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrEVMWalletNotBound
			}
			return err
		}
		var user User
		if err := lockForUpdate(tx).Select(
			"id", "password", "github_id", "discord_id", "oidc_id", "wechat_id", "telegram_id", "linux_do_id",
		).First(&user, userID).Error; err != nil {
			return err
		}
		hasAlternative := user.Password != "" || user.GitHubId != "" || user.DiscordId != "" ||
			user.OidcId != "" || user.WeChatId != "" || user.TelegramId != "" || user.LinuxDOId != ""
		if !hasAlternative {
			var count int64
			if err := tx.Model(&PasskeyCredential{}).Where("user_id = ?", userID).Count(&count).Error; err != nil {
				return err
			}
			hasAlternative = count > 0
		}
		if !hasAlternative {
			var count int64
			if err := tx.Model(&UserOAuthBinding{}).Where("user_id = ?", userID).Count(&count).Error; err != nil {
				return err
			}
			hasAlternative = count > 0
		}
		if !hasAlternative {
			return ErrEVMWalletLastLoginMethod
		}
		if _, err := IncrementUserAuthVersionWithTx(tx, userID); err != nil {
			return err
		}
		result := tx.Delete(&claim)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrEVMWalletNotBound
		}
		return nil
	})
	if err != nil {
		return err
	}
	return PublishUserAuthCache(userID)
}
