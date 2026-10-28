-- Restrict mutation RPCs to authenticated callers. Supabase may grant EXECUTE
-- directly to anon when functions are created, so revoking PUBLIC alone is
-- insufficient. This migration changes privileges only; it does not edit data.
begin;

revoke execute on function public.set_match_result(uuid,smallint,smallint,text) from public, anon;
revoke execute on function public.confirm_competition_title(uuid,uuid,smallint) from public, anon;
revoke execute on function public.review_organizer(uuid,text) from public, anon;
revoke execute on function public.set_penalty_shootout(uuid,smallint,smallint) from public, anon;
revoke execute on function public.set_competition_publication(uuid,boolean) from public, anon;
revoke execute on function public.create_competition_with_season(uuid,text,text,text,text) from public, anon;
revoke execute on function public.create_competition_setup(uuid,text,text,text,text,text) from public, anon;
revoke execute on function public.set_competition_archive(uuid,boolean) from public, anon;
revoke execute on function public.confirm_competition_draw(uuid,text,jsonb,jsonb) from public, anon;
revoke execute on function public.create_competition_mode(uuid,text,text,text,text,text,text) from public, anon;

commit;
