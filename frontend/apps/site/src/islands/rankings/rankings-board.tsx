import { useEffect, useMemo, useState } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";

import { createRankingsI18n } from "@/i18n/rankings";
import {
  parsePublicRankingsEnvelope,
  type PublicModelRanking,
  type PublicRankingMover,
  type PublicRankingsSnapshot,
  type RankingPeriod,
} from "@/islands/rankings/public-rankings";

type RankingsBoardIslandProps = {
  locale: "en" | "zh";
};

type LoadingState =
  | { status: "error" }
  | { status: "loading" }
  | { snapshot: PublicRankingsSnapshot; status: "refreshing" }
  | { snapshot: PublicRankingsSnapshot; status: "ready" };

const periods: RankingPeriod[] = ["today", "week", "month", "year"];

export function RankingsBoardIsland(props: RankingsBoardIslandProps) {
  const i18n = useMemo(() => createRankingsI18n(props.locale), [props.locale]);
  return (
    <I18nextProvider i18n={i18n}>
      <RankingsBoard locale={props.locale} />
    </I18nextProvider>
  );
}

function RankingsBoard(props: RankingsBoardIslandProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<RankingPeriod>("week");
  const [urlStateReady, setUrlStateReady] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<LoadingState>({ status: "loading" });

  useEffect(() => {
    const requestedPeriod = new URLSearchParams(window.location.search).get("period");
    if (requestedPeriod && periods.includes(requestedPeriod as RankingPeriod)) {
      setPeriod(requestedPeriod as RankingPeriod);
    }
    setUrlStateReady(true);
  }, []);

  useEffect(() => {
    if (!urlStateReady) return;
    const url = new URL(window.location.href);
    if (period === "week") url.searchParams.delete("period");
    else url.searchParams.set("period", period);
    window.history.replaceState({}, "", url);
  }, [period, urlStateReady]);

  useEffect(() => {
    if (!urlStateReady) return;
    const controller = new AbortController();
    setState((current) =>
      current.status === "ready" || current.status === "refreshing"
        ? { snapshot: current.snapshot, status: "refreshing" }
        : { status: "loading" },
    );
    void fetch(`/api/rankings?period=${period}`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Rankings request failed with ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        const snapshot = parsePublicRankingsEnvelope(payload);
        if (!snapshot) throw new Error("Rankings response was empty");
        setState({ snapshot, status: "ready" });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, [period, reloadKey, urlStateReady]);

  return (
    <div
      className="rankings-board"
      aria-busy={state.status === "loading" || state.status === "refreshing"}
    >
      <div className="rankings-toolbar">
        <div>
          <span>RANKING WINDOW</span>
          <strong>{t("rankings.live")}</strong>
        </div>
        <div className="rankings-periods" role="tablist" aria-label={t("rankings.period")}>
          {periods.map((option) => (
            <button
              aria-selected={period === option}
              className={period === option ? "is-active" : undefined}
              key={option}
              onClick={() => setPeriod(option)}
              role="tab"
              type="button"
            >
              {t(`rankings.${option}`)}
            </button>
          ))}
        </div>
      </div>

      {state.status === "loading" ? <RankingsLoading /> : null}
      {state.status === "error" ? (
        <div className="public-state motion-surface-enter" role="alert">
          <span className="public-state__index">RANKINGS / UNAVAILABLE</span>
          <h2>{t("rankings.error")}</h2>
          <button onClick={() => setReloadKey((key) => key + 1)} type="button">
            {t("rankings.retry")}
          </button>
        </div>
      ) : null}
      {state.status === "ready" || state.status === "refreshing" ? (
        <div
          className={`rankings-content motion-surface-enter${state.status === "refreshing" ? " is-refreshing" : ""}`}
        >
          <RankingsContent locale={props.locale} snapshot={state.snapshot} />
        </div>
      ) : null}
    </div>
  );
}

function RankingsContent(props: { locale: "en" | "zh"; snapshot: PublicRankingsSnapshot }) {
  const { t } = useTranslation();
  const podium = props.snapshot.models.slice(0, 3);
  const maxActivity = props.snapshot.activity.reduce(
    (largest, bucket) => Math.max(largest, bucket.totalTokens),
    0,
  );

  return (
    <>
      <section className="ranking-block ranking-block--podium">
        <div className="ranking-block__heading">
          <p>01 / MODEL INDEX</p>
          <h2>{t("rankings.topModels")}</h2>
          <span>
            {formatTokens(podium[0]?.totalTokens ?? 0, props.locale)} {t("rankings.tokens")}
          </span>
        </div>
        <div className="ranking-podium">
          {podium.map((row) => (
            <ModelPodiumCard key={row.modelName} locale={props.locale} row={row} />
          ))}
        </div>
      </section>

      {props.snapshot.activity.length > 0 ? (
        <section className="ranking-block ranking-activity">
          <div className="ranking-block__heading">
            <p>02 / ACTIVITY</p>
            <h2>{t("rankings.activity")}</h2>
            <span>{t("rankings.activityDescription")}</span>
          </div>
          <div className="ranking-activity__chart">
            {props.snapshot.activity.map((bucket) => (
              <div className="ranking-activity__bucket" key={bucket.label}>
                <div className="ranking-activity__track">
                  <span
                    style={{
                      transform: `scaleY(${maxActivity > 0 ? Math.max(bucket.totalTokens / maxActivity, 0.02) : 0})`,
                    }}
                  ></span>
                </div>
                <strong>{bucket.label}</strong>
                <small>{formatTokens(bucket.totalTokens, props.locale)}</small>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="ranking-block">
        <div className="ranking-block__heading">
          <p>03 / FULL TABLE</p>
          <h2>{t("rankings.allModels")}</h2>
          <span>
            {props.snapshot.models.length} {t("rankings.models")}
          </span>
        </div>
        <div className="ranking-table" role="table" aria-label={t("rankings.allModels")}>
          <div className="ranking-table__header" role="row">
            <span role="columnheader">{t("rankings.rank")}</span>
            <span role="columnheader">{t("rankings.model")}</span>
            <span role="columnheader">{t("rankings.share")}</span>
            <span role="columnheader">{t("rankings.change")}</span>
          </div>
          {props.snapshot.models.map((row) => (
            <ModelRankingRow key={row.modelName} locale={props.locale} row={row} />
          ))}
        </div>
      </section>

      <div className="ranking-split">
        <section className="ranking-block ranking-providers">
          <div className="ranking-block__heading">
            <p>04 / PROVIDERS</p>
            <h2>{t("rankings.providerShare")}</h2>
          </div>
          <ol>
            {props.snapshot.vendors.slice(0, 6).map((vendor) => (
              <li key={vendor.vendor}>
                <div className="ranking-provider__meta">
                  <span>{String(vendor.rank).padStart(2, "0")}</span>
                  <strong>{vendor.vendor}</strong>
                  <em>{formatPercent(vendor.share, props.locale)}</em>
                </div>
                <div className="ranking-provider__track">
                  <span style={{ width: `${Math.max(vendor.share * 100, 0.35)}%` }}></span>
                </div>
                <p>
                  {vendor.modelsCount} {t("rankings.models")} · {t("rankings.topModel")}:{" "}
                  {vendor.topModel}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="ranking-block ranking-pulse">
          <div className="ranking-block__heading">
            <p>05 / MOMENTUM</p>
            <h2>{t("rankings.movers")}</h2>
          </div>
          <MoverList
            intent="up"
            locale={props.locale}
            rows={props.snapshot.topMovers.slice(0, 4)}
          />
          <h3>{t("rankings.droppers")}</h3>
          <MoverList
            intent="down"
            locale={props.locale}
            rows={props.snapshot.topDroppers.slice(0, 4)}
          />
        </section>
      </div>

      <div className="ranking-disclaimer">
        <span aria-hidden="true">ⓘ</span>
        <p>{t("rankings.disclaimer")}</p>
        <a href={props.locale === "zh" ? "/models" : "/en/models"}>
          {t("rankings.topModel")} <span aria-hidden="true">↗</span>
        </a>
      </div>
    </>
  );
}

function ModelPodiumCard(props: { locale: "en" | "zh"; row: PublicModelRanking }) {
  const { t } = useTranslation();
  const isLeader = props.row.rank === 1;
  const previousRank =
    props.row.previousRank === null
      ? t("rankings.new")
      : `#${String(props.row.previousRank).padStart(2, "0")} → #${String(props.row.rank).padStart(2, "0")}`;

  return (
    <article className={`ranking-podium__card ranking-podium__card--${props.row.rank}`}>
      <div className="ranking-podium__rank">#{String(props.row.rank).padStart(2, "0")}</div>
      {isLeader ? (
        <div className="ranking-podium__leader-visual">
          <span aria-hidden="true" className="ranking-podium__watermark">
            01
          </span>
          <span className="ranking-podium__leader-label">
            {t("rankings.topModel")} / {t("rankings.share")}
          </span>
          <strong>{formatPercent(props.row.share, props.locale)}</strong>
          <span aria-hidden="true" className="ranking-podium__share-track">
            <i style={{ transform: `scaleX(${props.row.share})` }}></i>
          </span>
          <span className="ranking-podium__previous-rank">
            <small>{t("rankings.change")}</small>
            <b>{previousRank}</b>
          </span>
        </div>
      ) : null}
      <a href={modelHref(props.row.modelName, props.locale)} translate="no">
        {props.row.modelName}
      </a>
      <p>{props.row.vendor}</p>
      <dl>
        {!isLeader ? (
          <div>
            <dt>{t("rankings.share")}</dt>
            <dd>{formatPercent(props.row.share, props.locale)}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t("rankings.tokens")}</dt>
          <dd>{formatTokens(props.row.totalTokens, props.locale)}</dd>
        </div>
        {isLeader ? (
          <div>
            <dt>{t("rankings.growth")}</dt>
            <dd>
              {props.row.growthPct > 0 ? "+" : ""}
              {formatGrowth(props.row.growthPct)}
            </dd>
          </div>
        ) : null}
      </dl>
      {!isLeader ? <Growth value={props.row.growthPct} /> : null}
    </article>
  );
}

function ModelRankingRow(props: { locale: "en" | "zh"; row: PublicModelRanking }) {
  const { t } = useTranslation();
  const rankDelta =
    props.row.previousRank === null ? null : props.row.previousRank - props.row.rank;
  return (
    <div className="ranking-table__row" role="row">
      <div className="ranking-table__rank" role="cell">
        <strong>{String(props.row.rank).padStart(2, "0")}</strong>
        <span>{rankDelta === null ? t("rankings.new") : formatRankDelta(rankDelta)}</span>
      </div>
      <div className="ranking-table__model" role="cell">
        <a href={modelHref(props.row.modelName, props.locale)} translate="no">
          {props.row.modelName}
        </a>
        <span>
          {props.row.vendor} · {formatTokens(props.row.totalTokens, props.locale)}{" "}
          {t("rankings.tokens")}
        </span>
      </div>
      <div className="ranking-table__share" role="cell">
        <strong>{formatPercent(props.row.share, props.locale)}</strong>
        <span>
          <i style={{ width: `${Math.max(props.row.share * 100, 0.35)}%` }}></i>
        </span>
      </div>
      <div role="cell">
        <Growth value={props.row.growthPct} />
      </div>
    </div>
  );
}

function MoverList(props: {
  intent: "down" | "up";
  locale: "en" | "zh";
  rows: PublicRankingMover[];
}) {
  return (
    <ul className="ranking-movers">
      {props.rows.map((row) => (
        <li key={`${props.intent}-${row.modelName}`}>
          <span className={`ranking-mover__delta is-${props.intent}`}>
            {props.intent === "up" ? "↑" : "↓"} {Math.abs(row.rankDelta)}
          </span>
          <div>
            <strong translate="no">{row.modelName}</strong>
            <small>
              {row.vendor} · #{row.currentRank}
            </small>
          </div>
          <Growth value={row.growthPct} />
        </li>
      ))}
    </ul>
  );
}

function Growth(props: { value: number }) {
  const { t } = useTranslation();
  let className = "is-flat";
  if (props.value > 0) className = "is-up";
  if (props.value < 0) className = "is-down";
  const prefix = props.value > 0 ? "+" : "";
  return (
    <span className={`ranking-growth ${className}`}>
      {prefix}
      {formatGrowth(props.value)} {t("rankings.growth")}
    </span>
  );
}

function RankingsLoading() {
  const { t } = useTranslation();
  return (
    <div className="ranking-loading motion-surface-enter" aria-label={t("rankings.loading")}>
      {Array.from({ length: 3 }).map((_, index) => (
        <span key={index}></span>
      ))}
    </div>
  );
}

function modelHref(modelName: string, locale: "en" | "zh"): string {
  const path = locale === "zh" ? "/models" : "/en/models";
  return `${path}?q=${encodeURIComponent(modelName)}`;
}

function formatRankDelta(value: number): string {
  if (value > 0) return `↑${value}`;
  if (value < 0) return `↓${Math.abs(value)}`;
  return "—";
}

function formatGrowth(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value) + "%";
}

function formatPercent(value: number, locale: "en" | "zh"): string {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", {
    maximumFractionDigits: value < 0.01 ? 2 : 1,
    style: "percent",
  }).format(value);
}

function formatTokens(value: number, locale: "en" | "zh"): string {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}
