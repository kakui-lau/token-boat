import { useEffect, useMemo, useState } from "react";

import { parsePublicStatusEnvelope, type PublicStatusGroup } from "@/islands/status/public-status";

type StatusPanelProps = {
  locale: "en" | "zh";
};

type StatusState =
  | { status: "error" }
  | { status: "loading" }
  | { groups: PublicStatusGroup[]; status: "ready" };

const copy = {
  en: {
    allOperational: "All published monitors are operational",
    checked: "Checked from the public status feed",
    empty:
      "No public monitors are available right now. If you are investigating an account request, sign in and review Request Logs.",
    error: "Status data is temporarily unavailable. Try again in a moment.",
    incident: "Service interruption",
    loading: "Checking published services…",
    operational: "Operational",
    partial: "Some published services need attention",
    retry: "Refresh status",
    signIn: "Open Request Logs",
    uptime: "24-hour uptime",
  },
  zh: {
    allOperational: "已公开的监控项当前均正常",
    checked: "状态来自公开监控数据",
    empty: "目前没有对外公开的监控项。如果你正在排查账户请求，请登录后查看请求日志。",
    error: "暂时无法获取服务状态，请稍后重试。",
    incident: "服务中断",
    loading: "正在检查公开服务…",
    operational: "运行正常",
    partial: "部分公开服务需要关注",
    retry: "刷新状态",
    signIn: "打开请求日志",
    uptime: "24 小时可用率",
  },
} as const;

export function StatusPanel(props: StatusPanelProps) {
  const content = copy[props.locale];
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<StatusState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void fetch("/api/uptime/status", {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Status request failed with ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        setState({ groups: parsePublicStatusEnvelope(payload), status: "ready" });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, [reloadKey]);

  const monitors = useMemo(
    () => (state.status === "ready" ? state.groups.flatMap((group) => group.monitors) : []),
    [state],
  );
  const allOperational = monitors.length > 0 && monitors.every((monitor) => monitor.status === 1);

  if (state.status === "loading") {
    return (
      <section
        className="public-state public-state--loading motion-surface-enter"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="public-state__mark" aria-hidden="true"></span>
        <p>{content.loading}</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="public-state motion-surface-enter" role="alert">
        <span className="public-state__index">STATUS / UNAVAILABLE</span>
        <h2>{content.error}</h2>
        <button onClick={() => setReloadKey((key) => key + 1)} type="button">
          {content.retry}
        </button>
      </section>
    );
  }

  if (monitors.length === 0) {
    return (
      <section className="public-state motion-surface-enter">
        <span className="public-state__index">STATUS / NO PUBLIC MONITORS</span>
        <h2>{content.empty}</h2>
        <a href="/console/request-logs">
          {content.signIn} <span aria-hidden="true">↗</span>
        </a>
      </section>
    );
  }

  return (
    <section className="status-board motion-surface-enter" aria-live="polite">
      <header
        className={allOperational ? "status-board__header is-up" : "status-board__header is-down"}
      >
        <span className="status-board__pulse" aria-hidden="true"></span>
        <h2>{allOperational ? content.allOperational : content.partial}</h2>
        <p>{content.checked}</p>
      </header>
      <div className="status-board__groups">
        {state.groups.map((group) => (
          <section className="status-group" key={group.name}>
            <h3>{group.name}</h3>
            {group.monitors.map((monitor) => (
              <article className="status-monitor" key={`${group.name}-${monitor.name}`}>
                <div>
                  <span className="status-monitor__group">{monitor.group ?? group.name}</span>
                  <h4>{monitor.name}</h4>
                </div>
                <dl>
                  <div>
                    <dt>{content.uptime}</dt>
                    <dd>{formatUptime(monitor.uptime, props.locale)}</dd>
                  </div>
                  <div>
                    <dt>STATUS</dt>
                    <dd className={monitor.status === 1 ? "is-up" : "is-down"}>
                      {monitor.status === 1 ? content.operational : content.incident}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}

function formatUptime(value: number | null, locale: "en" | "zh"): string {
  if (value === null) return "—";
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "percent",
  }).format(value);
}
