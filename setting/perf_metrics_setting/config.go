package perf_metrics_setting

import "github.com/QuantumNous/new-api/setting/config"

type PerfMetricsSetting struct {
	Enabled                    bool   `json:"enabled"`
	FlushInterval              int    `json:"flush_interval"`
	BucketTime                 string `json:"bucket_time"`
	RetentionDays              int    `json:"retention_days"`
	ActiveProbeEnabled         bool   `json:"active_probe_enabled"`
	ActiveProbeIntervalMinutes int    `json:"active_probe_interval_minutes"`
}

var perfMetricsSetting = PerfMetricsSetting{
	Enabled:       true,
	FlushInterval: 5,
	BucketTime:    "hour",
	RetentionDays: 0,
	// Probes make billable upstream requests, so existing installations must
	// opt in explicitly. The initial recommended cadence is once per hour.
	ActiveProbeEnabled:         false,
	ActiveProbeIntervalMinutes: 60,
}

func GetActiveProbeInterval() int {
	if perfMetricsSetting.ActiveProbeIntervalMinutes < 5 {
		return 5
	}
	return perfMetricsSetting.ActiveProbeIntervalMinutes
}

func init() {
	config.GlobalConfig.Register("perf_metrics_setting", &perfMetricsSetting)
}

func GetSetting() PerfMetricsSetting {
	return perfMetricsSetting
}

func GetBucketSeconds() int64 {
	switch perfMetricsSetting.BucketTime {
	case "minute":
		return 60
	case "5min":
		return 300
	case "hour":
		return 3600
	default:
		return 3600
	}
}

func GetFlushIntervalMinutes() int {
	if perfMetricsSetting.FlushInterval < 1 {
		return 1
	}
	return perfMetricsSetting.FlushInterval
}
