import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import pg from "pg";

/**
 * Wipes the test database and applies every migration, then points the app
 * at it. Each integration file starts this way, so the files run one at a
 * time (vitest.config.ts).
 */
export async function resetDatabase(url: string): Promise<void> {
  process.env.DATABASE_URL = url;
  process.env.APP_SECRET ??= "test-secret-test-secret-test-secret-0123";
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  const dir = path.join(process.cwd(), "migrations");
  for (const file of readdirSync(dir).sort()) {
    await client.query(readFileSync(path.join(dir, file), "utf8"));
  }
  await client.end();
}

/** Closes the app's connection pool so the test process can exit. */
export async function closeDatabase(): Promise<void> {
  const pool = (globalThis as { agsDb?: { $client: pg.Pool } }).agsDb?.$client;
  await pool?.end();
}
