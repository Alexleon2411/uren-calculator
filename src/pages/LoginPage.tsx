import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, LockKeyhole, UserRound } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { AuthLayout } from '../components/AuthLayout';

function homeFromToday(today: string): string {
  const date = new Date(`${today}T00:00:00Z`);
  return `/month/${date.getUTCFullYear()}/${date.getUTCMonth() + 1}`;
}

export function LoginPage() {
  const { user, needsSetup, apply, today } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (needsSetup) return <Navigate to="/setup" replace />;
  if (user) return <Navigate to={homeFromToday(today)} replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.login(username.trim(), password);
      apply(data);
      navigate(homeFromToday(data.today), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Time registration"
      headline={<>Every hour,<br />in its place.</>}
      lead="Log the work you did, mark the days you were away, and hand your manager a clean report at the end of the month."
    >
      <div className="auth-form-head">
        <span className="eyebrow">Welcome back</span>
        <h2>Sign in to Uren</h2>
        <p>Use your own account. Managers get read-only access.</p>
      </div>

      <form className="auth-form" onSubmit={(event) => void onSubmit(event)}>
        <label className="field">
          <span className="field-label">Username</span>
          <span className="input-wrap">
            <UserRound size={16} className="input-icon" />
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="your.name"
              required
              autoFocus
            />
          </span>
        </label>

        <label className="field">
          <span className="field-label">Password</span>
          <span className="input-wrap">
            <LockKeyhole size={16} className="input-icon" />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          </span>
        </label>

        {error && <div className="form-error" role="alert">{error}</div>}

        <button type="submit" className="btn btn-primary btn-wide" disabled={loading}>
          {loading ? <span className="spinner spinner-light" /> : <>Sign in <ArrowRight size={17} /></>}
        </button>
      </form>

      <div className="auth-hint">
        <strong>No account yet?</strong>
        <span>Ask the workspace owner to add you, or use the read-only link they shared.</span>
      </div>
    </AuthLayout>
  );
}
