// One-shot migration: move large inline base64 renderedVideoUrl from courses jsonb
// into the lesson_videos table (P0.4). Idempotent — only touches rows still inline.
import postgres from 'postgres';
import 'dotenv/config';

const sql = postgres(process.env.SUPABASE_DATABASE_URL, { ssl: 'require', max: 1, idle_timeout: 600 });

console.log('Starting renderedVideoUrl migration...');
const start = Date.now();

const all = await sql`SELECT id, data FROM courses`;
console.log(`Loaded ${all.length} courses in ${Date.now() - start}ms`);

let migrated = 0;
let skipped = 0;
for (const row of all) {
  const data = row.data;
  if (!data?.modules) continue;

  let touched = false;
  for (const mod of data.modules) {
    for (const lesson of (mod.lessons || [])) {
      const rv = lesson.renderedVideoUrl;
      if (rv && typeof rv === 'string' && rv.startsWith('data:') && rv.length > 1_000_000) {
        const sizeMB = (rv.length / 1024 / 1024).toFixed(2);
        const m = /^data:([^;]+);base64,(.+)$/.exec(rv);
        if (!m) { skipped++; console.log(`  SKIP malformed: ${lesson.id}`); continue; }
        const [, mimeType, base64] = m;
        console.log(`Migrating ${row.id.slice(0, 8)}.. lesson=${lesson.id} ${sizeMB}MB ${mimeType}`);

        const t1 = Date.now();
        const existing = await sql`SELECT id FROM lesson_videos WHERE course_id = ${row.id} AND lesson_id = ${lesson.id}`;
        if (existing.length) {
          await sql`UPDATE lesson_videos SET video_data = ${base64}, mime_type = ${mimeType}, updated_at = NOW() WHERE id = ${existing[0].id}`;
        } else {
          await sql`INSERT INTO lesson_videos (course_id, lesson_id, video_data, mime_type) VALUES (${row.id}, ${lesson.id}, ${base64}, ${mimeType})`;
        }
        console.log(`  saved to lesson_videos in ${Date.now() - t1}ms`);

        lesson.renderedVideoUrl = '';
        lesson.hasRenderedVideoInDb = true;
        touched = true;
        migrated++;
      }
    }
  }

  if (touched) {
    const t2 = Date.now();
    await sql`UPDATE courses SET data = ${data}, updated_at = NOW() WHERE id = ${row.id}`;
    console.log(`  course updated in ${Date.now() - t2}ms`);
  }
}

console.log(`\nDone. migrated=${migrated} skipped=${skipped} in ${Date.now() - start}ms`);
await sql.end();
console.log('DONE');
