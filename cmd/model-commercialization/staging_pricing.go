package main

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service/pricingadmin"
	"github.com/QuantumNous/new-api/service/pricingengine"
	"github.com/QuantumNous/new-api/service/pricingruntime"
	"gopkg.in/yaml.v3"
	"gorm.io/gorm"
)

type officialExpressionConfig struct {
	ModelName       string `yaml:"model_name"`
	BillingMode     string `yaml:"billing_mode"`
	PriceStructure  string `yaml:"price_structure"`
	PriceComponents string `yaml:"price_components"`
	BillingExpr     string `yaml:"billing_expr"`
	Currency        string `yaml:"currency"`
	Source          string `yaml:"source"`
	SourceVersion   string `yaml:"source_version"`
	SourceUpdatedAt int64  `yaml:"source_updated_at"`
	Remark          string `yaml:"remark"`
}

func auditModelPricing(logicalModel string, selectedChannelID int) error {
	var logical model.Model
	if err := model.DB.Where("model_name = ?", logicalModel).First(&logical).Error; err != nil {
		return err
	}
	if err := pricingruntime.RefreshCatalog(); err != nil {
		return err
	}

	type routeRow struct {
		ChannelModelID int    `gorm:"column:channel_model_id"`
		ChannelID      int    `gorm:"column:channel_id"`
		ChannelName    string `gorm:"column:channel_name"`
		ChannelStatus  int    `gorm:"column:channel_status"`
		UpstreamModel  string `gorm:"column:upstream_model"`
		ChannelModelOK int    `gorm:"column:channel_model_status"`
		Group          string `gorm:"column:ability_group"`
		AbilityEnabled bool   `gorm:"column:ability_enabled"`
	}
	var routes []routeRow
	if err := model.DB.Table("channel_models").
		Select(
			"channel_models.id AS channel_model_id, channel_models.channel_id, channels.name AS channel_name, "+
				"channels.status AS channel_status, channel_models.upstream_model_name AS upstream_model, "+
				"channel_models.status AS channel_model_status, "+
				"abilities.group AS ability_group, abilities.enabled AS ability_enabled",
		).
		Joins("JOIN channels ON channels.id = channel_models.channel_id").
		Joins("LEFT JOIN abilities ON abilities.channel_id = channel_models.channel_id AND abilities.model = ?", logicalModel).
		Where("channel_models.model_id = ?", logical.Id).
		Order("channel_models.channel_id ASC, abilities.group ASC").
		Scan(&routes).Error; err != nil {
		return err
	}

	fmt.Printf("model id=%d logical=%q status=%d\n", logical.Id, logicalModel, logical.Status)
	groups := make(map[string]struct{})
	seenChannelModels := make(map[int]struct{})
	for _, route := range routes {
		if route.AbilityEnabled && route.ChannelStatus == common.ChannelStatusEnabled {
			groups[route.Group] = struct{}{}
		}
		if _, seen := seenChannelModels[route.ChannelModelID]; seen {
			fmt.Printf("ability channel_id=%d group=%q enabled=%t\n", route.ChannelID, route.Group, route.AbilityEnabled)
			continue
		}
		seenChannelModels[route.ChannelModelID] = struct{}{}
		bundle, err := pricingruntime.ValidatePricingActivation(route.ChannelModelID)
		if err != nil {
			fmt.Printf(
				"route channel_id=%d channel=%q channel_status=%d channel_model_id=%d upstream=%q channel_model_status=%d structured_pricing_valid=false error=%q\n",
				route.ChannelID, route.ChannelName, route.ChannelStatus, route.ChannelModelID, route.UpstreamModel,
				route.ChannelModelOK, err.Error(),
			)
		} else {
			fmt.Printf(
				"route channel_id=%d channel=%q channel_status=%d channel_model_id=%d upstream=%q channel_model_status=%d structured_pricing_valid=true purchase_id=%d discount=%q ability_group=%q ability_enabled=%t\n",
				route.ChannelID, route.ChannelName, route.ChannelStatus, route.ChannelModelID, route.UpstreamModel,
				route.ChannelModelOK, bundle.Purchase.Id,
				bundle.Purchase.PurchaseDiscount, route.Group, route.AbilityEnabled,
			)
		}
	}

	for group := range groups {
		bundles := pricingruntime.GetCandidateBundles(group, logicalModel)
		candidateIDs := make([]string, 0, len(bundles))
		candidateChannelIDs := make([]string, 0, len(bundles))
		for _, bundle := range bundles {
			candidateIDs = append(candidateIDs, fmt.Sprintf("%d", bundle.ChannelModel.Id))
			candidateChannelIDs = append(candidateChannelIDs, fmt.Sprintf("%d", bundle.ChannelModel.ChannelId))
		}
		fmt.Printf(
			"catalog group=%q complete=%t candidate_channel_model_ids=%q candidate_channel_ids=%q\n",
			group, len(bundles) > 0, strings.Join(candidateIDs, ","), strings.Join(candidateChannelIDs, ","),
		)
		if selectedChannelID <= 0 {
			continue
		}
		info := &relaycommon.RelayInfo{OriginModelName: logicalModel, UsingGroup: group}
		_, err := pricingruntime.PrepareRelayPricing(
			info,
			group,
			selectedChannelID,
			1,
			4096,
			billingexpr.RequestInput{},
			pricingengine.Usage{RequestCount: 1},
		)
		if err != nil {
			fmt.Printf("estimate group=%q selected_channel_id=%d error=%q\n", group, selectedChannelID, err.Error())
			continue
		}
		routeChannelIDs := ""
		if info.DynamicPricingSnapshot != nil {
			ids := make([]string, 0, len(info.DynamicPricingSnapshot.RouteChannelIds))
			for _, channelID := range info.DynamicPricingSnapshot.RouteChannelIds {
				ids = append(ids, fmt.Sprintf("%d", channelID))
			}
			routeChannelIDs = strings.Join(ids, ",")
		}
		fmt.Printf(
			"estimate group=%q selected_channel_id=%d route_channel_ids=%q reservation_quota=%d selected_quota=%d\n",
			group, selectedChannelID, routeChannelIDs,
			info.PriceData.QuotaToPreConsume, info.PriceData.Quota,
		)
	}
	return nil
}

func cloneChannelModelForStaging(sourceChannelID int, logicalModel string, channelName string, stagingGroup string) error {
	if sourceChannelID <= 0 || logicalModel == "" || channelName == "" || stagingGroup == "" {
		return errors.New("source-channel-id, logical-model, channel-name, and staging-group are required")
	}
	if strings.Contains(stagingGroup, ",") || stagingGroup == "default" || stagingGroup == "auto" {
		return errors.New("staging-group must be one isolated non-public group")
	}

	var created model.Channel
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		var source model.Channel
		if err := tx.First(&source, sourceChannelID).Error; err != nil {
			return err
		}
		var logical model.Model
		if err := tx.Where("model_name = ?", logicalModel).First(&logical).Error; err != nil {
			return err
		}
		var sourceModel model.ChannelModel
		if err := tx.Where("channel_id = ? AND model_id = ?", sourceChannelID, logical.Id).First(&sourceModel).Error; err != nil {
			return err
		}
		var duplicateCount int64
		if err := tx.Model(&model.Channel{}).Where("name = ?", channelName).Count(&duplicateCount).Error; err != nil {
			return err
		}
		if duplicateCount != 0 {
			return fmt.Errorf("channel %q already exists", channelName)
		}

		mapping, err := common.Marshal(map[string]string{logicalModel: sourceModel.UpstreamModelName})
		if err != nil {
			return err
		}
		created = source
		created.Id = 0
		created.Name = channelName
		created.Group = stagingGroup
		created.Models = logicalModel
		modelMapping := string(mapping)
		created.ModelMapping = &modelMapping
		created.Status = common.ChannelStatusEnabled
		created.CreatedTime = common.GetTimestamp()
		created.TestTime = 0
		created.ResponseTime = 0
		created.Balance = 0
		created.BalanceUpdatedTime = 0
		created.UsedQuota = 0
		if err := tx.Create(&created).Error; err != nil {
			return err
		}

		priority := int64Value(source.Priority)
		weight := uint(0)
		if source.Weight != nil {
			weight = *source.Weight
		}
		ability := model.Ability{
			Group: stagingGroup, Model: logicalModel, ChannelId: created.Id,
			Enabled: true, Priority: &priority, Weight: weight,
		}
		if err := tx.Create(&ability).Error; err != nil {
			return err
		}
		channelModel := model.ChannelModel{
			ChannelId: created.Id, ModelId: logical.Id,
			UpstreamModelName: sourceModel.UpstreamModelName,
			Status:            1, Priority: priority, Weight: weight,
			Region: sourceModel.Region, DataPolicy: sourceModel.DataPolicy,
			CapabilityConfig: sourceModel.CapabilityConfig,
			RoutingTags:      sourceModel.RoutingTags,
		}
		return tx.Create(&channelModel).Error
	})
	if err != nil {
		return err
	}
	model.InitChannelCache()
	fmt.Printf("cloned staging channel id=%d source_channel_id=%d model=%q group=%q\n", created.Id, sourceChannelID, logicalModel, stagingGroup)
	return nil
}

func publishOfficialExpression(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var cfg officialExpressionConfig
	decoder := yaml.NewDecoder(bytes.NewReader(data))
	decoder.KnownFields(true)
	if err := decoder.Decode(&cfg); err != nil {
		return err
	}
	if strings.TrimSpace(cfg.ModelName) == "" || strings.TrimSpace(cfg.BillingExpr) == "" ||
		strings.TrimSpace(cfg.PriceComponents) == "" || strings.TrimSpace(cfg.Currency) == "" ||
		strings.TrimSpace(cfg.Source) == "" || strings.TrimSpace(cfg.SourceVersion) == "" ||
		cfg.SourceUpdatedAt <= 0 {
		return errors.New("model_name, billing_expr, price_components, currency, source, source_version, and source_updated_at are required")
	}
	var logical model.Model
	if err := model.DB.Where("model_name = ?", strings.TrimSpace(cfg.ModelName)).First(&logical).Error; err != nil {
		return err
	}
	version := model.OfficialModelPriceVersion{
		ModelId: logical.Id, BillingMode: strings.TrimSpace(cfg.BillingMode),
		PriceStructure:   strings.TrimSpace(cfg.PriceStructure),
		PriceComponents:  strings.TrimSpace(cfg.PriceComponents),
		BillingExpr:      strings.TrimSpace(cfg.BillingExpr),
		ExpressionSource: "custom", ExpressionSchemaVersion: "v2",
		Currency: strings.TrimSpace(cfg.Currency), Source: strings.TrimSpace(cfg.Source),
		SourceVersion: strings.TrimSpace(cfg.SourceVersion), SourceUpdatedAt: cfg.SourceUpdatedAt,
		ChangeType: "price_change", Remark: strings.TrimSpace(cfg.Remark),
	}
	if err := pricingadmin.CreateOfficialPriceVersion(&version, 1); err != nil {
		return err
	}
	if _, err := pricingadmin.PublishOfficialPriceVersionWithAutomation(version.Id, 1); err != nil {
		return err
	}
	fmt.Printf("published official model=%q id=%d version=%d source_version=%q\n", cfg.ModelName, version.Id, version.Version, version.SourceVersion)
	return nil
}

func repriceActiveChannelModel(
	channelModelID int,
	purchaseDiscountOverride string,
	variableCostRateOverride string,
	taxRateOverride string,
	targetMarginOverride string,
) error {
	if channelModelID <= 0 {
		return errors.New("channel-model-id is required")
	}
	for _, rate := range []struct {
		name     string
		value    string
		positive bool
	}{
		{name: "purchase-discount", value: purchaseDiscountOverride, positive: true},
		{name: "variable-cost-rate", value: variableCostRateOverride},
		{name: "tax-rate", value: taxRateOverride},
		{name: "target-margin", value: targetMarginOverride, positive: true},
	} {
		if rate.value == "" {
			continue
		}
		if err := validateUnitRate(rate.name, rate.value, rate.positive); err != nil {
			return err
		}
	}
	if variableCostRateOverride != "" || taxRateOverride != "" || targetMarginOverride != "" {
		return errors.New("sales cost and margin overrides must be applied through a sales price-book revision")
	}
	var channelModel model.ChannelModel
	if err := model.DB.First(&channelModel, channelModelID).Error; err != nil {
		return err
	}
	current, err := pricingadmin.GetActivePriceBundle(channelModelID)
	if err != nil {
		return err
	}
	var pointer model.ModelOfficialPrice
	if err := model.DB.First(&pointer, "model_id = ?", channelModel.ModelId).Error; err != nil {
		return err
	}
	var official model.OfficialModelPriceVersion
	if err := model.DB.First(&official, pointer.CurrentRevisionId).Error; err != nil {
		return err
	}
	if official.Status != model.PricingVersionStatusActive || official.Source != "vendor-official" ||
		!strings.Contains(official.Remark, "https://") {
		return errors.New("current official price is not an active authoritative vendor price")
	}
	officialID := official.Id
	purchaseDiscount := current.Purchase.PurchaseDiscount
	if purchaseDiscountOverride != "" {
		purchaseDiscount = purchaseDiscountOverride
	}
	purchase, err := pricingadmin.CreatePurchaseDraft(pricingadmin.PurchaseDraftInput{
		ChannelModelId: channelModelID, OfficialPriceVersionId: &officialID,
		PricingMode: current.Purchase.PricingMode, Currency: official.Currency,
		PurchaseDiscount:  purchaseDiscount,
		QuoteReference:    current.Purchase.QuoteReference,
		ContractReference: current.Purchase.ContractReference,
		Remark:            "Recreated from current official price or procurement discount",
	}, 1)
	if err != nil {
		return err
	}
	if _, err := pricingadmin.PublishPurchasePriceVersionWithAutomation(purchase.Id, 1); err != nil {
		return err
	}
	pricingruntime.InvalidateCatalog()
	fmt.Printf(
		"repriced production channel_model_id=%d official_id=%d purchase_id=%d discount=%s\n",
		channelModelID, official.Id, purchase.Id, purchase.PurchaseDiscount,
	)
	return nil
}

func consolidateChannelModel(channelModelID, duplicateChannelModelID int) error {
	if channelModelID <= 0 || duplicateChannelModelID <= 0 || channelModelID == duplicateChannelModelID {
		return errors.New("distinct channel-model-id and duplicate-channel-model-id are required")
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		var kept model.ChannelModel
		if err := tx.First(&kept, channelModelID).Error; err != nil {
			return err
		}
		var duplicate model.ChannelModel
		if err := tx.First(&duplicate, duplicateChannelModelID).Error; err != nil {
			return err
		}
		if kept.ChannelId != duplicate.ChannelId || kept.ModelId != duplicate.ModelId {
			return errors.New("channel model records do not represent the same channel and logical model")
		}
		var purchaseCount, snapshotCount int64
		if err := tx.Model(&model.ChannelModelPurchasePriceVersion{}).
			Where("channel_model_id = ?", duplicate.Id).Count(&purchaseCount).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.RequestPricingSnapshot{}).
			Where("channel_model_id = ?", duplicate.Id).Count(&snapshotCount).Error; err != nil {
			return err
		}
		if purchaseCount > 0 || snapshotCount > 0 {
			return fmt.Errorf(
				"duplicate channel model has references: purchase=%d snapshots=%d",
				purchaseCount, snapshotCount,
			)
		}

		var activePurchases int64
		if err := tx.Model(&model.ChannelModelPurchasePriceVersion{}).
			Where("channel_model_id = ? AND status = ?", kept.Id, model.PricingVersionStatusActive).
			Count(&activePurchases).Error; err != nil {
			return err
		}
		if activePurchases != 1 {
			return fmt.Errorf("kept structured-pricing record has %d active purchase prices", activePurchases)
		}

		var channel model.Channel
		if err := tx.Select("id", "model_mapping").First(&channel, kept.ChannelId).Error; err != nil {
			return err
		}
		var logical model.Model
		if err := tx.Select("id", "model_name").First(&logical, kept.ModelId).Error; err != nil {
			return err
		}
		mapping := make(map[string]string)
		if channel.ModelMapping != nil && strings.TrimSpace(*channel.ModelMapping) != "" {
			if err := common.UnmarshalJsonStr(*channel.ModelMapping, &mapping); err != nil {
				return err
			}
		}
		if strings.TrimSpace(mapping[logical.ModelName]) != duplicate.UpstreamModelName {
			return fmt.Errorf("channel mapping for %q is %q, not duplicate upstream %q", logical.ModelName, mapping[logical.ModelName], duplicate.UpstreamModelName)
		}

		if err := tx.Delete(&duplicate).Error; err != nil {
			return err
		}
		if err := tx.Model(&kept).Update("upstream_model_name", duplicate.UpstreamModelName).Error; err != nil {
			return err
		}
		fmt.Printf(
			"consolidated channel_id=%d model=%q kept_channel_model_id=%d removed_channel_model_id=%d upstream=%q\n",
			kept.ChannelId, logical.ModelName, kept.Id, duplicate.Id, duplicate.UpstreamModelName,
		)
		return nil
	})
}

func attachProductionChannelModel(channelID int, logicalModel, upstreamModel, purchaseDiscount, variableCostRate, taxRate, targetMargin string) error {
	if variableCostRate != "" || taxRate != "" || targetMargin != "" {
		return errors.New("sales cost and margin rates must be configured on a sales price book")
	}
	if channelID <= 0 || logicalModel == "" || upstreamModel == "" {
		return errors.New("channel-id, logical-model, and upstream-model are required")
	}
	for _, rate := range []struct {
		name     string
		value    string
		positive bool
	}{
		{name: "purchase-discount", value: purchaseDiscount, positive: true},
		{name: "variable-cost-rate", value: variableCostRate},
		{name: "tax-rate", value: taxRate},
		{name: "target-margin", value: targetMargin, positive: true},
	} {
		if err := validateUnitRate(rate.name, rate.value, rate.positive); err != nil {
			return err
		}
	}

	var channel model.Channel
	if err := model.DB.First(&channel, channelID).Error; err != nil {
		return err
	}
	if channel.Status != common.ChannelStatusEnabled || !csvContains(channel.Models, logicalModel) {
		return errors.New("production channel must already be enabled for the logical model")
	}
	mapping := map[string]string{}
	if channel.ModelMapping == nil || strings.TrimSpace(*channel.ModelMapping) == "" {
		return errors.New("production channel has no model mapping")
	}
	if err := common.UnmarshalJsonStr(*channel.ModelMapping, &mapping); err != nil {
		return err
	}
	if mapping[logicalModel] != upstreamModel {
		return fmt.Errorf("production mapping for %s is %q, not %q", logicalModel, mapping[logicalModel], upstreamModel)
	}

	var logical model.Model
	if err := model.DB.Where("model_name = ? AND status = ?", logicalModel, 1).First(&logical).Error; err != nil {
		return err
	}
	var abilityCount int64
	if err := model.DB.Model(&model.Ability{}).
		Where("channel_id = ? AND model = ? AND enabled = ?", channelID, logicalModel, true).
		Count(&abilityCount).Error; err != nil {
		return err
	}
	if abilityCount == 0 {
		return errors.New("production channel has no enabled ability for the logical model")
	}

	var pointer model.ModelOfficialPrice
	if err := model.DB.First(&pointer, "model_id = ?", logical.Id).Error; err != nil {
		return err
	}
	var official model.OfficialModelPriceVersion
	if err := model.DB.First(&official, pointer.CurrentRevisionId).Error; err != nil {
		return err
	}
	if official.Status != model.PricingVersionStatusActive || official.Source != "vendor-official" ||
		!strings.Contains(official.Remark, "https://") || official.ExpressionSchemaVersion != "v2" {
		return errors.New("current official price is not an active authoritative V2 vendor price")
	}

	var channelModel model.ChannelModel
	err := model.DB.Where("channel_id = ? AND model_id = ?", channelID, logical.Id).First(&channelModel).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		channelModel = model.ChannelModel{
			ChannelId: channelID, ModelId: logical.Id, UpstreamModelName: upstreamModel,
			Status: 1, Priority: int64Value(channel.Priority), Weight: uint(channel.GetWeight()),
		}
		if err := model.DB.Create(&channelModel).Error; err != nil {
			return err
		}
	} else if err != nil {
		return err
	} else if channelModel.UpstreamModelName != upstreamModel {
		return fmt.Errorf("channel model %d uses immutable upstream %q", channelModel.Id, channelModel.UpstreamModelName)
	}
	if _, err := pricingadmin.GetActivePriceBundle(channelModel.Id); err == nil {
		return fmt.Errorf("channel model %d already has an active price bundle", channelModel.Id)
	}

	officialID := official.Id
	purchase, err := pricingadmin.CreatePurchaseDraft(pricingadmin.PurchaseDraftInput{
		ChannelModelId: channelModel.Id, OfficialPriceVersionId: &officialID,
		PricingMode: "official_ratio", Currency: official.Currency,
		PurchaseDiscount: purchaseDiscount,
		QuoteReference:   fmt.Sprintf("channel %d %s of official", channelID, purchaseDiscount),
		Remark:           "Confirmed production procurement price",
	}, 1)
	if err != nil {
		return err
	}
	if _, err := pricingadmin.PublishPurchasePriceVersionWithAutomation(purchase.Id, 1); err != nil {
		return err
	}
	pricingruntime.InvalidateCatalog()
	model.InitChannelCache()
	fmt.Printf(
		"attached production channel_id=%d model=%q channel_model_id=%d official_id=%d purchase_id=%d discount=%s\n",
		channelID, logicalModel, channelModel.Id, official.Id, purchase.Id, purchaseDiscount,
	)
	return nil
}
