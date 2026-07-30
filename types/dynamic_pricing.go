package types

type DynamicPriceCandidate struct {
	ChannelModelId         int
	ChannelId              int
	ModelId                int
	BillingMode            string
	PurchasePriceVersion   int
	RetailPriceVersion     int
	PurchaseExpression     string
	PurchaseExpressionHash string
	RetailExpression       string
	RetailExpressionHash   string
	PricingRevision        string
	Currency               string
	EstimatedPurchaseUSD   string
	EstimatedRetailUSD     string
}

type DynamicPricingSnapshot struct {
	CandidatesByChannelId     map[int]DynamicPriceCandidate
	RouteChannelIds           []int
	ReservationQuota          int
	EstimatedPromptTokens     int
	EstimatedCompletionTokens int
	GroupRatio                float64
	EstimatedUsage            string
	Selected                  *DynamicPriceCandidate
	AuditCreated              bool
}
