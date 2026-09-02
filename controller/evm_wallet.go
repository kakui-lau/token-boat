package controller

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const evmWalletChallengeLifetime = 5 * time.Minute

type evmWalletBeginRequest struct {
	Address       string `json:"address"`
	ChainID       string `json:"chain_id"`
	AffiliateCode string `json:"affiliate_code"`
}

type evmWalletFinishRequest struct {
	FlowToken string `json:"flow_token"`
	Signature string `json:"signature"`
}

type evmWalletPasswordSetupFinishRequest struct {
	FlowToken string `json:"flow_token"`
	Signature string `json:"signature"`
	Password  string `json:"password" validate:"required,min=8,max=20"`
}

type evmWalletFlowPayload struct {
	Address       string `json:"address"`
	ChainID       string `json:"chain_id"`
	Origin        string `json:"origin"`
	Message       string `json:"message"`
	Nonce         string `json:"nonce"`
	AffiliateCode string `json:"affiliate_code,omitempty"`
}

func EVMWalletLoginBegin(c *gin.Context) {
	beginEVMWalletAuth(c, model.AuthFlowIntentLogin, 0, "", "")
}

func EVMWalletRegisterBegin(c *gin.Context) {
	if !common.RegisterEnabled {
		common.ApiErrorI18n(c, i18n.MsgUserRegisterDisabled)
		return
	}
	beginEVMWalletAuth(c, model.AuthFlowIntentRegister, 0, "", "")
}

func EVMWalletBindBegin(c *gin.Context) {
	if !common.EVMWalletAuthEnabled {
		common.ApiErrorI18n(c, i18n.MsgEVMWalletAuthDisabled)
		return
	}
	user, err := getAuthenticatedUser(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	identity, ok := middleware.GetSessionAuthIdentity(c)
	if !ok {
		common.ApiError(c, errors.New("当前认证方式不支持钱包绑定"))
		return
	}
	if !requireEVMWalletVerification(c, user, securityProofScopeEVMWalletBind) {
		return
	}
	beginEVMWalletAuth(c, model.AuthFlowIntentBind, user.Id, identity.SessionID, "")
}

func beginEVMWalletAuth(c *gin.Context, intent string, userID int, sessionID, expectedAddress string) {
	if !common.EVMWalletAuthEnabled {
		common.ApiErrorI18n(c, i18n.MsgEVMWalletAuthDisabled)
		return
	}
	var request evmWalletBeginRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	address, err := service.NormalizeEVMAddress(request.Address)
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgEVMWalletAddressInvalid)
		return
	}
	if expectedAddress != "" && !strings.EqualFold(address, expectedAddress) {
		common.ApiErrorI18n(c, i18n.MsgEVMWalletAccountMismatch)
		return
	}
	if intent == model.AuthFlowIntentLogin {
		_, lookupErr := model.GetUserByEVMWalletAddress(address)
		if errors.Is(lookupErr, gorm.ErrRecordNotFound) {
			if !common.RegisterEnabled {
				common.ApiErrorI18n(c, i18n.MsgUserRegisterDisabled)
				return
			}
			if !middleware.VerifyTurnstileRequest(c) {
				return
			}
		} else if lookupErr != nil && !errors.Is(lookupErr, model.ErrEVMWalletUserUnavailable) {
			common.ApiError(c, lookupErr)
			return
		}
	}
	chainID, err := service.ParseEVMChainID(request.ChainID)
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgEVMWalletChainInvalid)
		return
	}
	origin, err := middleware.ValidatedBrowserOrigin(c.Request)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": i18n.T(c, i18n.MsgEVMWalletOriginInvalid)})
		return
	}
	affiliateCode := strings.TrimSpace(request.AffiliateCode)
	if len(affiliateCode) > 32 {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	if intent == model.AuthFlowIntentBind {
		affiliateCode = ""
	}
	randomNonce := make([]byte, 16)
	if _, err := rand.Read(randomNonce); err != nil {
		common.ApiError(c, err)
		return
	}
	now := time.Now()
	expiresAt := now.Add(evmWalletChallengeLifetime)
	nonce := hex.EncodeToString(randomNonce)
	message, err := service.BuildSIWEMessage(origin, address, chainID, nonce, now, expiresAt)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	payloadBytes, err := common.Marshal(evmWalletFlowPayload{
		Address:       address,
		ChainID:       strconv.FormatUint(chainID, 10),
		Origin:        origin,
		Message:       message,
		Nonce:         nonce,
		AffiliateCode: affiliateCode,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	flowToken, _, err := model.CreateAuthFlow(model.AuthFlowCreate{
		Purpose:   model.AuthFlowPurposeEVMWalletAuth,
		Intent:    intent,
		UserId:    userID,
		SessionId: sessionID,
		Payload:   string(payloadBytes),
		ExpiresAt: expiresAt,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	checksumAddress, _ := service.ChecksumEVMAddress(address)
	common.ApiSuccess(c, gin.H{
		"flow_token": flowToken,
		"message":    message,
		"address":    checksumAddress,
		"chain_id":   strconv.FormatUint(chainID, 10),
		"expires_at": expiresAt.Unix(),
		"nonce":      nonce,
	})
}

func EVMWalletPasswordSetupBegin(c *gin.Context) {
	if !common.EVMWalletAuthEnabled {
		common.ApiErrorI18n(c, i18n.MsgEVMWalletAuthDisabled)
		return
	}
	user, err := getAuthenticatedUser(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if user.Password != "" {
		common.ApiErrorI18n(c, i18n.MsgUserPasswordAlreadySet)
		return
	}
	identity, ok := middleware.GetSessionAuthIdentity(c)
	if !ok {
		common.ApiError(c, errors.New("当前认证方式不支持密码设置"))
		return
	}
	wallet, err := model.GetEVMWalletIdentityByUserID(user.Id)
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgEVMWalletAccountMismatch)
		return
	}
	beginEVMWalletAuth(
		c,
		model.AuthFlowIntentPasswordSetup,
		user.Id,
		identity.SessionID,
		wallet.Address,
	)
}

func EVMWalletBindingStatus(c *gin.Context) {
	user, err := getAuthenticatedUser(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	method, err := evmWalletVerificationMethod(user)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	binding, err := model.GetEVMWalletIdentityByUserID(user.Id)
	if errors.Is(err, model.ErrEVMWalletNotBound) {
		common.ApiSuccess(c, gin.H{"enabled": false, "verification_method": method})
		return
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	checksumAddress, _ := service.ChecksumEVMAddress(binding.Address)
	common.ApiSuccess(c, gin.H{
		"enabled":             true,
		"address":             checksumAddress,
		"last_used_at":        binding.LastUsedAt.Unix(),
		"verification_method": method,
		"removable":           method != "",
	})
}

func EVMWalletBindFinish(c *gin.Context) {
	if !common.EVMWalletAuthEnabled {
		common.ApiErrorI18n(c, i18n.MsgEVMWalletAuthDisabled)
		return
	}
	user, err := getAuthenticatedUser(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	identity, ok := middleware.GetSessionAuthIdentity(c)
	if !ok {
		common.ApiError(c, errors.New("当前认证方式不支持钱包绑定"))
		return
	}
	if !requireEVMWalletVerification(c, user, securityProofScopeEVMWalletBind) {
		return
	}
	var request evmWalletFinishRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil || strings.TrimSpace(request.FlowToken) == "" || strings.TrimSpace(request.Signature) == "" {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	match := model.AuthFlowMatch{
		Purpose: model.AuthFlowPurposeEVMWalletAuth, Intent: model.AuthFlowIntentBind,
		UserId: user.Id, SessionId: identity.SessionID,
	}
	pendingFlow, err := model.GetAuthFlow(request.FlowToken, match)
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgEVMWalletChallengeInvalid)
		return
	}
	var payload evmWalletFlowPayload
	if err := common.UnmarshalJsonStr(pendingFlow.Payload, &payload); err != nil {
		common.ApiErrorI18n(c, i18n.MsgEVMWalletChallengeInvalid)
		return
	}
	requestOrigin, err := middleware.ValidatedBrowserOrigin(c.Request)
	if err != nil || requestOrigin != payload.Origin {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": i18n.T(c, i18n.MsgEVMWalletOriginInvalid)})
		return
	}
	if err := service.VerifySIWESignature(payload.Message, payload.Address, payload.Origin, payload.Nonce, request.Signature, time.Now()); err != nil {
		common.ApiErrorI18n(c, i18n.MsgEVMWalletSignatureInvalid)
		return
	}
	_, err = model.ConsumeAuthFlowWithAction(request.FlowToken, match, func(tx *gorm.DB, _ *model.AuthFlow) error {
		return model.ReplaceEVMWalletIdentityWithAuthVersionTx(tx, user.Id, payload.Address)
	})
	if err != nil {
		if errors.Is(err, model.ErrEVMWalletAlreadyBound) {
			common.ApiErrorMsg(c, "该钱包已绑定到其他账户")
			return
		}
		common.ApiError(c, err)
		return
	}
	if err := model.PublishUserAuthCache(user.Id); err != nil {
		common.ApiError(c, err)
		return
	}
	bundle, err := service.AdvanceCurrentSessionToUserVersion(identity, "evm_wallet_bound")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordUserSecurityAudit(c, user.Id, "user.evm_wallet_bind", map[string]interface{}{"address": payload.Address})
	common.ApiSuccess(c, authRotationData(bundle))
}

func EVMWalletBindingDelete(c *gin.Context) {
	user, err := getAuthenticatedUser(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	identity, ok := middleware.GetSessionAuthIdentity(c)
	if !ok {
		common.ApiError(c, errors.New("当前认证方式不支持钱包解绑"))
		return
	}
	if !requireEVMWalletVerification(c, user, securityProofScopeEVMWalletDelete) {
		return
	}
	if err := model.DeleteEVMWalletIdentityWithAuthVersion(user.Id); err != nil {
		switch {
		case errors.Is(err, model.ErrEVMWalletNotBound):
			common.ApiErrorMsg(c, "该账户尚未绑定钱包")
		case errors.Is(err, model.ErrEVMWalletLastLoginMethod):
			common.ApiErrorMsg(c, "请先设置密码、Passkey 或其他登录方式，再解绑钱包")
		default:
			common.ApiError(c, err)
		}
		return
	}
	bundle, err := service.AdvanceCurrentSessionToUserVersion(identity, "evm_wallet_deleted")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordUserSecurityAudit(c, user.Id, "user.evm_wallet_delete", nil)
	common.ApiSuccess(c, authRotationData(bundle))
}

func evmWalletVerificationMethod(user *model.User) (string, error) {
	twoFA, err := model.GetTwoFAByUserId(user.Id)
	if err != nil {
		return "", err
	}
	if twoFA != nil && twoFA.IsEnabled {
		return secureVerificationMethod2FA, nil
	}
	if _, err := model.GetPasskeyByUserID(user.Id); err == nil {
		return secureVerificationMethodPasskey, nil
	} else if !errors.Is(err, model.ErrPasskeyNotFound) {
		return "", err
	}
	if user.Password != "" {
		return secureVerificationMethodPassword, nil
	}
	return "", nil
}

func requireEVMWalletVerification(c *gin.Context, user *model.User, scope string) bool {
	method, err := evmWalletVerificationMethod(user)
	if err != nil {
		common.ApiError(c, err)
		return false
	}
	if method != "" {
		return middleware.RequireSecurityProof(c, scope, []string{method})
	}
	if _, err := model.GetEVMWalletIdentityByUserID(user.Id); err == nil {
		common.ApiErrorMsg(c, "请先设置密码或 Passkey，再更换当前钱包")
		return false
	} else if !errors.Is(err, model.ErrEVMWalletNotBound) {
		common.ApiError(c, err)
		return false
	}
	return true
}

func EVMWalletPasswordSetupFinish(c *gin.Context) {
	if !common.EVMWalletAuthEnabled {
		common.ApiErrorI18n(c, i18n.MsgEVMWalletAuthDisabled)
		return
	}
	identity, ok := middleware.GetSessionAuthIdentity(c)
	if !ok {
		common.ApiError(c, errors.New("当前认证方式不支持密码设置"))
		return
	}
	var request evmWalletPasswordSetupFinishRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil ||
		strings.TrimSpace(request.FlowToken) == "" ||
		strings.TrimSpace(request.Signature) == "" {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	if err := common.Validate.Struct(&request); err != nil {
		common.ApiErrorI18n(c, i18n.MsgUserInputInvalid, map[string]any{"Error": err.Error()})
		return
	}
	match := model.AuthFlowMatch{
		Purpose:   model.AuthFlowPurposeEVMWalletAuth,
		Intent:    model.AuthFlowIntentPasswordSetup,
		UserId:    identity.UserID,
		SessionId: identity.SessionID,
	}
	pendingFlow, err := model.GetAuthFlow(request.FlowToken, match)
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgEVMWalletChallengeInvalid)
		return
	}
	var payload evmWalletFlowPayload
	if err := common.UnmarshalJsonStr(pendingFlow.Payload, &payload); err != nil {
		common.ApiErrorI18n(c, i18n.MsgEVMWalletChallengeInvalid)
		return
	}
	requestOrigin, err := middleware.ValidatedBrowserOrigin(c.Request)
	if err != nil || requestOrigin != payload.Origin {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": i18n.T(c, i18n.MsgEVMWalletOriginInvalid)})
		return
	}
	if err := service.VerifySIWESignature(
		payload.Message,
		payload.Address,
		payload.Origin,
		payload.Nonce,
		request.Signature,
		time.Now(),
	); err != nil {
		common.ApiErrorI18n(c, i18n.MsgEVMWalletSignatureInvalid)
		return
	}
	_, err = model.ConsumeAuthFlowWithAction(request.FlowToken, match, func(tx *gorm.DB, _ *model.AuthFlow) error {
		if err := model.AssertEVMWalletIdentityWithTx(tx, identity.UserID, payload.Address); err != nil {
			return err
		}
		return model.SetInitialUserPasswordWithTx(tx, identity.UserID, request.Password)
	})
	if err != nil {
		switch {
		case errors.Is(err, model.ErrUserPasswordAlreadySet):
			common.ApiErrorI18n(c, i18n.MsgUserPasswordAlreadySet)
		case errors.Is(err, model.ErrEVMWalletNotBound):
			common.ApiErrorI18n(c, i18n.MsgEVMWalletAccountMismatch)
		default:
			common.ApiError(c, err)
		}
		return
	}
	if err := model.PublishUserAuthCache(identity.UserID); err != nil {
		common.ApiError(c, err)
		return
	}
	bundle, err := service.AdvanceCurrentSessionToUserVersion(identity, "password_set")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordUserSecurityAudit(c, identity.UserID, "user.password_set", map[string]interface{}{
		"verification_method": secureVerificationMethodEVMWallet,
	})
	common.ApiSuccess(c, authRotationData(bundle))
}

func EVMWalletLoginFinish(c *gin.Context) {
	if !common.EVMWalletAuthEnabled {
		common.ApiErrorI18n(c, i18n.MsgEVMWalletAuthDisabled)
		return
	}
	var request evmWalletFinishRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil || strings.TrimSpace(request.FlowToken) == "" || strings.TrimSpace(request.Signature) == "" {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	match := model.AuthFlowMatch{
		Purpose: model.AuthFlowPurposeEVMWalletAuth,
	}
	pendingFlow, err := model.GetAuthFlow(request.FlowToken, match)
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgEVMWalletChallengeInvalid)
		return
	}
	var payload evmWalletFlowPayload
	if err := common.UnmarshalJsonStr(pendingFlow.Payload, &payload); err != nil {
		common.ApiErrorI18n(c, i18n.MsgEVMWalletChallengeInvalid)
		return
	}
	if pendingFlow.Intent != model.AuthFlowIntentLogin && pendingFlow.Intent != model.AuthFlowIntentRegister {
		common.ApiErrorI18n(c, i18n.MsgEVMWalletChallengeInvalid)
		return
	}
	match.Intent = pendingFlow.Intent
	requestOrigin, err := middleware.ValidatedBrowserOrigin(c.Request)
	if err != nil || requestOrigin != payload.Origin {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": i18n.T(c, i18n.MsgEVMWalletOriginInvalid)})
		return
	}
	if err := service.VerifySIWESignature(payload.Message, payload.Address, payload.Origin, payload.Nonce, request.Signature, time.Now()); err != nil {
		common.ApiErrorI18n(c, i18n.MsgEVMWalletSignatureInvalid)
		return
	}

	var user *model.User
	var createdUser *model.User
	inviterID := 0
	if payload.AffiliateCode != "" {
		inviterID, _ = model.GetUserIdByAffCode(payload.AffiliateCode)
	}
	_, err = model.ConsumeAuthFlowWithAction(request.FlowToken, match, func(tx *gorm.DB, _ *model.AuthFlow) error {
		boundUser, lookupErr := model.GetUserByEVMWalletAddressWithTx(tx, payload.Address)
		if lookupErr == nil {
			if err := model.TouchEVMWalletIdentityWithTx(tx, payload.Address); err != nil {
				return err
			}
			user = boundUser
			return nil
		}
		if !errors.Is(lookupErr, gorm.ErrRecordNotFound) {
			return lookupErr
		}
		if !common.RegisterEnabled {
			return errEVMWalletRegistrationDisabled
		}
		shortAddress := payload.Address
		if len(shortAddress) >= 10 {
			shortAddress = shortAddress[:6] + "…" + shortAddress[len(shortAddress)-4:]
		}
		newUser := &model.User{
			DisplayName:      shortAddress,
			UsernameEditable: true,
			Role:             common.RoleCommonUser,
			Status:           common.UserStatusEnabled,
		}
		var insertErr error
		for range 5 {
			newUser.Username = "evm_" + common.GetRandomString(16)
			insertErr = newUser.InsertWithTx(tx, inviterID)
			if !errors.Is(insertErr, model.ErrUsernameAlreadyTaken) {
				break
			}
		}
		if insertErr != nil {
			return insertErr
		}
		if err := model.ClaimEVMWalletIdentityWithTx(tx, newUser.Id, payload.Address); err != nil {
			return err
		}
		user = newUser
		createdUser = newUser
		return nil
	})
	if err != nil {
		if errors.Is(err, errEVMWalletRegistrationDisabled) {
			common.ApiErrorI18n(c, i18n.MsgUserRegisterDisabled)
			return
		}
		if errors.Is(err, model.ErrEVMWalletUserUnavailable) {
			common.ApiErrorI18n(c, i18n.MsgAuthUserBanned)
			return
		}
		// A concurrent request can win the unique address binding. Resolve the
		// committed identity instead of leaving the valid signer locked out.
		if concurrentUser, lookupErr := model.GetUserByEVMWalletAddress(payload.Address); lookupErr == nil {
			if _, consumeErr := model.ConsumeAuthFlowWithAction(request.FlowToken, match, func(tx *gorm.DB, _ *model.AuthFlow) error {
				boundUser, boundErr := model.GetUserByEVMWalletAddressWithTx(tx, payload.Address)
				if boundErr != nil || boundUser.Id != concurrentUser.Id {
					return model.ErrAuthFlowInvalid
				}
				return model.TouchEVMWalletIdentityWithTx(tx, payload.Address)
			}); consumeErr != nil {
				common.ApiErrorI18n(c, i18n.MsgEVMWalletChallengeInvalid)
				return
			}
			user = concurrentUser
		} else {
			common.ApiError(c, err)
			return
		}
	}
	if createdUser != nil {
		createdUser.FinalizeOAuthUserCreation(inviterID)
	}
	if user == nil || user.Status != common.UserStatusEnabled {
		common.ApiErrorI18n(c, i18n.MsgAuthUserBanned)
		return
	}
	setupLogin(user, c)
}

var errEVMWalletRegistrationDisabled = errors.New("EVM wallet registration is disabled")
