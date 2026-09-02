export type UserConsoleCapabilityGroup = "account" | "develop" | "operate" | "workspace";

export type UserConsoleCapabilityId =
  | "account"
  | "activity"
  | "alerts"
  | "api-keys"
  | "billing"
  | "getting-started"
  | "integration"
  | "logs"
  | "models"
  | "overview"
  | "playground"
  | "recharge"
  | "tasks"
  | "team"
  | "usage";

export type UserConsolePath =
  | "/"
  | "/account"
  | "/activity"
  | "/alerts"
  | "/api-keys"
  | "/billing"
  | "/getting-started"
  | "/integration"
  | "/logs"
  | "/models"
  | "/playground"
  | "/recharge"
  | "/tasks"
  | "/team"
  | "/usage";

export type UserConsoleCapability = {
  consoleAccess: "manage" | "read";
  consoleDataVisibility: "limited";
  consoleLabelKey: string;
  consolePath: UserConsolePath;
  group: UserConsoleCapabilityGroup;
  id: UserConsoleCapabilityId;
};

export const userConsoleCapabilityGroups: readonly {
  id: UserConsoleCapabilityGroup;
  labelKey: string;
}[] = [
  { id: "workspace", labelKey: "Workspace" },
  { id: "develop", labelKey: "Develop" },
  { id: "operate", labelKey: "Operate" },
  { id: "account", labelKey: "Account and organization" },
] as const;

export const userConsoleCapabilities: readonly UserConsoleCapability[] = [
  capability("overview", "workspace", "/", "Overview", "read"),
  capability("getting-started", "workspace", "/getting-started", "Getting started", "read"),
  capability("playground", "workspace", "/playground", "Playground", "manage"),
  capability("integration", "develop", "/integration", "Integration center", "read"),
  capability("api-keys", "develop", "/api-keys", "API keys", "manage"),
  capability("models", "develop", "/models", "Models and pricing", "read"),
  capability("usage", "operate", "/usage", "Usage", "read"),
  capability("logs", "operate", "/logs", "Request logs", "read"),
  capability("tasks", "operate", "/tasks", "Tasks", "read"),
  capability("alerts", "operate", "/alerts", "Alerts and status", "read"),
  capability("recharge", "account", "/recharge", "Recharge center", "manage"),
  capability("billing", "account", "/billing", "Billing and subscriptions", "read"),
  capability("activity", "account", "/activity", "Account activity", "read"),
  capability("team", "account", "/team", "Team and access", "manage"),
  capability("account", "account", "/account", "Account settings", "manage"),
] as const;

function capability(
  id: UserConsoleCapabilityId,
  group: UserConsoleCapabilityGroup,
  consolePath: UserConsolePath,
  consoleLabelKey: string,
  consoleAccess: UserConsoleCapability["consoleAccess"],
): UserConsoleCapability {
  return {
    consoleAccess,
    consoleDataVisibility: "limited",
    consoleLabelKey,
    consolePath,
    group,
    id,
  };
}
