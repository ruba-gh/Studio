create schema studio_private;
revoke all on schema studio_private from public, anon, authenticated, service_role;

create table studio_private.settings (
  id integer primary key check (id = 1),
  admin text not null,
  whatsapp text not null default '',
  anchor text not null
);

create table studio_private.marketers (
  id text primary key,
  name text not null,
  code text not null unique,
  password text not null,
  active integer not null default 1 check (active in (0, 1)),
  rate integer not null check (rate between 1 and 10000),
  method text,
  beneficiary text,
  account text
);

create table studio_private.payouts (
  id text primary key,
  marketer text not null references studio_private.marketers(id),
  amount integer not null check (amount >= 10000),
  date text not null,
  reference text not null,
  method text not null,
  beneficiary text not null,
  account text not null,
  seq bigint generated always as identity,
  unique (marketer, reference)
);

create table studio_private.referrals (
  id text primary key,
  marketer text not null references studio_private.marketers(id),
  customer text not null,
  project text not null,
  rate integer not null,
  date text not null,
  state text not null default 'pending' check (state in ('pending', 'approved', 'cancelled')),
  paid integer not null default 0,
  commission integer not null default 0,
  seq bigint generated always as identity
);

create table studio_private.history (
  id text primary key,
  referral text not null references studio_private.referrals(id),
  state text not null,
  paid integer not null,
  commission integer not null,
  date text not null,
  seq bigint generated always as identity
);

create table studio_private.earnings (
  id text primary key,
  referral text not null references studio_private.referrals(id),
  amount integer not null check (amount > 0),
  date text not null,
  payout text references studio_private.payouts(id)
);

create table studio_private.sessions (
  token text primary key,
  principal text not null,
  expires bigint not null
);

create table studio_private.login_attempts (
  bucket text primary key,
  attempts integer not null,
  expires bigint not null
);

create index on studio_private.referrals (marketer);
create index on studio_private.history (referral);
create index on studio_private.earnings (referral);
create index on studio_private.earnings (payout);
create index on studio_private.sessions (principal);
create index on studio_private.sessions (expires);
create index on studio_private.login_attempts (expires);

alter table studio_private.settings enable row level security;
alter table studio_private.marketers enable row level security;
alter table studio_private.payouts enable row level security;
alter table studio_private.referrals enable row level security;
alter table studio_private.history enable row level security;
alter table studio_private.earnings enable row level security;
alter table studio_private.sessions enable row level security;
alter table studio_private.login_attempts enable row level security;
