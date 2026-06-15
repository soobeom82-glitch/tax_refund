import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1),
  TELEGRAM_ALLOWED_CHAT_IDS: z.string().default(""),
  BLOB_READ_WRITE_TOKEN: z.string().min(1),
  APP_BASE_URL: z.string().url(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

const allowedIds = parsed.data.TELEGRAM_ALLOWED_CHAT_IDS.split(",")
  .map((value) => value.trim())
  .filter(Boolean);

export const env = {
  databaseUrl: parsed.data.DATABASE_URL,
  telegramBotToken: parsed.data.TELEGRAM_BOT_TOKEN,
  telegramWebhookSecret: parsed.data.TELEGRAM_WEBHOOK_SECRET,
  telegramAllowedChatIds: new Set(allowedIds),
  blobReadWriteToken: parsed.data.BLOB_READ_WRITE_TOKEN,
  appBaseUrl: parsed.data.APP_BASE_URL,
};
