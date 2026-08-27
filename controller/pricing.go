package controller

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/service/pricingengine"
	"github.com/QuantumNous/new-api/service/pricingruntime"

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
		hasSalesPrice := pricing[index].PricingSource == "sales_price_book"
		if hasSalesPrice && hasUsableRoute {
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

func filterAvailablePublicPricing(pricing []model.Pricing) []model.Pricing {
	available := make([]model.Pricing, 0, len(pricing))
	for _, item := range pricing {
		if item.Available && item.AvailabilityStatus == model.PricingAvailabilityAvailable {
			available = append(available, item)
		}
	}
	return available
}

func publicPricingVersion(
	pricing []model.Pricing,
	groupRatio map[string]float64,
	usableGroup map[string]string,
) string {
	payload, err := common.Marshal(struct {
		Pricing     []model.Pricing    `json:"pricing"`
		GroupRatio  map[string]float64 `json:"group_ratio"`
		UsableGroup map[string]string  `json:"usable_group"`
	}{
		Pricing: pricing, GroupRatio: groupRatio, UsableGroup: usableGroup,
	})
	if err != nil {
		common.SysError("failed to generate public pricing version: " + err.Error())
		return ""
	}
	return fmt.Sprintf("%x", sha256.Sum256(payload))
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
	resolvedUserId := 0
	if exists {
		resolvedUserId = userId.(int)
	}
	pricing = pricingruntime.ApplySalesPriceBookPricing(
		pricing,
		resolvedUserId,
		usableGroup,
	)
	pricing = markPricingAvailability(pricing)
	pricing = filterAvailablePublicPricing(pricing)

	c.JSON(200, gin.H{
		"success":            true,
		"data":               pricing,
		"vendors":            model.GetVendors(),
		"group_ratio":        groupRatio,
		"usable_group":       usableGroup,
		"supported_endpoint": model.GetSupportedEndpointMap(),
		"auto_groups":        service.GetUserAutoGroup(group),
		"pricing_version":    publicPricingVersion(pricing, groupRatio, usableGroup),
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
	resolution, err := model.ResolveModelRouting(input.ModelName)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	requestedModelName := resolution.RequestedModelName
	input.ModelName = resolution.ResolvedModelName
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
	var quoteRange pricingruntime.SalesQuoteRange
	selectedGroup := ""
	for _, quoteGroup := range quoteGroups {
		if !pricingruntime.HasCompletePricing(quoteGroup, input.ModelName) {
			continue
		}
		quoteRange, err = pricingruntime.QuoteSalesPrice(
			c.GetInt("id"),
			quoteGroup,
			input.ModelName,
			input.Usage,
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
		common.ApiError(c, errors.New("no complete purchase and sales price is available for this model and group"))
		return
	}
	common.ApiSuccess(c, gin.H{
		"model_name":                 requestedModelName,
		"resolved_model_name":        input.ModelName,
		"group":                      selectedGroup,
		"currency":                   quoteRange.Currency,
		"sales_amount":               quoteRange.SalesAmount,
		"maximum_reservation_amount": quoteRange.MaximumReservationAmount,
		"eligible_candidate_count":   quoteRange.EligibleCandidateCount,
	})
}
