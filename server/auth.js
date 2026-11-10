import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { COOKIE_SECURE, SESSION_DAYS } from './config.js';

const scryptAsync = promisify(crypto.scrypt);
export const COOKIE_NAME = 'uren_session';
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function newSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function validateUsername(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9._-]{3,32}$/.test(value.trim());
}

export function validatePassword(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 200;
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT.keylen, SCRYPT);
  return [
    'scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p,
    salt.toString('base64url'), derived.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password, stored) {
  try {
    const [algorithm, N, r, p, saltB64, hashB64] = String(stored).split('$');
    if (algorithm !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64url');
    const expected = Buffer.from(hashB64, 'base64url');
    const derived = await scryptAsync(password, salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p),
    });
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function parseCookies(header = '') {
  const result = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    result[key] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}

export function cookieSecure(req) {
  if (COOKIE_SECURE) return true;
  if (req.secure) return true;
  return String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

export function createSession(db, req, res, userId) {
  const token = newSessionToken();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(hashToken(token), userId, now.toISOString(), expires.toISOString());
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(req),
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
  return token;
}

export function clearSession(db, req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(req),
    path: '/',
  });
}

export function serializeUser(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    active: Boolean(row.active),
    createdAt: row.created_at,
  };
}

export function purgeExpiredSessions(db) {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
}

export function attachUser(db) {
  const findSession = db.prepare(`
    SELECT u.*, s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND u.active = 1
  `);
  const deleteSession = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
  return (req, _res, next) => {
    req.user = null;
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (!token) return next();
    const row = findSession.get(hashToken(token));
    if (!row) return next();
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      deleteSession.run(hashToken(token));
      return next();
    }
    req.user = serializeUser(row);
    req.sessionTokenHash = hashToken(token);
    next();
  };
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' });
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only the workspace owner can do this.' });
  }
  next();
}

export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    try {
      if (new URL(origin).host !== req.get('host')) {
        return res.status(403).json({ error: 'Request blocked for security reasons.' });
      }
    } catch {
      return res.status(403).json({ error: 'Request blocked for security reasons.' });
    }
  }
  if (req.get('sec-fetch-site') === 'cross-site') {
    return res.status(403).json({ error: 'Request blocked for security reasons.' });
  }
  next();
}

export function deleteUserSessions(db, userId, exceptHash = null) {
  if (exceptHash) {
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, exceptHash);
  } else {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }
}

// Small in-memory login throttle. Good enough for a single-instance app.
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export const loginLimiter = {
  check(key) {
    const record = attempts.get(key);
    if (!record) return { allowed: true };
    if (Date.now() > record.resetAt) {
      attempts.delete(key);
      return { allowed: true };
    }
    if (record.count >= MAX_ATTEMPTS) {
      return { allowed: false, retryAfter: Math.ceil((record.resetAt - Date.now()) / 1000) };
    }
    return { allowed: true };
  },
  fail(key) {
    const record = attempts.get(key);
    if (!record || Date.now() > record.resetAt) {
      attempts.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
    } else {
      record.count += 1;
    }
    if (attempts.size > 1000) {
      const now = Date.now();
      for (const [entryKey, value] of attempts) {
        if (now > value.resetAt) attempts.delete(entryKey);
      }
    }
  },
  reset(key) {
    attempts.delete(key);
  },
};
