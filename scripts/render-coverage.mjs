import postgres from 'postgres';
import 'dotenv/config';
const sql = postgres(process.env.SUPABASE_DATABASE_URL, { ssl: 'require', prepare: false });

const lessons = await sql`
  SELECT
    c.id AS course_id,
    c.data->>'title' AS course_title,
    l->>'id' AS lesson_id,
    l->>'title' AS lesson_title,
    COALESCE((l->>'hasRenderedVideoInDb')::boolean, false) AS rendered,
    EXISTS(SELECT 1 FROM lesson_audio a WHERE a.course_id = c.id AND a.lesson_id = l->>'id') AS has_audio,
    EXISTS(SELECT 1 FROM lesson_images i WHERE i.course_id = c.id AND i.lesson_id = l->>'id') AS has_images,
    EXISTS(SELECT 1 FROM lesson_videos v WHERE v.course_id = c.id AND v.lesson_id = l->>'id') AS has_video_row
  FROM courses c, jsonb_array_elements(c.data->'modules') m, jsonb_array_elements(m->'lessons') l
`;

const total = lessons.length;
const rendered = lessons.filter(l => l.rendered).length;
const noAudio = lessons.filter(l => !l.has_audio).length;
const noImages = lessons.filter(l => !l.has_images).length;
const hasAudioNotRendered = lessons.filter(l => l.has_audio && !l.rendered);

console.log(`Total lessons: ${total}`);
console.log(`  Rendered (hasRenderedVideoInDb): ${rendered}`);
console.log(`  No audio in lesson_audio: ${noAudio}`);
console.log(`  No images in lesson_images: ${noImages}`);
console.log();
console.log(`Lessons with audio but NOT rendered (these should have been picked up):`);
for (const l of hasAudioNotRendered) {
  const tag = `${l.course_id.slice(0,8)}/${l.lesson_id.slice(0,40)}`;
  console.log(`  ${tag}  has_audio=${l.has_audio}  has_images=${l.has_images}  has_video_row=${l.has_video_row}  "${(l.lesson_title || '').slice(0,40)}"`);
}

await sql.end();
