import { getSql } from "@/lib/db";

type SourceFileInsertInput = {
  sourceKind: string;
  telegramChatId: string | null;
  telegramMessageId: string | null;
  telegramFileId: string | null;
  telegramFileUniqueId: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  fileSize: number | null;
  blobUrl: string;
  blobPathname: string;
  sha256: string;
  notes: string | null;
  status: "pending_review" | "confirmed" | "duplicate" | "failed";
};

type SourceFileRow = {
  id: string;
  status: SourceFileInsertInput["status"];
};

type SourceFileSummary = {
  id: string;
  original_filename: string | null;
  status: string;
  created_at: string;
};

type VatEvidenceSummary = {
  issue_date: string | null;
  vendor: string | null;
  item: string | null;
  total_amount: string | null;
};

type BankTransactionSummary = {
  transaction_datetime: string;
  description: string;
  amount: string;
};

export async function findSourceFileBySha256(sha256: string): Promise<SourceFileRow | null> {
  const sql = getSql();
  const existing = await sql<SourceFileRow[]>`
    select id, status
    from source_files
    where sha256 = ${sha256}
    limit 1
  `;

  return existing[0] ?? null;
}

export async function insertSourceFileRecord(input: SourceFileInsertInput): Promise<SourceFileRow> {
  const sql = getSql();
  const existing = await findSourceFileBySha256(input.sha256);
  if (existing) {
    return existing;
  }

  const inserted = await sql<SourceFileRow[]>`
    insert into source_files (
      source_kind,
      telegram_chat_id,
      telegram_message_id,
      telegram_file_id,
      telegram_file_unique_id,
      original_filename,
      mime_type,
      file_size,
      blob_url,
      blob_pathname,
      sha256,
      notes,
      status
    ) values (
      ${input.sourceKind},
      ${input.telegramChatId},
      ${input.telegramMessageId},
      ${input.telegramFileId},
      ${input.telegramFileUniqueId},
      ${input.originalFilename},
      ${input.mimeType},
      ${input.fileSize},
      ${input.blobUrl},
      ${input.blobPathname},
      ${input.sha256},
      ${input.notes},
      ${input.status}
    )
    returning id, status
  `;

  return inserted[0];
}

export async function getTelegramStatusSummary() {
  const sql = getSql();
  const source = await sql<{ count: number }[]>`
    select count(*)::int as count
    from source_files
  `;
  const pending = await sql<{ count: number }[]>`
    select count(*)::int as count
    from source_files
    where status = 'pending_review'
  `;
  const vat = await sql<{ count: number }[]>`
    select count(*)::int as count
    from vat_evidence
  `;
  const bank = await sql<{ count: number }[]>`
    select count(*)::int as count
    from bank_transactions
  `;

  return {
    sourceFiles: source[0]?.count ?? 0,
    pendingSourceFiles: pending[0]?.count ?? 0,
    vatEvidence: vat[0]?.count ?? 0,
    bankTransactions: bank[0]?.count ?? 0,
  };
}

export async function listRecentSourceFiles(limit = 5) {
  const sql = getSql();
  return sql<SourceFileSummary[]>`
    select id, original_filename, status, created_at::text
    from source_files
    order by created_at desc
    limit ${limit}
  `;
}

export async function listRecentVatEvidence(limit = 5) {
  const sql = getSql();
  return sql<VatEvidenceSummary[]>`
    select issue_date::text, vendor, item, total_amount::text
    from vat_evidence
    order by created_at desc
    limit ${limit}
  `;
}

export async function listRecentBankTransactions(limit = 5) {
  const sql = getSql();
  return sql<BankTransactionSummary[]>`
    select transaction_datetime::text, description, amount::text
    from bank_transactions
    order by created_at desc
    limit ${limit}
  `;
}
