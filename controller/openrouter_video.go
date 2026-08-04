package controller

import (
	"net/http"
	"sort"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay"
	"github.com/gin-gonic/gin"
)

func ListOpenRouterVideoModels(c *gin.Context) {
	groups, err := getModelListGroups(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, dto.OpenRouterVideoErrorResponse{
			Error: dto.OpenRouterVideoErrorData{Code: http.StatusInternalServerError, Message: "Internal Server Error"},
		})
		return
	}

	abilities, err := model.GetAllEnableAbilityWithChannels()
	if err != nil {
		c.JSON(http.StatusInternalServerError, dto.OpenRouterVideoErrorResponse{
			Error: dto.OpenRouterVideoErrorData{Code: http.StatusInternalServerError, Message: "Internal Server Error"},
		})
		return
	}

	allowedGroups := make(map[string]bool, len(groups.ownerGroups))
	for _, group := range groups.ownerGroups {
		allowedGroups[group] = true
	}
	modelLimitEnabled := common.GetContextKeyBool(c, constant.ContextKeyTokenModelLimitEnabled)
	var modelLimit map[string]bool
	if modelLimitEnabled {
		value, _ := common.GetContextKey(c, constant.ContextKeyTokenModelLimit)
		modelLimit, _ = value.(map[string]bool)
	}

	modelsByID := make(map[string]dto.OpenRouterVideoModel)
	for _, ability := range abilities {
		if !allowedGroups[ability.Group] || (modelLimitEnabled && !modelLimit[ability.Model]) {
			continue
		}
		platform := constant.TaskPlatform(strconv.Itoa(ability.ChannelType))
		if relay.GetTaskAdaptor(platform) == nil {
			continue
		}
		if _, exists := modelsByID[ability.Model]; exists {
			continue
		}
		modelsByID[ability.Model] = dto.OpenRouterVideoModel{
			ID:                           ability.Model,
			CanonicalSlug:                ability.Model,
			Name:                         ability.Model,
			Created:                      0,
			SupportedResolutions:         nil,
			SupportedAspectRatios:        nil,
			SupportedSizes:               nil,
			SupportedDurations:           nil,
			SupportedFrameImages:         nil,
			GenerateAudio:                nil,
			Seed:                         nil,
			AllowedPassthroughParameters: []string{},
		}
	}

	modelIDs := make([]string, 0, len(modelsByID))
	for modelID := range modelsByID {
		modelIDs = append(modelIDs, modelID)
	}
	sort.Strings(modelIDs)
	response := dto.OpenRouterVideoModelsResponse{Data: make([]dto.OpenRouterVideoModel, 0, len(modelIDs))}
	for _, modelID := range modelIDs {
		response.Data = append(response.Data, modelsByID[modelID])
	}
	c.JSON(http.StatusOK, response)
}
