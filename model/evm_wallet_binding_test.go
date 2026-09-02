package model

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestReplaceEVMWalletIdentityChangesIdentityAndAuthVersionAtomically(t *testing.T) {
	truncateTables(t)
	user := User{Username: "wallet-binding-user", Password: "password", AuthVersion: 1}
	require.NoError(t, DB.Create(&user).Error)
	oldAddress := "0x0000000000000000000000000000000000000011"
	newAddress := "0x0000000000000000000000000000000000000012"
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return ClaimEVMWalletIdentityWithTx(tx, user.Id, oldAddress)
	}))

	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return ReplaceEVMWalletIdentityWithAuthVersionTx(tx, user.Id, newAddress)
	}))

	binding, err := GetEVMWalletIdentityByUserID(user.Id)
	require.NoError(t, err)
	assert.Equal(t, newAddress, binding.Address)
	require.NoError(t, DB.First(&user, user.Id).Error)
	assert.EqualValues(t, 2, user.AuthVersion)
	_, err = GetUserByEVMWalletAddress(oldAddress)
	assert.ErrorIs(t, err, gorm.ErrRecordNotFound)
}

func TestDeleteEVMWalletIdentityProtectsTheLastLoginMethod(t *testing.T) {
	truncateTables(t)
	walletOnly := User{Username: "wallet-only", AffCode: "wallet-only-aff", AuthVersion: 1}
	require.NoError(t, DB.Create(&walletOnly).Error)
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return ClaimEVMWalletIdentityWithTx(tx, walletOnly.Id, "0x0000000000000000000000000000000000000021")
	}))

	err := DeleteEVMWalletIdentityWithAuthVersion(walletOnly.Id)
	assert.ErrorIs(t, err, ErrEVMWalletLastLoginMethod)
	_, err = GetEVMWalletIdentityByUserID(walletOnly.Id)
	require.NoError(t, err)

	passwordUser := User{Username: "password-wallet", Password: "password", AffCode: "password-wallet-aff", AuthVersion: 1}
	require.NoError(t, DB.Create(&passwordUser).Error)
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return ClaimEVMWalletIdentityWithTx(tx, passwordUser.Id, "0x0000000000000000000000000000000000000022")
	}))
	require.NoError(t, DeleteEVMWalletIdentityWithAuthVersion(passwordUser.Id))
	_, err = GetEVMWalletIdentityByUserID(passwordUser.Id)
	assert.True(t, errors.Is(err, ErrEVMWalletNotBound))
}
