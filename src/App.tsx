import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { AppShell } from './components/AppShell';
import { Logo } from './components/Logo';
import { LoginPage } from './pages/LoginPage';
import { SetupPage } from './pages/SetupPage';
import { MonthPage } from './pages/MonthPage';
import { YearPage } from './pages/YearPage';
import { SettingsPage } from './pages/SettingsPage';
import { PublicPage } from './pages/PublicPage';

function Protected() {
  const { user, needsSetup, loading, homePath } = useAuth();
  if (loading) {
    return (
      <div className="boot-screen">
        <Logo size="lg" />
        <div className="boot-line"><span className="spinner" /> Loading…</div>
      </div>
    );
  }
  if (needsSetup) return <Navigate to="/setup" replace />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function RootRedirect() {
  const { user, needsSetup, homePath } = useAuth();
  if (needsSetup) return <Navigate to="/setup" replace />;
  return <Navigate to={user ? homePath : '/login'} replace />;
}

function NotFound() {
  const { user, needsSetup } = useAuth();
  return (
    <div className="not-found">
      <Logo size="lg" />
      <h1>Page not found</h1>
      <p>The address you followed does not exist.</p>
      <a className="btn btn-primary" href={needsSetup ? '/setup' : user ? '/' : '/login'}>
        Go back
      </a>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/share/:token" element={<PublicPage />} />

      <Route element={<Protected />}>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/month/:year/:month" element={<MonthPage />} />
        <Route path="/year/:year" element={<YearPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
