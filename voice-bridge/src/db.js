import pg from 'pg';
import { config } from './config.js';

let pool;

export function getPool() {
  if (!pool) {
    if (!config.databaseUrl) throw new Error('DATABASE_URL is not set');
    pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });
  }
  return pool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}

export async function closePool() {
  if (pool) { await pool.end(); pool = undefined; }
}
