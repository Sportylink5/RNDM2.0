# Серверные роли и общие закрепы v64

Эта настройка подготовлена, но НЕ применена. Подключённые аккаунты не предоставили проект с действующей базой. Выполнить один раз в SQL Editor именно проекта из config.js. Скрипт добавляет таблицы и политики, не пересоздаёт каналы и сообщения. Роль владельца берётся из rndm_channels.owner_id, а не из метаданных пользователя. Существующие политики остаются: перед публикацией требуется проверить их вместе с новыми на двух аккаунтах. Идентификаторы каналов/постов сохраняются как текст для совместимости с bigint и UUID.

После применения: владелец открывает канал → информация → «Роли и редакторы». Для назначения нужен UUID пользователя из ссылки на профиль. Редактор публикует и редактирует собственные посты; администратор также меняет общий закреп. Назначение и снятие ролей — только владелец. Удаление собственных постов остаётся по прежним правилам. Никаких глобальных административных прав эта настройка не выдаёт.

```sql
begin;
create schema if not exists rndm_v64_private;
revoke all on schema rndm_v64_private from public, anon;
grant usage on schema rndm_v64_private to authenticated;
create table public.rndm_channel_staff_v64 (
 channel_key text not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('admin','editor')),
 primary key(channel_key,user_id)
);
create table public.rndm_channel_pin_v64 (
 channel_key text primary key,
 post_key text not null,
 pinned_by uuid not null references auth.users(id) on delete cascade
);
alter table public.rndm_channels enable row level security;
alter table public.rndm_channel_posts enable row level security;
alter table public.rndm_channel_staff_v64 enable row level security;
alter table public.rndm_channel_pin_v64 enable row level security;
revoke all on public.rndm_channel_staff_v64,public.rndm_channel_pin_v64 from anon,public;
grant select,insert,update,delete on public.rndm_channel_staff_v64,public.rndm_channel_pin_v64 to authenticated;
create or replace function rndm_v64_private.channel_role(p_channel text)
returns text language sql stable security definer set search_path = '' as $$
 select case when c.owner_id=auth.uid() then 'owner'
 else (select s.role from public.rndm_channel_staff_v64 s where s.channel_key=c.id::text and s.user_id=auth.uid()) end
 from public.rndm_channels c where c.id::text=p_channel and auth.uid() is not null
$$;
revoke all on function rndm_v64_private.channel_role(text) from public,anon;
grant execute on function rndm_v64_private.channel_role(text) to authenticated;
create policy v64_staff_read on public.rndm_channel_staff_v64 for select to authenticated
 using(user_id=auth.uid() or rndm_v64_private.channel_role(channel_key) in ('owner','admin'));
create policy v64_staff_insert on public.rndm_channel_staff_v64 for insert to authenticated
 with check(rndm_v64_private.channel_role(channel_key)='owner');
create policy v64_staff_update on public.rndm_channel_staff_v64 for update to authenticated
 using(rndm_v64_private.channel_role(channel_key)='owner')
 with check(rndm_v64_private.channel_role(channel_key)='owner');
create policy v64_staff_delete on public.rndm_channel_staff_v64 for delete to authenticated
 using(rndm_v64_private.channel_role(channel_key)='owner');
create policy v64_channel_staff_read on public.rndm_channels for select to authenticated
 using(rndm_v64_private.channel_role(id::text) in ('owner','admin','editor'));
create policy v64_post_staff_read on public.rndm_channel_posts for select to authenticated
 using(rndm_v64_private.channel_role(channel_id::text) in ('owner','admin','editor'));
create policy v64_post_insert on public.rndm_channel_posts for insert to authenticated
 with check(author_id=auth.uid() and rndm_v64_private.channel_role(channel_id::text) in ('owner','admin','editor'));
create policy v64_post_update on public.rndm_channel_posts for update to authenticated
 using(author_id=auth.uid() and rndm_v64_private.channel_role(channel_id::text) in ('owner','admin','editor'))
 with check(author_id=auth.uid() and rndm_v64_private.channel_role(channel_id::text) in ('owner','admin','editor'));
create policy v64_pin_read on public.rndm_channel_pin_v64 for select to authenticated
 using(exists(select 1 from public.rndm_channel_posts p where p.id::text=post_key and p.channel_id::text=channel_key));
create policy v64_pin_insert on public.rndm_channel_pin_v64 for insert to authenticated
 with check(pinned_by=auth.uid() and rndm_v64_private.channel_role(channel_key) in ('owner','admin')
 and exists(select 1 from public.rndm_channel_posts p where p.id::text=post_key and p.channel_id::text=channel_key));
create policy v64_pin_update on public.rndm_channel_pin_v64 for update to authenticated
 using(rndm_v64_private.channel_role(channel_key) in ('owner','admin'))
 with check(pinned_by=auth.uid() and rndm_v64_private.channel_role(channel_key) in ('owner','admin')
 and exists(select 1 from public.rndm_channel_posts p where p.id::text=post_key and p.channel_id::text=channel_key));
create policy v64_pin_delete on public.rndm_channel_pin_v64 for delete to authenticated
 using(rndm_v64_private.channel_role(channel_key) in ('owner','admin'));
create or replace function public.rndm_v64_channel_state(p_channel text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r text; result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.rndm_channels where id::text=p_channel) then raise exception 'Нет доступа к каналу'; end if;
 r:=rndm_v64_private.channel_role(p_channel);
 select jsonb_build_object('role',coalesce(r,'reader'),'can_publish',coalesce(r in ('owner','admin','editor'),false),
 'can_pin',coalesce(r in ('owner','admin'),false),
 'pin',(select post_key from public.rndm_channel_pin_v64 where channel_key=p_channel),
 'staff',coalesce((select jsonb_agg(jsonb_build_object('user_id',user_id,'role',role)) from public.rndm_channel_staff_v64 where channel_key=p_channel),'[]'::jsonb)) into result;
 return result;
end $$;
create or replace function public.rndm_v64_channel_staff(p_channel text,p_user uuid,p_role text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
 if auth.uid() is null or rndm_v64_private.channel_role(p_channel) is distinct from 'owner' then raise exception 'Только владелец назначает роли'; end if;
 if exists(select 1 from public.rndm_channels where id::text=p_channel and owner_id=p_user) then raise exception 'Роль владельца не меняется'; end if;
 if p_role is null then delete from public.rndm_channel_staff_v64 where channel_key=p_channel and user_id=p_user;
 elsif p_role in ('admin','editor') then
 insert into public.rndm_channel_staff_v64(channel_key,user_id,role) values(p_channel,p_user,p_role)
 on conflict(channel_key,user_id) do update set role=excluded.role;
 else raise exception 'Недопустимая роль'; end if;
 return true;
end $$;
create or replace function public.rndm_v64_channel_pin(p_channel text,p_post text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
 if auth.uid() is null or coalesce(rndm_v64_private.channel_role(p_channel),'') not in ('owner','admin') then raise exception 'Нет прав на закреп'; end if;
 if p_post is null then delete from public.rndm_channel_pin_v64 where channel_key=p_channel;
 else
 if not exists(select 1 from public.rndm_channel_posts where id::text=p_post and channel_id::text=p_channel) then raise exception 'Пост недоступен или из другого канала'; end if;
 insert into public.rndm_channel_pin_v64(channel_key,post_key,pinned_by) values(p_channel,p_post,auth.uid())
 on conflict(channel_key) do update set post_key=excluded.post_key,pinned_by=excluded.pinned_by;
 end if;
 return true;
end $$;
revoke all on function public.rndm_v64_channel_state(text),public.rndm_v64_channel_staff(text,uuid,text),public.rndm_v64_channel_pin(text,text) from public,anon;
grant execute on function public.rndm_v64_channel_state(text),public.rndm_v64_channel_staff(text,uuid,text),public.rndm_v64_channel_pin(text,text) to authenticated;
create or replace function rndm_v64_private.post_identity_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
 if auth.uid() is not null and (new.channel_id is distinct from old.channel_id or new.author_id is distinct from old.author_id or new.id is distinct from old.id) then raise exception 'Нельзя менять автора, канал или ID поста'; end if;
 return new;
end $$;
revoke all on function rndm_v64_private.post_identity_guard() from public,anon;
create trigger rndm_v64_post_identity before update on public.rndm_channel_posts
for each row execute function rndm_v64_private.post_identity_guard();
commit;
```

Проверка после подключения: владелец назначает редактора; редактор публикует и изменяет свой пост, но не назначает роли и не закрепляет; администратор закрепляет пост; обычный читатель видит закреп, но не меняет его. Попытки закрепить пост другого канала или подменить автора отклоняются. Проверить прямые запросы через API, а не только скрытые кнопки. Отозванный редактор должен потерять право публикации. Проверить ограничения доступа к приватным каналам и отсутствие доступа без входа.
