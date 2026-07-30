package controller

import (
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	taskdto "github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/relay"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/service/pricingengine"
	"github.com/QuantumNous/new-api/service/pricingruntime"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/samber/lo"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

func relayHandler(c *gin.Context, info *relaycommon.RelayInfo) *types.NewAPIError {
	var err *types.NewAPIError
	switch info.RelayMode {
	case relayconstant.RelayModeImagesGenerations, relayconstant.RelayModeImagesEdits:
		err = relay.ImageHelper(c, info)
	case relayconstant.RelayModeAudioSpeech:
		fallthrough
	case relayconstant.RelayModeAudioTranslation:
		fallthrough
	case relayconstant.RelayModeAudioTranscription:
		err = relay.AudioHelper(c, info)
	case relayconstant.RelayModeRerank:
		err = relay.RerankHelper(c, info)
	case relayconstant.RelayModeEmbeddings:
		err = relay.EmbeddingHelper(c, info)
	case relayconstant.RelayModeResponses, relayconstant.RelayModeResponsesCompact:
		err = relay.ResponsesHelper(c, info)
	case relayconstant.RelayModeAlphaSearch:
		err = relay.AlphaSearchHelper(c, info)
	default:
		err = relay.TextHelper(c, info)
	}
	return err
}

func geminiRelayHandler(c *gin.Context, info *relaycommon.RelayInfo) *types.NewAPIError {
	var err *types.NewAPIError
	if strings.Contains(c.Request.URL.Path, "embed") {
		err = relay.GeminiEmbeddingHandler(c, info)
	} else {
		err = relay.GeminiHelper(c, info)
	}
	return err
}

func Relay(c *gin.Context, relayFormat types.RelayFormat) {

	requestId := c.GetString(common.RequestIdKey)
	//group := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)
	//originalModel := common.GetContextKeyString(c, constant.ContextKeyOriginalModel)

	var (
		newAPIError *types.NewAPIError
		ws          *websocket.Conn
	)

	if relayFormat == types.RelayFormatOpenAIRealtime {
		var err error
		ws, err = upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			helper.WssError(c, ws, types.NewError(err, types.ErrorCodeGetChannelFailed, types.ErrOptionWithSkipRetry()).ToOpenAIError())
			return
		}
		defer ws.Close()
	}

	defer func() {
		if newAPIError != nil {
			logger.LogError(c, fmt.Sprintf("relay error: %s", common.LocalLogPreview(newAPIError.Error())))
			newAPIError.SetMessage(common.MessageWithRequestId(newAPIError.Error(), requestId))
			switch relayFormat {
			case types.RelayFormatOpenAIRealtime:
				helper.WssError(c, ws, newAPIError.ToOpenAIError())
			case types.RelayFormatClaude:
				c.JSON(newAPIError.StatusCode, gin.H{
					"type":  "error",
					"error": newAPIError.ToClaudeError(),
				})
			default:
				c.JSON(newAPIError.StatusCode, gin.H{
					"error": newAPIError.ToOpenAIError(),
				})
			}
		}
	}()

	request, err := helper.GetAndValidateRequest(c, relayFormat)
	if err != nil {
		// Map "request body too large" to 413 so clients can handle it correctly
		if common.IsRequestBodyTooLargeError(err) || errors.Is(err, common.ErrRequestBodyTooLarge) {
			newAPIError = types.NewErrorWithStatusCode(err, types.ErrorCodeReadRequestBodyFailed, http.StatusRequestEntityTooLarge, types.ErrOptionWithSkipRetry())
		} else {
			newAPIError = types.NewError(err, types.ErrorCodeInvalidRequest)
		}
		return
	}

	relayInfo, err := relaycommon.GenRelayInfo(c, relayFormat, request, ws)
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeGenRelayInfoFailed)
		return
	}

	needSensitiveCheck := setting.ShouldCheckPromptSensitive()
	needCountToken := constant.CountToken
	// Avoid building huge CombineText (strings.Join) when token counting and sensitive check are both disabled.
	var meta *types.TokenCountMeta
	if needSensitiveCheck || needCountToken {
		meta = request.GetTokenCountMeta()
	} else {
		meta = fastTokenCountMetaForPricing(request)
	}

	if needSensitiveCheck && meta != nil {
		contains, words := service.CheckSensitiveText(meta.CombineText)
		if contains {
			logger.LogWarn(c, fmt.Sprintf("user sensitive words detected: %s", strings.Join(words, ", ")))
			newAPIError = types.NewError(err, types.ErrorCodeSensitiveWordsDetected)
			return
		}
	}

	tokens, err := service.EstimateRequestToken(c, meta, relayInfo)
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeCountTokenFailed)
		return
	}

	relayInfo.SetEstimatePromptTokens(tokens)

	requestInput, err := helper.ResolveIncomingBillingExprRequestInput(c, relayInfo)
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeModelPriceError, types.ErrOptionWithStatusCode(http.StatusBadRequest))
		return
	}
	priceData, usesV2Pricing, err := pricingruntime.PrepareRelayPricing(
		relayInfo,
		relayInfo.UsingGroup,
		common.GetContextKeyInt(c, constant.ContextKeyChannelId),
		tokens,
		meta.MaxTokens,
		helper.HandleGroupRatio(c, relayInfo),
		requestInput,
		estimatedPricingUsage(request, relayInfo, tokens),
	)
	if err == nil && !usesV2Pricing {
		priceData, err = helper.ModelPriceHelper(c, relayInfo, tokens, meta)
	}
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeModelPriceError, types.ErrOptionWithStatusCode(http.StatusBadRequest))
		return
	}
	if usesV2Pricing {
		selected := false
		for _, channelId := range relayInfo.DynamicPricingSnapshot.RouteChannelIds {
			channel, getErr := model.CacheGetChannel(channelId)
			if getErr != nil ||
				channel == nil ||
				channel.Status != common.ChannelStatusEnabled ||
				!middleware.ChannelSupportsRequestPath(
					channel,
					c.Request.URL.Path,
					relayInfo.OriginModelName,
				) ||
				!pricingruntime.TryAcquireChannel(channel.Id) {
				continue
			}
			if setupErr := middleware.SetupContextForSelectedChannel(
				c,
				channel,
				relayInfo.OriginModelName,
			); setupErr != nil {
				continue
			}
			if bindErr := pricingruntime.BindSelectedChannel(
				relayInfo,
				channel.Id,
			); bindErr != nil {
				newAPIError = types.NewError(
					bindErr,
					types.ErrorCodeModelPriceError,
					types.ErrOptionWithSkipRetry(),
				)
				return
			}
			selected = true
			break
		}
		if !selected {
			newAPIError = types.NewError(
				fmt.Errorf(
					"分组 %s 下模型 %s 没有可用的 V2 渠道",
					relayInfo.UsingGroup,
					relayInfo.OriginModelName,
				),
				types.ErrorCodeGetChannelFailed,
				types.ErrOptionWithSkipRetry(),
			)
			return
		}
	}

	// common.SetContextKey(c, constant.ContextKeyTokenCountMeta, meta)

	if priceData.FreeModel {
		logger.LogInfo(c, fmt.Sprintf("模型 %s 免费，跳过预扣费", relayInfo.OriginModelName))
	} else {
		newAPIError = service.PreConsumeBilling(c, priceData.QuotaToPreConsume, relayInfo)
		if newAPIError != nil {
			return
		}
	}
	if err := pricingruntime.CreateRequestPricingSnapshot(relayInfo); err != nil {
		if relayInfo.Billing != nil {
			relayInfo.Billing.Refund(c)
		}
		newAPIError = types.NewError(
			fmt.Errorf("create v2 pricing snapshot: %w", err),
			types.ErrorCodeModelPriceError,
			types.ErrOptionWithSkipRetry(),
		)
		return
	}

	defer func() {
		// Only return quota if downstream failed and quota was actually pre-consumed
		if newAPIError != nil {
			newAPIError = service.NormalizeViolationFeeError(newAPIError)
			if relayInfo.Billing != nil {
				if relayInfo.DynamicPricingSnapshot != nil &&
					relayInfo.DynamicPricingSnapshot.AuditCreated {
					requestId := relayInfo.RequestId
					relayInfo.Billing.RefundWithResult(c, func(refundErr error) {
						if refundErr != nil {
							pricingruntime.MarkRequestPricingPending(requestId)
							return
						}
						if err := pricingruntime.MarkRequestPricingRefunded(requestId); err != nil {
							common.SysError("mark refunded pricing snapshot error: " + err.Error())
						}
					})
				} else {
					relayInfo.Billing.Refund(c)
				}
			} else if relayInfo.DynamicPricingSnapshot != nil &&
				relayInfo.DynamicPricingSnapshot.AuditCreated {
				if err := pricingruntime.MarkRequestPricingRefunded(relayInfo.RequestId); err != nil {
					common.SysError("mark uncharged pricing snapshot refunded error: " + err.Error())
				}
			}
			service.ChargeViolationFeeIfNeeded(c, relayInfo, newAPIError)
		}
	}()

	retryParam := &service.RetryParam{
		Ctx:         c,
		TokenGroup:  relayInfo.TokenGroup,
		ModelName:   relayInfo.OriginModelName,
		RequestPath: c.Request.URL.Path,
		Retry:       common.GetPointer(0),
	}
	relayInfo.RetryIndex = 0
	relayInfo.LastError = nil
	retryLimit := relayRetryLimit(relayInfo)

	for ; retryParam.GetRetry() <= retryLimit; retryParam.IncreaseRetry() {
		relayInfo.RetryIndex = retryParam.GetRetry()
		channel, channelErr := getChannel(c, relayInfo, retryParam)
		if channelErr != nil {
			logger.LogError(c, channelErr.Error())
			newAPIError = channelErr
			break
		}

		addUsedChannel(c, channel.Id)
		bodyStorage, bodyErr := common.GetBodyStorage(c)
		if bodyErr != nil {
			// Ensure consistent 413 for oversized bodies even when error occurs later (e.g., retry path)
			if common.IsRequestBodyTooLargeError(bodyErr) || errors.Is(bodyErr, common.ErrRequestBodyTooLarge) {
				newAPIError = types.NewErrorWithStatusCode(bodyErr, types.ErrorCodeReadRequestBodyFailed, http.StatusRequestEntityTooLarge, types.ErrOptionWithSkipRetry())
			} else {
				newAPIError = types.NewErrorWithStatusCode(bodyErr, types.ErrorCodeReadRequestBodyFailed, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
			}
			break
		}
		c.Request.Body = io.NopCloser(bodyStorage)

		switch relayFormat {
		case types.RelayFormatOpenAIRealtime:
			newAPIError = relay.WssHelper(c, relayInfo)
		case types.RelayFormatClaude:
			newAPIError = relay.ClaudeHelper(c, relayInfo)
		case types.RelayFormatGemini:
			newAPIError = geminiRelayHandler(c, relayInfo)
		default:
			newAPIError = relayHandler(c, relayInfo)
		}

		if newAPIError == nil {
			if relayInfo.DynamicPricingSnapshot != nil {
				pricingruntime.RecordChannelSuccess(channel.Id)
			}
			relayInfo.LastError = nil
			return
		}

		newAPIError = service.NormalizeViolationFeeError(newAPIError)
		relayInfo.LastError = newAPIError

		processChannelError(c, *types.NewChannelError(channel.Id, channel.Type, channel.Name, channel.ChannelInfo.IsMultiKey, common.GetContextKeyString(c, constant.ContextKeyChannelKey), channel.GetAutoBan()), newAPIError)
		if relayInfo.DynamicPricingSnapshot != nil {
			pricingruntime.RecordChannelFailure(channel.Id, newAPIError.StatusCode)
		}

		if !shouldRetry(c, newAPIError, retryLimit-retryParam.GetRetry()) {
			break
		}
	}

	useChannel := c.GetStringSlice("use_channel")
	if len(useChannel) > 1 {
		retryLogStr := fmt.Sprintf("重试：%s", strings.Trim(strings.Join(strings.Fields(fmt.Sprint(useChannel)), "->"), "[]"))
		logger.LogInfo(c, retryLogStr)
	}
	if newAPIError != nil {
		gopool.Go(func() {
			perfmetrics.RecordRelaySample(relayInfo, false, 0)
		})
	}
}

func relayRetryLimit(info *relaycommon.RelayInfo) int {
	if info == nil || info.DynamicPricingSnapshot == nil {
		return common.RetryTimes
	}
	candidateCount := len(info.DynamicPricingSnapshot.RouteChannelIds)
	if candidateCount <= 1 {
		return 0
	}
	return candidateCount - 1
}

var upgrader = websocket.Upgrader{
	Subprotocols: []string{"realtime"}, // WS 握手支持的协议，如果有使用 Sec-WebSocket-Protocol，则必须在此声明对应的 Protocol TODO add other protocol
	CheckOrigin: func(r *http.Request) bool {
		return true // 允许跨域
	},
}

func addUsedChannel(c *gin.Context, channelId int) {
	useChannel := c.GetStringSlice("use_channel")
	useChannel = append(useChannel, fmt.Sprintf("%d", channelId))
	c.Set("use_channel", useChannel)
}

func fastTokenCountMetaForPricing(request dto.Request) *types.TokenCountMeta {
	if request == nil {
		return &types.TokenCountMeta{}
	}
	meta := &types.TokenCountMeta{
		TokenType: types.TokenTypeTokenizer,
	}
	switch r := request.(type) {
	case *dto.GeneralOpenAIRequest:
		maxCompletionTokens := lo.FromPtrOr(r.MaxCompletionTokens, uint(0))
		maxTokens := lo.FromPtrOr(r.MaxTokens, uint(0))
		if maxCompletionTokens > maxTokens {
			meta.MaxTokens = int(maxCompletionTokens)
		} else {
			meta.MaxTokens = int(maxTokens)
		}
	case *dto.OpenAIResponsesRequest:
		meta.MaxTokens = int(lo.FromPtrOr(r.MaxOutputTokens, uint(0)))
	case *dto.ClaudeRequest:
		meta.MaxTokens = int(lo.FromPtr(r.MaxTokens))
	case *dto.ImageRequest:
		// Pricing for image requests depends on ImagePriceRatio; safe to compute even when CountToken is disabled.
		return r.GetTokenCountMeta()
	default:
		// Best-effort: leave CombineText empty to avoid large allocations.
	}
	return meta
}

func estimatedPricingUsage(
	request dto.Request,
	relayInfo *relaycommon.RelayInfo,
	estimatedPromptTokens int,
) pricingengine.Usage {
	usage := pricingengine.Usage{RequestCount: 1}
	switch value := request.(type) {
	case *dto.ImageRequest:
		imageCount := uint(1)
		if value.N != nil && *value.N > 0 {
			imageCount = *value.N
		}
		if imageCount > dto.MaxImageN {
			imageCount = dto.MaxImageN
		}
		usage.ImageCount = float64(imageCount)
	case *dto.AudioRequest:
		usage.CharacterCount = float64(len([]rune(value.Input)))
		if relayInfo != nil &&
			(relayInfo.RelayMode == relayconstant.RelayModeAudioTranscription ||
				relayInfo.RelayMode == relayconstant.RelayModeAudioTranslation) &&
			estimatedPromptTokens > 0 {
			usage.AudioSeconds = float64(estimatedPromptTokens) * 60 / 1000
		}
	}
	return usage
}

func getChannel(c *gin.Context, info *relaycommon.RelayInfo, retryParam *service.RetryParam) (*model.Channel, *types.NewAPIError) {
	if info.ChannelMeta == nil {
		autoBan := c.GetBool("auto_ban")
		autoBanInt := 1
		if !autoBan {
			autoBanInt = 0
		}
		return &model.Channel{
			Id:      c.GetInt("channel_id"),
			Type:    c.GetInt("channel_type"),
			Name:    c.GetString("channel_name"),
			AutoBan: &autoBanInt,
		}, nil
	}
	if info.DynamicPricingSnapshot != nil {
		if retryParam.GetRetry() == 0 {
			channelId := common.GetContextKeyInt(c, constant.ContextKeyChannelId)
			channel, err := model.CacheGetChannel(channelId)
			if err != nil || channel == nil {
				return nil, types.NewError(
					fmt.Errorf("获取 V2 首选渠道 %d 失败: %v", channelId, err),
					types.ErrorCodeGetChannelFailed,
					types.ErrOptionWithSkipRetry(),
				)
			}
			return channel, nil
		}
		usedChannels := make(map[int]struct{}, len(c.GetStringSlice("use_channel")))
		for _, value := range c.GetStringSlice("use_channel") {
			if channelId, parseErr := strconv.Atoi(value); parseErr == nil {
				usedChannels[channelId] = struct{}{}
			}
		}
		for _, channelId := range info.DynamicPricingSnapshot.RouteChannelIds {
			if _, frozen := info.DynamicPricingSnapshot.
				CandidatesByChannelId[channelId]; !frozen {
				continue
			}
			if _, used := usedChannels[channelId]; used {
				continue
			}
			channel, getErr := model.CacheGetChannel(channelId)
			if getErr != nil ||
				channel == nil ||
				channel.Status != common.ChannelStatusEnabled ||
				!middleware.ChannelSupportsRequestPath(
					channel,
					c.Request.URL.Path,
					info.OriginModelName,
				) ||
				!pricingruntime.TryAcquireChannel(channel.Id) {
				continue
			}
			if newAPIError := middleware.SetupContextForSelectedChannel(
				c,
				channel,
				info.OriginModelName,
			); newAPIError != nil {
				continue
			}
			if bindErr := pricingruntime.BindSelectedChannel(info, channel.Id); bindErr != nil {
				return nil, types.NewError(
					fmt.Errorf("渠道 %d 缺少请求冻结的 V2 价格: %w", channel.Id, bindErr),
					types.ErrorCodeModelPriceError,
					types.ErrOptionWithSkipRetry(),
				)
			}
			info.PriceData.GroupRatioInfo = helper.HandleGroupRatio(c, info)
			return channel, nil
		}
		return nil, types.NewError(
			fmt.Errorf(
				"分组 %s 下模型 %s 没有剩余的 V2 重试渠道",
				info.UsingGroup,
				info.OriginModelName,
			),
			types.ErrorCodeGetChannelFailed,
			types.ErrOptionWithSkipRetry(),
		)
	}
	channel, selectGroup, err := service.CacheGetRandomSatisfiedChannel(retryParam)

	info.PriceData.GroupRatioInfo = helper.HandleGroupRatio(c, info)

	if err != nil {
		return nil, types.NewError(fmt.Errorf("获取分组 %s 下模型 %s 的可用渠道失败（retry）: %s", selectGroup, info.OriginModelName, err.Error()), types.ErrorCodeGetChannelFailed, types.ErrOptionWithSkipRetry())
	}
	if channel == nil {
		return nil, types.NewError(fmt.Errorf("分组 %s 下模型 %s 的可用渠道不存在（retry）", selectGroup, info.OriginModelName), types.ErrorCodeGetChannelFailed, types.ErrOptionWithSkipRetry())
	}

	newAPIError := middleware.SetupContextForSelectedChannel(c, channel, info.OriginModelName)
	if newAPIError != nil {
		return nil, newAPIError
	}
	if err := pricingruntime.BindSelectedChannel(info, channel.Id); err != nil {
		return nil, types.NewError(
			fmt.Errorf("渠道 %d 缺少请求冻结的 V2 价格: %w", channel.Id, err),
			types.ErrorCodeModelPriceError,
			types.ErrOptionWithSkipRetry(),
		)
	}
	return channel, nil
}

func shouldRetry(c *gin.Context, openaiErr *types.NewAPIError, retryTimes int) bool {
	if openaiErr == nil {
		return false
	}
	if service.ShouldSkipRetryAfterChannelAffinityFailure(c) {
		return false
	}
	if types.IsChannelError(openaiErr) {
		return true
	}
	if types.IsSkipRetryError(openaiErr) {
		return false
	}
	if retryTimes <= 0 {
		return false
	}
	if _, ok := c.Get("specific_channel_id"); ok {
		return false
	}
	code := openaiErr.StatusCode
	if code >= 200 && code < 300 {
		return false
	}
	if code < 100 || code > 599 {
		return true
	}
	if operation_setting.IsAlwaysSkipRetryCode(openaiErr.GetErrorCode()) {
		return false
	}
	return operation_setting.ShouldRetryByStatusCode(code)
}

func processChannelError(c *gin.Context, channelError types.ChannelError, err *types.NewAPIError) {
	logger.LogError(c, fmt.Sprintf("channel error (channel #%d, status code: %d): %s", channelError.ChannelId, err.StatusCode, common.LocalLogPreview(err.Error())))
	// 不要使用context获取渠道信息，异步处理时可能会出现渠道信息不一致的情况
	// do not use context to get channel info, there may be inconsistent channel info when processing asynchronously
	if service.ShouldDisableChannel(err) && channelError.AutoBan {
		gopool.Go(func() {
			service.DisableChannel(channelError, err.ErrorWithStatusCode())
		})
	}

	if constant.ErrorLogEnabled && types.IsRecordErrorLog(err) {
		// 保存错误日志到mysql中
		userId := c.GetInt("id")
		tokenName := c.GetString("token_name")
		modelName := c.GetString("original_model")
		tokenId := c.GetInt("token_id")
		userGroup := c.GetString("group")
		channelId := c.GetInt("channel_id")
		other := make(map[string]interface{})
		if c.Request != nil && c.Request.URL != nil {
			other["request_path"] = c.Request.URL.Path
		}
		other["error_type"] = err.GetErrorType()
		other["error_code"] = err.GetErrorCode()
		other["status_code"] = err.StatusCode
		other["channel_id"] = channelId
		other["channel_name"] = c.GetString("channel_name")
		other["channel_type"] = c.GetInt("channel_type")
		adminInfo := make(map[string]interface{})
		adminInfo["use_channel"] = c.GetStringSlice("use_channel")
		isMultiKey := common.GetContextKeyBool(c, constant.ContextKeyChannelIsMultiKey)
		if isMultiKey {
			adminInfo["is_multi_key"] = true
			adminInfo["multi_key_index"] = common.GetContextKeyInt(c, constant.ContextKeyChannelMultiKeyIndex)
		}
		service.AppendChannelAffinityAdminInfo(c, adminInfo)
		other["admin_info"] = adminInfo
		startTime := common.GetContextKeyTime(c, constant.ContextKeyRequestStartTime)
		if startTime.IsZero() {
			startTime = time.Now()
		}
		useTimeSeconds := int(time.Since(startTime).Seconds())
		model.RecordErrorLog(c, userId, channelId, modelName, tokenName, err.MaskSensitiveErrorWithStatusCode(), tokenId, useTimeSeconds, common.GetContextKeyBool(c, constant.ContextKeyIsStream), userGroup, other)
	}

}

func RelayMidjourney(c *gin.Context) {
	relayInfo, err := relaycommon.GenRelayInfo(c, types.RelayFormatMjProxy, nil, nil)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"description": fmt.Sprintf("failed to generate relay info: %s", err.Error()),
			"type":        "upstream_error",
			"code":        4,
		})
		return
	}

	var mjErr *taskdto.MidjourneyResponse
	switch relayInfo.RelayMode {
	case relayconstant.RelayModeMidjourneyNotify:
		mjErr = relay.RelayMidjourneyNotify(c)
	case relayconstant.RelayModeMidjourneyTaskFetch, relayconstant.RelayModeMidjourneyTaskFetchByCondition:
		mjErr = relay.RelayMidjourneyTask(c, relayInfo.RelayMode)
	case relayconstant.RelayModeMidjourneyTaskImageSeed:
		mjErr = relay.RelayMidjourneyTaskImageSeed(c)
	case relayconstant.RelayModeSwapFace:
		mjErr = relay.RelaySwapFace(c, relayInfo)
	default:
		mjErr = relay.RelayMidjourneySubmit(c, relayInfo)
	}
	//err = relayMidjourneySubmit(c, relayMode)
	log.Println(mjErr)
	if mjErr != nil {
		statusCode := http.StatusBadRequest
		if mjErr.Code == 30 {
			mjErr.Result = "当前分组负载已饱和，请稍后再试，或升级账户以提升服务质量。"
			statusCode = http.StatusTooManyRequests
		}
		c.JSON(statusCode, gin.H{
			"description": fmt.Sprintf("%s %s", mjErr.Description, mjErr.Result),
			"type":        "upstream_error",
			"code":        mjErr.Code,
		})
		channelId := c.GetInt("channel_id")
		logger.LogError(c, fmt.Sprintf("relay error (channel #%d, status code %d): %s", channelId, statusCode, fmt.Sprintf("%s %s", mjErr.Description, mjErr.Result)))
	}
}

func RelayNotImplemented(c *gin.Context) {
	err := types.OpenAIError{
		Message: "API not implemented",
		Type:    "new_api_error",
		Param:   "",
		Code:    "api_not_implemented",
	}
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": err,
	})
}

func RelayNotFound(c *gin.Context) {
	err := types.OpenAIError{
		Message: fmt.Sprintf("Invalid URL (%s %s)", c.Request.Method, c.Request.URL.Path),
		Type:    "invalid_request_error",
		Param:   "",
		Code:    "",
	}
	c.JSON(http.StatusNotFound, gin.H{
		"error": err,
	})
}

func RelayTaskFetch(c *gin.Context) {
	relayInfo, err := relaycommon.GenRelayInfo(c, types.RelayFormatTask, nil, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, &taskdto.TaskError{
			Code:       "gen_relay_info_failed",
			Message:    err.Error(),
			StatusCode: http.StatusInternalServerError,
		})
		return
	}
	if taskErr := relay.RelayTaskFetch(c, relayInfo.RelayMode); taskErr != nil {
		respondTaskError(c, taskErr)
	}
}

func RelayTask(c *gin.Context) {
	relayInfo, err := relaycommon.GenRelayInfo(c, types.RelayFormatTask, nil, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, &taskdto.TaskError{
			Code:       "gen_relay_info_failed",
			Message:    err.Error(),
			StatusCode: http.StatusInternalServerError,
		})
		return
	}

	if taskErr := relay.ResolveOriginTask(c, relayInfo); taskErr != nil {
		respondTaskError(c, taskErr)
		return
	}

	var result *relay.TaskSubmitResult
	var taskErr *taskdto.TaskError
	defer func() {
		if taskErr != nil && relayInfo.Billing != nil && !relayInfo.UpstreamTaskAccepted {
			if relayInfo.DynamicPricingSnapshot != nil &&
				relayInfo.DynamicPricingSnapshot.AuditCreated {
				requestId := relayInfo.RequestId
				relayInfo.Billing.RefundWithResult(c, func(refundErr error) {
					if refundErr != nil {
						pricingruntime.MarkRequestPricingPending(requestId)
						return
					}
					if err := pricingruntime.MarkRequestPricingRefunded(requestId); err != nil {
						common.SysError("mark refunded task pricing snapshot error: " + err.Error())
					}
				})
			} else {
				relayInfo.Billing.Refund(c)
			}
		} else if taskErr != nil &&
			relayInfo.DynamicPricingSnapshot != nil &&
			relayInfo.DynamicPricingSnapshot.AuditCreated {
			if err := pricingruntime.MarkRequestPricingRefunded(relayInfo.RequestId); err != nil {
				common.SysError("mark uncharged task pricing snapshot refunded error: " + err.Error())
			}
		}
	}()

	retryParam := &service.RetryParam{
		Ctx:         c,
		TokenGroup:  relayInfo.TokenGroup,
		ModelName:   relayInfo.OriginModelName,
		RequestPath: c.Request.URL.Path,
		Retry:       common.GetPointer(0),
	}

	for ; retryParam.GetRetry() <= common.RetryTimes; retryParam.IncreaseRetry() {
		var channel *model.Channel

		if lockedCh, ok := relayInfo.LockedChannel.(*model.Channel); ok && lockedCh != nil {
			channel = lockedCh
			if retryParam.GetRetry() > 0 {
				if setupErr := middleware.SetupContextForSelectedChannel(c, channel, relayInfo.OriginModelName); setupErr != nil {
					taskErr = service.TaskErrorWrapperLocal(setupErr.Err, "setup_locked_channel_failed", http.StatusInternalServerError)
					break
				}
			}
		} else {
			var channelErr *types.NewAPIError
			channel, channelErr = getChannel(c, relayInfo, retryParam)
			if channelErr != nil {
				logger.LogError(c, channelErr.Error())
				taskErr = service.TaskErrorWrapperLocal(channelErr.Err, "get_channel_failed", http.StatusInternalServerError)
				break
			}
		}

		addUsedChannel(c, channel.Id)
		bodyStorage, bodyErr := common.GetBodyStorage(c)
		if bodyErr != nil {
			if common.IsRequestBodyTooLargeError(bodyErr) || errors.Is(bodyErr, common.ErrRequestBodyTooLarge) {
				taskErr = service.TaskErrorWrapperLocal(bodyErr, "read_request_body_failed", http.StatusRequestEntityTooLarge)
			} else {
				taskErr = service.TaskErrorWrapperLocal(bodyErr, "read_request_body_failed", http.StatusBadRequest)
			}
			break
		}
		c.Request.Body = io.NopCloser(bodyStorage)

		result, taskErr = relay.RelayTaskSubmit(c, relayInfo)
		if taskErr == nil {
			if relayInfo.DynamicPricingSnapshot != nil {
				pricingruntime.RecordChannelSuccess(channel.Id)
			}
			break
		}

		if !taskErr.LocalError {
			processChannelError(c,
				*types.NewChannelError(channel.Id, channel.Type, channel.Name, channel.ChannelInfo.IsMultiKey,
					common.GetContextKeyString(c, constant.ContextKeyChannelKey), channel.GetAutoBan()),
				types.NewOpenAIError(taskErr.Error, types.ErrorCodeBadResponseStatusCode, taskErr.StatusCode))
		}
		if relayInfo.DynamicPricingSnapshot != nil {
			pricingruntime.RecordChannelFailure(channel.Id, taskErr.StatusCode)
		}

		if !shouldRetryTaskRelay(c, channel.Id, taskErr, common.RetryTimes-retryParam.GetRetry()) {
			break
		}
	}

	useChannel := c.GetStringSlice("use_channel")
	if len(useChannel) > 1 {
		retryLogStr := fmt.Sprintf("重试：%s", strings.Trim(strings.Join(strings.Fields(fmt.Sprint(useChannel)), "->"), "[]"))
		logger.LogInfo(c, retryLogStr)
	}

	// ── 成功：结算 + 日志 + 插入任务 ──
	if taskErr == nil {
		persistedTaskID := relayInfo.PersistedTaskID
		if relayInfo.PersistedTaskID == 0 {
			task := model.InitTask(result.Platform, relayInfo)
			task.PrivateData.UpstreamTaskID = result.UpstreamTaskID
			task.PrivateData.BillingSource = relayInfo.BillingSource
			task.PrivateData.SubscriptionId = relayInfo.SubscriptionId
			task.PrivateData.TokenId = relayInfo.TokenId
			task.PrivateData.NodeName = common.NodeName
			task.PrivateData.BillingContext = service.NewTaskBillingContext(relayInfo)
			task.Quota = relayInfo.FinalPreConsumedQuota
			task.SettlementTargetQuota = result.Quota
			task.SettlementStatus = model.TaskSettlementStatusPending
			task.Data = result.TaskData
			task.Action = relayInfo.Action
			if insertErr := task.Insert(); insertErr != nil {
				common.SysError("insert task error: " + insertErr.Error())
				taskErr = service.TaskErrorWrapperLocal(insertErr, "insert_task_failed", http.StatusInternalServerError)
			} else {
				persistedTaskID = task.ID
			}
		}
		if taskErr == nil {
			chargedQuota := result.Quota
			initialSettlementCompleted := true
			if settleErr := service.SettleBilling(c, relayInfo, result.Quota); settleErr != nil {
				initialSettlementCompleted = false
				common.SysError("settle task billing error: " + settleErr.Error())
				chargedQuota = relayInfo.FinalPreConsumedQuota
				if markErr := model.UpdateTaskInitialSettlement(
					persistedTaskID,
					chargedQuota,
					result.Quota,
					model.TaskSettlementStatusPending,
					settleErr.Error(),
				); markErr != nil {
					common.SysError("mark initial task settlement pending error: " + markErr.Error())
				}
			} else if markErr := model.UpdateTaskInitialSettlement(
				persistedTaskID,
				result.Quota,
				result.Quota,
				model.TaskSettlementStatusCompleted,
				"",
			); markErr != nil {
				common.SysError("mark initial task settlement completed error: " + markErr.Error())
			}
			if initialSettlementCompleted && relayInfo.DynamicPricingSnapshot != nil {
				if snapshotErr := pricingruntime.SettleRequestPricingSnapshot(
					relayInfo,
					&dto.Usage{},
					chargedQuota,
				); snapshotErr != nil {
					pricingruntime.MarkRequestPricingPending(relayInfo.RequestId)
					common.SysError("settle task pricing snapshot error: " + snapshotErr.Error())
				}
			} else if relayInfo.DynamicPricingSnapshot != nil {
				pricingruntime.MarkRequestPricingPending(relayInfo.RequestId)
			}
			service.LogTaskConsumption(c, relayInfo, chargedQuota)
			if response, exists := c.Get("deferred_task_response"); exists {
				c.JSON(http.StatusAccepted, response)
			}
		}
	}
	if taskErr != nil && relayInfo.PersistedTaskID > 0 && relayInfo.UpstreamTaskAccepted {
		if task, err := model.GetTaskByID(relayInfo.PersistedTaskID); err == nil {
			task.PrivateData.UpstreamTaskID = relayInfo.AcceptedUpstreamTaskID
			task.Data = relayInfo.AcceptedTaskData
			task.Action = relayInfo.Action
			task.Quota = relayInfo.FinalPreConsumedQuota
			task.SettlementTargetQuota = relayInfo.PriceData.Quota
			task.SettlementStatus = model.TaskSettlementStatusPending
			task.Status = model.TaskStatusSubmitted
			task.Progress = "0%"
			if updateErr := task.Update(); updateErr == nil {
				chargedQuota := relayInfo.PriceData.Quota
				if settleErr := service.SettleBilling(c, relayInfo, relayInfo.PriceData.Quota); settleErr != nil {
					chargedQuota = relayInfo.FinalPreConsumedQuota
					_ = model.UpdateTaskInitialSettlement(task.ID, chargedQuota, relayInfo.PriceData.Quota, model.TaskSettlementStatusPending, settleErr.Error())
				} else {
					_ = model.UpdateTaskInitialSettlement(task.ID, chargedQuota, chargedQuota, model.TaskSettlementStatusCompleted, "")
				}
				service.LogTaskConsumption(c, relayInfo, chargedQuota)
				if response, exists := c.Get("deferred_task_response"); exists {
					c.JSON(http.StatusAccepted, response)
				}
				taskErr = nil
			} else {
				common.SysError(fmt.Sprintf(
					"CRITICAL: provider accepted task but local recovery failed public_task=%s upstream_task=%s error=%s",
					relayInfo.PublicTaskID, relayInfo.AcceptedUpstreamTaskID, updateErr.Error(),
				))
			}
		}
	}
	if taskErr != nil && relayInfo.PersistedTaskID > 0 && !relayInfo.UpstreamTaskAccepted {
		if task, err := model.GetTaskByID(relayInfo.PersistedTaskID); err == nil {
			task.Status = model.TaskStatusFailure
			task.Progress = "100%"
			task.FailReason = taskErr.Message
			task.Quota = 0
			if updateErr := task.Update(); updateErr != nil {
				common.SysError("mark provisional task failed: " + updateErr.Error())
			}
		}
	}

	if taskErr != nil {
		respondTaskError(c, taskErr)
	}
}

// respondTaskError 统一输出 Task 错误响应（含 429 限流提示改写）
func respondTaskError(c *gin.Context, taskErr *taskdto.TaskError) {
	if taskErr.StatusCode == http.StatusTooManyRequests {
		taskErr.Message = "当前分组上游负载已饱和，请稍后再试"
	}
	c.JSON(taskErr.StatusCode, taskErr)
}

func shouldRetryTaskRelay(c *gin.Context, channelId int, taskErr *taskdto.TaskError, retryTimes int) bool {
	if taskErr == nil {
		return false
	}
	if taskErr.LocalError {
		return false
	}
	if service.ShouldSkipRetryAfterChannelAffinityFailure(c) {
		return false
	}
	if retryTimes <= 0 {
		return false
	}
	if _, ok := c.Get("specific_channel_id"); ok {
		return false
	}
	if taskErr.StatusCode == http.StatusTooManyRequests {
		return true
	}
	if taskErr.StatusCode == 307 {
		return true
	}
	if taskErr.StatusCode/100 == 5 {
		// 超时不重试
		if operation_setting.IsAlwaysSkipRetryStatusCode(taskErr.StatusCode) {
			return false
		}
		return true
	}
	if taskErr.StatusCode == http.StatusBadRequest {
		return false
	}
	if taskErr.StatusCode == 408 {
		// azure处理超时不重试
		return false
	}
	if taskErr.StatusCode/100 == 2 {
		return false
	}
	return true
}
