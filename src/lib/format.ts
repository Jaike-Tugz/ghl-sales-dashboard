export const fmtInt = (n: number) => new Intl.NumberFormat("en-AU").format(Math.round(n));

export const fmtCurrency = (n: number, currency = process.env.NEXT_PUBLIC_CURRENCY || "AUD") =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

export const fmtCompactCurrency = (n: number, currency = process.env.NEXT_PUBLIC_CURRENCY || "AUD") =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(n);

export const fmtPct = (r: number | null | undefined, digits = 1) => (r == null ? "—" : `${(r * 100).toFixed(digits)}%`);

export const fmtDays = (d: number | null | undefined) => (d == null ? "—" : `${d.toFixed(1)} d`);

export function fmtDate(iso: string | null | undefined, timeZone: string, withTime = false) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "2-digit",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(new Date(iso));
}

export function fmtRelative(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "never";
  const diff = (now - new Date(iso).getTime()) / 1000;
  const abs = Math.abs(diff);
  const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return fmt.format(-Math.round(diff), "second");
  if (abs < 3600) return fmt.format(-Math.round(diff / 60), "minute");
  if (abs < 86400) return fmt.format(-Math.round(diff / 3600), "hour");
  return fmt.format(-Math.round(diff / 86400), "day");
}
