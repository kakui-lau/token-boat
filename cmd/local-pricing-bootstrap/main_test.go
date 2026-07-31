package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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
