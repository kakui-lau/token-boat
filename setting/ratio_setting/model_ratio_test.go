package ratio_setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSeedanceVideoModelsHaveNoBuiltInPrices(t *testing.T) {
	assert.NotContains(t, GetDefaultModelPriceMap(), "bytedance/seedance-2.0")
	assert.NotContains(t, GetDefaultModelPriceMap(), "bytedance/seedance-2.0-fast")
}

func TestUpdateModelPriceAllowsRemovingOpenRouterVideoPrices(t *testing.T) {
	saved := ModelPrice2JSONString()
	t.Cleanup(func() {
		require.NoError(t, UpdateModelPriceByJSONString(saved))
	})

	require.NoError(t, UpdateModelPriceByJSONString(`{"custom-model":1.25}`))

	assert.Equal(t, 1.25, GetModelPriceMap()["custom-model"])
	assert.NotContains(t, GetModelPriceMap(), "bytedance/seedance-2.0")
	assert.NotContains(t, GetModelPriceMap(), "bytedance/seedance-2.0-fast")
}

func TestUpdateModelPricePreservesConfiguredOpenRouterVideoPrices(t *testing.T) {
	saved := ModelPrice2JSONString()
	t.Cleanup(func() {
		require.NoError(t, UpdateModelPriceByJSONString(saved))
	})

	require.NoError(t, UpdateModelPriceByJSONString(`{"bytedance/seedance-2.0":0.42,"bytedance/seedance-2.0-fast":0.24}`))

	assert.Equal(t, 0.42, GetModelPriceMap()["bytedance/seedance-2.0"])
	assert.Equal(t, 0.24, GetModelPriceMap()["bytedance/seedance-2.0-fast"])
}
