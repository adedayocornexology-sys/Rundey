-- LOCAL/TEST ONLY — not for Supabase.
-- Two roles enforcing the Governance Tree charter at the database layer:
--
--   vb_service    — the telephony/pipeline writer. BYPASSRLS (like Supabase
--                   service_role) so the charter TRIGGER, not RLS, is what
--                   stops it. May INSERT draft orders and write call/audio
--                   rows. It is NOT granted EXECUTE on dispatcher_review, so
--                   it cannot move an order to approved/rejected by any route.
--
--   vb_dispatcher — the dashboard's credential. May read the queue, correct
--                   item JSON, and EXECUTE dispatcher_review (the only path to
--                   approved/rejected). This is the human-in-the-loop role.
do $$
begin
  if not exists (select from pg_roles where rolname = 'vb_service') then
    create role vb_service login password 'vb_service_test' bypassrls;
  end if;
  if not exists (select from pg_roles where rolname = 'vb_dispatcher') then
    -- BYPASSRLS mirrors Supabase, where the dashboard also authenticates as
    -- service_role. RLS is deny-all for anon/authenticated only; the charter
    -- is enforced by the dispatcher_review EXECUTE grant + trigger, not RLS.
    create role vb_dispatcher login password 'vb_dispatcher_test' bypassrls;
  end if;
end $$;

grant usage on schema public to vb_service, vb_dispatcher;

-- Pipeline writer: tables yes, dispatcher_review NO.
grant select, insert, update on voice_calls, voice_audio_archive, voice_orders to vb_service;
revoke execute on function public.dispatcher_review(uuid, text, text, text, text) from vb_service;

-- Dashboard: read queue + correct items + the sanctioned review path.
grant select on voice_calls, voice_audio_archive, voice_orders to vb_dispatcher;
grant update on voice_orders to vb_dispatcher;
grant execute on function public.dispatcher_review(uuid, text, text, text, text) to vb_dispatcher;
