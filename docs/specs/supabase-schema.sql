-- ============================================================================
-- ContractIQ — Supabase Schema
-- Paste this entire file into the Supabase SQL Editor and run it once on a
-- fresh project. Safe to re-run (idempotent) thanks to IF NOT EXISTS guards.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type contract_type_enum as enum ('nda', 'msa');
exception when duplicate_object then null; end $$;

do $$ begin
  create type contract_status_enum as enum ('uploaded', 'processing', 'completed', 'error');
exception when duplicate_object then null; end $$;

do $$ begin
  create type chat_role_enum as enum ('user', 'assistant');
exception when duplicate_object then null; end $$;

do $$ begin
  create type chat_source_enum as enum ('contract', 'history', 'both');
exception when duplicate_object then null; end $$;

do $$ begin
  create type feedback_rating_enum as enum ('up', 'down');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Table: contracts
-- ----------------------------------------------------------------------------
create table if not exists public.contracts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  contract_type   contract_type_enum not null,
  file_name       text not null,
  file_path       text,                          -- null if Storage upload failed (non-blocking)
  contract_text   text not null,                 -- extracted text with [PAGE N] markers
  page_count      integer not null check (page_count > 0 and page_count <= 20),
  status          contract_status_enum not null default 'uploaded',
  error_message   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_contracts_user_created on public.contracts (user_id, created_at desc);
create index if not exists idx_contracts_user_status on public.contracts (user_id, status);

-- ----------------------------------------------------------------------------
-- Table: key_terms
-- ----------------------------------------------------------------------------
create table if not exists public.key_terms (
  id                uuid primary key default gen_random_uuid(),
  contract_id       uuid not null references public.contracts(id) on delete cascade,
  term_name         text not null,
  value             text not null,
  original_value    text not null,
  page_number       integer not null check (page_number > 0),
  confidence_score  numeric(5,2) not null check (confidence_score >= 0 and confidence_score <= 100),
  source_sentence   text not null,
  is_custom         boolean not null default false,
  edited            boolean not null default false,
  created_at        timestamptz not null default now()
);

create index if not exists idx_key_terms_contract on public.key_terms (contract_id);

-- ----------------------------------------------------------------------------
-- Table: custom_key_terms
-- ----------------------------------------------------------------------------
create table if not exists public.custom_key_terms (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid not null references public.contracts(id) on delete cascade,
  term_name     text not null,
  is_manual     boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists idx_custom_key_terms_contract on public.custom_key_terms (contract_id);

-- Enforce max 5 custom terms per contract at the DB level as a backstop
-- (primary enforcement is application-level).
create or replace function public.enforce_custom_term_limit()
returns trigger as $$
begin
  if (select count(*) from public.custom_key_terms where contract_id = new.contract_id) >= 5 then
    raise exception 'A contract may have at most 5 custom key terms';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_enforce_custom_term_limit on public.custom_key_terms;
create trigger trg_enforce_custom_term_limit
  before insert on public.custom_key_terms
  for each row execute function public.enforce_custom_term_limit();

-- ----------------------------------------------------------------------------
-- Table: chat_sessions
-- ----------------------------------------------------------------------------
create table if not exists public.chat_sessions (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid not null references public.contracts(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now()
);

create index if not exists idx_chat_sessions_contract on public.chat_sessions (contract_id);

-- ----------------------------------------------------------------------------
-- Table: chat_messages
-- ----------------------------------------------------------------------------
create table if not exists public.chat_messages (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.chat_sessions(id) on delete cascade,
  role          chat_role_enum not null,
  content       text not null,
  source_type   chat_source_enum, -- classification used to answer this message; null for user messages
  created_at    timestamptz not null default now()
);

-- Safe to re-run against a pre-existing table created before source_type existed.
alter table public.chat_messages add column if not exists source_type chat_source_enum;

create index if not exists idx_chat_messages_session_created on public.chat_messages (session_id, created_at asc);

-- ----------------------------------------------------------------------------
-- Table: user_feedback
-- ----------------------------------------------------------------------------
create table if not exists public.user_feedback (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid not null references public.contracts(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  rating        feedback_rating_enum not null,
  comment       text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_user_feedback_contract on public.user_feedback (contract_id);

-- ----------------------------------------------------------------------------
-- Table: term_corrections
-- ----------------------------------------------------------------------------
create table if not exists public.term_corrections (
  id                uuid primary key default gen_random_uuid(),
  key_term_id       uuid not null references public.key_terms(id) on delete cascade,
  original_value    text not null,
  corrected_value   text not null,
  corrected_at      timestamptz not null default now()
);

create index if not exists idx_term_corrections_key_term on public.term_corrections (key_term_id);

-- ----------------------------------------------------------------------------
-- Table: rate_limits
-- ----------------------------------------------------------------------------
create table if not exists public.rate_limits (
  user_id         uuid not null references auth.users(id) on delete cascade,
  route           text not null,
  window_start    timestamptz not null,
  request_count   integer not null default 0,
  primary key (user_id, route, window_start)
);

-- ----------------------------------------------------------------------------
-- updated_at auto-update trigger (contracts is the only table with this column)
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_contracts_updated_at on public.contracts;
create trigger trg_contracts_updated_at
  before update on public.contracts
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.contracts enable row level security;
alter table public.key_terms enable row level security;
alter table public.custom_key_terms enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.user_feedback enable row level security;
alter table public.term_corrections enable row level security;
alter table public.rate_limits enable row level security;

-- contracts: direct ownership
drop policy if exists "contracts_select_own" on public.contracts;
create policy "contracts_select_own" on public.contracts
  for select using (auth.uid() = user_id);

drop policy if exists "contracts_insert_own" on public.contracts;
create policy "contracts_insert_own" on public.contracts
  for insert with check (auth.uid() = user_id);

drop policy if exists "contracts_update_own" on public.contracts;
create policy "contracts_update_own" on public.contracts
  for update using (auth.uid() = user_id);

drop policy if exists "contracts_delete_own" on public.contracts;
create policy "contracts_delete_own" on public.contracts
  for delete using (auth.uid() = user_id);

-- key_terms: ownership via parent contract
drop policy if exists "key_terms_select_own" on public.key_terms;
create policy "key_terms_select_own" on public.key_terms
  for select using (
    exists (select 1 from public.contracts c where c.id = key_terms.contract_id and c.user_id = auth.uid())
  );

drop policy if exists "key_terms_insert_own" on public.key_terms;
create policy "key_terms_insert_own" on public.key_terms
  for insert with check (
    exists (select 1 from public.contracts c where c.id = key_terms.contract_id and c.user_id = auth.uid())
  );

drop policy if exists "key_terms_update_own" on public.key_terms;
create policy "key_terms_update_own" on public.key_terms
  for update using (
    exists (select 1 from public.contracts c where c.id = key_terms.contract_id and c.user_id = auth.uid())
  );

drop policy if exists "key_terms_delete_own" on public.key_terms;
create policy "key_terms_delete_own" on public.key_terms
  for delete using (
    exists (select 1 from public.contracts c where c.id = key_terms.contract_id and c.user_id = auth.uid())
  );

-- custom_key_terms: ownership via parent contract
drop policy if exists "custom_key_terms_select_own" on public.custom_key_terms;
create policy "custom_key_terms_select_own" on public.custom_key_terms
  for select using (
    exists (select 1 from public.contracts c where c.id = custom_key_terms.contract_id and c.user_id = auth.uid())
  );

drop policy if exists "custom_key_terms_insert_own" on public.custom_key_terms;
create policy "custom_key_terms_insert_own" on public.custom_key_terms
  for insert with check (
    exists (select 1 from public.contracts c where c.id = custom_key_terms.contract_id and c.user_id = auth.uid())
  );

drop policy if exists "custom_key_terms_delete_own" on public.custom_key_terms;
create policy "custom_key_terms_delete_own" on public.custom_key_terms
  for delete using (
    exists (select 1 from public.contracts c where c.id = custom_key_terms.contract_id and c.user_id = auth.uid())
  );

-- chat_sessions: direct ownership
drop policy if exists "chat_sessions_select_own" on public.chat_sessions;
create policy "chat_sessions_select_own" on public.chat_sessions
  for select using (auth.uid() = user_id);

drop policy if exists "chat_sessions_insert_own" on public.chat_sessions;
create policy "chat_sessions_insert_own" on public.chat_sessions
  for insert with check (auth.uid() = user_id);

-- chat_messages: ownership via parent session
drop policy if exists "chat_messages_select_own" on public.chat_messages;
create policy "chat_messages_select_own" on public.chat_messages
  for select using (
    exists (select 1 from public.chat_sessions s where s.id = chat_messages.session_id and s.user_id = auth.uid())
  );

drop policy if exists "chat_messages_insert_own" on public.chat_messages;
create policy "chat_messages_insert_own" on public.chat_messages
  for insert with check (
    exists (select 1 from public.chat_sessions s where s.id = chat_messages.session_id and s.user_id = auth.uid())
  );

-- user_feedback: direct ownership
drop policy if exists "user_feedback_select_own" on public.user_feedback;
create policy "user_feedback_select_own" on public.user_feedback
  for select using (auth.uid() = user_id);

drop policy if exists "user_feedback_insert_own" on public.user_feedback;
create policy "user_feedback_insert_own" on public.user_feedback
  for insert with check (auth.uid() = user_id);

-- term_corrections: ownership via key_term -> contract
drop policy if exists "term_corrections_select_own" on public.term_corrections;
create policy "term_corrections_select_own" on public.term_corrections
  for select using (
    exists (
      select 1 from public.key_terms kt
      join public.contracts c on c.id = kt.contract_id
      where kt.id = term_corrections.key_term_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "term_corrections_insert_own" on public.term_corrections;
create policy "term_corrections_insert_own" on public.term_corrections
  for insert with check (
    exists (
      select 1 from public.key_terms kt
      join public.contracts c on c.id = kt.contract_id
      where kt.id = term_corrections.key_term_id and c.user_id = auth.uid()
    )
  );

-- rate_limits: direct ownership (read/write own counters only)
drop policy if exists "rate_limits_select_own" on public.rate_limits;
create policy "rate_limits_select_own" on public.rate_limits
  for select using (auth.uid() = user_id);

drop policy if exists "rate_limits_insert_own" on public.rate_limits;
create policy "rate_limits_insert_own" on public.rate_limits
  for insert with check (auth.uid() = user_id);

drop policy if exists "rate_limits_update_own" on public.rate_limits;
create policy "rate_limits_update_own" on public.rate_limits
  for update using (auth.uid() = user_id);

-- ============================================================================
-- Storage: contracts bucket
-- Object path pattern (relative to the bucket — do NOT repeat the bucket name):
--   {user_id}/{contract_id}/{filename}.pdf
-- storage.foldername(name)[1] must resolve to user_id for the RLS policies
-- below to match; a leading "contracts/" segment would break every policy.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('contracts', 'contracts', false, 10485760) -- 10 MB
on conflict (id) do nothing;

drop policy if exists "contracts_storage_insert_own" on storage.objects;
create policy "contracts_storage_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'contracts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "contracts_storage_select_own" on storage.objects;
create policy "contracts_storage_select_own" on storage.objects
  for select using (
    bucket_id = 'contracts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "contracts_storage_delete_own" on storage.objects;
create policy "contracts_storage_delete_own" on storage.objects
  for delete using (
    bucket_id = 'contracts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- End of schema
-- ============================================================================
