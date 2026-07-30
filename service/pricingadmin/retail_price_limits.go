package pricingadmin

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

var (
	maxPricingUnitPrice = decimal.NewFromInt(1_000_000)
	maxRetailFactor     = decimal.NewFromInt(1_000_000)
)

type comparablePriceRule struct {
	Id        string `json:"id"`
	UnitPrice string `json:"unit_price"`
}

type comparablePriceComponents struct {
	Rules []comparablePriceRule `json:"rules"`
}

func validateRetailPriceLimits(
	tx *gorm.DB,
	purchase model.ChannelModelPurchasePriceVersion,
	retail model.ChannelModelRetailPriceVersion,
) error {
	if purchase.OfficialPriceVersionId == nil {
		return validatePriceComponentLimits(retail.PriceComponents)
	}
	var official model.OfficialModelPriceVersion
	if err := tx.First(&official, *purchase.OfficialPriceVersionId).Error; err != nil {
		return fmt.Errorf("referenced official price is unavailable: %w", err)
	}
	if official.Currency != retail.Currency {
		return errors.New("retail and official price currencies do not match")
	}
	if err := validatePriceComponentLimits(retail.PriceComponents); err != nil {
		return err
	}
	return validateRetailBelowOfficial(official.PriceComponents, retail.PriceComponents)
}

func validatePriceComponentLimits(raw string) error {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	var components map[string]any
	if err := common.UnmarshalJsonStr(raw, &components); err != nil {
		return fmt.Errorf("price components are invalid: %w", err)
	}
	var inspect func(value any, key string) error
	inspect = func(value any, key string) error {
		switch typed := value.(type) {
		case map[string]any:
			for childKey, childValue := range typed {
				if err := inspect(childValue, childKey); err != nil {
					return err
				}
			}
		case []any:
			for _, childValue := range typed {
				if err := inspect(childValue, key); err != nil {
					return err
				}
			}
		case string:
			if key != "unit_price" && !strings.HasSuffix(key, "_unit_price") {
				return nil
			}
			trimmed := strings.TrimSpace(typed)
			if trimmed == "" {
				return nil
			}
			price, err := decimal.NewFromString(trimmed)
			if err != nil || price.IsNegative() {
				return fmt.Errorf("%s must be a non-negative decimal", key)
			}
			if price.GreaterThan(maxPricingUnitPrice) {
				return fmt.Errorf("%s must not exceed %s USD", key, maxPricingUnitPrice)
			}
		}
		return nil
	}
	return inspect(components, "")
}

func validateRetailBelowOfficial(officialRaw string, retailRaw string) error {
	var official map[string]any
	if err := common.UnmarshalJsonStr(officialRaw, &official); err != nil {
		return fmt.Errorf("official price components are invalid: %w", err)
	}
	var retail map[string]any
	if err := common.UnmarshalJsonStr(retailRaw, &retail); err != nil {
		return fmt.Errorf("retail price components are invalid: %w", err)
	}

	if _, hasRules := retail["rules"]; hasRules {
		officialRules, err := decodeComparableRules(official)
		if err != nil {
			return fmt.Errorf("official price rules are invalid: %w", err)
		}
		retailRules, err := decodeComparableRules(retail)
		if err != nil {
			return fmt.Errorf("retail price rules are invalid: %w", err)
		}
		for index, retailRule := range retailRules {
			officialRule := comparablePriceRule{}
			found := false
			if retailRule.Id != "" {
				for _, candidate := range officialRules {
					if candidate.Id == retailRule.Id {
						officialRule = candidate
						found = true
						break
					}
				}
			} else if index < len(officialRules) {
				officialRule = officialRules[index]
				found = true
			}
			if !found {
				return fmt.Errorf("official price is missing for retail rule %d", index+1)
			}
			if err := requireRetailPriceBelowOfficial(
				fmt.Sprintf("rule %d", index+1),
				retailRule.UnitPrice,
				officialRule.UnitPrice,
			); err != nil {
				return err
			}
		}
		return nil
	}

	foundRetailPrice := false
	for key, value := range retail {
		if key != "unit_price" && !strings.HasSuffix(key, "_unit_price") {
			continue
		}
		retailValue, ok := value.(string)
		if !ok || strings.TrimSpace(retailValue) == "" {
			continue
		}
		foundRetailPrice = true
		officialValue, ok := official[key].(string)
		if !ok || strings.TrimSpace(officialValue) == "" {
			return fmt.Errorf("official price is missing for %s", key)
		}
		if err := requireRetailPriceBelowOfficial(key, retailValue, officialValue); err != nil {
			return err
		}
	}
	if !foundRetailPrice {
		return errors.New("retail price components contain no comparable unit prices")
	}
	return nil
}

func decodeComparableRules(components map[string]any) ([]comparablePriceRule, error) {
	encoded, err := common.Marshal(components)
	if err != nil {
		return nil, err
	}
	var decoded comparablePriceComponents
	if err := common.Unmarshal(encoded, &decoded); err != nil {
		return nil, err
	}
	if len(decoded.Rules) == 0 {
		return nil, errors.New("price rules are required")
	}
	return decoded.Rules, nil
}

func requireRetailPriceBelowOfficial(
	name string,
	retailValue string,
	officialValue string,
) error {
	retailPrice, err := decimal.NewFromString(strings.TrimSpace(retailValue))
	if err != nil {
		return fmt.Errorf("%s retail price is invalid: %w", name, err)
	}
	officialPrice, err := decimal.NewFromString(strings.TrimSpace(officialValue))
	if err != nil {
		return fmt.Errorf("%s official price is invalid: %w", name, err)
	}
	if retailPrice.GreaterThanOrEqual(officialPrice) {
		return fmt.Errorf("%s retail price must be lower than the official price", name)
	}
	return nil
}
