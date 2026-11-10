import { createApp } from './app.js';
import { DB_PATH, HOST, PORT, IS_PROD } from './config.js';
import {
  closeDatabase, countUsers, getDataStats, getSetting, openDatabase, setSetting,
} from './db.js';
import { importLegacyDays, loadLegacySeed } from './legacy.js';

const db = openDatabase(DB_PATH);

// Optional first-boot seed for hosted deployments. It only runs when the
// volume is empty, and a marker prevents it from re-seeding a workspace later.
if (process.env.SEED_ON_EMPTY === 'true' && getSetting(db, 'legacy_seed_imported') !== '1') {
  try {
    if (getDataStats(db).days === 0) {
      const days = loadLegacySeed();
      const result = importLegacyDays(db, days);
      console.log(`  Seed:     imported ${result.imported} legacy days`);
    }
    setSetting(db, 'legacy_seed_imported', '1');
  } catch (error) {
    console.error('Could not import the legacy seed:', error);
  }
}

const app = createApp(db);

const server = app.listen(PORT, HOST, () => {
  const users = countUsers(db);
  const stats = getDataStats(db);
  console.log('');
  console.log('  Uren is running');
  console.log(`  Local:    http://localhost:${PORT}`);
  if (HOST === '0.0.0.0') console.log(`  Network:  http://<this-computer-ip>:${PORT}`);
  console.log(`  Database: ${DB_PATH}`);
  console.log(`  Mode:     ${IS_PROD ? 'production' : 'development'}`);
  console.log(`  Data:     ${stats.days} days${stats.firstDate ? ` (${stats.firstDate} → ${stats.lastDate})` : ''}`);
  console.log(`  Setup:    ${users === 0 ? 'open the app to create the owner account' : `${users} account(s)`}`);
  console.log('');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Set PORT to a different number and try again.`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received, shutting down…`);
  server.close(() => {
    closeDatabase(db);
    process.exit(0);
  });
  setTimeout(() => {
    closeDatabase(db);
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
