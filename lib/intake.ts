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
