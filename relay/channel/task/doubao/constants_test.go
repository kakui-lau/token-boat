package doubao

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestModelListIncludesAnisparkSeedanceModels(t *testing.T) {
	assert.Subset(t, ModelList, []string{
		"wb-bytedance/doubao-seedance-2-0",
		"wb-bytedance-t/doubao-seedance-2-0",
		"wb-bytedance-t/doubao-seedance-2-0-fast",
	})
}

func TestAnisparkSupersamplingModelsUseSeventyPercentOfficialPrice(t *testing.T) {
	tests := []struct {
		name     string
		official string
		discount string
	}{
		{
			name:     "standard",
			official: "wb-bytedance/doubao-seedance-2-0",
			discount: "wb-bytedance-t/doubao-seedance-2-0",
		},
		{
			name:     "fast",
			official: "doubao-seedance-2-0-fast-260128",
			discount: "wb-bytedance-t/doubao-seedance-2-0-fast",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			official, ok := videoPriceTable[tt.official]
			require.True(t, ok)
			discount, ok := videoPriceTable[tt.discount]
			require.True(t, ok)
			require.Len(t, discount, len(official))
			for sku, officialPrice := range official {
				assert.InDelta(t, officialPrice*0.7, discount[sku], 1e-9)
			}
		})
	}
}
