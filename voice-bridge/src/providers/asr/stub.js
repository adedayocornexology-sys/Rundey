// Stub ASR for Phase A / offline eval: looks up the sha256 of the audio in
// fixtures/manifest.json and returns the canned Yoruba transcript recorded
// there. Proves the pipeline and eval harness without a live ASR provider.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { config } from '../../config.js';
import { AsrError } from './index.js';

export class StubASR {
  provider = 'stub';

  #manifest;

  #load() {
    if (!this.#manifest) {
      this.#manifest = JSON.parse(readFileSync(config.fixturesManifest, 'utf8'));
    }
    return this.#manifest;
  }

  async transcribe({ audio }) {
    const sha = createHash('sha256').update(audio).digest('hex');
    const entry = this.#load()[sha];
    if (!entry) {
      throw new AsrError(`Stub ASR: unknown audio (sha256=${sha.slice(0, 12)}…) — regenerate fixtures`, {
        provider: this.provider,
      });
    }
    return {
      transcript: entry.transcript,
      confidence: entry.confidence,
      provider: this.provider,
    };
  }
}
