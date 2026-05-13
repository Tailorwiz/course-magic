import postgres from 'postgres';
import 'dotenv/config';
const sql = postgres(process.env.SUPABASE_DATABASE_URL, { ssl: 'require', prepare: false });

const summary = await sql`
  SELECT
    (SELECT COUNT(*) FROM courses) AS courses,
    (SELECT COUNT(*) FROM (SELECT 1 FROM courses, jsonb_array_elements(data->'modules') m, jsonb_array_elements(m->'lessons') l) x) AS lessons_total,
    (SELECT COUNT(*) FROM lesson_audio) AS audio_rows,
    (SELECT COUNT(*) FROM lesson_audio WHERE bucket_path IS NOT NULL) AS audio_in_bucket,
    (SELECT COUNT(*) FROM lesson_images) AS images_rows,
    (SELECT COUNT(*) FROM lesson_images WHERE bucket_path IS NOT NULL) AS images_in_bucket,
    (SELECT COUNT(*) FROM lesson_videos) AS videos_rows,
    (SELECT COUNT(*) FROM lesson_videos WHERE bucket_path IS NOT NULL) AS videos_in_bucket
`;
console.log('--- Inventory ---');
console.table([summary[0]]);

// Render coverage
const renderState = await sql`
  WITH lessons AS (
    SELECT
      c.id AS course_id,
      l->>'id' AS lesson_id,
      COALESCE((l->>'hasRenderedVideoInDb')::boolean, false) AS rendered
    FROM courses c, jsonb_array_elements(c.data->'modules') m, jsonb_array_elements(m->'lessons') l
  )
  SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE rendered) AS rendered,
    ROUND(100.0 * COUNT(*) FILTER (WHERE rendered) / NULLIF(COUNT(*), 0), 1) AS pct
  FROM lessons
`;
console.log('\n--- MP4 render coverage ---');
console.table([renderState[0]]);

// Audio sizes
const audioSize = await sql`
  SELECT
    COUNT(*) AS rows,
    pg_size_pretty(SUM(octet_length(audio_data))) AS inline_total,
    pg_size_pretty(AVG(octet_length(audio_data))::bigint) AS avg_inline
  FROM lesson_audio WHERE bucket_path IS NULL AND length(audio_data) > 0
`;
console.log('\n--- Audio still inline (not migrated) ---');
console.table([audioSize[0]]);

await sql.end();
