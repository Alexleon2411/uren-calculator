import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, LockKeyhole, UserRound } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { AuthLayout } from '../components/AuthLayout';
import { MONTHS } from '../dates';

function homeFromToday(today: string): string {
  const date = new Date(`${today}T00:00:00Z`);
  return `/month/${date.getUTCFullYear()}/${date.getUTCMonth() + 1}`;
}

function rangeLabel(first: string | null, last: string | null): string {
  if (!first || !last) return 'No history imported yet';
  const firstDate = new Date(`${first}T00:00:00Z`);
  const lastDate = new Date(`${last}T00:00:00Z`);
  return `${MONTHS[firstDate.getUTCMonth()]} ${firstDate.getUTCFullYear()} → ${MONTHS[lastDate.getUTCMonth()]} ${lastDate.getUTCFullYear()}`;
}

export function SetupPage() {
  const { user, needsSetup, apply, stats, today } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [company, setCompany] = useState('MAGVIEW');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!needsSetup && !user) return <Navigate to="/login" replace />;
  if (user) return <Navigate to={homeFromToday(today)} replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('The passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Use at least 8 characters for the password.');
      return;
    }
    setLoading(true);
    try {
      const data = await api.setup({
        displayName: displayName.trim(),
        company: company.trim(),
        username: username.trim(),
        password,
      });
      apply(data);
      navigate(homeFromToday(data.today), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the workspace.');
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="First run"
      headline={<>Your log,<br />ready to begin.</>}
      lead="Your Excel history has already been imported. Create the owner account and keep registering from today onwards — no more monthly files."
    >
      <div className="auth-form-head">
        <span className="eyebrow">Set up Uren</span>
        <h2>Create the owner account</h2>
        <p>This account can edit hours, invite your manager and export reports.</p>
      </div>

      <div className="import-note">
        <div>
          <strong>{stats.days ? `${stats.days} days imported` : 'Clean workspace'}</strong>
          <span>{stats.days ? rangeLabel(stats.firstDate, stats.lastDate) : 'No history imported yet — start with an empty log.'}</span>
        </div>
        {stats.days > 0 && <span className="import-badge">History ready</span>}
      </div>

      <form className="auth-form" onSubmit={(event) => void onSubmit(event)}>
        <div className="field-row">
          <label className="field">
            <span className="field-label">Your name</span>
            <span className="input-wrap">
              <UserRound size={16} className="input-icon" />
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Alejandro León"
                autoComplete="name"
                required
                autoFocus
              />
            </span>
          </label>
          <label className="field">
            <span className="field-label">Company / label</span>
            <span className="input-wrap">
              <Building2 size={16} className="input-icon" />
              <input
                type="text"
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                placeholder="MAGVIEW"
                required
              />
            </span>
          </label>
        </div>

        <label className="field">
          <span className="field-label">Username</span>
          <span className="input-wrap">
            <UserRound size={16} className="input-icon" />
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="alejandro"
              autoComplete="username"
              pattern="[a-zA-Z0-9._-]{3,32}"
              title="3–32 characters: letters, numbers, dot, dash or underscore"
              required
            />
          </span>
        </label>

        <div className="field-row">
          <label className="field">
            <span className="field-label">Password</span>
            <span className="input-wrap">
              <LockKeyhole size={16} className="input-icon" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                minLength={8}
                required
              />
            </span>
          </label>
          <label className="field">
            <span className="field-label">Confirm password</span>
            <span className="input-wrap">
              <LockKeyhole size={16} className="input-icon" />
              <input
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                placeholder="Repeat password"
                minLength={8}
                required
              />
            </span>
          </label>
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}

        <button type="submit" className="btn btn-primary btn-wide" disabled={loading}>
          {loading ? <span className="spinner spinner-light" /> : <>Create workspace <ArrowRight size={17} /></>}
        </button>
      </form>

      <div className="auth-hint">
        <strong>Already have an account?</strong>
        <a href="/login">Go to sign in</a>
      </div>
    </AuthLayout>
  );
}
