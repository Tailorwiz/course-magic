import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import 'dotenv/config';

const sql = postgres(process.env.SUPABASE_DATABASE_URL, { ssl: 'require', prepare: false });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const [r] = await sql`
  SELECT course_id, lesson_id, mime_type, length(audio_data) AS data_len, bucket_path, updated_at
  FROM lesson_audio
  WHERE bucket_path IS NOT NULL
  ORDER BY updated_at DESC LIMIT 1
`;
console.log('Migrated row:', r);

if (!r?.bucket_path) {
  console.log('No migrated row found.');
  process.exit(0);
}

const { data: pub } = supabase.storage.from('lesson-media').getPublicUrl(r.bucket_path);
console.log('Public URL:', pub.publicUrl);

const t0 = Date.now();
const res = await fetch(pub.publicUrl, { method: 'HEAD' });
console.log(`HEAD: status=${res.status}, content-type=${res.headers.get('content-type')}, length=${res.headers.get('content-length')}, took=${Date.now() - t0}ms`);

const t1 = Date.now();
const fetched = await fetch(pub.publicUrl);
const body = await fetched.arrayBuffer();
console.log(`GET full body: ${(body.byteLength / 1024 / 1024).toFixed(2)}MB in ${Date.now() - t1}ms`);

await sql.end();
