import postgres from 'postgres';
import 'dotenv/config';
const sql = postgres(process.env.SUPABASE_DATABASE_URL, { ssl: 'require', prepare: false });

const audio = await sql`SELECT COUNT(*) FILTER (WHERE bucket_path IS NOT NULL)::int AS migrated, COUNT(*)::int AS total FROM lesson_audio`;
const images = await sql`SELECT COUNT(*) FILTER (WHERE bucket_path IS NOT NULL)::int AS migrated, COUNT(*)::int AS total FROM lesson_images`;
const videos = await sql`SELECT COUNT(*) FILTER (WHERE bucket_path IS NOT NULL)::int AS migrated, COUNT(*)::int AS total FROM lesson_videos`;
console.log('audio: ', audio[0]);
console.log('images:', images[0]);
console.log('videos:', videos[0]);

const left = await sql`
  SELECT
    (SELECT COALESCE(SUM(length(audio_data)),0)::bigint FROM lesson_audio WHERE bucket_path IS NULL) AS audio_bytes,
    (SELECT COALESCE(SUM(length(image_data)),0)::bigint FROM lesson_images WHERE bucket_path IS NULL) AS image_bytes,
    (SELECT COALESCE(SUM(length(video_data)),0)::bigint FROM lesson_videos WHERE bucket_path IS NULL) AS video_bytes
`;
const r = left[0];
console.log(`Inline bytes still in DB:`);
console.log(`  audio:  ${(Number(r.audio_bytes) / 1024 / 1024).toFixed(2)} MB`);
console.log(`  images: ${(Number(r.image_bytes) / 1024 / 1024).toFixed(2)} MB`);
console.log(`  videos: ${(Number(r.video_bytes) / 1024 / 1024).toFixed(2)} MB`);

const overall = await sql`SELECT pg_size_pretty(pg_total_relation_size('courses')) AS courses, pg_size_pretty(pg_total_relation_size('lesson_audio')) AS audio, pg_size_pretty(pg_total_relation_size('lesson_images')) AS images, pg_size_pretty(pg_total_relation_size('lesson_videos')) AS videos`;
console.log('Table sizes (post-migration):', overall[0]);

await sql.end();
