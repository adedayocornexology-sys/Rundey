-- RUNDEY Voice Bridge — Layer 1 voice ordering tables
-- Target: RUNDEY Supabase project (also runs on plain PostgreSQL >= 14 for tests).
--
-- Charter (Governance Tree): this service may INSERT draft orders. It may
-- NEVER move an order to approved/rejected/confirmed by direct UPDATE —
-- those transitions are only possible through dispatcher_review(), which
-- represents a human dispatcher decision. Enforced by trigger, not RLS,
-- because the Supabase service_role bypasses RLS but cannot bypass triggers.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists voice_calls (
  id              uuid primary key default gen_random_uuid(),
  at_session_id   text unique,
  caller_phone    text not null,
  direction       text not null default 'inbound'
                  check (direction in ('inbound','outbound')),
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  recording_url   text,
  status          text not null default 'in_progress'
                  check (status in ('in_progress','completed','partial','no_audio','failed')),
  asr_status      text not null default 'pending'
                  check (asr_status in ('pending','done','failed','manual_queue','skipped')),
  asr_provider    text,
  asr_confidence  real,
  transcript      text,
  created_at      timestamptz not null default now()
);

create table if not exists voice_audio_archive (
  id               uuid primary key default gen_random_uuid(),
  call_id          uuid not null references voice_calls(id) on delete cascade,
  storage_path     text not null,
  bytes            integer,
  duration_seconds real,
  synthetic        boolean not null default false,
  consent_played   boolean not null default false,
  created_at       timestamptz not null default now()
);

create table if not exists voice_orders (
  id                uuid primary key default gen_random_uuid(),
  call_id           uuid not null references voice_calls(id) on delete cascade,
  customer_phone    text not null,
  items             jsonb not null default '[]'::jsonb,
  confidence        real,
  status            text not null default 'pending_review'
                    check (status in ('pending_review','needs_callback','approved','rejected','confirmed')),
  reviewed_by       text,
  reviewed_at       timestamptz,
  review_notes      text,
  confirmation_path text check (confirmation_path in ('tts_call','manual_callback')),
  rundey_order_id   text,
  created_at        timestamptz not null default now()
);

create index if not exists voice_orders_status_idx on voice_orders (status, created_at desc);
create index if not exists voice_calls_session_idx on voice_calls (at_session_id);

-- ---------------------------------------------------------------------------
-- RLS: deny-all for anon/authenticated. Only the service role (which
-- bypasses RLS on Supabase) and the dispatcher function touch these tables.
-- ---------------------------------------------------------------------------

alter table voice_calls         enable row level security;
alter table voice_audio_archive enable row level security;
alter table voice_orders        enable row level security;

-- ---------------------------------------------------------------------------
-- Charter enforcement
-- ---------------------------------------------------------------------------

create schema if not exists vb_private;
revoke all on schema vb_private from public;

create table if not exists vb_private.charter_nonce (
  id    boolean primary key default true check (id),
  nonce text not null
);
revoke all on vb_private.charter_nonce from public;

insert into vb_private.charter_nonce (id, nonce)
values (true, encode(gen_random_bytes(24), 'hex'))
on conflict (id) do nothing;

-- The guard runs SECURITY DEFINER so it can read the nonce table that the
-- service role cannot. A privileged status can only be written when the
-- transaction-local GUC matches the secret nonce, and the only code that can
-- read the nonce to set the GUC is dispatcher_review() below.
create or replace function vb_private.charter_guard()
returns trigger
language plpgsql
security definer
set search_path = vb_private, public
as $$
declare
  v_nonce text;
begin
  if new.status in ('approved','rejected','confirmed')
     and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    select nonce into v_nonce from vb_private.charter_nonce where id;
    if coalesce(current_setting('vb.dispatcher_nonce', true), '') <> v_nonce then
      raise exception 'CHARTER VIOLATION: voice_orders.status=''%'' may only be set via dispatcher_review()', new.status
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists charter_guard_upd on voice_orders;
create trigger charter_guard_upd
  before update of status on voice_orders
  for each row execute function vb_private.charter_guard();

drop trigger if exists charter_guard_ins on voice_orders;
create trigger charter_guard_ins
  before insert on voice_orders
  for each row execute function vb_private.charter_guard();

-- The single sanctioned path for review decisions. Called by the dispatcher
-- endpoint after a human acts in the dashboard.
create or replace function public.dispatcher_review(
  p_order_id          uuid,
  p_action            text,
  p_reviewer          text,
  p_notes             text default null,
  p_confirmation_path text default null
)
returns voice_orders
language plpgsql
security definer
set search_path = vb_private, public
as $$
declare
  v_nonce text;
  v_row   voice_orders;
begin
  if p_action not in ('approved','rejected','confirmed') then
    raise exception 'dispatcher_review: invalid action %', p_action;
  end if;
  if coalesce(trim(p_reviewer), '') = '' then
    raise exception 'dispatcher_review: reviewer identity is required';
  end if;

  select nonce into v_nonce from vb_private.charter_nonce where id;
  perform set_config('vb.dispatcher_nonce', v_nonce, true); -- txn-local

  update voice_orders
     set status            = p_action,
         reviewed_by       = p_reviewer,
         reviewed_at       = now(),
         review_notes      = coalesce(p_notes, review_notes),
         confirmation_path = coalesce(p_confirmation_path, confirmation_path)
   where id = p_order_id
     and status in ('pending_review','needs_callback','approved')
  returning * into v_row;

  perform set_config('vb.dispatcher_nonce', '', true);

  if v_row.id is null then
    raise exception 'dispatcher_review: order % not found or not reviewable', p_order_id;
  end if;
  return v_row;
end;
$$;
