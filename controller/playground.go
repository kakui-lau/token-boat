package controller

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"

	"github.com/gin-gonic/gin"
)

func Playground(c *gin.Context) {
	playgroundRelay(c, types.RelayFormatOpenAI, "playground-chat")
}

func PlaygroundImage(c *gin.Context) {
	playgroundRelay(c, types.RelayFormatOpenAIImage, "playground-image")
}

func playgroundRelay(c *gin.Context, relayFormat types.RelayFormat, tokenName string) {
	var newAPIError *types.NewAPIError

	defer func() {
		if newAPIError != nil {
			c.JSON(newAPIError.StatusCode, gin.H{
				"error": newAPIError.ToOpenAIError(),
			})
		}
	}()

	useAccessToken := c.GetBool("use_access_token")
	if useAccessToken {
		newAPIError = types.NewError(errors.New("暂不支持使用 access token"), types.ErrorCodeAccessDenied, types.ErrOptionWithSkipRetry())
		return
	}

	relayInfo, err := relaycommon.GenRelayInfo(c, relayFormat, nil, nil)
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
		return
	}

	userId := c.GetInt("id")

	// Write user context to ensure acceptUnsetRatio is available
	userCache, err := model.GetUserCache(userId)
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry())
		return
	}
	userCache.WriteContext(c)

	playgroundToken := &model.Token{
		UserId: userId,
		Name:   tokenName,
		Group:  relayInfo.UsingGroup,
	}
	if selectedToken, ok := c.Get("playground_api_key"); ok {
		if token, valid := selectedToken.(*model.Token); valid && token.UserId == userId {
			playgroundToken = token
		}
	}
	_ = middleware.SetupContextForToken(c, playgroundToken)

	Relay(c, relayFormat)
}

func PlaygroundTask(c *gin.Context) {
	if err := preparePlaygroundContext(c); err != nil {
		c.JSON(err.StatusCode, gin.H{"error": err.ToOpenAIError()})
		return
	}
	c.Request.URL.Path = "/v1/videos"
	RelayTask(c)
}

func PlaygroundTaskFetch(c *gin.Context) {
	if err := preparePlaygroundContext(c); err != nil {
		c.JSON(err.StatusCode, gin.H{"error": err.ToOpenAIError()})
		return
	}
	c.Request.URL.Path = "/v1/videos/" + c.Param("task_id")
	RelayTaskFetch(c)
}

func preparePlaygroundContext(c *gin.Context) *types.NewAPIError {
	if c.GetBool("use_access_token") {
		return types.NewError(errors.New("暂不支持使用 access token"), types.ErrorCodeAccessDenied, types.ErrOptionWithSkipRetry())
	}
	userCache, err := model.GetUserCache(c.GetInt("id"))
	if err != nil {
		return types.NewError(err, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry())
	}
	userCache.WriteContext(c)
	playgroundToken := &model.Token{
		UserId: c.GetInt("id"),
		Name:   "playground-video",
		Group:  common.GetContextKeyString(c, constant.ContextKeyUsingGroup),
	}
	if selectedToken, ok := c.Get("playground_api_key"); ok {
		if token, valid := selectedToken.(*model.Token); valid && token.UserId == c.GetInt("id") {
			playgroundToken = token
		}
	}
	_ = middleware.SetupContextForToken(c, playgroundToken)
	return nil
}
