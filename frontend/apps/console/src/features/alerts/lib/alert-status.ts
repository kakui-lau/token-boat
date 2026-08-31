import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2Icon,
  CircleHelpIcon,
  RadioTowerIcon,
  TriangleAlertIcon,
  XCircleIcon,
} from "lucide-react";

import type { AlertCenterData, AlertRule, PlatformMonitor } from "@/data/contracts";

export type AlertStatusDetails = {
  badgeVariant: "default" | "secondary" | "destructive" | "outline";
  description: string;
  icon: LucideIcon;
  label: string;
};

export function activeAlertRuleCount(rules: AlertRule[]): number | null {
  let activeCount = 0;
  for (const rule of rules) {
    if (rule.enabled === null) return null;
    if (rule.enabled) activeCount += 1;
  }
  return activeCount;
}

export function platformStatusDetails(
  status: AlertCenterData["platform"]["status"],
): AlertStatusDetails {
  if (status === "operational") {
    return {
      badgeVariant: "secondary",
      description: "All configured monitors are responding normally.",
      icon: CheckCircle2Icon,
      label: "All systems operational",
    };
  }
  if (status === "degraded") {
    return {
      badgeVariant: "outline",
      description: "At least one service monitor is degraded.",
      icon: TriangleAlertIcon,
      label: "Degraded performance",
    };
  }
  if (status === "outage") {
    return {
      badgeVariant: "destructive",
      description: "At least one service monitor is reporting an outage.",
      icon: XCircleIcon,
      label: "Service outage detected",
    };
  }
  if (status === "unconfigured") {
    return {
      badgeVariant: "outline",
      description: "Configure a status provider to show platform health.",
      icon: RadioTowerIcon,
      label: "Status monitoring not configured",
    };
  }
  return {
    badgeVariant: "outline",
    description: "The configured status provider is not returning monitor data.",
    icon: CircleHelpIcon,
    label: "Platform status unavailable",
  };
}

export function monitorStatusDetails(status: PlatformMonitor["status"]): AlertStatusDetails {
  if (status === "operational") {
    return {
      badgeVariant: "secondary",
      description: "",
      icon: CheckCircle2Icon,
      label: "Operational",
    };
  }
  if (status === "degraded") {
    return {
      badgeVariant: "outline",
      description: "",
      icon: TriangleAlertIcon,
      label: "Degraded",
    };
  }
  if (status === "outage") {
    return {
      badgeVariant: "destructive",
      description: "",
      icon: XCircleIcon,
      label: "Outage",
    };
  }
  return {
    badgeVariant: "outline",
    description: "",
    icon: CircleHelpIcon,
    label: "Unknown",
  };
}

export function channelLabel(channel: AlertRule["channel"]): string {
  if (channel === null) return "Not configured";
  if (channel === "webhook") return "Webhook";
  if (channel === "bark") return "Bark";
  if (channel === "gotify") return "Gotify";
  return "Email";
}

export function alertRuleStatusLabel(enabled: AlertRule["enabled"]): string {
  if (enabled === null) return "Status unavailable";
  return enabled ? "Enabled" : "Disabled";
}

export function alertThresholdKey(rule: AlertRule): string {
  if (rule.type === "balance") return "Balance below {{threshold}}";
  if (rule.type === "spend") return "Spend above {{threshold}}";
  if (rule.type === "error_rate") return "Error rate above {{threshold}}%";
  return "Latency above {{threshold}} ms";
}
