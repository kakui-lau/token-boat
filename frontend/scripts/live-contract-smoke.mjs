const username = process.env.CONSOLE_SMOKE_USERNAME?.trim();
const password = process.env.CONSOLE_SMOKE_PASSWORD;

if (!username || !password) {
  console.error(
    "Set CONSOLE_SMOKE_USERNAME and CONSOLE_SMOKE_PASSWORD before running Live smoke tests.",
  );
  process.exit(1);
}

process.env.VITE_CONSOLE_API_BASE_URL ??= "http://127.0.0.1:3000";

const { liveRepository } = await import("../apps/console/src/data/live-repository.ts");
const login = await liveRepository.signIn({ username, password });
if (login.kind !== "authenticated") {
  console.error(
    "Live smoke tests require an account that can complete password login without 2FA.",
  );
  process.exit(1);
}

const endDate = new Date();
const startDate = new Date(endDate);
startDate.setDate(startDate.getDate() - 29);
const localDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const range = {
  preset: "30d",
  from: localDateKey(startDate),
  to: localDateKey(endDate),
};
const pagination = { page: 1, pageSize: 20, order: "desc" };
const group = login.session.user.group;
const checks = [
  ["authentication capabilities", () => liveRepository.getAuthCapabilities()],
  ["overview", () => liveRepository.getOverview(range)],
  ["onboarding", () => liveRepository.getOnboarding()],
  ["API keys", () => liveRepository.getApiKeysPage({ ...pagination, keyword: "", status: "all" })],
  ["usage", () => liveRepository.getUsage(range)],
  ["integration", () => liveRepository.getIntegration()],
  ["models", () => liveRepository.listModelCatalog(group)],
  [
    "request logs",
    () =>
      liveRepository.getRequestLogsPage({
        ...pagination,
        range,
        keyword: "",
        searchField: "request",
        status: "all",
      }),
  ],
  [
    "account activity",
    () => liveRepository.getAccountActivityPage({ ...pagination, range, type: "all" }),
  ],
  [
    "billing ledger",
    () => liveRepository.getBillingLedgerPage({ ...pagination, range, type: "all" }),
  ],
  [
    "tasks",
    () => liveRepository.getTasksPage({ ...pagination, range, status: "all", type: "all" }),
  ],
  ["task counts", () => liveRepository.getTaskTypeCounts({ ...pagination, range, status: "all" })],
  ["billing", () => liveRepository.getBilling()],
  [
    "billing transactions",
    () =>
      liveRepository.getBillingTransactionsPage({
        ...pagination,
        range,
        keyword: "",
        status: "all",
        type: "all",
      }),
  ],
  ["recharge configuration", () => liveRepository.getRechargeConfiguration()],
  ["account", () => liveRepository.getAccount()],
];

const results = await Promise.allSettled(checks.map(([, run]) => run()));
const failures = results.flatMap((result, index) => {
  if (result.status === "fulfilled") return [];
  const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
  return [{ check: checks[index][0], error }];
});

console.log(
  JSON.stringify(
    {
      checked: checks.length,
      passed: checks.length - failures.length,
      failed: failures,
      range,
    },
    null,
    2,
  ),
);

if (failures.length > 0) process.exitCode = 1;
