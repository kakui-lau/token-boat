package service

import (
	"encoding/hex"
	"strconv"
	"testing"
	"time"

	"github.com/decred/dcrd/dcrec/secp256k1/v4"
	secp256k1ecdsa "github.com/decred/dcrd/dcrec/secp256k1/v4/ecdsa"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/sha3"
)

func TestBuildSIWEMessageUsesCanonicalEIP4361Fields(t *testing.T) {
	issuedAt := time.Date(2026, time.September, 1, 10, 20, 30, 789, time.FixedZone("CST", 8*60*60))
	expiresAt := issuedAt.Add(5 * time.Minute)
	message, err := BuildSIWEMessage(
		"https://TokenBoat.com:443/",
		"0x52908400098527886e0f7030069857d2e4169ee7",
		1,
		"A1b2C3d4E5f6",
		issuedAt,
		expiresAt,
	)
	require.NoError(t, err)
	assert.Equal(t, "tokenboat.com wants you to sign in with your Ethereum account:\n0x52908400098527886E0F7030069857D2E4169EE7\n\nSign in to Token Boat.\n\nURI: https://tokenboat.com\nVersion: 1\nChain ID: 1\nNonce: A1b2C3d4E5f6\nIssued At: 2026-09-01T02:20:30Z\nExpiration Time: 2026-09-01T02:25:30Z", message)
}

func TestVerifySIWESignatureAcceptsMatchingEOAAndRejectsMismatch(t *testing.T) {
	privateKey := secp256k1.PrivKeyFromBytes([]byte{
		1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
		17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
	})
	message := "tokenboat.com wants you to sign in"
	prefix := "\x19Ethereum Signed Message:\n" + strconv.Itoa(len([]byte(message)))
	hasher := sha3.NewLegacyKeccak256()
	_, _ = hasher.Write([]byte(prefix))
	_, _ = hasher.Write([]byte(message))
	compact := secp256k1ecdsa.SignCompact(privateKey, hasher.Sum(nil), false)
	ethereumSignature := make([]byte, 65)
	copy(ethereumSignature[:64], compact[1:])
	ethereumSignature[64] = compact[0] - 27

	publicKey := privateKey.PubKey().SerializeUncompressed()
	addressHasher := sha3.NewLegacyKeccak256()
	_, _ = addressHasher.Write(publicKey[1:])
	addressDigest := addressHasher.Sum(nil)
	address := "0x" + hex.EncodeToString(addressDigest[len(addressDigest)-20:])

	now := time.Now().UTC()
	siweMessage, err := BuildSIWEMessage("https://tokenboat.com", address, 1, "A1b2C3d4E5f6", now, now.Add(time.Minute))
	require.NoError(t, err)
	prefix = "\x19Ethereum Signed Message:\n" + strconv.Itoa(len([]byte(siweMessage)))
	hasher = sha3.NewLegacyKeccak256()
	_, _ = hasher.Write([]byte(prefix))
	_, _ = hasher.Write([]byte(siweMessage))
	compact = secp256k1ecdsa.SignCompact(privateKey, hasher.Sum(nil), false)
	copy(ethereumSignature[:64], compact[1:])
	ethereumSignature[64] = compact[0] - 27
	signature := "0x" + hex.EncodeToString(ethereumSignature)
	require.NoError(t, VerifySIWESignature(siweMessage, address, "https://tokenboat.com", "A1b2C3d4E5f6", signature, now))
	assert.ErrorIs(t, VerifySIWESignature(siweMessage, address, "https://other.example", "A1b2C3d4E5f6", signature, now), ErrInvalidEVMSignature)
	assert.ErrorIs(t, VerifySIWESignature(siweMessage, "0x0000000000000000000000000000000000000001", "https://tokenboat.com", "A1b2C3d4E5f6", signature, now), ErrInvalidEVMSignature)
	assert.ErrorIs(t, VerifySIWESignature(siweMessage, address, "https://tokenboat.com", "A1b2C3d4E5f6", signature, now.Add(2*time.Minute)), ErrInvalidEVMSignature)
}

func TestParseEVMChainIDRejectsInvalidValues(t *testing.T) {
	chainID, err := ParseEVMChainID("0x89")
	require.NoError(t, err)
	assert.Equal(t, uint64(137), chainID)

	for _, value := range []string{"", "0", "-1", "0x", "9007199254740992", "not-a-chain"} {
		_, err := ParseEVMChainID(value)
		assert.ErrorIs(t, err, ErrInvalidEVMChainID, value)
	}
}
