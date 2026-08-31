import { useState, type PropsWithChildren } from "react";
import { PauseIcon, PlayIcon, ShieldCheckIcon, SparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { AuthParticleField } from "./auth-particle-field";
import "./auth-shell.css";

export function AuthShell({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const [particlesPaused, setParticlesPaused] = useState(false);

  return (
    <main className="auth-stage h-svh overflow-hidden">
      <svg aria-hidden="true" className="absolute size-0" focusable="false">
        <defs>
          <clipPath id="auth-panel-smooth-clip" clipPathUnits="objectBoundingBox">
            <path d="M0 0H.985C.958 .2 1 .36 .98 .5C.96 .64 1 .8 .985 1H0Z" />
          </clipPath>
        </defs>
      </svg>
      <div aria-hidden="true" className="auth-stage__grid" />
      <div aria-hidden="true" className="auth-stage__glow auth-stage__glow--one" />
      <div aria-hidden="true" className="auth-stage__glow auth-stage__glow--two" />

      <div className="auth-stage-shell relative flex h-svh w-full max-w-none items-center p-0">
        <div className="auth-frame grid w-full overflow-hidden lg:grid-cols-[minmax(0,1.12fr)_minmax(28rem,0.88fr)]">
          <section
            className={`auth-visual-panel auth-visual-panel--sculpted relative hidden overflow-hidden p-10 text-primary-foreground lg:flex lg:flex-col xl:p-14${particlesPaused ? " is-motion-paused" : ""}`}
          >
            <AuthParticleField paused={particlesPaused} />
            <div aria-hidden="true" className="auth-visual-panel__mesh" />
            <div aria-hidden="true" className="auth-visual-panel__scan" />
            <div className="auth-brand-enter relative flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="auth-brand-mark flex size-14 items-center justify-center rounded-2xl p-1.5">
                  <BrandMark aria-hidden="true" className="size-11" />
                </span>
                <div>
                  <p className="text-lg font-semibold tracking-tight">Token Boat</p>
                  <p className="text-xs text-primary-foreground/60">{t("AI API Console")}</p>
                </div>
              </div>
              <Button
                aria-label={t(
                  particlesPaused ? "Resume background animation" : "Pause background animation",
                )}
                className="auth-motion-control"
                onClick={() => setParticlesPaused((current) => !current)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                {particlesPaused ? (
                  <PlayIcon aria-hidden="true" className="size-3.5" />
                ) : (
                  <PauseIcon aria-hidden="true" className="size-3.5" />
                )}
              </Button>
            </div>

            <div className="auth-hero-enter relative mt-14 max-w-2xl">
              <Badge className="auth-hero-badge" variant="outline">
                <SparklesIcon data-icon="inline-start" />
                {t("AI API Console")}
              </Badge>
              <h1 className="auth-hero-title mt-5 text-5xl leading-[1.04] font-semibold tracking-[-0.045em] text-balance xl:text-6xl">
                {t("One endpoint. Every frontier model.")}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-pretty text-primary-foreground/70 xl:text-lg">
                {t(
                  "Route, observe, and govern every AI request from one intelligent control plane.",
                )}
              </p>
            </div>

            <div aria-hidden="true" className="auth-neural-field relative mt-8 min-h-64 flex-1">
              <div className="auth-neural-field__aura" />
              <div className="auth-neural-field__beam auth-neural-field__beam--one" />
              <div className="auth-neural-field__beam auth-neural-field__beam--two" />
              <div className="auth-neural-orbit auth-neural-orbit--outer">
                <span className="auth-neural-orbit__runner" />
              </div>
              <div className="auth-neural-orbit auth-neural-orbit--middle">
                <span className="auth-neural-orbit__runner" />
              </div>
              <div className="auth-neural-orbit auth-neural-orbit--inner">
                <span className="auth-neural-orbit__runner" />
              </div>
              <span className="auth-neural-node auth-neural-node--one" />
              <span className="auth-neural-node auth-neural-node--two" />
              <span className="auth-neural-node auth-neural-node--three" />
              <span className="auth-neural-node auth-neural-node--four" />
              <div className="auth-neural-core">
                <span className="auth-neural-core__pulse" />
                <span className="auth-neural-core__mark">
                  <BrandMark className="size-20" />
                </span>
              </div>
            </div>

            <div className="auth-security-enter relative mt-5 flex items-center gap-2 text-sm text-primary-foreground/60">
              <ShieldCheckIcon aria-hidden="true" className="size-4" />
              {t("Enterprise-grade access, billing, and observability.")}
            </div>
          </section>

          <section className="auth-form-panel relative flex flex-col">
            <div className="flex items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:justify-end lg:px-10 lg:py-8">
              <div className="auth-mobile-brand flex items-center gap-3 lg:hidden">
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 p-1">
                  <BrandMark aria-hidden="true" className="size-9" />
                </span>
                <div>
                  <p className="font-semibold tracking-tight">Token Boat</p>
                  <p className="text-xs text-muted-foreground">{t("AI API Console")}</p>
                </div>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-1">
                <LanguageSwitcher />
                <Badge className="auth-access-badge hidden sm:inline-flex" variant="outline">
                  <ShieldCheckIcon data-icon="inline-start" />
                  <span>{t("Secure sign-in")}</span>
                </Badge>
              </div>
            </div>

            <div className="auth-form-enter flex flex-1 items-center justify-center px-4 py-8 sm:px-10 lg:px-12 xl:px-20">
              <div className="w-full max-w-[34rem]">{children}</div>
            </div>

            <div className="px-6 pb-6 text-center text-xs text-muted-foreground lg:px-10 lg:pb-8">
              {t("Protected credentials · Encrypted session · Auditable access")}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
