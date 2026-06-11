// Pipeline orchestration: recording -> archive -> ASR -> intent -> draft order.
// Failure paths are first-class:
//   - ASR provider failure  -> audio is already archived; call goes to
//     asr_status='manual_queue' for human transcription. Never lose audio.
//   - Empty/unintelligible  -> voice_orders row with status='needs_callback'.
//   - Hangup mid-recording  -> partial audio saved, call status='partial'.
import { query } from '../db.js';
import { createASR, AsrError } from '../providers/asr/index.js';
import { createIntentParser } from '../intent/index.js';
import { createArchive } from './archive.js';

export async function findOrCreateCall({ sessionId, callerPhone }) {
  const { rows } = await query(
    `insert into voice_calls (at_session_id, caller_phone)
     values ($1, $2)
     on conflict (at_session_id) do update set at_session_id = excluded.at_session_id
     returning *`,
    [sessionId, callerPhone],
  );
  return rows[0];
}

async function downloadRecording(recordingUrl) {
  const res = await fetch(recordingUrl);
  if (!res.ok) throw new Error(`recording download failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Treat tiny payloads as no usable audio (GSM silence-trimmed hangups).
const MIN_AUDIO_BYTES = 256;

export async function processRecording({
  sessionId,
  callerPhone,
  recordingUrl = null,
  audio = null,
  durationSeconds = null,
  partial = false,
  deps = {},
}) {
  const asr = deps.asr ?? createASR();
  const intent = deps.intent ?? createIntentParser();
  const archive = deps.archive ?? createArchive();

  const call = await findOrCreateCall({ sessionId, callerPhone });

  if (!audio && recordingUrl) {
    try {
      audio = await downloadRecording(recordingUrl);
    } catch (err) {
      // Download failed: there is no audio to archive, but the caller still
      // reached us — surface a callback work item so the elder isn't dropped.
      await query(
        `update voice_calls set status='failed', asr_status='skipped', recording_url=$2, ended_at=now() where id=$1`,
        [call.id, recordingUrl],
      );
      const order = await insertOrder({
        callId: call.id, callerPhone, items: [], confidence: 0, status: 'needs_callback',
      });
      return { call: await getCall(call.id), order, error: `download: ${err.message}` };
    }
  }

  if (!audio || audio.length < MIN_AUDIO_BYTES) {
    await query(
      `update voice_calls set status='no_audio', asr_status='skipped',
              recording_url=$2, ended_at=now() where id=$1`,
      [call.id, recordingUrl],
    );
    const order = await insertOrder({
      callId: call.id, callerPhone, items: [], confidence: 0, status: 'needs_callback',
    });
    return { call: await getCall(call.id), order };
  }

  // Archive FIRST — the dataset survives every downstream failure.
  const { storagePath, bytes } = await archive.put({ callId: call.id, audio });
  await query(
    `insert into voice_audio_archive (call_id, storage_path, bytes, duration_seconds, synthetic)
     values ($1, $2, $3, $4, $5)`,
    [call.id, storagePath, bytes, durationSeconds, process.env.FIXTURES_SYNTHETIC === '1'],
  );

  const callStatus = partial ? 'partial' : 'completed';

  let asrResult;
  try {
    asrResult = await asr.transcribe({ audio, mimeType: 'audio/wav' });
  } catch (err) {
    const queued = err instanceof AsrError;
    await query(
      `update voice_calls set status=$2, asr_status=$3, recording_url=$4, ended_at=now()
       where id=$1`,
      [call.id, callStatus, queued ? 'manual_queue' : 'failed', recordingUrl],
    );
    return { call: await getCall(call.id), order: null, error: `asr: ${err.message}` };
  }

  await query(
    `update voice_calls set status=$2, asr_status='done', asr_provider=$3,
            asr_confidence=$4, transcript=$5, recording_url=$6, ended_at=now()
     where id=$1`,
    [call.id, callStatus, asrResult.provider, asrResult.confidence, asrResult.transcript, recordingUrl],
  );

  if (!asrResult.transcript.trim()) {
    const order = await insertOrder({
      callId: call.id, callerPhone, items: [], confidence: 0, status: 'needs_callback',
    });
    return { call: await getCall(call.id), order };
  }

  const parsed = await intent.parse({ transcript: asrResult.transcript, callerPhone });
  const noItems = parsed.items.length === 0;
  const order = await insertOrder({
    callId: call.id,
    callerPhone,
    items: parsed.items,
    confidence: Math.min(asrResult.confidence, parsed.confidence),
    status: noItems ? 'needs_callback' : 'pending_review',
  });
  return { call: await getCall(call.id), order };
}

async function insertOrder({ callId, callerPhone, items, confidence, status }) {
  const { rows } = await query(
    `insert into voice_orders (call_id, customer_phone, items, confidence, status)
     values ($1, $2, $3::jsonb, $4, $5) returning *`,
    [callId, callerPhone, JSON.stringify(items), confidence, status],
  );
  return rows[0];
}

async function getCall(id) {
  const { rows } = await query(`select * from voice_calls where id=$1`, [id]);
  return rows[0];
}
