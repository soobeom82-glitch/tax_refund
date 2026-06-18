import { z } from "zod";

const telegramFileSchema = z.object({
  file_id: z.string(),
  file_unique_id: z.string(),
  file_name: z.string().optional(),
  mime_type: z.string().optional(),
  file_size: z.number().optional(),
});

const telegramPhotoSchema = z.object({
  file_id: z.string(),
  file_unique_id: z.string(),
  width: z.number(),
  height: z.number(),
  file_size: z.number().optional(),
});

const telegramMessageSchema = z.object({
  message_id: z.number(),
  date: z.number(),
  text: z.string().optional(),
  caption: z.string().optional(),
  chat: z.object({
    id: z.union([z.number(), z.string()]),
    type: z.string().optional(),
    title: z.string().optional(),
  }),
  document: telegramFileSchema.optional(),
  photo: z.array(telegramPhotoSchema).optional(),
});

const telegramUpdateSchema = z.object({
  update_id: z.number(),
  message: telegramMessageSchema.optional(),
  channel_post: telegramMessageSchema.optional(),
  business_message: telegramMessageSchema.optional(),
});

const telegramGetFileSchema = z.object({
  ok: z.literal(true),
  result: z.object({
    file_id: z.string(),
    file_unique_id: z.string(),
    file_path: z.string(),
    file_size: z.number().optional(),
  }),
});

export type TelegramMessage = z.infer<typeof telegramMessageSchema>;
type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

export type TelegramCommand =
  | "start"
  | "help"
  | "status"
  | "recent"
  | "vat"
  | "bank"
  | "chatid";

export function isAllowedTelegramRequest(request: Request, expectedSecret: string): boolean {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  return secret === expectedSecret;
}

export function parseTelegramUpdate(payload: unknown): TelegramUpdate | null {
  const result = telegramUpdateSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export function parseTelegramCommand(text?: string): TelegramCommand | null {
  if (!text) {
    return null;
  }

  const normalized = text.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  switch (normalized) {
    case "/start":
      return "start";
    case "/help":
      return "help";
    case "/status":
      return "status";
    case "/recent":
      return "recent";
    case "/vat":
      return "vat";
    case "/bank":
      return "bank";
    case "/chatid":
      return "chatid";
    default:
      return null;
  }
}

export function extractMessageFileCandidate(message: TelegramMessage) {
  if (message.document) {
    const extension = extensionFromFilename(message.document.file_name) ?? extensionFromMime(message.document.mime_type) ?? "bin";
    return {
      kind: "document",
      fileId: message.document.file_id,
      fileUniqueId: message.document.file_unique_id,
      fileName: message.document.file_name ?? `telegram-document.${extension}`,
      mimeType: message.document.mime_type ?? "application/octet-stream",
      fileSize: message.document.file_size ?? null,
      extension,
    };
  }

  if (message.photo?.length) {
    const largest = [...message.photo].sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0))[0];
    return {
      kind: "photo",
      fileId: largest.file_id,
      fileUniqueId: largest.file_unique_id,
      fileName: `telegram-photo-${largest.file_unique_id}.jpg`,
      mimeType: "image/jpeg",
      fileSize: largest.file_size ?? null,
      extension: "jpg",
    };
  }

  return null;
}

export async function getTelegramFileInfo(fileId: string, botToken: string) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`, {
    method: "GET",
  });
  if (!response.ok) {
    throw new Error(`Telegram getFile failed with status ${response.status}`);
  }

  const payload = await response.json();
  const parsed = telegramGetFileSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Telegram getFile returned an unexpected payload");
  }

  return parsed.data.result;
}

export async function fetchTelegramFileBuffer(filePath: string, botToken: string) {
  const response = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
  if (!response.ok) {
    throw new Error(`Telegram file download failed with status ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string | number,
  text: string,
  replyToMessageId?: number,
) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_to_message_id: replyToMessageId,
      allow_sending_without_reply: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed with status ${response.status}`);
  }

  return response.json();
}

function extensionFromFilename(filename?: string) {
  if (!filename || !filename.includes(".")) {
    return null;
  }
  return filename.split(".").pop()?.toLowerCase() ?? null;
}

function extensionFromMime(mimeType?: string) {
  if (!mimeType) {
    return null;
  }

  if (mimeType === "application/pdf") {
    return "pdf";
  }
  if (mimeType === "image/png") {
    return "png";
  }
  if (mimeType === "image/jpeg") {
    return "jpg";
  }
  return null;
}
