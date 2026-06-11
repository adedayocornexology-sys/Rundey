// IntentParser interface:
//   async parse({ transcript, callerPhone }) ->
//     { items: [{ name_yo, name_en, qty, unit }], customer_phone,
//       confidence: number (0..1), provider: string }

import { config } from '../config.js';
import { HaikuIntentParser } from './haiku.js';
import { LexiconIntentParser } from './lexicon.js';

export function createIntentParser(name = config.intentProvider) {
  switch (name) {
    case 'haiku': return new HaikuIntentParser();
    case 'lexicon': return new LexiconIntentParser();
    default: throw new Error(`Unknown intent provider: ${name}`);
  }
}
