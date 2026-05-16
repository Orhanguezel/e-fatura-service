import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import mysql from "mysql2/promise";

import { loadEnv } from "../../config/env";
import { hashApiKey } from "../../lib/apiKey";
import { encryptSecret } from "../../lib/crypto";

const env = loadEnv();
const seedDir = join(import.meta.dir, "sql");
const files = (await readdir(seedDir))
  .filter((file) => file.endsWith(".sql"))
  .sort();

function renderSeedTemplate(sql: string): string {
  const apiKey =
    env.EFATURA_DEV_TENANT_API_KEY ?? "sportoonline-dev-api-key";
  const webhookSecret =
    env.EFATURA_DEV_WEBHOOK_SECRET ?? "sportoonline-dev-webhook-secret";

  return sql
    .replaceAll("{{API_KEY_HASH}}", hashApiKey(apiKey))
    .replaceAll(
      "{{INTEGRATOR_CREDENTIALS}}",
      encryptSecret(env.EFATURA_DEV_INTEGRATOR_CREDENTIALS, env.EFATURA_ENC_KEY)
    )
    .replaceAll(
      "{{WEBHOOK_SECRET}}",
      encryptSecret(webhookSecret, env.EFATURA_ENC_KEY)
    );
}

const connection = await mysql.createConnection({
  uri: env.DATABASE_URL,
  multipleStatements: true
});

try {
  await connection.query("SET FOREIGN_KEY_CHECKS = 0");
  await connection.query("DROP TABLE IF EXISTS invoice_events");
  await connection.query("DROP TABLE IF EXISTS invoices");
  await connection.query("DROP TABLE IF EXISTS tenants");
  await connection.query("SET FOREIGN_KEY_CHECKS = 1");

  for (const file of files) {
    const sql = renderSeedTemplate(await readFile(join(seedDir, file), "utf8"));
    await connection.query(sql);
    console.log(`applied ${file}`);
  }
} finally {
  await connection.end();
}
