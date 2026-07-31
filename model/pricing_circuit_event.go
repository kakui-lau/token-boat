package model

import (
	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

type PricingCircuitEvent struct {
	Id         int64  `json:"id"`
	ChannelId  int    `json:"channel_id" gorm:"not null;index"`
	Event      string `json:"event" gorm:"type:varchar(32);not null;index"`
	StatusCode int    `json:"status_code"`
	OccurredAt int64  `json:"occurred_at" gorm:"bigint;not null;index"`
	CreatedAt  int64  `json:"created_at" gorm:"bigint;not null"`
}

func (event *PricingCircuitEvent) BeforeCreate(_ *gorm.DB) error {
	if event.CreatedAt == 0 {
		event.CreatedAt = common.GetTimestamp()
	}
	return nil
}
