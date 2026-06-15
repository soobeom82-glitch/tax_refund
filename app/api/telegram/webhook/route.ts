import { put } from "@vercel/blob";
import { createHash } from "node:crypto";

import { env } from "@/lib/env";
import { findSourceFileBySha256, insertSourceFileRecord } from "@/lib/intake";
import {
  extractMessageFileCandidate,
  fetchTelegramFileBuffer,
  getTelegramFileInfo,
  isAllowedTelegramRequest,
  parseTelegramUpdate,
} from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isAllowedTelegramRequest(request, env.telegramWebhookSecret)) {
    return Response.json({ ok: false, error: "invalid_telegram_secret" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const update = parseTelegramUpdate(payload);
  if (!update) {
    return Response.json({ ok: true, skipped: "invalid_update" });
  }

  const message = update.message ?? update.channel_post ?? update.business_message ?? null;
  if (!message) {
    return Response.json({ ok: true, skipped: "unsupported_update_type" });
  }

  if (!env.telegramAllowedChatIds.has(String(message.chat.id))) {
    return Response.json({ ok: true, skipped: "chat_not_allowed" });
  }

  const candidate = extractMessageFileCandidate(message);
  if (!candidate) {
    return Response.json({ ok: true, skipped: "no_file_candidate" });
  }

  const fileInfo = await getTelegramFileInfo(candidate.fileId, env.telegramBotToken);
  const fileBuffer = await fetchTelegramFileBuffer(fileInfo.file_path, env.telegramBotToken);
  const sha256 = createHash("sha256").update(fileBuffer).digest("hex");

  const existing = await findSourceFileBySha256(sha256);
  if (existing) {
    return Response.json({
      ok: true,
      sourceFileId: existing.id,
      intakeStatus: existing.status,
      duplicate: true,
    });
  }

  const pathname = [
    "telegram-intake",
    `${new Date(message.date * 1000).getUTCFullYear()}`,
    candidate.kind,
    `${message.chat.id}`,
    `${message.message_id}-${candidate.fileUniqueId}.${candidate.extension}`,
  ].join("/");

  const blob = await put(
    pathname,
    new Blob([fileBuffer]),
    {
      access: "private",
      addRandomSuffix: false,
      contentType: candidate.mimeType,
    } as never,
  );

  const sourceRecord = await insertSourceFileRecord({
    sourceKind: "telegram",
    telegramChatId: String(message.chat.id),
    telegramMessageId: String(message.message_id),
    telegramFileId: candidate.fileId,
    telegramFileUniqueId: candidate.fileUniqueId,
    originalFilename: candidate.fileName,
    mimeType: candidate.mimeType,
    fileSize: candidate.fileSize,
    blobUrl: blob.url,
    blobPathname: blob.pathname,
    sha256,
    notes: message.caption ?? null,
    status: "pending_review",
  });

  return Response.json({
    ok: true,
    sourceFileId: sourceRecord.id,
    blobPathname: blob.pathname,
    intakeStatus: sourceRecord.status,
  });
}
