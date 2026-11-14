-- Shared tennis data. Safe to run more than once.
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
