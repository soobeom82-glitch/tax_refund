# tax_refund

Telegram based intake server for VAT evidence files and business bank transaction files.

## Stack

- Next.js on Vercel
- Vercel Blob for source file storage
- Postgres via `DATABASE_URL`
- Telegram Bot webhook

## Why this structure

The previous local workflow used files and CSV ledgers. On Vercel, persistent local files are not a good source of truth, so this project uses:

- Blob for original uploaded files
- Postgres for searchable structured records

## Environment variables

Copy `.env.example` to `.env.local` and fill:

- `DATABASE_URL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_ALLOWED_CHAT_IDS`
- `BLOB_READ_WRITE_TOKEN`
- `APP_BASE_URL`

## Database setup

Run the SQL in [db/schema.sql](/Users/KAKAO/Documents/tax_refund/db/schema.sql) on Supabase, Neon, or another Postgres host.

## Telegram webhook setup

Set the webhook after deployment:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -d "url=https://your-project.vercel.app/api/telegram/webhook" \
  -d "secret_token=<YOUR_SECRET>"
```

`TELEGRAM_ALLOWED_CHAT_IDS` should be a comma-separated allowlist such as:

```bash
TELEGRAM_ALLOWED_CHAT_IDS="-1001234567890,123456789"
```

## Current scope

Current webhook behavior:

1. Validate Telegram webhook secret
2. Accept document or photo messages from allowed chats
3. Resolve the Telegram file path with `getFile`
4. Download the file
5. Upload the file to private Blob storage
6. Insert one `source_files` row in Postgres

## Next steps

- OCR pipeline for tax invoices and screenshots
- Duplicate review UI
- Confirm action to create `vat_evidence` rows
- Confirm action to create `bank_transactions` rows
- Half-year export and reporting pages
