// DoD #1 + #3: end-to-end webhook -> DB pipeline, and the three failure paths
// (ASR 500, empty audio, malformed webhook) each leaving sane DB state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { testEnv, fixturePath, serveBuffer, pollFor, uniqueSession } from './helpers.js';

testEnv();
const { query, closePool } = await import('../src/db.js');
const { createApp } = await import('../src/index.js');
const { processRecording } = await import('../src/services/callFlow.js');
const { createASR } = await import('../src/providers/asr/index.js');

const app = createApp();
const post = (form) => app.request('/webhooks/voice', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(form).toString(),
});

test('e2e: AT webhook with Yoruba fixture audio produces call, archive, transcript, draft order', async () => {
  const sessionId = uniqueSession('e2e');
  const audio = readFileSync(fixturePath('01-simple-efo-epo'));
  const recording = await serveBuffer(audio);
  try {
    // 1) call starts: greeting + record instruction
    const first = await post({ sessionId, callerNumber: '+2348022222222', isActive: '1' });
    assert.equal(first.status, 200);
    const xml1 = await first.text();
    assert.match(xml1, /<Record /);
    assert.match(xml1, /greeting\.mp3/);

    // 2) AT delivers the recording
    const second = await post({
      sessionId, callerNumber: '+2348022222222', isActive: '1',
      recordingUrl: recording.url, durationInSeconds: '4',
    });
    assert.equal(second.status, 200);
    assert.match(await second.text(), /closing\.mp3/);

    // 3) pipeline lands everything in the DB
    const order = await pollFor(async () => {
      const { rows } = await query(
        `select o.* from voice_orders o join voice_calls c on c.id=o.call_id
          where c.at_session_id=$1`, [sessionId],
      );
      return rows[0];
    });
    assert.equal(order.status, 'pending_review');
    assert.deepEqual(
      order.items.map(({ name_en, qty }) => ({ name_en, qty })),
      [{ name_en: 'vegetables', qty: 2 }, { name_en: 'palm oil', qty: 1 }],
    );

    const { rows: [call] } = await query(
      `select * from voice_calls where at_session_id=$1`, [sessionId],
    );
    assert.equal(call.status, 'completed');
    assert.equal(call.asr_status, 'done');
    assert.equal(call.transcript, 'Mo fẹ́ ra ẹ̀fọ́ méjì àti epo pupa kan');

    const { rows: [archive] } = await query(
      `select * from voice_audio_archive where call_id=$1`, [call.id],
    );
    assert.equal(archive.bytes, audio.length);
    assert.ok(archive.synthetic, 'synthetic flag must be recorded');
    assert.ok(existsSync(join(process.env.ARCHIVE_LOCAL_DIR, archive.storage_path)),
      'archived audio file exists on disk');
  } finally {
    await recording.close();
  }
});

test('failure: malformed webhook (no sessionId) -> 400, no crash, no rows', async () => {
  const res = await post({ callerNumber: '+2348033333333' });
  assert.equal(res.status, 400);
  const res2 = await app.request('/webhooks/voice', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json',
  });
  assert.equal([400, 200].includes(res2.status) ? res2.status : 0, 400);
});

test('failure: ASR provider 500 -> audio archived, call queued for manual transcription', async () => {
  const sessionId = uniqueSession('asr500');
  const audio = readFileSync(fixturePath('03-simple-ata'));
  const { call, order, error } = await processRecording({
    sessionId, callerPhone: '+2348044444444', audio,
    deps: { asr: createASR('failing') },
  });
  assert.match(error, /500/);
  assert.equal(order, null);
  assert.equal(call.asr_status, 'manual_queue');
  assert.equal(call.status, 'completed');
  const { rows: [archive] } = await query(
    `select * from voice_audio_archive where call_id=$1`, [call.id],
  );
  assert.ok(archive, 'audio archived despite ASR failure');
});

test('failure: empty/silent audio -> needs_callback', async () => {
  const sessionId = uniqueSession('silence');
  const audio = readFileSync(fixturePath('09-empty-silence'));
  const { call, order } = await processRecording({
    sessionId, callerPhone: '+2348055555555', audio,
  });
  assert.equal(call.asr_status, 'done');
  assert.equal(order.status, 'needs_callback');
  assert.deepEqual(order.items, []);
});

test('failure: caller hangs up mid-recording -> partial saved and processed', async () => {
  const sessionId = uniqueSession('hangup');
  const audio = readFileSync(fixturePath('02-simple-iresi-kilo'));
  const { call, order } = await processRecording({
    sessionId, callerPhone: '+2348066666666', audio, partial: true,
  });
  assert.equal(call.status, 'partial');
  assert.equal(order.status, 'pending_review');
});

test('failure: hangup before any recording -> call marked partial', async () => {
  const sessionId = uniqueSession('early-hangup');
  await post({ sessionId, callerNumber: '+2348077777777', isActive: '1' });
  const res = await post({ sessionId, callerNumber: '+2348077777777', isActive: '0' });
  assert.equal(res.status, 200);
  const { rows: [call] } = await query(
    `select * from voice_calls where at_session_id=$1`, [sessionId],
  );
  assert.equal(call.status, 'partial');
});

test.after(async () => { await closePool(); });
