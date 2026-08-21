package model

import (
	"strings"

	"gorm.io/gorm"
)

// ChannelModelProbe stores one result produced by the scheduled active
// channel-model probe. ChannelName is snapshotted so historical rows remain
// understandable after a channel is renamed or removed.
type ChannelModelProbe struct {
	Id           int    `json:"id" gorm:"primaryKey"`
	ChannelId    int    `json:"channel_id" gorm:"index:idx_channel_model_probe_channel_time,priority:1"`
	ChannelName  string `json:"channel_name" gorm:"size:191"`
	ModelName    string `json:"model_name" gorm:"size:191;index:idx_channel_model_probe_model_time,priority:1"`
	EndpointType string `json:"endpoint_type" gorm:"size:64"`
	Success      bool   `json:"success" gorm:"index:idx_channel_model_probe_success_time,priority:1"`
	LatencyMs    int64  `json:"latency_ms"`
	ErrorCode    string `json:"error_code" gorm:"size:128"`
	ErrorMessage string `json:"error_message" gorm:"type:text"`
	ProbedAt     int64  `json:"probed_at" gorm:"index;index:idx_channel_model_probe_channel_time,priority:2;index:idx_channel_model_probe_model_time,priority:2;index:idx_channel_model_probe_success_time,priority:2"`
}

func (ChannelModelProbe) TableName() string {
	return "channel_model_probes"
}

type ChannelModelProbeFilter struct {
	Keyword   string
	ChannelId int
	Success   *bool
	StartAt   int64
	EndAt     int64
}

type ChannelModelProbeSummary struct {
	TotalCount   int64 `json:"total_count"`
	SuccessCount int64 `json:"success_count"`
	FailedCount  int64 `json:"failed_count"`
	AvgLatencyMs int64 `json:"avg_latency_ms"`
	LastProbedAt int64 `json:"last_probed_at"`
}

type ChannelModelProbeChannel struct {
	ChannelId   int    `json:"channel_id"`
	ChannelName string `json:"channel_name"`
}

func CreateChannelModelProbe(probe *ChannelModelProbe) error {
	if probe == nil {
		return nil
	}
	return DB.Create(probe).Error
}

func ListChannelModelProbes(filter ChannelModelProbeFilter, offset int, limit int) ([]ChannelModelProbe, int64, ChannelModelProbeSummary, error) {
	applyFilter := func() *gorm.DB {
		query := DB.Model(&ChannelModelProbe{})
		if keyword := strings.TrimSpace(filter.Keyword); keyword != "" {
			query = query.Where("(model_name LIKE ? OR channel_name LIKE ?)", "%"+keyword+"%", "%"+keyword+"%")
		}
		if filter.ChannelId > 0 {
			query = query.Where("channel_id = ?", filter.ChannelId)
		}
		if filter.Success != nil {
			query = query.Where("success = ?", *filter.Success)
		}
		if filter.StartAt > 0 {
			query = query.Where("probed_at >= ?", filter.StartAt)
		}
		if filter.EndAt > 0 {
			query = query.Where("probed_at <= ?", filter.EndAt)
		}
		return query
	}

	var total int64
	if err := applyFilter().Count(&total).Error; err != nil {
		return nil, 0, ChannelModelProbeSummary{}, err
	}

	var rows []ChannelModelProbe
	if err := applyFilter().Order("probed_at DESC, id DESC").Offset(offset).Limit(limit).Find(&rows).Error; err != nil {
		return nil, 0, ChannelModelProbeSummary{}, err
	}

	var aggregate struct {
		AvgLatencyMs float64 `gorm:"column:avg_latency_ms"`
		LastProbedAt int64   `gorm:"column:last_probed_at"`
	}
	if err := applyFilter().Select("COALESCE(AVG(latency_ms), 0) AS avg_latency_ms, COALESCE(MAX(probed_at), 0) AS last_probed_at").Scan(&aggregate).Error; err != nil {
		return nil, 0, ChannelModelProbeSummary{}, err
	}
	var successCount int64
	if err := applyFilter().Where("success = ?", true).Count(&successCount).Error; err != nil {
		return nil, 0, ChannelModelProbeSummary{}, err
	}

	return rows, total, ChannelModelProbeSummary{
		TotalCount:   total,
		SuccessCount: successCount,
		FailedCount:  total - successCount,
		AvgLatencyMs: int64(aggregate.AvgLatencyMs),
		LastProbedAt: aggregate.LastProbedAt,
	}, nil
}

func DeleteChannelModelProbesBefore(cutoffTs int64) error {
	if cutoffTs <= 0 {
		return nil
	}
	return DB.Where("probed_at < ?", cutoffTs).Delete(&ChannelModelProbe{}).Error
}

func ListChannelModelProbeChannels(startAt int64, endAt int64) ([]ChannelModelProbeChannel, error) {
	var channels []ChannelModelProbeChannel
	query := DB.Model(&ChannelModelProbe{}).Select("channel_id, channel_name")
	if startAt > 0 {
		query = query.Where("probed_at >= ?", startAt)
	}
	if endAt > 0 {
		query = query.Where("probed_at <= ?", endAt)
	}
	err := query.Group("channel_id, channel_name").Order("channel_name ASC, channel_id ASC").Find(&channels).Error
	return channels, err
}
