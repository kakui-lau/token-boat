package pricingadmin

import (
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/service/pricingpolicy"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type SalesPriceBookPolicyChange struct {
	Field    string `json:"field"`
	OldValue string `json:"old_value"`
	NewValue string `json:"new_value"`
}

type SalesPriceBookItemDiff struct {
	ModelId             int                           `json:"model_id"`
	ModelName           string                        `json:"model_name"`
	ChangeType          string                        `json:"change_type"`
	OldItem             *SalesPriceBookItemListItem   `json:"old_item,omitempty"`
	NewItem             *SalesPriceBookItemListItem   `json:"new_item,omitempty"`
	OldReferenceCost    string                        `json:"old_reference_cost"`
	NewReferenceCost    string                        `json:"new_reference_cost"`
	OldReferencePrice   string                        `json:"old_reference_price"`
	NewReferencePrice   string                        `json:"new_reference_price"`
	PriceChangeRate     string                        `json:"price_change_rate"`
	MarginBefore        string                        `json:"margin_before"`
	MarginAfter         string                        `json:"margin_after"`
	OldPurchaseVersions []int                         `json:"old_purchase_version_ids"`
	NewPurchaseVersions []int                         `json:"new_purchase_version_ids"`
	RiskCodes           []string                      `json:"risk_codes"`
	OldChannelMargins   []SalesPriceBookChannelMargin `json:"old_channel_margins"`
	NewChannelMargins   []SalesPriceBookChannelMargin `json:"new_channel_margins"`
}

type SalesPriceBookChannelMargin struct {
	ChannelModelId          int      `json:"channel_model_id"`
	ChannelName             string   `json:"channel_name"`
	ChannelStatus           int      `json:"channel_status"`
	UpstreamModelName       string   `json:"upstream_model_name"`
	ChannelModelStatus      int      `json:"channel_model_status"`
	PurchasePriceVersionId  int      `json:"purchase_price_version_id"`
	PurchasePriceVersion    int64    `json:"purchase_price_version"`
	PurchasePricingMode     string   `json:"purchase_pricing_mode"`
	PurchaseQuoteSpec       string   `json:"purchase_quote_spec"`
	PurchasePriceComponents string   `json:"purchase_price_components"`
	PurchaseBillingExpr     string   `json:"purchase_billing_expr"`
	Currency                string   `json:"currency"`
	PurchaseDiscount        string   `json:"purchase_discount"`
	SalesDiscount           string   `json:"sales_discount"`
	SourceRole              string   `json:"source_role"`
	ReferenceCost           string   `json:"reference_cost"`
	MarginRate              string   `json:"margin_rate"`
	MeetsMinimumMargin      bool     `json:"meets_minimum_margin"`
	ChannelModelOverrideId  int      `json:"channel_model_override_id"`
	PaymentFeeRate          string   `json:"payment_fee_rate"`
	DistributionFeeRate     string   `json:"distribution_fee_rate"`
	OperationsLaborRate     string   `json:"operations_labor_rate"`
	TotalVariableCostRate   string   `json:"total_variable_cost_rate"`
	EffectiveTaxRate        string   `json:"effective_tax_rate"`
	TargetNetMargin         string   `json:"target_net_margin"`
	MinimumMarginRate       string   `json:"minimum_margin_rate"`
	OverriddenFields        []string `json:"overridden_fields"`
}

type SalesPriceBookVersionDiff struct {
	BaseVersion    model.SalesPriceBookVersion  `json:"base_version"`
	TargetVersion  model.SalesPriceBookVersion  `json:"target_version"`
	PolicyChanges  []SalesPriceBookPolicyChange `json:"policy_changes"`
	Items          []SalesPriceBookItemDiff     `json:"items"`
	AddedCount     int                          `json:"added_count"`
	ChangedCount   int                          `json:"changed_count"`
	RemovedCount   int                          `json:"removed_count"`
	UnchangedCount int                          `json:"unchanged_count"`
	ReviewCount    int                          `json:"review_count"`
}

const salesMarginComparisonScale int32 = 12

type salesPriceBookDiffBasisSource struct {
	PriceBookItemId         int
	ChannelModelId          int
	ChannelName             string
	ChannelStatus           int
	UpstreamModelName       string
	ChannelModelStatus      int
	PurchasePriceVersionId  int
	PurchasePriceVersion    int64
	PurchasePricingMode     string
	PurchaseQuoteSpec       string
	PurchasePriceComponents string
	Currency                string
	PurchaseDiscount        string
	SourceRole              string
	PurchaseBillingExpr     string
	OfficialBillingExpr     string
	BillingMode             string
}

func CompareSalesPriceBookVersions(
	baseVersionId int,
	targetVersionId int,
) (SalesPriceBookVersionDiff, error) {
	result := SalesPriceBookVersionDiff{
		PolicyChanges: make([]SalesPriceBookPolicyChange, 0),
		Items:         make([]SalesPriceBookItemDiff, 0),
	}
	if baseVersionId <= 0 || targetVersionId <= 0 || baseVersionId == targetVersionId {
		return result, errors.New("two different sales price book versions are required")
	}
	if err := model.DB.First(&result.BaseVersion, baseVersionId).Error; err != nil {
		return result, err
	}
	if err := model.DB.First(&result.TargetVersion, targetVersionId).Error; err != nil {
		return result, err
	}
	populateSalesPriceBookVersionDerived(&result.BaseVersion)
	populateSalesPriceBookVersionDerived(&result.TargetVersion)
	if result.BaseVersion.PriceBookId != result.TargetVersion.PriceBookId {
		return result, errors.New("sales price book versions belong to different price books")
	}
	result.PolicyChanges = compareSalesPriceBookPolicies(result.BaseVersion, result.TargetVersion)

	var items []SalesPriceBookItemListItem
	itemsQuery := model.DB.Table("sales_price_book_items").
		Select("sales_price_book_items.*, models.model_name AS model_name").
		Joins("JOIN models ON models.id = sales_price_book_items.model_id")
	if model.DB.Migrator().HasTable(&model.PricingChangeBatchItem{}) {
		itemsQuery = itemsQuery.Select(`sales_price_book_items.*, models.model_name AS model_name,
			pricing_change_batch_items.risk_code AS review_risk_code,
			pricing_change_batch_items.error_message AS review_reason`).
			Joins(`LEFT JOIN pricing_change_batch_items
			ON pricing_change_batch_items.batch_id = sales_price_book_items.generated_by_batch_id
			AND pricing_change_batch_items.target_type = ?
			AND pricing_change_batch_items.target_id = sales_price_book_items.id
			AND pricing_change_batch_items.status = ?`,
				"sales_price_book_item", PricingChangeBatchItemStatusReview)
	}
	if err := itemsQuery.
		Where("sales_price_book_items.price_book_version_id IN ?", []int{baseVersionId, targetVersionId}).
		Order("models.model_name ASC, sales_price_book_items.model_id ASC").
		Scan(&items).Error; err != nil {
		return result, err
	}
	itemIds := make([]int, 0, len(items))
	baseItems := make(map[int]SalesPriceBookItemListItem)
	targetItems := make(map[int]SalesPriceBookItemListItem)
	modelNames := make(map[int]string)
	for _, item := range items {
		itemIds = append(itemIds, item.Id)
		modelNames[item.ModelId] = item.ModelName
		if item.PriceBookVersionId == baseVersionId {
			baseItems[item.ModelId] = item
		} else {
			targetItems[item.ModelId] = item
		}
	}
	sourcesByItem, err := listSalesPriceBookDiffSources(itemIds)
	if err != nil {
		return result, err
	}
	overridesByVersion, err := listSalesPriceBookOverridesByVersion(
		[]int{baseVersionId, targetVersionId},
	)
	if err != nil {
		return result, err
	}
	modelIds := make([]int, 0, len(modelNames))
	for modelId := range modelNames {
		modelIds = append(modelIds, modelId)
	}
	sort.Slice(modelIds, func(left int, right int) bool {
		return modelNames[modelIds[left]] < modelNames[modelIds[right]]
	})
	for _, modelId := range modelIds {
		baseItem, hasBase := baseItems[modelId]
		targetItem, hasTarget := targetItems[modelId]
		diff := SalesPriceBookItemDiff{
			ModelId: modelId, ModelName: modelNames[modelId],
			RiskCodes:           []string{},
			OldPurchaseVersions: []int{},
			NewPurchaseVersions: []int{},
			OldChannelMargins:   []SalesPriceBookChannelMargin{},
			NewChannelMargins:   []SalesPriceBookChannelMargin{},
		}
		if hasBase {
			baseCopy := baseItem
			diff.OldItem = &baseCopy
			diff.OldReferencePrice, diff.OldReferenceCost, diff.MarginBefore,
				diff.OldPurchaseVersions, err = salesPriceBookItemReference(
				baseItem, result.BaseVersion, sourcesByItem[baseItem.Id],
			)
			if err != nil {
				return result, fmt.Errorf("compare model %s base price: %w", diff.ModelName, err)
			}
			diff.OldChannelMargins, err = salesPriceBookChannelMargins(
				baseItem, result.BaseVersion, sourcesByItem[baseItem.Id],
				overridesByVersion[baseVersionId],
			)
			if err != nil {
				return result, fmt.Errorf("compare model %s base channel margins: %w", diff.ModelName, err)
			}
			if margin := lowestSalesPriceBookChannelMargin(diff.OldChannelMargins); margin != "" {
				diff.MarginBefore = margin
			}
		}
		if hasTarget {
			targetCopy := targetItem
			diff.NewItem = &targetCopy
			diff.NewReferencePrice, diff.NewReferenceCost, diff.MarginAfter,
				diff.NewPurchaseVersions, err = salesPriceBookItemReference(
				targetItem, result.TargetVersion, sourcesByItem[targetItem.Id],
			)
			if err != nil {
				return result, fmt.Errorf("compare model %s target price: %w", diff.ModelName, err)
			}
			diff.NewChannelMargins, err = salesPriceBookChannelMargins(
				targetItem, result.TargetVersion, sourcesByItem[targetItem.Id],
				overridesByVersion[targetVersionId],
			)
			if err != nil {
				return result, fmt.Errorf("compare model %s target channel margins: %w", diff.ModelName, err)
			}
			if margin := lowestSalesPriceBookChannelMargin(diff.NewChannelMargins); margin != "" {
				diff.MarginAfter = margin
			}
		}
		switch {
		case !hasBase:
			diff.ChangeType = "added"
			result.AddedCount++
		case !hasTarget:
			diff.ChangeType = "removed"
			result.RemovedCount++
		default:
			diff.PriceChangeRate = decimalChangeRate(diff.OldReferencePrice, diff.NewReferencePrice)
			if salesPriceBookItemsEqual(baseItem, targetItem) &&
				intSlicesEqual(diff.OldPurchaseVersions, diff.NewPurchaseVersions) {
				diff.ChangeType = "unchanged"
				result.UnchangedCount++
			} else {
				diff.ChangeType = "changed"
				result.ChangedCount++
			}
		}
		diff.RiskCodes = salesPriceBookDiffRisks(diff, result.TargetVersion)
		if len(diff.RiskCodes) > 0 {
			result.ReviewCount++
		}
		result.Items = append(result.Items, diff)
	}
	return result, nil
}

func lowestSalesPriceBookChannelMargin(margins []SalesPriceBookChannelMargin) string {
	var lowest decimal.Decimal
	found := false
	for _, channel := range margins {
		margin, err := decimal.NewFromString(strings.TrimSpace(channel.MarginRate))
		if err != nil {
			continue
		}
		if !found || margin.LessThan(lowest) {
			lowest = margin
			found = true
		}
	}
	if !found {
		return ""
	}
	return lowest.String()
}

func compareSalesPriceBookPolicies(
	base model.SalesPriceBookVersion,
	target model.SalesPriceBookVersion,
) []SalesPriceBookPolicyChange {
	values := []struct {
		field string
		old   string
		new   string
	}{
		{"cost_basis_strategy", base.CostBasisStrategy, target.CostBasisStrategy},
		{"payment_fee_rate", base.PaymentFeeRate, target.PaymentFeeRate},
		{"distribution_fee_rate", base.DistributionFeeRate, target.DistributionFeeRate},
		{"operations_labor_rate", base.OperationsLaborRate, target.OperationsLaborRate},
		{"effective_tax_rate", base.EffectiveTaxRate, target.EffectiveTaxRate},
		{"target_net_margin", base.TargetNetMargin, target.TargetNetMargin},
		{"minimum_margin_rate", base.MinimumMarginRate, target.MinimumMarginRate},
		{"increase_cap_rate", base.IncreaseCapRate, target.IncreaseCapRate},
	}
	changes := make([]SalesPriceBookPolicyChange, 0)
	for _, value := range values {
		if strings.TrimSpace(value.old) == strings.TrimSpace(value.new) {
			continue
		}
		changes = append(changes, SalesPriceBookPolicyChange{
			Field: value.field, OldValue: value.old, NewValue: value.new,
		})
	}
	return changes
}

func listSalesPriceBookDiffSources(
	itemIds []int,
) (map[int][]salesPriceBookDiffBasisSource, error) {
	result := make(map[int][]salesPriceBookDiffBasisSource)
	if len(itemIds) == 0 {
		return result, nil
	}
	var sources []salesPriceBookDiffBasisSource
	if err := model.DB.Table("sales_price_book_item_cost_sources").
		Select(`sales_price_book_item_cost_sources.price_book_item_id,
			sales_price_book_item_cost_sources.channel_model_id,
			channels.name AS channel_name,
			channels.status AS channel_status,
			channel_models.upstream_model_name,
			channel_models.status AS channel_model_status,
			sales_price_book_item_cost_sources.purchase_price_version_id,
			sales_price_book_item_cost_sources.source_role,
			channel_model_purchase_price_versions.version AS purchase_price_version,
			channel_model_purchase_price_versions.pricing_mode AS purchase_pricing_mode,
			channel_model_purchase_price_versions.quote_spec AS purchase_quote_spec,
			channel_model_purchase_price_versions.price_components AS purchase_price_components,
			channel_model_purchase_price_versions.currency,
			channel_model_purchase_price_versions.purchase_billing_expr,
			official_model_price_versions.billing_expr AS official_billing_expr,
			channel_model_purchase_price_versions.billing_mode`).
		Joins(`JOIN channel_model_purchase_price_versions
			ON channel_model_purchase_price_versions.id = sales_price_book_item_cost_sources.purchase_price_version_id`).
		Joins(`JOIN channel_models
			ON channel_models.id = sales_price_book_item_cost_sources.channel_model_id`).
		Joins(`LEFT JOIN official_model_price_versions
			ON official_model_price_versions.id = channel_model_purchase_price_versions.official_price_version_id`).
		Joins("JOIN channels ON channels.id = channel_models.channel_id").
		Where("sales_price_book_item_cost_sources.price_book_item_id IN ?", itemIds).
		Order("sales_price_book_item_cost_sources.price_book_item_id ASC, sales_price_book_item_cost_sources.purchase_price_version_id ASC").
		Scan(&sources).Error; err != nil {
		return nil, err
	}
	for index := range sources {
		var spec purchaseDiscountSpec
		if strings.TrimSpace(sources[index].PurchaseQuoteSpec) != "" {
			if err := common.UnmarshalJsonStr(sources[index].PurchaseQuoteSpec, &spec); err != nil {
				return nil, err
			}
		}
		sources[index].PurchaseDiscount = spec.Discount
		source := sources[index]
		result[source.PriceBookItemId] = append(result[source.PriceBookItemId], source)
	}
	return result, nil
}

func salesPriceBookChannelMargins(
	item SalesPriceBookItemListItem,
	version model.SalesPriceBookVersion,
	sources []salesPriceBookDiffBasisSource,
	overrideSets ...map[int]model.SalesPriceBookChannelModelOverride,
) ([]SalesPriceBookChannelMargin, error) {
	sales, err := referenceBillingAmount(item.SalesBillingExpr, item.BillingMode)
	if err != nil {
		return nil, err
	}
	overridesByChannelModel := map[int]model.SalesPriceBookChannelModelOverride{}
	if len(overrideSets) > 0 && overrideSets[0] != nil {
		overridesByChannelModel = overrideSets[0]
	}
	margins := make([]SalesPriceBookChannelMargin, 0, len(sources))
	for _, source := range sources {
		var override *model.SalesPriceBookChannelModelOverride
		if configured, exists := overridesByChannelModel[source.ChannelModelId]; exists {
			override = &configured
		}
		effective, err := pricingpolicy.Resolve(version, override)
		if err != nil {
			return nil, err
		}
		minimum, err := decimal.NewFromString(effective.MinimumMarginRate)
		if err != nil {
			return nil, err
		}
		entry := SalesPriceBookChannelMargin{
			ChannelModelId: source.ChannelModelId, ChannelName: source.ChannelName,
			ChannelStatus:           source.ChannelStatus,
			UpstreamModelName:       source.UpstreamModelName,
			ChannelModelStatus:      source.ChannelModelStatus,
			PurchasePriceVersionId:  source.PurchasePriceVersionId,
			PurchasePriceVersion:    source.PurchasePriceVersion,
			PurchasePricingMode:     source.PurchasePricingMode,
			PurchaseQuoteSpec:       source.PurchaseQuoteSpec,
			PurchasePriceComponents: source.PurchasePriceComponents,
			PurchaseBillingExpr:     source.PurchaseBillingExpr,
			Currency:                source.Currency,
			PurchaseDiscount:        source.PurchaseDiscount, SourceRole: source.SourceRole,
			ChannelModelOverrideId: effective.OverrideId,
			PaymentFeeRate:         effective.PaymentFeeRate,
			DistributionFeeRate:    effective.DistributionFeeRate,
			OperationsLaborRate:    effective.OperationsLaborRate,
			TotalVariableCostRate:  effective.TotalVariableCostRate,
			EffectiveTaxRate:       effective.EffectiveTaxRate,
			TargetNetMargin:        effective.TargetNetMargin,
			MinimumMarginRate:      effective.MinimumMarginRate,
			OverriddenFields:       []string{},
		}
		if override != nil {
			if override.PaymentFeeRate != nil {
				entry.OverriddenFields = append(entry.OverriddenFields, "payment_fee_rate")
			}
			if override.DistributionFeeRate != nil {
				entry.OverriddenFields = append(entry.OverriddenFields, "distribution_fee_rate")
			}
			if override.OperationsLaborRate != nil {
				entry.OverriddenFields = append(entry.OverriddenFields, "operations_labor_rate")
			}
			if override.EffectiveTaxRate != nil {
				entry.OverriddenFields = append(entry.OverriddenFields, "effective_tax_rate")
			}
			if override.TargetNetMargin != nil {
				entry.OverriddenFields = append(entry.OverriddenFields, "target_net_margin")
			}
			if override.MinimumMarginRate != nil {
				entry.OverriddenFields = append(entry.OverriddenFields, "minimum_margin_rate")
			}
		}
		if source.BillingMode == item.BillingMode {
			cost, err := referenceBillingAmount(source.PurchaseBillingExpr, source.BillingMode)
			if err != nil {
				return nil, err
			}
			margin, err := salesPriceBookReferenceMarginWithPolicy(sales, cost, effective)
			if err != nil {
				return nil, err
			}
			entry.ReferenceCost = cost.String()
			entry.MarginRate = margin.String()
			entry.MeetsMinimumMargin = salesMarginMeetsMinimum(margin, minimum)
			if strings.TrimSpace(source.OfficialBillingExpr) != "" {
				officialAmount, officialErr := referenceBillingAmount(source.OfficialBillingExpr, source.BillingMode)
				if officialErr == nil && officialAmount.IsPositive() {
					entry.SalesDiscount = sales.Div(officialAmount).String()
				}
			}
		}
		margins = append(margins, entry)
	}
	return margins, nil
}

func salesPriceBookItemReference(
	item SalesPriceBookItemListItem,
	version model.SalesPriceBookVersion,
	sources []salesPriceBookDiffBasisSource,
) (string, string, string, []int, error) {
	sales, err := referenceBillingAmount(item.SalesBillingExpr, item.BillingMode)
	if err != nil {
		return "", "", "", nil, err
	}
	purchaseVersions := make([]int, 0, len(sources))
	costs := make([]decimal.Decimal, 0, len(sources))
	for _, source := range sources {
		purchaseVersions = append(purchaseVersions, source.PurchasePriceVersionId)
		if version.CostBasisStrategy == "designated_channel" && source.SourceRole != "selected" {
			continue
		}
		cost, err := referenceBillingAmount(source.PurchaseBillingExpr, source.BillingMode)
		if err != nil {
			return "", "", "", nil, err
		}
		costs = append(costs, cost)
	}
	sort.Ints(purchaseVersions)
	referenceCost := decimal.Zero
	if len(costs) > 0 {
		referenceCost = costs[0]
		for _, cost := range costs[1:] {
			if version.CostBasisStrategy == "min_eligible_cost" && cost.LessThan(referenceCost) ||
				version.CostBasisStrategy != "min_eligible_cost" && cost.GreaterThan(referenceCost) {
				referenceCost = cost
			}
		}
	}
	margin, err := salesPriceBookReferenceMargin(sales, referenceCost, version)
	if err != nil {
		return "", "", "", nil, err
	}
	return sales.String(), referenceCost.String(), margin.String(), purchaseVersions, nil
}

func salesPriceBookItemReferenceTx(
	tx *gorm.DB,
	item model.SalesPriceBookItem,
	version model.SalesPriceBookVersion,
) (string, string, string, []int, error) {
	var sources []salesPriceBookDiffBasisSource
	if err := tx.Table("sales_price_book_item_cost_sources").
		Select(`sales_price_book_item_cost_sources.price_book_item_id,
			sales_price_book_item_cost_sources.channel_model_id,
			channels.name AS channel_name,
			sales_price_book_item_cost_sources.purchase_price_version_id,
			sales_price_book_item_cost_sources.source_role,
			channel_model_purchase_price_versions.purchase_billing_expr,
			official_model_price_versions.billing_expr AS official_billing_expr,
			channel_model_purchase_price_versions.billing_mode`).
		Joins(`JOIN channel_model_purchase_price_versions
			ON channel_model_purchase_price_versions.id = sales_price_book_item_cost_sources.purchase_price_version_id`).
		Joins(`JOIN channel_models
			ON channel_models.id = sales_price_book_item_cost_sources.channel_model_id`).
		Joins(`LEFT JOIN official_model_price_versions
			ON official_model_price_versions.id = channel_model_purchase_price_versions.official_price_version_id`).
		Joins("JOIN channels ON channels.id = channel_models.channel_id").
		Where("sales_price_book_item_cost_sources.price_book_item_id = ?", item.Id).
		Order("sales_price_book_item_cost_sources.purchase_price_version_id ASC").
		Scan(&sources).Error; err != nil {
		return "", "", "", nil, err
	}
	return salesPriceBookItemReference(
		SalesPriceBookItemListItem{SalesPriceBookItem: item}, version, sources,
	)
}

func salesPriceBookChannelMarginsTx(
	tx *gorm.DB,
	item model.SalesPriceBookItem,
	version model.SalesPriceBookVersion,
) ([]SalesPriceBookChannelMargin, error) {
	var sources []salesPriceBookDiffBasisSource
	if err := tx.Table("sales_price_book_item_cost_sources").
		Select(`sales_price_book_item_cost_sources.price_book_item_id,
			sales_price_book_item_cost_sources.channel_model_id,
			channels.name AS channel_name,
			sales_price_book_item_cost_sources.purchase_price_version_id,
			sales_price_book_item_cost_sources.source_role,
			channel_model_purchase_price_versions.purchase_billing_expr,
			official_model_price_versions.billing_expr AS official_billing_expr,
			channel_model_purchase_price_versions.billing_mode`).
		Joins(`JOIN channel_model_purchase_price_versions
			ON channel_model_purchase_price_versions.id = sales_price_book_item_cost_sources.purchase_price_version_id`).
		Joins(`JOIN channel_models
			ON channel_models.id = sales_price_book_item_cost_sources.channel_model_id`).
		Joins(`LEFT JOIN official_model_price_versions
			ON official_model_price_versions.id = channel_model_purchase_price_versions.official_price_version_id`).
		Joins("JOIN channels ON channels.id = channel_models.channel_id").
		Where("sales_price_book_item_cost_sources.price_book_item_id = ?", item.Id).
		Order("sales_price_book_item_cost_sources.purchase_price_version_id ASC").
		Scan(&sources).Error; err != nil {
		return nil, err
	}
	var overrideRows []model.SalesPriceBookChannelModelOverride
	if err := tx.Where("price_book_version_id = ?", version.Id).
		Find(&overrideRows).Error; err != nil {
		return nil, err
	}
	overridesByChannelModel := make(map[int]model.SalesPriceBookChannelModelOverride, len(overrideRows))
	for _, override := range overrideRows {
		overridesByChannelModel[override.ChannelModelId] = override
	}
	return salesPriceBookChannelMargins(
		SalesPriceBookItemListItem{SalesPriceBookItem: item}, version, sources,
		overridesByChannelModel,
	)
}

func referenceBillingAmount(expression string, billingMode string) (decimal.Decimal, error) {
	params := billingexpr.TokenParams{}
	switch billingMode {
	case "token":
		params.P, params.C, params.Len = 1_000_000, 1_000_000, 1_000_000
	case "request":
		params.Req = 1
	case "image":
		params.Imgs = 1
	case "audio_duration":
		params.AudS = 1
	case "video_duration":
		params.VidS = 1
	case "character":
		params.Chars = 1_000
	default:
		params.P, params.C, params.Len = 1_000_000, 1_000_000, 1_000_000
		params.Req, params.Imgs, params.AudS, params.VidS, params.Chars = 1, 1, 1, 1, 1_000
	}
	value, _, err := billingexpr.RunExpr(expression, params)
	if err != nil {
		return decimal.Zero, err
	}
	return decimal.NewFromFloat(value), nil
}

func salesPriceBookReferenceMargin(
	sales decimal.Decimal,
	cost decimal.Decimal,
	version model.SalesPriceBookVersion,
) (decimal.Decimal, error) {
	if !sales.IsPositive() {
		return decimal.Zero, nil
	}
	vcr, err := decimal.NewFromString(version.TotalVariableCostRate)
	if err != nil {
		return decimal.Zero, err
	}
	tax, err := decimal.NewFromString(version.EffectiveTaxRate)
	if err != nil {
		return decimal.Zero, err
	}
	one := decimal.NewFromInt(1)
	return one.Sub(vcr).Mul(one.Sub(tax)).Sub(cost.Div(sales).Mul(one.Sub(tax))), nil
}

func salesPriceBookReferenceMarginWithPolicy(
	sales decimal.Decimal,
	cost decimal.Decimal,
	policy pricingpolicy.EffectivePolicy,
) (decimal.Decimal, error) {
	if !sales.IsPositive() {
		return decimal.Zero, nil
	}
	vcr, err := decimal.NewFromString(policy.TotalVariableCostRate)
	if err != nil {
		return decimal.Zero, err
	}
	tax, err := decimal.NewFromString(policy.EffectiveTaxRate)
	if err != nil {
		return decimal.Zero, err
	}
	one := decimal.NewFromInt(1)
	return one.Sub(vcr).Mul(one.Sub(tax)).Sub(cost.Div(sales).Mul(one.Sub(tax))), nil
}

func listSalesPriceBookOverridesByVersion(
	versionIds []int,
) (map[int]map[int]model.SalesPriceBookChannelModelOverride, error) {
	result := make(map[int]map[int]model.SalesPriceBookChannelModelOverride, len(versionIds))
	if len(versionIds) == 0 {
		return result, nil
	}
	var rows []model.SalesPriceBookChannelModelOverride
	if err := model.DB.Where("price_book_version_id IN ?", versionIds).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		if result[row.PriceBookVersionId] == nil {
			result[row.PriceBookVersionId] = make(map[int]model.SalesPriceBookChannelModelOverride)
		}
		result[row.PriceBookVersionId][row.ChannelModelId] = row
	}
	return result, nil
}

func salesMarginMeetsMinimum(margin decimal.Decimal, minimum decimal.Decimal) bool {
	return margin.Round(salesMarginComparisonScale).
		GreaterThanOrEqual(minimum.Round(salesMarginComparisonScale))
}

func decimalChangeRate(oldValue string, newValue string) string {
	oldDecimal, oldErr := decimal.NewFromString(oldValue)
	newDecimal, newErr := decimal.NewFromString(newValue)
	if oldErr != nil || newErr != nil || !oldDecimal.IsPositive() {
		return ""
	}
	return newDecimal.Sub(oldDecimal).Div(oldDecimal).String()
}

func salesPriceBookItemsEqual(left SalesPriceBookItemListItem, right SalesPriceBookItemListItem) bool {
	return left.Status == right.Status &&
		left.BillingMode == right.BillingMode &&
		left.PriceStructure == right.PriceStructure &&
		left.PriceComponents == right.PriceComponents &&
		left.SalesExprHash == right.SalesExprHash &&
		left.PricingMethod == right.PricingMethod &&
		left.PricingConfig == right.PricingConfig
}

func intSlicesEqual(left []int, right []int) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func salesPriceBookDiffRisks(
	diff SalesPriceBookItemDiff,
	target model.SalesPriceBookVersion,
) []string {
	risks := make([]string, 0, 3)
	if diff.NewItem == nil {
		return append(risks, "model_removed")
	}
	if strings.TrimSpace(diff.NewItem.ReviewRiskCode) != "" {
		risks = append(risks, diff.NewItem.ReviewRiskCode)
	}
	if len(diff.NewPurchaseVersions) == 0 {
		risks = append(risks, "missing_purchase_price")
	}
	for _, channelMargin := range diff.NewChannelMargins {
		if !channelMargin.MeetsMinimumMargin {
			risks = append(risks, "channel_below_minimum_margin")
			break
		}
	}
	if len(diff.NewChannelMargins) == 0 {
		margin, marginErr := decimal.NewFromString(diff.MarginAfter)
		minimum, minimumErr := decimal.NewFromString(target.MinimumMarginRate)
		if marginErr == nil && minimumErr == nil && !salesMarginMeetsMinimum(margin, minimum) {
			risks = append(risks, "below_minimum_margin")
		}
	}
	change, changeErr := decimal.NewFromString(diff.PriceChangeRate)
	capRate, capErr := decimal.NewFromString(target.IncreaseCapRate)
	if changeErr == nil && capErr == nil && capRate.IsPositive() && change.GreaterThan(capRate) {
		risks = append(risks, "increase_cap_exceeded")
	}
	return risks
}
