package pricingengine

import (
	"errors"
	"fmt"
	"math"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/shopspring/decimal"
)

const (
	MaxUsageQuantity   = 1_000_000_000
	MaxRequestBodySize = 64 * 1024
)

type Usage struct {
	PromptTokens      float64 `json:"prompt_tokens"`
	CompletionTokens  float64 `json:"completion_tokens"`
	CacheReadTokens   float64 `json:"cache_read_tokens"`
	CacheWriteTokens  float64 `json:"cache_write_tokens"`
	ImageInputTokens  float64 `json:"image_input_tokens"`
	ImageOutputTokens float64 `json:"image_output_tokens"`
	AudioInputTokens  float64 `json:"audio_input_tokens"`
	AudioOutputTokens float64 `json:"audio_output_tokens"`
	RequestCount      float64 `json:"request_count"`
	ImageCount        float64 `json:"image_count"`
	AudioSeconds      float64 `json:"audio_seconds"`
	VideoSeconds      float64 `json:"video_seconds"`
	CharacterCount    float64 `json:"character_count"`
	UsageSemantic     string  `json:"usage_semantic"`
	RequestBody       string  `json:"request_body"`
}

type Evaluation struct {
	Amount      decimal.Decimal
	MatchedTier string
}

func Evaluate(expression string, expressionHash string, usage Usage) (Evaluation, error) {
	return EvaluateWithRequest(
		expression,
		expressionHash,
		usage,
		billingexpr.RequestInput{Body: []byte(strings.TrimSpace(usage.RequestBody))},
	)
}

func EvaluateWithRequest(
	expression string,
	expressionHash string,
	usage Usage,
	request billingexpr.RequestInput,
) (Evaluation, error) {
	if err := ValidateUsage(usage); err != nil {
		return Evaluation{}, err
	}
	usageSemantic := strings.ToLower(strings.TrimSpace(usage.UsageSemantic))
	if usageSemantic == "" {
		usageSemantic = "openai"
	}
	rawParams := billingexpr.TokenParams{
		P: usage.PromptTokens, C: usage.CompletionTokens, Len: usage.PromptTokens,
		CR: usage.CacheReadTokens, CC: usage.CacheWriteTokens,
		Img: usage.ImageInputTokens, ImgO: usage.ImageOutputTokens,
		AI: usage.AudioInputTokens, AO: usage.AudioOutputTokens,
		Req: usage.RequestCount, Imgs: usage.ImageCount,
		AudS: usage.AudioSeconds, VidS: usage.VideoSeconds,
		Chars: usage.CharacterCount,
	}
	params := billingexpr.NormalizeTokenParams(
		rawParams,
		usageSemantic == "anthropic",
		billingexpr.UsedVars(expression),
	)
	rawAmount, trace, err := billingexpr.RunExprByHashWithRequest(
		expression,
		expressionHash,
		params,
		request,
	)
	if err != nil {
		return Evaluation{}, err
	}
	currencyAmount := billingexpr.CurrencyAmount(expression, rawAmount)
	if math.IsNaN(currencyAmount) || math.IsInf(currencyAmount, 0) || currencyAmount < 0 {
		return Evaluation{}, errors.New("pricing expression returned an invalid amount")
	}
	return Evaluation{
		Amount:      decimal.NewFromFloat(currencyAmount),
		MatchedTier: trace.MatchedTier,
	}, nil
}

func ValidateUsage(usage Usage) error {
	values := map[string]float64{
		"prompt_tokens": usage.PromptTokens, "completion_tokens": usage.CompletionTokens,
		"cache_read_tokens": usage.CacheReadTokens, "cache_write_tokens": usage.CacheWriteTokens,
		"image_input_tokens": usage.ImageInputTokens, "image_output_tokens": usage.ImageOutputTokens,
		"audio_input_tokens": usage.AudioInputTokens, "audio_output_tokens": usage.AudioOutputTokens,
		"request_count": usage.RequestCount, "image_count": usage.ImageCount,
		"audio_seconds": usage.AudioSeconds, "video_seconds": usage.VideoSeconds,
		"character_count": usage.CharacterCount,
	}
	for name, value := range values {
		if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 || value > MaxUsageQuantity {
			return fmt.Errorf("%s must be between 0 and %d", name, MaxUsageQuantity)
		}
	}
	requestBody := strings.TrimSpace(usage.RequestBody)
	if len(requestBody) > MaxRequestBodySize {
		return fmt.Errorf("request_body must not exceed %d bytes", MaxRequestBodySize)
	}
	if requestBody != "" {
		var parsed any
		if err := common.UnmarshalJsonStr(requestBody, &parsed); err != nil {
			return fmt.Errorf("request_body must be valid JSON: %w", err)
		}
	}
	usageSemantic := strings.ToLower(strings.TrimSpace(usage.UsageSemantic))
	if usageSemantic != "" && usageSemantic != "openai" && usageSemantic != "anthropic" {
		return errors.New("usage_semantic must be openai or anthropic")
	}
	return nil
}
