// Audio archive drivers. Every call's audio is archived BEFORE ASR is
// attempted — the recordings are the elder-voice Yoruba dataset.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from '../config.js';

class LocalArchive {
  driver = 'local';

  async put({ callId, audio, ext = 'wav' }) {
    const rel = join(new Date().toISOString().slice(0, 10), `${callId}.${ext}`);
    const abs = join(config.archiveLocalDir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, audio);
    return { storagePath: rel, bytes: audio.length };
  }

  async get(storagePath) {
    const abs = join(config.archiveLocalDir, storagePath);
    if (!existsSync(abs)) return null;
    return readFileSync(abs);
  }
}

// Supabase Storage via REST. Used on Railway with the service role key.
class SupabaseArchive {
  driver = 'supabase';

  async put({ callId, audio, ext = 'wav', mimeType = 'audio/wav' }) {
    const rel = `${new Date().toISOString().slice(0, 10)}/${callId}.${ext}`;
    const res = await fetch(
      `${config.supabaseUrl}/storage/v1/object/${config.archiveBucket}/${rel}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
          'content-type': mimeType,
          'x-upsert': 'true',
        },
        body: audio,
      },
    );
    if (!res.ok) throw new Error(`Supabase Storage upload failed: HTTP ${res.status}`);
    return { storagePath: rel, bytes: audio.length };
  }

  async get(storagePath) {
    const res = await fetch(
      `${config.supabaseUrl}/storage/v1/object/${config.archiveBucket}/${storagePath}`,
      { headers: { Authorization: `Bearer ${config.supabaseServiceRoleKey}` } },
    );
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
}

export function createArchive(name = config.archiveDriver) {
  switch (name) {
    case 'local': return new LocalArchive();
    case 'supabase': return new SupabaseArchive();
    default: throw new Error(`Unknown archive driver: ${name}`);
  }
}
