export type AdminCapabilityId =
  | "admin-overview"
  | "audit-logs"
  | "channel-usage"
  | "channels"
  | "customer-usage"
  | "diagnostics"
  | "finance"
  | "models"
  | "official-pricing"
  | "price-books"
  | "pricing-governance"
  | "purchase-pricing"
  | "redemptions"
  | "requests"
  | "subscriptions"
  | "system-info"
  | "system-settings"
  | "users";

export type AdminNavigationItem = {
  accessMode: "inspect" | "operate";
  capabilityId: AdminCapabilityId;
  dataVisibility: "expanded" | "platform" | "sensitive";
  descriptionKey: string;
  includedCapabilityKeys: readonly string[];
  labelKey: string;
  path: `/admin/${string}`;
  scope: "customers" | "platform" | "system";
  status: "scaffolded";
};

export type AdminNavigationGroup = {
  labelKey: string;
  items: readonly AdminNavigationItem[];
};

export const adminOverviewItem = adminItem({
  accessMode: "inspect",
  capabilityId: "admin-overview",
  dataVisibility: "platform",
  descriptionKey: "workspace.overview.description",
  labelKey: "nav.overview",
  path: "/admin/",
  scope: "platform",
});

export const adminRouteCatalog: readonly AdminNavigationGroup[] = [
  {
    labelKey: "nav.adminWorkspace",
    items: [adminOverviewItem],
  },
  {
    labelKey: "nav.gateway",
    items: [
      adminItem({
        capabilityId: "channels",
        descriptionKey: "workspace.channels.description",
        includedCapabilityKeys: [
          "workspace.channels.routing",
          "workspace.channels.probes",
          "workspace.channels.credentials",
          "workspace.channels.health",
        ],
        labelKey: "nav.channels",
        path: "/admin/gateway/channels",
      }),
      adminItem({
        capabilityId: "requests",
        dataVisibility: "sensitive",
        descriptionKey: "workspace.requests.description",
        includedCapabilityKeys: [
          "workspace.requests.logs",
          "workspace.requests.tasks",
          "workspace.requests.billing",
        ],
        labelKey: "nav.requests",
        path: "/admin/operations/requests",
      }),
      adminItem({
        capabilityId: "channel-usage",
        descriptionKey: "workspace.channelUsage.description",
        includedCapabilityKeys: [
          "workspace.channelUsage.daily",
          "workspace.channelUsage.monthly",
          "workspace.channelUsage.settlement",
        ],
        labelKey: "nav.channelUsage",
        path: "/admin/operations/channel-usage",
      }),
      adminItem({
        capabilityId: "diagnostics",
        descriptionKey: "workspace.diagnostics.description",
        includedCapabilityKeys: [
          "workspace.diagnostics.api",
          "workspace.diagnostics.model",
          "workspace.diagnostics.channel",
        ],
        labelKey: "nav.diagnostics",
        path: "/admin/gateway/diagnostics",
      }),
    ],
  },
  {
    labelKey: "nav.commercial",
    items: [
      adminItem({
        capabilityId: "models",
        descriptionKey: "workspace.models.description",
        includedCapabilityKeys: [
          "workspace.models.metadata",
          "workspace.models.deployments",
          "workspace.models.routing",
        ],
        labelKey: "nav.models",
        path: "/admin/catalog/models",
      }),
      adminItem({
        capabilityId: "official-pricing",
        dataVisibility: "sensitive",
        descriptionKey: "workspace.officialPricing.description",
        includedCapabilityKeys: [
          "workspace.officialPricing.sources",
          "workspace.officialPricing.versions",
          "workspace.officialPricing.publish",
        ],
        labelKey: "nav.officialPricing",
        path: "/admin/pricing/official",
      }),
      adminItem({
        capabilityId: "purchase-pricing",
        dataVisibility: "sensitive",
        descriptionKey: "workspace.purchasePricing.description",
        includedCapabilityKeys: [
          "workspace.purchasePricing.channelModels",
          "workspace.purchasePricing.contracts",
          "workspace.purchasePricing.versions",
        ],
        labelKey: "nav.purchasePricing",
        path: "/admin/pricing/purchase",
      }),
      adminItem({
        capabilityId: "price-books",
        dataVisibility: "sensitive",
        descriptionKey: "workspace.priceBooks.description",
        includedCapabilityKeys: [
          "workspace.priceBooks.versions",
          "workspace.priceBooks.assignments",
          "workspace.priceBooks.changeBatches",
          "workspace.priceBooks.calculator",
        ],
        labelKey: "nav.priceBooks",
        path: "/admin/pricing/price-books",
      }),
      adminItem({
        capabilityId: "pricing-governance",
        dataVisibility: "sensitive",
        descriptionKey: "workspace.pricingGovernance.description",
        includedCapabilityKeys: [
          "workspace.pricingGovernance.reconciliation",
          "workspace.pricingGovernance.circuit",
          "workspace.pricingGovernance.snapshots",
        ],
        labelKey: "nav.pricingGovernance",
        path: "/admin/pricing/governance",
      }),
    ],
  },
  {
    labelKey: "nav.customersAndFinance",
    items: [
      adminItem({
        capabilityId: "users",
        dataVisibility: "sensitive",
        descriptionKey: "workspace.users.description",
        includedCapabilityKeys: [
          "workspace.users.profile",
          "workspace.users.apiKeys",
          "workspace.users.security",
          "workspace.users.subscription",
          "workspace.users.pricing",
          "workspace.users.balance",
          "workspace.users.audit",
        ],
        labelKey: "nav.users",
        path: "/admin/customers/users",
        scope: "customers",
      }),
      adminItem({
        accessMode: "inspect",
        capabilityId: "customer-usage",
        dataVisibility: "sensitive",
        descriptionKey: "workspace.customerUsage.description",
        includedCapabilityKeys: [
          "workspace.customerUsage.models",
          "workspace.customerUsage.cost",
          "workspace.customerUsage.requests",
        ],
        labelKey: "nav.customerUsage",
        path: "/admin/customers/usage",
        scope: "customers",
      }),
      adminItem({
        capabilityId: "finance",
        dataVisibility: "sensitive",
        descriptionKey: "workspace.finance.description",
        includedCapabilityKeys: [
          "workspace.finance.transactions",
          "workspace.finance.recharge",
          "workspace.finance.callbacks",
          "workspace.finance.alerts",
          "workspace.finance.cases",
        ],
        labelKey: "nav.finance",
        path: "/admin/finance/overview",
        scope: "customers",
      }),
      adminItem({
        capabilityId: "subscriptions",
        dataVisibility: "sensitive",
        descriptionKey: "workspace.subscriptions.description",
        includedCapabilityKeys: [
          "workspace.subscriptions.plans",
          "workspace.subscriptions.users",
          "workspace.subscriptions.lifecycle",
        ],
        labelKey: "nav.subscriptions",
        path: "/admin/customers/subscriptions",
        scope: "customers",
      }),
      adminItem({
        capabilityId: "redemptions",
        dataVisibility: "sensitive",
        descriptionKey: "workspace.redemptions.description",
        includedCapabilityKeys: [
          "workspace.redemptions.codes",
          "workspace.redemptions.status",
          "workspace.redemptions.history",
        ],
        labelKey: "nav.redemptions",
        path: "/admin/customers/redemptions",
        scope: "customers",
      }),
    ],
  },
  {
    labelKey: "nav.system",
    items: [
      adminItem({
        capabilityId: "system-settings",
        dataVisibility: "sensitive",
        descriptionKey: "workspace.systemSettings.description",
        includedCapabilityKeys: [
          "workspace.systemSettings.site",
          "workspace.systemSettings.content",
          "workspace.systemSettings.auth",
          "workspace.systemSettings.models",
          "workspace.systemSettings.billing",
          "workspace.systemSettings.operations",
          "workspace.systemSettings.security",
        ],
        labelKey: "nav.systemSettings",
        path: "/admin/settings",
        scope: "system",
      }),
      adminItem({
        accessMode: "inspect",
        capabilityId: "system-info",
        descriptionKey: "workspace.systemInfo.description",
        includedCapabilityKeys: [
          "workspace.systemInfo.instances",
          "workspace.systemInfo.performance",
          "workspace.systemInfo.maintenance",
        ],
        labelKey: "nav.systemInfo",
        path: "/admin/system/info",
        scope: "system",
      }),
      adminItem({
        accessMode: "inspect",
        capabilityId: "audit-logs",
        dataVisibility: "sensitive",
        descriptionKey: "workspace.audit.description",
        includedCapabilityKeys: [
          "workspace.audit.admin",
          "workspace.audit.security",
          "workspace.audit.pricing",
        ],
        labelKey: "nav.audit",
        path: "/admin/system/audit",
        scope: "system",
      }),
    ],
  },
] as const;

export const adminNavigationItems: readonly AdminNavigationItem[] = adminRouteCatalog.flatMap(
  (group) => group.items,
);

export const embeddedAdminCapabilities = [
  { capabilityId: "routing", owner: "channels" },
  { capabilityId: "probes", owner: "channels" },
  { capabilityId: "deployments", owner: "models", featureGate: "io.net" },
  { capabilityId: "api-keys", owner: "users" },
  { capabilityId: "onboarding", owner: "users" },
  { capabilityId: "account-settings", owner: "users" },
  { capabilityId: "tasks", owner: "requests" },
  { capabilityId: "recharge", owner: "finance" },
  { capabilityId: "billing", owner: "finance" },
  { capabilityId: "account-activity", owner: "audit-logs" },
  { capabilityId: "price-reconciliation", owner: "pricing-governance" },
  { capabilityId: "circuit-analysis", owner: "pricing-governance" },
  { capabilityId: "discount-calculator", owner: "price-books" },
  { capabilityId: "site-settings", owner: "system-settings" },
  { capabilityId: "authentication-settings", owner: "system-settings" },
  { capabilityId: "billing-settings", owner: "system-settings" },
  { capabilityId: "security-settings", owner: "system-settings" },
  { capabilityId: "integration-settings", owner: "system-settings" },
] as const satisfies readonly {
  capabilityId: string;
  featureGate?: string;
  owner: AdminCapabilityId;
}[];

export const deferredAdminCapabilities = [
  { capabilityId: "workspace-membership", reasonKey: "deferred.workspaces" },
  { capabilityId: "user-alert-rules", reasonKey: "deferred.userAlerts" },
  { capabilityId: "incident-management", reasonKey: "deferred.incidents" },
] as const;

function adminItem(
  item: Omit<
    AdminNavigationItem,
    "accessMode" | "dataVisibility" | "includedCapabilityKeys" | "scope" | "status"
  > &
    Partial<
      Pick<
        AdminNavigationItem,
        "accessMode" | "dataVisibility" | "includedCapabilityKeys" | "scope"
      >
    >,
): AdminNavigationItem {
  return {
    accessMode: "operate",
    dataVisibility: "platform",
    includedCapabilityKeys: [],
    scope: "platform",
    status: "scaffolded",
    ...item,
  };
}
