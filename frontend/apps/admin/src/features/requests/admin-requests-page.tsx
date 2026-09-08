import { useState } from "react";
import { ActivityIcon, ShieldCheckIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@token-boat/ui/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@token-boat/ui/components/ui/tabs";
import { AdminDateTimeRangePicker } from "./admin-date-time-range-picker";
import { AdminRequestLogPanel } from "./admin-request-log-panel";
import { AdminTaskPanel } from "./admin-task-panel";
import { createDefaultAdminTimeRange, refreshAdminTimeRange } from "./admin-time-range";

export function AdminRequestsPage() {
  const { t } = useTranslation();
  const [range, setRange] = useState(createDefaultAdminTimeRange);
  const [tab, setTab] = useState("requests");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              <ShieldCheckIcon />
              {t("requests.adminScope")}
            </Badge>
            <Badge variant="outline">{t("requests.sensitiveData")}</Badge>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("requests.title")}</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {t("requests.description")}
            </p>
          </div>
        </div>
        <AdminDateTimeRangePicker onChange={setRange} value={range} />
      </header>

      <Tabs
        onValueChange={(value) => {
          setTab(String(value));
          setRange((current) => refreshAdminTimeRange(current));
        }}
        value={tab}
      >
        <TabsList aria-label={t("requests.workspaceViews")} variant="line">
          <TabsTrigger value="requests">
            <ActivityIcon data-icon="inline-start" />
            {t("requests.requestLogs")}
          </TabsTrigger>
          <TabsTrigger value="tasks">{t("requests.asyncTasks")}</TabsTrigger>
        </TabsList>
        <TabsContent value="requests">
          <AdminRequestLogPanel onRangeChange={setRange} range={range} />
        </TabsContent>
        <TabsContent value="tasks">
          <AdminTaskPanel onRangeChange={setRange} range={range} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
