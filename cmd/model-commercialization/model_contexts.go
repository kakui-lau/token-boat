package main

import (
	"bytes"
	"errors"
	"fmt"
	"net/url"
	"os"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/pricingruntime"
	"gopkg.in/yaml.v3"
	"gorm.io/gorm"
)

type modelContextCatalog struct {
	Version int                       `yaml:"version"`
	Models  []modelContextCatalogItem `yaml:"models"`
}

type modelContextCatalogItem struct {
	ModelName       string `yaml:"model_name"`
	ContextLength   int    `yaml:"context_length"`
	MaxOutputTokens int    `yaml:"max_output_tokens,omitempty"`
	SourceURL       string `yaml:"source_url"`
}

func loadModelContextCatalog(path string) (modelContextCatalog, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return modelContextCatalog{}, err
	}
	var catalog modelContextCatalog
	decoder := yaml.NewDecoder(bytes.NewReader(data))
	decoder.KnownFields(true)
	if err := decoder.Decode(&catalog); err != nil {
		return modelContextCatalog{}, err
	}
	return catalog, validateModelContextCatalog(catalog)
}

func validateModelContextCatalog(catalog modelContextCatalog) error {
	if catalog.Version != 1 {
		return fmt.Errorf("unsupported model context catalog version %d", catalog.Version)
	}
	if len(catalog.Models) == 0 {
		return errors.New("model context catalog must contain at least one model")
	}
	seen := make(map[string]struct{}, len(catalog.Models))
	for index, item := range catalog.Models {
		name := strings.TrimSpace(item.ModelName)
		if name == "" {
			return fmt.Errorf("models[%d].model_name is required", index)
		}
		if _, exists := seen[name]; exists {
			return fmt.Errorf("duplicate model context entry %q", name)
		}
		seen[name] = struct{}{}
		if item.ContextLength <= 0 {
			return fmt.Errorf("model %s context_length must be positive", name)
		}
		if item.MaxOutputTokens < 0 {
			return fmt.Errorf("model %s max_output_tokens must be non-negative", name)
		}
		if item.MaxOutputTokens > item.ContextLength {
			return fmt.Errorf("model %s max_output_tokens must not exceed context_length", name)
		}
		source, err := url.ParseRequestURI(strings.TrimSpace(item.SourceURL))
		if err != nil || source.Scheme != "https" || source.Host == "" {
			return fmt.Errorf("model %s source_url must be an absolute HTTPS URL", name)
		}
	}
	return nil
}

func reconcileModelContexts(catalog modelContextCatalog, apply bool) error {
	names := make([]string, 0, len(catalog.Models))
	expected := make(map[string]modelContextCatalogItem, len(catalog.Models))
	for _, item := range catalog.Models {
		item.ModelName = strings.TrimSpace(item.ModelName)
		item.SourceURL = strings.TrimSpace(item.SourceURL)
		names = append(names, item.ModelName)
		expected[item.ModelName] = item
	}

	var stored []model.Model
	if err := model.DB.Select("id", "model_name", "context_length", "max_output_tokens", "limits_source_url", "limits_verified_at", "status", "visibility").Where("model_name IN ?", names).Find(&stored).Error; err != nil {
		return err
	}
	byName := make(map[string]model.Model, len(stored))
	for _, item := range stored {
		byName[item.ModelName] = item
	}
	missing := make([]string, 0)
	for _, name := range names {
		if _, exists := byName[name]; !exists {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		return fmt.Errorf("catalog models are missing from the database: %s", strings.Join(missing, ", "))
	}

	changed := make([]modelContextCatalogItem, 0)
	for _, name := range names {
		current := byName[name]
		item := expected[name]
		action := "unchanged"
		if current.ContextLength != item.ContextLength ||
			current.MaxOutputTokens != item.MaxOutputTokens ||
			current.LimitsSourceURL != item.SourceURL ||
			current.LimitsVerifiedAt == 0 {
			action = "update"
			changed = append(changed, item)
		}
		fmt.Printf("model=%s context_current=%d context_expected=%d output_current=%d output_expected=%d action=%s source=%s\n", name, current.ContextLength, item.ContextLength, current.MaxOutputTokens, item.MaxOutputTokens, action, item.SourceURL)
	}
	if !apply {
		fmt.Printf("model_context_audit total=%d pending=%d\n", len(catalog.Models), len(changed))
		return nil
	}

	if err := model.DB.Transaction(func(tx *gorm.DB) error {
		for _, item := range changed {
			now := common.GetTimestamp()
			result := tx.Model(&model.Model{}).
				Where("model_name = ?", item.ModelName).
				Updates(map[string]interface{}{
					"context_length":     item.ContextLength,
					"max_output_tokens":  item.MaxOutputTokens,
					"limits_source_url":  item.SourceURL,
					"limits_verified_at": now,
					"updated_time":       now,
				})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return fmt.Errorf("model %s update affected %d rows", item.ModelName, result.RowsAffected)
			}
		}
		return nil
	}); err != nil {
		return err
	}

	var verified []model.Model
	if err := model.DB.Select("model_name", "context_length", "max_output_tokens", "limits_source_url", "limits_verified_at").Where("model_name IN ?", names).Find(&verified).Error; err != nil {
		return err
	}
	for _, item := range verified {
		if item.ContextLength != expected[item.ModelName].ContextLength {
			return fmt.Errorf("model %s context verification failed: got %d expected %d", item.ModelName, item.ContextLength, expected[item.ModelName].ContextLength)
		}
		if item.MaxOutputTokens != expected[item.ModelName].MaxOutputTokens {
			return fmt.Errorf("model %s output limit verification failed: got %d expected %d", item.ModelName, item.MaxOutputTokens, expected[item.ModelName].MaxOutputTokens)
		}
		if item.LimitsSourceURL != expected[item.ModelName].SourceURL || item.LimitsVerifiedAt <= 0 {
			return fmt.Errorf("model %s limit provenance verification failed", item.ModelName)
		}
	}
	model.InvalidatePricingCache()
	pricingruntime.InvalidateCatalog()
	fmt.Printf("model_context_sync total=%d updated=%d verified=%d\n", len(catalog.Models), len(changed), len(verified))
	return nil
}
