import type { MonthData } from '../types';
import {
  WEEKDAYS, buildCalendarWeeks, formatDateLong, formatHours, isoWeekday,
  weekNumber,
} from '../dates';

interface CalendarGridProps {
  data: MonthData;
  selectedDate: string;
  onSelect: (date: string) => void;
}

export function CalendarGrid({ data, selectedDate, onSelect }: CalendarGridProps) {
  const weeks = buildCalendarWeeks(data.year, data.month);
  const workdays = new Set(data.workspace.workdays);

  return (
    <div className="calendar" role="grid" aria-label={`${data.monthName} ${data.year}`}>
      <div className="calendar-head" role="row">
        <div className="week-gutter-head" aria-hidden="true">Wk</div>
        {WEEKDAYS.map((day, index) => (
          <div
            key={day}
            role="columnheader"
            className={`weekday-head${index > 4 ? ' weekend' : ''}`}
          >
            {day}
          </div>
        ))}
      </div>

      {weeks.map((week) => {
        const inMonth = week.days.filter((day) => day.inMonth);
        if (!inMonth.length) return null;
        const hours = inMonth.reduce((sum, day) => sum + (data.days[day.date]?.total || 0), 0);
        const workdayCount = inMonth.filter((day) => workdays.has(isoWeekday(day.date))).length;
        const isCurrentWeek = week.days.some((day) => day.date === data.today);
        const hasVisibleWork = inMonth.some((day) => (
          workdays.has(isoWeekday(day.date)) || Boolean(data.days[day.date])
        ));
        return (
          <div
            className={`calendar-week${isCurrentWeek ? ' is-current' : ''}${hasVisibleWork ? '' : ' is-empty-week'}`}
            role="row"
            key={week.start}
          >
            <div className="week-gutter" title={`${workdayCount} planned workdays`}>
              <span className="week-number">W{weekNumber(week.start)}</span>
              <span className={`week-hours${hours ? '' : ' empty'}`}>
                {hours ? `${formatHours(hours)}h` : '–'}
              </span>
            </div>

            {week.days.map(({ date, inMonth: isInMonth }, index) => {
              if (!isInMonth) {
                return (
                  <div className="cal-day is-outside" role="gridcell" key={date} aria-hidden="true" />
                );
              }
              const day = data.days[date];
              const isWeekend = index > 4;
              const isWorkday = workdays.has(isoWeekday(date));
              const isSelected = date === selectedDate;
              const isToday = date === data.today;
              const isFuture = date > data.today;
              const isMissing = isWorkday && date < data.today && !day;
              const isNoDescription = Boolean(
                day && day.kind === 'work' && date <= data.today
                && day.entries.every((entry) => !entry.description.trim()),
              );
              const leaveKind = day && day.kind !== 'work' ? day.kind : null;
              const leave = Boolean(leaveKind);
              const description = day
                ? (day.entries.find((entry) => entry.description.trim())?.description
                  || (day.kind === 'work' ? 'No description' : ''))
                : '';
              const extraEntries = day ? day.entries.filter((entry) => entry.description.trim()).length - 1 : 0;
              const note = leave ? day.note : '';
              const label = day
                ? day.kind === 'work'
                  ? description
                  : day.kind === 'vacation'
                    ? 'Vacation'
                    : day.kind === 'holiday'
                      ? 'Holiday'
                      : day.kind === 'sick'
                        ? 'Sick leave'
                        : 'Day off'
                : '';
              const aria = [
                formatDateLong(date),
                day ? `${day.kind}${day.kind === 'work' ? `, ${formatHours(day.total)} hours` : ''}` : 'not logged',
                isToday ? 'today' : '',
              ].filter(Boolean).join(', ');

              return (
                <button
                  type="button"
                  role="gridcell"
                  key={date}
                  className={[
                    'cal-day',
                    isWeekend ? 'is-weekend' : '',
                    isToday ? 'is-today' : '',
                    isSelected ? 'is-selected' : '',
                    day ? 'is-recorded' : '',
                    leaveKind ? `is-leave kind-${leaveKind}` : '',
                    isMissing ? 'is-missing' : '',
                    isNoDescription ? 'is-undescribed' : '',
                    isFuture ? 'is-future' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => onSelect(date)}
                  aria-pressed={isSelected}
                  aria-label={aria}
                  title={[label, note].filter(Boolean).join(' — ')}
                >
                  <span className="day-top">
                    <span className="day-number">{Number(date.slice(8, 10))}</span>
                    {isToday && <span className="today-dot" aria-hidden="true" />}
                    {day && day.kind === 'work' && (
                      <span className="day-hours">{formatHours(day.total)}h</span>
                    )}
                  </span>

                  {leaveKind && day ? (
                    <>
                      <span className={`kind-chip kind-${leaveKind}`}>{label}</span>
                      {note && <span className="day-note">{note}</span>}
                    </>
                  ) : day ? (
                    <span className={`day-text${isNoDescription ? ' muted-warning' : ''}`}>
                      {description}
                      {extraEntries > 0 && <span className="entry-count">+{extraEntries}</span>}
                    </span>
                  ) : isMissing ? (
                    <span className="day-missing">Not logged</span>
                  ) : isFuture ? (
                    <span className="day-future">—</span>
                  ) : null}

                  {isMissing && <span className="missing-dot" aria-hidden="true" />}
                  {isNoDescription && <span className="missing-dot" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
