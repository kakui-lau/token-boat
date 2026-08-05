package doubao

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestModelListIncludesAnisparkSeedanceModels(t *testing.T) {
	assert.Subset(t, ModelList, []string{
		"bytedance/seedance-2.0-upscale",
		"bytedance/seedance-2.0-fast-upscale",
		"wb-bytedance/doubao-seedance-2-0",
		"wb-bytedance-t/doubao-seedance-2-0",
		"wb-bytedance-t/doubao-seedance-2-0-fast",
	})
}

func TestAnisparkUpscaleModelsUseCorrespondingOfficialBasePrice(t *testing.T) {
	tests := []struct {
		name    string
		base    string
		upscale string
	}{
		{
			name:    "standard",
			base:    "wb-bytedance/doubao-seedance-2-0",
			upscale: "bytedance/seedance-2.0-upscale",
		},
		{
			name:    "fast",
			base:    "doubao-seedance-2-0-fast-260128",
			upscale: "bytedance/seedance-2.0-fast-upscale",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			base, ok := videoPriceTable[tt.base]
			require.True(t, ok)
			upscale, ok := videoPriceTable[tt.upscale]
			require.True(t, ok)
			require.Len(t, upscale, len(base))
			for sku, basePrice := range base {
				assert.Equal(t, basePrice, upscale[sku])
			}
		})
	}
}
