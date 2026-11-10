import { APP_TZ } from './config.js';

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const DAY_ABBR_NL = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
export const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(value) {
  if (typeof value !== 'string') return false;
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(m) - 1 &&
    date.getUTCDate() === Number(d)
  );
}

export function toUTCDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso, amount) {
  const date = toUTCDate(iso);
  date.setUTCDate(date.getUTCDate() + amount);
  return toISO(date);
}

/** ISO weekday: Monday = 1 ... Sunday = 7. */
export function isoWeekday(iso) {
  const day = toUTCDate(iso).getUTCDay();
  return day === 0 ? 7 : day;
}

export function mondayOf(iso) {
  return addDays(iso, -(isoWeekday(iso) - 1));
}

export function isoWeekNumber(iso) {
  const date = toUTCDate(iso);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  return 1 + Math.round((date - firstThursday) / (7 * 24 * 60 * 60 * 1000));
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthDates(year, month) {
  const count = daysInMonth(year, month);
  const mm = String(month).padStart(2, '0');
  return Array.from({ length: count }, (_, i) => `${year}-${mm}-${String(i + 1).padStart(2, '0')}`);
}

export function monthRange(year, month) {
  const dates = monthDates(year, month);
  return { first: dates[0], last: dates[dates.length - 1], dates };
}

export function todayISO(tz = APP_TZ) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date()).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function currentYearMonth(tz = APP_TZ) {
  const today = todayISO(tz);
  return { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)), today };
}

export function formatDateLong(iso) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(toUTCDate(iso));
}

export function formatDateShort(iso) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(toUTCDate(iso));
}

export function formatDateNumeric(iso) {
  return iso.split('-').reverse().join('-');
}

export function monthLabel(year, month) {
  return `${MONTHS[month - 1]} ${year}`;
}

export function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
