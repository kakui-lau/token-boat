package pricingruntime

import (
	"context"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/alicebob/miniredis/v2"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestInvalidateCatalogPublishesDistributedReload(t *testing.T) {
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	originalEnabled := common.RedisEnabled
	originalClient := common.RDB
	common.RedisEnabled = true
	common.RDB = client
	t.Cleanup(func() {
		common.RedisEnabled = originalEnabled
		common.RDB = originalClient
		_ = client.Close()
	})

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	pubsub := client.Subscribe(ctx, catalogSyncChannel)
	t.Cleanup(func() { _ = pubsub.Close() })
	_, err := pubsub.Receive(ctx)
	require.NoError(t, err)

	currentCatalog.Store(&CatalogSnapshot{})
	InvalidateCatalog()

	message, err := pubsub.ReceiveMessage(ctx)
	require.NoError(t, err)
	assert.Equal(t, catalogSyncChannel, message.Channel)
	assert.Equal(t, "reload", message.Payload)
	assert.Nil(t, currentCatalog.Load())
}
