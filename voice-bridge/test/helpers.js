import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

// Must run before any src/ module is imported (config reads env at import).
export function testEnv() {
  process.env.DATABASE_URL ??= 'postgres://vb_service:vb_service_test@127.0.0.1:5432/voice_bridge';
  process.env.DISPATCHER_DATABASE_URL ??= 'postgres://vb_dispatcher:vb_dispatcher_test@127.0.0.1:5432/voice_bridge';
  process.env.ASR_PROVIDER = 'stub';
  process.env.INTENT_PROVIDER = 'lexicon';
  process.env.ARCHIVE_DRIVER = 'local';
  process.env.ARCHIVE_LOCAL_DIR = mkdtempSync(join(tmpdir(), 'vb-archive-'));
  process.env.DISPATCHER_TOKEN = 'test-dispatch-token';
  process.env.FIXTURES_SYNTHETIC = '1';
}

export const fixturePath = (slug) =>
  new URL(`../fixtures/${slug}/audio.wav`, import.meta.url).pathname;

// Tiny HTTP server standing in for Africa's Talking recording storage.
export async function serveBuffer(buffer, { status = 200 } = {}) {
  const server = createServer((req, res) => {
    res.writeHead(status, { 'content-type': 'audio/wav' });
    res.end(status === 200 ? buffer : 'error');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/recording.wav`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export async function pollFor(fn, { timeoutMs = 5000, intervalMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() > deadline) throw new Error('pollFor: timed out');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export const uniqueSession = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
