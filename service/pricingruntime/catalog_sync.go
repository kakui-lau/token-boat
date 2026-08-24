package pricingruntime

import (
	"context"

	"github.com/QuantumNous/new-api/common"
)

const catalogSyncChannel = "pricing:catalog:sync"

func invalidateCatalogLocal() {
	currentCatalog.Store(nil)
}

// InvalidateCatalog clears the local snapshot and notifies every application
// instance. The one-minute catalog TTL remains the fallback when Redis is not
// configured or a subscriber misses a message.
func InvalidateCatalog() {
	invalidateCatalogLocal()
	if !common.RedisEnabled || common.RDB == nil {
		return
	}
	if err := common.RDB.Publish(context.Background(), catalogSyncChannel, "reload").Err(); err != nil {
		common.SysError("failed to publish pricing catalog update: " + err.Error())
	}
}

// StartCatalogSyncSubscriber refreshes active prices after another process
// publishes or activates a price chain. This prevents a complete candidate
// pool from remaining unavailable on other pods until the catalog TTL expires.
func StartCatalogSyncSubscriber() {
	if !common.RedisEnabled || common.RDB == nil {
		return
	}

	pubsub := common.RDB.Subscribe(context.Background(), catalogSyncChannel)
	if _, err := pubsub.Receive(context.Background()); err != nil {
		common.SysError("failed to subscribe to pricing catalog updates: " + err.Error())
		_ = pubsub.Close()
		return
	}

	for range pubsub.Channel() {
		invalidateCatalogLocal()
		if err := RefreshCatalog(); err != nil {
			common.SysError("failed to refresh pricing catalog after update: " + err.Error())
		}
	}
}
