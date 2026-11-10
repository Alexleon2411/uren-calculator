import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(SERVER_DIR, '..');
export const DIST_DIR = path.join(ROOT_DIR, 'dist');
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT_DIR, 'data');
export const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(DATA_DIR, 'uren.db');
export const PORT = Number(process.env.PORT || 3000);
export const HOST = process.env.HOST || '0.0.0.0';
export const APP_TZ = process.env.APP_TZ || 'Europe/Amsterdam';
export const IS_PROD = process.env.NODE_ENV === 'production';
export const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
export const SESSION_DAYS = 30;
