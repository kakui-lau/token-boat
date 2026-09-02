const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

export function formatCardCurrency(amount: number, currency: string, locale: "en" | "zh"): string {
  const maximumFractionDigits = amount >= 0.1 ? 2 : 4;
  const formatterLocale = locale === "zh" ? "zh-CN" : "en-US";
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
