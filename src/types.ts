export type DayKind = 'work' | 'vacation' | 'holiday' | 'sick' | 'off';

export interface Entry {
  id?: number;
  description: string;
  hours: number;
}

export interface DayRecord {
  date: string;
  kind: DayKind;
  note: string;
  entries: Entry[];
  total: number;
  updatedAt?: string;
}

export interface Absences {
  vacation: number;
  holiday: number;
  sick: number;
  off: number;
}

export interface MonthSummary {
  loggedHours: number;
  loggedToDate: number;
  targetHours: number;
  targetToDate: number;
  balanceToDate: number;
  workdayCount: number;
  expectedWorkdays: number;
  recordedWorkdays: number;
  missingDays: number;
  undescribedDays: number;
  incomplete: Array<{ date: string; reason: 'missing' | 'no-description' }>;
  leaveDays: number;
  absences: Absences;
  recordedDays: number;
}

export interface WeekSummary {
  week: number;
  startDate: string;
  endDate: string;
  dates: string[];
  hours: number;
  targetHours: number;
  missingDays: number;
  isCurrent: boolean;
  dayLabels: Array<{ date: string; label: string }>;
}

export interface Workspace {
  company: string;
  profileName: string;
  dailyHours: number;
  workdays: number[];
  shareEnabled: boolean;
}

export interface MonthData {
  year: number;
  month: number;
  monthName: string;
  today: string;
  workspace: Workspace;
  days: Record<string, DayRecord>;
  weeks: WeekSummary[];
  summary: MonthSummary;
  isCurrentMonth: boolean;
  isFutureMonth: boolean;
  isPastMonth: boolean;
  hasData: boolean;
}

export interface YearMonthSummary {
  month: number;
  monthName: string;
  shortName: string;
  loggedHours: number;
  targetHours: number;
  balanceToDate: number;
  workdayCount: number;
  expectedWorkdays: number;
  recordedWorkdays: number;
  missingDays: number;
  undescribedDays: number;
  leaveDays: number;
  absences: Absences;
  isCurrent: boolean;
  isFuture: boolean;
  hasData: boolean;
}

export interface YearData {
  year: number;
  today: string;
  workspace: Workspace;
  months: YearMonthSummary[];
  totals: {
    loggedHours: number;
    targetHours: number;
    loggedToDate: number;
    balanceToDate: number;
    workdayCount: number;
    expectedWorkdays: number;
    recordedWorkdays: number;
    missingDays: number;
    undescribedDays: number;
    leaveDays: number;
    absences: Absences;
  };
}

export interface User {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'viewer';
  active: boolean;
  createdAt: string;
}

export interface DataStats {
  days: number;
  firstDate: string | null;
  lastDate: string | null;
}

export interface Bootstrap {
  needsSetup: boolean;
  user: User | null;
  workspace: Workspace | null;
  today: string;
  stats: DataStats;
}

export interface SettingsPayload {
  settings: {
    profileName: string;
    company: string;
    dailyHours: number;
    workdays: number[];
    shareToken: string;
    shareEnabled: boolean;
  };
  users: User[];
  stats: DataStats;
  today: string;
  publicUrl: string;
  lanAddresses: Array<{ name: string; address: string; url: string }>;
}

export interface PublicBootstrap {
  readOnly: true;
  workspace: Workspace;
  today: string;
  stats: DataStats;
}

export interface DayPayload {
  kind: DayKind;
  note: string;
  entries: Array<{ description: string; hours: number }>;
}

export type ToastTone = 'success' | 'error' | 'info';
