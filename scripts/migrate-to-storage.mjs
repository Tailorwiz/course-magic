// P1.1: Move base64 audio/image/video out of Postgres into the lesson-media bucket.
//
// USAGE:
//   npx tsx scripts/migrate-to-storage.mjs                         # migrate ALL pending rows
//   npx tsx scripts/migrate-to-storage.mjs audio <courseId> <lessonId>
//   npx tsx scripts/migrate-to-storage.mjs --smoke                 # migrate just one audio row for testing
//
// Idempotent: rows already migrated (bucketPath is set + non-null data length) are skipped.
// After successful upload, sets bucket_path and clears the inline data so the row shrinks.
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const BUCKET = 'lesson-media';
const MAX_FILE_BYTES = 50 * 1024 * 1024; // free-tier limit

const sql = postgres(process.env.SUPABASE_DATABASE_URL, { ssl: 'require', prepare: false, max: 5 });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const args = process.argv.slice(2);
const smoke = args.includes('--smoke');
const onlyKind = args[0] && !args[0].startsWith('--') ? args[0] : null; // 'audio' | 'images' | 'videos'
const onlyCourseId = args[1] || null;
const onlyLessonId = args[2] || null;

function extOf(mime, fallback) {
  if (!mime) return fallback;
  const m = mime.toLowerCase();
  if (m.includes('mpeg')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('webm')) return 'webm';
  if (m.includes('jpeg')) return 'jpg';
  if (m.includes('png')) return 'png';
  return fallback;
}

function detectImageMime(buf) {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf.length >= 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return 'image/png';
}

async function uploadOne(path, buffer, contentType) {
  if (buffer.length > MAX_FILE_BYTES) {
    return { skipped: true, reason: `file ${(buffer.length / 1024 / 1024).toFixed(1)}MB exceeds 50MB free-tier limit` };
  }
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType, upsert: true, cacheControl: '86400',
  });
  if (error) return { error };
  return { ok: true };
}

async function migrateAudio(rowFilter) {
  const rows = rowFilter
    ? await sql`SELECT id, course_id, lesson_id, mime_type, audio_data, bucket_path FROM lesson_audio WHERE course_id = ${rowFilter.courseId} AND lesson_id = ${rowFilter.lessonId}`
    : await sql`SELECT id, course_id, lesson_id, mime_type, audio_data, bucket_path FROM lesson_audio WHERE bucket_path IS NULL AND audio_data IS NOT NULL AND length(audio_data) > 0 ORDER BY length(audio_data) ASC`;
  console.log(`[audio] ${rows.length} candidates`);
  let ok = 0, skipped = 0, failed = 0;
  for (const r of rows) {
    const ext = extOf(r.mime_type, 'mp3');
    const path = `${r.course_id}/${r.lesson_id}/audio.${ext}`;
    const buf = Buffer.from(r.audio_data, 'base64');
    const contentType = r.mime_type || 'audio/mpeg';
    process.stdout.write(`  ${r.course_id.slice(0, 8)}/${r.lesson_id.slice(0, 30)} ${(buf.length / 1024 / 1024).toFixed(2)}MB → `);
    const res = await uploadOne(path, buf, contentType);
    if (res.skipped) { console.log('SKIP', res.reason); skipped++; continue; }
    if (res.error) { console.log('FAIL', res.error.message); failed++; continue; }
    await sql`UPDATE lesson_audio SET bucket_path = ${path}, audio_data = '', updated_at = NOW() WHERE id = ${r.id}`;
    console.log('OK');
    ok++;
  }
  console.log(`[audio] done: ok=${ok} skip=${skipped} fail=${failed}`);
  return { ok, skipped, failed };
}

async function migrateImages(rowFilter) {
  const rows = rowFilter
    ? await sql`SELECT id, course_id, lesson_id, visual_index, image_data, bucket_path FROM lesson_images WHERE course_id = ${rowFilter.courseId} AND lesson_id = ${rowFilter.lessonId}`
    : await sql`SELECT id, course_id, lesson_id, visual_index, image_data, bucket_path FROM lesson_images WHERE bucket_path IS NULL AND image_data IS NOT NULL AND length(image_data) > 0 ORDER BY length(image_data) ASC LIMIT 1000`;
  console.log(`[images] ${rows.length} candidates`);
  let ok = 0, skipped = 0, failed = 0;
  for (const r of rows) {
    let raw = r.image_data;
    if (raw.startsWith('data:')) {
      const m = /^data:([^;]+);base64,(.+)$/.exec(raw);
      if (m) raw = m[2];
    }
    const buf = Buffer.from(raw, 'base64');
    const mime = detectImageMime(buf);
    const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
    const path = `${r.course_id}/${r.lesson_id}/images/${r.visual_index}.${ext}`;
    const res = await uploadOne(path, buf, mime);
    if (res.skipped) { skipped++; continue; }
    if (res.error) { console.log(`  FAIL ${path}: ${res.error.message}`); failed++; continue; }
    await sql`UPDATE lesson_images SET bucket_path = ${path}, image_data = '' WHERE id = ${r.id}`;
    ok++;
  }
  console.log(`[images] done: ok=${ok} skip=${skipped} fail=${failed}`);
  return { ok, skipped, failed };
}

async function migrateVideos(rowFilter) {
  const rows = rowFilter
    ? await sql`SELECT id, course_id, lesson_id, mime_type, video_data, bucket_path FROM lesson_videos WHERE course_id = ${rowFilter.courseId} AND lesson_id = ${rowFilter.lessonId}`
    : await sql`SELECT id, course_id, lesson_id, mime_type, video_data, bucket_path FROM lesson_videos WHERE bucket_path IS NULL AND video_data IS NOT NULL AND length(video_data) > 0`;
  console.log(`[videos] ${rows.length} candidates`);
  let ok = 0, skipped = 0, failed = 0;
  for (const r of rows) {
    const ext = extOf(r.mime_type, 'webm');
    const path = `${r.course_id}/${r.lesson_id}/video.${ext}`;
    const buf = Buffer.from(r.video_data, 'base64');
    process.stdout.write(`  ${r.course_id.slice(0, 8)}/${r.lesson_id.slice(0, 30)} ${(buf.length / 1024 / 1024).toFixed(2)}MB → `);
    const res = await uploadOne(path, buf, r.mime_type || 'video/webm');
    if (res.skipped) { console.log('SKIP', res.reason); skipped++; continue; }
    if (res.error) { console.log('FAIL', res.error.message); failed++; continue; }
    await sql`UPDATE lesson_videos SET bucket_path = ${path}, video_data = '', updated_at = NOW() WHERE id = ${r.id}`;
    console.log('OK');
    ok++;
  }
  console.log(`[videos] done: ok=${ok} skip=${skipped} fail=${failed}`);
  return { ok, skipped, failed };
}

if (smoke) {
  // Smoke: pick the smallest unmigrated audio row and migrate just that.
  const [r] = await sql`SELECT course_id, lesson_id FROM lesson_audio WHERE bucket_path IS NULL AND audio_data IS NOT NULL AND length(audio_data) > 0 ORDER BY length(audio_data) ASC LIMIT 1`;
  if (!r) { console.log('No audio to smoke-migrate'); }
  else { await migrateAudio({ courseId: r.course_id, lessonId: r.lesson_id }); }
} else if (onlyKind) {
  const filter = (onlyCourseId && onlyLessonId) ? { courseId: onlyCourseId, lessonId: onlyLessonId } : null;
  if (onlyKind === 'audio') await migrateAudio(filter);
  else if (onlyKind === 'images') await migrateImages(filter);
  else if (onlyKind === 'videos') await migrateVideos(filter);
  else console.error('Unknown kind:', onlyKind);
} else {
  await migrateAudio();
  await migrateImages();
  await migrateVideos();
}

await sql.end();
