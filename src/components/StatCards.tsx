import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarCheck2, Clock3, Palmtree } from 'lucide-react';
import type { MonthData } from '../types';
import { formatHours, signedHours } from '../dates';

export function StatCards({ data }: { data: MonthData }) {
  const s = data.summary;
  const percent = s.targetHours > 0 ? Math.min(100, Math.round((s.loggedHours / s.targetHours) * 100)) : 0;
  const incomplete = s.missingDays + s.undescribedDays;
  const balanceTone = s.balanceToDate >= 0 ? 'positive' : 'negative';
  const leaveParts = [
    s.absences.vacation ? `${s.absences.vacation} vacation` : null,
    s.absences.holiday ? `${s.absences.holiday} holiday` : null,
    s.absences.sick ? `${s.absences.sick} sick` : null,
    s.absences.off ? `${s.absences.off} off` : null,
  ].filter(Boolean);

  return (
    <div className="stat-grid">
      <section className="stat-card stat-primary">
        <div className="stat-top">
          <span className="stat-label"><Clock3 size={14} /> Hours logged</span>
          {s.targetToDate > 0 && (
            <span className={`balance-pill ${balanceTone}`}>
              {s.balanceToDate >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {signedHours(s.balanceToDate)} h to date
            </span>
          )}
        </div>
        <div className="stat-value">
          {formatHours(s.loggedHours)}<span className="unit">h</span>
        </div>
        <div className="stat-sub">of {formatHours(s.targetHours)} h planned</div>
        <div className="progress" aria-hidden="true">
          <span style={{ width: `${percent}%` }} />
        </div>
      </section>

      <section className="stat-card">
        <span className="stat-label"><CalendarCheck2 size={14} /> Workdays</span>
        <div className="stat-value">
          {s.recordedWorkdays}<span className="stat-divider">/</span><span className="stat-soft">{s.expectedWorkdays}</span>
        </div>
        <div className="stat-sub">recorded this month</div>
        <div className="mini-scale" aria-hidden="true">
          <span style={{ width: `${s.expectedWorkdays ? Math.min(100, (s.recordedWorkdays / s.expectedWorkdays) * 100) : 0}%` }} />
        </div>
      </section>

      <section className={`stat-card${incomplete ? ' stat-attention' : ''}`}>
        <span className="stat-label"><AlertTriangle size={14} /> To complete</span>
        <div className="stat-value">{incomplete}</div>
        <div className="stat-sub">
          {incomplete === 0
            ? 'all past workdays are complete'
            : `${s.missingDays} missing · ${s.undescribedDays} without description`}
        </div>
        <div className={`status-line${incomplete ? ' attention' : ' good'}`}>
          <span className="status-dot" />
          {incomplete === 0 ? 'Nothing outstanding' : 'Needs your attention'}
        </div>
      </section>

      <section className="stat-card">
        <span className="stat-label"><Palmtree size={14} /> Leave</span>
        <div className="stat-value">{s.leaveDays}<span className="unit">days</span></div>
        <div className="stat-sub">{leaveParts.join(' · ') || 'no leave this month'}</div>
        <div className={`leave-split${s.leaveDays ? '' : ' is-empty'}`} aria-hidden="true">
          {s.leaveDays > 0 && (['vacation', 'holiday', 'sick', 'off'] as const).map((kind) => (
            s.absences[kind] > 0 && (
              <span
                key={kind}
                className={`leave-dot ${kind}`}
                style={{ flexGrow: s.absences[kind], flexBasis: 0 }}
              />
            )
          ))}
        </div>
      </section>
    </div>
  );
}
