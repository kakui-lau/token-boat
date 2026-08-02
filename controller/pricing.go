package controller

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/service/pricingengine"
	"github.com/QuantumNous/new-api/service/pricingruntime"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

func scopePricingByUsableGroups(pricing []model.Pricing, usableGroup map[string]string) []model.Pricing {
	if len(pricing) == 0 {
		return pricing
	}

	scoped := make([]model.Pricing, 0, len(pricing))
	for _, item := range pricing {
		if common.StringsContains(item.EnableGroup, "all") {
			scoped = append(scoped, item)
			continue
		}
		groups := make([]string, 0, len(item.EnableGroup))
		for _, group := range item.EnableGroup {
			if _, ok := usableGroup[group]; ok {
				groups = append(groups, group)
			}
		}
		item.EnableGroup = groups
		scoped = append(scoped, item)
	}
	return scoped
}

func markPricingAvailability(pricing []model.Pricing) []model.Pricing {
	for index := range pricing {
		hasUsableRoute := len(pricing[index].EnableGroup) > 0
		hasActiveV2Price := pricing[index].PricingSource == "v2_dynamic"
		if hasActiveV2Price && hasUsableRoute {
			pricing[index].Available = true
			pricing[index].AvailabilityStatus = model.PricingAvailabilityAvailable
			continue
		}
		pricing[index].Available = false
		if !hasUsableRoute {
			pricing[index].AvailabilityStatus = model.PricingAvailabilityRouteUnavailable
			continue
		}
		pricing[index].AvailabilityStatus = model.PricingAvailabilityPriceUnavailable
	}
	return pricing
}

func GetPricing(c *gin.Context) {
	pricing := model.GetPublicPricing()
	userId, exists := c.Get("id")
	usableGroup := map[string]string{}
	groupRatio := map[string]float64{}
	var group string
	if exists {
		user, err := model.GetUserCache(userId.(int))
		if err == nil {
			group = user.Group
		}
	}

	usableGroup = service.GetUserUsableGroups(group)
	for usableGroupName := range usableGroup {
		groupRatio[usableGroupName] = service.GetUserGroupRatio(group, usableGroupName)
	}
	pricing = scopePricingByUsableGroups(pricing, usableGroup)
	pricing = pricingruntime.ApplyV2RetailPricing(pricing, usableGroup, groupRatio)
	pricing = markPricingAvailability(pricing)

	c.JSON(200, gin.H{
		"success":            true,
		"data":               pricing,
		"vendors":            model.GetVendors(),
		"group_ratio":        groupRatio,
		"usable_group":       usableGroup,
		"supported_endpoint": model.GetSupportedEndpointMap(),
		"auto_groups":        service.GetUserAutoGroup(group),
		"pricing_version":    "a42d372ccf0b5dd13ecf71203521f9d2",
	})
}

type PricingQuoteInput struct {
	ModelName string `json:"model_name"`
	Group     string `json:"group,omitempty"`
	pricingengine.Usage
}

func QuotePricing(c *gin.Context) {
	var input PricingQuoteInput
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	input.ModelName = strings.TrimSpace(input.ModelName)
	if input.ModelName == "" {
		common.ApiError(c, errors.New("model_name is required"))
		return
	}
	userGroup := common.GetContextKeyString(c, constant.ContextKeyUserGroup)
	requestedGroup := strings.TrimSpace(input.Group)
	if requestedGroup == "" {
		requestedGroup = userGroup
	}
	if requestedGroup != userGroup &&
		!service.GroupInUserUsableGroups(userGroup, requestedGroup) {
		common.ApiErrorMsg(c, "无权使用指定分组报价")
		return
	}
	quoteGroups := []string{requestedGroup}
	if requestedGroup == "auto" {
		quoteGroups = service.GetUserAutoGroup(userGroup)
	}
	var quoteRange pricingruntime.RetailQuoteRange
	selectedGroup := ""
	for _, quoteGroup := range quoteGroups {
		if !pricingruntime.HasCompleteV2Pricing(quoteGroup, input.ModelName) {
			continue
		}
		var err error
		quoteRange, err = pricingruntime.QuoteRetailRange(
			quoteGroup,
			input.ModelName,
			input.Usage,
			service.GetUserGroupRatio(userGroup, quoteGroup),
		)
		if err != nil {
			if requestedGroup == "auto" && errors.Is(
				err,
				pricingruntime.ErrNoEligiblePriceCandidate,
			) {
				continue
			}
			common.ApiError(c, err)
			return
		}
		selectedGroup = quoteGroup
		break
	}
	if selectedGroup == "" {
		common.ApiError(c, errors.New("no complete v2 price is available for this model and group"))
		return
	}
	common.ApiSuccess(c, gin.H{
		"model_name":                 input.ModelName,
		"group":                      selectedGroup,
		"currency":                   quoteRange.Currency,
		"minimum_retail_amount":      quoteRange.MinimumRetailAmount,
		"maximum_reservation_amount": quoteRange.MaximumReservationAmount,
		"eligible_candidate_count":   quoteRange.EligibleCandidateCount,
	})
}

func ResetModelRatio(c *gin.Context) {
	defaultStr := ratio_setting.DefaultModelRatio2JSONString()
	err := model.UpdateOption("ModelRatio", defaultStr)
	if err != nil {
		c.JSON(200, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	err = ratio_setting.UpdateModelRatioByJSONString(defaultStr)
	if err != nil {
		c.JSON(200, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(200, gin.H{
		"success": true,
		"message": "重置模型倍率成功",
	})
}
