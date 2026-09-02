package main

import (
	"bytes"
	"os"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
	"gorm.io/gorm"
)

func validConfig() config {
	return config{
		ChannelID: 14, LogicalModel: "moonshotai/kimi-k3", UpstreamModel: "wb-moonshot/kimi-k3",
		StagingGroup:  "internal-model-test",
		ContextLength: 1_048_576,
		Vendor:        "Moonshot", Description: "Kimi K3", OfficialSourceURL: "https://platform.kimi.ai/docs/pricing/chat-k3",
		OfficialInput: "3", OfficialOutput: "15", OfficialCacheRead: "0.3",
		PurchaseDiscount: "0.85", PaymentFeeRate: "0.04", DistributionFeeRate: "0.05",
		OperationsLaborRate: "0.02", EffectiveTaxRate: "0.165",
		TargetNetMargin: "0.03", MinimumMarginRate: "0.03",
	}
}

func TestBuildPlanCalculatesCommercialPriceChain(t *testing.T) {
	result, err := buildPlan(validConfig())
	require.NoError(t, err)
	assert.Equal(t, "2.55", result.PurchaseInput)
	assert.Equal(t, "12.75", result.PurchaseOutput)
	assert.Equal(t, "0.255", result.PurchaseCacheRead)
	assert.Equal(t, "2.98570", result.SalesInput)
	assert.Equal(t, "14.92849", result.SalesOutput)
	assert.Equal(t, "0.29857", result.SalesCacheRead)
}

func TestBuildPlanWarnsWhenSalesPriceExceedsOfficialPrice(t *testing.T) {
	cfg := validConfig()
	cfg.PurchaseDiscount = "1"
	result, err := buildPlan(cfg)
	require.NoError(t, err)
	require.NotEmpty(t, result.Warnings)
	assert.Contains(t, result.Warnings[0], "exceeds official amount")
}

func TestValidateConfigRejectsMinimumMarginAboveTarget(t *testing.T) {
	cfg := validConfig()
	cfg.MinimumMarginRate = "0.04"
	require.ErrorContains(t, validateConfig(cfg), "cannot exceed")
}

func TestValidateConfigRequiresCommercialIdentityInputs(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(*config)
		message string
	}{
		{"channel id", func(cfg *config) { cfg.ChannelID = 0 }, "channel_id is required"},
		{"staging group", func(cfg *config) { cfg.StagingGroup = "" }, "staging_group is required"},
		{"logical model", func(cfg *config) { cfg.LogicalModel = "" }, "logical_model is required"},
		{"upstream model", func(cfg *config) { cfg.UpstreamModel = "" }, "upstream_model is required"},
		{"context length", func(cfg *config) { cfg.ContextLength = 0 }, "context_length must be a positive"},
		{"purchase discount", func(cfg *config) { cfg.PurchaseDiscount = "" }, "purchase_discount is required"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			cfg := validConfig()
			test.mutate(&cfg)
			require.ErrorContains(t, validateConfig(cfg), test.message)
		})
	}
}

func TestProductionModelContextCatalogIsCompleteAndValid(t *testing.T) {
	catalog, err := loadModelContextCatalog("../../configs/model-contexts-production-20260901.yaml")
	require.NoError(t, err)
	assert.Len(t, catalog.Models, 26)
}

func TestValidateModelContextCatalogRejectsDuplicateAndUnverifiedValues(t *testing.T) {
	valid := modelContextCatalog{
		Version: 1,
		Models: []modelContextCatalogItem{{
			ModelName: "vendor/model", ContextLength: 200_000, SourceURL: "https://vendor.example/models/model",
		}},
	}
	require.NoError(t, validateModelContextCatalog(valid))

	duplicate := valid
	duplicate.Models = append(duplicate.Models, duplicate.Models[0])
	require.ErrorContains(t, validateModelContextCatalog(duplicate), "duplicate")

	invalidLength := valid
	invalidLength.Models = append([]modelContextCatalogItem(nil), valid.Models...)
	invalidLength.Models[0].ContextLength = 0
	require.ErrorContains(t, validateModelContextCatalog(invalidLength), "must be positive")

	invalidOutput := valid
	invalidOutput.Models = append([]modelContextCatalogItem(nil), valid.Models...)
	invalidOutput.Models[0].MaxOutputTokens = -1
	require.ErrorContains(t, validateModelContextCatalog(invalidOutput), "must be non-negative")

	outputExceedsContext := valid
	outputExceedsContext.Models = append([]modelContextCatalogItem(nil), valid.Models...)
	outputExceedsContext.Models[0].MaxOutputTokens = 200_001
	require.ErrorContains(t, validateModelContextCatalog(outputExceedsContext), "must not exceed")

	invalidSource := valid
	invalidSource.Models = append([]modelContextCatalogItem(nil), valid.Models...)
	invalidSource.Models[0].SourceURL = "http://vendor.example/models/model"
	require.ErrorContains(t, validateModelContextCatalog(invalidSource), "absolute HTTPS URL")
}

func TestReconcileModelContextsUpdatesOnlyContextMetadata(t *testing.T) {
	originalDB := model.DB
	t.Cleanup(func() { model.DB = originalDB })

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Model{}))
	model.DB = db
	require.NoError(t, db.Create(&model.Model{
		ModelName: "vendor/model", Description: "preserve me", ContextLength: 0, Status: 1,
	}).Error)

	catalog := modelContextCatalog{
		Version: 1,
		Models: []modelContextCatalogItem{{
			ModelName: "vendor/model", ContextLength: 200_000, MaxOutputTokens: 8192, SourceURL: "https://vendor.example/models/model",
		}},
	}
	require.NoError(t, reconcileModelContexts(catalog, true))

	var stored model.Model
	require.NoError(t, db.Where("model_name = ?", "vendor/model").First(&stored).Error)
	assert.Equal(t, 200_000, stored.ContextLength)
	assert.Equal(t, 8192, stored.MaxOutputTokens)
	assert.Equal(t, "https://vendor.example/models/model", stored.LimitsSourceURL)
	assert.Positive(t, stored.LimitsVerifiedAt)
	assert.Equal(t, "preserve me", stored.Description)
}

func TestValidateStagingChannelBlocksPublicTrafficGroups(t *testing.T) {
	tests := []struct {
		name    string
		groups  string
		wantErr bool
	}{
		{name: "isolated staging group", groups: "internal-model-test"},
		{name: "staging plus public", groups: "internal-model-test,default", wantErr: true},
		{name: "public only", groups: "default", wantErr: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateStagingChannel(model.Channel{Id: 14, Group: test.groups}, "internal-model-test")
			if test.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
		})
	}
}

func TestMoonshotProductionChannelForcesSupportedSamplingParameters(t *testing.T) {
	cfg, err := loadProductionChannelConfig("../../configs/pricing/moonshot-official-01-20260902.yaml")
	require.NoError(t, err)
	assert.EqualValues(t, 1, cfg.ParamOverride["temperature"])
	assert.EqualValues(t, 0.95, cfg.ParamOverride["top_p"])
}

func TestCSVContainsMatchesWholeModelName(t *testing.T) {
	assert.True(t, csvContains("a,moonshotai/kimi-k3,b", "moonshotai/kimi-k3"))
	assert.False(t, csvContains("a,moonshotai/kimi-k30,b", "moonshotai/kimi-k3"))
}

func TestValidateChannelPricingParamsRequiresEveryExplicitDiscount(t *testing.T) {
	params := channelPricingParams{
		ChannelID: 18, StagingGroup: "internal-model",
		Discounts: map[string]string{
			"openai": "0.61", "google": "0.63", "z-ai": "0.65",
			"anthropic": "0.85", "moonshotai": "0.8",
		},
	}
	require.NoError(t, validateChannelPricingParams(params))
	params.Discounts["google"] = ""
	require.ErrorContains(t, validateChannelPricingParams(params), "google discount is required")
}

func TestValidateChannelPricingParamsRejectsInvalidDiscounts(t *testing.T) {
	params := channelPricingParams{
		ChannelID: 18, StagingGroup: "internal-model",
		Discounts: map[string]string{
			"openai": "0.61", "google": "1.1", "z-ai": "0.65",
			"anthropic": "0.85", "moonshotai": "0.8",
		},
	}
	require.ErrorContains(t, validateChannelPricingParams(params), "google discount")
}

func TestDeepSeekOfficialExpressionsMatchPeakAndOffPeakBoundaries(t *testing.T) {
	tests := []struct {
		name         string
		path         string
		peakInput    float64
		offPeakInput float64
	}{
		{name: "flash", path: "../../configs/pricing/deepseek-v4-flash-20260817.yaml", peakInput: 0.44, offPeakInput: 0.22},
		{name: "pro", path: "../../configs/pricing/deepseek-v4-pro-20260817.yaml", peakInput: 1.32, offPeakInput: 0.66},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			data, err := os.ReadFile(test.path)
			require.NoError(t, err)
			var cfg officialExpressionConfig
			decoder := yaml.NewDecoder(bytes.NewReader(data))
			decoder.KnownFields(true)
			require.NoError(t, decoder.Decode(&cfg))

			for _, hour := range []int{0, 4, 5, 10, 23} {
				cost, trace, runErr := billingexpr.RunExprWithRequest(
					cfg.BillingExpr,
					billingexpr.TokenParams{P: 1_000_000},
					billingexpr.RequestInput{EvaluatedAtUnix: time.Date(2026, 8, 17, hour, 0, 0, 0, time.UTC).Unix()},
				)
				require.NoError(t, runErr)
				assert.InDelta(t, test.offPeakInput, cost, 1e-12, "hour=%d", hour)
				assert.Equal(t, "off_peak", trace.MatchedTier, "hour=%d", hour)
			}
			for _, hour := range []int{1, 3, 6, 9} {
				cost, trace, runErr := billingexpr.RunExprWithRequest(
					cfg.BillingExpr,
					billingexpr.TokenParams{P: 1_000_000},
					billingexpr.RequestInput{EvaluatedAtUnix: time.Date(2026, 8, 17, hour, 0, 0, 0, time.UTC).Unix()},
				)
				require.NoError(t, runErr)
				assert.InDelta(t, test.peakInput, cost, 1e-12, "hour=%d", hour)
				assert.Equal(t, "peak", trace.MatchedTier, "hour=%d", hour)
			}
		})
	}
}
