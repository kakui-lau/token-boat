import { siteLocaleMeta, type SiteLocale } from "@/content/site-copy";

const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

export function formatCardCurrency(amount: number, currency: string, locale: SiteLocale): string {
  const maximumFractionDigits = amount >= 0.1 ? 2 : 4;
  const formatterLocale = siteLocaleMeta[locale].numberLocale;
  const cacheKey = `${formatterLocale}:${currency}:${maximumFractionDigits}`;
  let formatter = currencyFormatterCache.get(cacheKey);

  if (!formatter) {
    formatter = new Intl.NumberFormat(formatterLocale, {
      currency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits,
      minimumFractionDigits: 2,
      style: "currency",
    });
    currencyFormatterCache.set(cacheKey, formatter);
  }

  return formatter.format(amount);
}
