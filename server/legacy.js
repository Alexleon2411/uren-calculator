import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from './config.js';
import { transaction } from './db.js';
import { isValidDate, todayISO } from './dates.js';
import { DAY_KINDS, round2 } from './summary.js';

export const DEFAULT_SEED_PATH = path.join(ROOT_DIR, 'seed', 'legacy-data.json');

export function loadLegacySeed(filePath = DEFAULT_SEED_PATH) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Legacy data file not found: ${filePath}`);
  }
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(payload.days) ? payload.days : [];
}

/**
 * Import the Excel-derived seed. Safe to reuse from the CLI, startup seeding
 * and tests. By default it upserts days and leaves other days untouched.
 */
export function importLegacyDays(db, days, { replace = false, today = todayISO() } = {}) {
  const insertDay = db.prepare(
    'INSERT INTO days (date, kind, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  );
  const updateDay = db.prepare(
    'UPDATE days SET kind = ?, note = ?, updated_at = ? WHERE id = ?',
  );
  const findDay = db.prepare('SELECT id FROM days WHERE date = ?');
  const deleteEntries = db.prepare('DELETE FROM entries WHERE day_id = ?');
  const insertEntry = db.prepare(
    'INSERT INTO entries (day_id, description, hours, sort_order) VALUES (?, ?, ?, ?)',
  );

  let imported = 0;
  let skipped = 0;
  let replaced = 0;

  transaction(db, () => {
    if (replace) {
      const result = db.prepare('DELETE FROM days').run();
      replaced = Number(result.changes || 0);
    }
    for (const raw of days) {
      if (!isValidDate(raw.date) || raw.date > today) {
        skipped += 1;
        continue;
      }
      const kind = DAY_KINDS.includes(raw.kind) ? raw.kind : 'work';
      const note = String(raw.note || '').slice(0, 2000);
      const entries = kind === 'work' && Array.isArray(raw.entries)
        ? raw.entries
          .map((entry) => ({
            description: String(entry.description || '').slice(0, 1000),
            hours: round2(Number(entry.hours) || 0),
          }))
          .filter((entry) => entry.description || entry.hours > 0)
          .slice(0, 30)
        : [];
      if (kind === 'work' && !entries.length && !note) {
        skipped += 1;
        continue;
      }
      if (raw.date === today && kind === 'work' && entries.every((entry) => !entry.description)) {
        skipped += 1;
        continue;
      }
      const now = new Date().toISOString();
      const existing = findDay.get(raw.date);
      let dayId;
      if (existing) {
        dayId = existing.id;
        updateDay.run(kind, note, now, dayId);
      } else {
        const result = insertDay.run(raw.date, kind, note, now, now);
        dayId = Number(result.lastInsertRowid);
      }
      deleteEntries.run(dayId);
      entries.forEach((entry, index) => insertEntry.run(dayId, entry.description, entry.hours, index));
      imported += 1;
    }
  });

  return { imported, skipped, replaced };
}
