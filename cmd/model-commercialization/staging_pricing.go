package main

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/pricingadmin"
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
			RoutingTags:      sourceModel.RoutingTags, RuntimeMode: "legacy",
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
	if err := pricingadmin.PublishOfficialPriceVersion(version.Id); err != nil {
		return err
	}
	fmt.Printf("published official model=%q id=%d version=%d source_version=%q\n", cfg.ModelName, version.Id, version.Version, version.SourceVersion)
	return nil
}

func repriceActiveChannelModel(channelModelID int) error {
	if channelModelID <= 0 {
		return errors.New("channel-model-id is required")
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
	purchase, err := pricingadmin.CreatePurchaseDraft(pricingadmin.PurchaseDraftInput{
		ChannelModelId: channelModelID, OfficialPriceVersionId: &officialID,
		PricingMode: current.Purchase.PricingMode, Currency: official.Currency,
		PurchaseDiscount:  current.Purchase.PurchaseDiscount,
		QuoteReference:    current.Purchase.QuoteReference,
		ContractReference: current.Purchase.ContractReference,
		Remark:            "Recreated from current official price after vendor price update",
	}, 1)
	if err != nil {
		return err
	}
	retail, err := pricingadmin.CreateRetailDraft(pricingadmin.RetailDraftInput{
		ChannelModelId: channelModelID, PurchasePriceVersionId: purchase.Id,
		TotalVariableCostRate: current.Retail.TotalVariableCostRate,
		EffectiveTaxRate:      current.Retail.EffectiveTaxRate,
		TargetNetMargin:       current.Retail.TargetNetMargin,
		MinimumMarginRate:     current.Retail.MinimumMarginRate,
		Remark:                "Recreated from current purchase price after vendor price update",
	}, 1)
	if err != nil {
		return err
	}
	if err := pricingadmin.PublishRetailPriceVersion(retail.Id); err != nil {
		return err
	}
	pricingruntime.InvalidateCatalog()
	fmt.Printf(
		"repriced production channel_model_id=%d official_id=%d purchase_id=%d retail_id=%d discount=%s\n",
		channelModelID, official.Id, purchase.Id, retail.Id, purchase.PurchaseDiscount,
	)
	return nil
}
