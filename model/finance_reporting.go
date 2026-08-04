package model

import (
	"errors"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

type FinanceTrendPoint struct {
	BucketStart   int64   `json:"bucket_start"`
	TotalOrders   int64   `json:"total_orders"`
	SuccessOrders int64   `json:"success_orders"`
	PendingOrders int64   `json:"pending_orders"`
	FailedOrders  int64   `json:"failed_orders"`
	ExpiredOrders int64   `json:"expired_orders"`
	SuccessAmount float64 `json:"success_amount"`
}

type FinanceTrendReport struct {
	StartAt  int64               `json:"start_at"`
	EndAt    int64               `json:"end_at"`
	Interval string              `json:"interval"`
	Points   []FinanceTrendPoint `json:"points"`
}

type FinanceUserListItem struct {
	ID             int    `json:"id"`
	Username       string `json:"username"`
	DisplayName    string `json:"display_name"`
	Email          string `json:"email"`
	Group          string `json:"group" gorm:"column:user_group"`
	WalletQuota    int64  `json:"wallet_quota"`
	AffiliateQuota int64  `json:"affiliate_quota"`
	UsedQuota      int64  `json:"used_quota"`
}

type FinanceUserFundingSummary struct {
	SuccessfulOrderCount int64   `json:"successful_order_count"`
	SuccessfulAmount     float64 `json:"successful_amount"`
	CreditedQuota        int64   `json:"credited_quota"`
	RedemptionCount      int64   `json:"redemption_count"`
	RedemptionQuota      int64   `json:"redemption_quota"`
}

type FinanceUserSubscription struct {
	ID             int64  `json:"id"`
	PlanID         int    `json:"plan_id"`
	PlanTitle      string `json:"plan_title"`
	AmountTotal    int64  `json:"amount_total"`
	AmountUsed     int64  `json:"amount_used"`
	RemainingQuota int64  `json:"remaining_quota"`
	Unlimited      bool   `json:"unlimited"`
	StartTime      int64  `json:"start_time"`
	EndTime        int64  `json:"end_time"`
	Status         string `json:"status"`
}

type FinanceUserDetail struct {
	User                    FinanceUserListItem       `json:"user"`
	ActiveSubscriptionQuota int64                     `json:"active_subscription_quota"`
	TotalAvailableQuota     int64                     `json:"total_available_quota"`
	Funding                 FinanceUserFundingSummary `json:"funding"`
	Subscriptions           []FinanceUserSubscription `json:"subscriptions"`
	RecentOrders            []*TopUp                  `json:"recent_orders"`
}

func GetFinanceTrend(startAt int64, endAt int64) (*FinanceTrendReport, error) {
	if startAt < 0 || endAt <= 0 || (startAt > 0 && startAt > endAt) {
		return nil, errors.New("invalid finance trend time range")
	}
	if startAt == 0 {
		if err := DB.Model(&TopUp{}).Select("COALESCE(MIN(create_time), 0)").Scan(&startAt).Error; err != nil {
			return nil, err
		}
		if startAt == 0 {
			startAt = endAt
		}
	}
	const daySeconds int64 = 24 * 60 * 60
	startBucket := startAt - startAt%daySeconds
	endBucket := endAt - endAt%daySeconds
	if endBucket-startBucket > 730*daySeconds {
		startBucket = endBucket - 730*daySeconds
		startAt = startBucket
	}

	type trendRow struct {
		BucketDay     int64
		TotalOrders   int64
		SuccessOrders int64
		PendingOrders int64
		FailedOrders  int64
		ExpiredOrders int64
		SuccessAmount float64
	}
	var rows []trendRow
	query := DB.Model(&TopUp{}).Where("create_time >= ? AND create_time <= ?", startAt, endAt)
	if err := query.Select(`FLOOR(create_time / 86400) AS bucket_day,
		COUNT(*) AS total_orders,
		COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS success_orders,
		COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS pending_orders,
		COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS failed_orders,
		COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS expired_orders,
		COALESCE(SUM(CASE WHEN status = ? AND COALESCE(payment_provider, '') <> ? AND NOT (COALESCE(payment_provider, '') = '' AND COALESCE(payment_method, '') = ?) THEN money ELSE 0 END), 0) AS success_amount`,
		common.TopUpStatusSuccess,
		common.TopUpStatusPending,
		common.TopUpStatusFailed,
		common.TopUpStatusExpired,
		common.TopUpStatusSuccess,
		PaymentProviderBalance,
		PaymentProviderBalance,
	).Group("FLOOR(create_time / 86400)").Order("bucket_day ASC").Scan(&rows).Error; err != nil {
		return nil, err
	}

	byBucket := make(map[int64]trendRow, len(rows))
	for _, row := range rows {
		byBucket[row.BucketDay*daySeconds] = row
	}
	points := make([]FinanceTrendPoint, 0, int((endBucket-startBucket)/daySeconds)+1)
	for bucket := startBucket; bucket <= endBucket; bucket += daySeconds {
		row := byBucket[bucket]
		points = append(points, FinanceTrendPoint{
			BucketStart:   bucket,
			TotalOrders:   row.TotalOrders,
			SuccessOrders: row.SuccessOrders,
			PendingOrders: row.PendingOrders,
			FailedOrders:  row.FailedOrders,
			ExpiredOrders: row.ExpiredOrders,
			SuccessAmount: row.SuccessAmount,
		})
	}
	return &FinanceTrendReport{
		StartAt:  startAt,
		EndAt:    endAt,
		Interval: "day",
		Points:   points,
	}, nil
}

func ListFinanceUsers(keyword string, offset int, limit int) ([]FinanceUserListItem, int64, error) {
	if offset < 0 || limit <= 0 || limit > 100 {
		return nil, 0, errors.New("invalid finance user pagination")
	}
	keyword = strings.TrimSpace(keyword)
	query := DB.Model(&User{})
	if keyword != "" {
		if userID, err := strconv.Atoi(keyword); err == nil && userID > 0 {
			query = query.Where("id = ?", userID)
		} else {
			pattern, err := sanitizeLikePattern("%" + keyword + "%")
			if err != nil {
				return nil, 0, err
			}
			query = query.Where("username LIKE ? ESCAPE '!' OR display_name LIKE ? ESCAPE '!' OR email LIKE ? ESCAPE '!'", pattern, pattern, pattern)
		}
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []FinanceUserListItem
	if err := query.Select("id, username, display_name, email, " + commonGroupCol + " AS user_group, quota AS wallet_quota, aff_quota AS affiliate_quota, used_quota").
		Order("id DESC").Offset(offset).Limit(limit).Scan(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

func GetFinanceUserDetail(userID int) (*FinanceUserDetail, error) {
	if userID <= 0 {
		return nil, errors.New("invalid user id")
	}
	var user User
	if err := DB.Select("id", "username", "display_name", "email", "group", "quota", "aff_quota", "used_quota").Where("id = ?", userID).First(&user).Error; err != nil {
		return nil, err
	}
	detail := &FinanceUserDetail{
		User: FinanceUserListItem{
			ID:             user.Id,
			Username:       user.Username,
			DisplayName:    user.DisplayName,
			Email:          user.Email,
			Group:          user.Group,
			WalletQuota:    int64(user.Quota),
			AffiliateQuota: int64(user.AffQuota),
			UsedQuota:      int64(user.UsedQuota),
		},
		Subscriptions: []FinanceUserSubscription{},
		RecentOrders:  []*TopUp{},
	}

	now := common.GetTimestamp()
	var subscriptions []struct {
		ID          int64
		PlanID      int
		PlanTitle   string
		AmountTotal int64
		AmountUsed  int64
		StartTime   int64
		EndTime     int64
		Status      string
	}
	if err := DB.Table("user_subscriptions AS us").
		Select("us.id, us.plan_id, COALESCE(sp.title, '') AS plan_title, us.amount_total, us.amount_used, us.start_time, us.end_time, us.status").
		Joins("LEFT JOIN subscription_plans AS sp ON sp.id = us.plan_id").
		Where("us.user_id = ? AND us.status = ? AND us.end_time > ?", userID, "active", now).
		Order("us.end_time ASC").Scan(&subscriptions).Error; err != nil {
		return nil, err
	}
	for _, subscription := range subscriptions {
		remaining := subscription.AmountTotal - subscription.AmountUsed
		unlimited := subscription.AmountTotal == 0
		if remaining < 0 || unlimited {
			remaining = 0
		}
		detail.ActiveSubscriptionQuota += remaining
		detail.Subscriptions = append(detail.Subscriptions, FinanceUserSubscription{
			ID:             subscription.ID,
			PlanID:         subscription.PlanID,
			PlanTitle:      subscription.PlanTitle,
			AmountTotal:    subscription.AmountTotal,
			AmountUsed:     subscription.AmountUsed,
			RemainingQuota: remaining,
			Unlimited:      unlimited,
			StartTime:      subscription.StartTime,
			EndTime:        subscription.EndTime,
			Status:         subscription.Status,
		})
	}
	detail.TotalAvailableQuota = detail.User.WalletQuota + detail.User.AffiliateQuota + detail.ActiveSubscriptionQuota

	var successfulTopUps []TopUp
	if err := DB.Where("user_id = ? AND status = ?", userID, common.TopUpStatusSuccess).Find(&successfulTopUps).Error; err != nil {
		return nil, err
	}
	for index := range successfulTopUps {
		topUp := &successfulTopUps[index]
		provider := topUp.PaymentProvider
		if provider == "" {
			provider = topUp.PaymentMethod
		}
		if provider != PaymentProviderBalance {
			detail.Funding.SuccessfulOrderCount++
			detail.Funding.SuccessfulAmount += topUp.Money
		}
		credited, err := topUpQuotaToCredit(topUp)
		if err == nil && credited > 0 {
			detail.Funding.CreditedQuota += int64(credited)
		}
	}
	var redemptionAggregate struct {
		Count int64
		Quota int64
	}
	if err := DB.Model(&Redemption{}).
		Where("used_user_id = ? AND status = ?", userID, common.RedemptionCodeStatusUsed).
		Select("COUNT(*) AS count, COALESCE(SUM(quota), 0) AS quota").
		Scan(&redemptionAggregate).Error; err != nil {
		return nil, err
	}
	detail.Funding.RedemptionCount = redemptionAggregate.Count
	detail.Funding.RedemptionQuota = redemptionAggregate.Quota

	if err := DB.Where("user_id = ?", userID).Order("id DESC").Limit(20).Find(&detail.RecentOrders).Error; err != nil {
		return nil, err
	}
	if err := populateTopUpPresentationFields(detail.RecentOrders); err != nil {
		return nil, err
	}
	return detail, nil
}
