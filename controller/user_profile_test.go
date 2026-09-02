package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestUpdateSelfProfileVerifiesEmailAndRejectsDuplicateFields(t *testing.T) {
	previousDB := model.DB
	previousLogDB := model.LOG_DB
	previousDatabaseType := common.MainDatabaseType()
	previousRedis := common.RedisEnabled
	previousEmailVerification := common.EmailVerificationEnabled
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Log{}))
	model.DB = db
	model.LOG_DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.RedisEnabled = false
	common.EmailVerificationEnabled = true
	require.NoError(t, i18n.Init())
	t.Cleanup(func() {
		model.DB = previousDB
		model.LOG_DB = previousLogDB
		common.SetMainDatabaseType(previousDatabaseType)
		common.RedisEnabled = previousRedis
		common.EmailVerificationEnabled = previousEmailVerification
		sqlDB, dbErr := db.DB()
		if dbErr == nil {
			_ = sqlDB.Close()
		}
	})

	walletUser := model.User{
		Username: "evm-generated", UsernameEditable: true, DisplayName: "0x1234…5678",
		Status: common.UserStatusEnabled, AffCode: "wallet-profile-aff",
	}
	existing := model.User{
		Username: "existing-user", DisplayName: "Existing", Email: "taken@example.com",
		Password: "password", Status: common.UserStatusEnabled, AffCode: "existing-profile-aff",
	}
	require.NoError(t, db.Create(&walletUser).Error)
	require.NoError(t, db.Create(&existing).Error)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.PUT("/api/user/self", func(c *gin.Context) {
		c.Set("id", walletUser.Id)
		UpdateSelf(c)
	})

	duplicateUsername := updateSelfProfileRequest(t, router, `{"username":"existing-user","display_name":"Wallet user","email":""}`)
	assert.False(t, duplicateUsername.Success)

	common.RegisterVerificationCodeWithKey("taken@example.com", "123456", common.EmailVerificationPurpose)
	duplicateEmail := updateSelfProfileRequest(t, router, `{"username":"wallet-user","display_name":"Wallet user","email":"TAKEN@example.com","verification_code":"123456"}`)
	assert.False(t, duplicateEmail.Success)

	common.RegisterVerificationCodeWithKey("owner@example.com", "654321", common.EmailVerificationPurpose)
	updated := updateSelfProfileRequest(t, router, `{"username":"wallet-user","display_name":"Wallet owner","email":"OWNER@example.com","verification_code":"654321"}`)
	require.True(t, updated.Success, updated.Message)

	var stored model.User
	require.NoError(t, db.First(&stored, walletUser.Id).Error)
	assert.Equal(t, "wallet-user", stored.Username)
	assert.False(t, stored.UsernameEditable)
	assert.Equal(t, "Wallet owner", stored.DisplayName)
	assert.Equal(t, "owner@example.com", stored.Email)
	selfData, err := buildSelfUserData(&stored)
	require.NoError(t, err)
	assert.Equal(t, false, selfData["username_editable"])
	assert.Equal(t, false, selfData["has_password"])

	rejectedRename := updateSelfProfileRequest(t, router, `{"username":"wallet-user-renamed","display_name":"Wallet owner","email":"owner@example.com"}`)
	assert.False(t, rejectedRename.Success)

	updatedDetails := updateSelfProfileRequest(t, router, `{"username":"wallet-user","display_name":"Wallet profile","email":"owner@example.com"}`)
	require.True(t, updatedDetails.Success, updatedDetails.Message)
	require.NoError(t, db.First(&stored, walletUser.Id).Error)
	assert.Equal(t, "wallet-user", stored.Username)
	assert.Equal(t, "Wallet profile", stored.DisplayName)
}

func updateSelfProfileRequest(t *testing.T, router http.Handler, body string) struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
} {
	t.Helper()
	request := httptest.NewRequest(http.MethodPut, "/api/user/self", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	var result struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
	return result
}
