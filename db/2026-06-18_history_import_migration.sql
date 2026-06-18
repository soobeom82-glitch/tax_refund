alter table if exists bank_transactions
  alter column balance_after drop not null;
