-- RNDM Conquest v71: independent, shared, server-authoritative Moscow building world.
-- Install in the SAME existing Supabase project as RNDM Chat. No existing RNDM tables are changed.
-- Requires PostGIS (standard on Supabase). Import actual OSM building geometries AFTER this script.
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

create table if not exists public.cq71_teams (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null unique references auth.users(id) on delete cascade,
 name text not null unique check(char_length(name) between 3 and 32),
 flag text not null check(char_length(flag) between 1 and 32),
 color text not null unique check(color ~ '^#[0-9A-Fa-f]{6}$'),
 credits integer not null default 2000 check(credits between 0 and 100000),
 last_income_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create table if not exists public.cq71_buildings (
 osm_id bigint primary key check(osm_id>0),
 geom extensions.geometry(Geometry,4326) not null,
 lat double precision not null check(lat between 54.65 and 56.20),
 lng double precision not null check(lng between 36.35 and 38.50),
 name text not null default '',
 address text not null default '',
 owner_team_id uuid references public.cq71_teams(id) on delete set null,
 garrison integer not null default 0 check(garrison between 0 and 5000),
 fort_level integer not null default 0 check(fort_level between 0 and 5),
 claimed_at timestamptz,
 updated_at timestamptz not null default now()
);
create index if not exists cq71_buildings_latlng on public.cq71_buildings(lat,lng);
create index if not exists cq71_buildings_geom on public.cq71_buildings using gist(geom);
create index if not exists cq71_buildings_owners on public.cq71_buildings(owner_team_id) where owner_team_id is not null;
create table if not exists public.cq71_scouts (
 user_id uuid not null references auth.users(id) on delete cascade,
 osm_id bigint not null references public.cq71_buildings(osm_id) on delete cascade,
 scouted_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '15 minutes',
 primary key(user_id,osm_id)
);
create table if not exists public.cq71_orders (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.cq71_teams(id) on delete cascade,
 source_osm bigint not null references public.cq71_buildings(osm_id),
 target_osm bigint not null references public.cq71_buildings(osm_id),
 troops integer not null check(troops between 1 and 1000),
 source_lat double precision not null,
 source_lng double precision not null,
 target_lat double precision not null,
 target_lng double precision not null,
 departed_at timestamptz not null default now(),
 arrives_at timestamptz not null,
 status text not null default 'marching' check(status in ('marching','won','lost','reinforced')),
 result text not null default '',
 resolved_at timestamptz
);
create index if not exists cq71_orders_active on public.cq71_orders(arrives_at) where status='marching';
create table if not exists public.cq71_events (
 id bigint generated always as identity primary key,
 osm_id bigint,
 team_id uuid,
 type text not null,
 lat double precision not null,
 lng double precision not null,
 note text not null default '',
 created_at timestamptz not null default now()
);
create index if not exists cq71_events_time on public.cq71_events(created_at desc);

alter table public.cq71_teams enable row level security;
alter table public.cq71_buildings enable row level security;
alter table public.cq71_scouts enable row level security;
alter table public.cq71_orders enable row level security;
alter table public.cq71_events enable row level security;
-- All writes are through validated RPCs. Data is shared (public to signed-in game participants).
drop policy if exists cq71_teams_read on public.cq71_teams;
create policy cq71_teams_read on public.cq71_teams for select to authenticated using(true);
drop policy if exists cq71_buildings_read on public.cq71_buildings;
create policy cq71_buildings_read on public.cq71_buildings for select to authenticated using(true);
drop policy if exists cq71_scouts_read on public.cq71_scouts;
create policy cq71_scouts_read on public.cq71_scouts for select to authenticated using((select auth.uid())=user_id);
drop policy if exists cq71_orders_read on public.cq71_orders;
create policy cq71_orders_read on public.cq71_orders for select to authenticated using(true);
drop policy if exists cq71_events_read on public.cq71_events;
create policy cq71_events_read on public.cq71_events for select to authenticated using(true);
revoke all on public.cq71_teams, public.cq71_buildings, public.cq71_scouts, public.cq71_orders, public.cq71_events from public,anon,authenticated;
-- World/teams/scouts/orders are RPC-only: no direct SELECT bypassing scouting or exposing other teams’ balances.
-- Realtime subscribers only need to read the small public event stream.
grant select on public.cq71_events to authenticated;

-- This internal resolver is executed by server-side calls and optionally pg_cron.
-- row locks ensure each order settles exactly once, even under simultaneous requests.
create or replace function public.cq71_resolve_arrivals(p_limit integer default 30)
returns integer language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v public.cq71_orders%rowtype; tgt public.cq71_buildings%rowtype; cnt integer:=0; left_over integer;
begin
 for v in select * from public.cq71_orders where status='marching' and arrives_at<=now()
          order by arrives_at,id limit least(greatest(coalesce(p_limit,30),1),50) for update skip locked loop
  select * into tgt from public.cq71_buildings where osm_id=v.target_osm for update;
  if not found then update public.cq71_orders set status='lost', result='Цель недоступна',resolved_at=now() where id=v.id;
  elsif tgt.owner_team_id is null then
   update public.cq71_buildings set owner_team_id=v.team_id,garrison=v.troops,fort_level=0,claimed_at=now(),updated_at=now() where osm_id=v.target_osm;
   update public.cq71_orders set status='won',result='Занято пустое здание',resolved_at=now() where id=v.id;
   insert into public.cq71_events(osm_id,team_id,type,lat,lng,note) values(v.target_osm,v.team_id,'capture',v.target_lat,v.target_lng,'Пустое здание занято армией');
  elsif tgt.owner_team_id=v.team_id then
   update public.cq71_buildings set garrison=least(5000,garrison+v.troops),updated_at=now() where osm_id=v.target_osm;
   update public.cq71_orders set status='reinforced',result='Подкрепление прибыло',resolved_at=now() where id=v.id;
   insert into public.cq71_events(osm_id,team_id,type,lat,lng,note) values(v.target_osm,v.team_id,'reinforce',v.target_lat,v.target_lng,'Прибыло подкрепление');
  else
   left_over:=v.troops-(tgt.garrison+tgt.fort_level*5);
   if left_over>0 then
    update public.cq71_buildings set owner_team_id=v.team_id,garrison=greatest(1,left_over),fort_level=0,claimed_at=now(),updated_at=now() where osm_id=v.target_osm;
    update public.cq71_orders set status='won',result='Здание взято штурмом',resolved_at=now() where id=v.id;
    insert into public.cq71_events(osm_id,team_id,type,lat,lng,note) values(v.target_osm,v.team_id,'capture',v.target_lat,v.target_lng,'Штурм завершён: здание захвачено');
   else
    update public.cq71_buildings set garrison=greatest(1,tgt.garrison-greatest(1,floor(v.troops*.65)::integer)),updated_at=now() where osm_id=v.target_osm;
    update public.cq71_orders set status='lost',result='Атака отбита',resolved_at=now() where id=v.id;
    insert into public.cq71_events(osm_id,team_id,type,lat,lng,note) values(v.target_osm,v.team_id,'battle',v.target_lat,v.target_lng,'Атака отбита');
   end if;
  end if;
  cnt:=cnt+1;
 end loop;
 return cnt;
end;$$;
revoke all on function public.cq71_resolve_arrivals(integer) from public,anon,authenticated;

create or replace function public.cq71_me()
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare t public.cq71_teams%rowtype; n integer; mins integer;
begin
 if auth.uid() is null then raise exception 'Требуется вход в RNDM Chat'; end if;
 select * into t from public.cq71_teams where owner_id=auth.uid() for update;
 if not found then return jsonb_build_object('needs_team',true);end if;
 select count(*) into n from public.cq71_buildings where owner_team_id=t.id;
 mins:=greatest(0,least(720,floor(extract(epoch from (now()-t.last_income_at))/60)::integer));
 if mins>0 then
   update public.cq71_teams set credits=least(100000,credits+mins*(3+least(n,300))),last_income_at=last_income_at+mins*interval '1 minute' where id=t.id returning * into t;
 end if;
 return jsonb_build_object('needs_team',false,'team',jsonb_build_object('id',t.id,'name',t.name,'flag',t.flag,'color',t.color,'credits',t.credits,'buildings',n,'income',3+least(n,300)));
end;$$;
revoke all on function public.cq71_me() from public,anon;
grant execute on function public.cq71_me() to authenticated;

create or replace function public.cq71_create_team(p_name text,p_flag text,p_color text)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare t public.cq71_teams%rowtype;
begin
 if auth.uid() is null then raise exception 'Требуется авторизация';end if;
 if char_length(btrim(coalesce(p_name,''))) not between 3 and 32 then raise exception 'Название: от 3 до 32 символов';end if;
 if char_length(btrim(coalesce(p_flag,''))) not between 1 and 32 then raise exception 'Выбери флаг';end if;
 if coalesce(p_color,'') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Некорректный цвет';end if;
 insert into public.cq71_teams(owner_id,name,flag,color) values(auth.uid(),btrim(p_name),btrim(p_flag),lower(p_color)) returning * into t;
 return jsonb_build_object('id',t.id,'name',t.name,'flag',t.flag,'color',t.color);
exception when unique_violation then raise exception 'Название или цвет уже занят, либо команда уже создана';
end;$$;
revoke all on function public.cq71_create_team(text,text,text) from public,anon;
grant execute on function public.cq71_create_team(text,text,text) to authenticated;

-- Scout is mandatory. An empty building is captured right away; occupied ones are only revealed.
create or replace function public.cq71_scout(p_osm_id bigint)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare t public.cq71_teams%rowtype;b public.cq71_buildings%rowtype; enemy public.cq71_teams%rowtype;
begin
 if auth.uid() is null then raise exception 'Авторизуйся';end if;
 select * into t from public.cq71_teams where owner_id=auth.uid() for update;
 if not found then raise exception 'Сначала создай свою команду';end if;
 select * into b from public.cq71_buildings where osm_id=p_osm_id for update;
 if not found then raise exception 'Здание ещё не импортировано из карты Москвы';end if;
 if t.credits<40 then raise exception 'Для разведки нужно 40 ресурсов';end if;
 -- The first neutral base can be anywhere in Moscow; expansion scouts must be near existing holdings.
 if exists(select 1 from public.cq71_buildings owned where owned.owner_team_id=t.id) and
   not exists(select 1 from public.cq71_buildings owned where owned.owner_team_id=t.id
     and owned.lat between b.lat-0.020 and b.lat+0.020
     and owned.lng between b.lng-0.030 and b.lng+0.030
     and extensions.ST_DistanceSphere(
       extensions.ST_SetSRID(extensions.ST_MakePoint(owned.lng,owned.lat),4326),
       extensions.ST_SetSRID(extensions.ST_MakePoint(b.lng,b.lat),4326)) <= 1600) then
    raise exception 'Слишком далеко от ваших зданий. Разведка доступна в пределах 1,6 км.';
 end if;
 if b.owner_team_id=t.id then return jsonb_build_object('outcome','mine','message','Здание уже принадлежит вашей команде');end if;
 update public.cq71_teams set credits=credits-40 where id=t.id;
 insert into public.cq71_scouts(user_id,osm_id,scouted_at,expires_at) values(auth.uid(),p_osm_id,now(),now()+interval '15 minutes')
  on conflict(user_id,osm_id) do update set scouted_at=now(),expires_at=now()+interval '15 minutes';
 if b.owner_team_id is null then
  update public.cq71_buildings set owner_team_id=t.id,garrison=1,fort_level=0,claimed_at=now(),updated_at=now() where osm_id=b.osm_id;
  insert into public.cq71_events(osm_id,team_id,type,lat,lng,note) values(b.osm_id,t.id,'capture',b.lat,b.lng,'Разведчик занял свободное здание');
  return jsonb_build_object('outcome','captured','message','Здание было пустым: разведчик захватил его');
 end if;
 select * into enemy from public.cq71_teams where id=b.owner_team_id;
 return jsonb_build_object('outcome','occupied','message','Здание занято! Подтягивайте армию.','team_name',enemy.name,'team_flag',enemy.flag,'garrison',b.garrison,'fort',b.fort_level,'expires_at',now()+interval '15 minutes');
end;$$;
revoke all on function public.cq71_scout(bigint) from public,anon;
grant execute on function public.cq71_scout(bigint) to authenticated;

create or replace function public.cq71_recruit(p_osm_id bigint)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare t public.cq71_teams%rowtype;b public.cq71_buildings%rowtype;
begin
 select * into t from public.cq71_teams where owner_id=auth.uid() for update;
 if not found then raise exception 'Сначала создай команду';end if;
 select * into b from public.cq71_buildings where osm_id=p_osm_id for update;
 if not found or b.owner_team_id is distinct from t.id then raise exception 'Набирать бойцов можно только в своих зданиях';end if;
 if t.credits<120 then raise exception 'Для набора нужно 120 ресурсов';end if;
 if b.garrison>495 then raise exception 'Гарнизон заполнен';end if;
 update public.cq71_teams set credits=credits-120 where id=t.id;
 update public.cq71_buildings set garrison=garrison+5,updated_at=now() where osm_id=b.osm_id;
 insert into public.cq71_events(osm_id,team_id,type,lat,lng,note) values(b.osm_id,t.id,'recruit',b.lat,b.lng,'Гарнизон +5');
 return jsonb_build_object('message','Гарнизон усилен: +5 бойцов');
end;$$;
revoke all on function public.cq71_recruit(bigint) from public,anon;
grant execute on function public.cq71_recruit(bigint) to authenticated;

create or replace function public.cq71_fort(p_osm_id bigint)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare t public.cq71_teams%rowtype;b public.cq71_buildings%rowtype;
begin
 select * into t from public.cq71_teams where owner_id=auth.uid() for update;
 if not found then raise exception 'Сначала создай команду';end if;
 select * into b from public.cq71_buildings where osm_id=p_osm_id for update;
 if not found or b.owner_team_id is distinct from t.id then raise exception 'Блокпост строится только на своей территории';end if;
 if b.fort_level>=5 then raise exception 'Максимальный уровень блокпоста';end if;
 if t.credits<220 then raise exception 'Для блокпоста нужно 220 ресурсов';end if;
 update public.cq71_teams set credits=credits-220 where id=t.id;
 update public.cq71_buildings set fort_level=fort_level+1,updated_at=now() where osm_id=b.osm_id;
 insert into public.cq71_events(osm_id,team_id,type,lat,lng,note) values(b.osm_id,t.id,'fort',b.lat,b.lng,'Пост улучшен');
 return jsonb_build_object('message','Блокпост улучшен до уровня '||(b.fort_level+1));
end;$$;
revoke all on function public.cq71_fort(bigint) from public,anon;
grant execute on function public.cq71_fort(bigint) to authenticated;

create or replace function public.cq71_dispatch(p_source bigint,p_target bigint,p_troops integer)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare t public.cq71_teams%rowtype;a public.cq71_buildings%rowtype;b public.cq71_buildings%rowtype;
 sec integer; distance_m double precision; order_id uuid; total integer;
begin
 select * into t from public.cq71_teams where owner_id=auth.uid() for update;
 if not found then raise exception 'Сначала создай команду';end if;
 if p_source=p_target then raise exception 'Источник и цель должны различаться';end if;
 if p_troops<1 or p_troops>1000 then raise exception 'Укажи от 1 до 1000 бойцов';end if;
 -- Order locks in increasing numeric order prevents reverse-dispatch deadlocks.
 perform 1 from public.cq71_buildings where osm_id in(p_source,p_target) order by osm_id for update;
 select * into a from public.cq71_buildings where osm_id=p_source;
 select * into b from public.cq71_buildings where osm_id=p_target;
 if not found or a.osm_id is null or b.osm_id is null then raise exception 'Один из домов не найден';end if;
 if a.owner_team_id is distinct from t.id then raise exception 'Армию можно отправить только из своего здания';end if;
 if p_troops>=a.garrison then raise exception 'Оставь минимум одного защитника в исходном доме';end if;
 distance_m:=extensions.ST_DistanceSphere(extensions.ST_SetSRID(extensions.ST_MakePoint(a.lng,a.lat),4326),extensions.ST_SetSRID(extensions.ST_MakePoint(b.lng,b.lat),4326));
 if distance_m>4500 then raise exception 'Дистанция более 4,5 км. Захвати промежуточные здания';end if;
 if b.owner_team_id is distinct from t.id and b.owner_team_id is not null and
    not exists(select 1 from public.cq71_scouts s where s.osm_id=b.osm_id and s.user_id=auth.uid() and s.expires_at>now()) then
  raise exception 'Сначала отправь разведчика в занятое здание';end if;
 sec:=greatest(10,ceil(distance_m/13.0)::integer);
 update public.cq71_buildings set garrison=garrison-p_troops,updated_at=now() where osm_id=a.osm_id;
 insert into public.cq71_orders(team_id,source_osm,target_osm,troops,source_lat,source_lng,target_lat,target_lng,arrives_at)
 values(t.id,a.osm_id,b.osm_id,p_troops,a.lat,a.lng,b.lat,b.lng,now()+make_interval(secs=>sec)) returning id into order_id;
 insert into public.cq71_events(osm_id,team_id,type,lat,lng,note) values(a.osm_id,t.id,'dispatch',a.lat,a.lng,'Армия отправлена');
 return jsonb_build_object('message','Отряд отправлен, прибытие примерно через '||sec||' сек.','order_id',order_id,'seconds',sec);
end;$$;
revoke all on function public.cq71_dispatch(bigint,bigint,integer) from public,anon;
grant execute on function public.cq71_dispatch(bigint,bigint,integer) to authenticated;

-- Visible viewport only. Zoomed-out: aggregate shared factions; zoomed-in: actual OSM polygon features.
create or replace function public.cq71_world(p_south double precision,p_west double precision,p_north double precision,p_east double precision,p_zoom integer)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare out_buildings jsonb:='[]'::jsonb; out_overview jsonb:='[]'::jsonb;out_orders jsonb:='[]'::jsonb;
begin
 if auth.uid() is null then raise exception 'Войди в RNDM'; end if;
 if p_south is null or p_north is null or p_west is null or p_east is null or p_south>=p_north or p_west>=p_east then raise exception 'Некорректная область карты';end if;
 -- Limit per-query geographic and JSON work. At low zoom only summaries, never millions of polygons.
 if p_zoom>=15 then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into out_buildings from (
    select b.osm_id::text as id,b.lat,b.lng,b.name,b.address,
           b.owner_team_id::text as owner_id,
           case when b.owner_team_id=(select id from public.cq71_teams where owner_id=auth.uid()) or
             exists(select 1 from public.cq71_scouts scout where scout.osm_id=b.osm_id and scout.user_id=auth.uid() and scout.expires_at>now())
             then b.garrison else null end as garrison,
           case when b.owner_team_id=(select id from public.cq71_teams where owner_id=auth.uid()) or
             exists(select 1 from public.cq71_scouts scout where scout.osm_id=b.osm_id and scout.user_id=auth.uid() and scout.expires_at>now())
             then b.fort_level else null end as fort_level,
           exists(select 1 from public.cq71_scouts scout where scout.osm_id=b.osm_id and scout.user_id=auth.uid() and scout.expires_at>now()) as scouted,
           t.name as team_name,t.flag as team_flag,t.color as team_color,
           extensions.ST_AsGeoJSON(extensions.ST_SimplifyPreserveTopology(b.geom,0.000003),5)::jsonb as geometry
    from public.cq71_buildings b left join public.cq71_teams t on t.id=b.owner_team_id
    where b.lat between greatest(54.65,p_south) and least(56.20,p_north)
      and b.lng between greatest(36.35,p_west) and least(38.50,p_east)
    order by abs(b.lat-(p_south+p_north)/2)+abs(b.lng-(p_west+p_east)/2) limit 650
  ) q;
 else
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into out_overview from (
     select round(avg(b.lat)::numeric,4)::float8 as lat,round(avg(b.lng)::numeric,4)::float8 as lng,
            t.id::text as owner_id,t.name as team_name,t.flag as team_flag,t.color as team_color,count(*) as count
     from public.cq71_buildings b join public.cq71_teams t on t.id=b.owner_team_id
     where b.lat between greatest(54.65,p_south) and least(56.20,p_north)
       and b.lng between greatest(36.35,p_west) and least(38.50,p_east)
     group by t.id,round((b.lat/0.02)::numeric),round((b.lng/0.02)::numeric)
     order by count(*) desc limit 350
  ) q;
 end if;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into out_orders from (
   select o.id::text,o.team_id::text,o.source_lat,o.source_lng,o.target_lat,o.target_lng,o.troops,o.departed_at,o.arrives_at,t.name as team_name,t.color as team_color,t.flag as team_flag
   from public.cq71_orders o join public.cq71_teams t on o.team_id=t.id
   where o.status='marching' and o.target_lat between greatest(54.65,p_south)-0.05 and least(56.20,p_north)+0.05
     and o.target_lng between greatest(36.35,p_west)-0.05 and least(38.50,p_east)+0.05
   order by o.arrives_at limit 150
 ) q;
 return jsonb_build_object('buildings',out_buildings,'overview',out_overview,'orders',out_orders);
end;$$;
revoke all on function public.cq71_world(double precision,double precision,double precision,double precision,integer) from public,anon;
grant execute on function public.cq71_world(double precision,double precision,double precision,double precision,integer) to authenticated;

-- RPC-only security; imported polygons are populated by private admin script using DATABASE_URL.
-- Realtime events are small; do NOT replicate millions of geometry rows.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(
   select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='cq71_events') then
   alter publication supabase_realtime add table public.cq71_events;
 end if;
end $$;
-- RECOMMENDED: enable Supabase Cron and schedule arrival resolution every minute:
-- create extension if not exists pg_cron with schema pg_catalog;
-- select cron.schedule('conquest-v71-orders','* * * * *','select public.cq71_resolve_arrivals(50)');
-- Without cron, arriving armies remain pending until processed by a privileged scheduled server task.
-- For initial QA you can manually run: select public.cq71_resolve_arrivals(50);

-- List your real nearby buildings even when they are outside the current map viewport.
-- This makes dispatch from a remote owned building usable on phones and desktops.
create or replace function public.cq71_sources(p_target bigint)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare t uuid; dest public.cq71_buildings%rowtype; matches jsonb;
begin
 select id into t from public.cq71_teams where owner_id=auth.uid();
 if t is null then raise exception 'Сначала создай команду';end if;
 select * into dest from public.cq71_buildings where osm_id=p_target;
 if not found then raise exception 'Здание не найдено';end if;
 select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into matches from (
  select b.osm_id::text as id,b.name,b.address,b.garrison,b.lat,b.lng
  from public.cq71_buildings b
  where b.owner_team_id=t and b.osm_id<>dest.osm_id and b.garrison>1
   and b.lat between dest.lat-0.065 and dest.lat+0.065
   and b.lng between dest.lng-0.11 and dest.lng+0.11
   and extensions.ST_DistanceSphere(
     extensions.ST_SetSRID(extensions.ST_MakePoint(b.lng,b.lat),4326),
     extensions.ST_SetSRID(extensions.ST_MakePoint(dest.lng,dest.lat),4326))<=4500
  order by abs(b.lat-dest.lat)+abs(b.lng-dest.lng) limit 60
 ) s;
 return matches;
end;$$;
revoke all on function public.cq71_sources(bigint) from public,anon;
grant execute on function public.cq71_sources(bigint) to authenticated;
