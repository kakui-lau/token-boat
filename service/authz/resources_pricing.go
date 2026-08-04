package authz

const (
	ResourcePricing           = "pricing"
	ResourcePricingGovernance = "pricing_governance"
)

var (
	PricingRead    = Permission{Resource: ResourcePricing, Action: ActionRead}
	PricingWrite   = Permission{Resource: ResourcePricing, Action: ActionWrite}
	PricingPublish = Permission{Resource: ResourcePricing, Action: ActionPublish}
	PricingExport  = Permission{Resource: ResourcePricing, Action: ActionExport}

	PricingGovernanceRead    = Permission{Resource: ResourcePricingGovernance, Action: ActionRead}
	PricingGovernanceOperate = Permission{Resource: ResourcePricingGovernance, Action: ActionOperate}
	PricingGovernanceExport  = Permission{Resource: ResourcePricingGovernance, Action: ActionExport}
)

func init() {
	RegisterResource(ResourceDefinition{
		Resource: ResourcePricing,
		LabelKey: "Model Pricing",
		Actions: []ActionDefinition{
			{
				Action:         ActionRead,
				LabelKey:       "View model pricing",
				DescriptionKey: "View official, purchase, and retail price versions and channel pricing details.",
			},
			{
				Action:         ActionWrite,
				LabelKey:       "Edit model pricing",
				DescriptionKey: "Create and edit price drafts, channel models, and pricing runtime settings.",
			},
			{
				Action:         ActionPublish,
				LabelKey:       "Publish model pricing",
				DescriptionKey: "Publish or suspend official, purchase, and retail price versions.",
			},
			{
				Action:         ActionExport,
				LabelKey:       "Export model pricing",
				DescriptionKey: "Export channel pricing and model price reports.",
			},
		},
	})

	RegisterResource(ResourceDefinition{
		Resource: ResourcePricingGovernance,
		LabelKey: "Pricing Governance",
		Actions: []ActionDefinition{
			{
				Action:         ActionRead,
				LabelKey:       "View pricing governance",
				DescriptionKey: "View billing reconciliation, cost coverage, and channel circuit status.",
			},
			{
				Action:         ActionOperate,
				LabelKey:       "Operate pricing governance",
				DescriptionKey: "Confirm refunds, record supplier costs, and reset channel circuits.",
			},
			{
				Action:         ActionExport,
				LabelKey:       "Export pricing governance data",
				DescriptionKey: "Export billing reconciliation and anomaly reports.",
			},
		},
	})
}
