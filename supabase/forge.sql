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
