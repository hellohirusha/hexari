-- Apply with the Supabase SQL editor. Game state and reports are server-only.
create table if not exists public.forge_rooms (
  id text primary key,
  session jsonb not null,
  token_hashes jsonb not null,
  chat jsonb not null default '[]'::jsonb,
  created_at bigint not null,
  updated_at bigint not null,
  expires_at bigint not null,
  started boolean not null default false,
  finished boolean not null default false,
  closed boolean not null default false,
  player_one uuid references auth.users (id) on delete set null,
  player_two uuid references auth.users (id) on delete set null
);
alter table public.forge_rooms add column if not exists finished boolean not null default false;
alter table public.forge_rooms add column if not exists closed boolean not null default false;
alter table public.forge_rooms add column if not exists player_one uuid references auth.users (id) on delete set null;
alter table public.forge_rooms add column if not exists player_two uuid references auth.users (id) on delete set null;
create index if not exists forge_rooms_expiry on public.forge_rooms (expires_at);
create index if not exists forge_rooms_player_one on public.forge_rooms (player_one) where not finished;
create index if not exists forge_rooms_player_two on public.forge_rooms (player_two) where not finished;
alter table public.forge_rooms enable row level security;
revoke all on public.forge_rooms from public, anon, authenticated;
grant all on public.forge_rooms to service_role;

create table if not exists public.forge_chat_reports (
  room_id text not null,
  message_id text not null,
  author_seat integer not null check (author_seat in (0, 1)),
  reporter_seat integer not null check (reporter_seat in (0, 1)),
  message text not null,
  reported_at bigint not null,
  primary key (room_id, message_id, reporter_seat)
);
alter table public.forge_chat_reports add column if not exists reviewed_at bigint;
create index if not exists forge_reports_date on public.forge_chat_reports (reported_at desc);
alter table public.forge_chat_reports enable row level security;
revoke all on public.forge_chat_reports from public, anon, authenticated;
grant all on public.forge_chat_reports to service_role;

-- Keep completed online results after their temporary game rooms are removed.
-- Only the trusted game server can write room snapshots; clients cannot write
-- results or assign themselves wins.
create table if not exists public.forge_match_results (
  room_id text not null,
  seat smallint not null check (seat in (0, 1)),
  player_id uuid not null references auth.users (id) on delete cascade,
  won boolean not null,
  primary key (room_id, seat),
  unique (room_id, player_id)
);
create index if not exists forge_match_results_player on public.forge_match_results (player_id);
alter table public.forge_match_results enable row level security;
revoke all on public.forge_match_results from public, anon, authenticated;
grant all on public.forge_match_results to service_role;

create or replace function public.forge_record_completed_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.started or not new.finished then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.finished then
      return new;
    end if;
  end if;
  if new.session #>> '{game,phase}' <> 'end'
     or coalesce(new.session #>> '{game,winner}', '') not in ('0', '1') then
    return new;
  end if;

  insert into public.forge_match_results (room_id, seat, player_id, won)
  select new.id, seat, player_id, (new.session #>> '{game,winner}')::integer = seat
  from (values (0, new.player_one), (1, new.player_two)) as players(seat, player_id)
  where player_id is not null
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.forge_record_completed_match() from public, anon, authenticated;
drop trigger if exists forge_record_completed_match on public.forge_rooms;
create trigger forge_record_completed_match
after insert or update on public.forge_rooms
for each row execute function public.forge_record_completed_match();

-- Return only public player names and aggregate online results to signed-in
-- players. The current player is included even if outside the top ten.
create or replace function public.forge_account_standings()
returns table (rank bigint, player_name text, games_played bigint, wins bigint, is_self boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with totals as (
    select player_id, count(*) as games_played,
           count(*) filter (where won) as wins
    from public.forge_match_results
    group by player_id
  ), ranked as (
    select player_id, games_played, wins,
           rank() over (order by wins desc) as rank,
           row_number() over (order by wins desc, games_played desc, player_id) as position
    from totals
  )
  select ranked.rank,
         coalesce(nullif(left(trim(users.raw_user_meta_data ->> 'display_name'), 24), ''), 'Player'),
         ranked.games_played, ranked.wins, ranked.player_id = auth.uid()
  from ranked
  join auth.users as users on users.id = ranked.player_id
  where auth.uid() is not null and (ranked.position <= 10 or ranked.player_id = auth.uid())
  union all
  select null::bigint,
         coalesce(nullif(left(trim(users.raw_user_meta_data ->> 'display_name'), 24), ''), 'Player'),
         0::bigint, 0::bigint, true
  from auth.users as users
  where users.id = auth.uid() and not exists (select 1 from totals where player_id = auth.uid())
  order by 1 asc nulls last, 3 desc, 2 asc;
$$;
revoke all on function public.forge_account_standings() from public, anon;
grant execute on function public.forge_account_standings() to authenticated;

-- Personal local-game counts are reported by the client and never affect the
-- server-verified online leaderboard. The match UUID makes retries idempotent.
create table if not exists public.forge_local_game_results (
  player_id uuid not null references auth.users (id) on delete cascade,
  match_id uuid not null,
  mode text not null check (mode in ('bot', 'hotseat')),
  recorded_at timestamptz not null default pg_catalog.now(),
  primary key (player_id, match_id)
);
create index if not exists forge_local_game_results_recent
  on public.forge_local_game_results (player_id, recorded_at);
alter table public.forge_local_game_results enable row level security;
revoke all on public.forge_local_game_results from public, anon, authenticated;
grant all on public.forge_local_game_results to service_role;

create or replace function public.forge_record_local_game(
  expected_player uuid, match uuid, game_mode text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_player uuid := auth.uid();
begin
  if current_player is null or expected_player is null or current_player <> expected_player or match is null
     or game_mode not in ('bot', 'hotseat') or game_mode is null then
    raise exception 'Invalid local game result';
  end if;

  -- Serialize calls per account so concurrent writes cannot bypass the limits.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(current_player::text, 0));
  if exists (select 1 from public.forge_local_game_results
             where player_id = current_player and match_id = match) then
    return true;
  end if;
  if (select count(*) from public.forge_local_game_results where player_id = current_player) >= 10000
     or (select count(*) from public.forge_local_game_results
         where player_id = current_player and recorded_at > pg_catalog.now() - interval '1 day') >= 128 then
    raise exception 'Local game recording limit reached';
  end if;
  insert into public.forge_local_game_results (player_id, match_id, mode)
  values (current_player, match, game_mode);
  return true;
end;
$$;
revoke all on function public.forge_record_local_game(uuid, uuid, text) from public, anon;
grant execute on function public.forge_record_local_game(uuid, uuid, text) to authenticated;

create or replace function public.forge_local_game_counts()
returns table (bot_games bigint, hotseat_games bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) filter (where mode = 'bot'),
         count(*) filter (where mode = 'hotseat')
  from public.forge_local_game_results
  where player_id = auth.uid();
$$;
revoke all on function public.forge_local_game_counts() from public, anon;
grant execute on function public.forge_local_game_counts() to authenticated;
