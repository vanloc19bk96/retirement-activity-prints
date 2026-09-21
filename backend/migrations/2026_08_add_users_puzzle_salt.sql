-- ---------------------------------------------------------------------------
-- Per-account puzzle salt (Card Games Pack spec §4.1 / §8.1)
--
-- Every account gets a random 128-bit salt. It keys the HMAC that derives a
-- puzzle's seed:
--
--   effectiveSeed = HMAC-SHA256(puzzle_salt, templateKey || configHash || nonce)
--
-- so two sellers running identical settings on the same day never generate the
-- same puzzle — including when both type the same variation code, which is the
-- most likely way a generator app ships duplicate books to KDP.
--
-- The salt is not a secret in the cryptographic sense: it is delivered to the
-- client with the session so puzzle generation stays offline-capable, and the
-- threat model is accidental collision between sellers, not a motivated
-- attacker reproducing someone else's puzzles.
--
-- Idempotent: safe to run against a database that already has the column.
-- ---------------------------------------------------------------------------

alter table retirement_activity_prints.users
  add column if not exists puzzle_salt bytea;

-- Backfill every account that predates this migration. `gen_random_bytes`
-- comes from pgcrypto, which Supabase enables by default.
create extension if not exists pgcrypto;

update retirement_activity_prints.users
set puzzle_salt = gen_random_bytes(16)
where puzzle_salt is null;

-- New accounts get one automatically; the NOT NULL runs after the backfill so
-- the statement cannot fail on an existing table.
alter table retirement_activity_prints.users
  alter column puzzle_salt set default gen_random_bytes(16);

alter table retirement_activity_prints.users
  alter column puzzle_salt set not null;

alter table retirement_activity_prints.users
  add constraint users_puzzle_salt_length_check
  check (octet_length(puzzle_salt) = 16)
  not valid;

alter table retirement_activity_prints.users
  validate constraint users_puzzle_salt_length_check;

comment on column retirement_activity_prints.users.puzzle_salt is
  '128-bit per-account salt keying puzzle seed derivation, so two sellers never '
  'generate the same puzzle from the same settings (Card Games Pack spec §4.1).';
