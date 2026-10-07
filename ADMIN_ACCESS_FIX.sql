-- PROPOSAL FOR REVIEW ONLY. Not applied; production approval is pending.
BEGIN;
CREATE OR REPLACE FUNCTION public.admin_ban_user(target uuid, reason text, hours integer DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me_role text; target_role text;
begin
  select app_role into me_role from public.profiles where id=auth.uid();
  select app_role into target_role from public.profiles where id=target;
  if auth.uid() is null or coalesce(me_role,'') not in ('owner','admin','moderator') then raise exception 'staff required'; end if;
  if public.role_rank(me_role) <= public.role_rank(target_role) then raise exception 'cannot ban equal/higher role'; end if;
  update public.profiles set is_banned=true,ban_reason=left(coalesce(reason,''),500),banned_until=case when coalesce(hours,0)>0 then now()+make_interval(hours=>hours) else null end where id=target;
  perform public.admin_log('ban',target,jsonb_build_object('reason',reason,'hours',hours));
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_delete_content(content_kind text, content_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare k text:=lower(coalesce(content_kind,'')); affected integer:=0; role text;
begin
  select app_role into role from public.profiles where id=auth.uid();
  if auth.uid() is null or coalesce(role,'') not in ('owner','admin','moderator') then raise exception 'staff required'; end if;
  if role='moderator' and k in ('conversations','channels','loans','properties','friendships','referrals') then raise exception 'owner/admin required'; end if;
  case k
    when 'conversations' then delete from public.conversations where id=content_id::uuid;
    when 'messages' then delete from public.messages where id=content_id::bigint;
    when 'channels' then delete from public.rndm_channels where id=content_id::uuid;
    when 'channel_posts' then delete from public.rndm_channel_posts where id=content_id::uuid;
    when 'channel_comments' then delete from public.rndm_channel_comments where id=content_id::bigint;
    when 'clips' then delete from public.clips where id=content_id::uuid;
    when 'clip_comments' then delete from public.clip_comments where id=content_id::bigint;
    when 'videos' then delete from public.rndm_videos where id=content_id::uuid;
    when 'video_comments' then delete from public.rndm_video_comments where id=content_id::bigint;
    when 'market' then delete from public.marketplace_listings where id=content_id::uuid;
    when 'stories' then delete from public.stories where id=content_id::uuid;
    when 'events' then delete from public.rndm_events where id=content_id::uuid;
    when 'loans' then delete from public.game_loans where id=content_id::uuid;
    when 'properties' then delete from public.demo_properties where id=content_id::uuid;
    when 'friendships' then delete from public.friendships where id=content_id::bigint;
    when 'notifications' then delete from public.notifications where id=content_id::bigint;
    when 'cloud_state' then delete from public.user_state where user_id=split_part(content_id,'|',1)::uuid and key=split_part(content_id,'|',2);
    when 'owned_properties' then delete from public.owned_properties where user_id=split_part(content_id,'|',1)::uuid and property_id=split_part(content_id,'|',2)::uuid;
    when 'daily_claims' then delete from public.daily_claims where user_id=split_part(content_id,'|',1)::uuid and claim_date=split_part(content_id,'|',2)::date;
    when 'interests' then delete from public.profile_interests where user_id=split_part(content_id,'|',1)::uuid and interest=split_part(content_id,'|',2);
    when 'follows' then delete from public.rndm_follows where follower_id=split_part(content_id,'|',1)::uuid and followee_id=split_part(content_id,'|',2)::uuid;
    when 'referrals' then delete from public.referrals where id=content_id::bigint;
    else raise exception 'unsupported content kind: %',content_kind;
  end case;
  get diagnostics affected=row_count;
  perform public.admin_log('content_delete',null,jsonb_build_object('kind',k,'id',content_id,'affected',affected));
  return jsonb_build_object('ok',true,'affected',affected);
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_set_role(target uuid, new_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me_role text; target_role text;
begin
  select app_role into me_role from public.profiles where id=auth.uid();
  select app_role into target_role from public.profiles where id=target;
  if auth.uid() is null or coalesce(me_role,'') not in ('owner','admin') then raise exception 'admin required'; end if;
  if new_role not in ('user','premium','verified','moderator','admin','owner') then raise exception 'invalid role'; end if;
  if me_role <> 'owner' and (new_role in ('owner','admin') or target_role in ('owner','admin')) then raise exception 'owner required'; end if;
  if target=auth.uid() and me_role='owner' and new_role<>'owner' then raise exception 'owner cannot demote self'; end if;
  update public.profiles set app_role=new_role where id=target;
  perform public.admin_log('set_role',target,jsonb_build_object('role',new_role));
end $function$
;
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE me uuid := auth.uid();
BEGIN
  -- A SECURITY DEFINER RPC runs as its database owner. A direct API update
  -- runs as authenticated; do not let it edit rewards or moderation fields.
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;
  NEW.app_role := OLD.app_role;
  NEW.is_verified := OLD.is_verified;
  NEW.is_premium := OLD.is_premium;
  NEW.is_banned := OLD.is_banned;
  NEW.ban_reason := OLD.ban_reason;
  NEW.banned_until := OLD.banned_until;
  NEW.reputation := OLD.reputation;
  NEW.xp := OLD.xp;
  NEW.stars := OLD.stars;
  NEW.referral_code := OLD.referral_code;
  NEW.referred_by := OLD.referred_by;
  NEW.referral_count := OLD.referral_count;
  NEW.referral_stars_earned := OLD.referral_stars_earned;
  NEW.referral_coins_earned := OLD.referral_coins_earned;
  NEW.muted_until := OLD.muted_until;
  NEW.publish_blocked_until := OLD.publish_blocked_until;
  RETURN NEW;
END
$function$
;
COMMIT;

