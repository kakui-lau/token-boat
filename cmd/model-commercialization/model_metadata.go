package main

import (
	"bytes"
	"errors"
	"fmt"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/pricingruntime"
	"gopkg.in/yaml.v3"
	"gorm.io/gorm"
)

type modelMetadataCatalog struct {
	Version int                        `yaml:"version"`
	Models  []modelMetadataCatalogItem `yaml:"models"`
}

type modelMetadataCatalogItem struct {
	ModelName           string   `yaml:"model_name"`
	Family              string   `yaml:"family"`
	ExpectedCurrentTags []string `yaml:"expected_current_tags"`
	Tags                []string `yaml:"tags"`
	SourceURL           string   `yaml:"source_url"`
	SourceCheckedAt     string   `yaml:"source_checked_at"`
}

func loadModelMetadataCatalog(path string) (modelMetadataCatalog, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return modelMetadataCatalog{}, err
	}
	var catalog modelMetadataCatalog
	decoder := yaml.NewDecoder(bytes.NewReader(data))
	decoder.KnownFields(true)
	if err := decoder.Decode(&catalog); err != nil {
		return modelMetadataCatalog{}, err
	}
	return catalog, validateModelMetadataCatalog(catalog)
}

func validateModelMetadataCatalog(catalog modelMetadataCatalog) error {
	if catalog.Version != 1 {
		return fmt.Errorf("unsupported model metadata catalog version %d", catalog.Version)
	}
	if len(catalog.Models) == 0 {
		return errors.New("model metadata catalog must contain at least one model")
	}
	seen := make(map[string]struct{}, len(catalog.Models))
	for index, item := range catalog.Models {
		name := strings.TrimSpace(item.ModelName)
		if name == "" {
			return fmt.Errorf("models[%d].model_name is required", index)
		}
		if _, exists := seen[name]; exists {
			return fmt.Errorf("duplicate model metadata entry %q", name)
		}
		seen[name] = struct{}{}

		family := strings.TrimSpace(item.Family)
		switch family {
		case "chat", "reasoning", "embedding", "image", "audio", "video":
		default:
			return fmt.Errorf("model %s has unsupported family %q", name, family)
		}
		tags, err := normalizeMetadataTags(item.Tags)
		if err != nil {
			return fmt.Errorf("model %s tags: %w", name, err)
		}
		if len(tags) == 0 {
			return fmt.Errorf("model %s tags must not be empty", name)
		}
		if len(strings.Join(tags, ",")) > 255 {
			return fmt.Errorf("model %s tags exceed the 255-byte database limit", name)
		}
		if inferred := inferMetadataFamily(tags); inferred != family {
			return fmt.Errorf("model %s tags infer family %q, expected %q", name, inferred, family)
		}
		if _, err := normalizeMetadataTags(item.ExpectedCurrentTags); err != nil {
			return fmt.Errorf("model %s expected_current_tags: %w", name, err)
		}

		source, err := url.ParseRequestURI(strings.TrimSpace(item.SourceURL))
		if err != nil || source.Scheme != "https" || source.Host == "" {
			return fmt.Errorf("model %s source_url must be an absolute HTTPS URL", name)
		}
		checkedAt, err := time.Parse(time.DateOnly, strings.TrimSpace(item.SourceCheckedAt))
		if err != nil {
			return fmt.Errorf("model %s source_checked_at must use YYYY-MM-DD", name)
		}
		if checkedAt.After(time.Now().UTC().Add(24 * time.Hour)) {
			return fmt.Errorf("model %s source_checked_at must not be in the future", name)
		}
	}
	return nil
}

func normalizeMetadataTags(tags []string) ([]string, error) {
	seen := make(map[string]struct{}, len(tags))
	normalized := make([]string, 0, len(tags))
	for _, raw := range tags {
		tag := strings.TrimSpace(raw)
		if tag == "" {
			return nil, errors.New("tag values must not be empty")
		}
		if strings.ContainsAny(tag, ",，") {
			return nil, fmt.Errorf("tag %q must not contain a comma", tag)
		}
		if _, exists := seen[tag]; exists {
			return nil, fmt.Errorf("duplicate tag %q", tag)
		}
		seen[tag] = struct{}{}
		normalized = append(normalized, tag)
	}
	return normalized, nil
}

func inferMetadataFamily(tags []string) string {
	metadata := strings.ToLower(strings.Join(tags, " "))
	switch {
	case strings.Contains(metadata, "video") || strings.Contains(metadata, "视频"):
		return "video"
	case strings.Contains(metadata, "audio") || strings.Contains(metadata, "speech") || strings.Contains(metadata, "tts") || strings.Contains(metadata, "音频") || strings.Contains(metadata, "语音"):
		return "audio"
	case strings.Contains(metadata, "image") || strings.Contains(metadata, "图像"):
		return "image"
	case strings.Contains(metadata, "embedding") || strings.Contains(metadata, "嵌入"):
		return "embedding"
	case strings.Contains(metadata, "reason") || strings.Contains(metadata, "推理"):
		return "reasoning"
	case strings.Contains(metadata, "chat") || strings.Contains(metadata, "对话"):
		return "chat"
	default:
		return "unknown"
	}
}

func reconcileModelMetadata(catalog modelMetadataCatalog, apply bool) error {
	names := make([]string, 0, len(catalog.Models))
	expected := make(map[string]modelMetadataCatalogItem, len(catalog.Models))
	for _, raw := range catalog.Models {
		item := raw
		item.ModelName = strings.TrimSpace(item.ModelName)
		item.Family = strings.TrimSpace(item.Family)
		item.SourceURL = strings.TrimSpace(item.SourceURL)
		item.SourceCheckedAt = strings.TrimSpace(item.SourceCheckedAt)
		item.ExpectedCurrentTags, _ = normalizeMetadataTags(item.ExpectedCurrentTags)
		item.Tags, _ = normalizeMetadataTags(item.Tags)
		names = append(names, item.ModelName)
		expected[item.ModelName] = item
	}

	var stored []model.Model
	if err := model.DB.Select("id", "model_name", "tags", "status", "visibility").Where("model_name IN ?", names).Find(&stored).Error; err != nil {
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

	changed := make([]modelMetadataCatalogItem, 0)
	for _, name := range names {
		current := byName[name]
		item := expected[name]
		if current.Status != 1 || (current.Visibility != "" && current.Visibility != model.ModelVisibilityPublic) {
			return fmt.Errorf("model %s is not an active public model", name)
		}
		currentTags := strings.TrimSpace(current.Tags)
		expectedCurrent := strings.Join(item.ExpectedCurrentTags, ",")
		desired := strings.Join(item.Tags, ",")
		action := "unchanged"
		if currentTags != desired {
			if currentTags != expectedCurrent {
				return fmt.Errorf("model %s metadata drift: current tags %q, expected %q", name, currentTags, expectedCurrent)
			}
			action = "update"
			changed = append(changed, item)
		}
		fmt.Printf("model=%s family=%s tags_current=%q tags_expected=%q action=%s source=%s checked_at=%s\n", name, item.Family, currentTags, desired, action, item.SourceURL, item.SourceCheckedAt)
	}
	if !apply {
		fmt.Printf("model_metadata_audit total=%d pending=%d\n", len(catalog.Models), len(changed))
		return nil
	}

	if err := model.DB.Transaction(func(tx *gorm.DB) error {
		for _, item := range changed {
			expectedCurrent := strings.Join(item.ExpectedCurrentTags, ",")
			query := tx.Model(&model.Model{}).Where("model_name = ?", item.ModelName)
			if expectedCurrent == "" {
				query = query.Where("(tags IS NULL OR tags = ?)", "")
			} else {
				query = query.Where("tags = ?", expectedCurrent)
			}
			result := query.Updates(map[string]interface{}{
				"tags":         strings.Join(item.Tags, ","),
				"updated_time": common.GetTimestamp(),
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
	if err := model.DB.Select("model_name", "tags").Where("model_name IN ?", names).Find(&verified).Error; err != nil {
		return err
	}
	if len(verified) != len(names) {
		return fmt.Errorf("model metadata verification returned %d rows, expected %d", len(verified), len(names))
	}
	for _, item := range verified {
		if item.Tags != strings.Join(expected[item.ModelName].Tags, ",") {
			return fmt.Errorf("model %s metadata verification failed", item.ModelName)
		}
	}
	model.InvalidatePricingCache()
	pricingruntime.InvalidateCatalog()
	fmt.Printf("model_metadata_sync total=%d updated=%d verified=%d\n", len(catalog.Models), len(changed), len(verified))
	return nil
}
