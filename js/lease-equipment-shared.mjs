/** Shared helpers for lease equipment catalogue (admin + public page). */

export const PRICE_PERIODS = [
  { value: "24 hrs", label: "Per 24 hours" },
  { value: "12 hrs", label: "Per 12 hours" },
  { value: "day", label: "Per day" },
  { value: "week", label: "Per week" },
  { value: "month", label: "Per month" },
];

export function buildPriceLabel(currency, amount, period) {
  const n = Number(amount);
  if (amount == null || amount === "" || Number.isNaN(n)) return "";
  const cur = String(currency || "KSh").trim() || "KSh";
  const per = String(period || "24 hrs").trim() || "24 hrs";
  const formatted = n.toLocaleString("en-KE", { maximumFractionDigits: 0 });
  return `${cur} ${formatted} / ${per}`;
}

export function resolvePriceLabel(item) {
  if (!item) return "";
  if (item.priceLabel && String(item.priceLabel).trim()) return String(item.priceLabel).trim();
  return buildPriceLabel(item.priceCurrency, item.priceAmount, item.pricePeriod);
}
