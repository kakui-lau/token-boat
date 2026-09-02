import type { APIRoute } from "astro";
import { publicModelIds } from "@/content/model-routes";
import { localizedPath, siteLocales } from "@/content/site-copy";

const staticPaths = [
  "/",
  "/models",
  "/rankings",
  "/docs",
  "/status",
  "/about",
  "/faq",
  "/changelog",
  "/support",
  "/trust",
  "/legal/terms",
  "/legal/privacy",
];

export const GET: APIRoute = ({ site }) => {
  const origin = site ?? new URL("https://tokenboat.com");
  const localized = staticPaths.flatMap((path) =>
    siteLocales.map((locale) => localizedPath(locale, path)),
  );
  const modelPaths = publicModelIds.flatMap((model) =>
    siteLocales.map((locale) => localizedPath(locale, `/models/${model}`)),
  );
  const urls = [...localized, ...modelPaths]
    .map((path) => `<url><loc>${escapeXml(new URL(path, origin).toString())}</loc></url>`)
    .join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
};

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
