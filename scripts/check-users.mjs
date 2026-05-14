// Quick diagnostic: list admin/creator users so we know what to log in with.
import 'dotenv/config';
import postgres from 'postgres';

const url = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error('No DATABASE_URL'); process.exit(1); }

const sql = postgres(url, { prepare: false, ssl: 'require' });
try {
  const rows = await sql`
    SELECT id, email, role, name, created_at
    FROM users
    ORDER BY
      CASE role WHEN 'ADMIN' THEN 0 WHEN 'CREATOR' THEN 1 ELSE 2 END,
      created_at ASC
    LIMIT 20
  `;
  console.log(`Found ${rows.length} users:\n`);
  for (const u of rows) {
    console.log(`  ${u.role.padEnd(8)}  ${u.email.padEnd(45)}  ${u.name || '(no name)'}`);
  }
} catch (e) {
  console.error('Query failed:', e.message);
  process.exit(2);
} finally {
  await sql.end();
}
