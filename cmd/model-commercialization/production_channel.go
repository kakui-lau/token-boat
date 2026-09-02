package main

import (
	"bytes"
	"errors"
	"fmt"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/pricingadmin"
	"github.com/shopspring/decimal"
	"gopkg.in/yaml.v3"
	"gorm.io/gorm"
)

type productionChannelConfig struct {
	ChannelName     string                   `yaml:"channel_name"`
	ChannelType     int                      `yaml:"channel_type"`
	ProductionGroup string                   `yaml:"production_group"`
	BaseURL         string                   `yaml:"base_url"`
	KeyEnv          string                   `yaml:"key_env"`
	ParamOverride   map[string]any           `yaml:"param_override"`
	Vendor          string                   `yaml:"vendor"`
	Icon            string                   `yaml:"icon"`
	PurchaseQuote   string                   `yaml:"purchase_quote_reference"`
	QuoteValidUntil int64                    `yaml:"quote_valid_until"`
	Models          []productionChannelModel `yaml:"models"`
}

type productionChannelModel struct {
	LogicalModel            string   `yaml:"logical_model"`
	UpstreamModel           string   `yaml:"upstream_model"`
	ContextLength           int      `yaml:"context_length"`
	Description             string   `yaml:"description"`
	Tags                    []string `yaml:"tags"`
	Endpoints               []string `yaml:"endpoints"`
	OfficialSourceURL       string   `yaml:"official_source_url"`
	OfficialSourceVersion   string   `yaml:"official_source_version"`
	OfficialSourceUpdatedAt int64    `yaml:"official_source_updated_at"`
	OfficialInput           string   `yaml:"official_input_per_1m"`
	OfficialOutput          string   `yaml:"official_output_per_1m"`
	OfficialCacheRead       string   `yaml:"official_cache_read_per_1m"`
	OfficialCacheWrite      string   `yaml:"official_cache_write_per_1m"`
	PurchaseDiscount        string   `yaml:"purchase_discount"`
	RouteEnabled            bool     `yaml:"route_enabled"`
}

type productionChannelState struct {
	Channel         model.Channel
	Models          map[string]model.Model
	ChannelModels   map[string]model.ChannelModel
	PurchaseVersion map[string]int
}

func loadProductionChannelConfig(path string) (productionChannelConfig, error) {
	var cfg productionChannelConfig
	data, err := os.ReadFile(path)
	if err != nil {
		return cfg, err
	}
	decoder := yaml.NewDecoder(bytes.NewReader(data))
	decoder.KnownFields(true)
	if err := decoder.Decode(&cfg); err != nil {
		return cfg, err
	}
	return cfg, validateProductionChannelConfig(cfg)
}

func validateProductionChannelConfig(cfg productionChannelConfig) error {
	if strings.TrimSpace(cfg.ChannelName) == "" || cfg.ChannelType <= 0 ||
		strings.TrimSpace(cfg.ProductionGroup) == "" || strings.TrimSpace(cfg.BaseURL) == "" ||
		strings.TrimSpace(cfg.KeyEnv) == "" || strings.TrimSpace(cfg.Vendor) == "" {
		return errors.New("channel_name, channel_type, production_group, base_url, key_env, and vendor are required")
	}
	if strings.Contains(cfg.ProductionGroup, ",") {
		return errors.New("production_group must contain exactly one group")
	}
	if strings.TrimSpace(cfg.PurchaseQuote) == "" || cfg.QuoteValidUntil <= common.GetTimestamp() {
		return errors.New("a current purchase_quote_reference and future quote_valid_until are required")
	}
	if len(cfg.Models) == 0 {
		return errors.New("at least one model is required")
	}
	seenLogical := make(map[string]struct{}, len(cfg.Models))
	seenUpstream := make(map[string]struct{}, len(cfg.Models))
	for _, item := range cfg.Models {
		logical := strings.TrimSpace(item.LogicalModel)
		upstream := strings.TrimSpace(item.UpstreamModel)
		if logical == "" || upstream == "" || item.ContextLength <= 0 ||
			strings.TrimSpace(item.Description) == "" || strings.TrimSpace(item.OfficialSourceURL) == "" ||
			strings.TrimSpace(item.OfficialSourceVersion) == "" || item.OfficialSourceUpdatedAt <= 0 ||
			strings.TrimSpace(item.OfficialInput) == "" || strings.TrimSpace(item.OfficialOutput) == "" {
			return fmt.Errorf("model %q has incomplete identity, metadata, or official pricing evidence", logical)
		}
		if _, exists := seenLogical[logical]; exists {
			return fmt.Errorf("duplicate logical model %q", logical)
		}
		if _, exists := seenUpstream[upstream]; exists {
			return fmt.Errorf("duplicate upstream model %q", upstream)
		}
		seenLogical[logical] = struct{}{}
		seenUpstream[upstream] = struct{}{}
		if err := validateUnitRate(logical+" purchase discount", item.PurchaseDiscount, true); err != nil {
			return err
		}
		for name, value := range map[string]string{
			"official input": item.OfficialInput, "official output": item.OfficialOutput,
			"official cache read": item.OfficialCacheRead, "official cache write": item.OfficialCacheWrite,
		} {
			if strings.TrimSpace(value) == "" {
				continue
			}
			parsed, err := decimal.NewFromString(value)
			if err != nil || parsed.IsNegative() {
				return fmt.Errorf("%s %s must be a non-negative decimal", logical, name)
			}
		}
	}
	return nil
}

func onboardProductionChannel(cfg productionChannelConfig, probe bool) error {
	key := strings.TrimSpace(os.Getenv(strings.TrimSpace(cfg.KeyEnv)))
	state, err := ensureProductionChannelCatalog(cfg, key)
	if err != nil {
		return err
	}
	disableRouting := func() {
		model.DB.Model(&model.Ability{}).Where("channel_id = ?", state.Channel.Id).Update("enabled", false)
	}
	succeeded := false
	defer func() {
		if !succeeded {
			disableRouting()
		}
	}()

	for _, item := range cfg.Models {
		logical := strings.TrimSpace(item.LogicalModel)
		official, err := ensureProductionOfficialPrice(item, state.Models[logical].Id)
		if err != nil {
			return fmt.Errorf("official price for %s: %w", logical, err)
		}
		purchaseID, err := ensureProductionPurchasePrice(
			cfg, item, state.ChannelModels[logical].Id, official.Id,
		)
		if err != nil {
			return fmt.Errorf("purchase price for %s: %w", logical, err)
		}
		state.PurchaseVersion[logical] = purchaseID
	}

	if err := ensureProductionTOCSalesPrices(cfg, state); err != nil {
		return err
	}
	if probe {
		for _, item := range cfg.Models {
			if !item.RouteEnabled {
				continue
			}
			if err := probeProductionChannelModel(state.Channel, item.UpstreamModel); err != nil {
				return fmt.Errorf("upstream probe for %s: %w", item.LogicalModel, err)
			}
		}
	}
	if err := activateProductionChannelRoutes(cfg, state); err != nil {
		return err
	}
	model.InitChannelCache()
	model.InvalidatePricingCache()
	succeeded = true
	return printProductionChannelReport(cfg, state)
}

func ensureProductionChannelCatalog(cfg productionChannelConfig, key string) (productionChannelState, error) {
	state := productionChannelState{
		Models: make(map[string]model.Model), ChannelModels: make(map[string]model.ChannelModel),
		PurchaseVersion: make(map[string]int),
	}
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		var vendor model.Vendor
		err := tx.Where("name = ?", strings.TrimSpace(cfg.Vendor)).First(&vendor).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			vendor = model.Vendor{Name: strings.TrimSpace(cfg.Vendor), Icon: strings.TrimSpace(cfg.Icon), Status: 1}
			now := common.GetTimestamp()
			vendor.CreatedTime, vendor.UpdatedTime = now, now
			if err := tx.Create(&vendor).Error; err != nil {
				return err
			}
		} else if err != nil {
			return err
		}

		logicalNames := make([]string, 0, len(cfg.Models))
		mapping := make(map[string]string, len(cfg.Models))
		for _, item := range cfg.Models {
			logical := strings.TrimSpace(item.LogicalModel)
			endpoints := item.Endpoints
			if len(endpoints) == 0 {
				endpoints = []string{"openai"}
			}
			endpointsJSON, err := common.Marshal(endpoints)
			if err != nil {
				return err
			}
			values := map[string]any{
				"model_name": logical, "description": strings.TrimSpace(item.Description),
				"icon": strings.TrimSpace(cfg.Icon), "tags": strings.Join(item.Tags, ","),
				"vendor_id": vendor.Id, "context_length": item.ContextLength,
				"endpoints": string(endpointsJSON), "status": 1, "sync_official": 0,
				"visibility": "public", "name_rule": model.NameRuleExact,
				"updated_time": common.GetTimestamp(),
			}
			var logicalModel model.Model
			err = tx.Where("model_name = ?", logical).First(&logicalModel).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				values["created_time"] = common.GetTimestamp()
				if err := tx.Table("models").Create(values).Error; err != nil {
					return err
				}
				if err := tx.Where("model_name = ?", logical).First(&logicalModel).Error; err != nil {
					return err
				}
			} else if err != nil {
				return err
			} else if err := tx.Table("models").Where("id = ?", logicalModel.Id).Updates(values).Error; err != nil {
				return err
			}
			state.Models[logical] = logicalModel
			logicalNames = append(logicalNames, logical)
			mapping[logical] = strings.TrimSpace(item.UpstreamModel)
		}
		sort.Strings(logicalNames)
		mappingJSON, err := common.Marshal(mapping)
		if err != nil {
			return err
		}
		baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
		mappingText := string(mappingJSON)
		paramOverrideJSON, err := common.Marshal(cfg.ParamOverride)
		if err != nil {
			return err
		}
		paramOverrideText := string(paramOverrideJSON)
		zeroPriority := int64(0)
		zeroWeight := uint(0)
		var channel model.Channel
		err = tx.Where("name = ?", strings.TrimSpace(cfg.ChannelName)).First(&channel).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if key == "" {
				return fmt.Errorf("channel key environment variable %s is empty", strings.TrimSpace(cfg.KeyEnv))
			}
			channel = model.Channel{
				Type: cfg.ChannelType, Key: key, Status: common.ChannelStatusEnabled,
				Name: strings.TrimSpace(cfg.ChannelName), Weight: &zeroWeight,
				CreatedTime: common.GetTimestamp(), BaseURL: &baseURL,
				Models: strings.Join(logicalNames, ","), Group: strings.TrimSpace(cfg.ProductionGroup),
				ModelMapping: &mappingText, ParamOverride: &paramOverrideText, Priority: &zeroPriority,
			}
			if err := tx.Create(&channel).Error; err != nil {
				return err
			}
		} else if err != nil {
			return err
		} else {
			if channel.Type != cfg.ChannelType {
				return fmt.Errorf("channel %d has type %d, expected %d", channel.Id, channel.Type, cfg.ChannelType)
			}
			updates := map[string]any{
				"status": common.ChannelStatusEnabled, "base_url": baseURL,
				"models": strings.Join(logicalNames, ","), "group": strings.TrimSpace(cfg.ProductionGroup),
				"model_mapping": mappingText, "param_override": paramOverrideText,
			}
			if key != "" {
				updates["key"] = key
			}
			if err := tx.Model(&model.Channel{}).Where("id = ?", channel.Id).Updates(updates).Error; err != nil {
				return err
			}
			channel.ParamOverride = &paramOverrideText
		}
		state.Channel = channel

		for _, item := range cfg.Models {
			logical := strings.TrimSpace(item.LogicalModel)
			logicalModel := state.Models[logical]
			var channelModel model.ChannelModel
			err := tx.Where("channel_id = ? AND model_id = ?", channel.Id, logicalModel.Id).
				First(&channelModel).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				channelModel = model.ChannelModel{
					ChannelId: channel.Id, ModelId: logicalModel.Id,
					UpstreamModelName: strings.TrimSpace(item.UpstreamModel), Status: 1,
				}
				if err := tx.Create(&channelModel).Error; err != nil {
					return err
				}
			} else if err != nil {
				return err
			} else if channelModel.UpstreamModelName != strings.TrimSpace(item.UpstreamModel) {
				return fmt.Errorf("channel model %d uses immutable upstream model %q", channelModel.Id, channelModel.UpstreamModelName)
			} else if err := tx.Model(&model.ChannelModel{}).Where("id = ?", channelModel.Id).Update("status", 1).Error; err != nil {
				return err
			}
			state.ChannelModels[logical] = channelModel
			var ability model.Ability
			err = tx.Where(map[string]any{
				"channel_id": channel.Id, "model": logical, "group": cfg.ProductionGroup,
			}).
				First(&ability).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				ability = model.Ability{
					Group: cfg.ProductionGroup, Model: logical, ChannelId: channel.Id,
					Enabled: false, Priority: &zeroPriority, Weight: zeroWeight,
				}
				if err := tx.Create(&ability).Error; err != nil {
					return err
				}
			} else if err != nil {
				return err
			} else if err := tx.Model(&model.Ability{}).
				Where(map[string]any{
					"channel_id": channel.Id, "model": logical, "group": cfg.ProductionGroup,
				}).
				Update("enabled", false).Error; err != nil {
				return err
			}
		}
		return nil
	})
	return state, err
}

func ensureProductionOfficialPrice(item productionChannelModel, modelID int) (model.OfficialModelPriceVersion, error) {
	prices := pricingadmin.FlatTokenPriceInput{
		InputUnitPrice: item.OfficialInput, OutputUnitPrice: item.OfficialOutput,
		CacheReadUnitPrice: item.OfficialCacheRead, CacheWriteUnitPrice: item.OfficialCacheWrite,
	}
	var active model.OfficialModelPriceVersion
	err := model.DB.Where("model_id = ? AND status = ?", modelID, model.PricingVersionStatusActive).
		Order("version DESC").First(&active).Error
	if err == nil && active.SourceUrl == strings.TrimSpace(item.OfficialSourceURL) &&
		active.SourceVersion == strings.TrimSpace(item.OfficialSourceVersion) &&
		active.SourceUpdatedAt == item.OfficialSourceUpdatedAt {
		var components map[string]any
		if decodeErr := common.UnmarshalJsonStr(active.PriceComponents, &components); decodeErr == nil {
			matches := true
			for key, want := range map[string]string{
				"input_unit_price": item.OfficialInput, "output_unit_price": item.OfficialOutput,
				"cache_read_unit_price": item.OfficialCacheRead, "cache_write_unit_price": item.OfficialCacheWrite,
			} {
				got := ""
				if value, ok := components[key]; ok {
					got = fmt.Sprint(value)
				}
				if strings.TrimSpace(want) == "" {
					if strings.TrimSpace(got) == "" {
						continue
					}
				} else if decimalValuesEqual(got, want) {
					continue
				}
				matches = false
				break
			}
			if matches {
				return active, nil
			}
		}
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return active, err
	}
	draft, err := pricingadmin.CreateOfficialFlatDraft(pricingadmin.OfficialFlatDraftInput{
		ModelId: modelID, Currency: "USD", Prices: prices, Source: "vendor-official",
		SourceUrl:       strings.TrimSpace(item.OfficialSourceURL),
		SourceVersion:   strings.TrimSpace(item.OfficialSourceVersion),
		SourceUpdatedAt: item.OfficialSourceUpdatedAt, Region: "CN",
		Remark: "Moonshot official pricing verified for production onboarding",
	}, 1)
	if err != nil {
		return draft, err
	}
	if err := pricingadmin.PublishOfficialPriceVersion(draft.Id); err != nil {
		return draft, err
	}
	return draft, model.DB.First(&draft, draft.Id).Error
}

func ensureProductionPurchasePrice(
	cfg productionChannelConfig,
	item productionChannelModel,
	channelModelID int,
	officialID int,
) (int, error) {
	var active model.ChannelModelPurchasePriceVersion
	err := model.DB.Where("channel_model_id = ? AND status = ?", channelModelID, model.PricingVersionStatusActive).
		Order("version DESC").First(&active).Error
	if err == nil && active.OfficialPriceVersionId != nil && *active.OfficialPriceVersionId == officialID &&
		decimalValuesEqual(active.PurchaseDiscount, item.PurchaseDiscount) {
		return active.Id, nil
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, err
	}
	draft, err := pricingadmin.CreatePurchaseDraft(pricingadmin.PurchaseDraftInput{
		ChannelModelId: channelModelID, OfficialPriceVersionId: &officialID,
		PricingMode: "official_ratio", Currency: "USD", PurchaseDiscount: item.PurchaseDiscount,
		QuoteReference: strings.TrimSpace(cfg.PurchaseQuote), QuoteValidUntil: cfg.QuoteValidUntil,
		Remark: "Purchase discount confirmed by operator for production onboarding",
	}, 1)
	if err != nil {
		return 0, err
	}
	if err := pricingadmin.PublishPurchasePriceVersion(draft.Id); err != nil {
		return 0, err
	}
	return draft.Id, nil
}

func ensureProductionTOCSalesPrices(cfg productionChannelConfig, state productionChannelState) error {
	var book model.SalesPriceBook
	if err := model.DB.Table("sales_price_books AS book").
		Select("book.*").Joins("JOIN sales_price_book_defaults AS defaults ON defaults.price_book_id = book.id").
		Where("defaults.default_key = ?", "toc_default").First(&book).Error; err != nil {
		return fmt.Errorf("load TOC default price book: %w", err)
	}
	if book.CurrentVersionId == nil || *book.CurrentVersionId <= 0 {
		return errors.New("TOC default price book has no active version")
	}
	complete := true
	for _, item := range cfg.Models {
		logical := strings.TrimSpace(item.LogicalModel)
		var count int64
		if err := model.DB.Table("sales_price_book_items AS item").
			Joins("JOIN sales_price_book_item_cost_sources AS source ON source.price_book_item_id = item.id").
			Where("item.price_book_version_id = ? AND item.model_id = ?", *book.CurrentVersionId, state.Models[logical].Id).
			Where("source.channel_model_id = ? AND source.purchase_price_version_id = ?",
				state.ChannelModels[logical].Id, state.PurchaseVersion[logical]).Count(&count).Error; err != nil {
			return err
		}
		if count == 0 {
			complete = false
			break
		}
	}
	if complete {
		return nil
	}
	draft, err := pricingadmin.CloneSalesPriceBookVersion(book.Id, *book.CurrentVersionId, 1)
	if err != nil {
		return fmt.Errorf("clone TOC price-book version: %w", err)
	}
	channelModelIDs := make([]int, 0, len(cfg.Models))
	for _, item := range cfg.Models {
		channelModelIDs = append(channelModelIDs, state.ChannelModels[strings.TrimSpace(item.LogicalModel)].Id)
	}
	result, err := pricingadmin.GenerateSalesPriceBookItems(draft.Id, pricingadmin.SalesPriceBookGenerationInput{
		ChannelModelIds: channelModelIDs,
		IdempotencyKey:  fmt.Sprintf("production-channel-%d-sales-version-%d", state.Channel.Id, draft.Id),
	}, 1)
	if err != nil {
		return fmt.Errorf("generate TOC sales prices: %w", err)
	}
	for _, warning := range result.Warnings {
		fmt.Printf("sales warning model=%q code=%q discount=%q\n", warning.ModelName, warning.Code, warning.SalesDiscount)
	}
	if result.Batch.ReviewCount > 0 {
		return fmt.Errorf("TOC sales draft %d requires review for %d model prices", draft.Id, result.Batch.ReviewCount)
	}
	if err := pricingadmin.PublishSalesPriceBookVersion(draft.Id, 1); err != nil {
		return fmt.Errorf("publish TOC sales price-book version %d: %w", draft.Id, err)
	}
	return nil
}

func probeProductionChannelModel(channel model.Channel, upstreamModel string) error {
	payload, err := common.Marshal(map[string]any{
		"model":      strings.TrimSpace(upstreamModel),
		"messages":   []map[string]string{{"role": "user", "content": "Reply OK"}},
		"max_tokens": 1, "stream": false,
	})
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 90 * time.Second}
	request, err := http.NewRequest(
		http.MethodPost,
		strings.TrimRight(stringValue(channel.BaseURL), "/")+"/v1/chat/completions",
		bytes.NewReader(payload),
	)
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+channel.Key)
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	var body map[string]any
	if err := common.DecodeJson(response.Body, &body); err != nil {
		return err
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("HTTP %d: %v", response.StatusCode, body["error"])
	}
	fmt.Printf("probe model=%q status=%d usage=%v\n", upstreamModel, response.StatusCode, body["usage"])
	return nil
}

func activateProductionChannelRoutes(cfg productionChannelConfig, state productionChannelState) error {
	return model.DB.Transaction(func(tx *gorm.DB) error {
		for _, item := range cfg.Models {
			logical := strings.TrimSpace(item.LogicalModel)
			if err := tx.Model(&model.ChannelModel{}).
				Where("id = ?", state.ChannelModels[logical].Id).Update("status", 1).Error; err != nil {
				return err
			}
			if err := tx.Model(&model.Ability{}).
				Where(map[string]any{
					"channel_id": state.Channel.Id, "model": logical,
					"group": strings.TrimSpace(cfg.ProductionGroup),
				}).
				Update("enabled", item.RouteEnabled).Error; err != nil {
				return err
			}
		}
		return tx.Model(&model.Channel{}).Where("id = ?", state.Channel.Id).
			Update("status", common.ChannelStatusEnabled).Error
	})
}

func printProductionChannelReport(cfg productionChannelConfig, state productionChannelState) error {
	var book model.SalesPriceBook
	if err := model.DB.Table("sales_price_books AS book").Select("book.*").
		Joins("JOIN sales_price_book_defaults AS defaults ON defaults.price_book_id = book.id").
		Where("defaults.default_key = ?", "toc_default").First(&book).Error; err != nil {
		return err
	}
	fmt.Printf("production channel id=%d name=%q group=%q TOC_price_book_id=%d current_version_id=%d\n",
		state.Channel.Id, cfg.ChannelName, cfg.ProductionGroup, book.Id, intValue(book.CurrentVersionId))
	for _, item := range cfg.Models {
		logical := strings.TrimSpace(item.LogicalModel)
		fmt.Printf("model=%q upstream=%q model_id=%d channel_model_id=%d purchase_version_id=%d route_enabled=%t\n",
			logical, item.UpstreamModel, state.Models[logical].Id, state.ChannelModels[logical].Id,
			state.PurchaseVersion[logical], item.RouteEnabled)
	}
	return nil
}

func intValue(value *int) int {
	if value == nil {
		return 0
	}
	return *value
}
