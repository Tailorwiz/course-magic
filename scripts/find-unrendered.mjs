import postgres from 'postgres';
import 'dotenv/config';
const sql = postgres(process.env.SUPABASE_DATABASE_URL, { ssl: 'require', prepare: false });

const lessons = await sql`
  SELECT
    c.id AS course_id,
    c.data->>'title' AS course_title,
    l->>'id' AS lesson_id,
    l->>'title' AS lesson_title,
    l->>'sourceVideoId' AS source_video_id,
    l->>'sourceLessonId' AS source_lesson_id,
    EXISTS(SELECT 1 FROM lesson_audio a WHERE a.course_id = c.id AND a.lesson_id = l->>'id') AS has_audio,
    EXISTS(SELECT 1 FROM lesson_audio a WHERE a.course_id::text = l->>'sourceVideoId' AND a.lesson_id = l->>'sourceLessonId') AS has_source_audio,
    EXISTS(SELECT 1 FROM lesson_images i WHERE i.course_id = c.id AND i.lesson_id = l->>'id') AS has_images,
    EXISTS(SELECT 1 FROM lesson_images i WHERE i.course_id::text = l->>'sourceVideoId' AND i.lesson_id = l->>'sourceLessonId') AS has_source_images
  FROM courses c, jsonb_array_elements(c.data->'modules') m, jsonb_array_elements(m->'lessons') l
  WHERE NOT COALESCE((l->>'hasRenderedVideoInDb')::boolean, false)
`;
console.log(`Unrendered lessons: ${lessons.length}`);
for (const l of lessons) {
  console.log(`  course=${l.course_id.slice(0,8)} lesson=${l.lesson_id.slice(0,40)}`);
  console.log(`    title: "${(l.lesson_title || '').slice(0, 60)}"`);
  console.log(`    own_audio=${l.has_audio} src_audio=${l.has_source_audio}  own_images=${l.has_images} src_images=${l.has_source_images}`);
  console.log(`    sourceVideoId=${l.source_video_id || 'none'} sourceLessonId=${l.source_lesson_id || 'none'}`);
}
await sql.end();
