create extension if not exists "pgcrypto";

create table if not exists source_files (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null,
  telegram_chat_id text,
  telegram_message_id text,
  telegram_file_id text,
  telegram_file_unique_id text,
  original_filename text,
  mime_type text,
  file_size bigint,
  blob_url text not null,
  blob_pathname text not null,
  sha256 text not null unique,
  notes text,
  status text not null default 'pending_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists source_files_created_at_idx on source_files (created_at desc);
create index if not exists source_files_telegram_unique_idx on source_files (telegram_file_unique_id);

create table if not exists vat_evidence (
  id uuid primary key default gen_random_uuid(),
  source_file_id uuid references source_files(id) on delete set null,
  issue_date date,
  vendor text,
  item text,
  supply_amount numeric(14, 0),
  vat_amount numeric(14, 0),
  total_amount numeric(14, 0),
  status text not null default 'pending_review',
  duplicate_key text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vat_evidence_duplicate_key_idx
  on vat_evidence (duplicate_key)
  where duplicate_key is not null;

create table if not exists bank_transactions (
  id uuid primary key default gen_random_uuid(),
  source_file_id uuid references source_files(id) on delete set null,
  transaction_datetime timestamptz not null,
  description text not null,
  transaction_type text not null,
  institution text,
  account_number text,
  amount numeric(14, 0) not null,
  balance_after numeric(14, 0) not null,
  memo text,
  duplicate_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
