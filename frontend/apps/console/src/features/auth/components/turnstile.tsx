import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

declare global {
  interface Window {
    turnstile?: {
      remove(widgetId: string): void;
      render(element: HTMLElement, options: Record<string, unknown>): string;
    };
  }
}

type TurnstileProps = {
  onExpire(): void;
  onVerify(token: string): void;
  siteKey: string;
};

export function Turnstile({ onExpire, onVerify, siteKey }: TurnstileProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const expireRef = useRef(onExpire);
  const verifyRef = useRef(onVerify);

  useEffect(() => {
    expireRef.current = onExpire;
    verifyRef.current = onVerify;
  }, [onExpire, onVerify]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !siteKey) return;
    let widgetId: string | undefined;
    let script: HTMLScriptElement | null = document.getElementById(
      "cloudflare-turnstile-script",
    ) as HTMLScriptElement | null;

    const render = () => {
      if (!window.turnstile || widgetId) return;
      widgetId = window.turnstile.render(container, {
        sitekey: siteKey,
        callback: (token: string) => verifyRef.current(token),
        "error-callback": () => expireRef.current(),
        "expired-callback": () => expireRef.current(),
      });
    };

    if (window.turnstile) {
      render();
    } else if (script) {
      script.addEventListener("load", render);
    } else {
      script = document.createElement("script");
      script.id = "cloudflare-turnstile-script";
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", render);
      document.head.appendChild(script);
    }

    return () => {
      script?.removeEventListener("load", render);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  return <div aria-label={t("Human verification")} ref={containerRef} />;
}
