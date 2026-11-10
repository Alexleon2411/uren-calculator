import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { api, ApiError, exportUrl, startDownload } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../toast';
import { MonthView } from '../components/MonthView';
import type { MonthData } from '../types';
import { MONTHS, clampMonth, currentYearMonth, monthPath } from '../dates';

function parseRoute(yearParam?: string, monthParam?: string): { year: number; month: number } | null {
  const year = Number(yearParam);
  const month = Number(monthParam);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

export function MonthPage() {
  const { year: yearParam, month: monthParam } = useParams();
  const route = parseRoute(yearParam, monthParam);
  const { user, refresh, today } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<MonthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const initialised = useRef<string>('');

  const load = useCallback(async () => {
    if (!route) return;
    setLoading(true);
    setError(null);
    try {
      const month = await api.month(route.year, route.month);
      setData(month);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await refresh();
        navigate('/login', { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : 'Could not load this month.');
    } finally {
      setLoading(false);
    }
  }, [route?.year, route?.month, refresh, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    const key = `${data.year}-${data.month}`;
    if (initialised.current === key) return;
    initialised.current = key;
    const requested = searchParams.get('date');
    const first = `${data.year}-${String(data.month).padStart(2, '0')}-01`;
    const lastDate = new Date(Date.UTC(data.year, data.month, 0)).getUTCDate();
    const last = `${data.year}-${String(data.month).padStart(2, '0')}-${String(lastDate).padStart(2, '0')}`;
    if (requested && requested >= first && requested <= last) {
      setSelectedDate(requested);
    } else if (data.isCurrentMonth) {
      setSelectedDate(data.today);
    } else {
      const recorded = Object.keys(data.days).sort();
      setSelectedDate(recorded[0] || first);
    }
    document.title = `${data.monthName} ${data.year} · Uren`;
  }, [data, searchParams]);

  useEffect(() => {
    if (data) document.title = `${data.monthName} ${data.year} · Uren`;
  }, [data]);

  useEffect(() => {
    if (!data) return;
    const requested = searchParams.get('date');
    if (!requested) return;
    const prefix = `${data.year}-${String(data.month).padStart(2, '0')}-`;
    if (requested.startsWith(prefix) && requested.length === 10) {
      setSelectedDate(requested);
    }
  }, [searchParams, data]);

  if (!route) {
    return <Navigate to={monthPath(currentYearMonth().year, currentYearMonth().month)} replace />;
  }

  const goMonth = (delta: number) => {
    if (!data) return;
    const next = clampMonth(data.year, data.month + delta);
    navigate(monthPath(next.year, next.month));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const selectDate = (date: string) => {
    setSelectedDate(date);
    const next = new URLSearchParams(searchParams);
    next.set('date', date);
    setSearchParams(next, { replace: true });
  };

  const goToday = () => {
    const now = currentYearMonth();
    const date = today || data?.today || `${now.year}-${String(now.month).padStart(2, '0')}-01`;
    if (data && data.year === now.year && data.month === now.month) {
      selectDate(date);
      return;
    }
    navigate(`${monthPath(now.year, now.month)}?date=${date}`);
  };

  const onMonth = (month: MonthData) => {
    setData(month);
  };

  if (loading && !data) {
    return (
      <div className="month-page page-enter">
        <header className="page-head month-head">
          <div className="page-title">
            <span className="eyebrow">Loading</span>
            <h1>{MONTHS[route.month - 1]}<span className="title-year">{route.year}</span></h1>
          </div>
        </header>
        <div className="page-loader">
          <span className="spinner" />
          Loading month…
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="month-page page-enter">
        <div className="page-error">
          <AlertCircle size={22} />
          <h2>Could not load this month</h2>
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => void load()}>
            <RefreshCw size={15} /> Try again
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const monthPrefix = `${data.year}-${String(data.month).padStart(2, '0')}-`;
  const effectiveSelected = selectedDate.startsWith(monthPrefix)
    ? selectedDate
    : data.isCurrentMonth
      ? data.today
      : `${monthPrefix}01`;

  return (
    <>
      {error && (
        <div className="app-alert" role="alert">
          <AlertCircle size={15} /> {error}
          <button type="button" onClick={() => void load()}>Retry</button>
        </div>
      )}
      <MonthView
        data={data}
        selectedDate={effectiveSelected}
        readOnly={user?.role !== 'admin'}
        onSelect={selectDate}
        onNavigateMonth={goMonth}
        onToday={goToday}
        onExport={(kind) => {
          startDownload(exportUrl(kind, data.year, data.month));
          toast.notify(`${kind === 'xlsx' ? 'Excel' : 'PDF'} download started.`, 'info');
        }}
        onMonth={onMonth}
      />
    </>
  );
}
