import type { Money } from "@rendezvous/contracts";
import i18n, { currentLocale } from "../i18n/index.js";

export function formatMoney(money?: Money | null): string {
  if (!money) return "—";
  return new Intl.NumberFormat(currentLocale() === "ru" ? "ru-RU" : "en-US", {
    style: "currency",
    currency: money.currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(money.amount);
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return i18n.t("format.durationDays", {
      days,
      dayLabel: i18n.t("format.day", { count: days }).replace(/^\d+\s*/, ""),
      hours: remainingHours,
      hourLabel: i18n
        .t("format.hour", { count: remainingHours })
        .replace(/^\d+\s*/, ""),
    });
  }
  return i18n.t("format.durationHours", {
    hours,
    hourLabel: i18n.t("format.hour", { count: hours }).replace(/^\d+\s*/, ""),
  });
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** dd.mm.yyyy */
export function formatDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

/** dd.mm.yyyy hh:mm */
export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** hh:mm */
export function formatTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** dd.mm.yyyy hh:mm for editable date fields */
export function formatDateInput(value: string | Date, time = "10:00"): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return `${formatDate(date)} ${time}`;
}

const DATE_INPUT_PATTERN =
  /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/;

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Parses dd.mm.yyyy (optionally with hh:mm) as a local date. Falls back to ISO
 * and locale-formatted strings. Returns null when the value is not a valid
 * calendar date.
 */
export function parseDateInput(
  value: string,
  defaultTime = "10:00",
): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = DATE_INPUT_PATTERN.exec(trimmed);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const fullYear = year < 100 ? 2000 + year : year;
    const hours = match[4] ? Number(match[4]) : Number(defaultTime.slice(0, 2));
    const minutes = match[5]
      ? Number(match[5])
      : Number(defaultTime.slice(3, 5));
    const leap =
      month === 2 &&
      ((fullYear % 4 === 0 && fullYear % 100 !== 0) || fullYear % 400 === 0);
    const maxDay = MONTH_LENGTHS[month - 1] ?? (leap ? 29 : 0);
    if (month < 1 || month > 12 || day < 1 || day > (maxDay ?? 0)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    const date = new Date(fullYear, month - 1, day, hours, minutes);
    return Number.isNaN(date.valueOf()) ? null : date;
  }
  const iso = new Date(trimmed);
  return Number.isNaN(iso.valueOf()) ? null : iso;
}
