package pricingadmin

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/service/pricingruntime"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

var (
	validBillingModes = map[string]struct{}{
		"token": {}, "request": {}, "image": {}, "audio_duration": {},
		"video_duration": {}, "character": {}, "mixed": {},
	}
	validPriceStructures = map[string]struct{}{
		"flat": {}, "tiered": {}, "expression": {},
	}
	validPricingModes = map[string]struct{}{
		"official_ratio": {}, "component_ratio": {}, "fixed_unit_price": {},
		"hybrid": {}, "custom_expr": {},
	}
)

func officialPriceCanBeReferenced(status string) bool {
	return status == model.PricingVersionStatusActive ||
		status == model.PricingVersionStatusExpired
}

func CreateOfficialPriceVersion(input *model.OfficialModelPriceVersion, userId int) error {
	if input == nil {
		return errors.New("official price is required")
	}
	input.Id = 0
	input.CreatedBy = userId
	input.Status = model.PricingVersionStatusDraft
	input.EffectiveFrom = 0
	input.EffectiveTo = 0
	normalizeExpressionMetadata(
		&input.ExpressionSource,
		&input.ExpressionSchemaVersion,
		&input.Currency,
		&input.BillingExpr,
	)
	if err := validateOfficialPriceCurrency(input.Currency); err != nil {
		return err
	}
	if err := validateExpressionMetadata(input.ExpressionSchemaVersion, input.BillingExpr); err != nil {
		return err
	}
	if err := validateCommonPrice(
		input.ModelId,
		input.BillingMode,
		input.PriceStructure,
		input.Currency,
		input.BillingExpr,
	); err != nil {
		return err
	}
	if err := validatePriceComponents(
		input.BillingMode,
		input.PriceStructure,
		input.PriceComponents,
	); err != nil {
		return err
	}
	input.ExprHash = billingexpr.ExprHashString(input.BillingExpr)
	input.ContentHash = officialPriceContentHash(*input)
	return model.DB.Transaction(func(tx *gorm.DB) error {
		logicalModel, err := model.GetLogicalModelForUpdate(tx, input.ModelId)
		if err != nil {
			return err
		}
		if logicalModel.RoutingTargetModelId != nil {
			return errors.New("system model aliases reuse their routing target price")
		}
		var maxVersion int64
		if err := tx.Model(&model.OfficialModelPriceVersion{}).
			Where("model_id = ?", input.ModelId).
			Select("COALESCE(MAX(version), 0)").
			Scan(&maxVersion).Error; err != nil {
			return err
		}
		input.Version = maxVersion + 1
		return tx.Create(input).Error
	})
}

func UpdateOfficialPriceVersionDraft(
	id int,
	input *model.OfficialModelPriceVersion,
) (model.OfficialModelPriceVersion, error) {
	var updated model.OfficialModelPriceVersion
	if input == nil {
		return updated, errors.New("official price is required")
	}
	normalizeExpressionMetadata(
		&input.ExpressionSource,
		&input.ExpressionSchemaVersion,
		&input.Currency,
		&input.BillingExpr,
	)
	if err := validateOfficialPriceCurrency(input.Currency); err != nil {
		return updated, err
	}
	if err := validateExpressionMetadata(input.ExpressionSchemaVersion, input.BillingExpr); err != nil {
		return updated, err
	}
	if err := validateCommonPrice(
		input.ModelId,
		input.BillingMode,
		input.PriceStructure,
		input.Currency,
		input.BillingExpr,
	); err != nil {
		return updated, err
	}
	if err := validatePriceComponents(
		input.BillingMode,
		input.PriceStructure,
		input.PriceComponents,
	); err != nil {
		return updated, err
	}
	input.ExprHash = billingexpr.ExprHashString(input.BillingExpr)
	input.ContentHash = officialPriceContentHash(*input)
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		current, err := model.GetOfficialPriceVersionForUpdate(tx, id)
		if err != nil {
			return err
		}
		if current.Status != model.PricingVersionStatusDraft {
			return errors.New("only official price drafts can be updated")
		}
		if current.ModelId != input.ModelId {
			return errors.New("official price draft model cannot be changed")
		}
		updates := map[string]any{
			"billing_mode":              input.BillingMode,
			"price_structure":           input.PriceStructure,
			"price_components":          input.PriceComponents,
			"billing_expr":              input.BillingExpr,
			"expr_hash":                 input.ExprHash,
			"expression_source":         input.ExpressionSource,
			"expression_schema_version": input.ExpressionSchemaVersion,
			"currency":                  input.Currency,
			"content_hash":              input.ContentHash,
			"remark":                    strings.TrimSpace(input.Remark),
			"updated_at":                common.GetTimestamp(),
		}
		if err := tx.Model(&model.OfficialModelPriceVersion{}).
			Where("id = ? AND status = ?", id, model.PricingVersionStatusDraft).
			UpdateColumns(updates).Error; err != nil {
			return err
		}
		return tx.First(&updated, id).Error
	})
	return updated, err
}

func CreatePurchasePriceVersion(input *model.ChannelModelPurchasePriceVersion, userId int) error {
	if input == nil {
		return errors.New("purchase price is required")
	}
	input.Id = 0
	input.CreatedBy = userId
	input.Status = model.PricingVersionStatusDraft
	input.EffectiveFrom = 0
	input.EffectiveTo = 0
	normalizeExpressionMetadata(
		&input.ExpressionSource,
		&input.ExpressionSchemaVersion,
		&input.Currency,
		&input.PurchaseBillingExpr,
	)
	if err := validateExpressionMetadata(input.ExpressionSchemaVersion, input.PurchaseBillingExpr); err != nil {
		return err
	}
	if err := validateCommonPrice(
		input.ChannelModelId,
		input.BillingMode,
		input.PriceStructure,
		input.Currency,
		input.PurchaseBillingExpr,
	); err != nil {
		return err
	}
	if _, ok := validPricingModes[input.PricingMode]; !ok {
		return fmt.Errorf("unsupported pricing mode %q", input.PricingMode)
	}
	if (input.PricingMode == "official_ratio" || input.PricingMode == "component_ratio") &&
		input.OfficialPriceVersionId == nil {
		return errors.New("official price version is required for ratio pricing")
	}
	if input.PricingMode == "official_ratio" {
		if err := validatePositiveDecimal("purchase_discount", input.PurchaseDiscount, true); err != nil {
			return err
		}
	}
	if err := validateUnitPrices(
		input.InputUnitPrice,
		input.OutputUnitPrice,
		input.CacheReadUnitPrice,
		input.CacheWriteUnitPrice,
	); err != nil {
		return err
	}
	input.PurchaseExprHash = billingexpr.ExprHashString(input.PurchaseBillingExpr)
	return model.DB.Transaction(func(tx *gorm.DB) error {
		channelModel, err := model.GetChannelModelForUpdate(tx, input.ChannelModelId)
		if err != nil {
			return err
		}
		if input.OfficialPriceVersionId != nil {
			var official model.OfficialModelPriceVersion
			if err := tx.First(&official, *input.OfficialPriceVersionId).Error; err != nil {
				return err
			}
			if official.ModelId != channelModel.ModelId {
				return errors.New("official price and channel model belong to different logical models")
			}
			if input.PricingMode == "official_ratio" ||
				input.PricingMode == "component_ratio" ||
				input.PricingMode == "hybrid" {
				if err := validatePurchaseOfficialBillingContract(*input, official); err != nil {
					return err
				}
			}
		}
		var maxVersion int64
		if err := tx.Model(&model.ChannelModelPurchasePriceVersion{}).
			Where("channel_model_id = ?", input.ChannelModelId).
			Select("COALESCE(MAX(version), 0)").
			Scan(&maxVersion).Error; err != nil {
			return err
		}
		input.Version = maxVersion + 1
		return tx.Create(input).Error
	})
}

func PublishOfficialPriceVersion(id int) error {
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		return publishOfficialPriceVersion(tx, id)
	})
	if err == nil {
		pricingruntime.InvalidateCatalog()
	}
	return err
}

type PublishLatestOfficialPriceDraftsResult struct {
	Published          int `json:"published"`
	SkippedUnsupported int `json:"skipped_unsupported"`
}

func PublishLatestOfficialPriceDrafts() (PublishLatestOfficialPriceDraftsResult, error) {
	var result PublishLatestOfficialPriceDraftsResult
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		var drafts []model.OfficialModelPriceVersion
		if err := tx.Where("status = ?", model.PricingVersionStatusDraft).
			Order("model_id ASC, version DESC").
			Find(&drafts).Error; err != nil {
			return err
		}
		latestDraftIds := make([]int, 0, len(drafts))
		seenModels := make(map[int]struct{}, len(drafts))
		for _, draft := range drafts {
			if _, exists := seenModels[draft.ModelId]; exists {
				continue
			}
			seenModels[draft.ModelId] = struct{}{}
			latestDraftIds = append(latestDraftIds, draft.Id)
		}
		for _, id := range latestDraftIds {
			if err := publishOfficialPriceVersion(tx, id); err != nil {
				return fmt.Errorf("publish official price draft %d: %w", id, err)
			}
			result.Published++
		}
		return nil
	})
	if err != nil {
		result.Published = 0
	} else {
		pricingruntime.InvalidateCatalog()
	}
	return result, err
}

func publishOfficialPriceVersion(tx *gorm.DB, id int) error {
	version, err := model.GetOfficialPriceVersionForUpdate(tx, id)
	if err != nil {
		return err
	}
	if version.Status != model.PricingVersionStatusDraft {
		return errors.New("only draft official prices can be published")
	}
	if err := validateExpressionMetadata(version.ExpressionSchemaVersion, version.BillingExpr); err != nil {
		return err
	}
	if version.ExprHash != "" &&
		version.ExprHash != billingexpr.ExprHashString(version.BillingExpr) {
		return errors.New("official price expression hash does not match")
	}
	if err := validateCommonPrice(
		version.ModelId,
		version.BillingMode,
		version.PriceStructure,
		version.Currency,
		version.BillingExpr,
	); err != nil {
		return err
	}
	if version.ExprHash != billingexpr.ExprHashString(version.BillingExpr) {
		return errors.New("official price expression hash does not match")
	}
	return model.ActivateOfficialPriceVersion(tx, version, common.GetTimestamp())
}

func officialPriceContentHash(version model.OfficialModelPriceVersion) string {
	components := strings.TrimSpace(version.PriceComponents)
	if components != "" {
		var canonical any
		if err := common.UnmarshalJsonStr(components, &canonical); err == nil {
			if encoded, err := common.Marshal(canonical); err == nil {
				components = string(encoded)
			}
		}
	}
	payload := strings.Join([]string{
		strings.TrimSpace(version.BillingMode),
		strings.TrimSpace(version.PriceStructure),
		components,
		strings.TrimSpace(version.BillingExpr),
		strings.ToUpper(strings.TrimSpace(version.Currency)),
	}, "\x00")
	return fmt.Sprintf("%x", sha256.Sum256([]byte(payload)))
}

func validatePriceComponents(
	billingMode string,
	priceStructure string,
	components string,
) error {
	components = strings.TrimSpace(components)
	if components == "" {
		return nil
	}
	var parsed map[string]any
	if err := common.UnmarshalJsonStr(components, &parsed); err != nil {
		return fmt.Errorf("price_components must be a JSON object: %w", err)
	}
	return validateBusinessPriceRules(billingMode, priceStructure, parsed)
}

func validatePurchasePricePublication(
	tx *gorm.DB,
	version model.ChannelModelPurchasePriceVersion,
) error {
	if err := validateExpressionMetadata(version.ExpressionSchemaVersion, version.PurchaseBillingExpr); err != nil {
		return err
	}
	var channelModel model.ChannelModel
	if err := tx.First(&channelModel, version.ChannelModelId).Error; err != nil {
		return err
	}
	if channelModel.Status == 0 {
		return errors.New("disabled channel model cannot publish a purchase price")
	}
	if err := validateCommonPrice(
		version.ChannelModelId,
		version.BillingMode,
		version.PriceStructure,
		version.Currency,
		version.PurchaseBillingExpr,
	); err != nil {
		return err
	}
	if version.PurchaseExprHash != billingexpr.ExprHashString(version.PurchaseBillingExpr) {
		return errors.New("purchase price expression hash does not match")
	}
	requiresOfficialPrice := version.PricingMode == "official_ratio" ||
		version.PricingMode == "component_ratio" ||
		version.PricingMode == "hybrid"
	if requiresOfficialPrice && version.OfficialPriceVersionId == nil {
		return errors.New("official price version is required for ratio pricing")
	}
	if !requiresOfficialPrice {
		return nil
	}
	var official model.OfficialModelPriceVersion
	if err := tx.First(&official, *version.OfficialPriceVersionId).Error; err != nil {
		return err
	}
	if !officialPriceCanBeReferenced(official.Status) {
		return errors.New("referenced official price must be published")
	}
	if official.ModelId != channelModel.ModelId {
		return errors.New("official price and channel model belong to different logical models")
	}
	return validatePurchaseOfficialBillingContract(version, official)
}

func validatePurchaseOfficialBillingContract(
	purchase model.ChannelModelPurchasePriceVersion,
	official model.OfficialModelPriceVersion,
) error {
	if official.ExpressionSchemaVersion != "v2" ||
		billingexpr.ExprVersion(official.BillingExpr) != 2 {
		return errors.New("purchase price requires a v2 official price")
	}
	if official.ExprHash == "" ||
		official.ExprHash != billingexpr.ExprHashString(official.BillingExpr) {
		return errors.New("official price expression hash does not match")
	}
	if !sameBillingContract(
		purchase.BillingMode,
		purchase.PriceStructure,
		purchase.Currency,
		official.BillingMode,
		official.PriceStructure,
		official.Currency,
	) {
		return errors.New("purchase billing contract does not match official price")
	}
	if purchase.PricingMode == "component_ratio" &&
		(official.BillingMode != "token" || official.PriceStructure != "flat") {
		return errors.New("component discounts require a flat token official price")
	}
	return nil
}

func sameBillingContract(
	leftBillingMode string,
	leftPriceStructure string,
	leftCurrency string,
	rightBillingMode string,
	rightPriceStructure string,
	rightCurrency string,
) bool {
	return leftBillingMode == rightBillingMode &&
		leftPriceStructure == rightPriceStructure &&
		leftCurrency == rightCurrency
}

// ignoreMissingTable 判断错误是否因查询的关联表不存在引起（sqlite: "no such table"，
// postgres: "relation ... does not exist"）。测试环境通常只建部分表，此时跳过需要
// 关联表的判断；生产库所有表齐全，不会走这条路径。
func ignoreMissingTable(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "no such table") ||
		strings.Contains(msg, "does not exist")
}

// validateProductionEvidenceOnPublish 在采购价发布时对"生产在用"渠道模型做证据完整性校验，
// 规则与 cmd/local-pricing-bootstrap 的 readiness 校验（validateProductionPriceEvidence）
// 保持一致，把失败从部署阶段提前到发布阶段，避免上线后才被 readiness 拦截。
// "生产在用"判定：渠道模型未禁用 + 渠道启用 + ability 启用。
func validateProductionEvidenceOnPublish(
	tx *gorm.DB,
	version model.ChannelModelPurchasePriceVersion,
) error {
	var inUse int64
	if err := tx.Model(&model.ChannelModel{}).
		Joins("JOIN channels ON channels.id = channel_models.channel_id").
		Joins("JOIN models ON models.id = channel_models.model_id").
		Joins(
			"JOIN abilities ON abilities.channel_id = channel_models.channel_id AND abilities.model = models.model_name",
		).
		Where(
			"channel_models.id = ? AND channel_models.status <> ? AND channels.status = ? AND abilities.enabled = ?",
			version.ChannelModelId,
			0,
			common.ChannelStatusEnabled,
			true,
		).
		Count(&inUse).Error; err != nil {
		if ignoreMissingTable(err) {
			return nil
		}
		return err
	}
	if inUse == 0 {
		return nil
	}

	requiresOfficial := version.PricingMode == "official_ratio" ||
		version.PricingMode == "component_ratio" ||
		version.PricingMode == "hybrid"
	if requiresOfficial && version.OfficialPriceVersionId != nil {
		var official model.OfficialModelPriceVersion
		if err := tx.First(&official, *version.OfficialPriceVersionId).Error; err != nil {
			return err
		}
		source := strings.ToLower(strings.TrimSpace(official.Source))
		if source == "" || source == "local_bootstrap" || source == "legacy_import" {
			return fmt.Errorf(
				"channel model %d uses non-production official source %q",
				version.ChannelModelId,
				official.Source,
			)
		}
		if strings.TrimSpace(official.SourceVersion) == "" || official.SourceUpdatedAt <= 0 {
			return fmt.Errorf(
				"channel model %d official price lacks source version or source timestamp",
				version.ChannelModelId,
			)
		}
	}

	quoteReference := strings.ToLower(strings.TrimSpace(version.QuoteReference))
	contractReference := strings.TrimSpace(version.ContractReference)
	if quoteReference == "" && contractReference == "" {
		return fmt.Errorf(
			"channel model %d purchase price lacks quote or contract evidence",
			version.ChannelModelId,
		)
	}
	if strings.Contains(quoteReference, "local-test") ||
		strings.Contains(strings.ToLower(version.Remark), "local v2") {
		return fmt.Errorf(
			"channel model %d still uses local-test purchase evidence",
			version.ChannelModelId,
		)
	}
	return nil
}

func PublishPurchasePriceVersion(id int) error {
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		version, err := model.GetPurchasePriceVersionForUpdate(tx, id)
		if err != nil {
			return err
		}
		if version.Status != model.PricingVersionStatusDraft {
			return errors.New("only draft purchase prices can be published")
		}
		if err := validatePurchasePricePublication(tx, version); err != nil {
			return err
		}
		if err := validateProductionEvidenceOnPublish(tx, version); err != nil {
			return err
		}
		return model.ActivatePurchasePriceVersion(tx, version, common.GetTimestamp())
	})
	if err == nil {
		pricingruntime.InvalidateCatalog()
	}
	return err
}

func normalizeExpressionMetadata(source *string, schemaVersion *string, currency *string, expression *string) {
	*source = strings.TrimSpace(*source)
	if *source == "" {
		*source = "generated"
	}
	*schemaVersion = strings.TrimSpace(*schemaVersion)
	if *schemaVersion == "" {
		*schemaVersion = "v2"
	}
	*currency = strings.ToUpper(strings.TrimSpace(*currency))
	*expression = strings.TrimSpace(*expression)
	if *expression == "" {
		return
	}
	if strings.HasPrefix(*expression, "v2:") {
		return
	}
	if hasExpressionVersionPrefix(*expression) {
		return
	}
	*expression = *schemaVersion + ":" + *expression
}

func validateOfficialPriceCurrency(currency string) error {
	if currency != "USD" {
		return errors.New("official price currency must be USD")
	}
	return nil
}

func validateExpressionMetadata(schemaVersion string, expression string) error {
	schemaVersion = strings.TrimSpace(schemaVersion)
	if schemaVersion != "v2" {
		return fmt.Errorf("unsupported expression schema version %q", schemaVersion)
	}
	expression = strings.TrimSpace(expression)
	expectedVersion := ""
	switch {
	case strings.HasPrefix(expression, "v2:"):
		expectedVersion = "v2"
	case hasExpressionVersionPrefix(expression):
		prefix := expression[:strings.IndexByte(expression, ':')]
		return fmt.Errorf("unsupported expression prefix %q", prefix)
	default:
		expectedVersion = "v2"
	}
	if schemaVersion != expectedVersion {
		return fmt.Errorf(
			"expression schema version %q does not match expression prefix %q",
			schemaVersion,
			expectedVersion,
		)
	}
	return nil
}

func hasExpressionVersionPrefix(expression string) bool {
	colon := strings.IndexByte(expression, ':')
	if colon < 2 || expression[0] != 'v' {
		return false
	}
	for _, char := range expression[1:colon] {
		if char < '0' || char > '9' {
			return false
		}
	}
	return true
}

func validateCommonPrice(scopeId int, billingMode string, priceStructure string, currency string, expression string) error {
	if scopeId <= 0 {
		return errors.New("price scope is required")
	}
	if _, ok := validBillingModes[billingMode]; !ok {
		return fmt.Errorf("unsupported billing mode %q", billingMode)
	}
	if _, ok := validPriceStructures[priceStructure]; !ok {
		return fmt.Errorf("unsupported price structure %q", priceStructure)
	}
	if currency != "USD" {
		return errors.New("pricing currency must be USD")
	}
	if strings.TrimSpace(expression) == "" {
		return errors.New("billing expression is required")
	}
	return billing_setting.SmokeTestExpr(expression)
}

func validateUnitPrices(values ...string) error {
	for _, value := range values {
		if err := validatePositiveDecimal("unit_price", value, false); err != nil {
			return err
		}
	}
	return nil
}

func validatePositiveDecimal(name string, value string, required bool) error {
	value = strings.TrimSpace(value)
	if value == "" {
		if required {
			return fmt.Errorf("%s is required", name)
		}
		return nil
	}
	number, err := decimal.NewFromString(value)
	if err != nil {
		return fmt.Errorf("%s is invalid: %w", name, err)
	}
	if number.IsNegative() || (required && number.IsZero()) {
		return fmt.Errorf("%s must be positive", name)
	}
	if number.GreaterThan(maxPricingUnitPrice) {
		return fmt.Errorf("%s must not exceed %s USD", name, maxPricingUnitPrice)
	}
	return nil
}

func validateRate(name string, value string) (decimal.Decimal, error) {
	number, err := decimal.NewFromString(strings.TrimSpace(value))
	if err != nil {
		return decimal.Zero, fmt.Errorf("%s is invalid: %w", name, err)
	}
	if number.IsNegative() || number.GreaterThanOrEqual(decimal.NewFromInt(1)) {
		return decimal.Zero, fmt.Errorf("%s must be in [0, 1)", name)
	}
	return number, nil
}
