// Sets hasRenderedVideoInDb=true on courses.data lessons that have a corresponding row in lesson_videos.
import postgres from 'postgres';
import 'dotenv/config';
const sql = postgres(process.env.SUPABASE_DATABASE_URL, { ssl: 'require', prepare: false });

const videos = await sql`SELECT course_id, lesson_id FROM lesson_videos`;
console.log(`lesson_videos rows: ${videos.length}`);
const targetSet = new Set(videos.map(v => `${v.course_id}|${v.lesson_id}`));

const courses = await sql`SELECT id, data FROM courses`;
let touched = 0;
for (const c of courses) {
  const data = c.data;
  if (!data?.modules) continue;
  let dirty = false;
  for (const m of data.modules) {
    for (const l of (m.lessons || [])) {
      if (!l?.id) continue;
      const key = `${c.id}|${l.id}`;
      if (targetSet.has(key) && !l.hasRenderedVideoInDb) {
        l.hasRenderedVideoInDb = true;
        if (l.renderedVideoUrl?.startsWith('data:')) l.renderedVideoUrl = '';
        dirty = true;
      }
    }
  }
  if (dirty) {
    await sql`UPDATE courses SET data = ${data}, updated_at = NOW() WHERE id = ${c.id}`;
    console.log(`  updated ${c.id}`);
    touched++;
  }
}
console.log(`Done. Updated ${touched} courses.`);
await sql.end();
