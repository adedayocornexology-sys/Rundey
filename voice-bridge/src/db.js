import pg from 'pg';
import { config } from './config.js';

let pool;
let dispatcherPool;

export function getPool() {
  if (!pool) {
    if (!config.databaseUrl) throw new Error('DATABASE_URL is not set');
    pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });
  }
  return pool;
}

// Separate pool for the dispatcher dashboard — connects as the role allowed to
// EXECUTE dispatcher_review (the pipeline role is not). See migrations.
export function getDispatcherPool() {
  if (!dispatcherPool) {
    if (!config.dispatcherDatabaseUrl) throw new Error('DISPATCHER_DATABASE_URL is not set');
    dispatcherPool = new pg.Pool({ connectionString: config.dispatcherDatabaseUrl, max: 3 });
  }
  return dispatcherPool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}

export async function dispatcherQuery(text, params) {
  return getDispatcherPool().query(text, params);
}

export async function closePool() {
  if (pool) { await pool.end(); pool = undefined; }
  if (dispatcherPool) { await dispatcherPool.end(); dispatcherPool = undefined; }
}
