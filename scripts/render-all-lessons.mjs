// Bulk pre-render every lesson that doesn't yet have a rendered MP4.
// Runs sequentially against the local API so all the existing logic
// (timing extraction, bucket upload, flag flip, cache invalidation) reuses code.
//
// USAGE:
//   npx tsx scripts/render-all-lessons.mjs [--dry-run] [--max=N]
//
// Skips:
//   - lessons already with hasRenderedVideoInDb=true
//   - lessons without audio (nothing to render)
import postgres from 'postgres';
import 'dotenv/config';

const dryRun = process.argv.includes('--dry-run');
const maxArg = process.argv.find(a => a.startsWith('--max='));
const max = maxArg ? parseInt(maxArg.split('=')[1], 10) : Infinity;

const API_BASE = process.env.RENDER_API_BASE || 'http://localhost:3001';
const EMAIL = 'marcus@tailorwiz.com';
const PASSWORD = process.env.RENDER_PASSWORD || '5Mirt66@@';

console.log(`Render-all targeting ${API_BASE}, dryRun=${dryRun}, max=${max}`);

// Login
const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!loginRes.ok) { console.error('Login failed:', await loginRes.text()); process.exit(1); }
const { token } = await loginRes.json();
console.log('Logged in.');

// Find candidates via DB (faster than the API list)
const sql = postgres(process.env.SUPABASE_DATABASE_URL, { ssl: 'require', prepare: false });

// Pick lessons that haven't rendered yet AND have audio reachable somehow:
//   - directly under (course_id, lesson_id), OR
//   - under (sourceVideoId, sourceLessonId) — composite lessons created from a source video
const candidates = await sql`
  SELECT
    c.id AS course_id,
    c.data->>'title' AS course_title,
    l->>'id' AS lesson_id,
    l->>'title' AS lesson_title,
    l->>'sourceVideoId' AS source_video_id,
    l->>'sourceLessonId' AS source_lesson_id
  FROM courses c, jsonb_array_elements(c.data->'modules') m, jsonb_array_elements(m->'lessons') l
  WHERE NOT COALESCE((l->>'hasRenderedVideoInDb')::boolean, false)
    AND (
      EXISTS (SELECT 1 FROM lesson_audio a WHERE a.course_id = c.id AND a.lesson_id = l->>'id')
      OR EXISTS (
        SELECT 1 FROM lesson_audio a
        WHERE a.course_id::text = l->>'sourceVideoId'
          AND a.lesson_id = l->>'sourceLessonId'
      )
    )
`;
console.log(`Candidates needing render: ${candidates.length}`);

let done = 0, fail = 0, skipped = 0;
const startWall = Date.now();

for (const c of candidates) {
  if (done >= max) { console.log(`Hit max=${max}, stopping`); break; }

  const tag = `${c.course_id.slice(0, 8)}/${c.lesson_id.slice(0, 30)}`;
  console.log(`\n[${done + 1}/${Math.min(candidates.length, max)}] ${tag}  "${c.lesson_title || '?'}"`);

  if (dryRun) { console.log('  (dry-run) would render'); skipped++; continue; }

  const t0 = Date.now();
  try {
    // Long timeout — a 15-min lesson can take 2-3 min to render on a laptop.
    const ctrl = new AbortController();
    const killer = setTimeout(() => ctrl.abort(), 15 * 60 * 1000);
    const r = await fetch(`${API_BASE}/api/courses/${c.course_id}/lessons/${encodeURIComponent(c.lesson_id)}/render-mp4`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: ctrl.signal,
    });
    clearTimeout(killer);
    if (!r.ok) {
      const errBody = await r.text().catch(() => '');
      console.error(`  FAIL ${r.status}: ${errBody.slice(0, 300)}`);
      fail++;
      continue;
    }
    const data = await r.json();
    const elapsedSec = Math.round((Date.now() - t0) / 1000);
    console.log(`  OK in ${elapsedSec}s — ${data.mp4MB}MB ${data.imageCount} images, durSec=${Math.round(data.durationSec || 0)}, storedTo=${data.storedTo}`);
    done++;
  } catch (e) {
    console.error(`  EXCEPTION:`, e?.message || e);
    fail++;
  }
}

const totalSec = Math.round((Date.now() - startWall) / 1000);
console.log(`\nDONE. rendered=${done} failed=${fail} skipped=${skipped} in ${totalSec}s (${Math.round(totalSec/60)}m)`);
await sql.end();
