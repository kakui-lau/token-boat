package authz

const ResourceFinance = "finance"

var (
	FinanceRead    = Permission{Resource: ResourceFinance, Action: ActionRead}
	FinanceOperate = Permission{Resource: ResourceFinance, Action: ActionOperate}
	FinanceExport  = Permission{Resource: ResourceFinance, Action: ActionExport}
)

func init() {
	RegisterResource(ResourceDefinition{
		Resource: ResourceFinance,
		LabelKey: "Financial Operations",
		Actions: []ActionDefinition{
			{
				Action:         ActionRead,
				LabelKey:       "View financial operations",
				DescriptionKey: "View platform balances, recharge orders, payment statistics, and financial reports.",
			},
			{
				Action:         ActionOperate,
				LabelKey:       "Operate financial orders",
				DescriptionKey: "Manually complete recharge orders and perform other audited financial operations.",
			},
			{
				Action:         ActionExport,
				LabelKey:       "Export financial data",
				DescriptionKey: "Export recharge orders and financial reports.",
			},
		},
	})
}
