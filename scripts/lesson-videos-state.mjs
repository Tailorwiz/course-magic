import postgres from 'postgres';
import 'dotenv/config';
const sql = postgres(process.env.SUPABASE_DATABASE_URL, { ssl: 'require', prepare: false });
const a = await sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE bucket_path IS NOT NULL)::int AS in_bucket FROM lesson_videos`;
console.log('lesson_videos rows:', a[0]);
await sql.end();
