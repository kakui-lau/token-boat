package main

import (
	"math"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/pricingruntime"
	"github.com/glebarez/sqlite"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestConvertTokenExpressionToV2PreservesCurrencyAmount(t *testing.T) {
	tests := []struct {
		name       string
		expression string
		expected   string
	}{
		{
			name:       "explicit v1",
			expression: `v1:tier("base", p * 2.5 + c * 15)`,
			expected:   `v2:(tier("base", p * 2.5 + c * 15)) / 1000000`,
		},
		{
			name:       "implicit v1",
			expression: `tier("base", p * 1 + c * 4)`,
			expected:   `v2:(tier("base", p * 1 + c * 4)) / 1000000`,
		},
		{
			name:       "existing v2",
			expression: `v2:tier("base", p * 1 / 1000000)`,
			expected:   `v2:tier("base", p * 1 / 1000000)`,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			actual, err := convertTokenExpressionToV2(test.expression)
			require.NoError(t, err)
			assert.Equal(t, test.expected, actual)
		})
	}
}

func TestConvertTokenExpressionToV2RejectsEmptyExpression(t *testing.T) {
	_, err := convertTokenExpressionToV2("  ")
	require.ErrorContains(t, err, "empty")
}

func TestValidateRoutePlanAcceptsSortedEligibleCandidates(t *testing.T) {
	err := validateRoutePlan([]pricingruntime.RouteCandidate{
		{
			ChannelId: 1, ChannelModelId: 11,
			PurchaseCost: decimal.RequireFromString("0.25"), RouteScore: 0.9,
		},
		{
			ChannelId: 2, ChannelModelId: 12,
			PurchaseCost: decimal.RequireFromString("0.30"), RouteScore: 0.7,
		},
	})
	require.NoError(t, err)
}

func TestValidateRoutePlanRejectsUnsafeOrAmbiguousPlans(t *testing.T) {
	tests := []struct {
		name       string
		candidates []pricingruntime.RouteCandidate
		errorText  string
	}{
		{name: "empty", errorText: "no eligible"},
		{
			name: "negative quote",
			candidates: []pricingruntime.RouteCandidate{{
				ChannelId: 1, ChannelModelId: 11,
				PurchaseCost: decimal.RequireFromString("-0.01"), RouteScore: 0.9,
			}},
			errorText: "negative purchase quote",
		},
		{
			name: "non finite score",
			candidates: []pricingruntime.RouteCandidate{{
				ChannelId: 1, ChannelModelId: 11,
				PurchaseCost: decimal.Zero, RouteScore: math.Inf(1),
			}},
			errorText: "invalid route score",
		},
		{
			name: "duplicate channel model",
			candidates: []pricingruntime.RouteCandidate{
				{ChannelId: 1, ChannelModelId: 11, RouteScore: 0.9},
				{ChannelId: 1, ChannelModelId: 11, RouteScore: 0.8},
			},
			errorText: "appears more than once",
		},
		{
			name: "ascending score",
			candidates: []pricingruntime.RouteCandidate{
				{ChannelId: 1, ChannelModelId: 11, RouteScore: 0.7},
				{ChannelId: 2, ChannelModelId: 12, RouteScore: 0.9},
			},
			errorText: "not sorted",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateRoutePlan(test.candidates)
			require.ErrorContains(t, err, test.errorText)
		})
	}
}

func TestValidateProductionPriceEvidenceRejectsLocalPlaceholder(t *testing.T) {
	setupProductionEvidenceTest(t, "local_bootstrap", "local-test-quote")

	err := validateProductionPriceEvidence()

	require.ErrorContains(t, err, "non-production official source")
}

func TestValidateProductionPriceEvidenceAcceptsAuditedSources(t *testing.T) {
	setupProductionEvidenceTest(t, "provider_official", "supplier-quote-2026-07")

	require.NoError(t, validateProductionPriceEvidence())
}

func setupProductionEvidenceTest(t *testing.T, source string, quoteReference string) {
	t.Helper()
	originalDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	t.Cleanup(func() {
		model.DB = originalDB
	})
	require.NoError(t, db.AutoMigrate(
		&model.ChannelModel{},
		&model.OfficialModelPriceVersion{},
		&model.ChannelModelPurchasePriceVersion{},
		&model.ChannelModelRetailPriceVersion{},
	))
	officialId := 1
	require.NoError(t, db.Create(&model.ChannelModel{
		Id: 1, ChannelId: 1, ModelId: 1, Status: 1,
		RuntimeMode: pricingruntime.RuntimeModeV2,
	}).Error)
	require.NoError(t, db.Create(&model.OfficialModelPriceVersion{
		Id: 1, ModelId: 1, BillingMode: "token", PriceStructure: "flat",
		BillingExpr: "v2:p / 1000000", ExprHash: "hash",
		ExpressionSchemaVersion: "v2", Currency: "USD",
		Source: source, SourceVersion: "2026-07-31", SourceUpdatedAt: 1785456000,
		Version: 1, Status: model.PricingVersionStatusActive,
	}).Error)
	require.NoError(t, db.Create(&model.ChannelModelPurchasePriceVersion{
		Id: 1, ChannelModelId: 1, OfficialPriceVersionId: &officialId,
		BillingMode: "token", PricingMode: "official_ratio", PriceStructure: "flat",
		PurchaseBillingExpr: "v2:p / 1000000", PurchaseExprHash: "hash",
		ExpressionSchemaVersion: "v2", Currency: "USD",
		QuoteReference: quoteReference, Version: 1,
		Status: model.PricingVersionStatusActive,
	}).Error)
	require.NoError(t, db.Create(&model.ChannelModelRetailPriceVersion{
		Id: 1, ChannelModelId: 1, PurchasePriceVersionId: 1,
		BillingMode: "token", PriceStructure: "flat",
		RetailBillingExpr: "v2:p / 1000000", RetailExprHash: "hash",
		ExpressionSchemaVersion: "v2", Currency: "USD",
		TotalVariableCostRate: "0", EffectiveTaxRate: "0",
		TargetNetMargin: "0.1", MinimumMarginRate: "0.05",
		Version: 1, Status: model.PricingVersionStatusActive,
	}).Error)
}
