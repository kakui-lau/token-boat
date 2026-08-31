package model

import (
	"errors"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

type FinanceBalanceSnapshot struct {
	WalletQuota                int64 `json:"wallet_quota"`
	AffiliateQuota             int64 `json:"affiliate_quota"`
	SubscriptionQuota          int64 `json:"subscription_quota"`
	TotalAvailableQuota        int64 `json:"total_available_quota"`
	NegativeWalletQuota        int64 `json:"negative_wallet_quota"`
	UserCount                  int64 `json:"user_count"`
	UsersWithBalance           int64 `json:"users_with_balance"`
	UnlimitedSubscriptionCount int64 `json:"unlimited_subscription_count"`
}

type FinanceOrderSummary struct {
	TotalCount                 int64   `json:"total_count"`
	SuccessCount               int64   `json:"success_count"`
	PendingCount               int64   `json:"pending_count"`
	FailedCount                int64   `json:"failed_count"`
	ExpiredCount               int64   `json:"expired_count"`
	SuccessAmount              float64 `json:"success_amount"`
	PendingAmount              float64 `json:"pending_amount"`
	ExternalSuccessCount       int64   `json:"external_success_count"`
	WalletSuccessCount         int64   `json:"wallet_success_count"`
	WalletSuccessAmount        float64 `json:"wallet_success_amount"`
	SubscriptionSuccessCount   int64   `json:"subscription_success_count"`
	SubscriptionSuccessAmount  float64 `json:"subscription_success_amount"`
	InternalSubscriptionCount  int64   `json:"internal_subscription_count"`
	InternalSubscriptionAmount float64 `json:"internal_subscription_amount"`
}

type FinanceOrderStatusSummary struct {
	Status string  `json:"status"`
	Count  int64   `json:"count"`
	Amount float64 `json:"amount"`
}

type FinanceProviderSummary struct {
	Provider      string  `json:"provider"`
	Internal      bool    `json:"internal"`
	OrderCount    int64   `json:"order_count"`
	SuccessCount  int64   `json:"success_count"`
	SuccessAmount float64 `json:"success_amount"`
}

type FinanceRedemptionSummary struct {
	AvailableCount int64 `json:"available_count"`
	AvailableQuota int64 `json:"available_quota"`
	RedeemedCount  int64 `json:"redeemed_count"`
	RedeemedQuota  int64 `json:"redeemed_quota"`
	ExpiredCount   int64 `json:"expired_count"`
	ExpiredQuota   int64 `json:"expired_quota"`
}

type AdminFinanceOverview struct {
	GeneratedAt int64                       `json:"generated_at"`
	PeriodStart int64                       `json:"period_start"`
	PeriodEnd   int64                       `json:"period_end"`
	Balance     FinanceBalanceSnapshot      `json:"balance"`
	Orders      FinanceOrderSummary         `json:"orders"`
	Statuses    []FinanceOrderStatusSummary `json:"statuses"`
	Providers   []FinanceProviderSummary    `json:"providers"`
	Redemptions FinanceRedemptionSummary    `json:"redemptions"`
}

type AdminTopUpFilter struct {
	Keyword   string
	Status    string
	Provider  string
	OrderType string
	SortOrder string
	StartAt   int64
	EndAt     int64
}

func normalizeAdminTopUpFilter(filter AdminTopUpFilter) (AdminTopUpFilter, error) {
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	filter.Status = strings.TrimSpace(filter.Status)
	filter.Provider = strings.TrimSpace(filter.Provider)
	filter.OrderType = strings.TrimSpace(filter.OrderType)
	filter.SortOrder = strings.ToLower(strings.TrimSpace(filter.SortOrder))
	if filter.StartAt < 0 || filter.EndAt < 0 {
		return AdminTopUpFilter{}, errors.New("invalid topup time range")
	}
	if filter.StartAt > 0 && filter.EndAt > 0 && filter.StartAt > filter.EndAt {
		return AdminTopUpFilter{}, errors.New("invalid topup time range")
	}
	switch filter.Status {
	case "", common.TopUpStatusPending, common.TopUpStatusSuccess, common.TopUpStatusFailed, common.TopUpStatusExpired:
	default:
		return AdminTopUpFilter{}, errors.New("invalid topup status")
	}
	switch filter.OrderType {
	case "", TopUpOrderTypeWallet, TopUpOrderTypeSubscription:
	default:
		return AdminTopUpFilter{}, errors.New("invalid topup order type")
	}
	if filter.SortOrder != "" && filter.SortOrder != "asc" && filter.SortOrder != "desc" {
		return AdminTopUpFilter{}, errors.New("invalid topup sort order")
	}
	return filter, nil
}

func applyAdminTopUpFilter(query *gorm.DB, filter AdminTopUpFilter) (*gorm.DB, error) {
	filter, err := normalizeAdminTopUpFilter(filter)
	if err != nil {
		return nil, err
	}
	if filter.Keyword != "" {
		pattern, err := sanitizeLikePattern(filter.Keyword)
		if err != nil {
			return nil, err
		}
		query = query.Where("trade_no LIKE ? ESCAPE '!'", pattern)
	}
	if filter.Status != "" {
		query = query.Where("status = ?", filter.Status)
	}
	if filter.Provider != "" {
		query = query.Where(
			"payment_provider = ? OR (payment_provider = '' AND payment_method = ?)",
			filter.Provider,
			filter.Provider,
		)
	}
	if filter.OrderType != "" {
		subscriptionTradeNos := DB.Model(&SubscriptionOrder{}).Select("trade_no")
		if filter.OrderType == TopUpOrderTypeSubscription {
			query = query.Where("trade_no IN (?)", subscriptionTradeNos)
		} else {
			query = query.Where("trade_no NOT IN (?)", subscriptionTradeNos)
		}
	}
	if filter.StartAt > 0 {
		query = query.Where("create_time >= ?", filter.StartAt)
	}
	if filter.EndAt > 0 {
		query = query.Where("create_time <= ?", filter.EndAt)
	}
	return query, nil
}

func ListAdminTopUps(filter AdminTopUpFilter, offset int, limit int) ([]*TopUp, int64, error) {
	if offset < 0 || limit <= 0 || limit > 100 {
		return nil, 0, errors.New("invalid topup pagination")
	}
	query, err := applyAdminTopUpFilter(DB.Model(&TopUp{}), filter)
	if err != nil {
		return nil, 0, err
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []*TopUp
	order := "id DESC"
	if strings.EqualFold(strings.TrimSpace(filter.SortOrder), "asc") {
		order = "id ASC"
	}
	if err := query.Order(order).Offset(offset).Limit(limit).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	if err := populateTopUpPresentationFields(rows); err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

func ListUserTopUps(userID int, filter AdminTopUpFilter, offset int, limit int) ([]*TopUp, int64, error) {
	if userID <= 0 || offset < 0 || limit <= 0 || limit > 100 {
		return nil, 0, errors.New("invalid user topup pagination")
	}
	query := DB.Model(&TopUp{}).Where("user_id = ? AND create_time >= ?", userID, topUpQueryCutoff())
	query, err := applyAdminTopUpFilter(query, filter)
	if err != nil {
		return nil, 0, err
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	order := "id DESC"
	if strings.EqualFold(strings.TrimSpace(filter.SortOrder), "asc") {
		order = "id ASC"
	}
	var rows []*TopUp
	if err := query.Order(order).Offset(offset).Limit(limit).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	if err := populateTopUpPresentationFields(rows); err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

func ExportAdminTopUps(filter AdminTopUpFilter, limit int) ([]TopUp, error) {
	if limit <= 0 || limit > 50000 {
		return nil, errors.New("invalid topup export limit")
	}
	query, err := applyAdminTopUpFilter(DB.Model(&TopUp{}), filter)
	if err != nil {
		return nil, err
	}
	var values []TopUp
	if err := query.Order("id DESC").Limit(limit).Find(&values).Error; err != nil {
		return nil, err
	}
	rows := make([]*TopUp, 0, len(values))
	for index := range values {
		rows = append(rows, &values[index])
	}
	if err := populateTopUpPresentationFields(rows); err != nil {
		return nil, err
	}
	return values, nil
}

func financePeriodTopUpQuery(startAt int64, endAt int64) *gorm.DB {
	query := DB.Model(&TopUp{}).Where("create_time <= ?", endAt)
	if startAt > 0 {
		query = query.Where("create_time >= ?", startAt)
	}
	return query
}

func GetAdminFinanceOverview(startAt int64, endAt int64) (*AdminFinanceOverview, error) {
	if startAt < 0 || endAt <= 0 || (startAt > 0 && startAt > endAt) {
		return nil, errors.New("invalid finance overview time range")
	}
	overview := &AdminFinanceOverview{
		GeneratedAt: common.GetTimestamp(),
		PeriodStart: startAt,
		PeriodEnd:   endAt,
		Statuses:    []FinanceOrderStatusSummary{},
		Providers:   []FinanceProviderSummary{},
	}

	var userAggregate struct {
		WalletQuota         int64
		AffiliateQuota      int64
		NegativeWalletQuota int64
		UserCount           int64
		UsersWithBalance    int64
	}
	if err := DB.Model(&User{}).
		Select(`COALESCE(SUM(CASE WHEN quota > 0 THEN quota ELSE 0 END), 0) AS wallet_quota,
			COALESCE(SUM(CASE WHEN aff_quota > 0 THEN aff_quota ELSE 0 END), 0) AS affiliate_quota,
			COALESCE(SUM(CASE WHEN quota < 0 THEN -quota ELSE 0 END), 0) AS negative_wallet_quota,
			COUNT(*) AS user_count,
			COALESCE(SUM(CASE WHEN quota > 0 THEN 1 ELSE 0 END), 0) AS users_with_balance`).
		Scan(&userAggregate).Error; err != nil {
		return nil, err
	}

	var subscriptionAggregate struct {
		SubscriptionQuota          int64
		UnlimitedSubscriptionCount int64
	}
	if err := DB.Model(&UserSubscription{}).
		Where("status = ? AND end_time > ?", "active", overview.GeneratedAt).
		Select(`COALESCE(SUM(CASE WHEN amount_total > amount_used AND amount_total > 0 THEN amount_total - amount_used ELSE 0 END), 0) AS subscription_quota,
			COALESCE(SUM(CASE WHEN amount_total = 0 THEN 1 ELSE 0 END), 0) AS unlimited_subscription_count`).
		Scan(&subscriptionAggregate).Error; err != nil {
		return nil, err
	}
	overview.Balance = FinanceBalanceSnapshot{
		WalletQuota:                userAggregate.WalletQuota,
		AffiliateQuota:             userAggregate.AffiliateQuota,
		SubscriptionQuota:          subscriptionAggregate.SubscriptionQuota,
		TotalAvailableQuota:        userAggregate.WalletQuota + userAggregate.AffiliateQuota + subscriptionAggregate.SubscriptionQuota,
		NegativeWalletQuota:        userAggregate.NegativeWalletQuota,
		UserCount:                  userAggregate.UserCount,
		UsersWithBalance:           userAggregate.UsersWithBalance,
		UnlimitedSubscriptionCount: subscriptionAggregate.UnlimitedSubscriptionCount,
	}

	orderQuery := financePeriodTopUpQuery(startAt, endAt)
	if err := orderQuery.Select(`COUNT(*) AS total_count,
		COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS success_count,
		COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS pending_count,
		COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS failed_count,
		COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS expired_count,
		COALESCE(SUM(CASE WHEN status = ? AND COALESCE(payment_provider, '') <> ? AND NOT (COALESCE(payment_provider, '') = '' AND COALESCE(payment_method, '') = ?) THEN money ELSE 0 END), 0) AS success_amount,
		COALESCE(SUM(CASE WHEN status = ? AND COALESCE(payment_provider, '') <> ? AND NOT (COALESCE(payment_provider, '') = '' AND COALESCE(payment_method, '') = ?) THEN 1 ELSE 0 END), 0) AS external_success_count,
		COALESCE(SUM(CASE WHEN status = ? THEN money ELSE 0 END), 0) AS pending_amount`,
		common.TopUpStatusSuccess,
		common.TopUpStatusPending,
		common.TopUpStatusFailed,
		common.TopUpStatusExpired,
		common.TopUpStatusSuccess,
		PaymentProviderBalance,
		PaymentProviderBalance,
		common.TopUpStatusSuccess,
		PaymentProviderBalance,
		PaymentProviderBalance,
		common.TopUpStatusPending,
	).Scan(&overview.Orders).Error; err != nil {
		return nil, err
	}
	var subscriptionOrderAggregate struct {
		SuccessCount  int64
		SuccessAmount float64
	}
	subscriptionOrderQuery := financePeriodTopUpQuery(startAt, endAt).
		Where("status = ?", common.TopUpStatusSuccess).
		Where("COALESCE(payment_provider, '') <> ? AND NOT (COALESCE(payment_provider, '') = '' AND COALESCE(payment_method, '') = ?)", PaymentProviderBalance, PaymentProviderBalance).
		Where("trade_no IN (?)", DB.Model(&SubscriptionOrder{}).Select("trade_no"))
	if err := subscriptionOrderQuery.Select("COUNT(*) AS success_count, COALESCE(SUM(money), 0) AS success_amount").
		Scan(&subscriptionOrderAggregate).Error; err != nil {
		return nil, err
	}
	overview.Orders.SubscriptionSuccessCount = subscriptionOrderAggregate.SuccessCount
	overview.Orders.SubscriptionSuccessAmount = subscriptionOrderAggregate.SuccessAmount
	overview.Orders.WalletSuccessCount = overview.Orders.ExternalSuccessCount - overview.Orders.SubscriptionSuccessCount
	overview.Orders.WalletSuccessAmount = overview.Orders.SuccessAmount - overview.Orders.SubscriptionSuccessAmount
	var internalSubscriptionAggregate struct {
		Count  int64
		Amount float64
	}
	if err := financePeriodTopUpQuery(startAt, endAt).
		Where("status = ?", common.TopUpStatusSuccess).
		Where("COALESCE(payment_provider, '') = ? OR (COALESCE(payment_provider, '') = '' AND COALESCE(payment_method, '') = ?)", PaymentProviderBalance, PaymentProviderBalance).
		Where("trade_no IN (?)", DB.Model(&SubscriptionOrder{}).Select("trade_no")).
		Select("COUNT(*) AS count, COALESCE(SUM(money), 0) AS amount").
		Scan(&internalSubscriptionAggregate).Error; err != nil {
		return nil, err
	}
	overview.Orders.InternalSubscriptionCount = internalSubscriptionAggregate.Count
	overview.Orders.InternalSubscriptionAmount = internalSubscriptionAggregate.Amount
	if err := financePeriodTopUpQuery(startAt, endAt).Select("status, COUNT(*) AS count, COALESCE(SUM(money), 0) AS amount").
		Group("status").Order("status ASC").Scan(&overview.Statuses).Error; err != nil {
		return nil, err
	}

	var providerRows []struct {
		PaymentProvider string
		PaymentMethod   string
		OrderCount      int64
		SuccessCount    int64
		SuccessAmount   float64
	}
	if err := financePeriodTopUpQuery(startAt, endAt).Select(`payment_provider, payment_method, COUNT(*) AS order_count,
		COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS success_count,
		COALESCE(SUM(CASE WHEN status = ? THEN money ELSE 0 END), 0) AS success_amount`,
		common.TopUpStatusSuccess,
		common.TopUpStatusSuccess,
	).Group("payment_provider, payment_method").Scan(&providerRows).Error; err != nil {
		return nil, err
	}
	providers := map[string]*FinanceProviderSummary{}
	for _, row := range providerRows {
		provider := strings.TrimSpace(row.PaymentProvider)
		if provider == "" {
			provider = strings.TrimSpace(row.PaymentMethod)
		}
		if provider == "" {
			provider = "legacy"
		}
		metric := providers[provider]
		if metric == nil {
			metric = &FinanceProviderSummary{
				Provider: provider,
				Internal: provider == PaymentProviderBalance,
			}
			providers[provider] = metric
		}
		metric.OrderCount += row.OrderCount
		metric.SuccessCount += row.SuccessCount
		metric.SuccessAmount += row.SuccessAmount
	}
	for _, metric := range providers {
		overview.Providers = append(overview.Providers, *metric)
	}
	sort.Slice(overview.Providers, func(i, j int) bool {
		if overview.Providers[i].SuccessAmount == overview.Providers[j].SuccessAmount {
			return overview.Providers[i].Provider < overview.Providers[j].Provider
		}
		return overview.Providers[i].SuccessAmount > overview.Providers[j].SuccessAmount
	})

	redemptionQuery := DB.Model(&Redemption{})
	if err := redemptionQuery.Select(`
		COALESCE(SUM(CASE WHEN status = ? AND (expired_time = 0 OR expired_time >= ?) THEN 1 ELSE 0 END), 0) AS available_count,
		COALESCE(SUM(CASE WHEN status = ? AND (expired_time = 0 OR expired_time >= ?) THEN quota ELSE 0 END), 0) AS available_quota,
		COALESCE(SUM(CASE WHEN status = ? AND redeemed_time <= ? THEN 1 ELSE 0 END), 0) AS redeemed_count,
		COALESCE(SUM(CASE WHEN status = ? AND redeemed_time <= ? THEN quota ELSE 0 END), 0) AS redeemed_quota,
		COALESCE(SUM(CASE WHEN status = ? AND expired_time > 0 AND expired_time < ? THEN 1 ELSE 0 END), 0) AS expired_count,
		COALESCE(SUM(CASE WHEN status = ? AND expired_time > 0 AND expired_time < ? THEN quota ELSE 0 END), 0) AS expired_quota`,
		common.RedemptionCodeStatusEnabled, overview.GeneratedAt,
		common.RedemptionCodeStatusEnabled, overview.GeneratedAt,
		common.RedemptionCodeStatusUsed, endAt,
		common.RedemptionCodeStatusUsed, endAt,
		common.RedemptionCodeStatusEnabled, overview.GeneratedAt,
		common.RedemptionCodeStatusEnabled, overview.GeneratedAt,
	).Scan(&overview.Redemptions).Error; err != nil {
		return nil, err
	}
	if startAt > 0 {
		var redeemedInPeriod struct {
			RedeemedCount int64
			RedeemedQuota int64
		}
		if err := redemptionQuery.Where("status = ? AND redeemed_time >= ? AND redeemed_time <= ?", common.RedemptionCodeStatusUsed, startAt, endAt).
			Select("COUNT(*) AS redeemed_count, COALESCE(SUM(quota), 0) AS redeemed_quota").
			Scan(&redeemedInPeriod).Error; err != nil {
			return nil, err
		}
		overview.Redemptions.RedeemedCount = redeemedInPeriod.RedeemedCount
		overview.Redemptions.RedeemedQuota = redeemedInPeriod.RedeemedQuota
	}
	return overview, nil
}
