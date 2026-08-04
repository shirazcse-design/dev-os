-- ============================================================================
-- ContractIQ — Security Foundation: RLS & rate limiting
-- Paste this entire file into the Supabase SQL Editor and run it once. Safe to
-- re-run (idempotent).
--
-- This file does NOT duplicate the per-table CRUD policies already defined in
-- docs/specs/supabase-schema.sql (contracts, key_terms, chat_sessions,
-- chat_messages, user_feedback, term_corrections, storage.objects) — those
-- were audited as part of this security pass and are correct. Re-declaring
-- them here would create two sources of truth that can drift out of sync.
-- This file adds only what's new: the rate_limit_events table, and an
-- idempotent RLS-enabled backstop for every table as an explicit checklist.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table: rate_limit_events
-- Sliding-window rate limiting (lib/security/rateLimiter.ts). Service-role
-- only — deliberately has NO user-facing policies, unlike the old
-- `rate_limits` table it replaces, which had user-writable insert/update
-- policies that let an authenticated user reset or manipulate their own
-- counters via their own session (see docs/security/security-plan.md,
-- "Issues found and fixed"). `identifier` holds a user id for authenticated
-- routes (chat, extract, upload) or a client IP for pre-auth routes (login),
-- since a NOT NULL FK to auth.users would make IP-based limiting on failed
-- login attempts impossible.
-- ----------------------------------------------------------------------------
create table if not exists public.rate_limit_events (
  id         uuid        primary key default gen_random_uuid(),
  identifier text        not null,
  action     text        not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rate_limit_events_lookup
  on public.rate_limit_events (identifier, action, created_at desc);

alter table public.rate_limit_events enable row level security;
-- No policies added — with RLS enabled and zero policies, every role except
-- the service-role key (which bypasses RLS entirely) is denied all access.

-- ----------------------------------------------------------------------------
-- RLS-enabled backstop — idempotent re-assertion for every table. Harmless if
-- already enabled; catches a table someone forgot to lock down.
-- ----------------------------------------------------------------------------
alter table public.contracts enable row level security;
alter table public.key_terms enable row level security;
alter table public.custom_key_terms enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.user_feedback enable row level security;
alter table public.term_corrections enable row level security;
alter table public.rate_limits enable row level security; -- superseded table; see below

-- ----------------------------------------------------------------------------
-- Superseded: the old `rate_limits` table (docs/specs/supabase-schema.sql) is
-- no longer written to by the application — lib/api/rateLimit.ts was deleted
-- and all routes now use lib/security/rateLimiter.ts / rate_limit_events
-- above. Its user-writable policies are also revoked here so it can't be used
-- to bypass anything even if old client code still references it. The table
-- itself is left in place rather than dropped, since dropping it is a
-- destructive, hard-to-reverse action outside the scope of this pass — drop
-- it manually once you've confirmed nothing else depends on it.
-- ----------------------------------------------------------------------------
drop policy if exists "rate_limits_select_own" on public.rate_limits;
drop policy if exists "rate_limits_insert_own" on public.rate_limits;
drop policy if exists "rate_limits_update_own" on public.rate_limits;
