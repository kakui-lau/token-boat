package controller

import (
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/decred/dcrd/dcrec/secp256k1/v4"
	secp256k1ecdsa "github.com/decred/dcrd/dcrec/secp256k1/v4/ecdsa"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/sha3"
	"gorm.io/gorm"
)

func TestEVMWalletLoginAutomaticallyCreatesOneAccountAndRejectsChallengeReplay(t *testing.T) {
	previousDB := model.DB
	previousLogDB := model.LOG_DB
	previousDatabaseType := common.MainDatabaseType()
	previousRedis := common.RedisEnabled
	previousSessionSecret := common.SessionSecret
	previousTrustedURLs := common.SessionCookieTrustedURLs
	previousWalletEnabled := common.EVMWalletAuthEnabled
	previousRegisterEnabled := common.RegisterEnabled
	previousTurnstileEnabled := common.TurnstileCheckEnabled
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&model.User{},
		&model.UserSession{},
		&model.AuthFlow{},
		&model.ExternalIdentityClaim{},
		&model.Log{},
	))
	model.DB = db
	model.LOG_DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.RedisEnabled = false
	common.SessionSecret = "evm-wallet-controller-test-secret-with-enough-entropy"
	common.SessionCookieTrustedURLs = []string{"https://other.example"}
	common.EVMWalletAuthEnabled = true
	common.RegisterEnabled = true
	common.TurnstileCheckEnabled = false
	require.NoError(t, i18n.Init())
	t.Cleanup(func() {
		model.DB = previousDB
		model.LOG_DB = previousLogDB
		common.SetMainDatabaseType(previousDatabaseType)
		common.RedisEnabled = previousRedis
		common.SessionSecret = previousSessionSecret
		common.SessionCookieTrustedURLs = previousTrustedURLs
		common.EVMWalletAuthEnabled = previousWalletEnabled
		common.RegisterEnabled = previousRegisterEnabled
		common.TurnstileCheckEnabled = previousTurnstileEnabled
		sqlDB, dbErr := db.DB()
		if dbErr == nil {
			_ = sqlDB.Close()
		}
	})

	privateKey := secp256k1.PrivKeyFromBytes([]byte{
		1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
		17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
	})
	publicKey := privateKey.PubKey().SerializeUncompressed()
	addressHasher := sha3.NewLegacyKeccak256()
	_, _ = addressHasher.Write(publicKey[1:])
	addressDigest := addressHasher.Sum(nil)
	address := "0x" + hex.EncodeToString(addressDigest[len(addressDigest)-20:])

	gin.SetMode(gin.TestMode)
	router := gin.New()
	authenticatedUserID := 0
	authenticatedSession := model.UserSession{}
	withAuthenticatedWalletSession := func(handler gin.HandlerFunc) gin.HandlerFunc {
		return func(c *gin.Context) {
			c.Set("id", authenticatedUserID)
			c.Set("session_id", authenticatedSession.SID)
			c.Set("auth_version", authenticatedSession.UserAuthVersion)
			c.Set("session_version", authenticatedSession.Version)
			handler(c)
		}
	}
	router.POST("/api/user/evm-wallet/login/begin", EVMWalletLoginBegin)
	router.POST("/api/user/evm-wallet/login/finish", EVMWalletLoginFinish)
	router.POST(
		"/api/user/evm-wallet/password/begin",
		withAuthenticatedWalletSession(EVMWalletPasswordSetupBegin),
	)
	router.POST(
		"/api/user/evm-wallet/password/finish",
		withAuthenticatedWalletSession(EVMWalletPasswordSetupFinish),
	)
	beginBody := fmt.Sprintf(`{"address":%q,"chain_id":"0x1"}`, address)
	loginBeginRequest := httptest.NewRequest(http.MethodPost, "https://wallet.example/api/user/evm-wallet/login/begin", strings.NewReader(beginBody))
	loginBeginRequest.Header.Set("Content-Type", "application/json")
	loginBeginRequest.Header.Set("Origin", "https://wallet.example")
	loginBeginResponse := httptest.NewRecorder()
	router.ServeHTTP(loginBeginResponse, loginBeginRequest)

	var unregisteredBeginResult struct {
		Success bool `json:"success"`
		Data    struct {
			FlowToken string `json:"flow_token"`
			Message   string `json:"message"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(loginBeginResponse.Body.Bytes(), &unregisteredBeginResult))
	require.True(t, unregisteredBeginResult.Success, loginBeginResponse.Body.String())
	unregisteredFinishBody := fmt.Sprintf(
		`{"flow_token":%q,"signature":%q}`,
		unregisteredBeginResult.Data.FlowToken,
		signEVMWalletMessageForTest(privateKey, unregisteredBeginResult.Data.Message),
	)
	mismatchedOriginRequest := httptest.NewRequest(http.MethodPost, "https://wallet.example/api/user/evm-wallet/login/finish", strings.NewReader(unregisteredFinishBody))
	mismatchedOriginRequest.Header.Set("Content-Type", "application/json")
	mismatchedOriginRequest.Header.Set("Origin", "https://other.example")
	mismatchedOriginResponse := httptest.NewRecorder()
	router.ServeHTTP(mismatchedOriginResponse, mismatchedOriginRequest)
	assert.Equal(t, http.StatusForbidden, mismatchedOriginResponse.Code)

	unregisteredFinishRequest := httptest.NewRequest(http.MethodPost, "https://wallet.example/api/user/evm-wallet/login/finish", strings.NewReader(unregisteredFinishBody))
	unregisteredFinishRequest.Header.Set("Content-Type", "application/json")
	unregisteredFinishRequest.Header.Set("Origin", "https://wallet.example")
	unregisteredFinishResponse := httptest.NewRecorder()
	router.ServeHTTP(unregisteredFinishResponse, unregisteredFinishRequest)
	var unregisteredFinishResult struct {
		Success bool `json:"success"`
		Data    struct {
			AccessToken string `json:"access_token"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(unregisteredFinishResponse.Body.Bytes(), &unregisteredFinishResult))
	require.True(t, unregisteredFinishResult.Success, unregisteredFinishResponse.Body.String())
	assert.NotEmpty(t, unregisteredFinishResult.Data.AccessToken)

	var passwordlessUser model.User
	require.NoError(t, db.First(&passwordlessUser).Error)
	authenticatedUserID = passwordlessUser.Id
	require.NoError(t, db.Where("user_id = ?", passwordlessUser.Id).First(&authenticatedSession).Error)
	passwordSetupBeginRequest := httptest.NewRequest(
		http.MethodPost,
		"https://wallet.example/api/user/evm-wallet/password/begin",
		strings.NewReader(beginBody),
	)
	passwordSetupBeginRequest.Header.Set("Content-Type", "application/json")
	passwordSetupBeginRequest.Header.Set("Origin", "https://wallet.example")
	passwordSetupBeginResponse := httptest.NewRecorder()
	router.ServeHTTP(passwordSetupBeginResponse, passwordSetupBeginRequest)
	var passwordSetupBeginResult struct {
		Success bool `json:"success"`
		Data    struct {
			FlowToken string `json:"flow_token"`
			Message   string `json:"message"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(passwordSetupBeginResponse.Body.Bytes(), &passwordSetupBeginResult))
	require.True(t, passwordSetupBeginResult.Success, passwordSetupBeginResponse.Body.String())
	passwordSetupFinishBody := fmt.Sprintf(
		`{"flow_token":%q,"signature":%q,"password":"wallet-password"}`,
		passwordSetupBeginResult.Data.FlowToken,
		signEVMWalletMessageForTest(privateKey, passwordSetupBeginResult.Data.Message),
	)
	passwordSetupFinishRequest := httptest.NewRequest(
		http.MethodPost,
		"https://wallet.example/api/user/evm-wallet/password/finish",
		strings.NewReader(passwordSetupFinishBody),
	)
	passwordSetupFinishRequest.Header.Set("Content-Type", "application/json")
	passwordSetupFinishRequest.Header.Set("Origin", "https://wallet.example")
	passwordSetupFinishResponse := httptest.NewRecorder()
	router.ServeHTTP(passwordSetupFinishResponse, passwordSetupFinishRequest)
	var passwordSetupFinishResult struct {
		Success bool `json:"success"`
	}
	require.NoError(t, common.Unmarshal(passwordSetupFinishResponse.Body.Bytes(), &passwordSetupFinishResult))
	require.True(t, passwordSetupFinishResult.Success, passwordSetupFinishResponse.Body.String())
	require.NoError(t, db.First(&passwordlessUser, passwordlessUser.Id).Error)
	assert.NotEmpty(t, passwordlessUser.Password)
	assert.True(t, common.ValidatePasswordAndHash("wallet-password", passwordlessUser.Password))

	replayRequest := httptest.NewRequest(http.MethodPost, "https://wallet.example/api/user/evm-wallet/login/finish", strings.NewReader(unregisteredFinishBody))
	replayRequest.Header.Set("Content-Type", "application/json")
	replayRequest.Header.Set("Origin", "https://wallet.example")
	replayResponse := httptest.NewRecorder()
	router.ServeHTTP(replayResponse, replayRequest)
	var replayResult struct {
		Success bool `json:"success"`
	}
	require.NoError(t, common.Unmarshal(replayResponse.Body.Bytes(), &replayResult))
	assert.False(t, replayResult.Success)

	registeredLoginBeginRequest := httptest.NewRequest(http.MethodPost, "https://wallet.example/api/user/evm-wallet/login/begin", strings.NewReader(beginBody))
	registeredLoginBeginRequest.Header.Set("Content-Type", "application/json")
	registeredLoginBeginRequest.Header.Set("Origin", "https://wallet.example")
	registeredLoginBeginResponse := httptest.NewRecorder()
	router.ServeHTTP(registeredLoginBeginResponse, registeredLoginBeginRequest)
	var registeredLoginBeginResult struct {
		Success bool `json:"success"`
		Data    struct {
			FlowToken string `json:"flow_token"`
			Message   string `json:"message"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(registeredLoginBeginResponse.Body.Bytes(), &registeredLoginBeginResult))
	require.True(t, registeredLoginBeginResult.Success, registeredLoginBeginResponse.Body.String())
	registeredLoginFinishBody := fmt.Sprintf(
		`{"flow_token":%q,"signature":%q}`,
		registeredLoginBeginResult.Data.FlowToken,
		signEVMWalletMessageForTest(privateKey, registeredLoginBeginResult.Data.Message),
	)
	registeredLoginFinishRequest := httptest.NewRequest(http.MethodPost, "https://wallet.example/api/user/evm-wallet/login/finish", strings.NewReader(registeredLoginFinishBody))
	registeredLoginFinishRequest.Header.Set("Content-Type", "application/json")
	registeredLoginFinishRequest.Header.Set("Origin", "https://wallet.example")
	registeredLoginFinishResponse := httptest.NewRecorder()
	router.ServeHTTP(registeredLoginFinishResponse, registeredLoginFinishRequest)
	var registeredLoginFinishResult struct {
		Success bool `json:"success"`
	}
	require.NoError(t, common.Unmarshal(registeredLoginFinishResponse.Body.Bytes(), &registeredLoginFinishResult))
	require.True(t, registeredLoginFinishResult.Success, registeredLoginFinishResponse.Body.String())

	var userCount int64
	var identityCount int64
	var sessionCount int64
	require.NoError(t, db.Model(&model.User{}).Count(&userCount).Error)
	require.NoError(t, db.Model(&model.ExternalIdentityClaim{}).
		Where("provider = ?", model.ExternalIdentityProviderEVM).Count(&identityCount).Error)
	require.NoError(t, db.Model(&model.UserSession{}).Count(&sessionCount).Error)
	assert.Equal(t, int64(1), userCount)
	assert.Equal(t, int64(1), identityCount)
	assert.Equal(t, int64(2), sessionCount)
	var createdUser model.User
	require.NoError(t, db.First(&createdUser).Error)
	assert.True(t, createdUser.UsernameEditable)
}

func signEVMWalletMessageForTest(privateKey *secp256k1.PrivateKey, message string) string {
	prefix := "\x19Ethereum Signed Message:\n" + strconv.Itoa(len([]byte(message)))
	messageHasher := sha3.NewLegacyKeccak256()
	_, _ = messageHasher.Write([]byte(prefix))
	_, _ = messageHasher.Write([]byte(message))
	compact := secp256k1ecdsa.SignCompact(privateKey, messageHasher.Sum(nil), false)
	signatureBytes := make([]byte, 65)
	copy(signatureBytes[:64], compact[1:])
	signatureBytes[64] = compact[0] - 27
	return "0x" + hex.EncodeToString(signatureBytes)
}
