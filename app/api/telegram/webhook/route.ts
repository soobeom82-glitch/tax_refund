import { put } from "@vercel/blob";
import { createHash } from "node:crypto";

import { getEnv } from "@/lib/env";
import {
  findSourceFileBySha256,
  getTelegramStatusSummary,
  insertSourceFileRecord,
  listRecentBankTransactions,
  listRecentSourceFiles,
  listRecentVatEvidence,
} from "@/lib/intake";
import {
  extractMessageFileCandidate,
  fetchTelegramFileBuffer,
  getTelegramFileInfo,
  isAllowedTelegramRequest,
  parseTelegramCommand,
  parseTelegramUpdate,
  sendTelegramMessage,
  type TelegramMessage,
} from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  return value.replace("T", " ").replace(".000Z", "");
}

async function handleCommand(message: TelegramMessage, botToken: string) {
  const command = parseTelegramCommand(message.text);
  if (!command) {
    return false;
  }

  if (command === "start" || command === "help") {
    await sendTelegramMessage(
      botToken,
      message.chat.id,
      [
        "세금/통장 자료 수집 봇입니다.",
        "",
        "파일을 보내면 source_files 에 저장합니다.",
        "",
        "명령어:",
        "/status - 현재 건수 요약",
        "/recent - 최근 수신 파일",
        "/vat - 최근 증빙 5건",
        "/bank - 최근 통장거래 5건",
        "/chatid - 현재 채팅방 ID 확인",
      ].join("\n"),
      message.message_id,
    );
    return true;
  }

  if (command === "chatid") {
    await sendTelegramMessage(
      botToken,
      message.chat.id,
      `chat.id: ${String(message.chat.id)}\nchat.type: ${message.chat.type ?? "-"}`,
      message.message_id,
    );
    return true;
  }

  if (command === "status") {
    const summary = await getTelegramStatusSummary();
    await sendTelegramMessage(
      botToken,
      message.chat.id,
      [
        "현재 저장 현황",
        `- source_files: ${summary.sourceFiles}건`,
        `- pending_review: ${summary.pendingSourceFiles}건`,
        `- vat_evidence: ${summary.vatEvidence}건`,
        `- bank_transactions: ${summary.bankTransactions}건`,
      ].join("\n"),
      message.message_id,
    );
    return true;
  }

  if (command === "recent") {
    const rows = await listRecentSourceFiles(5);
    const lines = rows.length
      ? rows.map((row, index) => `${index + 1}. ${row.original_filename ?? "(이름없음)"} | ${row.status} | ${formatDateTime(row.created_at)}`)
      : ["최근 수신 파일이 없습니다."];
    await sendTelegramMessage(botToken, message.chat.id, ["최근 수신 파일", ...lines].join("\n"), message.message_id);
    return true;
  }

  if (command === "vat") {
    const rows = await listRecentVatEvidence(5);
    const lines = rows.length
      ? rows.map((row, index) => `${index + 1}. ${row.issue_date ?? "-"} | ${row.vendor ?? "-"} | ${row.item ?? "-"} | ${row.total_amount ?? "-"}`)
      : ["저장된 증빙이 없습니다."];
    await sendTelegramMessage(botToken, message.chat.id, ["최근 증빙 5건", ...lines].join("\n"), message.message_id);
    return true;
  }

  if (command === "bank") {
    const rows = await listRecentBankTransactions(5);
    const lines = rows.length
      ? rows.map((row, index) => `${index + 1}. ${formatDateTime(row.transaction_datetime)} | ${row.description} | ${row.amount}`)
      : ["저장된 통장거래가 없습니다."];
    await sendTelegramMessage(botToken, message.chat.id, ["최근 통장거래 5건", ...lines].join("\n"), message.message_id);
    return true;
  }

  return false;
}

export async function POST(request: Request) {
  const env = getEnv();

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

  const handled = await handleCommand(message, env.telegramBotToken);
  if (handled) {
    return Response.json({ ok: true, handled: "command" });
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
    await sendTelegramMessage(
      env.telegramBotToken,
      message.chat.id,
      `중복 파일입니다.\nsource_file_id: ${existing.id}\nstatus: ${existing.status}`,
      message.message_id,
    );
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
    },
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

  await sendTelegramMessage(
    env.telegramBotToken,
    message.chat.id,
    [
      "파일 저장 완료",
      `source_file_id: ${sourceRecord.id}`,
      `status: ${sourceRecord.status}`,
      `filename: ${candidate.fileName}`,
    ].join("\n"),
    message.message_id,
  );

  return Response.json({
    ok: true,
    sourceFileId: sourceRecord.id,
    blobPathname: blob.pathname,
    intakeStatus: sourceRecord.status,
  });
}
