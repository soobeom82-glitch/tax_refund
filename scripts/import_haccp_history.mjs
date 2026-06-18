import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import path from "node:path";
import process from "node:process";

import { put } from "@vercel/blob";
import postgres from "postgres";

const DEFAULT_HACCP_ROOT = "/Users/KAKAO/Documents/HACCP";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseArgs(argv) {
  const args = {
    haccpRoot: DEFAULT_HACCP_ROOT,
    mode: "all",
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--haccp-root") {
      args.haccpRoot = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--mode") {
      args.mode = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--dry-run") {
      args.dryRun = true;
    }
  }

  if (!["all", "vat", "bank"].includes(args.mode)) {
    throw new Error(`Unsupported mode: ${args.mode}`);
  }

  return args;
}

function csvSplit(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

async function readCsv(filePath) {
  const raw = await readFile(filePath, "utf8");
  const normalized = raw.replace(/^\uFEFF/, "").trim();
  if (!normalized) {
    return [];
  }
  const lines = normalized.split(/\r?\n/);
  const headers = csvSplit(lines[0]);

  return lines.slice(1).filter(Boolean).map((line) => {
    const values = csvSplit(line);
    return headers.reduce((row, header, idx) => {
      row[header] = values[idx] ?? "";
      return row;
    }, {});
  });
}

function inferMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    default:
      return "application/octet-stream";
  }
}

function slug(value) {
  return value
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "item";
}

async function sha256ForFile(filePath) {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);

  return await new Promise((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function vatDuplicateKey(row) {
  return [
    row.issue_date,
    row.summary || row.doc_kind || "증빙",
    row.supply_amount || "",
    row.vat_amount || "",
    row.total_amount || "",
  ].join("|");
}

function bankDuplicateKey(row) {
  return [
    row["거래일시"] || "",
    row["적요"] || "",
    row["거래유형"] || "",
    row["거래금액"] || "",
    row["거래후잔액"] || "",
  ].join("|");
}

async function ensureSourceFile(sql, haccpRoot, storedRelativePath, options) {
  const absolutePath = path.resolve(haccpRoot, storedRelativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Source file not found: ${absolutePath}`);
  }

  const sha256 = await sha256ForFile(absolutePath);
  const existing = await sql`
    select id, blob_url, blob_pathname
    from source_files
    where sha256 = ${sha256}
    limit 1
  `;
  if (existing[0]) {
    return existing[0];
  }

  const buffer = await readFile(absolutePath);
  const blobPathname = options.blobPathname;

  if (options.dryRun) {
    return {
      id: `dry-run-${sha256.slice(0, 12)}`,
      blob_url: `dry-run://${blobPathname}`,
      blob_pathname: blobPathname,
    };
  }

  const blob = await put(blobPathname, new Blob([buffer]), {
    access: "private",
    addRandomSuffix: false,
    contentType: inferMimeType(absolutePath),
  });

  const inserted = await sql`
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
      ${options.sourceKind},
      null,
      null,
      null,
      null,
      ${path.basename(absolutePath)},
      ${inferMimeType(absolutePath)},
      ${buffer.length},
      ${blob.url},
      ${blob.pathname},
      ${sha256},
      ${options.notes},
      ${options.status}
    )
    returning id, blob_url, blob_pathname
  `;

  return inserted[0];
}

async function importVatHistory(sql, haccpRoot, dryRun) {
  const manifestPath = path.join(haccpRoot, "documents/tax-filing/.vat-evidence-manifest.csv");
  const rows = await readCsv(manifestPath);
  let imported = 0;
  let duplicates = 0;

  for (const row of rows) {
    const duplicate = await sql`
      select id
      from vat_evidence
      where duplicate_key = ${vatDuplicateKey(row)}
      limit 1
    `;
    if (duplicate[0]) {
      duplicates += 1;
      continue;
    }

    const source = await ensureSourceFile(sql, haccpRoot, row.stored_relative_path, {
      blobPathname: `historical/vat-evidence/${row.issue_date}/${path.basename(row.stored_relative_path)}`,
      sourceKind: "historical_vat_evidence",
      notes: row.notes || null,
      status: "confirmed",
      dryRun,
    });

    if (!dryRun) {
      await sql`
        insert into vat_evidence (
          source_file_id,
          issue_date,
          vendor,
          item,
          supply_amount,
          vat_amount,
          total_amount,
          status,
          duplicate_key,
          notes
        ) values (
          ${source.id},
          ${row.issue_date || null},
          ${row.vendor || null},
          ${row.summary || row.doc_kind || "증빙"},
          ${row.supply_amount ? Number(row.supply_amount) : null},
          ${row.vat_amount ? Number(row.vat_amount) : null},
          ${row.total_amount ? Number(row.total_amount) : null},
          ${"confirmed"},
          ${vatDuplicateKey(row)},
          ${row.notes || null}
        )
      `;
    }

    imported += 1;
  }

  return { processed: rows.length, imported, duplicates };
}

async function importBankHistory(sql, haccpRoot, dryRun) {
  const manifestPath = path.join(haccpRoot, "documents/finance-ledgers/.post-public-haccp-bank-ledger-manifest.csv");
  const rows = await readCsv(manifestPath);
  let imported = 0;
  let duplicates = 0;
  const sourceCache = new Map();

  if (!dryRun) {
    await sql`alter table if exists bank_transactions alter column balance_after drop not null`;
  }

  for (const row of rows) {
    const duplicate = await sql`
      select id
      from bank_transactions
      where duplicate_key = ${bankDuplicateKey(row)}
      limit 1
    `;
    if (duplicate[0]) {
      duplicates += 1;
      continue;
    }

    const relativePath = row.stored_relative_path;
    let source = sourceCache.get(relativePath);
    if (!source) {
      source = await ensureSourceFile(sql, haccpRoot, relativePath, {
        blobPathname: `historical/bank-source/${path.basename(relativePath)}`,
        sourceKind: "historical_bank_export",
        notes: row.source_filename || null,
        status: "confirmed",
        dryRun,
      });
      sourceCache.set(relativePath, source);
    }

    if (!dryRun) {
      await sql`
        insert into bank_transactions (
          source_file_id,
          transaction_datetime,
          description,
          transaction_type,
          institution,
          account_number,
          amount,
          balance_after,
          memo,
          duplicate_key
        ) values (
          ${source.id},
          ${row["거래일시"]},
          ${row["적요"] || ""},
          ${row["거래유형"] || ""},
          ${row["거래기관"] || null},
          ${row["계좌번호"] || null},
          ${row["거래금액"] ? Number(row["거래금액"]) : 0},
          ${row["거래후잔액"] ? Number(row["거래후잔액"]) : null},
          ${row["메모"] || null},
          ${bankDuplicateKey(row)}
        )
      `;
    }

    imported += 1;
  }

  return { processed: rows.length, imported, duplicates, sourceFiles: sourceCache.size };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = requireEnv("DATABASE_URL");
  requireEnv("BLOB_READ_WRITE_TOKEN");

  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    ssl: "require",
  });

  try {
    const summary = {};

    if (args.mode === "all" || args.mode === "vat") {
      summary.vat = await importVatHistory(sql, args.haccpRoot, args.dryRun);
    }

    if (args.mode === "all" || args.mode === "bank") {
      summary.bank = await importBankHistory(sql, args.haccpRoot, args.dryRun);
    }

    console.log(JSON.stringify({ ok: true, dryRun: args.dryRun, summary }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
