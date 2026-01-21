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
  max: 5,
  idle_timeout: 10,
  connect_timeout: 30,
  max_lifetime: 60 * 5,
  ssl: process.env.SUPABASE_DATABASE_URL ? 'require' : undefined,
});

let db = drizzle(queryClient, { schema });

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
    max: 5,
    idle_timeout: 10,
    connect_timeout: 30,
    max_lifetime: 60 * 5,
    ssl: 'require',
  });
  
  db = drizzle(queryClient, { schema });
  return db;
}

export { db };
