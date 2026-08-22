/**
 * scripts/full-test.mjs — full endpoint smoke test against the LOCAL server.
 *
 * Creates a temporary CREATOR user directly in the DB (deleted at the end),
 * signs its JWT with the real JWT_SECRET, then exercises every important
 * endpoint the UI uses. Prints PASS/FAIL per endpoint. Temporary — delete
 * after use.
 */
import 'dotenv/config';
import postgres from 'postgres';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const BASE = 'http://localhost:3001';
const sql = postgres(process.env.SUPABASE_DATABASE_URL, { max: 2, prepare: false, ssl: 'require' });

const results = [];
const record = (name, ok, note = '') => {
  results.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`);
};

const hit = async (name, path, opts = {}, check = (r, d) => r.ok) => {
  try {
    const started = Date.now();
    const r = await fetch(`${BASE}${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    });
    let data = null;
    try { data = await r.json(); } catch { /* non-json */ }
    const ok = check(r, data);
    record(name, ok, `${r.status} in ${Date.now() - started}ms${ok ? '' : ' :: ' + JSON.stringify(data).slice(0, 160)}`);
    return data;
  } catch (e) {
    record(name, false, String(e?.message || e).slice(0, 120));
    return null;
  }
};

// ---- 1. Create temp CREATOR user + token --------------------------------
const email = `claude-test-${Date.now()}@internal.test`;
const hash = bcrypt.hashSync('claude-test-pass-1', 10);
const [user] = await sql`
  insert into users (name, email, password, role, assigned_course_ids)
  values ('Claude Test Admin', ${email}, ${hash}, 'CREATOR', '[]'::jsonb)
  returning id, email, role`;
console.log(`temp user: ${user.id}`);
const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

try {
  // ---- 2. Auth ----------------------------------------------------------
  await hit('auth/me', '/api/auth/me');
  await hit('auth/login (real creds)', '/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password: 'claude-test-pass-1' }),
  }, (r, d) => r.ok && !!d?.token);

  // ---- 3. Core data -----------------------------------------------------
  const courses = await hit('courses list', '/api/courses', {}, (r, d) => r.ok && Array.isArray(d));
  await hit('users list (students)', '/api/users', {}, (r, d) => r.ok && Array.isArray(d));
  await hit('progress', '/api/progress');
  await hit('certificates', '/api/certificates', {}, (r, d) => r.ok && Array.isArray(d));
  await hit('tickets', '/api/tickets', {}, (r, d) => r.ok && Array.isArray(d));
  if (Array.isArray(courses) && courses.length > 0) {
    await hit('single course', `/api/courses/${courses[0].id}`);
  }

  // ---- 4. AI text endpoints (Claude) ------------------------------------
  await hit('ai/generate-text', '/api/ai/generate-text', {
    method: 'POST', body: JSON.stringify({ prompt: 'Say "ok" and nothing else.', maxTokens: 300 }),
  }, (r, d) => r.ok && !!d?.text);

  await hit('ai/generate-text jsonMode', '/api/ai/generate-text', {
    method: 'POST', body: JSON.stringify({ prompt: 'Return {"status":"ok"}', jsonMode: true, maxTokens: 300 }),
  }, (r, d) => { try { return r.ok && JSON.parse(d.text).status === 'ok'; } catch { return false; } });

  await hit('ai/generate-script (stage 1)', '/api/ai/generate-script', {
    method: 'POST', body: JSON.stringify({ sourceText: 'JobIntel 360 is a job intelligence platform that finds hiring managers, salary data, and interview insights for any job posting, helping job seekers land interviews faster.', brandName: 'JobIntel 360', targetMinutes: 1 }),
  }, (r, d) => r.ok && (d?.script || '').length > 100);

  const scenesResp = await hit('ai/generate-scenes (stage 2)', '/api/ai/generate-scenes', {
    method: 'POST', body: JSON.stringify({ script: 'Tired of applying to jobs and hearing nothing back? JobIntel 360 changes that. It finds the real hiring manager, the true salary range, and the interview questions for any job you want. Stop guessing. Start knowing. Visit jobintel360.com today.' }),
  }, (r, d) => r.ok && Array.isArray(d?.scenes) && d.scenes.length > 0);
  if (scenesResp?.scenes) console.log(`        scenes: ${scenesResp.scenes.map((s) => s.type).join(', ')}`);

  await hit('ai/generate-takeaways', '/api/ai/generate-takeaways', {
    method: 'POST', body: JSON.stringify({ script: 'In this lesson we cover three job search strategies. First, target the hiring manager directly instead of the apply button. Second, tailor every resume to the job description. Third, follow up within forty-eight hours of applying. These three moves triple your interview rate.', title: 'Job Search Basics' }),
  }, (r, d) => r.ok && Array.isArray(d?.keyTakeaways) && d.keyTakeaways.length > 0);

  await hit('ai/parse-resume', '/api/ai/parse-resume', {
    method: 'POST', body: JSON.stringify({ resumeText: 'Jane Smith\njane.smith@example.com\n(555) 123-4567\nHouston, TX\nSenior Project Manager with 10 years experience.' }),
  }, (r, d) => r.ok && d?.firstName === 'Jane' && !!d?.generatedPassword);

  await hit('ai/support-chat (student-facing)', '/api/ai/support-chat', {
    method: 'POST', body: JSON.stringify({ message: 'How do I reset my password?' }),
  }, (r, d) => r.ok && (d?.text || '').length > 10);

  await hit('ai/generate-metadata (generate mode)', '/api/ai/generate-metadata', {
    method: 'POST', body: JSON.stringify({ target: 'all', mode: 'generate', context: 'Executive job search masterclass' }),
  }, (r, d) => r.ok && !!d?.title);

  // ---- 5. Storyboard (the fix Marcus reported) --------------------------
  const sb = await hit('STORYBOARD (24k tokens)', '/api/ai/generate-text', {
    method: 'POST',
    body: JSON.stringify({
      prompt: `Break script into distinct visual scenes (approx 1 per 12-15s). For each scene provide segmentText, visualPrompt, visualType, overlayText. RETURN JSON: { "scenes": [ { "segmentText": "...", "visualPrompt": "...", "visualType": "...", "overlayText": "..." } ] } Script: Welcome to Section 1 of the Executive Job Search Masterclass. In this lesson you will learn the three biggest mistakes senior professionals make. Mistake one: relying on the apply button — eighty seven percent of executive roles are filled through relationships. Mistake two: using one generic resume — hiring managers spend seven seconds scanning. Mistake three: skipping the follow-up — sixty percent of candidates never follow up. In Section 2 we cover the LinkedIn Strategy where seventy three percent of recruiters find candidates. Let's get started.`,
      jsonMode: true, maxTokens: 24000,
    }),
  }, (r, d) => { try { const p = JSON.parse(d.text); const sc = Array.isArray(p) ? p : p.scenes; return r.ok && Array.isArray(sc) && sc.length >= 3; } catch { return false; } });
  if (sb?.text) { try { const p = JSON.parse(sb.text); console.log(`        storyboard scenes: ${(p.scenes || p).length}`); } catch {} }

  // ---- 6. AI image (GPT Image 2) ----------------------------------------
  await hit('ai/generate-image (gpt-image-2)', '/api/ai/generate-image', {
    method: 'POST', body: JSON.stringify({ prompt: 'A simple flat blue circle icon on white', aspectRatio: '16:9' }),
  }, (r, d) => r.ok && (d?.imageData || '').length > 1000);

  // ---- 7. TTS -----------------------------------------------------------
  await hit('tts/gemini (voice preview)', '/api/tts/gemini', {
    method: 'POST', body: JSON.stringify({ text: 'Hello, this is a test.', voiceId: 'Fenrir (Deep Male)' }),
  }, (r, d) => r.ok && (d?.audioData || '').length > 1000);

  // ---- 8. Motion helpers -------------------------------------------------
  await hit('motion/find-image', '/api/motion/find-image', {
    method: 'POST', body: JSON.stringify({ query: 'office teamwork', count: 3 }),
  }, (r, d) => r.ok && Array.isArray(d?.images) && d.images.length > 0);
  await hit('motion/find-music', '/api/motion/find-music', {
    method: 'POST', body: JSON.stringify({ query: 'upbeat corporate', count: 3 }),
  }, (r, d) => r.ok && Array.isArray(d?.tracks) && d.tracks.length > 0);
  await hit('ai/extract-url (Jina crawl)', '/api/ai/extract-url', {
    method: 'POST', body: JSON.stringify({ url: 'https://jobintel360.com' }),
  }, (r, d) => r.ok && (d?.text || '').length > 500);

  // ---- 9. Security spot-checks ------------------------------------------
  const noAuth = await fetch(`${BASE}/api/users`);
  record('security: /api/users unauth -> 401', noAuth.status === 401, `got ${noAuth.status}`);
  const studentToken = jwt.sign({ userId: user.id, email: user.email, role: 'STUDENT' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const asStudent = await fetch(`${BASE}/api/users`, { headers: { Authorization: `Bearer ${studentToken}` } });
  record('security: /api/users as STUDENT -> 403', asStudent.status === 403, `got ${asStudent.status}`);

} finally {
  await sql`delete from users where id = ${user.id}`;
  console.log('temp user deleted');
  await sql.end();
}

const fails = results.filter((r) => !r.ok);
console.log(`\n===== ${results.length - fails.length}/${results.length} PASSED =====`);
if (fails.length) { console.log('FAILURES:'); for (const f of fails) console.log(`  - ${f.name}: ${f.note}`); process.exit(1); }
