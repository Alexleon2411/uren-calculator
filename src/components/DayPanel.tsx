import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Briefcase, CalendarDays, CheckCircle2, Coffee, Copy, Palmtree,
  Plus, Save, Stethoscope, Sun, Trash2, X,
} from 'lucide-react';
import { api } from '../api';
import { useToast } from '../toast';
import type { DayKind, DayRecord, MonthData, ToastTone } from '../types';
import {
  KIND_LABELS, MONTHS, WEEKDAYS_LONG, dayOfMonth, formatDateLong, formatHours,
  isoWeekday, weekdayIndex,
} from '../dates';

interface DraftEntry {
  key: string;
  description: string;
  hours: string;
}

interface DayPanelProps {
  date: string;
  day?: DayRecord;
  data: MonthData;
  readOnly: boolean;
  onMonth: (month: MonthData) => void;
  onSaved?: () => void;
  onDeleted?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  notify?: (message: string, tone?: ToastTone) => void;
}

const KIND_OPTIONS: Array<{ kind: DayKind; label: string; icon: typeof Briefcase }> = [
  { kind: 'work', label: 'Work', icon: Briefcase },
  { kind: 'vacation', label: 'Vacation', icon: Palmtree },
  { kind: 'holiday', label: 'Holiday', icon: Sun },
  { kind: 'sick', label: 'Sick', icon: Stethoscope },
  { kind: 'off', label: 'Off', icon: Coffee },
];

function newKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseHours(value: string): number {
  const normalised = String(value).replace(',', '.').trim();
  if (!normalised) return 0;
  return Number(normalised);
}

export function DayPanel({
  date, day, data, readOnly, onMonth, onSaved, onDeleted, onDirtyChange, notify,
}: DayPanelProps) {
  const toast = useToast();
  const pushToast = notify || toast.notify;
  const isWorkday = data.workspace.workdays.includes(isoWeekday(date));
  const isToday = date === data.today;
  const isFuture = date > data.today;
  const [kind, setKind] = useState<DayKind>(day?.kind || 'work');
  const [note, setNote] = useState(day?.note || '');
  const [entries, setEntries] = useState<DraftEntry[]>(() => {
    if (day && day.entries.length) {
      return day.entries.map((entry) => ({
        key: newKey(),
        description: entry.description,
        hours: entry.hours ? String(entry.hours) : '',
      }));
    }
    return [{
      key: newKey(),
      description: '',
      hours: isWorkday ? String(data.workspace.dailyHours) : '',
    }];
  });
  const [baseline, setBaseline] = useState(() => '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(() => entries.reduce((sum, entry) => {
    const hours = parseHours(entry.hours);
    return Number.isFinite(hours) && hours > 0 ? sum + hours : sum;
  }, 0), [entries]);

  const serialised = useMemo(() => JSON.stringify({ kind, note, entries }), [kind, note, entries]);
  const isDirty = baseline !== '' && serialised !== baseline;
  useEffect(() => {
    if (!baseline) {
      setBaseline(serialised);
      return;
    }
    onDirtyChange?.(isDirty);
  }, [serialised, baseline, isDirty, onDirtyChange]);

  const hasDescription = entries.some((entry) => entry.description.trim().length > 0);
  const hasAnyEntry = entries.some((entry) => entry.description.trim() || parseHours(entry.hours) > 0);
  const saveDisabled = saving || deleting || !isDirty
    || (kind === 'work' && !hasAnyEntry)
    || (kind === 'work' && !day && !hasDescription);

  const updateEntry = (key: string, field: 'description' | 'hours', value: string) => {
    setEntries((current) => current.map((entry) => (
      entry.key === key ? { ...entry, [field]: value } : entry
    )));
  };

  const addEntry = () => {
    setEntries((current) => [...current, { key: newKey(), description: '', hours: '' }]);
  };

  const removeEntry = (key: string) => {
    setEntries((current) => current.filter((entry) => entry.key !== key));
  };

  const chooseKind = (nextKind: DayKind) => {
    setKind(nextKind);
    if (nextKind === 'work' && entries.length === 0) {
      setEntries([{
        key: newKey(),
        description: '',
        hours: isWorkday ? String(data.workspace.dailyHours) : '',
      }]);
    }
  };

  const fillTarget = () => {
    setEntries((current) => {
      if (!current.length) {
        return [{
          key: newKey(), description: '', hours: String(data.workspace.dailyHours),
        }];
      }
      return current.map((entry, index) => (
        index === 0 ? { ...entry, hours: String(data.workspace.dailyHours) } : entry
      ));
    });
  };

  const copyPrevious = () => {
    const previousDates = Object.keys(data.days)
      .filter((value) => value < date && data.days[value].kind === 'work'
        && data.days[value].entries.some((entry) => entry.description.trim()))
      .sort()
      .reverse();
    const previous = previousDates[0] ? data.days[previousDates[0]] : null;
    if (!previous) {
      pushToast('No earlier entries found in this month.', 'info');
      return;
    }
    setEntries(previous.entries
      .filter((entry) => entry.description.trim() || entry.hours > 0)
      .map((entry) => ({
        key: newKey(),
        description: entry.description,
        hours: String(entry.hours),
      })));
    setKind('work');
    pushToast(`Copied from ${formatDateLong(previous.date)}.`, 'info');
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (kind === 'work') {
      const parsed = entries.map((entry) => ({
        description: entry.description.trim(),
        hours: parseHours(entry.hours),
      }));
      if (parsed.some((entry) => !Number.isFinite(entry.hours) || entry.hours < 0 || entry.hours > 24)) {
        setError('Enter hours as a number between 0 and 24.');
        return;
      }
      if (!parsed.some((entry) => entry.description || entry.hours > 0)) {
        setError('Add at least one entry, or delete this day.');
        return;
      }
      if (parsed.reduce((sum, entry) => sum + entry.hours, 0) > 24) {
        setError('A day cannot have more than 24 hours.');
        return;
      }
    }
    setSaving(true);
    try {
      const response = await api.saveDay(date, {
        kind,
        note: note.trim(),
        entries: kind === 'work'
          ? entries.map((entry) => ({
            description: entry.description.trim(),
            hours: parseHours(entry.hours) || 0,
          })).filter((entry) => entry.description || entry.hours > 0)
          : [],
      });
      onMonth(response.month);
      onDirtyChange?.(false);
      onSaved?.();
      pushToast(kind === 'work' ? 'Day saved.' : `${KIND_LABELS[kind]} saved.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this day.');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const response = await api.deleteDay(date);
      onMonth(response.month);
      onDirtyChange?.(false);
      setConfirmDelete(false);
      onDeleted?.();
      pushToast('Day removed.', 'info');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove this day.');
    } finally {
      setDeleting(false);
    }
  };

  const weekday = WEEKDAYS_LONG[weekdayIndex(date)];
  const monthName = MONTHS[Number(date.slice(5, 7)) - 1];
  const dateLabel = formatDateLong(date);
  const dayNumber = dayOfMonth(date);
  const leaveLabel = kind !== 'work' ? KIND_LABELS[kind] : null;
  const target = data.workspace.dailyHours;
  const diff = Math.round((total - target) * 100) / 100;

  return (
    <aside className="day-panel" aria-label={`Day details for ${dateLabel}`}>
      <div className="day-panel-head">
        <div className="day-head-main">
          <span className="eyebrow">{weekday}{isToday ? ' · today' : ''}</span>
          <h2>
            {dayNumber} {monthName}
            <span className="day-year">{date.slice(0, 4)}</span>
          </h2>
          <div className="day-badges">
            {!isWorkday && <span className="badge badge-weekend">Weekend</span>}
            {isFuture && <span className="badge">Upcoming</span>}
            {day ? (
              <span className={`badge badge-recorded${day.kind !== 'work' ? ` kind-${day.kind}` : ''}`}>
                <CheckCircle2 size={12} />
                {day.kind === 'work' ? `${formatHours(day.total)} h logged` : KIND_LABELS[day.kind]}
              </span>
            ) : (
              <span className="badge badge-empty">Not logged</span>
            )}
            {readOnly && <span className="badge badge-readonly">Read-only</span>}
          </div>
        </div>
        <div className="day-head-icon" aria-hidden="true">
          <CalendarDays size={20} />
        </div>
      </div>

      {readOnly ? (
        <div className="day-readonly">
          {!day ? (
            <div className="day-empty">
              <CalendarDays size={26} />
              <strong>Nothing logged for this day</strong>
              <span>{isWorkday ? 'This workday has no time entry.' : 'No entry was recorded.'}</span>
            </div>
          ) : (
            <>
              <div className={`kind-banner kind-${day.kind}`}>
                <strong>{KIND_LABELS[day.kind]}</strong>
                <span>{day.kind === 'work' ? 'Working day' : 'Leave day — no hours counted'}</span>
              </div>

              {day.kind === 'work' && (
                <div className="readonly-entries">
                  {day.entries.length === 0 && (
                    <div className="readonly-entry muted">No description was added.</div>
                  )}
                  {day.entries.map((entry, index) => (
                    <div className="readonly-entry" key={entry.id || index}>
                      <span className="entry-number">{String(index + 1).padStart(2, '0')}</span>
                      <span className={entry.description ? '' : 'muted'}>
                        {entry.description || 'No description'}
                      </span>
                      <strong>{formatHours(entry.hours)} h</strong>
                    </div>
                  ))}
                </div>
              )}

              {day.note && (
                <div className="day-note-block">
                  <span className="eyebrow">Note</span>
                  <p>{day.note}</p>
                </div>
              )}

              <div className="day-total-row readonly">
                <div>
                  <span className="eyebrow">Day total</span>
                  <span className="total-caption">
                    {day.kind === 'work'
                      ? `${formatHours(day.total)} hours recorded`
                      : 'Leave day — hours are not counted'}
                  </span>
                </div>
                <div className="total-big">
                  {formatHours(day.total)}<span>h</span>
                </div>
              </div>
            </>
          )}

          <p className="readonly-footnote">This is a read-only view. Time entries are managed by {data.workspace.profileName || 'the owner'}.</p>
        </div>
      ) : (
        <form className="day-form" onSubmit={(event) => void onSubmit(event)}>
          <div className="kind-picker" role="group" aria-label="Day type">
            {KIND_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.kind}
                  type="button"
                  className={`kind-option${kind === option.kind ? ' is-active' : ''} kind-${option.kind}`}
                  onClick={() => chooseKind(option.kind)}
                  aria-pressed={kind === option.kind}
                >
                  <Icon size={15} />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>

          {kind === 'work' ? (
            <>
              <div className="entries-head">
                <span className="eyebrow">Time entries</span>
                <div className="entry-actions">
                  <button type="button" className="text-btn" onClick={copyPrevious}>
                    <Copy size={13} /> Copy previous
                  </button>
                  {total === 0 && (
                    <button type="button" className="text-btn" onClick={fillTarget}>
                      Fill {formatHours(target)} h
                    </button>
                  )}
                </div>
              </div>

              <div className="entry-list">
                {entries.map((entry, index) => (
                  <div className="entry-row" key={entry.key}>
                    <span className="entry-number">{String(index + 1).padStart(2, '0')}</span>
                    <input
                      className="entry-description"
                      type="text"
                      value={entry.description}
                      onChange={(event) => updateEntry(entry.key, 'description', event.target.value)}
                      placeholder="Ticket, project, meeting, deployment…"
                      maxLength={1000}
                      aria-label={`Description for entry ${index + 1}`}
                    />
                    <span className="entry-hours-wrap">
                      <input
                        className="entry-hours"
                        type="text"
                        inputMode="decimal"
                        value={entry.hours}
                        onChange={(event) => updateEntry(entry.key, 'hours', event.target.value)}
                        placeholder="0"
                        aria-label={`Hours for entry ${index + 1}`}
                      />
                      <span className="entry-unit">h</span>
                    </span>
                    <button
                      type="button"
                      className="icon-btn entry-remove"
                      onClick={() => removeEntry(entry.key)}
                      aria-label={`Remove entry ${index + 1}`}
                      disabled={entries.length === 1}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <button type="button" className="add-entry" onClick={addEntry}>
                <Plus size={15} /> Add another entry
              </button>

              {!hasDescription && entries.length > 0 && (
                <p className="inline-hint">A short description helps your manager understand the day.</p>
              )}
            </>
          ) : (
            <div className={`leave-panel kind-${kind}`}>
              <div className="leave-panel-icon">
                {kind === 'vacation' && <Palmtree size={22} />}
                {kind === 'holiday' && <Sun size={22} />}
                {kind === 'sick' && <Stethoscope size={22} />}
                {kind === 'off' && <Coffee size={22} />}
              </div>
              <div>
                <strong>{leaveLabel}</strong>
                <p>No working hours will be counted for this day. Use the note for extra context.</p>
              </div>
            </div>
          )}

          <label className="field note-field">
            <span className="field-label">{kind === 'work' ? 'Note (optional)' : 'Note (optional)'}</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              maxLength={2000}
              placeholder={kind === 'work'
                ? 'Context, blockers, next steps…'
                : 'e.g. public holiday, family visit, doctor’s appointment…'}
            />
          </label>

          <div className={`day-total-row${kind !== 'work' ? ' leave' : ''}`}>
            <div>
              <span className="eyebrow">Day total</span>
              <span className="total-caption">
                {kind === 'work'
                  ? isWorkday
                    ? diff === 0
                      ? `On target · ${formatHours(target)} h`
                      : `${diff > 0 ? '+' : ''}${formatHours(diff)} h vs ${formatHours(target)} h target`
                    : 'Weekend work · outside the monthly target'
                  : 'Leave day · no hours counted'}
              </span>
            </div>
            <div className={`total-big${kind !== 'work' ? ' leave' : ''}`}>
              {formatHours(kind === 'work' ? total : 0)}<span>h</span>
            </div>
          </div>

          {error && <div className="form-error" role="alert">{error}</div>}

          <div className="day-actions">
            <button type="submit" className="btn btn-primary" disabled={saveDisabled}>
              {saving ? <span className="spinner spinner-light" /> : <Save size={16} />}
              {day ? 'Save changes' : 'Save day'}
            </button>
            {day && !confirmDelete && (
              <button type="button" className="btn btn-ghost danger-text" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={15} /> Delete
              </button>
            )}
          </div>

          {confirmDelete && (
            <div className="confirm-delete">
              <span>Delete this day?</span>
              <button type="button" className="btn btn-danger btn-small" onClick={() => void onDelete()} disabled={deleting}>
                {deleting ? <span className="spinner spinner-light" /> : 'Yes, delete'}
              </button>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </div>
          )}
        </form>
      )}
    </aside>
  );
}
