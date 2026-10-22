-- RNDM CONQUEST v70 — additive SQL for the EXISTING RNDM Chat Supabase project.
-- No existing messenger tables, policies, or functions are dropped or edited.
-- Install ONCE in Supabase -> SQL Editor, then reload RNDM Chat.
-- Actions run atomically server-side, authenticated users only. Direct writes denied by RLS.


create table if not exists public.conquest_players (
  user_id uuid primary key references auth.users(id) on delete cascade,
  callsign text not null default 'Игрок' check (char_length(callsign)<=28),
  credits integer not null default 1200 check(credits>=0 and credits<=20000),
  troops integer not null default 12 check(troops>=0 and troops<=60),
  last_income_at timestamptz not null default now(),
  last_action_at timestamptz not null default now()-interval '1 minute',
  created_at timestamptz not null default now()
);
create table if not exists public.conquest_cells (
  cell_x integer not null,
  cell_y integer not null,
  lat double precision not null,
  lng double precision not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  fort_level smallint not null default 0 check(fort_level between 0 and 3),
  garrison smallint not null default 3 check(garrison between 0 and 80),
  shield_until timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(cell_x,cell_y)
);
create index if not exists conquest_cells_geo_idx on public.conquest_cells(lat,lng);
create index if not exists conquest_cells_owner_idx on public.conquest_cells(owner_id);

create table if not exists public.conquest_units (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  from_lat double precision not null,
  from_lng double precision not null,
  to_lat double precision not null,
  to_lng double precision not null,
  size smallint not null default 4 check(size between 1 and 20),
  updated_at timestamptz not null default now(),
  arrive_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists conquest_units_geo_idx on public.conquest_units(to_lat,to_lng);
create index if not exists conquest_units_owner_idx on public.conquest_units(owner_id);

alter table public.conquest_players enable row level security;
alter table public.conquest_cells enable row level security;
alter table public.conquest_units enable row level security;

drop policy if exists conquest_player_select on public.conquest_players;
create policy conquest_player_select on public.conquest_players for select to authenticated using((select auth.uid())=user_id);
drop policy if exists conquest_cells_select on public.conquest_cells;
create policy conquest_cells_select on public.conquest_cells for select to authenticated using(true);
drop policy if exists conquest_units_select on public.conquest_units;
create policy conquest_units_select on public.conquest_units for select to authenticated using(true);

revoke all on public.conquest_players,public.conquest_cells,public.conquest_units from public,anon,authenticated;
grant select on public.conquest_players,public.conquest_cells,public.conquest_units to authenticated;

-- All money, ownership, defense, unit moves and combat are validated inside database RPCs.
create or replace function public.conquest_sync(p_callsign text default 'Игрок')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_user uuid := auth.uid();v_p public.conquest_players%rowtype;
  v_count integer;v_minutes integer;v_rate integer;
begin
  if v_user is null then raise exception 'Войди в RNDM Chat для игры.' using errcode='28000';end if;
  insert into public.conquest_players(user_id,callsign)
    values(v_user,left(coalesce(nullif(btrim(p_callsign),''),'Игрок'),28))
    on conflict(user_id) do nothing;
  select * into v_p from public.conquest_players where user_id=v_user for update;
  select count(*) into v_count from public.conquest_cells where owner_id=v_user;
  v_minutes:=greatest(0,least(720,floor(extract(epoch from (now()-v_p.last_income_at))/60)::integer));
  v_rate:=least(120,2+v_count*2);
  if v_minutes>0 then
    update public.conquest_players set credits=least(20000,credits+v_minutes*v_rate),
      last_income_at=last_income_at+(v_minutes*interval '1 minute')
    where user_id=v_user returning * into v_p;
  end if;
  return jsonb_build_object('credits',v_p.credits,'troops',v_p.troops,'owned',v_count,'callsign',v_p.callsign,'income_per_minute',v_rate);
end;$$;

create or replace function public.conquest_action(
  p_action text,p_lat double precision default null,p_lng double precision default null,p_unit_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_user uuid:=auth.uid();v_p public.conquest_players%rowtype;
  v_cell public.conquest_cells%rowtype;v_unit public.conquest_units%rowtype;
  v_x integer;v_y integer;v_lat double precision;v_lng double precision;
  v_owned integer;v_adjacent boolean;v_enemy boolean;v_win boolean;v_msg text;
  v_dist double precision;v_seconds integer;
begin
  if v_user is null then raise exception 'Необходим вход в аккаунт RNDM.' using errcode='28000';end if;
  if p_action is null or p_action not in ('claim','attack','fort','recruit','deploy','move') then
    raise exception 'Неизвестная команда.';
  end if;
  select * into v_p from public.conquest_players where user_id=v_user for update;
  if not found then raise exception 'Сначала открой игру и дождись подключения.';end if;
  if now()-v_p.last_action_at < interval '1 second' then raise exception 'Команды слишком частые. Повтори через секунду.';end if;
  if p_action <> 'recruit' then
    if p_lat is null or p_lng is null or p_lat not between 54.72 and 56.09 or p_lng not between 36.70 and 38.18 then
      raise exception 'Выбранная точка вне игрового региона.';
    end if;
    v_x:=floor(p_lng*250)::integer;v_y:=floor(p_lat*250)::integer;
    v_lat:=(v_y+0.5)/250.0;v_lng:=(v_x+0.5)/250.0;
    select * into v_cell from public.conquest_cells where cell_x=v_x and cell_y=v_y for update;
  end if;
  select count(*) into v_owned from public.conquest_cells where owner_id=v_user;
  select exists(select 1 from public.conquest_cells c where c.owner_id=v_user
     and abs(c.cell_x-v_x)<=2 and abs(c.cell_y-v_y)<=2) into v_adjacent;
  if p_action='claim' then
    if v_cell.owner_id is not null then raise exception 'Этот участок уже занят. Используй атаку.';end if;
    if v_p.credits<100 then raise exception 'Недостаточно кредитов.';end if;
    if v_owned>0 and not v_adjacent then raise exception 'Можно захватывать только соседние кварталы.';end if;
    insert into public.conquest_cells(cell_x,cell_y,lat,lng,owner_id,garrison,shield_until)
      values(v_x,v_y,v_lat,v_lng,v_user,4,now()+case when v_owned=0 then interval '30 minutes' else interval '2 minutes' end);
    update public.conquest_players set credits=credits-100,last_action_at=now() where user_id=v_user;
    v_msg:='Квартал захвачен. '+case when v_owned=0 then 'Создан первый штаб, защита 30 минут.' else 'Территория расширена.' end;
  elsif p_action='fort' then
    if v_cell.owner_id is distinct from v_user then raise exception 'Блокпост можно строить только на своей территории.';end if;
    if v_cell.fort_level>=3 then raise exception 'Блокпост уже максимального уровня.';end if;
    if v_p.credits<200 then raise exception 'Недостаточно кредитов.';end if;
    update public.conquest_cells set fort_level=fort_level+1,garrison=least(80,garrison+3),updated_at=now() where cell_x=v_x and cell_y=v_y;
    update public.conquest_players set credits=credits-200,last_action_at=now() where user_id=v_user;
    v_msg:='Блокпост построен и гарнизон усилен.';
  elsif p_action='recruit' then
    if v_p.credits<150 then raise exception 'Недостаточно кредитов.';end if;
    if v_p.troops>55 then raise exception 'Лимит свободных бойцов — 60.';end if;
    update public.conquest_players set credits=credits-150,troops=least(60,troops+5),last_action_at=now() where user_id=v_user;
    v_msg:='Нанято 5 новых бойцов.';
  elsif p_action='deploy' then
    if v_cell.owner_id is distinct from v_user then raise exception 'Создавать отряды можно на своей территории.';end if;
    if v_p.troops<4 then raise exception 'Нужно минимум 4 свободных бойца.';end if;
    if (select count(*) from public.conquest_units where owner_id=v_user)>=20 then raise exception 'Лимит — 20 отрядов.';end if;
    insert into public.conquest_units(owner_id,from_lat,from_lng,to_lat,to_lng,size)
      values(v_user,v_lat,v_lng,v_lat,v_lng,4);
    update public.conquest_players set troops=troops-4,last_action_at=now() where user_id=v_user;
    v_msg:='Новый отряд создан. Нажми на него, затем выбери маршрут.';
  elsif p_action='move' then
    if p_unit_id is null then raise exception 'Сначала выбери свой отряд.';end if;
    select * into v_unit from public.conquest_units where id=p_unit_id and owner_id=v_user for update;
    if not found then raise exception 'Этот отряд тебе не принадлежит.';end if;
    if v_unit.arrive_at>now() then raise exception 'Отряд ещё в пути.';end if;
    v_dist:=111000*sqrt(power(p_lat-v_unit.to_lat,2)+power((p_lng-v_unit.to_lng)*cos(radians(p_lat)),2));
    if v_dist>3500 then raise exception 'За один приказ отряд проходит не более 3,5 км.';end if;
    v_seconds:=greatest(3,ceil(v_dist/12.0)::integer);
    update public.conquest_units set from_lat=to_lat,from_lng=to_lng,
      to_lat=p_lat,to_lng=p_lng,updated_at=now(),arrive_at=now()+(v_seconds*interval '1 second') where id=v_unit.id;
    update public.conquest_players set last_action_at=now() where user_id=v_user;
    v_msg:='Отряд движется. Время в пути: '||v_seconds||' сек.';
  elsif p_action='attack' then
    if v_cell.owner_id is null or v_cell.owner_id=v_user then raise exception 'Атаковать можно только чужой участок.';end if;
    if not v_adjacent then raise exception 'Нужна соседняя контролируемая территория.';end if;
    if v_cell.shield_until>now() then raise exception 'Временная защита этого квартала ещё активна.';end if;
    select * into v_unit from public.conquest_units u where u.owner_id=v_user and u.size>=3 and u.arrive_at<=now()
      and abs(u.to_lat-v_lat)<0.012 and abs(u.to_lng-v_lng)<0.023
      order by power(u.to_lat-v_lat,2)+power((u.to_lng-v_lng)*cos(radians(v_lat)),2),u.created_at limit 1 for update;
    if not found then raise exception 'Подведи свой отряд из 3+ бойцов ближе к этому кварталу.';end if;
    v_win:=(random()*14+v_unit.size*2)>(v_cell.garrison+v_cell.fort_level*4);
    update public.conquest_units set size=greatest(1,size-case when v_win then 2 else 1 end) where id=v_unit.id;
    if v_win then
      update public.conquest_cells set owner_id=v_user,fort_level=0,garrison=3,shield_until=now()+interval '4 minutes',updated_at=now()
       where cell_x=v_x and cell_y=v_y;
      v_msg:='Победа! Квартал перешёл под твой контроль.';
    else
      update public.conquest_cells set garrison=greatest(1,garrison-2),updated_at=now()
       where cell_x=v_x and cell_y=v_y;
      v_msg:='Штурм не удался. Противник понёс потери, отступи и попробуй снова.';
    end if;
    update public.conquest_players set last_action_at=now() where user_id=v_user;
  end if;
  return jsonb_build_object('ok',true,'message',v_msg,'action',p_action);
end;$$;

revoke all on function public.conquest_sync(text) from public,anon;
revoke all on function public.conquest_action(text,double precision,double precision,uuid) from public,anon;
grant execute on function public.conquest_sync(text) to authenticated;
grant execute on function public.conquest_action(text,double precision,double precision,uuid) to authenticated;

-- Add only new game tables to the realtime publication.
do $$begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='conquest_cells') then
      alter publication supabase_realtime add table public.conquest_cells;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='conquest_units') then
      alter publication supabase_realtime add table public.conquest_units;
    end if;
  end if;
end$$;

-- Health check: should show 3 tables and 2 game RPCs after installation.
select table_name from information_schema.tables where table_schema='public' and table_name like 'conquest_%' order by table_name;
