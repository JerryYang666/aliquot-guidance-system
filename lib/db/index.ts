import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const pool = new Pool({
    connectionString,
    // Local databases run without TLS; hosted ones (RDS, Neon, Supabase) need it.
    ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(connectionString)
      ? false
      : { rejectUnauthorized: false },
    // Each serverless instance holds a few connections; the database's own
    // limit is the one that matters, so keep this small.
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 60_000,
  });
  // An idle client that dies reports here, not to any query. Without a
  // listener, Node treats it as an uncaught exception and kills the instance;
  // the pool has already discarded the client, so logging is enough.
  pool.on("error", (error) => {
    console.warn("[db] idle client error:", error.message);
  });
  return pool;
}

type Db = ReturnType<typeof drizzle<typeof schema>>;

// One pool per server instance, reused across hot reloads in development.
const globalForDb = globalThis as unknown as { agsDb?: Db };

export function getDb(): Db {
  globalForDb.agsDb ??= drizzle(createPool(), { schema });
  return globalForDb.agsDb;
}

/** A transaction handle; it can run every query a `Db` can. */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type DbOrTx = Db | Tx;

export type { Db, DbOrTx, Tx };
export { schema };
