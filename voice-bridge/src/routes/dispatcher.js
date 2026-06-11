// Dispatcher dashboard: plain Hono-served HTML, no framework. The human
// confirmation queue — every order a rider fulfills passed through a person
// clicking Approve here. Auth: Bearer DISPATCHER_TOKEN (or ?token= for the
// audio elements, which can't set headers).
import { Hono } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { dispatcherQuery as query } from '../db.js';
import { config } from '../config.js';
import { createArchive } from '../services/archive.js';
import { submitToRundey } from '../services/rundeyIntake.js';

export const dispatcher = new Hono();

function tokenMatches(provided) {
  const a = Buffer.from(String(provided));
  const b = Buffer.from(config.dispatcherToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

dispatcher.use('*', async (c, next) => {
  if (!config.dispatcherToken) return c.json({ error: 'dispatcher disabled: DISPATCHER_TOKEN not set' }, 503);
  const header = c.req.header('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '') || c.req.query('token') || '';
  if (!tokenMatches(token)) return c.json({ error: 'unauthorized' }, 401);
  await next();
});

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

dispatcher.get('/', async (c) => {
  const { rows } = await query(
    `select o.*, c.transcript, c.asr_confidence, c.asr_status,
            (select a.id from voice_audio_archive a where a.call_id = o.call_id
              order by a.created_at desc limit 1) as archive_id
       from voice_orders o
       join voice_calls c on c.id = o.call_id
      where o.status in ('pending_review','needs_callback')
      order by o.created_at asc`,
  );
  const token = c.req.query('token') ?? '';
  const cards = rows.map((o) => `
  <article class="card">
    <header>
      <strong>${esc(o.customer_phone)}</strong>
      <span class="badge ${esc(o.status)}">${esc(o.status)}</span>
      <span>conf: ${o.confidence == null ? '—' : Number(o.confidence).toFixed(2)}</span>
      <time>${esc(o.created_at?.toISOString?.() ?? o.created_at)}</time>
    </header>
    ${o.archive_id
      ? `<audio controls preload="none" src="/dispatcher/audio/${o.archive_id}?token=${encodeURIComponent(token)}"></audio>`
      : '<p class="muted">no audio archived</p>'}
    <p class="transcript">${esc(o.transcript) || '<em>(no transcript — ' + esc(o.asr_status) + ')</em>'}</p>
    <form method="post" action="/dispatcher/orders/${o.id}/review?token=${encodeURIComponent(token)}">
      <textarea name="items" rows="4">${esc(JSON.stringify(o.items, null, 1))}</textarea>
      <input name="reviewer" placeholder="your name" required>
      <button name="action" value="approved">Approve → RUNDEY</button>
      <button name="action" value="rejected" class="danger">Reject</button>
    </form>
  </article>`).join('\n');

  return c.html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RUNDEY Voice Bridge — Dispatcher</title>
<style>
 body{font:16px/1.5 system-ui;margin:0;background:#f4f2ee;color:#1d1d1d}
 main{max-width:760px;margin:0 auto;padding:16px}
 .card{background:#fff;border-radius:10px;padding:14px;margin:12px 0;box-shadow:0 1px 3px rgba(0,0,0,.12)}
 .card header{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
 .badge{padding:1px 8px;border-radius:99px;font-size:13px;background:#ffe9a8}
 .badge.needs_callback{background:#ffd2c2}
 audio{width:100%;margin:8px 0}
 .transcript{background:#f8f7f4;border-radius:6px;padding:8px}
 textarea{width:100%;font:13px/1.4 ui-monospace,monospace;box-sizing:border-box}
 input,button{font:inherit;padding:6px 12px;margin:4px 4px 0 0}
 button{background:#1b7f4d;color:#fff;border:0;border-radius:6px;cursor:pointer}
 button.danger{background:#b3372b}
 .muted{color:#777}
</style></head><body><main>
<h1>Pending voice orders (${rows.length})</h1>
${cards || '<p class="muted">Queue is empty.</p>'}
</main></body></html>`);
});

dispatcher.get('/audio/:archiveId', async (c) => {
  const { rows } = await query(
    `select storage_path from voice_audio_archive where id=$1`, [c.req.param('archiveId')],
  );
  if (!rows[0]) return c.json({ error: 'not found' }, 404);
  const audio = await createArchive().get(rows[0].storage_path);
  if (!audio) return c.json({ error: 'audio missing from archive' }, 404);
  c.header('content-type', 'audio/wav');
  return c.body(audio);
});

// The ONLY route to approved/rejected — goes through dispatcher_review() in
// the database, which is the only thing the charter trigger lets through.
dispatcher.post('/orders/:id/review', async (c) => {
  const orderId = c.req.param('id');
  const body = await c.req.parseBody();
  const action = String(body.action ?? '');
  const reviewer = String(body.reviewer ?? '').trim();
  if (!['approved', 'rejected'].includes(action)) return c.json({ error: 'invalid action' }, 400);
  if (!reviewer) return c.json({ error: 'reviewer required' }, 400);

  // Dispatcher may correct the parsed items before approving (status still
  // pending — the charter trigger only guards status transitions).
  if (typeof body.items === 'string' && body.items.trim()) {
    let items;
    try {
      items = JSON.parse(body.items);
      if (!Array.isArray(items)) throw new Error('items must be an array');
    } catch (err) {
      return c.json({ error: `invalid items JSON: ${err.message}` }, 400);
    }
    await query(`update voice_orders set items=$2::jsonb where id=$1 and status in ('pending_review','needs_callback')`,
      [orderId, JSON.stringify(items)]);
  }

  let order;
  try {
    // Phase 1: outbound TTS confirmation call not built yet — dispatcher
    // calls the elder back manually; the path used is recorded per spec §3.8.
    const { rows } = await query(
      `select * from dispatcher_review($1, $2, $3, $4, $5)`,
      [orderId, action, reviewer, null, action === 'approved' ? 'manual_callback' : null],
    );
    order = rows[0];
  } catch (err) {
    return c.json({ error: err.message }, 409);
  }

  if (action === 'approved') {
    try {
      const { rundeyOrderId, mode } = await submitToRundey(order);
      await query(`update voice_orders set rundey_order_id=$2 where id=$1`, [order.id, rundeyOrderId]);
      order.rundey_order_id = rundeyOrderId;
      order.intake_mode = mode;
    } catch (err) {
      // Order stays 'approved' with no rundey_order_id — visible for retry.
      return c.json({ order, warning: `RUNDEY intake failed: ${err.message}` }, 502);
    }
  }

  const accept = c.req.header('accept') ?? '';
  if (accept.includes('text/html')) {
    return c.redirect(`/dispatcher/?token=${encodeURIComponent(c.req.query('token') ?? '')}`);
  }
  return c.json({ order });
});
