package pricingadmin

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
)

var maxPricingUnitPrice = decimal.NewFromInt(1_000_000)

type businessPriceRule struct {
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

type businessPriceRuleSet struct {
	Rules []businessPriceRule `json:"rules"`
}

var businessComponentUnits = map[string]string{
	"token_input":        "token",
	"token_output":       "token",
	"cache_read":         "token",
	"cache_write":        "token",
	"cache_write_1h":     "token",
	"image_token_input":  "token",
	"image_token_output": "token",
	"audio_token_input":  "token",
	"audio_token_output": "token",
	"request":            "request",
	"tool_call":          "request",
	"generated_item":     "request",
	"image_input":        "image",
	"image_output":       "image",
	"audio_input":        "second",
	"audio_output":       "second",
	"video_input":        "second",
	"video_output":       "second",
	"character_input":    "character",
	"character_output":   "character",
}

func validateBusinessPriceRules(
	billingMode string,
	priceStructure string,
	components map[string]any,
) error {
	if _, exists := components["rules"]; !exists {
		return nil
	}
	encoded, err := common.Marshal(components)
	if err != nil {
		return err
	}
	var ruleSet businessPriceRuleSet
	if err := common.Unmarshal(encoded, &ruleSet); err != nil {
		return fmt.Errorf("price component rules are invalid: %w", err)
	}
	if len(ruleSet.Rules) == 0 {
		return errors.New("price component rules must contain at least one rule")
	}
	allowed := allowedBusinessComponents(billingMode)
	for index, rule := range ruleSet.Rules {
		position := index + 1
		expectedUnit, exists := businessComponentUnits[rule.Component]
		if !exists || !allowed[rule.Component] {
			return fmt.Errorf("price rule %d has unsupported component %q for billing mode %q", position, rule.Component, billingMode)
		}
		if rule.Unit != expectedUnit {
			return fmt.Errorf("price rule %d component %q requires unit %q", position, rule.Component, expectedUnit)
		}
		unitSize, err := decimal.NewFromString(strings.TrimSpace(rule.UnitSize))
		if err != nil || !unitSize.IsPositive() {
			return fmt.Errorf("price rule %d unit_size must be positive", position)
		}
		unitPrice, err := decimal.NewFromString(strings.TrimSpace(rule.UnitPrice))
		if err != nil || unitPrice.IsNegative() {
			return fmt.Errorf("price rule %d unit_price must be a non-negative decimal", position)
		}
		if unitPrice.GreaterThan(maxPricingUnitPrice) {
			return fmt.Errorf(
				"price rule %d unit_price must not exceed %s USD",
				position,
				maxPricingUnitPrice,
			)
		}
		if strings.TrimSpace(rule.UpperBound) != "" {
			upperBound, err := decimal.NewFromString(strings.TrimSpace(rule.UpperBound))
			if err != nil || upperBound.IsNegative() {
				return fmt.Errorf("price rule %d upper_bound must be a non-negative decimal", position)
			}
		}
		hasCondition := businessRuleHasCondition(rule)
		isLast := index == len(ruleSet.Rules)-1
		if isLast && hasCondition {
			return errors.New("the final price rule is the default fallback and cannot contain conditions")
		}
		if !isLast && !hasCondition {
			return fmt.Errorf("price rule %d must contain a matching condition", position)
		}
		if priceStructure == "tiered" && !isLast && strings.TrimSpace(rule.UpperBound) == "" {
			return fmt.Errorf("tier %d requires an upper_bound", position)
		}
	}
	return nil
}

func businessRuleHasCondition(rule businessPriceRule) bool {
	return strings.TrimSpace(rule.UpperBound) != "" ||
		strings.TrimSpace(rule.Operation) != "" ||
		strings.TrimSpace(rule.Quality) != "" ||
		strings.TrimSpace(rule.Resolution) != "" ||
		strings.TrimSpace(rule.WithAudio) != ""
}

func allowedBusinessComponents(billingMode string) map[string]bool {
	allowed := make(map[string]bool)
	add := func(names ...string) {
		for _, name := range names {
			allowed[name] = true
		}
	}
	switch billingMode {
	case "token":
		add(
			"token_input",
			"token_output",
			"cache_read",
			"cache_write",
			"cache_write_1h",
			"image_token_input",
			"image_token_output",
			"audio_token_input",
			"audio_token_output",
		)
	case "request":
		add("request", "tool_call", "generated_item")
	case "image":
		add("image_input", "image_output")
	case "audio_duration":
		add("audio_input", "audio_output")
	case "video_duration":
		add("video_input", "video_output")
	case "character":
		add("character_input", "character_output")
	case "mixed":
		for component := range businessComponentUnits {
			add(component)
		}
	}
	return allowed
}
