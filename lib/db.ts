import postgres from "postgres";

import { getEnv } from "@/lib/env";

let sqlInstance: postgres.Sql | null = null;

export function getSql() {
  if (sqlInstance) {
    return sqlInstance;
  }

  const env = getEnv();
  sqlInstance = postgres(env.databaseUrl, {
    max: 1,
    prepare: false,
    ssl: "require",
  });
  return sqlInstance;
}
