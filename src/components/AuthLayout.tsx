import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Logo } from './Logo';
import {
  DAY_LABELS_NL, MONTHS, daysInMonth, isoWeekday, weekNumber,
} from '../dates';

interface AuthLayoutProps {
  eyebrow: string;
  headline: ReactNode;
  lead: string;
  children: ReactNode;
}

const PREVIEW_LABELS = [
  'Service Bus trigger function',
  'Transactions processor',
  'Bronze replay · recovery',
  'JIRA ticket · Madic team',
];

function previewData() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const rows: Array<{ day: string; date: string; label: string; hours: string }> = [];
  for (let day = 1; day <= daysInMonth(year, month) && rows.length < 4; day += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (isoWeekday(iso) <= 5) {
      rows.push({
        day: DAY_LABELS_NL[isoWeekday(iso) - 1],
        date: String(day).padStart(2, '0'),
        label: PREVIEW_LABELS[rows.length],
        hours: '8.0',
      });
    }
  }
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  return {
    rows,
    year,
    month: MONTHS[month - 1],
    week: weekNumber(first),
  };
}

export function AuthLayout({ eyebrow, headline, lead, children }: AuthLayoutProps) {
  const preview = previewData();
  return (
    <div className="auth">
      <section className="auth-art" aria-hidden="true">
        <div className="auth-art-inner">
          <Logo size="md" inverse showCompany={false} />
          <div className="auth-copy">
            <span className="eyebrow light">{eyebrow}</span>
            <h1>{headline}</h1>
            <p>{lead}</p>
          </div>

          <div className="preview-sheet">
            <div className="preview-head">
              <span>Week {preview.week}</span>
              <span>{preview.month} {preview.year}</span>
            </div>
            {preview.rows.map((row) => (
              <div className="preview-row" key={row.date}>
                <span className="preview-day">{row.day}</span>
                <span className="preview-date">{row.date}</span>
                <span className="preview-label">{row.label}</span>
                <span className="preview-hours">{row.hours}</span>
                <span className="preview-check"><Check size={11} strokeWidth={3} /></span>
              </div>
            ))}
            <div className="preview-total">
              <span>Week total</span>
              <strong>32.0 h</strong>
            </div>
          </div>

          <div className="auth-footnote">
            <span>Monday — Friday</span>
            <span className="dot-sep">·</span>
            <span>Excel &amp; PDF ready</span>
            <span className="dot-sep">·</span>
            <span>Manager read-only link</span>
          </div>
        </div>
        <div className="auth-year" aria-hidden="true">{preview.year}</div>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-panel-logo">
            <Logo size="sm" company="MAGVIEW" />
          </div>
          {children}
          <p className="auth-legal">
            Private workspace · {new Date().getFullYear()} · Urenregistratie
          </p>
        </div>
      </section>
    </div>
  );
}
