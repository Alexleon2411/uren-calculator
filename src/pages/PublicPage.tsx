import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, Eye, RefreshCw } from 'lucide-react';
import { api, ApiError, publicExportUrl, startDownload } from '../api';
import { Logo } from '../components/Logo';
import { MonthView } from '../components/MonthView';
import type { MonthData, PublicBootstrap } from '../types';
import { clampMonth, currentYearMonth, formatDateMedium } from '../dates';

export function PublicPage() {
  const { token = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [boot, setBoot] = useState<PublicBootstrap | null>(null);
  const [monthKey, setMonthKey] = useState<{ year: number; month: number } | null>(null);
  const [data, setData] = useState<MonthData | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const initialised = useRef('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const publicBoot = await api.publicBootstrap(token);
        if (!active) return;
        setBoot(publicBoot);
        const qYear = Number(new URLSearchParams(window.location.search).get('year'));
        const qMonth = Number(new URLSearchParams(window.location.search).get('month'));
        const valid = Number.isInteger(qYear) && qYear >= 2000 && qYear <= 2100
          && Number.isInteger(qMonth) && qMonth >= 1 && qMonth <= 12;
        const today = new Date(`${publicBoot.today}T00:00:00Z`);
        setMonthKey(valid
          ? { year: qYear, month: qMonth }
          : { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 });
        if (!valid) {
          setSearchParams({
            year: String(today.getUTCFullYear()),
            month: String(today.getUTCMonth() + 1),
          }, { replace: true });
        }
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) setInvalid(true);
        else setError(err instanceof Error ? err.message : 'Could not open this report.');
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // The month is read from the URL once; navigation updates monthKey below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!boot) return;
    const year = Number(searchParams.get('year'));
    const month = Number(searchParams.get('month'));
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return;
    if (!Number.isInteger(month) || month < 1 || month > 12) return;
    setMonthKey((current) => (
      current && current.year === year && current.month === month
        ? current
        : { year, month }
    ));
  }, [searchParams, boot]);

  const loadMonth = useCallback(async () => {
    if (!monthKey) return;
    setLoading(true);
    setError(null);
    try {
      const month = await api.publicMonth(token, monthKey.year, monthKey.month);
      setData(month);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setInvalid(true);
      else setError(err instanceof Error ? err.message : 'Could not load this month.');
    } finally {
      setLoading(false);
    }
  }, [token, monthKey?.year, monthKey?.month]);

  useEffect(() => {
    void loadMonth();
  }, [loadMonth]);

  useEffect(() => {
    if (!data) return;
    const key = `${data.year}-${data.month}`;
    if (initialised.current === key) return;
    initialised.current = key;
    const requested = searchParams.get('date');
    const prefix = `${data.year}-${String(data.month).padStart(2, '0')}-`;
    if (requested && requested.startsWith(prefix)) {
      setSelectedDate(requested);
    } else if (data.isCurrentMonth) {
      setSelectedDate(data.today);
    } else {
      const recorded = Object.keys(data.days).sort();
      setSelectedDate(recorded[0] || `${prefix}01`);
    }
    document.title = `${data.monthName} ${data.year} · Uren report`;
  }, [data, searchParams]);

  useEffect(() => {
    if (!data) return;
    const requested = searchParams.get('date');
    if (!requested) return;
    const prefix = `${data.year}-${String(data.month).padStart(2, '0')}-`;
    if (requested.startsWith(prefix) && requested.length === 10) {
      setSelectedDate(requested);
    }
  }, [searchParams, data]);

  if (invalid) {
    return (
      <div className="public-invalid">
        <Logo size="lg" />
        <div className="invalid-card">
          <Eye size={22} />
          <h1>This link is not available</h1>
          <p>The share link may have been disabled or replaced. Ask the workspace owner for a new link.</p>
          <Link to="/login" className="btn btn-primary">Go to sign in</Link>
        </div>
      </div>
    );
  }

  if (!invalid && !error && (!boot || !data)) {
    return (
      <div className="boot-screen">
        <Logo size="lg" />
        <div className="boot-line"><span className="spinner" /> Loading shared report…</div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="boot-screen">
        <Logo size="lg" />
        <div className="boot-error">
          <strong>Could not load the report</strong>
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => void loadMonth()}>
            <RefreshCw size={15} /> Try again
          </button>
        </div>
      </div>
    );
  }

  if (!data || !boot) return null;

  const prefix = `${data.year}-${String(data.month).padStart(2, '0')}-`;
  const effectiveSelected = selectedDate.startsWith(prefix) ? selectedDate : `${prefix}01`;

  const setMonth = (year: number, month: number, date?: string) => {
    const params: Record<string, string> = { year: String(year), month: String(month) };
    if (date) params.date = date;
    setSearchParams(params);
    setData(null);
    setMonthKey({ year, month });
    initialised.current = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goMonth = (delta: number) => {
    const next = clampMonth(data.year, data.month + delta);
    setMonth(next.year, next.month);
  };

  const goToday = () => {
    const now = currentYearMonth();
    setMonth(now.year, now.month, data.today);
  };

  const selectDate = (date: string) => {
    setSelectedDate(date);
    const next = new URLSearchParams(searchParams);
    next.set('date', date);
    next.set('year', String(data.year));
    next.set('month', String(data.month));
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="public-shell">
      <header className="public-header">
        <div className="public-header-inner">
          <Logo company={data.workspace.company || 'MAGVIEW'} />
          <div className="public-status">
            <span className="role-pill"><Eye size={12} /> Read-only</span>
            <span className="public-share-meta">
              Shared by <strong>{data.workspace.profileName}</strong>
              <span className="dot-sep">·</span>
              {formatDateMedium(data.today)}
            </span>
          </div>
        </div>
      </header>

      <main className="public-main">
        <MonthView
          data={data}
          selectedDate={effectiveSelected}
          readOnly
          publicMode
          onSelect={selectDate}
          onNavigateMonth={goMonth}
          onToday={goToday}
          onExport={(kind) => {
            startDownload(publicExportUrl(token, kind, data.year, data.month));
          }}
          onMonth={() => undefined}
        />
      </main>

      <footer className="public-footer">
        <span>{data.workspace.company} · Urenregistratie</span>
        <span>Read-only link. Ask {data.workspace.profileName || 'the owner'} if you need changes.</span>
      </footer>
    </div>
  );
}
