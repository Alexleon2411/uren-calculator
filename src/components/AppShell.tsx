import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { CalendarDays, ChartNoAxesColumn, LogOut, Settings2 } from 'lucide-react';
import { useAuth } from '../auth';
import { currentYearMonth, monthPath, yearPath } from '../dates';
import { Logo } from './Logo';

export function AppShell({ children }: { children: ReactNode }) {
  const { user, workspace, logout, homePath } = useAuth();
  const navigate = useNavigate();
  const now = currentYearMonth();

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <NavLink to={homePath} className="brand-link" aria-label="Uren home">
            <Logo company={workspace?.company || 'MAGVIEW'} />
          </NavLink>

          <nav className="main-nav" aria-label="Main">
            <NavLink
              to={homePath}
              className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
              end={false}
            >
              <CalendarDays size={16} />
              <span>Month</span>
            </NavLink>
            <NavLink
              to={yearPath(now.year)}
              className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
            >
              <ChartNoAxesColumn size={16} />
              <span>Year</span>
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
            >
              <Settings2 size={16} />
              <span>Settings</span>
            </NavLink>
          </nav>

          <div className="user-area">
            {user?.role === 'viewer' && <span className="role-pill">Read-only</span>}
            <div className="user-chip" title={user?.username}>
              <span className="avatar">{user?.displayName?.slice(0, 1).toUpperCase() || 'U'}</span>
              <span className="user-meta">
                <strong>{user?.displayName}</strong>
                <small>{user?.role === 'admin' ? 'Owner' : 'Viewer'}</small>
              </span>
            </div>
            <button type="button" className="icon-btn logout-btn" onClick={() => void onLogout()} aria-label="Sign out" title="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>
      <main className="app-main">{children}</main>
      <footer className="app-footer">
        <span>{workspace?.company || 'MAGVIEW'} · Urenregistratie</span>
        <span>Time kept honestly, hour by hour.</span>
      </footer>
    </div>
  );
}
