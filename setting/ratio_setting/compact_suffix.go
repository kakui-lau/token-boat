package ratio_setting

import "strings"

const CompactModelSuffix = "-openai-compact"
const CompactWildcardModelKey = "*" + CompactModelSuffix

func WithCompactModelSuffix(modelName string) string {
	if strings.HasSuffix(modelName, CompactModelSuffix) {
		return modelName
	}
	return modelName + CompactModelSuffix
}

func WithCompactModelVariants(models []string) []string {
	variants := make([]string, 0, len(models)*2)
	seen := make(map[string]struct{}, len(models)*2)
	for _, model := range models {
		if _, ok := seen[model]; ok {
			continue
		}
		seen[model] = struct{}{}
		variants = append(variants, model)
	}
	for _, model := range models {
		compactModel := WithCompactModelSuffix(model)
		if _, ok := seen[compactModel]; ok {
			continue
		}
		seen[compactModel] = struct{}{}
		variants = append(variants, compactModel)
	}
	return variants
}

// FormatMatchingModelName normalizes parameterized aliases for route matching.
// It is independent from pricing and remains here because channel capability
// matching uses the same compact-model suffix convention.
func FormatMatchingModelName(name string) string {
	if strings.HasPrefix(name, "gemini-2.5-flash-lite") {
		name = normalizeThinkingBudgetModel(name, "gemini-2.5-flash-lite", "gemini-2.5-flash-lite-thinking-*")
	} else if strings.HasPrefix(name, "gemini-2.5-flash") {
		name = normalizeThinkingBudgetModel(name, "gemini-2.5-flash", "gemini-2.5-flash-thinking-*")
	} else if strings.HasPrefix(name, "gemini-2.5-pro") {
		name = normalizeThinkingBudgetModel(name, "gemini-2.5-pro", "gemini-2.5-pro-thinking-*")
	}
	if strings.HasPrefix(name, "gpt-4-gizmo") {
		return "gpt-4-gizmo-*"
	}
	if strings.HasPrefix(name, "gpt-4o-gizmo") {
		return "gpt-4o-gizmo-*"
	}
	return name
}

func normalizeThinkingBudgetModel(name string, prefix string, wildcard string) string {
	if strings.HasPrefix(name, prefix) && strings.Contains(name, "-thinking-") {
		return wildcard
	}
	return name
}
