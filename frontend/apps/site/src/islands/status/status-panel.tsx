import { useEffect, useMemo, useState } from "react";
import { siteLocaleMeta, type SiteLocale } from "@/content/site-copy";

import {
  isSuccessfulPublicStatusEnvelope,
  parsePublicStatusEnvelope,
  publicRequestLogsPath,
  type PublicStatusGroup,
} from "@/islands/status/public-status";

type StatusPanelProps = {
  locale: SiteLocale;
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
      "The platform status endpoint is reachable, but no public upstream monitors are connected, so no live uptime conclusion is shown. To investigate an account request, sign in and review Request Logs.",
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
    empty:
      "平台状态接口可达，但当前尚未接入公开上游监控，因此这里不展示实时可用率结论。如需排查账户请求，请登录后查看请求日志。",
    error: "暂时无法获取服务状态，请稍后重试。",
    incident: "服务中断",
    loading: "正在检查公开服务…",
    operational: "运行正常",
    partial: "部分公开服务需要关注",
    retry: "刷新状态",
    signIn: "打开请求日志",
    uptime: "24 小时可用率",
  },
  ja: {
    allOperational: "公開中の監視項目はすべて正常です",
    checked: "公開ステータスフィードで確認",
    empty:
      "プラットフォームのステータス API には接続できますが、公開の上流監視はまだ接続されていないため、現在の稼働率は表示しません。アカウントのリクエストを調査するには、ログインしてリクエストログを確認してください。",
    error: "ステータスデータを一時的に取得できません。しばらくしてから再試行してください。",
    incident: "サービス中断",
    loading: "公開サービスを確認中…",
    operational: "正常稼働",
    partial: "一部の公開サービスで確認が必要です",
    retry: "ステータスを更新",
    signIn: "リクエストログを開く",
    uptime: "24時間稼働率",
  },
  ko: {
    allOperational: "게시된 모든 모니터가 정상입니다",
    checked: "공개 상태 피드에서 확인",
    empty:
      "플랫폼 상태 API에는 연결되지만 공개 상위 모니터가 연결되어 있지 않아 실시간 가동률을 표시하지 않습니다. 계정 요청을 조사하려면 로그인 후 요청 로그를 확인하세요.",
    error: "상태 데이터를 일시적으로 불러올 수 없습니다. 잠시 후 다시 시도하세요.",
    incident: "서비스 중단",
    loading: "공개 서비스 확인 중…",
    operational: "정상 운영",
    partial: "일부 공개 서비스를 확인해야 합니다",
    retry: "상태 새로고침",
    signIn: "요청 로그 열기",
    uptime: "24시간 가동률",
  },
  "zh-TW": {
    allOperational: "已公開的監控項目目前均正常",
    checked: "狀態來自公開監控資料",
    empty:
      "平台狀態 API 可連線，但目前尚未接入公開上游監控，因此不顯示即時可用率結論。如需排查帳戶請求，請登入後查看請求記錄。",
    error: "暫時無法取得服務狀態，請稍後再試。",
    incident: "服務中斷",
    loading: "正在檢查公開服務…",
    operational: "運作正常",
    partial: "部分公開服務需要注意",
    retry: "重新整理狀態",
    signIn: "開啟請求記錄",
    uptime: "24 小時可用率",
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
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Status request failed with ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        if (!isSuccessfulPublicStatusEnvelope(payload)) {
          throw new Error("Status request returned an invalid response");
        }
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
        <span className="public-state__index">STATUS API / REACHABLE · NO PUBLIC MONITORS</span>
        <h2>{content.empty}</h2>
        <a href={publicRequestLogsPath}>
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

function formatUptime(value: number | null, locale: SiteLocale): string {
  if (value === null) return "—";
  return new Intl.NumberFormat(siteLocaleMeta[locale].numberLocale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "percent",
  }).format(value);
}
