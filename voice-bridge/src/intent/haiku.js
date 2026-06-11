// Claude Haiku intent parser: Yoruba transcript -> structured order JSON.
// Requires ANTHROPIC_API_KEY; the eval suite runs the lexicon parser when no
// key is present, so this path must be re-evaluated (npm run eval with
// INTENT_PROVIDER=haiku) once a key is provisioned.
import { config } from '../config.js';

const SYSTEM = `You convert Yoruba (sometimes code-switched Yoruba/English) market
order transcripts from elderly callers in Owo, Nigeria into structured JSON.

Output ONLY a JSON object, no prose:
{"items":[{"name_yo":"...","name_en":"...","qty":1,"unit":null}],"confidence":0.0}

Rules:
- name_yo: the item as the caller said it (canonical Yoruba spelling with diacritics).
- name_en: common English market name (e.g. "palm oil", "garri", "beans").
- qty: integer; Yoruba numerals (kan=1, méjì=2, mẹ́ta=3, mẹ́rin=4, márùn-ún=5,
  mẹ́fà=6, méje=7, mẹ́jọ=8, mẹ́sàn-án=9, mẹ́wàá=10). Default 1 if unstated.
- unit: measure if stated (kílò->"kilo", ìgò->"bottle", kóńgò->"congo",
  páálí->"carton"), else null.
- If the transcript contains no purchasable items (greeting, small talk,
  silence), return {"items":[],"confidence":<low>}.
- confidence: your confidence that the extraction is complete and correct.`;

export class HaikuIntentParser {
  provider = 'haiku';

  async parse({ transcript, callerPhone }) {
    if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not configured');
    const res = await fetch(`${config.anthropicBaseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': config.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.haikuModel,
        max_tokens: 1024,
        temperature: 0,
        system: SYSTEM,
        messages: [{ role: 'user', content: `Transcript: ${transcript}` }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API failed: HTTP ${res.status}`);
    const data = await res.json();
    const text = data.content?.find((b) => b.type === 'text')?.text ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Haiku returned no JSON object');
    const parsed = JSON.parse(match[0]);
    return {
      items: (parsed.items ?? []).map((it) => ({
        name_yo: it.name_yo ?? '',
        name_en: it.name_en ?? '',
        qty: Number(it.qty) || 1,
        unit: it.unit ?? null,
      })),
      customer_phone: callerPhone,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      provider: this.provider,
    };
  }
}
