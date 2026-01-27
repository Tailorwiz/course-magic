import { defineConfig } from "drizzle-kit";

// Use Supabase if available, otherwise fall back to Replit database
const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("SUPABASE_DATABASE_URL or DATABASE_URL must be set");
}

export default defineConfig({
  schema: "./shared/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
    ssl: process.env.SUPABASE_DATABASE_URL ? "require" : undefined,
  },
});
