package pricingadmin

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const (
	PricingChangeBatchStatusCompleted      = "completed"
	PricingChangeBatchStatusReviewRequired = "review_required"
	PricingChangeBatchItemStatusGenerated  = "generated"
	PricingChangeBatchItemStatusReview     = "review_required"
	PricingChangeBatchItemStatusUnchanged  = "unchanged"
	PricingChangeBatchItemStatusAccepted   = "accepted"
	PricingChangeBatchItemStatusRejected   = "rejected"
)

type SalesPriceBookGenerationInput struct {
	ChannelModelIds        []int       `json:"channel_model_ids"`
	IdempotencyKey         string      `json:"idempotency_key"`
	DesignatedChannelModel map[int]int `json:"designated_channel_models,omitempty"`
	TriggerType            string      `json:"-"`
	TriggerId              *int        `json:"-"`
}

type SalesPriceBookGenerationResult struct {
	Batch          model.PricingChangeBatch   `json:"batch"`
	GeneratedItems []model.SalesPriceBookItem `json:"generated_items"`
}

type salesPriceBookPurchaseSource struct {
	ChannelModelId int
	ModelId        int
	ModelName      string
	Purchase       model.ChannelModelPurchasePriceVersion `gorm:"embedded;embeddedPrefix:purchase_"`
}

func GenerateSalesPriceBookItems(
	versionId int,
	input SalesPriceBookGenerationInput,
	userId int,
) (SalesPriceBookGenerationResult, error) {
	var result SalesPriceBookGenerationResult
	if versionId <= 0 {
		return result, errors.New("sales price book version is required")
	}
	input.IdempotencyKey = strings.TrimSpace(input.IdempotencyKey)
	input.TriggerType = strings.TrimSpace(input.TriggerType)
	if input.TriggerType == "" {
		input.TriggerType = "manual_price_book_generation"
		input.TriggerId = &versionId
	}
	if input.IdempotencyKey == "" {
		return result, errors.New("idempotency key is required")
	}
	if len(input.ChannelModelIds) == 0 {
		return result, errors.New("at least one channel model must be selected")
	}
	if len(input.ChannelModelIds) > 10000 {
		return result, errors.New("selected channel models cannot exceed 10000")
	}
	selectedIds := make([]int, 0, len(input.ChannelModelIds))
	seen := make(map[int]struct{}, len(input.ChannelModelIds))
	for _, id := range input.ChannelModelIds {
		if id <= 0 {
			return result, errors.New("channel model ids contain an invalid value")
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		selectedIds = append(selectedIds, id)
	}
	sort.Ints(selectedIds)

	err := model.DB.Transaction(func(tx *gorm.DB) error {
		var existing model.PricingChangeBatch
		err := tx.First(&existing, "idempotency_key = ?", input.IdempotencyKey).Error
		if err == nil {
			if existing.TriggerType != input.TriggerType ||
				!optionalIntEqual(existing.TriggerId, input.TriggerId) {
				return errors.New("idempotency key was already used for another pricing operation")
			}
			result.Batch = existing
			return tx.Where("generated_by_batch_id = ?", existing.Id).
				Order("model_id ASC").Find(&result.GeneratedItems).Error
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		version, err := model.GetSalesPriceBookVersionForUpdate(tx, versionId)
		if err != nil {
			return err
		}
		if version.Status != model.SalesPriceBookVersionStatusDraft {
			return errors.New("only sales price book drafts can generate model prices")
		}
		var book model.SalesPriceBook
		if err := tx.First(&book, version.PriceBookId).Error; err != nil {
			return err
		}
		var sources []salesPriceBookPurchaseSource
		now := common.GetTimestamp()
		if err := tx.Table("channel_models").
			Select(`
				channel_models.id AS channel_model_id,
				channel_models.model_id AS model_id,
				models.model_name AS model_name,
				purchase.id AS purchase_id,
				purchase.channel_model_id AS purchase_channel_model_id,
				purchase.official_price_version_id AS purchase_official_price_version_id,
				purchase.billing_mode AS purchase_billing_mode,
				purchase.pricing_mode AS purchase_pricing_mode,
				purchase.price_structure AS purchase_price_structure,
				purchase.quote_spec AS purchase_quote_spec,
				purchase.price_components AS purchase_price_components,
				purchase.purchase_discount AS purchase_purchase_discount,
				purchase.input_unit_price AS purchase_input_unit_price,
				purchase.output_unit_price AS purchase_output_unit_price,
				purchase.cache_read_unit_price AS purchase_cache_read_unit_price,
				purchase.cache_write_unit_price AS purchase_cache_write_unit_price,
				purchase.price_unit AS purchase_price_unit,
				purchase.purchase_billing_expr AS purchase_purchase_billing_expr,
				purchase.purchase_expr_hash AS purchase_purchase_expr_hash,
				purchase.expression_source AS purchase_expression_source,
				purchase.expression_schema_version AS purchase_expression_schema_version,
				purchase.currency AS purchase_currency,
				purchase.quote_reference AS purchase_quote_reference,
				purchase.contract_reference AS purchase_contract_reference,
				purchase.conditions AS purchase_conditions,
				purchase.version AS purchase_version,
				purchase.status AS purchase_status,
				purchase.effective_from AS purchase_effective_from,
				purchase.effective_to AS purchase_effective_to,
				purchase.created_by AS purchase_created_by,
				purchase.created_at AS purchase_created_at,
				purchase.updated_at AS purchase_updated_at,
				purchase.remark AS purchase_remark
			`).
			Joins("JOIN models ON models.id = channel_models.model_id").
			Joins("JOIN channels ON channels.id = channel_models.channel_id").
			Joins(`JOIN channel_model_purchase_price_versions AS purchase
				ON purchase.channel_model_id = channel_models.id
				AND purchase.status = ?
				AND purchase.effective_from <= ?
				AND (purchase.effective_to = 0 OR purchase.effective_to > ?)`,
				model.PricingVersionStatusActive, now, now,
			).
			Where("channel_models.id IN ?", selectedIds).
			Where("channel_models.status = ?", 1).
			Where("channels.status = ?", common.ChannelStatusEnabled).
			Order("channel_models.model_id ASC, channel_models.id ASC").
			Scan(&sources).Error; err != nil {
			return err
		}
		if len(sources) != len(selectedIds) {
			return errors.New("one or more selected channel models have no active purchase price")
		}
		for _, source := range sources {
			if source.Purchase.Currency != book.Currency {
				return fmt.Errorf(
					"channel model %d purchase currency %s does not match price book currency %s",
					source.ChannelModelId, source.Purchase.Currency, book.Currency,
				)
			}
			if strings.TrimSpace(source.Purchase.Conditions) != "" {
				return fmt.Errorf(
					"channel model %d has conditional purchase pricing; automatic sales generation is not supported",
					source.ChannelModelId,
				)
			}
		}

		scope, err := common.Marshal(map[string]any{
			"price_book_version_id": versionId,
			"channel_model_ids":     selectedIds,
		})
		if err != nil {
			return err
		}
		keyHash := fmt.Sprintf("%x", sha256.Sum256([]byte(input.IdempotencyKey)))
		result.Batch = model.PricingChangeBatch{
			BatchNo:        fmt.Sprintf("PB-%d-%s", versionId, keyHash[:12]),
			IdempotencyKey: input.IdempotencyKey,
			TriggerType:    input.TriggerType,
			TriggerId:      input.TriggerId,
			Status:         PricingChangeBatchStatusCompleted,
			ScopeSpec:      string(scope),
			RequestedBy:    userId,
		}
		if err := tx.Create(&result.Batch).Error; err != nil {
			return err
		}

		grouped := make(map[int][]salesPriceBookPurchaseSource)
		modelIds := make([]int, 0)
		for _, source := range sources {
			if _, exists := grouped[source.ModelId]; !exists {
				modelIds = append(modelIds, source.ModelId)
			}
			grouped[source.ModelId] = append(grouped[source.ModelId], source)
		}
		sort.Ints(modelIds)
		for _, modelId := range modelIds {
			modelSources := grouped[modelId]
			generated, basisSources, generationErr := buildSalesPriceBookItem(
				version,
				modelSources,
				input.DesignatedChannelModel[modelId],
			)
			result.Batch.TotalCount++
			if generationErr != nil {
				result.Batch.ReviewCount++
				result.Batch.Status = PricingChangeBatchStatusReviewRequired
				if err := tx.Create(&model.PricingChangeBatchItem{
					BatchId: result.Batch.Id, TargetType: "sales_price_book_item",
					ModelId: modelId, PriceBookId: &version.PriceBookId,
					Action: "generate", RiskCode: "unsupported_cost_basis",
					Status: PricingChangeBatchItemStatusReview, ErrorMessage: generationErr.Error(),
				}).Error; err != nil {
					return err
				}
				continue
			}

			generated.PriceBookVersionId = versionId
			generated.GeneratedByBatchId = &result.Batch.Id
			var current model.SalesPriceBookItem
			err := tx.First(&current,
				"price_book_version_id = ? AND model_id = ?", versionId, modelId,
			).Error
			oldHash := ""
			oldReferencePrice, oldReferenceCost, marginBefore := "", "", ""
			oldPurchaseVersions := []int{}
			action := "create"
			if err == nil {
				if input.TriggerType == SalesPriceBookTriggerPurchasePricePublished &&
					current.PricingMethod != "cost_plus" {
					itemId := current.Id
					if err := tx.Create(&model.PricingChangeBatchItem{
						BatchId: result.Batch.Id, TargetType: "sales_price_book_item",
						TargetId: &itemId, ModelId: modelId, PriceBookId: &version.PriceBookId,
						Action: "preserve_manual", OldExprHash: current.SalesExprHash,
						NewExprHash: current.SalesExprHash,
						Status:      PricingChangeBatchItemStatusUnchanged,
						RiskCode:    "manual_price_preserved",
					}).Error; err != nil {
						return err
					}
					result.Batch.UnchangedCount++
					continue
				}
				oldHash = current.SalesExprHash
				oldReferencePrice, oldReferenceCost, marginBefore,
					oldPurchaseVersions, err = salesPriceBookItemReferenceTx(tx, current, version)
				if err != nil {
					return err
				}
				action = "update"
				generated.Id = current.Id
				if err := tx.Model(&model.SalesPriceBookItem{}).Where("id = ?", current.Id).
					Updates(map[string]any{
						"status": generated.Status, "billing_mode": generated.BillingMode,
						"price_structure":             generated.PriceStructure,
						"price_components":            generated.PriceComponents,
						"sales_billing_expr":          generated.SalesBillingExpr,
						"sales_expr_hash":             generated.SalesExprHash,
						"expression_source":           generated.ExpressionSource,
						"expression_schema_version":   generated.ExpressionSchemaVersion,
						"pricing_method":              generated.PricingMethod,
						"primary_purchase_version_id": generated.PrimaryPurchaseVersionId,
						"selling_factor":              generated.SellingFactor,
						"minimum_margin_override":     generated.MinimumMarginOverride,
						"currency":                    generated.Currency,
						"generated_by_batch_id":       generated.GeneratedByBatchId,
						"remark":                      generated.Remark,
					}).Error; err != nil {
					return err
				}
				if err := tx.Where("price_book_item_id = ?", current.Id).
					Delete(&model.SalesPriceBookItemBasisSource{}).Error; err != nil {
					return err
				}
			} else if errors.Is(err, gorm.ErrRecordNotFound) {
				if err := tx.Create(&generated).Error; err != nil {
					return err
				}
			} else {
				return err
			}

			for index := range basisSources {
				basisSources[index].PriceBookItemId = generated.Id
				if err := tx.Create(&basisSources[index]).Error; err != nil {
					return err
				}
			}
			newReferencePrice, newReferenceCost, marginAfter,
				newPurchaseVersions, err := salesPriceBookItemReferenceTx(tx, generated, version)
			if err != nil {
				return err
			}
			priceChangeRate := decimalChangeRate(oldReferencePrice, newReferencePrice)
			newItem := SalesPriceBookItemListItem{SalesPriceBookItem: generated}
			diff := SalesPriceBookItemDiff{
				NewItem:           &newItem,
				OldReferencePrice: oldReferencePrice, NewReferencePrice: newReferencePrice,
				OldReferenceCost: oldReferenceCost, NewReferenceCost: newReferenceCost,
				PriceChangeRate: priceChangeRate, MarginBefore: marginBefore, MarginAfter: marginAfter,
				OldPurchaseVersions: oldPurchaseVersions, NewPurchaseVersions: newPurchaseVersions,
			}
			if oldHash != "" {
				oldItem := SalesPriceBookItemListItem{SalesPriceBookItem: current}
				diff.OldItem = &oldItem
				diff.OldChannelMargins, err = salesPriceBookChannelMarginsTx(tx, current, version)
				if err != nil {
					return err
				}
			}
			diff.NewChannelMargins, err = salesPriceBookChannelMarginsTx(tx, generated, version)
			if err != nil {
				return err
			}
			risks := salesPriceBookDiffRisks(diff, version)
			batchItemStatus := PricingChangeBatchItemStatusGenerated
			riskCode := ""
			if len(risks) > 0 {
				batchItemStatus = PricingChangeBatchItemStatusReview
				riskCode = risks[0]
				generated.Status = SalesPriceItemStatusReviewRequired
				if err := tx.Model(&model.SalesPriceBookItem{}).Where("id = ?", generated.Id).
					Update("status", generated.Status).Error; err != nil {
					return err
				}
				result.Batch.ReviewCount++
				result.Batch.Status = PricingChangeBatchStatusReviewRequired
			}
			unchanged := oldHash != "" && oldHash == generated.SalesExprHash &&
				intSlicesEqual(oldPurchaseVersions, newPurchaseVersions) && len(risks) == 0
			if unchanged {
				batchItemStatus = PricingChangeBatchItemStatusUnchanged
				action = "unchanged"
				result.Batch.UnchangedCount++
			} else {
				result.Batch.ChangedCount++
			}
			diffDetail, err := common.Marshal(map[string]any{
				"old_purchase_version_ids": oldPurchaseVersions,
				"new_purchase_version_ids": newPurchaseVersions,
				"price_change_rate":        priceChangeRate,
				"old_channel_margins":      diff.OldChannelMargins,
				"new_channel_margins":      diff.NewChannelMargins,
				"risk_codes":               risks,
			})
			if err != nil {
				return err
			}
			itemId := generated.Id
			if err := tx.Create(&model.PricingChangeBatchItem{
				BatchId: result.Batch.Id, TargetType: "sales_price_book_item",
				TargetId: &itemId, ModelId: modelId, PriceBookId: &version.PriceBookId,
				Action: action, OldExprHash: oldHash, NewExprHash: generated.SalesExprHash,
				OldReferenceCost: oldReferenceCost, NewReferenceCost: newReferenceCost,
				OldReferencePrice: oldReferencePrice, NewReferencePrice: newReferencePrice,
				MarginBefore: marginBefore, MarginAfter: marginAfter,
				RiskCode: riskCode, Status: batchItemStatus, DiffDetail: string(diffDetail),
			}).Error; err != nil {
				return err
			}
			result.GeneratedItems = append(result.GeneratedItems, generated)
		}

		if err := tx.Model(&model.PricingChangeBatch{}).Where("id = ?", result.Batch.Id).
			Updates(map[string]any{
				"status": result.Batch.Status, "total_count": result.Batch.TotalCount,
				"changed_count":   result.Batch.ChangedCount,
				"unchanged_count": result.Batch.UnchangedCount,
				"review_count":    result.Batch.ReviewCount,
			}).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.SalesPriceBookVersion{}).Where("id = ?", versionId).
			Updates(map[string]any{"change_batch_id": result.Batch.Id, "updated_at": now}).Error; err != nil {
			return err
		}
		return tx.Create(&model.PricingAuditRecord{
			ObjectType: "pricing_change_batch", ObjectId: result.Batch.Id,
			Action: "generate", OperatorId: userId,
		}).Error
	})
	return result, err
}

func optionalIntEqual(left *int, right *int) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func GetPricingChangeBatch(id int) (
	model.PricingChangeBatch,
	[]PricingChangeBatchItemListItem,
	error,
) {
	var batch model.PricingChangeBatch
	if id <= 0 {
		return batch, nil, errors.New("pricing change batch is required")
	}
	if err := model.DB.First(&batch, id).Error; err != nil {
		return batch, nil, err
	}
	var items []PricingChangeBatchItemListItem
	if err := model.DB.Table("pricing_change_batch_items AS items").
		Select(`items.*, models.model_name AS model_name,
			channels.name AS channel_name, sales_price_books.name AS price_book_name`).
		Joins("LEFT JOIN models ON models.id = items.model_id").
		Joins("LEFT JOIN channel_models ON channel_models.id = items.channel_model_id").
		Joins("LEFT JOIN channels ON channels.id = channel_models.channel_id").
		Joins("LEFT JOIN sales_price_books ON sales_price_books.id = items.price_book_id").
		Where("items.batch_id = ?", id).
		Order("items.model_id ASC, items.id ASC").Scan(&items).Error; err != nil {
		return batch, nil, err
	}
	return batch, items, nil
}

func buildSalesPriceBookItem(
	version model.SalesPriceBookVersion,
	sources []salesPriceBookPurchaseSource,
	designatedChannelModelId int,
) (model.SalesPriceBookItem, []model.SalesPriceBookItemBasisSource, error) {
	if len(sources) == 0 {
		return model.SalesPriceBookItem{}, nil, errors.New("no purchase sources are available")
	}
	selected := sources[0].Purchase
	selectionReason := version.CostBasisStrategy
	sourceRoleByChannel := make(map[int]string, len(sources))
	for _, source := range sources {
		sourceRoleByChannel[source.ChannelModelId] = "candidate"
	}

	switch version.CostBasisStrategy {
	case "designated_channel":
		if designatedChannelModelId <= 0 {
			return model.SalesPriceBookItem{}, nil, errors.New("a designated channel model is required")
		}
		found := false
		for _, source := range sources {
			if source.ChannelModelId == designatedChannelModelId {
				selected = source.Purchase
				found = true
				break
			}
		}
		if !found {
			return model.SalesPriceBookItem{}, nil, errors.New("the designated channel model is not selected")
		}
		sourceRoleByChannel[designatedChannelModelId] = "selected"
	case "max_eligible_cost", "min_eligible_cost":
		merged, err := mergeFlatPurchaseSources(sources, version.CostBasisStrategy == "max_eligible_cost")
		if err != nil {
			return model.SalesPriceBookItem{}, nil, err
		}
		selected = merged
		for _, source := range sources {
			sourceRoleByChannel[source.ChannelModelId] = "cost_basis"
		}
	default:
		return model.SalesPriceBookItem{}, nil, fmt.Errorf(
			"automatic generation does not support cost basis strategy %q",
			version.CostBasisStrategy,
		)
	}

	preview, err := BuildSalesPricePreview(SalesPriceGenerationInput{
		ChannelModelId: selected.ChannelModelId, PurchasePriceVersionId: selected.Id,
		TotalVariableCostRate: version.TotalVariableCostRate,
		EffectiveTaxRate:      version.EffectiveTaxRate,
		TargetNetMargin:       version.TargetNetMargin,
		MinimumMarginRate:     version.MinimumMarginRate,
	}, selected)
	if err != nil {
		return model.SalesPriceBookItem{}, nil, err
	}
	factor, err := NewSalesPriceCalculator(
		version.TotalVariableCostRate,
		version.EffectiveTaxRate,
		version.TargetNetMargin,
	)
	if err != nil {
		return model.SalesPriceBookItem{}, nil, err
	}
	sellingFactor, err := factor.SellingFactor()
	if err != nil {
		return model.SalesPriceBookItem{}, nil, err
	}
	item := model.SalesPriceBookItem{
		ModelId: sources[0].ModelId, Status: SalesPriceItemStatusEnabled,
		BillingMode: preview.BillingMode, PriceStructure: preview.PriceStructure,
		PriceComponents: preview.PriceComponents, SalesBillingExpr: preview.SalesBillingExpr,
		SalesExprHash:    billingexpr.ExprHashString(preview.SalesBillingExpr),
		ExpressionSource: "generated", ExpressionSchemaVersion: "v2",
		PricingMethod: "cost_plus", SellingFactor: sellingFactor.String(),
		MinimumMarginOverride: version.MinimumMarginRate, Currency: preview.Currency,
		Remark: "generated from " + selectionReason,
	}
	if version.CostBasisStrategy == "designated_channel" {
		purchaseVersionId := selected.Id
		item.PrimaryPurchaseVersionId = &purchaseVersionId
	}
	basisSources := make([]model.SalesPriceBookItemBasisSource, 0, len(sources))
	for _, source := range sources {
		basisSources = append(basisSources, model.SalesPriceBookItemBasisSource{
			ChannelModelId:         source.ChannelModelId,
			PurchasePriceVersionId: source.Purchase.Id,
			TierKey:                "base", ComponentKey: "expression",
			SourceRole:      sourceRoleByChannel[source.ChannelModelId],
			SourceValue:     source.Purchase.PurchaseBillingExpr,
			SelectionReason: selectionReason,
		})
	}
	return item, basisSources, nil
}

func mergeFlatPurchaseSources(
	sources []salesPriceBookPurchaseSource,
	chooseMaximum bool,
) (model.ChannelModelPurchasePriceVersion, error) {
	base := sources[0].Purchase
	if base.BillingMode != "token" || base.PriceStructure != "flat" {
		return model.ChannelModelPurchasePriceVersion{}, errors.New(
			"maximum or minimum cost generation requires flat token purchase prices",
		)
	}
	merged, err := unmarshalFlatPriceComponents(base.PriceComponents)
	if err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
	}
	for _, source := range sources[1:] {
		purchase := source.Purchase
		if purchase.BillingMode != base.BillingMode ||
			purchase.PriceStructure != base.PriceStructure ||
			purchase.Currency != base.Currency {
			return model.ChannelModelPurchasePriceVersion{}, errors.New(
				"purchase sources must use the same billing mode, price structure and currency",
			)
		}
		candidate, err := unmarshalFlatPriceComponents(purchase.PriceComponents)
		if err != nil {
			return model.ChannelModelPurchasePriceVersion{}, err
		}
		if err := mergeFlatPriceComponents(&merged, candidate, chooseMaximum); err != nil {
			return model.ChannelModelPurchasePriceVersion{}, err
		}
	}
	_, expression, components, err := normalizeFlatTokenPrices(merged)
	if err != nil {
		return model.ChannelModelPurchasePriceVersion{}, err
	}
	base.Id = 0
	base.PriceComponents = components
	base.PurchaseBillingExpr = expression
	base.PurchaseExprHash = billingexpr.ExprHashString(expression)
	return base, nil
}

func mergeFlatPriceComponents(
	target *FlatTokenPriceInput,
	candidate FlatTokenPriceInput,
	chooseMaximum bool,
) error {
	components := []struct {
		name      string
		target    *string
		candidate string
	}{
		{"input_unit_price", &target.InputUnitPrice, candidate.InputUnitPrice},
		{"output_unit_price", &target.OutputUnitPrice, candidate.OutputUnitPrice},
		{"cache_read_unit_price", &target.CacheReadUnitPrice, candidate.CacheReadUnitPrice},
		{"cache_write_unit_price", &target.CacheWriteUnitPrice, candidate.CacheWriteUnitPrice},
		{"cache_write_1h_unit_price", &target.CacheWrite1HUnitPrice, candidate.CacheWrite1HUnitPrice},
		{"image_input_unit_price", &target.ImageInputUnitPrice, candidate.ImageInputUnitPrice},
		{"image_output_unit_price", &target.ImageOutputUnitPrice, candidate.ImageOutputUnitPrice},
		{"audio_input_unit_price", &target.AudioInputUnitPrice, candidate.AudioInputUnitPrice},
		{"audio_output_unit_price", &target.AudioOutputUnitPrice, candidate.AudioOutputUnitPrice},
	}
	for _, component := range components {
		left := strings.TrimSpace(*component.target)
		right := strings.TrimSpace(component.candidate)
		if (left == "") != (right == "") {
			return fmt.Errorf("purchase sources have incompatible %s", component.name)
		}
		if left == "" {
			continue
		}
		leftValue, err := decimal.NewFromString(left)
		if err != nil {
			return fmt.Errorf("%s is invalid: %w", component.name, err)
		}
		rightValue, err := decimal.NewFromString(right)
		if err != nil {
			return fmt.Errorf("%s is invalid: %w", component.name, err)
		}
		if chooseMaximum && rightValue.GreaterThan(leftValue) ||
			!chooseMaximum && rightValue.LessThan(leftValue) {
			*component.target = rightValue.String()
		}
	}
	return nil
}
