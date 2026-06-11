// ASRProvider interface:
//   async transcribe({ audio: Buffer, mimeType: string }) ->
//     { transcript: string, confidence: number (0..1), provider: string }
// Throws AsrError on provider failure. An empty transcript with low
// confidence is a VALID result (silence / unintelligible), not an error.

import { config } from '../../config.js';
import { SpitchASR } from './spitch.js';
import { StubASR } from './stub.js';

export class AsrError extends Error {
  constructor(message, { status, provider } = {}) {
    super(message);
    this.name = 'AsrError';
    this.status = status;
    this.provider = provider;
  }
}

export function createASR(name = config.asrProvider) {
  switch (name) {
    case 'spitch': return new SpitchASR();
    case 'stub': return new StubASR();
    case 'failing': // test-only: simulates a provider 500
      return {
        provider: 'failing',
        async transcribe() {
          throw new AsrError('ASR provider returned 500', { status: 500, provider: 'failing' });
        },
      };
    default: throw new Error(`Unknown ASR provider: ${name}`);
  }
}
