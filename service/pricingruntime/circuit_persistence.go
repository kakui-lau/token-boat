package pricingruntime

import (
	"errors"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
)

const circuitPersistenceBuffer = 512

var (
	circuitPersistenceOnce  sync.Once
	circuitPersistenceQueue = make(
		chan circuitPersistenceItem,
		circuitPersistenceBuffer,
	)
)

type circuitPersistenceItem struct {
	db    *gorm.DB
	event ChannelCircuitEvent
}

func enqueueCircuitEventPersistence(event ChannelCircuitEvent) {
	if model.DB == nil {
		return
	}
	circuitPersistenceOnce.Do(func() {
		go func() {
			for queued := range circuitPersistenceQueue {
				if err := storeCircuitEventAt(queued.db, queued.event); err != nil {
					common.SysError("persist pricing circuit event failed: " + err.Error())
				}
			}
		}()
	})
	select {
	case circuitPersistenceQueue <- circuitPersistenceItem{db: model.DB, event: event}:
	default:
		common.SysError("pricing circuit persistence queue is full; event dropped")
	}
}

func storeCircuitEvent(event ChannelCircuitEvent) error {
	return storeCircuitEventAt(model.DB, event)
}

func storeCircuitEventAt(db *gorm.DB, event ChannelCircuitEvent) error {
	return db.Create(&model.PricingCircuitEvent{
		ChannelId:  event.ChannelId,
		ModelId:    event.ModelId,
		Event:      event.Event,
		StatusCode: event.StatusCode,
		OccurredAt: event.OccurredAt,
	}).Error
}

func PurgePricingCircuitEvents(cutoff int64, batchSize int) (int64, error) {
	if cutoff <= 0 || batchSize <= 0 {
		return 0, errors.New("pricing circuit retention boundary is invalid")
	}
	var ids []int64
	if err := model.DB.Model(&model.PricingCircuitEvent{}).
		Where("occurred_at < ?", cutoff).
		Order("id ASC").
		Limit(batchSize).
		Pluck("id", &ids).Error; err != nil {
		return 0, err
	}
	if len(ids) == 0 {
		return 0, nil
	}
	result := model.DB.Where("id IN ?", ids).Delete(&model.PricingCircuitEvent{})
	return result.RowsAffected, result.Error
}
