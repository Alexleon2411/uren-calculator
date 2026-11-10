import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle, Check, Copy, Database, Eye, EyeOff, KeyRound, Link2,
  Plus, RefreshCw, ShieldCheck, Trash2, UserPlus, Users, UserX,
} from 'lucide-react';
import { api, ApiError, startDownload } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../toast';
import { Modal } from '../components/Modal';
import type { SettingsPayload, User } from '../types';
import { formatDateShort } from '../dates';

const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const input = document.createElement('textarea');
  input.value = text;
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
  return Promise.resolve();
}

function PasswordForm() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError('The new passwords do not match.');
      return;
    }
    if (next.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    setSaving(true);
    try {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.notify('Password updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="stack-form" onSubmit={(event) => void onSubmit(event)}>
      <label className="field">
        <span className="field-label">Current password</span>
        <input
          type="password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span className="field-label">New password</span>
          <span className="password-wrap">
            <input
              type={show ? 'text' : 'password'}
              value={next}
              onChange={(event) => setNext(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <button type="button" className="input-action" onClick={() => setShow((value) => !value)} aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </span>
        </label>
        <label className="field">
          <span className="field-label">Confirm new password</span>
          <input
            type={show ? 'text' : 'password'}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? <span className="spinner spinner-light" /> : <KeyRound size={15} />}
          Update password
        </button>
      </div>
    </form>
  );
}

function AccountModal({
  mode, user, onClose, onDone,
}: {
  mode: 'add' | 'reset';
  user?: User;
  onClose: () => void;
  onDone: (users: User[], message: string) => void;
}) {
  const toast = useToast();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [username, setUsername] = useState(user?.username || '');
  const [role, setRole] = useState<'admin' | 'viewer'>(user?.role || 'viewer');
  const [password, setPassword] = useState(() => generatePassword());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (mode === 'add') {
        const result = await api.createUser({
          displayName: displayName.trim(),
          username: username.trim(),
          password,
          role,
        });
        onDone(result.users, 'Account created.');
      } else if (user) {
        const result = await api.updateUser(user.id, { password });
        onDone(result.users, 'Password reset.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the account.');
    } finally {
      setSaving(false);
    }
  };

  const copyPassword = async () => {
    await copyText(password);
    setCopied(true);
    toast.notify('Password copied to clipboard.', 'info');
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Modal
      title={mode === 'add' ? 'Add account' : `Reset password for ${user?.displayName}`}
      subtitle={mode === 'add'
        ? 'Create access for a manager or a colleague.'
        : 'The old password stops working immediately and any active session is signed out.'}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="account-form" className="btn btn-primary" disabled={saving}>
            {saving ? <span className="spinner spinner-light" /> : mode === 'add' ? <UserPlus size={15} /> : <KeyRound size={15} />}
            {mode === 'add' ? 'Create account' : 'Save password'}
          </button>
        </>
      )}
    >
      <form id="account-form" className="stack-form" onSubmit={(event) => void submit(event)}>
        {mode === 'add' && (
          <>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Manager name"
                  required
                  autoFocus
                />
              </label>
              <label className="field">
                <span className="field-label">Username</span>
                <input
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="manager"
                  pattern="[a-zA-Z0-9._-]{3,32}"
                  title="3–32 characters: letters, numbers, dot, dash or underscore"
                  required
                />
              </label>
            </div>
            <label className="field">
              <span className="field-label">Role</span>
              <select value={role} onChange={(event) => setRole(event.target.value as 'admin' | 'viewer')}>
                <option value="viewer">Viewer — can see and download, cannot edit</option>
                <option value="admin">Owner — full access</option>
              </select>
            </label>
          </>
        )}

        <label className="field">
          <span className="field-label">Password</span>
          <span className="password-row">
            <input type="text" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
            <button type="button" className="btn btn-outline btn-small" onClick={() => setPassword(generatePassword())}>
              <RefreshCw size={13} /> Generate
            </button>
            <button type="button" className="btn btn-outline btn-small" onClick={() => void copyPassword()}>
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </span>
        </label>
        <p className="field-hint">Share the username and this password with the person. They can change it later in Settings.</p>

        {error && <div className="form-error" role="alert">{error}</div>}
      </form>
    </Modal>
  );
}

export function SettingsPage() {
  const { user, workspace, stats, refresh } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(isAdmin);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profileName, setProfileName] = useState('');
  const [company, setCompany] = useState('');
  const [dailyHours, setDailyHours] = useState('8');
  const [workdays, setWorkdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [accountModal, setAccountModal] = useState<{ mode: 'add' | 'reset'; user?: User } | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [confirmShare, setConfirmShare] = useState<'rotate' | 'disable' | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [lanChoice, setLanChoice] = useState('');

  const load = async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const payload = await api.settings();
      setData(payload);
      setProfileName(payload.settings.profileName);
      setCompany(payload.settings.company);
      setDailyHours(String(payload.settings.dailyHours));
      setWorkdays(payload.settings.workdays);
      setLanChoice(payload.lanAddresses[0]?.url || '');
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setLoadError('You do not have access to the workspace settings.');
      } else {
        setLoadError(err instanceof Error ? err.message : 'Could not load settings.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    document.title = 'Settings · Uren';
  }, []);

  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  const selectedLan = data?.lanAddresses.find((item) => item.url === lanChoice)
    || data?.lanAddresses[0];

  const shareUrl = useMemo(() => {
    if (!data?.settings.shareToken) return '';
    const base = (data.publicUrl
      || (isLocalHost ? selectedLan?.url : '')
      || window.location.origin).replace(/\/+$/, '');
    return `${base}/share/${data.settings.shareToken}`;
  }, [data?.settings.shareToken, data?.publicUrl, selectedLan?.url, isLocalHost]);

  const shareContext = useMemo(() => {
    if (!data) return '';
    if (data.publicUrl) return 'Using the public URL configured on the server.';
    if (isLocalHost && selectedLan) {
      return `Using ${selectedLan.name} (${selectedLan.address}). Your manager must be on the same network — or set PUBLIC_URL when hosting it on the internet.`;
    }
    if (isLocalHost) {
      return 'This link only works on this computer. Open the app through your network IP, or set PUBLIC_URL when hosting it.';
    }
    return 'Using the address in your browser.';
  }, [data?.publicUrl, isLocalHost, selectedLan?.name, selectedLan?.address]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setProfileError(null);
    setSavingProfile(true);
    try {
      const hours = Number(String(dailyHours).replace(',', '.'));
      const result = await api.saveSettings({
        profileName: profileName.trim(),
        company: company.trim(),
        dailyHours: hours,
        workdays,
      });
      setData((current) => (current
        ? { ...current, settings: { ...current.settings, ...result.settings } }
        : current));
      await refresh();
      toast.notify('Workspace settings saved.');
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not save the settings.');
    } finally {
      setSavingProfile(false);
    }
  };

  const toggleWorkday = (day: number) => {
    setWorkdays((current) => (
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort()
    ));
  };

  const createShare = async () => {
    setShareBusy(true);
    try {
      const result = await api.createShare();
      setData((current) => (current
        ? { ...current, settings: { ...current.settings, shareToken: result.shareToken, shareEnabled: true } }
        : current));
      await refresh();
      setConfirmShare(null);
      toast.notify('Read-only link created.');
    } catch (err) {
      toast.notify(err instanceof Error ? err.message : 'Could not create the link.', 'error');
    } finally {
      setShareBusy(false);
    }
  };

  const disableShare = async () => {
    setShareBusy(true);
    try {
      await api.disableShare();
      setData((current) => (current
        ? { ...current, settings: { ...current.settings, shareToken: '', shareEnabled: false } }
        : current));
      await refresh();
      setConfirmShare(null);
      toast.notify('The read-only link was disabled.', 'info');
    } catch (err) {
      toast.notify(err instanceof Error ? err.message : 'Could not disable the link.', 'error');
    } finally {
      setShareBusy(false);
    }
  };

  const copyShare = async () => {
    await copyText(shareUrl);
    toast.notify('Link copied to clipboard.', 'info');
  };

  const updateUsers = (users: User[], message?: string) => {
    setData((current) => (current ? { ...current, users } : current));
    setAccountModal(null);
    setDeleteUser(null);
    if (message) toast.notify(message);
  };

  const toggleActive = async (target: User) => {
    try {
      const result = await api.updateUser(target.id, { active: !target.active });
      updateUsers(result.users, target.active ? 'Account deactivated.' : 'Account reactivated.');
    } catch (err) {
      toast.notify(err instanceof Error ? err.message : 'Could not update the account.', 'error');
    }
  };

  const changeRole = async (target: User, role: 'admin' | 'viewer') => {
    try {
      const result = await api.updateUser(target.id, { role });
      updateUsers(result.users, 'Role updated.');
    } catch (err) {
      toast.notify(err instanceof Error ? err.message : 'Could not change the role.', 'error');
    }
  };

  const removeAccount = async () => {
    if (!deleteUser) return;
    try {
      const result = await api.deleteUser(deleteUser.id);
      updateUsers(result.users, 'Account deleted.');
    } catch (err) {
      toast.notify(err instanceof Error ? err.message : 'Could not delete the account.', 'error');
    }
  };

  const statsRange = data?.stats ?? stats;
  const range = statsRange.firstDate && statsRange.lastDate
    ? `${formatDateShort(statsRange.firstDate)} → ${formatDateShort(statsRange.lastDate)}`
    : 'No data yet';

  return (
    <div className="settings-page page-enter">
      <header className="page-head">
        <div className="page-title">
          <span className="eyebrow">Workspace</span>
          <h1>Settings</h1>
          <p>{isAdmin ? 'Your profile, reports, accounts and access.' : 'Your account and access.'}</p>
        </div>
      </header>

      {!isAdmin && (
        <div className="viewer-banner">
          <ShieldCheck size={18} />
          <div>
            <strong>You have read-only access</strong>
            <span>You can browse every month and download the Excel or PDF reports. Editing is reserved for the workspace owner.</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="page-loader"><span className="spinner" /> Loading settings…</div>
      ) : loadError ? (
        <div className="page-error inline">
          <AlertCircle size={20} />
          <p>{loadError}</p>
          <button type="button" className="btn btn-outline" onClick={() => void load()}>Try again</button>
        </div>
      ) : (
        <div className="settings-layout">
          <div className="settings-main">
            {isAdmin && data && (
              <>
                <section className="card settings-card">
                  <div className="card-head">
                    <div>
                      <h2>Workspace profile</h2>
                      <p>These details appear in the app and in every report.</p>
                    </div>
                    <span className="card-icon"><Users size={18} /></span>
                  </div>
                  <form className="stack-form" onSubmit={(event) => void saveProfile(event)}>
                    <div className="field-row">
                      <label className="field">
                        <span className="field-label">Employee name</span>
                        <input
                          type="text"
                          value={profileName}
                          onChange={(event) => setProfileName(event.target.value)}
                          required
                        />
                      </label>
                      <label className="field">
                        <span className="field-label">Company / report label</span>
                        <input
                          type="text"
                          value={company}
                          onChange={(event) => setCompany(event.target.value)}
                          required
                        />
                      </label>
                    </div>
                    <div className="field-row compact">
                      <label className="field field-small">
                        <span className="field-label">Hours per working day</span>
                        <span className="input-suffix">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={dailyHours}
                            onChange={(event) => setDailyHours(event.target.value)}
                            required
                          />
                          <span>h</span>
                        </span>
                      </label>
                      <div className="field">
                        <span className="field-label">Working days</span>
                        <div className="weekday-picker">
                          {WEEKDAY_OPTIONS.map((day) => (
                            <button
                              type="button"
                              key={day.value}
                              className={`weekday-chip${workdays.includes(day.value) ? ' is-active' : ''}`}
                              onClick={() => toggleWorkday(day.value)}
                              aria-pressed={workdays.includes(day.value)}
                            >
                              {day.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    {profileError && <div className="form-error" role="alert">{profileError}</div>}
                    <div className="form-actions">
                      <button type="submit" className="btn btn-primary" disabled={savingProfile}>
                        {savingProfile ? <span className="spinner spinner-light" /> : <Check size={15} />}
                        Save profile
                      </button>
                      <span className="field-hint">The daily target drives balances and missing-day checks.</span>
                    </div>
                  </form>
                </section>

                <section className="card settings-card share-card">
                  <div className="card-head">
                    <div>
                      <h2>Read-only link for your manager</h2>
                      <p>No account needed. The link can view any month and download reports, nothing else.</p>
                    </div>
                    <span className="card-icon"><Link2 size={18} /></span>
                  </div>

                  {data.settings.shareToken ? (
                    <>
                      <div className="share-box">
                        <input type="text" readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} />
                        <button type="button" className="btn btn-primary btn-small" onClick={() => void copyShare()}>
                          <Copy size={14} /> Copy link
                        </button>
                        <button type="button" className="btn btn-outline btn-small" onClick={() => window.open(shareUrl, '_blank', 'noopener,noreferrer')}>
                          <Eye size={14} /> Open
                        </button>
                      </div>
                      {isLocalHost && !data.publicUrl && data.lanAddresses.length > 0 && (
                        <label className="share-network">
                          <span>Network address</span>
                          <select
                            value={lanChoice || data.lanAddresses[0]?.url || ''}
                            onChange={(event) => setLanChoice(event.target.value)}
                          >
                            {data.lanAddresses.map((item) => (
                              <option value={item.url} key={item.url}>
                                {item.name} — {item.address}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <div className="share-actions">
                        <span className="share-status"><span className="status-dot good" /> Link is active</span>
                        <button type="button" className="text-btn" onClick={() => setConfirmShare('rotate')}>
                          <RefreshCw size={13} /> Replace link
                        </button>
                        <button type="button" className="text-btn danger-text" onClick={() => setConfirmShare('disable')}>
                          <UserX size={13} /> Disable
                        </button>
                      </div>
                      <p className="share-context">{shareContext}</p>
                    </>
                  ) : (
                    <div className="share-empty">
                      <div className="share-empty-icon"><Link2 size={20} /></div>
                      <div>
                        <strong>No link yet</strong>
                        <p>Create one link you can send by email or chat. You can revoke it at any time.</p>
                      </div>
                      <button type="button" className="btn btn-primary" onClick={() => void createShare()} disabled={shareBusy}>
                        {shareBusy ? <span className="spinner spinner-light" /> : <Link2 size={15} />}
                        Create read-only link
                      </button>
                    </div>
                  )}
                </section>

                <section className="card settings-card">
                  <div className="card-head">
                    <div>
                      <h2>Accounts</h2>
                      <p>Owners can edit hours. Viewers can only read and download.</p>
                    </div>
                    <button type="button" className="btn btn-primary btn-small" onClick={() => setAccountModal({ mode: 'add' })}>
                      <Plus size={15} /> Add account
                    </button>
                  </div>

                  <div className="accounts-list">
                    {data.users.map((account) => {
                      const isSelf = account.id === user?.id;
                      return (
                        <div className={`account-row${account.active ? '' : ' is-inactive'}`} key={account.id}>
                          <span className="avatar account-avatar">{account.displayName.slice(0, 1).toUpperCase()}</span>
                          <div className="account-main">
                            <strong>
                              {account.displayName}
                              {isSelf && <span className="you-tag">you</span>}
                            </strong>
                            <span>@{account.username} · added {formatDateShort(account.createdAt.slice(0, 10))}</span>
                          </div>
                          <div className="account-role">
                            {isSelf ? (
                              <span className={`role-pill${account.role === 'admin' ? ' owner' : ''}`}>
                                {account.role === 'admin' ? 'Owner' : 'Viewer'}
                              </span>
                            ) : (
                              <select
                                className="role-select"
                                value={account.role}
                                onChange={(event) => void changeRole(account, event.target.value as 'admin' | 'viewer')}
                                aria-label={`Role for ${account.displayName}`}
                              >
                                <option value="viewer">Viewer</option>
                                <option value="admin">Owner</option>
                              </select>
                            )}
                            {!account.active && <span className="inactive-tag">Inactive</span>}
                          </div>
                          <div className="account-actions">
                            <button
                              type="button"
                              className="icon-btn"
                              title="Reset password"
                              aria-label={`Reset password for ${account.displayName}`}
                              onClick={() => setAccountModal({ mode: 'reset', user: account })}
                            >
                              <KeyRound size={15} />
                            </button>
                            {!isSelf && (
                              <>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  title={account.active ? 'Deactivate account' : 'Reactivate account'}
                                  aria-label={account.active ? `Deactivate ${account.displayName}` : `Reactivate ${account.displayName}`}
                                  onClick={() => void toggleActive(account)}
                                >
                                  <UserX size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn danger-text"
                                  title="Delete account"
                                  aria-label={`Delete ${account.displayName}`}
                                  onClick={() => setDeleteUser(account)}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            )}

            <section className="card settings-card">
              <div className="card-head">
                <div>
                  <h2>Your account</h2>
                  <p>Signed in as <strong>@{user?.username}</strong>{isAdmin ? ' · workspace owner' : ' · viewer'}.</p>
                </div>
                <span className="card-icon"><KeyRound size={18} /></span>
              </div>
              <PasswordForm />
            </section>
          </div>

          <aside className="settings-side">
            <section className="card settings-card side-card">
              <span className="card-icon"><Database size={18} /></span>
              <h2>Data &amp; backup</h2>
              <p>Your registration lives in a local SQLite database. Download a JSON copy whenever you like.</p>
              <div className="data-stats">
                <div><strong>{statsRange.days}</strong><span>days recorded</span></div>
                <div><strong>{range}</strong><span>date range</span></div>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  className="btn btn-outline btn-wide"
                  onClick={() => {
                    startDownload('/api/export/backup.json');
                    toast.notify('Backup download started.', 'info');
                  }}
                >
                  <DownloadIcon /> Download backup
                </button>
              )}
            </section>

            <section className="card settings-card side-card">
              <span className="card-icon"><ShieldCheck size={18} /></span>
              <h2>Good to know</h2>
              <ul className="info-list">
                <li>Passwords are hashed with scrypt; nobody can read them back.</li>
                <li>Read-only links can be replaced or disabled in one click.</li>
                <li>Excel and PDF reports use your saved hours, not unsaved edits.</li>
                <li>Keep the <code>data</code> folder with the database backed up.</li>
              </ul>
            </section>

            {isAdmin && (
              <section className="card settings-card side-card muted-card">
                <h2>Imported history</h2>
                <p>Your legacy monthly Excel files were merged into this workspace. To import again:</p>
                <code className="command">npm run import:legacy:replace</code>
                <p className="small">This replaces the days currently stored. Make a backup first.</p>
              </section>
            )}
          </aside>
        </div>
      )}

      {accountModal && (
        <AccountModal
          mode={accountModal.mode}
          user={accountModal.user}
          onClose={() => setAccountModal(null)}
          onDone={updateUsers}
        />
      )}

      {deleteUser && (
        <Modal
          title={`Delete ${deleteUser.displayName}?`}
          subtitle="This removes the account. Their access ends immediately."
          onClose={() => setDeleteUser(null)}
          footer={(
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setDeleteUser(null)}>Cancel</button>
              <button type="button" className="btn btn-danger" onClick={() => void removeAccount()}>
                <Trash2 size={15} /> Delete account
              </button>
            </>
          )}
        >
          <p className="modal-copy">The time entries themselves are not affected — only the account is removed.</p>
        </Modal>
      )}

      {confirmShare && (
        <Modal
          title={confirmShare === 'rotate' ? 'Replace the read-only link?' : 'Disable the read-only link?'}
          subtitle={confirmShare === 'rotate'
            ? 'The current link stops working immediately. Anyone using it will need the new one.'
            : 'Anyone with the current link will lose access immediately.'}
          onClose={() => setConfirmShare(null)}
          footer={(
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmShare(null)}>Cancel</button>
              <button
                type="button"
                className={`btn ${confirmShare === 'disable' ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => void (confirmShare === 'rotate' ? createShare() : disableShare())}
                disabled={shareBusy}
              >
                {shareBusy ? <span className="spinner spinner-light" /> : null}
                {confirmShare === 'rotate' ? 'Replace link' : 'Disable link'}
              </button>
            </>
          )}
        >
          <p className="modal-copy">Reports are still available to signed-in accounts after the link is changed.</p>
        </Modal>
      )}
    </div>
  );
}

function DownloadIcon() {
  return <Database size={15} />;
}
