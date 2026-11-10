import crypto from 'node:crypto';
import os from 'node:os';
import express from 'express';
import {
  clearSession, createSession, deleteUserSessions, hashPassword, loginLimiter,
  requireAdmin, requireAuth, serializeUser, validatePassword, validateUsername,
  verifyPassword,
} from './auth.js';
import { currentYearMonth, isValidDate, monthLabel, todayISO } from './dates.js';
import { getDataStats, getSettings, setSettings, countUsers, transaction } from './db.js';
import {
  createMonthWorkbook, createYearWorkbook, monthFileBase, yearFileBase,
} from './export-excel.js';
import { createMonthPdf, createYearPdf } from './export-pdf.js';
import { PORT } from './config.js';
import {
  DAY_KINDS, buildMonth, buildYear, parseSettings, publicWorkspace, round2,
} from './summary.js';

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

function tokensMatch(a, b) {
  if (!a || !b) return false;
  const left = sha256(a);
  const right = sha256(b);
  return crypto.timingSafeEqual(left, right);
}

function getWorkspacePayload(db) {
  const settings = parseSettings(db);
  return { settings, workspace: publicWorkspace(settings) };
}

function userList(db) {
  return db.prepare(`
    SELECT id, username, display_name, role, active, created_at
    FROM users ORDER BY active DESC, role = 'admin' DESC, display_name COLLATE NOCASE
  `).all().map(serializeUser);
}

function parseYearMonth(req, res) {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    res.status(400).json({ error: 'Choose a valid year.' });
    return null;
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    res.status(400).json({ error: 'Choose a valid month.' });
    return null;
  }
  return { year, month };
}

function parseYear(req, res) {
  const year = Number(req.query.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    res.status(400).json({ error: 'Choose a valid year.' });
    return null;
  }
  return year;
}

function lanAddresses() {
  const found = [];
  const seen = new Set();
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const net of entries || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(net.address)) continue;
      if (seen.has(net.address)) continue;
      seen.add(net.address);
      let score = 0;
      if (/wi-?fi|wlan|ethernet|lan/i.test(name)) score += 1;
      if (/vethernet|virtual|vmware|hyper-v|docker|wsl|default switch|cowork/i.test(name)) score -= 5;
      if (/^10\.10\./.test(net.address)) score += 0.2;
      if (/^192\.168\./.test(net.address)) score += 0.1;
      found.push({
        name,
        address: net.address,
        url: `http://${net.address}:${PORT}`,
        score,
      });
    }
  }
  found.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return found.map(({ name, address, url }) => ({ name, address, url }));
}

function configuredPublicUrl() {
  const explicit = String(process.env.PUBLIC_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const railwayDomain = String(process.env.RAILWAY_PUBLIC_DOMAIN || '').trim();
  if (railwayDomain) {
    return `https://${railwayDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  }
  return '';
}

function contentDisposition(filename) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function sendFile(res, buffer, filename, contentType) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', contentDisposition(filename));
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
}

function cleanText(value, maxLength) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, maxLength);
}

export function createApiRouter(db) {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  router.get('/bootstrap', (req, res) => {
    const needsSetup = countUsers(db) === 0;
    const { today } = currentYearMonth();
    const settings = parseSettings(db);
    res.json({
      needsSetup,
      user: req.user,
      workspace: req.user ? publicWorkspace(settings) : null,
      today,
      stats: getDataStats(db),
    });
  });

  router.post('/setup', async (req, res) => {
    if (countUsers(db) > 0) {
      return res.status(409).json({ error: 'This workspace is already set up. Please sign in.' });
    }
    const displayName = cleanText(req.body?.displayName, 80);
    const username = cleanText(req.body?.username, 32).toLowerCase();
    const password = String(req.body?.password || '');
    const company = cleanText(req.body?.company, 60) || 'MAGVIEW';
    if (!displayName) return res.status(400).json({ error: 'Please enter your name.' });
    if (!validateUsername(username)) {
      return res.status(400).json({ error: 'Username must be 3–32 characters: letters, numbers, dot, dash or underscore.' });
    }
    if (!validatePassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const passwordHash = await hashPassword(password);
    transaction(db, () => {
      db.prepare(`
        INSERT INTO users (username, display_name, password_hash, role, active, created_at)
        VALUES (?, ?, ?, 'admin', 1, ?)
      `).run(username, displayName, passwordHash, new Date().toISOString());
      setSettings(db, { profile_name: displayName, company });
    });
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    createSession(db, req, res, user.id);
    const settings = parseSettings(db);
    res.status(201).json({
      needsSetup: false,
      user: serializeUser(user),
      workspace: publicWorkspace(settings),
      today: todayISO(),
      stats: getDataStats(db),
    });
  });

  router.post('/auth/login', async (req, res) => {
    const username = cleanText(req.body?.username, 64).toLowerCase();
    const password = String(req.body?.password || '');
    const key = `${req.ip}|${username}`;
    const limit = loginLimiter.check(key);
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfter));
      return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    }
    if (!username || !password) {
      return res.status(400).json({ error: 'Enter your username and password.' });
    }
    const row = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
    const valid = row ? await verifyPassword(password, row.password_hash) : false;
    if (!valid) {
      loginLimiter.fail(key);
      return res.status(401).json({ error: 'The username or password is incorrect.' });
    }
    loginLimiter.reset(key);
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
    createSession(db, req, res, row.id);
    const settings = parseSettings(db);
    res.json({
      needsSetup: false,
      user: serializeUser(row),
      workspace: publicWorkspace(settings),
      today: todayISO(),
      stats: getDataStats(db),
    });
  });

  router.post('/auth/logout', (req, res) => {
    clearSession(db, req, res);
    res.json({ ok: true });
  });

  router.post('/auth/password', requireAuth, async (req, res) => {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!validatePassword(newPassword)) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const valid = await verifyPassword(currentPassword, row.password_hash);
    if (!valid) return res.status(401).json({ error: 'Your current password is incorrect.' });
    const passwordHash = await hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, req.user.id);
    deleteUserSessions(db, req.user.id, req.sessionTokenHash);
    res.json({ ok: true });
  });

  router.get('/month', requireAuth, (req, res) => {
    const parsed = parseYearMonth(req, res);
    if (!parsed) return;
    res.json(buildMonth(db, parsed.year, parsed.month));
  });

  router.get('/year', requireAuth, (req, res) => {
    const year = parseYear(req, res);
    if (!year) return;
    res.json(buildYear(db, year));
  });

  router.put('/day/:date', requireAuth, requireAdmin, (req, res) => {
    const date = req.params.date;
    if (!isValidDate(date)) return res.status(400).json({ error: 'Choose a valid date.' });
    const kind = req.body?.kind;
    if (!DAY_KINDS.includes(kind)) return res.status(400).json({ error: 'Choose a valid day type.' });
    const note = cleanText(req.body?.note, 2000);
    const rawEntries = kind === 'work' && Array.isArray(req.body?.entries) ? req.body.entries : [];
    const entries = [];
    let total = 0;
    for (const raw of rawEntries.slice(0, 30)) {
      const description = cleanText(raw?.description, 1000);
      const hours = round2(Number(raw?.hours));
      if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
        return res.status(400).json({ error: 'Hours must be a number between 0 and 24.' });
      }
      if (!description && hours <= 0) continue;
      total = round2(total + hours);
      if (total > 24) return res.status(400).json({ error: 'A day cannot have more than 24 hours.' });
      entries.push({ description, hours });
    }

    const existing = db.prepare('SELECT id FROM days WHERE date = ?').get(date);
    if (kind === 'work' && entries.length === 0) {
      if (existing) db.prepare('DELETE FROM days WHERE id = ?').run(existing.id);
      const [year, month] = date.split('-').map(Number);
      return res.json({ deleted: true, date, month: buildMonth(db, year, month) });
    }

    transaction(db, () => {
      let dayId;
      const now = new Date().toISOString();
      if (existing) {
        dayId = existing.id;
        db.prepare('UPDATE days SET kind = ?, note = ?, updated_at = ? WHERE id = ?')
          .run(kind, note, now, dayId);
      } else {
        const result = db.prepare(
          'INSERT INTO days (date, kind, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ).run(date, kind, note, now, now);
        dayId = Number(result.lastInsertRowid);
      }
      db.prepare('DELETE FROM entries WHERE day_id = ?').run(dayId);
      const insert = db.prepare(
        'INSERT INTO entries (day_id, description, hours, sort_order) VALUES (?, ?, ?, ?)',
      );
      entries.forEach((entry, index) => insert.run(dayId, entry.description, entry.hours, index));
    });

    const [year, month] = date.split('-').map(Number);
    res.json({ ok: true, date, month: buildMonth(db, year, month) });
  });

  router.delete('/day/:date', requireAuth, requireAdmin, (req, res) => {
    const date = req.params.date;
    if (!isValidDate(date)) return res.status(400).json({ error: 'Choose a valid date.' });
    db.prepare('DELETE FROM days WHERE date = ?').run(date);
    const [year, month] = date.split('-').map(Number);
    res.json({ ok: true, date, month: buildMonth(db, year, month) });
  });

  router.get('/settings', requireAdmin, (req, res) => {
    const { settings } = getWorkspacePayload(db);
    res.json({
      settings: {
        profileName: settings.profileName,
        company: settings.company,
        dailyHours: settings.dailyHours,
        workdays: settings.workdays,
        shareToken: settings.shareToken,
        shareEnabled: Boolean(settings.shareToken),
      },
      users: userList(db),
      stats: getDataStats(db),
      today: todayISO(),
      publicUrl: configuredPublicUrl(),
      lanAddresses: lanAddresses(),
    });
  });

  router.put('/settings', requireAdmin, (req, res) => {
    const profileName = cleanText(req.body?.profileName, 80);
    const company = cleanText(req.body?.company, 60);
    const dailyHours = Number(req.body?.dailyHours);
    const workdays = Array.isArray(req.body?.workdays)
      ? [...new Set(req.body.workdays.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7))].sort()
      : [];
    if (!profileName) return res.status(400).json({ error: 'Please enter your name.' });
    if (!company) return res.status(400).json({ error: 'Please enter a company or label.' });
    if (!Number.isFinite(dailyHours) || dailyHours < 0.5 || dailyHours > 24) {
      return res.status(400).json({ error: 'Daily hours must be between 0.5 and 24.' });
    }
    if (!workdays.length) return res.status(400).json({ error: 'Select at least one working day.' });
    setSettings(db, {
      profile_name: profileName,
      company,
      daily_hours: String(round2(dailyHours)),
      workdays: workdays.join(','),
    });
    const { settings } = getWorkspacePayload(db);
    res.json({
      settings: {
        profileName: settings.profileName,
        company: settings.company,
        dailyHours: settings.dailyHours,
        workdays: settings.workdays,
        shareToken: settings.shareToken,
        shareEnabled: Boolean(settings.shareToken),
      },
      workspace: publicWorkspace(settings),
    });
  });

  router.get('/users', requireAdmin, (_req, res) => {
    res.json({ users: userList(db) });
  });

  router.post('/users', requireAdmin, async (req, res) => {
    const displayName = cleanText(req.body?.displayName, 80);
    const username = cleanText(req.body?.username, 32).toLowerCase();
    const password = String(req.body?.password || '');
    const role = req.body?.role === 'admin' ? 'admin' : 'viewer';
    if (!displayName) return res.status(400).json({ error: 'Please enter a name.' });
    if (!validateUsername(username)) {
      return res.status(400).json({ error: 'Username must be 3–32 characters: letters, numbers, dot, dash or underscore.' });
    }
    if (!validatePassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (exists) return res.status(409).json({ error: 'That username is already in use.' });
    const passwordHash = await hashPassword(password);
    db.prepare(`
      INSERT INTO users (username, display_name, password_hash, role, active, created_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(username, displayName, passwordHash, role, new Date().toISOString());
    res.status(201).json({ users: userList(db) });
  });

  router.patch('/users/:id', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    const changes = [];
    const values = [];

    if (Object.hasOwn(req.body || {}, 'displayName')) {
      const displayName = cleanText(req.body.displayName, 80);
      if (!displayName) return res.status(400).json({ error: 'Please enter a name.' });
      changes.push('display_name = ?');
      values.push(displayName);
    }

    if (Object.hasOwn(req.body || {}, 'role')) {
      const role = req.body.role === 'admin' ? 'admin' : 'viewer';
      if (user.active && user.role === 'admin' && role !== 'admin') {
        const admins = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1").get().count;
        if (admins <= 1) return res.status(400).json({ error: 'There must be at least one active workspace owner.' });
      }
      changes.push('role = ?');
      values.push(role);
    }

    if (Object.hasOwn(req.body || {}, 'active')) {
      const active = Boolean(req.body.active);
      if (id === req.user.id && !active) {
        return res.status(400).json({ error: 'You cannot deactivate your own account.' });
      }
      if (user.active && user.role === 'admin' && !active) {
        const admins = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1").get().count;
        if (admins <= 1) return res.status(400).json({ error: 'There must be at least one active workspace owner.' });
      }
      changes.push('active = ?');
      values.push(active ? 1 : 0);
    }

    if (Object.hasOwn(req.body || {}, 'password')) {
      const password = String(req.body.password || '');
      if (!validatePassword(password)) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
      }
      const passwordHash = await hashPassword(password);
      changes.push('password_hash = ?');
      values.push(passwordHash);
      deleteUserSessions(db, id);
    }

    if (!changes.length) return res.status(400).json({ error: 'Nothing to update.' });
    values.push(id);
    db.prepare(`UPDATE users SET ${changes.join(', ')} WHERE id = ?`).run(...values);
    res.json({ users: userList(db) });
  });

  router.delete('/users/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    if (user.role === 'admin' && user.active) {
      const admins = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1").get().count;
      if (admins <= 1) return res.status(400).json({ error: 'There must be at least one active workspace owner.' });
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ users: userList(db) });
  });

  router.post('/share', requireAdmin, (_req, res) => {
    const token = crypto.randomBytes(24).toString('base64url');
    setSettings(db, { share_token: token });
    res.json({ shareToken: token, shareEnabled: true });
  });

  router.delete('/share', requireAdmin, (_req, res) => {
    setSettings(db, { share_token: '' });
    res.json({ shareToken: '', shareEnabled: false });
  });

  router.get('/export/month.xlsx', requireAuth, async (req, res) => {
    const parsed = parseYearMonth(req, res);
    if (!parsed) return;
    const settings = parseSettings(db);
    const buffer = await createMonthWorkbook(db, parsed.year, parsed.month);
    sendFile(
      res, buffer,
      `${monthFileBase(settings, parsed.year, parsed.month)}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

  router.get('/export/month.pdf', requireAuth, async (req, res) => {
    const parsed = parseYearMonth(req, res);
    if (!parsed) return;
    const settings = parseSettings(db);
    const buffer = await createMonthPdf(db, parsed.year, parsed.month);
    sendFile(res, buffer, `${monthFileBase(settings, parsed.year, parsed.month)}.pdf`, 'application/pdf');
  });

  router.get('/export/year.xlsx', requireAuth, async (req, res) => {
    const year = parseYear(req, res);
    if (!year) return;
    const settings = parseSettings(db);
    const buffer = await createYearWorkbook(db, year);
    sendFile(res, buffer, `${yearFileBase(settings, year)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  router.get('/export/year.pdf', requireAuth, async (req, res) => {
    const year = parseYear(req, res);
    if (!year) return;
    const settings = parseSettings(db);
    const buffer = await createYearPdf(db, year);
    sendFile(res, buffer, `${yearFileBase(settings, year)}.pdf`, 'application/pdf');
  });

  router.get('/export/backup.json', requireAdmin, (req, res) => {
    const settings = parseSettings(db);
    const days = db.prepare('SELECT date, kind, note FROM days ORDER BY date').all();
    const entries = db.prepare(`
      SELECT d.date, e.description, e.hours, e.sort_order
      FROM entries e JOIN days d ON d.id = e.day_id ORDER BY d.date, e.sort_order, e.id
    `).all();
    const entryMap = new Map();
    for (const entry of entries) {
      if (!entryMap.has(entry.date)) entryMap.set(entry.date, []);
      entryMap.get(entry.date).push({ description: entry.description, hours: entry.hours });
    }
    const payload = {
      app: 'uren',
      version: 1,
      exportedAt: new Date().toISOString(),
      workspace: {
        profileName: settings.profileName,
        company: settings.company,
        dailyHours: settings.dailyHours,
        workdays: settings.workdays,
      },
      days: days.map((day) => ({
        date: day.date,
        kind: day.kind,
        note: day.note,
        entries: entryMap.get(day.date) || [],
      })),
    };
    const buffer = Buffer.from(JSON.stringify(payload, null, 2));
    sendFile(res, buffer, `uren-backup-${todayISO()}.json`, 'application/json; charset=utf-8');
  });

  // Read-only public share
  const publicRouter = express.Router({ mergeParams: true });
  publicRouter.use((req, res, next) => {
    const settings = parseSettings(db);
    if (!tokensMatch(req.params.token, settings.shareToken)) {
      return res.status(404).json({ error: 'This share link is not available.' });
    }
    req.sharedSettings = settings;
    next();
  });

  publicRouter.get('/bootstrap', (req, res) => {
    const stats = getDataStats(db);
    res.json({
      readOnly: true,
      workspace: publicWorkspace(req.sharedSettings),
      today: todayISO(),
      stats,
    });
  });

  publicRouter.get('/month', (req, res) => {
    const parsed = parseYearMonth(req, res);
    if (!parsed) return;
    res.json(buildMonth(db, parsed.year, parsed.month, { settings: req.sharedSettings }));
  });

  publicRouter.get('/export/month.xlsx', async (req, res) => {
    const parsed = parseYearMonth(req, res);
    if (!parsed) return;
    const buffer = await createMonthWorkbook(db, parsed.year, parsed.month);
    sendFile(
      res, buffer,
      `${monthFileBase(req.sharedSettings, parsed.year, parsed.month)}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

  publicRouter.get('/export/month.pdf', async (req, res) => {
    const parsed = parseYearMonth(req, res);
    if (!parsed) return;
    const buffer = await createMonthPdf(db, parsed.year, parsed.month);
    sendFile(
      res, buffer,
      `${monthFileBase(req.sharedSettings, parsed.year, parsed.month)}.pdf`,
      'application/pdf',
    );
  });

  router.use('/public/:token', publicRouter);

  return router;
}

export { monthLabel };
