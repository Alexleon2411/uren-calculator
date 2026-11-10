import { useEffect, useState } from 'react';
import {
  AlertCircle, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight,
  ChevronsRight, Download, FileSpreadsheet, FileText, RefreshCw,
} from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, exportUrl, startDownload } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../toast';
import type { YearData } from '../types';
import {
  MONTHS_SHORT, currentYearMonth, formatHours, monthPath, signedHours, yearPath,
} from '../dates';

export function YearPage() {
  const { year: yearParam } = useParams();
  const year = Number(yearParam);
  const validRoute = Number.isInteger(year) && year >= 2000 && year <= 2100;
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState<YearData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!validRoute) return;
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const result = await api.year(year);
        if (active) setData(result);
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) {
          await refresh();
          navigate('/login', { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : 'Could not load this year.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [year, validRoute, refresh, navigate]);

  useEffect(() => {
    document.title = `Year ${year} · Uren`;
  }, [year]);

  if (!validRoute) {
    return <Navigate to={yearPath(currentYearMonth().year)} replace />;
  }

  const goYear = (delta: number) => {
    navigate(yearPath(year + delta));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const now = currentYearMonth();

  if (loading && !data) {
    return (
      <div className="year-page page-enter">
        <header className="page-head">
          <div className="page-title">
            <span className="eyebrow">Year overview</span>
            <h1>{year}<span className="title-year">overview</span></h1>
          </div>
        </header>
        <div className="page-loader"><span className="spinner" /> Loading year…</div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="year-page page-enter">
        <div className="page-error">
          <AlertCircle size={22} />
          <h2>Could not load {year}</h2>
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            <RefreshCw size={15} /> Reload
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const totals = data.totals;
  const maxValue = Math.max(
    40,
    ...data.months.map((month) => Math.max(month.loggedHours, month.targetHours)),
  );
  const scaleMax = Math.ceil(maxValue / 40) * 40;
  const percent = totals.targetHours > 0
    ? Math.min(100, Math.round((totals.loggedHours / totals.targetHours) * 100))
    : 0;
  const currentMonth = data.months.find((month) => month.isCurrent);

  return (
    <div className="year-page page-enter">
      <header className="page-head">
        <div className="page-title">
          <span className="eyebrow">{data.workspace.company} · Year overview</span>
          <h1>
            {year}
            <span className="title-year">in hours</span>
          </h1>
          <p>
            {data.workspace.profileName}
            <span className="dot-sep">·</span>
            {totals.recordedWorkdays} of {totals.expectedWorkdays} workdays recorded
          </p>
        </div>
        <div className="page-actions">
          <div className="month-nav">
            <button type="button" className="icon-btn" onClick={() => goYear(-1)} aria-label="Previous year">
              <ChevronLeft size={18} />
            </button>
            <button type="button" className="today-btn" onClick={() => navigate(yearPath(now.year))}>
              <RefreshCw size={13} /> {now.year}
            </button>
            <button type="button" className="icon-btn" onClick={() => goYear(1)} aria-label="Next year">
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="export-group">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                startDownload(exportUrl('xlsx', year));
                toast.notify('Year Excel download started.', 'info');
              }}
            >
              <FileSpreadsheet size={16} /> Excel <Download size={13} className="download-hint" />
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                startDownload(exportUrl('pdf', year));
                toast.notify('Year PDF download started.', 'info');
              }}
            >
              <FileText size={16} /> PDF <Download size={13} className="download-hint" />
            </button>
          </div>
        </div>
      </header>

      <section className="year-hero">
        <div className="year-hero-main">
          <span className="eyebrow light">Hours logged in {year}</span>
          <div className="year-big">{formatHours(totals.loggedHours)}<span>h</span></div>
          <p>of {formatHours(totals.targetHours)} h planned</p>
          <div className="progress progress-light" aria-hidden="true">
            <span style={{ width: `${percent}%` }} />
          </div>
          {currentMonth && (
            <span className="year-current-note">
              {currentMonth.monthName} is the current month · {currentMonth.recordedWorkdays} of {currentMonth.expectedWorkdays} workdays recorded
            </span>
          )}
        </div>
        <div className="year-hero-stats">
          <div className="year-mini">
            <span className="eyebrow light">Balance to date</span>
            <strong className={totals.balanceToDate >= 0 ? 'positive' : 'negative'}>
              {signedHours(totals.balanceToDate)}<small>h</small>
            </strong>
          </div>
          <div className="year-mini">
            <span className="eyebrow light">Workdays</span>
            <strong>{totals.recordedWorkdays}<small>/ {totals.expectedWorkdays}</small></strong>
          </div>
          <div className="year-mini">
            <span className="eyebrow light">Leave</span>
            <strong>{totals.leaveDays}<small>days</small></strong>
          </div>
          <div className="year-mini">
            <span className="eyebrow light">To complete</span>
            <strong>{totals.missingDays + totals.undescribedDays}<small>days</small></strong>
          </div>
        </div>
      </section>

      <section className="card chart-card">
        <div className="card-head">
          <div>
            <h2>Hours by month</h2>
            <p>The solid bar is logged. The dashed line is the month’s planned hours.</p>
          </div>
          <span className="chart-legend"><i className="chart-swatch" /> Logged <i className="chart-dash" /> Planned</span>
        </div>
        <div className="year-chart">
          <div className="chart-axis" aria-hidden="true">
            <span>{scaleMax} h</span>
            <span>{Math.round(scaleMax / 2)} h</span>
            <span>0 h</span>
          </div>
          <div className="chart-cols">
            {data.months.map((month, index) => {
              const height = scaleMax > 0 ? (month.loggedHours / scaleMax) * 100 : 0;
              const targetLine = scaleMax > 0 ? (month.targetHours / scaleMax) * 100 : 0;
              return (
                <button
                  type="button"
                  key={month.month}
                  className={`chart-col${month.isCurrent ? ' is-current' : ''}${month.isFuture ? ' is-future' : ''}`}
                  onClick={() => navigate(monthPath(year, month.month))}
                  aria-label={`${month.monthName}: ${formatHours(month.loggedHours)} hours logged, ${formatHours(month.targetHours)} planned`}
                >
                  <span className="bar-value">{month.loggedHours ? formatHours(month.loggedHours) : '–'}</span>
                  <span className="bar-track">
                    <span className="bar-target" style={{ bottom: `${targetLine}%` }} />
                    <span className="bar-fill" style={{ height: `${height}%` }} />
                  </span>
                  <span className="bar-month">{MONTHS_SHORT[index]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="card year-table-card">
        <div className="card-head">
          <div>
            <h2>Month by month</h2>
            <p>Open a month to see or edit the daily entries.</p>
          </div>
          <span className="table-hint"><CalendarDays size={14} /> Click any row</span>
        </div>
        <div className="table-scroll">
          <table className="year-table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Hours</th>
                <th className="num">Planned</th>
                <th className="num">Balance</th>
                <th className="num">Workdays</th>
                <th className="num">Leave</th>
                <th className="num">Missing</th>
                <th className="num">No desc.</th>
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {data.months.map((month) => (
                <tr
                  key={month.month}
                  className={`${month.isCurrent ? 'is-current' : ''}${month.isFuture ? ' is-future' : ''}`}
                  onClick={() => navigate(monthPath(year, month.month))}
                  tabIndex={0}
                  role="link"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(monthPath(year, month.month));
                    }
                  }}
                >
                  <td>
                    <span className="month-cell">
                      <span className="month-dot" data-current={month.isCurrent || undefined} />
                      {month.monthName}
                      {month.isCurrent && <span className="current-tag">Current</span>}
                    </span>
                  </td>
                  <td className="num strong">{formatHours(month.loggedHours)} h</td>
                  <td className="num muted">{formatHours(month.targetHours)} h</td>
                  <td className={`num ${month.balanceToDate >= 0 ? 'positive' : 'negative'}`}>
                    {signedHours(month.balanceToDate)} h
                  </td>
                  <td className="num">{month.recordedWorkdays} / {month.expectedWorkdays}</td>
                  <td className="num">{month.leaveDays}</td>
                  <td className={`num ${month.missingDays ? 'attention' : ''}`}>{month.missingDays}</td>
                  <td className={`num ${month.undescribedDays ? 'attention' : ''}`}>{month.undescribedDays}</td>
                  <td className="row-arrow"><ChevronsRight size={15} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total {year}</td>
                <td className="num">{formatHours(totals.loggedHours)} h</td>
                <td className="num">{formatHours(totals.targetHours)} h</td>
                <td className={`num ${totals.balanceToDate >= 0 ? 'positive' : 'negative'}`}>
                  {signedHours(totals.balanceToDate)} h
                </td>
                <td className="num">{totals.recordedWorkdays} / {totals.expectedWorkdays}</td>
                <td className="num">{totals.leaveDays}</td>
                <td className="num">{totals.missingDays}</td>
                <td className="num">{totals.undescribedDays}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <p className="year-footnote">
        <ArrowUpRight size={14} />
        The year Excel contains one sheet per month plus an overview. The PDF includes every monthly report.
      </p>
    </div>
  );
}
