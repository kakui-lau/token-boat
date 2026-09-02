package model

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// QuotaData 柱状图数据
type QuotaData struct {
	Id           int    `json:"id"`
	DimensionKey string `json:"-" gorm:"type:char(64);not null;uniqueIndex:uk_quota_data_dimension"`
	UserID       int    `json:"user_id" gorm:"index:idx_qdt_user_created,priority:1"`
	Username     string `json:"username" gorm:"index:idx_qdt_model_user_name,priority:2;index:idx_qdt_username_created,priority:1;size:64;default:''"`
	ModelName    string `json:"model_name" gorm:"index:idx_qdt_model_user_name,priority:1;size:64;default:''"`
	CreatedAt    int64  `json:"created_at" gorm:"bigint;index:idx_qdt_created_at;index:idx_qdt_user_created,priority:2;index:idx_qdt_username_created,priority:2"`
	UseGroup     string `json:"use_group" gorm:"index;size:64;default:''"`
	TokenID      int    `json:"token_id" gorm:"index;default:0"`
	ChannelID    int    `json:"channel_id" gorm:"index;default:0"`
	NodeName     string `json:"node_name" gorm:"index;size:64;default:''"`
	TokenUsed    int    `json:"token_used" gorm:"default:0"`
	Count        int    `json:"count" gorm:"default:0"`
	Quota        int    `json:"quota" gorm:"default:0"`
}

type quotaDataDimensionMigration struct {
	DimensionKey string `gorm:"column:dimension_key;type:char(64)"`
}

func (quotaDataDimensionMigration) TableName() string {
	return "quota_data"
}

type quotaDataDimensionBackfill struct {
	Id           int    `gorm:"column:id;primaryKey"`
	DimensionKey string `gorm:"column:dimension_key"`
	TokenUsed    int    `gorm:"column:token_used"`
	Count        int    `gorm:"column:count"`
	Quota        int    `gorm:"column:quota"`
}

func (quotaDataDimensionBackfill) TableName() string {
	return "quota_data"
}

func appendQuotaDataDimensionString(encoded []byte, value string) []byte {
	encoded = binary.BigEndian.AppendUint64(encoded, uint64(len(value)))
	return append(encoded, value...)
}

func quotaDataDimensionKey(quotaData *QuotaData) string {
	encoded := append([]byte{}, "quota-data-dimension:v1"...)
	encoded = binary.BigEndian.AppendUint64(encoded, uint64(int64(quotaData.UserID)))
	encoded = appendQuotaDataDimensionString(encoded, quotaData.Username)
	encoded = appendQuotaDataDimensionString(encoded, quotaData.ModelName)
	encoded = binary.BigEndian.AppendUint64(encoded, uint64(quotaData.CreatedAt))
	encoded = appendQuotaDataDimensionString(encoded, quotaData.UseGroup)
	encoded = binary.BigEndian.AppendUint64(encoded, uint64(int64(quotaData.TokenID)))
	encoded = binary.BigEndian.AppendUint64(encoded, uint64(int64(quotaData.ChannelID)))
	encoded = appendQuotaDataDimensionString(encoded, quotaData.NodeName)
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

func quotaDataDimensionsEqual(left *QuotaData, right *QuotaData) bool {
	return left.UserID == right.UserID &&
		left.Username == right.Username &&
		left.ModelName == right.ModelName &&
		left.CreatedAt == right.CreatedAt &&
		left.UseGroup == right.UseGroup &&
		left.TokenID == right.TokenID &&
		left.ChannelID == right.ChannelID &&
		left.NodeName == right.NodeName
}

func (quotaData *QuotaData) BeforeSave(_ *gorm.DB) error {
	quotaData.DimensionKey = quotaDataDimensionKey(quotaData)
	return nil
}

type QuotaDataLogParams struct {
	UserID    int
	Username  string
	ModelName string
	Quota     int
	CreatedAt int64
	TokenUsed int
	UseGroup  string
	TokenID   int
	ChannelID int
	NodeName  string
}

func UpdateQuotaData() {
	for {
		if common.DataExportEnabled {
			common.SysLog("正在更新数据看板数据...")
			if err := SaveQuotaDataCache(); err != nil {
				common.SysError("failed to save quota data cache: " + err.Error())
			}
		}
		time.Sleep(time.Duration(common.DataExportInterval) * time.Minute)
	}
}

var CacheQuotaData = make(map[string]*QuotaData)
var CacheQuotaDataLock = sync.Mutex{}

func logQuotaDataCache(quotaData *QuotaData) {
	key := quotaDataDimensionKey(quotaData)
	quotaData.DimensionKey = key
	count := quotaData.Count
	quota := quotaData.Quota
	tokenUsed := quotaData.TokenUsed
	cachedQuotaData, ok := CacheQuotaData[key]
	if ok {
		cachedQuotaData.Count += count
		cachedQuotaData.Quota += quota
		cachedQuotaData.TokenUsed += tokenUsed
		quotaData = cachedQuotaData
	}
	CacheQuotaData[key] = quotaData
}

func LogQuotaData(params QuotaDataLogParams) {
	// 只精确到小时
	createdAt := params.CreatedAt - (params.CreatedAt % 3600)
	quotaData := &QuotaData{
		UserID:    params.UserID,
		Username:  params.Username,
		ModelName: params.ModelName,
		CreatedAt: createdAt,
		UseGroup:  params.UseGroup,
		TokenID:   params.TokenID,
		ChannelID: params.ChannelID,
		NodeName:  params.NodeName,
		Count:     1,
		Quota:     params.Quota,
		TokenUsed: params.TokenUsed,
	}

	CacheQuotaDataLock.Lock()
	defer CacheQuotaDataLock.Unlock()
	logQuotaDataCache(quotaData)
}

func takeQuotaDataCacheSnapshot() map[string]*QuotaData {
	CacheQuotaDataLock.Lock()
	pendingQuotaData := CacheQuotaData
	CacheQuotaData = make(map[string]*QuotaData)
	CacheQuotaDataLock.Unlock()
	return pendingQuotaData
}

func restoreQuotaDataCache(pendingQuotaData map[string]*QuotaData) {
	CacheQuotaDataLock.Lock()
	defer CacheQuotaDataLock.Unlock()
	for _, quotaData := range pendingQuotaData {
		logQuotaDataCache(quotaData)
	}
}

func SaveQuotaDataCache() error {
	pendingQuotaData := takeQuotaDataCacheSnapshot()
	size := len(pendingQuotaData)
	if size == 0 {
		return nil
	}
	if err := DB.Transaction(func(tx *gorm.DB) error {
		for _, quotaData := range pendingQuotaData {
			if err := upsertQuotaData(tx, quotaData); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		restoreQuotaDataCache(pendingQuotaData)
		return err
	}
	common.SysLog(fmt.Sprintf("保存数据看板数据成功，共保存%d条数据", size))
	return nil
}

func upsertQuotaData(tx *gorm.DB, quotaData *QuotaData) error {
	quotaData.DimensionKey = quotaDataDimensionKey(quotaData)
	if err := tx.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "dimension_key"}},
		DoUpdates: clause.Assignments(map[string]any{
			"count":      gorm.Expr("quota_data.count + ?", quotaData.Count),
			"quota":      gorm.Expr("quota_data.quota + ?", quotaData.Quota),
			"token_used": gorm.Expr("quota_data.token_used + ?", quotaData.TokenUsed),
		}),
	}).Create(quotaData).Error; err != nil {
		return err
	}

	var stored QuotaData
	if err := tx.Select(
		"user_id", "username", "model_name", "created_at", "use_group", "token_id", "channel_id", "node_name",
	).Where("dimension_key = ?", quotaData.DimensionKey).First(&stored).Error; err != nil {
		return err
	}
	if !quotaDataDimensionsEqual(&stored, quotaData) {
		return fmt.Errorf("quota data dimension hash collision for key %s", quotaData.DimensionKey)
	}
	return nil
}

func prepareQuotaDataDimensionKey() error {
	if !DB.Migrator().HasTable(&QuotaData{}) {
		return nil
	}
	if DB.Migrator().HasColumn(&QuotaData{}, "DimensionKey") &&
		DB.Migrator().HasIndex(&QuotaData{}, "uk_quota_data_dimension") {
		return nil
	}
	if !DB.Migrator().HasColumn(&QuotaData{}, "DimensionKey") {
		if err := DB.Migrator().AddColumn(&quotaDataDimensionMigration{}, "DimensionKey"); err != nil {
			return err
		}
	}

	type quotaDataGroup struct {
		row          QuotaData
		duplicateIDs []int
		count        int64
		quota        int64
		tokenUsed    int64
	}

	return DB.Transaction(func(tx *gorm.DB) error {
		var rows []QuotaData
		if err := tx.Order("id ASC").Find(&rows).Error; err != nil {
			return err
		}
		groups := make(map[string]*quotaDataGroup, len(rows))
		maxInt := int64(^uint(0) >> 1)
		minInt := -maxInt - 1
		for _, row := range rows {
			key := quotaDataDimensionKey(&row)
			group, exists := groups[key]
			if !exists {
				groups[key] = &quotaDataGroup{
					row: row, count: int64(row.Count), quota: int64(row.Quota), tokenUsed: int64(row.TokenUsed),
				}
				continue
			}
			if !quotaDataDimensionsEqual(&group.row, &row) {
				return fmt.Errorf("quota data dimension hash collision for key %s", key)
			}
			values := []struct {
				name  string
				total *int64
				delta int64
			}{
				{name: "count", total: &group.count, delta: int64(row.Count)},
				{name: "quota", total: &group.quota, delta: int64(row.Quota)},
				{name: "token_used", total: &group.tokenUsed, delta: int64(row.TokenUsed)},
			}
			for _, value := range values {
				if (value.delta > 0 && *value.total > maxInt-value.delta) ||
					(value.delta < 0 && *value.total < minInt-value.delta) {
					return fmt.Errorf("quota data %s overflows while merging dimension %s", value.name, key)
				}
				*value.total += value.delta
			}
			group.duplicateIDs = append(group.duplicateIDs, row.Id)
		}

		keys := make([]string, 0, len(groups))
		for key := range groups {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		duplicateIDs := make([]int, 0)
		backfills := make([]quotaDataDimensionBackfill, 0, len(keys))
		for _, key := range keys {
			group := groups[key]
			duplicateIDs = append(duplicateIDs, group.duplicateIDs...)
			backfills = append(backfills, quotaDataDimensionBackfill{
				Id:           group.row.Id,
				DimensionKey: key,
				Count:        int(group.count),
				Quota:        int(group.quota),
				TokenUsed:    int(group.tokenUsed),
			})
		}
		for start := 0; start < len(duplicateIDs); start += 500 {
			end := min(start+500, len(duplicateIDs))
			if err := tx.Where("id IN ?", duplicateIDs[start:end]).Delete(&QuotaData{}).Error; err != nil {
				return err
			}
		}
		if len(backfills) == 0 {
			return nil
		}
		return tx.Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "id"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"dimension_key", "count", "quota", "token_used",
			}),
		}).CreateInBatches(&backfills, 100).Error
	})
}

func GetQuotaDataByUsername(username string, startTime int64, endTime int64) (quotaData []*QuotaData, err error) {
	var quotaDatas []*QuotaData
	// 从quota_data表中查询数据
	err = DB.Table("quota_data").
		Select("user_id, username, model_name, created_at, sum(count) as count, sum(quota) as quota, sum(token_used) as token_used").
		Where("username = ? and created_at >= ? and created_at <= ?", username, startTime, endTime).
		Group("user_id, username, model_name, created_at").
		Find(&quotaDatas).Error
	return quotaDatas, err
}

func GetQuotaDataByUserId(userId int, startTime int64, endTime int64) (quotaData []*QuotaData, err error) {
	var quotaDatas []*QuotaData
	// 从quota_data表中查询数据
	err = DB.Table("quota_data").
		Select("user_id, username, model_name, created_at, sum(count) as count, sum(quota) as quota, sum(token_used) as token_used").
		Where("user_id = ? and created_at >= ? and created_at <= ?", userId, startTime, endTime).
		Group("user_id, username, model_name, created_at").
		Find(&quotaDatas).Error
	return quotaDatas, err
}

func GetQuotaDataGroupByUser(startTime int64, endTime int64) (quotaData []*QuotaData, err error) {
	var quotaDatas []*QuotaData
	err = DB.Table("quota_data").
		Select("username, created_at, sum(count) as count, sum(quota) as quota, sum(token_used) as token_used").
		Where("created_at >= ? and created_at <= ?", startTime, endTime).
		Group("username, created_at").
		Find(&quotaDatas).Error
	return quotaDatas, err
}

func GetAllQuotaDates(startTime int64, endTime int64, username string) (quotaData []*QuotaData, err error) {
	if username != "" {
		return GetQuotaDataByUsername(username, startTime, endTime)
	}
	var quotaDatas []*QuotaData
	// 从quota_data表中查询数据
	// only select model_name, sum(count) as count, sum(quota) as quota, model_name, created_at from quota_data group by model_name, created_at;
	//err = DB.Table("quota_data").Where("created_at >= ? and created_at <= ?", startTime, endTime).Find(&quotaDatas).Error
	err = DB.Table("quota_data").Select("model_name, sum(count) as count, sum(quota) as quota, sum(token_used) as token_used, created_at").Where("created_at >= ? and created_at <= ?", startTime, endTime).Group("model_name, created_at").Find(&quotaDatas).Error
	return quotaDatas, err
}
