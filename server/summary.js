import {
  DAY_ABBR_NL, MONTHS, daysInMonth, isoWeekNumber, isoWeekday, monthDates,
  monthRange, todayISO,
} from './dates.js';

export const DAY_KINDS = ['work', 'vacation', 'holiday', 'sick', 'off'];

export const KIND_LABELS = {
  work: 'Work',
  vacation: 'Vacation',
  holiday: 'Public holiday',
  sick: 'Sick leave',
  off: 'Day off',
};

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

const HOURS_FORMAT = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

export function formatHours(value) {
  return HOURS_FORMAT.format(round2(value));
}

export function parseSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const raw = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const dailyHours = Math.min(24, Math.max(0.5, Number(raw.daily_hours) || 8));
  const workdays = String(raw.workdays || '1,2,3,4,5')
    .split(',')
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7);
  return {
    profileName: String(raw.profile_name || ''),
    company: String(raw.company || 'MAGVIEW'),
    dailyHours,
    workdays: workdays.length ? [...new Set(workdays)].sort() : [1, 2, 3, 4, 5],
    shareToken: String(raw.share_token || ''),
  };
}

export function publicWorkspace(settings) {
  return {
    company: settings.company,
    profileName: settings.profileName,
    dailyHours: settings.dailyHours,
    workdays: settings.workdays,
    shareEnabled: Boolean(settings.shareToken),
  };
}

export function loadDaysForRange(db, first, last) {
  const rows = db.prepare(`
    SELECT d.id AS day_id, d.date, d.kind, d.note, d.updated_at,
           e.id AS entry_id, e.description, e.hours, e.sort_order
    FROM days d
    LEFT JOIN entries e ON e.day_id = d.id
    WHERE d.date BETWEEN ? AND ?
    ORDER BY d.date, e.sort_order, e.id
  `).all(first, last);

  const days = {};
  for (const row of rows) {
    if (!days[row.date]) {
      days[row.date] = {
        date: row.date,
        kind: row.kind,
        note: row.note || '',
        updatedAt: row.updated_at,
        entries: [],
        total: 0,
      };
    }
    if (row.entry_id != null) {
      days[row.date].entries.push({
        id: Number(row.entry_id),
        description: row.description || '',
        hours: round2(row.hours || 0),
      });
      days[row.date].total = round2(days[row.date].total + Number(row.hours || 0));
    }
  }
  return days;
}

function dayHasDescription(day) {
  return day.entries.some((entry) => entry.description.trim().length > 0);
}

export function buildMonth(db, year, month, options = {}) {
  const settings = options.settings || parseSettings(db);
  const today = options.today || todayISO();
  const { first, last, dates } = monthRange(year, month);
  const recorded = loadDaysForRange(db, first, last);
  const workdaySet = new Set(settings.workdays);
  const isCurrentMonth = today >= first && today <= last;
  const isFutureMonth = first > today;
  const isPastMonth = last < today;

  const summary = {
    loggedHours: 0,
    loggedToDate: 0,
    targetHours: 0,
    targetToDate: 0,
    balanceToDate: 0,
    workdayCount: 0,
    expectedWorkdays: 0,
    recordedWorkdays: 0,
    missingDays: 0,
    undescribedDays: 0,
    incomplete: [],
    leaveDays: 0,
    absences: { vacation: 0, holiday: 0, sick: 0, off: 0 },
    recordedDays: Object.keys(recorded).length,
  };

  for (const date of dates) {
    const day = recorded[date];
    const isWorkday = workdaySet.has(isoWeekday(date));
    const isPastOrToday = date <= today;
    const isLeaveDay = Boolean(day && day.kind !== 'work' && isWorkday);
    if (day) {
      summary.loggedHours = round2(summary.loggedHours + day.total);
      if (date <= today) summary.loggedToDate = round2(summary.loggedToDate + day.total);
      if (day.kind === 'work') {
        if (isWorkday) summary.recordedWorkdays += 1;
        if (isPastOrToday && !dayHasDescription(day)) {
          summary.undescribedDays += 1;
          summary.incomplete.push({ date, reason: 'no-description' });
        }
      } else if (isWorkday) {
        summary.leaveDays += 1;
        summary.absences[day.kind] = (summary.absences[day.kind] || 0) + 1;
      }
    }

    if (isWorkday) {
      summary.workdayCount += 1;
      // Leave days are paid time off; they reduce the hours someone is
      // expected to work instead of creating a fake negative balance.
      if (!isLeaveDay) {
        summary.targetHours = round2(summary.targetHours + settings.dailyHours);
        if (!isFutureMonth && date <= today) {
          summary.targetToDate = round2(summary.targetToDate + settings.dailyHours);
        }
      }
      if (!isFutureMonth && date < today) {
        if (!day) {
          summary.missingDays += 1;
          summary.incomplete.push({ date, reason: 'missing' });
        }
      }
    }
  }

  summary.expectedWorkdays = summary.workdayCount - summary.leaveDays;
  if (isPastMonth) summary.targetToDate = summary.targetHours;
  summary.balanceToDate = round2(summary.loggedToDate - summary.targetToDate);
  summary.incomplete.sort((a, b) => a.date.localeCompare(b.date));

  const weeks = [];
  const byMonday = new Map();
  for (const date of dates) {
    const abbr = DAY_ABBR_NL[new Date(`${date}T00:00:00Z`).getUTCDay()];
    let monday = date;
    const weekday = isoWeekday(date);
    if (weekday > 1) {
      const d = new Date(`${date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - (weekday - 1));
      monday = d.toISOString().slice(0, 10);
    }
    if (!byMonday.has(monday)) {
      byMonday.set(monday, {
        week: isoWeekNumber(date),
        startDate: date,
        endDate: date,
        dates: [],
        hours: 0,
        targetHours: 0,
        missingDays: 0,
        isCurrent: false,
      });
    }
    const week = byMonday.get(monday);
    week.endDate = date;
    week.dates.push(date);
    week.isCurrent = week.isCurrent || date === today;
    const day = recorded[date];
    if (day) week.hours = round2(week.hours + day.total);
    if (workdaySet.has(isoWeekday(date))) {
      if (!(day && day.kind !== 'work')) {
        week.targetHours = round2(week.targetHours + settings.dailyHours);
      }
      if (date < today && !day) week.missingDays += 1;
    }
    week.dayLabels = week.dates.map((value) => ({
      date: value,
      label: DAY_ABBR_NL[new Date(`${value}T00:00:00Z`).getUTCDay()],
    }));
    week.abbr = abbr;
  }
  weeks.push(...byMonday.values());

  return {
    year,
    month,
    monthName: MONTHS[month - 1],
    today,
    workspace: publicWorkspace(settings),
    days: recorded,
    weeks,
    summary,
    isCurrentMonth,
    isFutureMonth,
    isPastMonth,
    hasData: summary.recordedDays > 0,
  };
}

export function buildYear(db, year, options = {}) {
  const settings = options.settings || parseSettings(db);
  const today = options.today || todayISO();
  const months = [];
  const totals = {
    loggedHours: 0,
    targetHours: 0,
    loggedToDate: 0,
    balanceToDate: 0,
    workdayCount: 0,
    expectedWorkdays: 0,
    recordedWorkdays: 0,
    missingDays: 0,
    undescribedDays: 0,
    leaveDays: 0,
    absences: { vacation: 0, holiday: 0, sick: 0, off: 0 },
  };

  for (let month = 1; month <= 12; month += 1) {
    const data = buildMonth(db, year, month, { settings, today });
    months.push({
      month,
      monthName: MONTHS[month - 1],
      shortName: MONTHS[month - 1].slice(0, 3),
      loggedHours: data.summary.loggedHours,
      targetHours: data.summary.targetHours,
      balanceToDate: data.summary.balanceToDate,
      workdayCount: data.summary.workdayCount,
      expectedWorkdays: data.summary.expectedWorkdays,
      recordedWorkdays: data.summary.recordedWorkdays,
      missingDays: data.summary.missingDays,
      undescribedDays: data.summary.undescribedDays,
      leaveDays: data.summary.leaveDays,
      absences: data.summary.absences,
      isCurrent: data.isCurrentMonth,
      isFuture: data.isFutureMonth,
      hasData: data.hasData,
    });
    for (const key of [
      'loggedHours', 'targetHours', 'loggedToDate', 'balanceToDate',
      'workdayCount', 'expectedWorkdays', 'recordedWorkdays', 'missingDays',
      'undescribedDays', 'leaveDays',
    ]) {
      totals[key] = round2(totals[key] + data.summary[key]);
    }
    for (const kind of Object.keys(totals.absences)) {
      totals.absences[kind] += data.summary.absences[kind] || 0;
    }
  }

  return {
    year,
    today,
    workspace: publicWorkspace(settings),
    months,
    totals,
  };
}

export function kindLabel(kind) {
  return KIND_LABELS[kind] || 'Work';
}

export function descriptionForDay(day) {
  if (!day) return '';
  if (day.kind !== 'work') {
    const label = kindLabel(day.kind);
    if (day.kind === 'off') {
      return day.note ? `Day off — ${day.note}` : 'Day off';
    }
    return day.note ? `${label} — ${day.note}` : label;
  }
  const descriptions = day.entries
    .map((entry) => entry.description.trim())
    .filter(Boolean);
  let text;
  if (descriptions.length === 0) {
    text = day.entries.length ? 'No description' : '';
  } else if (day.entries.length === 1) {
    text = descriptions[0];
  } else {
    text = day.entries
      .filter((entry) => entry.description.trim() || entry.hours > 0)
      .map((entry) => {
        const description = entry.description.trim() || 'No description';
        return `${description} (${formatHours(entry.hours)} h)`;
      })
      .join('\n');
  }
  if (text && day.note) text += `\nNote: ${day.note}`;
  return text;
}

export function weekLabel(week) {
  const startDay = Number(week.startDate.slice(8, 10));
  const endDay = Number(week.endDate.slice(8, 10));
  const startMonth = MONTHS[Number(week.startDate.slice(5, 7)) - 1];
  const endMonth = MONTHS[Number(week.endDate.slice(5, 7)) - 1];
  const year = week.startDate.slice(0, 4);
  let range;
  if (week.startDate === week.endDate) {
    range = `${startDay} ${startMonth} ${year}`;
  } else if (startMonth === endMonth) {
    range = `${startDay}–${endDay} ${endMonth} ${year}`;
  } else {
    range = `${startDay} ${startMonth} – ${endDay} ${endMonth} ${year}`;
  }
  return `Week ${week.week} · ${range}`;
}

export function exportRowsForWeek(data, week) {
  const settings = data.workspace;
  const workdaySet = new Set(settings.workdays);
  const rows = [];
  for (const date of week.dates) {
    const day = data.days[date];
    const isWorkday = workdaySet.has(isoWeekday(date));
    if (!isWorkday && !day) continue;
    // Do not print empty future days in the report. A recorded future day
    // (for example planned leave) is included; it carries real information.
    if (isWorkday && !day && date > data.today) continue;
    rows.push({
      date,
      day,
      isWorkday,
      isFuture: date > data.today,
      isMissing: isWorkday && date < data.today && !day,
    });
  }
  return rows;
}

export function totalDaysInMonth(year, month) {
  return daysInMonth(year, month);
}
