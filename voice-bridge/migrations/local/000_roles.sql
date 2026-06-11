-- LOCAL/TEST ONLY — not for Supabase.
-- Mirrors Supabase semantics: vb_service plays the part of the service role
-- (BYPASSRLS, like Supabase service_role) so the charter trigger — not RLS —
-- is what stops it from confirming orders.
do $$
begin
  if not exists (select from pg_roles where rolname = 'vb_service') then
    create role vb_service login password 'vb_service_test' bypassrls;
  end if;
end $$;

grant usage on schema public to vb_service;
grant select, insert, update on voice_calls, voice_audio_archive, voice_orders to vb_service;
grant execute on function public.dispatcher_review(uuid, text, text, text, text) to vb_service;
