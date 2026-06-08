import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../shared/schema";

// SUPABASE ONLY - No Replit database fallback
const databaseUrl = process.env.SUPABASE_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "SUPABASE_DATABASE_URL must be set. This application only uses Supabase for data storage.",
  );
}

console.log(`Database: Using Supabase database`);

let queryClient = postgres(databaseUrl, {
  max: 10,
  // Supabase's pgbouncer kills idle pooler connections aggressively. If the
  // client holds an idle conn longer than that, the NEXT query on that conn
  // fails on a dead socket — the cause of "sometimes loads, sometimes doesn't"
  // intermittency. Closing client-side after 20s keeps the pool fresh.
  idle_timeout: 20,
  connect_timeout: 30,
  max_lifetime: 60 * 30,   // recycle connections every 30 min
  prepare: false,          // pgbouncer transaction-mode doesn't support prepared statements
  ssl: process.env.SUPABASE_DATABASE_URL ? 'require' : undefined,
});

let db = drizzle(queryClient, { schema });

// Expose the raw postgres client for hot paths that benefit from skipping drizzle's
// execute() row-iteration overhead (e.g. the lightweight course-list SELECT).
export function getRawSql() {
  return queryClient;
}

export async function getDb() {
  return db;
}

export async function reconnectDb() {
  try {
    await queryClient.end();
  } catch (e) {
    console.log('Error ending old connection:', e);
  }
  
  const dbUrl = process.env.SUPABASE_DATABASE_URL;
  if (!dbUrl) {
    throw new Error("SUPABASE_DATABASE_URL must be set.");
  }
  
  queryClient = postgres(dbUrl, {
    max: 10,
    idle_timeout: 20,        // see comment above — survives Supabase pgbouncer's aggressive idle-kill
    connect_timeout: 30,
    max_lifetime: 60 * 30,
    prepare: false,
    ssl: 'require',
  });
  
  db = drizzle(queryClient, { schema });
  return db;
}

export { db };
