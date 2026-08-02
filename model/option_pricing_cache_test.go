package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPricingOptionUpdateInvalidatesPricingCache(t *testing.T) {
	common.OptionMapRWMutex.Lock()
	previousOptionMap := common.OptionMap
	common.OptionMap = make(map[string]string)
	common.OptionMapRWMutex.Unlock()

	updatePricingLock.Lock()
	previousPricingMap := pricingMap
	previousPublicPricingMap := publicPricingMap
	previousVendorsList := vendorsList
	previousLastGetPricingTime := lastGetPricingTime
	pricingMap = []Pricing{{ModelName: "cached-model"}}
	publicPricingMap = []Pricing{{ModelName: "cached-public-model"}}
	vendorsList = []PricingVendor{{ID: 1, Name: "cached-vendor"}}
	lastGetPricingTime = time.Now()
	updatePricingLock.Unlock()

	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptionMap
		common.OptionMapRWMutex.Unlock()

		updatePricingLock.Lock()
		pricingMap = previousPricingMap
		publicPricingMap = previousPublicPricingMap
		vendorsList = previousVendorsList
		lastGetPricingTime = previousLastGetPricingTime
		updatePricingLock.Unlock()
	})

	require.NoError(t, updateOptionMap("ModelPrice", ratio_setting.ModelPrice2JSONString()))

	updatePricingLock.Lock()
	defer updatePricingLock.Unlock()
	assert.Nil(t, pricingMap)
	assert.Nil(t, publicPricingMap)
	assert.Nil(t, vendorsList)
	assert.True(t, lastGetPricingTime.IsZero())
}
