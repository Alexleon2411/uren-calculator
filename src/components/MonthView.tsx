import { useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download,
  FileSpreadsheet, FileText, RefreshCw,
} from 'lucide-react';
import type { MonthData, ToastTone } from '../types';
import { formatDateMedium, formatHours } from '../dates';
import { CalendarGrid } from './CalendarGrid';
import { StatCards } from './StatCards';
import { DayPanel } from './DayPanel';
import { Modal } from './Modal';
import { useToast } from '../toast';

interface MonthViewProps {
  data: MonthData;
  selectedDate: string;
  readOnly: boolean;
  publicMode?: boolean;
  onSelect: (date: string) => void;
  onNavigateMonth: (delta: number) => void;
  onToday: () => void;
  onExport: (kind: 'xlsx' | 'pdf') => void;
  onMonth: (month: MonthData) => void;
  notify?: (message: string, tone?: ToastTone) => void;
}

type PendingAction =
  | { type: 'select'; date: string }
  | { type: 'month'; delta: number }
  | { type: 'today' };

export function MonthView({
  data, selectedDate, readOnly, publicMode, onSelect, onNavigateMonth, onToday,
  onExport, onMonth, notify,
}: MonthViewProps) {
  const toast = useToast();
  const pushToast = notify || toast.notify;
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const selectedDay = data.days[selectedDate];
  const incomplete = data.summary.incomplete;

  const applyPending = () => {
    if (!pending) return;
    setDirty(false);
    setPending(null);
    if (pending.type === 'select') onSelect(pending.date);
    if (pending.type === 'month') onNavigateMonth(pending.delta);
    if (pending.type === 'today') onToday();
  };

  const requestSelect = (date: string) => {
    if (date === selectedDate) return;
    if (!dirty || readOnly) {
      onSelect(date);
      return;
    }
    setPending({ type: 'select', date });
  };

  const requestMonth = (delta: number) => {
    if (!dirty || readOnly) {
      onNavigateMonth(delta);
      return;
    }
    setPending({ type: 'month', delta });
  };

  const requestToday = () => {
    if (!dirty || readOnly) {
      onToday();
      return;
    }
    setPending({ type: 'today' });
  };

  return (
    <div className="month-page page-enter">
      <header className="page-head month-head">
        <div className="page-title">
          <span className="eyebrow">
            {publicMode ? 'Shared monthly report' : `${data.workspace.company} · Urenregistratie`}
          </span>
          <h1>
            {data.monthName}
            <span className="title-year">{data.year}</span>
          </h1>
          <p>
            {data.workspace.profileName || 'Time registration'}
            <span className="dot-sep">·</span>
            {data.summary.recordedWorkdays} of {data.summary.expectedWorkdays} workdays recorded
            {publicMode && <><span className="dot-sep">·</span>Read-only</>}
          </p>
        </div>

        <div className="page-actions">
          <div className="month-nav" aria-label="Change month">
            <button type="button" className="icon-btn" onClick={() => requestMonth(-1)} aria-label="Previous month">
              <ChevronLeft size={18} />
            </button>
            <button type="button" className="today-btn" onClick={requestToday}>
              <RefreshCw size={13} />
              Today
            </button>
            <button type="button" className="icon-btn" onClick={() => requestMonth(1)} aria-label="Next month">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="export-group">
            <button type="button" className="btn btn-outline" onClick={() => onExport('xlsx')} title="Download this month as Excel">
              <FileSpreadsheet size={16} />
              Excel
              <Download size={13} className="download-hint" />
            </button>
            <button type="button" className="btn btn-outline" onClick={() => onExport('pdf')} title="Download this month as PDF">
              <FileText size={16} />
              PDF
              <Download size={13} className="download-hint" />
            </button>
          </div>
        </div>
      </header>

      <StatCards data={data} />

      <div className="month-layout">
        <section className="card calendar-card">
          <div className="card-head">
            <div>
              <h2>Calendar</h2>
              <p>Click a day to {readOnly ? 'inspect the entries' : 'log or change its hours'}.</p>
            </div>
            <div className="legend" aria-label="Legend">
              <span className="legend-item"><i className="legend-dot work" />Logged</span>
              <span className="legend-item"><i className="legend-dot leave" />Leave</span>
              <span className="legend-item"><i className="legend-dot missing" />To complete</span>
            </div>
          </div>

          <CalendarGrid data={data} selectedDate={selectedDate} onSelect={requestSelect} />

          <div className="calendar-foot">
            <div className="foot-title">
              {incomplete.length ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
              <strong>{incomplete.length ? 'Needs attention' : 'Everything is in order'}</strong>
              <span>
                {incomplete.length
                  ? `${data.summary.missingDays} missing · ${data.summary.undescribedDays} without description`
                  : 'Every past workday has an entry.'}
              </span>
            </div>
            {incomplete.length > 0 && (
              <div className="missing-chips">
                {incomplete.map((item) => (
                  <button
                    type="button"
                    key={`${item.date}-${item.reason}`}
                    className={`missing-chip ${item.reason}`}
                    onClick={() => requestSelect(item.date)}
                    title={item.reason === 'missing' ? 'No entry for this workday' : 'Entry has no description'}
                  >
                    {formatDateMedium(item.date)}
                    <span>{item.reason === 'missing' ? 'missing' : 'no description'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <DayPanel
          key={`${selectedDate}:${selectedDay?.updatedAt || 'new'}`}
          date={selectedDate}
          day={selectedDay}
          data={data}
          readOnly={readOnly}
          onMonth={onMonth}
          onDirtyChange={setDirty}
          notify={pushToast}
        />
      </div>

      <div className="report-hint">
        <span>
          <FileSpreadsheet size={14} />
          Excel keeps your familiar <strong>Day · Date · Description · Hours</strong> layout.
        </span>
        <span>
          <FileText size={14} />
          PDF is ready for printing or emailing.
        </span>
        {!publicMode && <span className="report-total">Month total {formatHours(data.summary.loggedHours)} h</span>}
      </div>

      {pending && (
        <Modal
          title="Unsaved changes"
          subtitle="You have edits on this day that have not been saved yet."
          onClose={() => setPending(null)}
          footer={(
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>
                Keep editing
              </button>
              <button type="button" className="btn btn-primary" onClick={applyPending}>
                Discard and continue
              </button>
            </>
          )}
        >
          <p className="modal-copy">
            If you leave now, the description or hours you just typed will be lost. Save the day first to keep it.
          </p>
        </Modal>
      )}
    </div>
  );
}
