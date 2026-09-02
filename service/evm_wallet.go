package service

import (
	"encoding/hex"
	"errors"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	secp256k1ecdsa "github.com/decred/dcrd/dcrec/secp256k1/v4/ecdsa"
	"golang.org/x/crypto/sha3"
)

var (
	ErrInvalidEVMAddress   = errors.New("invalid EVM wallet address")
	ErrInvalidEVMChainID   = errors.New("invalid EVM chain ID")
	ErrInvalidEVMSignature = errors.New("invalid EVM wallet signature")
)

const maxSafeEVMChainID = uint64(1<<53 - 1)
const siweStatement = "Sign in to Token Boat."

// NormalizeEVMAddress validates an EVM address and returns its canonical
// lowercase representation for identity lookups. Display and SIWE messages use
// ChecksumEVMAddress instead.
func NormalizeEVMAddress(address string) (string, error) {
	address = strings.TrimSpace(address)
	if len(address) != 42 || !strings.HasPrefix(address, "0x") {
		return "", ErrInvalidEVMAddress
	}
	if _, err := hex.DecodeString(address[2:]); err != nil {
		return "", ErrInvalidEVMAddress
	}
	return strings.ToLower(address), nil
}

// ChecksumEVMAddress returns the EIP-55 representation required by EIP-4361.
func ChecksumEVMAddress(address string) (string, error) {
	normalized, err := NormalizeEVMAddress(address)
	if err != nil {
		return "", err
	}
	hexAddress := normalized[2:]
	hasher := sha3.NewLegacyKeccak256()
	_, _ = hasher.Write([]byte(hexAddress))
	digest := hex.EncodeToString(hasher.Sum(nil))
	checksum := []byte(hexAddress)
	for index, character := range checksum {
		if character < 'a' || character > 'f' {
			continue
		}
		nibble, err := strconv.ParseUint(string(digest[index]), 16, 8)
		if err == nil && nibble >= 8 {
			checksum[index] = character - ('a' - 'A')
		}
	}
	return "0x" + string(checksum), nil
}

func ParseEVMChainID(raw string) (uint64, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || strings.HasPrefix(raw, "-") {
		return 0, ErrInvalidEVMChainID
	}
	base := 10
	value := raw
	if strings.HasPrefix(raw, "0x") || strings.HasPrefix(raw, "0X") {
		base = 16
		value = raw[2:]
	}
	chainID, err := strconv.ParseUint(value, base, 64)
	if err != nil || chainID == 0 || chainID > maxSafeEVMChainID || chainID > uint64(^uint(0)>>1) {
		return 0, ErrInvalidEVMChainID
	}
	return chainID, nil
}

func BuildSIWEMessage(origin, address string, chainID uint64, nonce string, issuedAt, expiresAt time.Time) (string, error) {
	normalizedOrigin, err := common.NormalizeOrigin(origin)
	if err != nil {
		return "", err
	}
	parsedOrigin, err := url.Parse(normalizedOrigin)
	if err != nil || parsedOrigin.Host == "" {
		return "", errors.New("invalid SIWE origin")
	}
	checksumAddress, err := ChecksumEVMAddress(address)
	if err != nil {
		return "", err
	}
	if chainID == 0 {
		return "", ErrInvalidEVMChainID
	}
	if chainID > maxSafeEVMChainID || chainID > uint64(^uint(0)>>1) {
		return "", ErrInvalidEVMChainID
	}
	if len(nonce) < 8 {
		return "", errors.New("SIWE nonce must contain at least 8 characters")
	}
	for _, character := range nonce {
		if (character < 'a' || character > 'z') && (character < 'A' || character > 'Z') && (character < '0' || character > '9') {
			return "", errors.New("SIWE nonce must be alphanumeric")
		}
	}
	issuedAt = issuedAt.UTC().Truncate(time.Second)
	expiresAt = expiresAt.UTC().Truncate(time.Second)
	if issuedAt.IsZero() || !expiresAt.After(issuedAt) {
		return "", errors.New("invalid SIWE validity window")
	}

	return strings.Join([]string{
		parsedOrigin.Host + " wants you to sign in with your Ethereum account:",
		checksumAddress,
		"",
		siweStatement,
		"",
		"URI: " + normalizedOrigin,
		"Version: 1",
		"Chain ID: " + strconv.FormatUint(chainID, 10),
		"Nonce: " + nonce,
		"Issued At: " + issuedAt.Format(time.RFC3339),
		"Expiration Time: " + expiresAt.Format(time.RFC3339),
	}, "\n"), nil
}

// VerifySIWESignature verifies the EIP-191 personal_sign signature over the
// exact server-issued EIP-4361 message and returns only when its recovered EOA
// matches the expected address. Contract-wallet EIP-1271 verification requires
// a chain RPC and is intentionally outside this injected-wallet first version.
func VerifySIWESignature(message, expectedAddress, expectedOrigin, expectedNonce, signature string, now time.Time) error {
	normalizedAddress, err := NormalizeEVMAddress(expectedAddress)
	if err != nil {
		return err
	}
	signature = strings.TrimSpace(signature)
	if !strings.HasPrefix(signature, "0x") || len(signature) != 132 {
		return ErrInvalidEVMSignature
	}
	signatureBytes, err := hex.DecodeString(signature[2:])
	if err != nil || len(signatureBytes) != 65 {
		return ErrInvalidEVMSignature
	}
	if signatureBytes[64] != 0 && signatureBytes[64] != 1 && signatureBytes[64] != 27 && signatureBytes[64] != 28 {
		return ErrInvalidEVMSignature
	}
	normalizedOrigin, err := common.NormalizeOrigin(expectedOrigin)
	if err != nil {
		return ErrInvalidEVMSignature
	}
	parsedOrigin, err := url.Parse(normalizedOrigin)
	if err != nil || parsedOrigin.Host == "" {
		return ErrInvalidEVMSignature
	}
	lines := strings.Split(message, "\n")
	if len(lines) != 11 ||
		lines[0] != parsedOrigin.Host+" wants you to sign in with your Ethereum account:" ||
		lines[2] != "" ||
		lines[3] != siweStatement ||
		lines[4] != "" ||
		lines[5] != "URI: "+normalizedOrigin ||
		lines[6] != "Version: 1" ||
		lines[8] != "Nonce: "+expectedNonce {
		return ErrInvalidEVMSignature
	}
	messageAddress, err := NormalizeEVMAddress(lines[1])
	if err != nil || messageAddress != normalizedAddress {
		return ErrInvalidEVMSignature
	}
	if _, err := ParseEVMChainID(strings.TrimPrefix(lines[7], "Chain ID: ")); err != nil || !strings.HasPrefix(lines[7], "Chain ID: ") {
		return ErrInvalidEVMSignature
	}
	issuedAt, err := time.Parse(time.RFC3339, strings.TrimPrefix(lines[9], "Issued At: "))
	if err != nil || !strings.HasPrefix(lines[9], "Issued At: ") {
		return ErrInvalidEVMSignature
	}
	expiresAt, err := time.Parse(time.RFC3339, strings.TrimPrefix(lines[10], "Expiration Time: "))
	if err != nil || !strings.HasPrefix(lines[10], "Expiration Time: ") || !expiresAt.After(issuedAt) {
		return ErrInvalidEVMSignature
	}
	now = now.UTC()
	if now.Before(issuedAt.Add(-30*time.Second)) || !now.Before(expiresAt) {
		return ErrInvalidEVMSignature
	}

	recoveryID := signatureBytes[64]
	if recoveryID >= 27 {
		recoveryID -= 27
	}
	compactSignature := make([]byte, 65)
	compactSignature[0] = 27 + recoveryID
	copy(compactSignature[1:], signatureBytes[:64])
	prefix := "\x19Ethereum Signed Message:\n" + strconv.Itoa(len([]byte(message)))
	hasher := sha3.NewLegacyKeccak256()
	_, _ = hasher.Write([]byte(prefix))
	_, _ = hasher.Write([]byte(message))
	publicKey, _, err := secp256k1ecdsa.RecoverCompact(compactSignature, hasher.Sum(nil))
	if err != nil {
		return ErrInvalidEVMSignature
	}
	serializedPublicKey := publicKey.SerializeUncompressed()
	addressHasher := sha3.NewLegacyKeccak256()
	_, _ = addressHasher.Write(serializedPublicKey[1:])
	recoveredAddress := addressHasher.Sum(nil)
	if "0x"+hex.EncodeToString(recoveredAddress[len(recoveredAddress)-20:]) != normalizedAddress {
		return ErrInvalidEVMSignature
	}
	return nil
}
