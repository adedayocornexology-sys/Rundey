// Africa's Talking Voice webhooks. AT POSTs application/x-www-form-urlencoded
// and expects an XML response telling it what to do on the call.
// Flow: first event (isActive=1) -> play cached greeting, record.
//       recording event (recordingUrl set) -> play cached closing, process async.
//       final event (isActive=0, no recording seen) -> mark partial/no_audio.
import { Hono } from 'hono';
import { query } from '../db.js';
import { config } from '../config.js';
import { findOrCreateCall, processRecording } from '../services/callFlow.js';

const xml = (body) => `<?xml version="1.0" encoding="UTF-8"?>\n<Response>${body}</Response>`;

export const webhooks = new Hono();

webhooks.post('/voice', async (c) => {
  let form;
  try {
    form = await c.req.parseBody();
  } catch {
    return c.json({ error: 'malformed webhook body' }, 400);
  }

  const sessionId = form.sessionId;
  const callerPhone = form.callerNumber;
  if (typeof sessionId !== 'string' || !sessionId
    || typeof callerPhone !== 'string' || !callerPhone) {
    return c.json({ error: 'missing sessionId/callerNumber' }, 400);
  }

  const isActive = String(form.isActive ?? '');
  const recordingUrl = typeof form.recordingUrl === 'string' && form.recordingUrl
    ? form.recordingUrl : null;
  const durationSeconds = form.durationInSeconds ? Number(form.durationInSeconds) : null;

  // Recording delivered: thank the caller in Yoruba, process in background.
  if (recordingUrl) {
    processRecording({ sessionId, callerPhone, recordingUrl, durationSeconds })
      .catch((err) => console.error('[callflow]', sessionId, err));
    c.header('content-type', 'application/xml');
    return c.body(xml(`<Play url="${config.publicBaseUrl}/prompts/closing.mp3"/>`));
  }

  // Call still active and no recording yet: greet + record.
  if (isActive === '1') {
    await findOrCreateCall({ sessionId, callerPhone });
    c.header('content-type', 'application/xml');
    return c.body(xml(
      `<Play url="${config.publicBaseUrl}/prompts/greeting.mp3"/>`
      + `<Record trimSilence="true" playBeep="true" maxLength="60" `
      + `callbackUrl="${config.publicBaseUrl}/webhooks/voice"/>`,
    ));
  }

  // Final hangup event with no recording: caller hung up before/while recording.
  await query(
    `update voice_calls set status = case when status='in_progress' then 'partial' else status end,
            ended_at = coalesce(ended_at, now())
     where at_session_id = $1`,
    [sessionId],
  );
  c.header('content-type', 'application/xml');
  return c.body(xml(''));
});
