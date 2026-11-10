import path from 'node:path';
import { DB_PATH } from './config.js';
import { closeDatabase, getDataStats, openDatabase } from './db.js';
import { DEFAULT_SEED_PATH, importLegacyDays, loadLegacySeed } from './legacy.js';

const args = process.argv.slice(2);
const replace = args.includes('--replace');
const fileArg = args.find((arg) => !arg.startsWith('--'));
const filePath = fileArg ? path.resolve(fileArg) : DEFAULT_SEED_PATH;

let days;
try {
  days = loadLegacySeed(filePath);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const db = openDatabase(DB_PATH);
const result = importLegacyDays(db, days, { replace });
const stats = getDataStats(db);

console.log('');
console.log('  Legacy import complete');
console.log(`  Source:   ${filePath}`);
console.log(`  Imported: ${result.imported} days${replace ? ` (replaced ${result.replaced})` : ''}`);
console.log(`  Skipped:  ${result.skipped}`);
console.log(`  Database: ${DB_PATH}`);
console.log(`  Range:    ${stats.firstDate || '—'} → ${stats.lastDate || '—'} (${stats.days} days)`);
console.log('');

closeDatabase(db);
