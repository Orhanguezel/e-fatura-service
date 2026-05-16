import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

import * as schema from "./schema";

export type Database = ReturnType<typeof createDatabase>["db"];
export type DatabasePool = ReturnType<typeof createDatabase>["pool"];

export function createDatabase(databaseUrl: string) {
  const pool = mysql.createPool({
    uri: databaseUrl,
    connectionLimit: 10,
    namedPlaceholders: true
  });

  return {
    pool,
    db: drizzle(pool, { schema, mode: "default" })
  };
}
