// One-shot: verify the service_role key works AND create the bucket if missing.
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(url, key);

const BUCKET = 'lesson-media';

console.log('Listing existing buckets...');
const { data: buckets, error: lerr } = await supabase.storage.listBuckets();
if (lerr) {
  console.error('listBuckets error:', lerr);
  process.exit(2);
}
console.log('Existing buckets:', buckets.map(b => `${b.name} (public=${b.public})`));

const exists = buckets.some(b => b.name === BUCKET);
if (!exists) {
  console.log(`Creating bucket "${BUCKET}" (public)...`);
  const { error: cerr } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 50 * 1024 * 1024, // 50MB — Supabase free-tier per-file limit
  });
  if (cerr) {
    console.error('createBucket error:', cerr);
    process.exit(3);
  }
  console.log('Bucket created.');
} else {
  console.log(`Bucket "${BUCKET}" already exists.`);
}

// Smoke: upload a tiny test file, fetch its public URL, then delete it
console.log('Smoke: uploading small test object...');
const testPath = `_smoke/${Date.now()}.txt`;
const { error: uerr } = await supabase.storage.from(BUCKET).upload(testPath, new Blob(['hello-from-cm'], { type: 'text/plain' }), { upsert: true });
if (uerr) { console.error('upload error:', uerr); process.exit(4); }
const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(testPath);
console.log('Public URL:', pub.publicUrl);

const fetched = await fetch(pub.publicUrl);
console.log(`Fetched status=${fetched.status}, body="${await fetched.text()}"`);

await supabase.storage.from(BUCKET).remove([testPath]);
console.log('Smoke object removed.');
console.log('OK');
