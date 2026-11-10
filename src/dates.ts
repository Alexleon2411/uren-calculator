import type { DayKind } from './types';

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAYS_LONG = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];
export const DAY_LABELS_NL = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

export const KIND_LABELS: Record<DayKind, string> = {
  work: 'Work',
  vacation: 'Vacation',
  holiday: 'Public holiday',
  sick: 'Sick leave',
  off: 'Day off',
};

export const KIND_LABELS_SHORT: Record<DayKind, string> = {
  work: 'Work',
  vacation: 'Vacation',
  holiday: 'Holiday',
  sick: 'Sick',
  off: 'Day off',
};

export function parseISO(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function currentYearMonth(): { year: number; month: number } {
  const today = parseISO(todayISO());
  return { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 };
}

export function isoWeekday(iso: string): number {
  const day = parseISO(iso).getUTCDay();
  return day === 0 ? 7 : day;
}

export function addDays(iso: string, amount: number): string {
  const date = parseISO(iso);
  date.setUTCDate(date.getUTCDate() + amount);
  return toISO(date);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthPath(year: number, month: number): string {
  return `/month/${year}/${month}`;
}

export function yearPath(year: number): string {
  return `/year/${year}`;
}

export function clampMonth(year: number, month: number): { year: number; month: number } {
  if (month < 1) return { year: year - 1, month: 12 };
  if (month > 12) return { year: year + 1, month: 1 };
  return { year, month };
}

export function monthDates(year: number, month: number): string[] {
  const count = daysInMonth(year, month);
  const mm = String(month).padStart(2, '0');
  return Array.from({ length: count }, (_, index) => `${year}-${mm}-${String(index + 1).padStart(2, '0')}`);
}

export interface CalendarDay {
  date: string;
  inMonth: boolean;
}

export interface CalendarWeek {
  start: string;
  end: string;
  days: CalendarDay[];
}

export function buildCalendarWeeks(year: number, month: number): CalendarWeek[] {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const firstWeekday = isoWeekday(first);
  const gridStart = addDays(first, -(firstWeekday - 1));
  const last = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
  const lastWeekday = isoWeekday(last);
  const gridEnd = addDays(last, 7 - lastWeekday);
  const weeks: CalendarWeek[] = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    const days: CalendarDay[] = [];
    for (let index = 0; index < 7; index += 1) {
      const date = addDays(cursor, index);
      days.push({ date, inMonth: date >= first && date <= last });
    }
    weeks.push({ start: cursor, end: addDays(cursor, 6), days });
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

export function weekNumber(iso: string): number {
  const date = parseISO(iso);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

export function formatDateLong(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(parseISO(iso));
}

export function formatDateMedium(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(parseISO(iso));
}

export function formatDateShort(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(parseISO(iso));
}

export function formatDateNumeric(iso: string): string {
  return iso.split('-').reverse().join('-');
}

const HOURS_FORMAT = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

export function formatHours(value: number): string {
  const rounded = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  return HOURS_FORMAT.format(rounded);
}

export function signedHours(value: number): string {
  const number = Number(value);
  if (number > 0) return `+${formatHours(number)}`;
  return formatHours(number);
}

export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

export function monthName(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`;
}

export function weekdayIndex(iso: string): number {
  return isoWeekday(iso) - 1;
}
