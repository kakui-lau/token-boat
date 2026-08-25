package pricingruntime

import (
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

// ApplySalesPriceBookPricing publishes the customer-specific sales price book
// while keeping upstream purchase prices and route selection private. The same
// logical-model sales price is shown for every usable group that has at least
// one margin-safe purchase route.
func ApplySalesPriceBookPricing(
	pricing []model.Pricing,
	userId int,
	usableGroups map[string]string,
) []model.Pricing {
	blockedRoutes := make(map[[2]int]struct{})
	for _, status := range GetChannelCircuitOverview().Channels {
		if status.State == "open" || status.State == "half_open" {
			blockedRoutes[[2]int{status.ChannelId, status.ModelId}] = struct{}{}
		}
	}
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
			for _, bundle := range GetCandidateBundles(group, pricing[index].ModelName) {
				if _, blocked := blockedRoutes[[2]int{bundle.ChannelModel.ChannelId, bundle.ChannelModel.ModelId}]; blocked {
					continue
				}
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
			}
			pricesByGroup[group] = summary
		}
		if len(pricesByGroup) > 0 {
			pricing[index].SalesPricesByGroup = pricesByGroup
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
		return false
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
