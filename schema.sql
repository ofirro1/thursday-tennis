-- Shared tennis data. Safe to run on every deploy.
-- This file never deletes rows. It only creates a missing table,
-- and it only inserts a starter row when that row is not already there.
-- The six names are fixed.

create table if not exists players (
  id text primary key,
  name text not null,
  is_admin integer not null default 0,
  sort_order integer not null
);

insert or ignore into players (id, name, is_admin, sort_order) values
  ('chris', 'Chris', 0, 1),
  ('gordon', 'Gordon', 0, 2),
  ('john', 'John', 0, 3),
  ('mick', 'Mick', 0, 4),
  ('carlton', 'Carlton', 0, 5),
  ('ofir', 'Ofir', 1, 6);

create table if not exists responses (
  week text not null,
  player_id text not null,
  status text not null check (status in ('in', 'out')),
  updated_at text not null,
  primary key (week, player_id)
);

create table if not exists weeks (
  week text primary key,
  cancelled integer not null default 0,
  reason text not null default '',
  corrected integer not null default 0
);

create table if not exists corrections (
  week text not null,
  player_id text not null,
  outcome text not null check (outcome in ('played', 'sat_out', 'unavailable', 'unanswered')),
  primary key (week, player_id)
);

create table if not exists guests (
  id text primary key,
  week text not null,
  name text not null,
  created_at text not null
);

-- Thursday 12 November 2026. Gordon and John could not play. The other four played.
insert or ignore into weeks (week, cancelled, reason, corrected) values ('2026-11-12', 0, '', 1);
insert or ignore into corrections (week, player_id, outcome) values
  ('2026-11-12', 'chris', 'played'),
  ('2026-11-12', 'gordon', 'unavailable'),
  ('2026-11-12', 'john', 'unavailable'),
  ('2026-11-12', 'mick', 'played'),
  ('2026-11-12', 'carlton', 'played'),
  ('2026-11-12', 'ofir', 'played');
update weeks set corrected = 1 where week = '2026-11-12' and cancelled = 0;

create table if not exists pin (
  id integer primary key check (id = 1),
  salt text not null,
  hash text not null
);

create table if not exists attempts (
  ip text primary key,
  failures integer not null default 0,
  locked_until text
);

create table if not exists sessions (
  token text primary key,
  expires_at text not null
);
