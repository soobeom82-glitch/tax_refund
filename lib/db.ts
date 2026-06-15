import postgres from "postgres";

import { env } from "@/lib/env";

export const sql = postgres(env.databaseUrl, {
  max: 1,
  prepare: false,
  ssl: "require",
});
