# Eval fixtures — SYNTHETIC SCAFFOLDING, NOT EVIDENCE OF REAL-WORLD ACCURACY

Every fixture here is `synthetic=true`:

- **Audio** is programmatically generated (voice-band tones, tone+noise, or
  silence) — this environment has no FFmpeg and no Yoruba TTS key, so even
  TTS stand-ins were not possible. The audio's only job is to flow through
  the real pipeline (download → archive → ASR → parse → DB).
- **Transcripts** are the ground-truth Yoruba an ideal ASR would output,
  served by the stub ASR provider (`ASR_PROVIDER=stub`) keyed on audio sha256
  via `manifest.json`.

What the eval therefore measures **today**: intent extraction correctness
(Yoruba transcript → items + quantities) and pipeline behavior. What it does
**not** measure: real ASR accuracy on elderly, dialect-heavy GSM audio.

**Before any accuracy claim is made:**
1. Replace audio with Spitch-TTS-generated Yoruba (FFmpeg market-noise
   overlays for fixtures 06/07), then
2. Replace those with real, consented elder recordings from Owo, and
3. Re-run `npm run eval` with `ASR_PROVIDER=spitch INTENT_PROVIDER=haiku`.

Regenerate with `npm run fixtures` (deterministic — same hashes every run).
