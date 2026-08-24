package types

type DynamicPriceCandidate struct {
	ChannelModelId             int
	ChannelId                  int
	ModelId                    int
	BillingMode                string
	PurchasePriceVersion       int
	RetailPriceVersion         int
	PurchaseExpression         string
	PurchaseExpressionHash     string
	RetailExpression           string
	RetailExpressionHash       string
	PricingRevision            string
	Currency                   string
	ProviderCostMode           string
	EstimatedPurchaseUSD       string
	EstimatedRetailUSD         string
	EstimatedCustomerChargeUSD string
	TotalVariableCostRate      string
	EffectiveTaxRate           string
	MinimumMarginRate          string
	EstimatedNetMarginRate     string
	MarginCompliant            bool
	SalesPriceBookId           int
	SalesPriceBookVersionId    int
	SalesPriceBookItemId       int
	PriceBookAssignmentId      int
	SalesPricingSource         string
	PaymentFeeRate             string
	DistributionFeeRate        string
	OperationsLaborRate        string
	TargetNetMargin            string
}

type DynamicPricingSnapshot struct {
	CandidatesByChannelId     map[int]DynamicPriceCandidate
	RouteChannelIds           []int
	ReservationQuota          int
	EstimatedPromptTokens     int
	EstimatedCompletionTokens int
	Group                     string
	GroupRatio                float64
	QuotaPerUnit              float64
	EstimatedUsage            string
	Selected                  *DynamicPriceCandidate
	AuditCreated              bool
}
