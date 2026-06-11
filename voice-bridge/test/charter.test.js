// DoD #4: the service role must NOT be able to set voice_orders.status to
// 'confirmed' (or any review status) by direct UPDATE/INSERT. The only path
// is dispatcher_review(). vb_service has BYPASSRLS, mirroring the Supabase
// service_role — proving the trigger, not RLS, is what enforces the charter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { testEnv, uniqueSession } from './helpers.js';

testEnv();
const { query, closePool } = await import('../src/db.js');

async function draftOrder() {
  const { rows: [call] } = await query(
    `insert into voice_calls (at_session_id, caller_phone) values ($1, $2) returning id`,
    [uniqueSession('charter'), '+2348011111111'],
  );
  const { rows: [order] } = await query(
    `insert into voice_orders (call_id, customer_phone, items)
     values ($1, $2, '[{"name_en":"garri","qty":1}]'::jsonb) returning *`,
    [call.id, '+2348011111111'],
  );
  return order;
}

test('charter: direct UPDATE to confirmed is blocked', async () => {
  const order = await draftOrder();
  await assert.rejects(
    query(`update voice_orders set status='confirmed' where id=$1`, [order.id]),
    /CHARTER VIOLATION/,
  );
});

test('charter: direct UPDATE to approved is blocked', async () => {
  const order = await draftOrder();
  await assert.rejects(
    query(`update voice_orders set status='approved' where id=$1`, [order.id]),
    /CHARTER VIOLATION/,
  );
});

test('charter: INSERT born-confirmed is blocked', async () => {
  const { rows: [call] } = await query(
    `insert into voice_calls (at_session_id, caller_phone) values ($1, $2) returning id`,
    [uniqueSession('charter-ins'), '+2348011111111'],
  );
  await assert.rejects(
    query(
      `insert into voice_orders (call_id, customer_phone, status) values ($1, $2, 'confirmed')`,
      [call.id, '+2348011111111'],
    ),
    /CHARTER VIOLATION/,
  );
});

test('charter: spoofing the GUC does not unlock the trigger', async () => {
  const order = await draftOrder();
  // Same session: set a guessed nonce, then try to confirm.
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`select set_config('vb.dispatcher_nonce', 'guessed-nonce', false)`);
    await assert.rejects(
      client.query(`update voice_orders set status='confirmed' where id=$1`, [order.id]),
      /CHARTER VIOLATION/,
    );
  } finally {
    await client.end();
  }
  // And the service role cannot read the real nonce to spoof it properly.
  await assert.rejects(
    query(`select nonce from vb_private.charter_nonce`),
    /permission denied/,
  );
});

test('charter: dispatcher_review() is the sanctioned path', async () => {
  const order = await draftOrder();
  const { rows: [reviewed] } = await query(
    `select * from dispatcher_review($1, 'approved', 'test-dispatcher', null, 'manual_callback')`,
    [order.id],
  );
  assert.equal(reviewed.status, 'approved');
  assert.equal(reviewed.reviewed_by, 'test-dispatcher');
  assert.equal(reviewed.confirmation_path, 'manual_callback');
});

test('charter: dispatcher_review requires a reviewer identity', async () => {
  const order = await draftOrder();
  await assert.rejects(
    query(`select * from dispatcher_review($1, 'approved', '')`, [order.id]),
    /reviewer identity is required/,
  );
});

test.after(async () => { await closePool(); });
