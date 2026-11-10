import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { DIST_DIR, IS_PROD } from './config.js';
import { attachUser, csrfGuard } from './auth.js';
import { createApiRouter } from './api.js';

export function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "img-src 'self' data:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self'",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    );
    next();
  });

  app.use(express.json({ limit: '256kb' }));
  app.use(attachUser(db));

  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', csrfGuard, createApiRouter(db));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  if (fs.existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR, {
      index: false,
      maxAge: 0,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }));

    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      if (!req.accepts('html')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  } else {
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.status(503).type('text/plain').send(
        'The interface has not been built yet. Run "npm run build" and start the server again.',
      );
    });
  }

  app.use((req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found.' });
    res.status(404).type('text/plain').send('Not found');
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (IS_PROD) console.error(err);
    else console.error(err);
    if (res.headersSent) return;
    const status = Number(err.status) || 500;
    const message = status >= 500 ? 'Something went wrong. Please try again.' : String(err.message || 'Request failed.');
    if (req.path.startsWith('/api')) {
      res.status(status).json({ error: message });
    } else {
      res.status(status).type('text/plain').send(message);
    }
  });

  return app;
}
