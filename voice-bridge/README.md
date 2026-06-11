# RUNDEY Voice Bridge

Yoruba voice ordering line for elders in Owo, Ondo State. An elder dials an
ordinary GSM number, speaks a market order in Yoruba, and it lands as a draft
order in RUNDEY's Supabase — confirmed by a human dispatcher before anything
is fulfilled.

**Design rule (non-negotiable): zero new behavior for the elder.** No app, no
menu trees, no English. Dial, speak, listen.

> **Repo note:** built inside the main RUNDEY repo under `voice-bridge/`
> because this session's GitHub credentials could not create the intended
> standalone `rundey-voice-bridge` repo. It is fully self-contained (own
> package.json, no imports from the app) — extract with
> `git subtree split --prefix voice-bridge` when the repo exists.

## Architecture

```
elder (GSM call)
  └─ Africa's Talking Voice ── webhook ──► Hono on Railway
       1. play cached Yoruba greeting (pre-generated MP3, never live TTS)
       2. record (silence-trim, 60s max)
       3. archive audio FIRST  ──────────► Supabase Storage  (voice_audio_archive)
       4. ASR (Spitch, swappable)  ──────► voice_calls.transcript
       5. intent parse (Claude Haiku) ───► voice_orders status=pending_review
       6. play cached Yoruba closing
  dispatcher dashboard (/dispatcher) ────► approve/edit/reject (human, always)
       approve ► dispatcher_review() in DB ► POST to RUNDEY order intake
```

Every call's audio + transcript is archived: this is the elder-voice Yoruba
dataset (no major provider ships Yoruba live translation today — the gap is
the strategic asset).

## Charter (Governance Tree)

This service may **INSERT draft orders only**. It can never confirm, cancel,
or modify confirmed orders. Enforced in the database by a SECURITY DEFINER
trigger (`vb_private.charter_guard`) — not RLS, because the Supabase
service role bypasses RLS but cannot bypass triggers. The only path to
`approved/rejected/confirmed` is the `dispatcher_review()` function, invoked
by the dispatcher dashboard after a human decision. `npm test` proves the
service role cannot escalate (see `test/charter.test.js`, including a
GUC-spoofing attempt).

## Stack

Node 22 + Hono on Railway · Africa's Talking Voice (telephony) · Spitch
(Yoruba ASR/TTS, behind `ASRProvider`/`TTSProvider` interfaces; YarnGPT
fallback) · Claude Haiku (intent → order JSON) · RUNDEY's existing Supabase
(new tables: `voice_calls`, `voice_orders`, `voice_audio_archive`).

## Running

```bash
npm install
npm run fixtures              # generate the synthetic eval suite
npm run eval                  # extraction scorecard (gate: >= 8/10)
bash scripts/setup-local-db.sh   # local Postgres mirroring Supabase semantics
DATABASE_URL=postgres://vb_service:vb_service_test@127.0.0.1:5432/voice_bridge npm test
npm start                     # see src/config.js for all env vars
```

Provider selection is env-driven: `ASR_PROVIDER=stub|spitch`,
`INTENT_PROVIDER=lexicon|haiku`, `ARCHIVE_DRIVER=local|supabase`. The `stub`
ASR + `lexicon` parser run the entire pipeline offline; they are also the
permanent regression baseline once real providers are keyed.

## Eval

`npm run eval` scores item-name + quantity extraction over 10 fixtures
(clean / multi-item / noise-overlaid / code-switched / silence / non-order).
**Fixtures are synthetic scaffolding** — see `fixtures/README.md`. No
real-world accuracy claim is valid until they are replaced with consented
elder recordings and re-run against live Spitch + Haiku.

## Deploy checklist (blocked on §7 open items)

1. `SPITCH_API_KEY` — then `node scripts/generate-prompts.js` (greeting,
   closing, consent MP3s) and re-run eval with `ASR_PROVIDER=spitch`.
2. Africa's Talking account + Nigerian virtual number; point the voice
   callback at `POST /webhooks/voice`; set `PUBLIC_BASE_URL`.
3. `ANTHROPIC_API_KEY` — re-run eval with `INTENT_PROVIDER=haiku`.
4. Apply `migrations/001_voice_bridge.sql` to the RUNDEY Supabase project and
   create the `voice-audio` storage bucket (this session had no access to
   that project — migration is written for it but **not yet applied**).
5. Name the Phase-1 dispatcher; set `DISPATCHER_TOKEN`.
6. Consent script (`src/providers/tts/prompts.js`) is a DRAFT — legal +
   cultural review required before launch.

## Out of scope (Phase 2+)

Outbound check-in calls · payment by voice · streaming translation ·
IVR menus · anything elder-facing beyond dial/speak/listen.
