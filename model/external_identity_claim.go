package model

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	ExternalIdentityProviderEVM      = "evm"
	ExternalIdentityProviderTelegram = "telegram"
)

var ErrExternalIdentityAlreadyClaimed = errors.New("external identity is already claimed")

// ExternalIdentityClaim is the durable ownership record for an identity issued
// by an external provider. The two unique indexes make both the provider
// subject and the user's provider slot single-owner without relying on a
// check-then-update sequence.
type ExternalIdentityClaim struct {
	Id         int64     `json:"id" gorm:"primaryKey"`
	Provider   string    `json:"provider" gorm:"type:varchar(32);not null;uniqueIndex:idx_external_identity_subject,priority:1;uniqueIndex:idx_external_identity_user,priority:1"`
	Subject    string    `json:"subject" gorm:"type:varchar(128);not null;uniqueIndex:idx_external_identity_subject,priority:2"`
	UserId     int       `json:"user_id" gorm:"not null;index;uniqueIndex:idx_external_identity_user,priority:2"`
	LastUsedAt time.Time `json:"last_used_at"`
	CreatedAt  time.Time `json:"created_at"`
}

func (ExternalIdentityClaim) TableName() string {
	return "external_identity_claims"
}

// ClaimExternalIdentityWithTx atomically claims a provider subject for one
// user. Repeating the exact mapping is idempotent; every competing subject or
// user is rejected. Ownership is read back instead of trusting RowsAffected,
// whose duplicate-key semantics differ between supported databases.
func ClaimExternalIdentityWithTx(tx *gorm.DB, provider, subject string, userId int) error {
	provider = strings.TrimSpace(provider)
	subject = strings.TrimSpace(subject)
	if tx == nil || provider == "" || subject == "" || userId == 0 {
		return errors.New("external identity claim is invalid")
	}

	claim := ExternalIdentityClaim{
		Provider: provider, Subject: subject, UserId: userId, LastUsedAt: time.Now(),
	}
	result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&claim)
	if result.Error != nil {
		return result.Error
	}
	var subjectOwner ExternalIdentityClaim
	if err := tx.Where("provider = ? AND subject = ?", provider, subject).First(&subjectOwner).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrExternalIdentityAlreadyClaimed
		}
		return err
	}
	if subjectOwner.UserId != userId {
		return ErrExternalIdentityAlreadyClaimed
	}

	var userClaim ExternalIdentityClaim
	if err := tx.Where("provider = ? AND user_id = ?", provider, userId).First(&userClaim).Error; err != nil {
		return err
	}
	if userClaim.Subject != subject {
		return ErrExternalIdentityAlreadyClaimed
	}
	return nil
}

func GetExternalIdentityClaimByUserID(provider string, userId int) (*ExternalIdentityClaim, error) {
	provider = strings.TrimSpace(provider)
	if provider == "" || userId == 0 {
		return nil, errors.New("external identity query is invalid")
	}
	var claim ExternalIdentityClaim
	if err := DB.Where("provider = ? AND user_id = ?", provider, userId).First(&claim).Error; err != nil {
		return nil, err
	}
	return &claim, nil
}

func GetUserByExternalIdentityWithTx(tx *gorm.DB, provider, subject string) (*User, error) {
	provider = strings.TrimSpace(provider)
	subject = strings.TrimSpace(subject)
	if tx == nil || provider == "" || subject == "" {
		return nil, errors.New("external identity query is invalid")
	}
	var claim ExternalIdentityClaim
	if err := tx.Where("provider = ? AND subject = ?", provider, subject).First(&claim).Error; err != nil {
		return nil, err
	}
	var user User
	if err := tx.First(&user, claim.UserId).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func TouchExternalIdentityWithTx(tx *gorm.DB, provider, subject string) error {
	provider = strings.TrimSpace(provider)
	subject = strings.TrimSpace(subject)
	if tx == nil || provider == "" || subject == "" {
		return errors.New("external identity update is invalid")
	}
	result := tx.Model(&ExternalIdentityClaim{}).
		Where("provider = ? AND subject = ?", provider, subject).
		Update("last_used_at", time.Now())
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func ReleaseExternalIdentityWithTx(tx *gorm.DB, provider string, userId int) error {
	provider = strings.TrimSpace(provider)
	if tx == nil || provider == "" || userId == 0 {
		return errors.New("external identity release is invalid")
	}
	return tx.Where("provider = ? AND user_id = ?", provider, userId).
		Delete(&ExternalIdentityClaim{}).Error
}

func releaseAllExternalIdentitiesWithTx(tx *gorm.DB, userId int) error {
	if tx == nil || userId == 0 {
		return errors.New("external identity release is invalid")
	}
	return tx.Where("user_id = ?", userId).Delete(&ExternalIdentityClaim{}).Error
}

type legacyEVMWalletBinding struct {
	UserId     int
	Address    string
	LastUsedAt time.Time
	CreatedAt  time.Time
}

func (legacyEVMWalletBinding) TableName() string {
	return "evm_wallet_bindings"
}

// InitializeExternalIdentityClaims imports legacy identity bindings after the
// claim table is migrated. Existing duplicate ownership fails migration rather
// than preserving an ambiguous login identity. The legacy EVM table is kept
// read-only for one safe rollback window and is no longer used by runtime code.
func InitializeExternalIdentityClaims() error {
	hasLegacyEVMWalletBindings := DB.Migrator().HasTable(&legacyEVMWalletBinding{})
	return DB.Transaction(func(tx *gorm.DB) error {
		var users []User
		if err := tx.Unscoped().Select("id", "telegram_id").
			Where("telegram_id <> ?", "").Find(&users).Error; err != nil {
			return err
		}
		for _, user := range users {
			if err := ClaimExternalIdentityWithTx(tx, ExternalIdentityProviderTelegram, user.TelegramId, user.Id); err != nil {
				return fmt.Errorf("backfill Telegram identity for user %d: %w", user.Id, err)
			}
		}
		if !hasLegacyEVMWalletBindings {
			return nil
		}
		var wallets []legacyEVMWalletBinding
		if err := tx.Find(&wallets).Error; err != nil {
			return err
		}
		for _, wallet := range wallets {
			address := strings.ToLower(strings.TrimSpace(wallet.Address))
			var existingClaim ExternalIdentityClaim
			lookupErr := tx.Where(
				"provider = ? AND subject = ?", ExternalIdentityProviderEVM, address,
			).First(&existingClaim).Error
			if lookupErr != nil && !errors.Is(lookupErr, gorm.ErrRecordNotFound) {
				return lookupErr
			}
			if err := ClaimExternalIdentityWithTx(tx, ExternalIdentityProviderEVM, address, wallet.UserId); err != nil {
				return fmt.Errorf("backfill EVM identity for user %d: %w", wallet.UserId, err)
			}
			lastUsedAt := wallet.LastUsedAt
			if lastUsedAt.IsZero() {
				lastUsedAt = wallet.CreatedAt
			}
			if !lastUsedAt.IsZero() && (errors.Is(lookupErr, gorm.ErrRecordNotFound) || existingClaim.LastUsedAt.IsZero()) {
				if err := tx.Model(&ExternalIdentityClaim{}).
					Where("provider = ? AND subject = ?", ExternalIdentityProviderEVM, address).
					Update("last_used_at", lastUsedAt).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
}
