package pricingruntime

import (
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/shopspring/decimal"
)

const publicPriceDecimalPlaces int32 = 8

type publicPriceFields struct {
	InputUnitPrice            string `json:"input_unit_price"`
	OutputUnitPrice           string `json:"output_unit_price"`
	CacheReadUnitPrice        string `json:"cache_read_unit_price"`
	CacheWriteUnitPrice       string `json:"cache_write_unit_price"`
	CacheWrite1HUnitPrice     string `json:"cache_write_1h_unit_price"`
	ImageInputUnitPrice       string `json:"image_input_unit_price"`
	ImageOutputUnitPrice      string `json:"image_output_unit_price"`
	CachedImageInputUnitPrice string `json:"cached_image_input_unit_price"`
	AudioInputUnitPrice       string `json:"audio_input_unit_price"`
	AudioOutputUnitPrice      string `json:"audio_output_unit_price"`
	RequestUnitPrice          string `json:"request_unit_price"`
	VideoSecondUnitPrice      string `json:"video_second_unit_price"`
}

type publicPriceTier struct {
	publicPriceFields
	Name       string `json:"name"`
	UpperBound string `json:"upper_bound"`
}

type publicPriceRule struct {
	Name       string `json:"name"`
	Component  string `json:"component"`
	Unit       string `json:"unit"`
	UnitSize   string `json:"unit_size"`
	UnitPrice  string `json:"unit_price"`
	UpperBound string `json:"upper_bound"`
	Operation  string `json:"operation"`
	Quality    string `json:"quality"`
	Resolution string `json:"resolution"`
	WithAudio  string `json:"with_audio"`
}

type publicPriceComponents struct {
	publicPriceFields
	PriceUnit string            `json:"price_unit"`
	Tiers     []publicPriceTier `json:"tiers"`
	Rules     []publicPriceRule `json:"rules"`
}

type publicPriceCandidate struct {
	bundle     ActivePriceBundle
	group      string
	groupLabel string
	factor     decimal.Decimal
}

// HasSafeStructuredCatalogPricing reports whether a group has at least one
// complete candidate whose structured price items remain above the configured
// margin floor after the user's effective group multiplier. Expression-only
// contracts pass through here and are validated with concrete usage later.
func HasSafeStructuredCatalogPricing(
	group string,
	modelName string,
	groupRatio float64,
) bool {
	return len(publicPricingCandidates(
		modelName,
		map[string]string{group: group},
		map[string]float64{group: groupRatio},
	)) > 0
}

func ApplyV2RetailPricing(
	pricing []model.Pricing,
	usableGroups map[string]string,
	groupRatios map[string]float64,
) []model.Pricing {
	officialByModel := map[string]model.OfficialModelPriceVersion{}
	if snapshot, ok := getCatalogSnapshot(); ok {
		officialByModel = snapshot.OfficialByModelName
	}
	for index := range pricing {
		if official, exists := officialByModel[pricing[index].ModelName]; exists {
			pricing[index].OfficialPrice = buildPublicPriceSummary(
				official.BillingMode,
				official.PriceStructure,
				official.Currency,
				official.PriceComponents,
				decimal.NewFromInt(1),
			)
		}

		candidates := publicPricingCandidates(
			pricing[index].ModelName,
			usableGroups,
			groupRatios,
		)
		if len(candidates) == 0 {
			continue
		}
		pricing[index].PricingSource = "v2_dynamic"
		pricing[index].LowestPrice = buildLowestPublicPriceSummary(candidates)
		pricesByGroup := make(map[string]*model.PublicPriceSummary)
		candidatesByGroup := make(map[string][]publicPriceCandidate)
		for _, candidate := range candidates {
			candidatesByGroup[candidate.group] = append(
				candidatesByGroup[candidate.group],
				candidate,
			)
		}
		groupNames := make([]string, 0, len(candidatesByGroup))
		for group := range candidatesByGroup {
			groupNames = append(groupNames, group)
		}
		sort.Strings(groupNames)
		for _, group := range groupNames {
			if summary := buildLowestPublicPriceSummary(candidatesByGroup[group]); summary != nil {
				pricesByGroup[group] = summary
			}
		}
		pricing[index].PricingGroups = groupNames
		if len(pricesByGroup) > 0 {
			pricing[index].RetailPricesByGroup = pricesByGroup
		}

		// Keep the expression fields for older clients. New clients use the
		// normalized summaries above and never parse the runtime expression.
		selected := candidates[0].bundle
		pricing[index].BillingMode = "tiered_expr"
		pricing[index].BillingExpr = selected.Retail.RetailBillingExpr
		pricing[index].PricingVersion = selected.Revision
	}
	return pricing
}

// ApplySalesPriceBookPricing publishes the customer-specific sales price book
// while keeping upstream purchase prices and route selection private. The same
// logical-model sales price is shown for every usable group that has at least
// one margin-safe purchase route.
func ApplySalesPriceBookPricing(
	pricing []model.Pricing,
	userId int,
	usableGroups map[string]string,
) []model.Pricing {
	officialByModel := map[string]model.OfficialModelPriceVersion{}
	if snapshot, ok := getCatalogSnapshot(); ok {
		officialByModel = snapshot.OfficialByModelName
	}
	for index := range pricing {
		if official, exists := officialByModel[pricing[index].ModelName]; exists {
			pricing[index].OfficialPrice = buildPublicPriceSummary(
				official.BillingMode,
				official.PriceStructure,
				official.Currency,
				official.PriceComponents,
				decimal.NewFromInt(1),
			)
		}

		resolved, err := ResolveSalesPrice(userId, pricing[index].ModelName, 0)
		if err != nil {
			continue
		}
		groupNames := make([]string, 0, len(usableGroups))
		for group := range usableGroups {
			groupNames = append(groupNames, group)
		}
		sort.Strings(groupNames)
		eligibleGroups := make([]string, 0, len(groupNames))
		eligibleRoutes := make(map[int]struct{})
		for _, group := range groupNames {
			groupEligible := false
			for _, bundle := range GetPurchaseCandidateBundles(group, pricing[index].ModelName) {
				if !salesPriceBookCandidateHasSafeStructuredMargins(resolved, bundle) {
					continue
				}
				groupEligible = true
				eligibleRoutes[bundle.ChannelModel.Id] = struct{}{}
			}
			if groupEligible {
				eligibleGroups = append(eligibleGroups, group)
			}
		}
		if len(eligibleGroups) == 0 {
			continue
		}

		pricing[index].PricingSource = "sales_price_book"
		pricing[index].PricingGroups = eligibleGroups
		pricing[index].BillingMode = "tiered_expr"
		pricing[index].BillingExpr = resolved.Item.SalesBillingExpr
		pricing[index].PricingVersion = resolved.Version.ContentHash

		baseSummary := buildPublicPriceSummary(
			resolved.Item.BillingMode,
			resolved.Item.PriceStructure,
			resolved.Item.Currency,
			resolved.Item.PriceComponents,
			decimal.NewFromInt(1),
		)
		if baseSummary == nil {
			continue
		}
		baseSummary.ComparisonScope = "sales_price_book"
		baseSummary.CandidateCount = len(eligibleRoutes)
		pricing[index].LowestPrice = baseSummary
		pricesByGroup := make(map[string]*model.PublicPriceSummary, len(eligibleGroups))
		for _, group := range eligibleGroups {
			summary := buildPublicPriceSummary(
				resolved.Item.BillingMode,
				resolved.Item.PriceStructure,
				resolved.Item.Currency,
				resolved.Item.PriceComponents,
				decimal.NewFromInt(1),
			)
			if summary == nil {
				continue
			}
			summary.ComparisonScope = "sales_price_book"
			summary.CandidateCount = len(eligibleRoutes)
			for itemIndex := range summary.Items {
				summary.Items[itemIndex].BaseAmount = summary.Items[itemIndex].Amount
				summary.Items[itemIndex].AppliedGroup = group
				summary.Items[itemIndex].AppliedGroupLabel = usableGroups[group]
				summary.Items[itemIndex].AppliedGroupRatio = "1"
			}
			pricesByGroup[group] = summary
		}
		if len(pricesByGroup) > 0 {
			pricing[index].RetailPricesByGroup = pricesByGroup
		}
	}
	return pricing
}

func salesPriceBookCandidateHasSafeStructuredMargins(
	resolved ResolvedSalesPrice,
	bundle ActivePriceBundle,
) bool {
	purchase := buildPublicPriceSummary(
		bundle.Purchase.BillingMode,
		bundle.Purchase.PriceStructure,
		bundle.Purchase.Currency,
		bundle.Purchase.PriceComponents,
		decimal.NewFromInt(1),
	)
	sales := buildPublicPriceSummary(
		resolved.Item.BillingMode,
		resolved.Item.PriceStructure,
		resolved.Item.Currency,
		resolved.Item.PriceComponents,
		decimal.NewFromInt(1),
	)
	if purchase == nil || sales == nil {
		// Expression-only contracts cannot be evaluated without concrete usage.
		// Request-time quoting remains authoritative and fails closed on margin.
		return true
	}
	if purchase.Currency != sales.Currency {
		return false
	}
	variableCostRate, err := parseRate(
		"total variable cost rate",
		resolved.Version.TotalVariableCostRate,
	)
	if err != nil {
		return false
	}
	taxRate, err := parseRate("effective tax rate", resolved.Version.EffectiveTaxRate)
	if err != nil {
		return false
	}
	minimumMarginValue := resolved.Version.MinimumMarginRate
	if resolved.Item.MinimumMarginOverride != "" {
		minimumMarginValue = resolved.Item.MinimumMarginOverride
	}
	minimumMargin, err := parseMargin(minimumMarginValue)
	if err != nil {
		return false
	}
	purchaseByKey := make(map[string]decimal.Decimal, len(purchase.Items))
	for _, item := range purchase.Items {
		amount, parseErr := decimal.NewFromString(item.Amount)
		if parseErr != nil {
			return false
		}
		purchaseByKey[item.Key] = amount
	}
	if len(purchaseByKey) != len(sales.Items) {
		return false
	}
	for _, item := range sales.Items {
		purchaseAmount, exists := purchaseByKey[item.Key]
		if !exists {
			return false
		}
		salesAmount, parseErr := decimal.NewFromString(item.Amount)
		if parseErr != nil || !meetsMinimumMargin(
			calculateNetMargin(purchaseAmount, salesAmount, variableCostRate, taxRate),
			minimumMargin,
		) {
			return false
		}
	}
	return true
}

func publicPricingCandidates(
	modelName string,
	usableGroups map[string]string,
	groupRatios map[string]float64,
) []publicPriceCandidate {
	result := make([]publicPriceCandidate, 0)
	seen := make(map[string]struct{})
	groupNames := make([]string, 0, len(usableGroups))
	for group := range usableGroups {
		groupNames = append(groupNames, group)
	}
	sort.Strings(groupNames)
	for _, group := range groupNames {
		groupLabel := usableGroups[group]
		factor := decimal.NewFromInt(1)
		if configured, exists := groupRatios[group]; exists {
			if configured < 0 || math.IsNaN(configured) || math.IsInf(configured, 0) {
				continue
			}
			factor = decimal.NewFromFloat(configured)
		}
		for _, bundle := range GetCandidateBundles(group, modelName) {
			candidate := publicPriceCandidate{
				bundle: bundle, group: group, groupLabel: groupLabel, factor: factor,
			}
			if !candidateHasSafeStructuredMargins(candidate) {
				continue
			}
			key := fmt.Sprintf(
				"%s:%d:%s",
				group,
				bundle.ChannelModel.Id,
				factor.String(),
			)
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}
			result = append(result, candidate)
		}
	}
	sort.SliceStable(result, func(left int, right int) bool {
		if result[left].group != result[right].group {
			return result[left].group < result[right].group
		}
		return result[left].bundle.ChannelModel.Id < result[right].bundle.ChannelModel.Id
	})
	return result
}

func candidateHasSafeStructuredMargins(candidate publicPriceCandidate) bool {
	purchase := buildPublicPriceSummary(
		candidate.bundle.Purchase.BillingMode,
		candidate.bundle.Purchase.PriceStructure,
		candidate.bundle.Purchase.Currency,
		candidate.bundle.Purchase.PriceComponents,
		decimal.NewFromInt(1),
	)
	retail := buildPublicPriceSummary(
		candidate.bundle.Retail.BillingMode,
		candidate.bundle.Retail.PriceStructure,
		candidate.bundle.Retail.Currency,
		candidate.bundle.Retail.PriceComponents,
		decimal.NewFromInt(1),
	)
	if purchase == nil || retail == nil {
		// Expression-only prices still receive the authoritative request-time
		// margin check because a catalog page has no concrete usage to evaluate.
		return true
	}
	variableCostRate, err := parseRate(
		"total variable cost rate",
		candidate.bundle.Retail.TotalVariableCostRate,
	)
	if err != nil {
		return false
	}
	taxRate, err := parseRate(
		"effective tax rate",
		candidate.bundle.Retail.EffectiveTaxRate,
	)
	if err != nil {
		return false
	}
	minimumMargin, err := parseMargin(candidate.bundle.Retail.MinimumMarginRate)
	if err != nil {
		return false
	}
	purchaseByKey := make(map[string]decimal.Decimal, len(purchase.Items))
	allKeys := make(map[string]struct{}, len(purchase.Items)+len(retail.Items))
	for _, item := range purchase.Items {
		amount, parseErr := decimal.NewFromString(item.Amount)
		if parseErr != nil {
			return false
		}
		purchaseByKey[item.Key] = amount
		allKeys[item.Key] = struct{}{}
	}
	retailByKey := make(map[string]decimal.Decimal, len(retail.Items))
	for _, item := range retail.Items {
		retailAmount, parseErr := decimal.NewFromString(item.Amount)
		if parseErr != nil {
			return false
		}
		retailByKey[item.Key] = retailAmount
		allKeys[item.Key] = struct{}{}
	}
	if len(allKeys) == 0 {
		return false
	}
	for key := range allKeys {
		purchaseAmount := purchaseByKey[key]
		retailAmount := retailByKey[key]
		netMargin := calculateNetMargin(
			purchaseAmount,
			retailAmount.Mul(candidate.factor),
			variableCostRate,
			taxRate,
		)
		if !meetsMinimumMargin(netMargin, minimumMargin) {
			return false
		}
	}
	return true
}

func buildLowestPublicPriceSummary(candidates []publicPriceCandidate) *model.PublicPriceSummary {
	if len(candidates) == 0 {
		return nil
	}
	minimumByKey := make(map[string]model.PublicPriceItem)
	order := make([]string, 0)
	comparableCandidates := 0
	comparableOffers := make(map[string]struct{})
	currency := ""
	billingMode := ""
	priceStructure := ""
	for _, candidate := range candidates {
		offerKey := fmt.Sprintf(
			"%d:%s",
			candidate.bundle.ChannelModel.Id,
			candidate.factor.String(),
		)
		if _, exists := comparableOffers[offerKey]; exists {
			continue
		}
		summary := buildPublicPriceSummary(
			candidate.bundle.Retail.BillingMode,
			candidate.bundle.Retail.PriceStructure,
			candidate.bundle.Retail.Currency,
			candidate.bundle.Retail.PriceComponents,
			decimal.NewFromInt(1),
		)
		if summary == nil {
			continue
		}
		comparableOffers[offerKey] = struct{}{}
		comparableCandidates++
		if currency == "" {
			currency = summary.Currency
		} else if currency != summary.Currency {
			currency = "mixed"
		}
		if billingMode == "" {
			billingMode = summary.BillingMode
		} else if billingMode != summary.BillingMode {
			billingMode = "mixed"
		}
		if priceStructure == "" {
			priceStructure = summary.PriceStructure
		} else if priceStructure != summary.PriceStructure {
			priceStructure = "mixed"
		}
		for _, item := range summary.Items {
			baseAmount, err := decimal.NewFromString(item.Amount)
			if err != nil {
				continue
			}
			item.BaseAmount = baseAmount.String()
			item.Amount = baseAmount.Mul(candidate.factor).
				RoundCeil(publicPriceDecimalPlaces).String()
			item.AppliedGroup = candidate.group
			item.AppliedGroupLabel = candidate.groupLabel
			item.AppliedGroupRatio = candidate.factor.String()
			current, exists := minimumByKey[item.Key]
			if !exists {
				minimumByKey[item.Key] = item
				order = append(order, item.Key)
				continue
			}
			amount, amountErr := decimal.NewFromString(item.Amount)
			currentAmount, currentErr := decimal.NewFromString(current.Amount)
			if amountErr == nil && (currentErr != nil || amount.LessThan(currentAmount)) {
				minimumByKey[item.Key] = item
			}
		}
	}
	items := make([]model.PublicPriceItem, 0, len(order))
	for _, key := range order {
		items = append(items, minimumByKey[key])
	}
	if len(items) == 0 {
		return nil
	}
	sortPublicPriceItems(items)
	return &model.PublicPriceSummary{
		Currency:        currency,
		BillingMode:     billingMode,
		PriceStructure:  priceStructure,
		ComparisonScope: "component_minimum",
		CandidateCount:  comparableCandidates,
		Items:           items,
	}
}

func buildPublicPriceSummary(
	billingMode string,
	priceStructure string,
	currency string,
	rawComponents string,
	factor decimal.Decimal,
) *model.PublicPriceSummary {
	var components publicPriceComponents
	if err := common.UnmarshalJsonStr(rawComponents, &components); err != nil {
		return nil
	}
	items := make([]model.PublicPriceItem, 0)
	if len(components.Rules) > 0 {
		for _, rule := range components.Rules {
			items = appendPublicPriceItem(items, model.PublicPriceItem{
				Component:  rule.Component,
				Amount:     rule.UnitPrice,
				Unit:       rule.Unit,
				UnitSize:   rule.UnitSize,
				Tier:       rule.Name,
				UpperBound: rule.UpperBound,
				Operation:  rule.Operation,
				Quality:    rule.Quality,
				Resolution: rule.Resolution,
				WithAudio:  rule.WithAudio,
			}, factor)
		}
	} else if len(components.Tiers) > 0 {
		for _, tier := range components.Tiers {
			items = appendPublicPriceFields(items, tier.publicPriceFields, tier.Name, tier.UpperBound, factor)
		}
	} else {
		items = appendPublicPriceFields(items, components.publicPriceFields, "", "", factor)
	}
	if len(items) == 0 {
		return nil
	}
	sortPublicPriceItems(items)
	return &model.PublicPriceSummary{
		Currency:       currency,
		BillingMode:    billingMode,
		PriceStructure: priceStructure,
		Items:          items,
	}
}

func appendPublicPriceFields(
	items []model.PublicPriceItem,
	fields publicPriceFields,
	tier string,
	upperBound string,
	factor decimal.Decimal,
) []model.PublicPriceItem {
	definitions := []struct {
		component string
		amount    string
		unit      string
		unitSize  string
	}{
		{"token_input", fields.InputUnitPrice, "token", "1000000"},
		{"token_output", fields.OutputUnitPrice, "token", "1000000"},
		{"cache_read", fields.CacheReadUnitPrice, "token", "1000000"},
		{"cache_write", fields.CacheWriteUnitPrice, "token", "1000000"},
		{"cache_write_1h", fields.CacheWrite1HUnitPrice, "token", "1000000"},
		{"image_token_input", fields.ImageInputUnitPrice, "token", "1000000"},
		{"image_token_output", fields.ImageOutputUnitPrice, "token", "1000000"},
		{"cached_image_token_input", fields.CachedImageInputUnitPrice, "token", "1000000"},
		{"audio_token_input", fields.AudioInputUnitPrice, "token", "1000000"},
		{"audio_token_output", fields.AudioOutputUnitPrice, "token", "1000000"},
		{"request", fields.RequestUnitPrice, "request", "1"},
		{"video_output", fields.VideoSecondUnitPrice, "second", "1"},
	}
	for _, definition := range definitions {
		items = appendPublicPriceItem(items, model.PublicPriceItem{
			Component:  definition.component,
			Amount:     definition.amount,
			Unit:       definition.unit,
			UnitSize:   definition.unitSize,
			Tier:       tier,
			UpperBound: upperBound,
		}, factor)
	}
	return items
}

func appendPublicPriceItem(
	items []model.PublicPriceItem,
	item model.PublicPriceItem,
	factor decimal.Decimal,
) []model.PublicPriceItem {
	item.Amount = strings.TrimSpace(item.Amount)
	if item.Amount == "" {
		return items
	}
	amount, err := decimal.NewFromString(item.Amount)
	if err != nil || amount.IsNegative() {
		return items
	}
	if strings.TrimSpace(item.UnitSize) == "" {
		item.UnitSize = "1"
	}
	amount = amount.Mul(factor).RoundCeil(publicPriceDecimalPlaces)
	item.Amount = amount.String()
	item.Key = publicPriceItemKey(item)
	return append(items, item)
}

func publicPriceItemKey(item model.PublicPriceItem) string {
	return strings.Join([]string{
		item.Component,
		item.Unit,
		item.UnitSize,
		item.Tier,
		item.UpperBound,
		item.Operation,
		item.Quality,
		item.Resolution,
		item.WithAudio,
	}, "|")
}

func sortPublicPriceItems(items []model.PublicPriceItem) {
	componentPriority := map[string]int{
		"token_input": 10, "token_output": 20, "cache_read": 30,
		"cache_write": 40, "cache_write_1h": 50,
		"image_token_input": 60, "image_token_output": 70,
		"cached_image_token_input": 80,
		"audio_token_input":        90, "audio_token_output": 100,
		"request": 110, "tool_call": 120, "generated_item": 130,
		"image_input": 140, "image_output": 150,
		"audio_input": 160, "audio_output": 170,
		"video_input": 180, "video_output": 190,
		"character_input": 200, "character_output": 210,
	}
	sort.SliceStable(items, func(left int, right int) bool {
		leftTier := items[left].Tier
		rightTier := items[right].Tier
		if leftTier != rightTier {
			return publicTierPriority(items[left]) < publicTierPriority(items[right])
		}
		leftPriority, leftExists := componentPriority[items[left].Component]
		rightPriority, rightExists := componentPriority[items[right].Component]
		if !leftExists {
			leftPriority = 1000
		}
		if !rightExists {
			rightPriority = 1000
		}
		if leftPriority != rightPriority {
			return leftPriority < rightPriority
		}
		return items[left].Key < items[right].Key
	})
}

func publicTierPriority(item model.PublicPriceItem) string {
	resolutionPriority := map[string]string{
		"480p": "001", "720p": "002", "1080p": "003", "4k": "004",
	}
	if priority, exists := resolutionPriority[strings.ToLower(item.Resolution)]; exists {
		return priority
	}
	if strings.EqualFold(item.Tier, "standard") || item.Tier == "" {
		return "000"
	}
	if strings.EqualFold(item.Tier, "peak") {
		return "100"
	}
	if strings.EqualFold(item.Tier, "off_peak") {
		return "200"
	}
	if strings.Contains(strings.ToLower(item.Tier), "long") {
		return "900"
	}
	return "500:" + strings.ToLower(item.Tier)
}
