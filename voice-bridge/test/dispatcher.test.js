// Dispatcher dashboard: auth, queue rendering, the approve path (via
// dispatcher_review + RUNDEY intake stub), and item correction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { testEnv, uniqueSession } from './helpers.js';

testEnv();
const { query, dispatcherQuery, closePool } = await import('../src/db.js');
const { createApp } = await import('../src/index.js');

const app = createApp();
const TOKEN = process.env.DISPATCHER_TOKEN;

async function draftOrder(items = [{ name_yo: 'gaàrí', name_en: 'garri', qty: 1, unit: null }]) {
  const { rows: [call] } = await query(
    `insert into voice_calls (at_session_id, caller_phone, transcript, status, asr_status)
     values ($1, $2, 'Mo fẹ́ ra gaàrí kan', 'completed', 'done') returning id`,
    [uniqueSession('disp'), '+2348088888888'],
  );
  const { rows: [order] } = await query(
    `insert into voice_orders (call_id, customer_phone, items, confidence)
     values ($1, $2, $3::jsonb, 0.9) returning *`,
    [call.id, '+2348088888888', JSON.stringify(items)],
  );
  return order;
}

test('dispatcher: rejects missing/wrong token', async () => {
  assert.equal((await app.request('/dispatcher/')).status, 401);
  assert.equal((await app.request('/dispatcher/', {
    headers: { authorization: 'Bearer wrong' },
  })).status, 401);
});

test('dispatcher: dashboard lists pending orders', async () => {
  const order = await draftOrder();
  const res = await app.request(`/dispatcher/?token=${TOKEN}`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Pending voice orders/);
  assert.ok(html.includes(order.customer_phone));
});

test('dispatcher: approve corrects items, reviews via dispatcher_review, hits intake stub', async () => {
  const order = await draftOrder();
  const corrected = [{ name_yo: 'gaàrí', name_en: 'garri', qty: 2, unit: 'congo' }];
  const res = await app.request(`/dispatcher/orders/${order.id}/review`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      action: 'approved', reviewer: 'ada-test', items: JSON.stringify(corrected),
    }).toString(),
  });
  assert.equal(res.status, 200);
  const { order: reviewed } = await res.json();
  assert.equal(reviewed.status, 'approved');
  assert.equal(reviewed.reviewed_by, 'ada-test');
  assert.equal(reviewed.confirmation_path, 'manual_callback');
  assert.match(reviewed.rundey_order_id, /^stub-/);
  assert.equal(reviewed.items[0].qty, 2);
});

test('dispatcher: reject path', async () => {
  const order = await draftOrder();
  const res = await app.request(`/dispatcher/orders/${order.id}/review`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ action: 'rejected', reviewer: 'ada-test' }).toString(),
  });
  assert.equal(res.status, 200);
  const { order: reviewed } = await res.json();
  assert.equal(reviewed.status, 'rejected');
  assert.equal(reviewed.rundey_order_id, null);
});

test('dispatcher: double-review is refused', async () => {
  const order = await draftOrder();
  await dispatcherQuery(`select dispatcher_review($1, 'rejected', 'first')`, [order.id]);
  const res = await app.request(`/dispatcher/orders/${order.id}/review`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ action: 'approved', reviewer: 'second' }).toString(),
  });
  assert.equal(res.status, 409);
});

test.after(async () => { await closePool(); });
