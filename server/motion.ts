/**
 * server/motion.ts — orchestration for the Remotion motion-video pipeline.
 *
 * Phase 2 (Lambda): rendering runs on AWS Lambda via @remotion/lambda, NOT on
 * the Railway box. The flow:
 *   1. synthesizeSpeech(): TTS each scene's narration via ElevenLabs.
 *   2. Derive each scene's duration from the audio; upload narration MP3s to
 *      Supabase so Lambda can fetch them.
 *   3. renderMediaOnLambda(): kick off a distributed render on AWS Lambda.
 *   4. Poll getRenderProgress() until done; the output MP4 lives on S3.
 *
 * An in-memory job map lets the client poll status. Because the heavy render
 * happens on Lambda, the Express server stays responsive.
 */
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import {
  renderMediaOnLambda,
  getRenderProgress,
  getFunctions,
} from '@remotion/lambda/client';

const FPS = 30;
const TAIL_PAD_SEC = 0.6; // silence held after the last spoken word
const MIN_SCENE_SEC = 1.6; // floor for scenes with no narration
const STORAGE_BUCKET = 'lesson-media';

// ----- Lambda config --------------------------------------------------------

const LAMBDA_REGION = (process.env.REMOTION_LAMBDA_REGION || 'us-east-1') as any;
const LAMBDA_SERVE_URL =
  process.env.REMOTION_LAMBDA_SERVE_URL ||
  'https://remotionlambda-useast1-tqeao6b3l3.s3.us-east-1.amazonaws.com/sites/motion/index.html';
const LAMBDA_COMPOSITION = 'MotionVideoDynamic';
// A fresh AWS account caps Lambda concurrency at ~10. We size each render so it
// fans out across at most MAX_PARALLEL_LAMBDAS functions (framesPerLambda is
// computed per-render below). Raising the AWS "Concurrent executions" quota
// just makes renders faster afterwards — nothing here breaks.
const MIN_FRAMES_PER_LAMBDA = 300;
const MAX_PARALLEL_LAMBDAS = 8;

let cachedFunctionName: string | null = process.env.REMOTION_LAMBDA_FUNCTION || null;

/** Find the deployed Remotion render function (cached after first lookup). */
async function resolveFunctionName(): Promise<string> {
  if (cachedFunctionName) return cachedFunctionName;
  const functions = await getFunctions({ region: LAMBDA_REGION, compatibleOnly: true });
  if (functions.length === 0) {
    throw new Error('No compatible Remotion Lambda function deployed');
  }
  cachedFunctionName = functions[0].functionName;
  return cachedFunctionName;
}

// ----- Supabase storage (narration MP3 uploads) -----------------------------

let supabase: ReturnType<typeof createClient> | null = null;
function getStorage() {
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase storage not configured');
  supabase = createClient(url, key);
  return supabase;
}

function bucketPublicUrl(bucketPath: string): string {
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${bucketPath}`;
}

async function uploadToBucket(
  bucketPath: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const { error } = await getStorage()
    .storage.from(STORAGE_BUCKET)
    .upload(bucketPath, body, { contentType, upsert: true, cacheControl: '86400' });
  if (error) throw new Error(`Supabase upload failed: ${error.message}`);
  return bucketPublicUrl(bucketPath);
}

// ----- Kokoro TTS (self-hosted, free, no datacenter-IP blocking) ------------
// Mirrors the audiobook-studio app: a Python worker (server/tts_worker.py)
// runs the open-source Kokoro ONNX model locally. No API, no per-use cost,
// and — unlike ElevenLabs' free tier — it works from a cloud server.

export const DEFAULT_TTS_VOICE = 'af_heart';

interface KokoroSegment {
  id: string;
  text: string;
}
interface KokoroResult {
  id: string;
  wavPath: string | null;
  durationSec: number;
}

/**
 * Synthesize every scene's narration in ONE Kokoro worker invocation.
 * The Kokoro model takes ~13s to load, so batching all scenes into a single
 * Python process pays that cost only once per render.
 */
function synthesizeKokoroBatch(
  segments: KokoroSegment[],
  voice: string,
  speed: number,
  outDir: string,
): Promise<KokoroResult[]> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(outDir, { recursive: true });
    const inputPath = path.join(outDir, 'tts-input.json');
    fs.writeFileSync(inputPath, JSON.stringify({ voice, speed, outDir, segments }));

    const workerPath = path.resolve(process.cwd(), 'server/tts_worker.py');
    const pythonBin = process.env.PYTHON_BIN || 'python3';
    const child = spawn(pythonBin, [workerPath, inputPath], { env: process.env });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      // The worker prints one JSON object per line; the final `done` line
      // carries the per-segment results.
      let doneMsg: any = null;
      let errMsg: string | null = null;
      for (const line of stdout.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('{')) continue;
        try {
          const m = JSON.parse(t);
          if (m.done) doneMsg = m;
          if (m.error) errMsg = m.error;
        } catch {
          /* ignore non-JSON */
        }
      }
      if (code !== 0 || !doneMsg) {
        return reject(
          new Error(errMsg || stderr.slice(-400) || `Kokoro TTS worker exited ${code}`),
        );
      }
      resolve(
        (doneMsg.results || []).map((r: any) => ({
          id: String(r.id),
          wavPath: r.output || null,
          durationSec: r.duration || 0,
        })),
      );
    });
  });
}

// ----- Render jobs ----------------------------------------------------------

export type MotionJobStatus = 'queued' | 'tts' | 'rendering' | 'done' | 'error';

export interface MotionJob {
  id: string;
  status: MotionJobStatus;
  progress: number; // 0..1 during the render stage
  stage?: string;
  videoUrl?: string;
  durationSec?: number;
  error?: string;
  createdAt: number;
}

const jobs = new Map<string, MotionJob>();
let activeRenders = 0;

export function getMotionJob(id: string): MotionJob | undefined {
  return jobs.get(id);
}

export interface MotionRenderRequest {
  userId: string;
  scenes: any[];
  brand: Record<string, unknown>;
  voiceId: string;
  music?: { url?: string; mode?: 'continuous' | 'introOutro' | 'none' };
  voiceOpts?: { stability?: number; similarityBoost?: number; speed?: number };
}

/** True when a render is already running (we cap to one at a time). */
export function isRenderBusy(): boolean {
  return activeRenders >= 1;
}

/** Kick off a render. Returns a jobId immediately; work runs in the background. */
export function enqueueMotionRender(reqData: MotionRenderRequest): string {
  const id = randomUUID();
  jobs.set(id, { id, status: 'queued', progress: 0, createdAt: Date.now() });
  runRender(id, reqData).catch((err) => {
    const job = jobs.get(id);
    if (job) {
      job.status = 'error';
      job.error = String(err?.message || err).slice(0, 500);
    }
  });
  return id;
}

async function runRender(id: string, reqData: MotionRenderRequest): Promise<void> {
  const job = jobs.get(id)!;
  activeRenders++;
  const ttsDir = path.join(os.tmpdir(), 'motion-tts', id);
  try {
    // 1. Per-scene TTS via Kokoro — one batched worker call for the whole video.
    job.status = 'tts';
    const scenes = JSON.parse(JSON.stringify(reqData.scenes)) as any[];

    const segments: KokoroSegment[] = [];
    scenes.forEach((scene, i) => {
      if (scene.narration && String(scene.narration).trim()) {
        segments.push({ id: String(i), text: String(scene.narration) });
      }
    });

    if (segments.length > 0) {
      const results = await synthesizeKokoroBatch(
        segments,
        reqData.voiceId || DEFAULT_TTS_VOICE,
        reqData.voiceOpts?.speed || 1.0,
        ttsDir,
      );
      const byId = new Map(results.map((r) => [r.id, r]));
      for (let i = 0; i < scenes.length; i++) {
        const r = byId.get(String(i));
        if (r && r.wavPath && fs.existsSync(r.wavPath)) {
          const wav = fs.readFileSync(r.wavPath);
          const audioPath = `motion/${reqData.userId}/${id}/scene-${i}.wav`;
          scenes[i].audioUrl = await uploadToBucket(audioPath, wav, 'audio/wav');
          scenes[i].durationInFrames = Math.ceil((r.durationSec + TAIL_PAD_SEC) * FPS);
        } else {
          scenes[i].durationInFrames =
            scenes[i].durationInFrames || Math.ceil(MIN_SCENE_SEC * FPS);
        }
      }
    } else {
      for (const s of scenes) {
        s.durationInFrames = s.durationInFrames || Math.ceil(MIN_SCENE_SEC * FPS);
      }
    }

    // 2. Build inputProps for the Remotion composition.
    const inputProps = {
      brand: reqData.brand,
      scenes,
      audio: {
        musicUrl: reqData.music?.url,
        musicMode: reqData.music?.mode || 'continuous',
      },
    };

    // 3. Render on AWS Lambda.
    job.status = 'rendering';
    job.stage = 'render';
    const functionName = await resolveFunctionName();

    // Size each chunk so the render uses at most MAX_PARALLEL_LAMBDAS parallel
    // functions — staying within a fresh AWS account's low concurrency cap so
    // it doesn't fail with "Rate Exceeded".
    const totalFrames = scenes.reduce(
      (sum: number, s: any) => sum + (s?.durationInFrames || 90),
      0,
    );
    const framesPerLambda = Math.max(
      MIN_FRAMES_PER_LAMBDA,
      Math.ceil(totalFrames / MAX_PARALLEL_LAMBDAS),
    );

    const { renderId, bucketName } = await renderMediaOnLambda({
      region: LAMBDA_REGION,
      functionName,
      serveUrl: LAMBDA_SERVE_URL,
      composition: LAMBDA_COMPOSITION,
      inputProps,
      codec: 'h264',
      framesPerLambda,
      privacy: 'public',
      downloadBehavior: { type: 'play-in-browser' },
    });

    // 4. Poll until the distributed render finishes.
    for (;;) {
      await new Promise((r) => setTimeout(r, 2000));
      const progress = await getRenderProgress({
        renderId,
        bucketName,
        functionName,
        region: LAMBDA_REGION,
      });
      if (progress.fatalErrorEncountered) {
        throw new Error(
          progress.errors?.[0]?.message || 'Lambda render failed',
        );
      }
      job.progress = progress.overallProgress || 0;
      if (progress.done) {
        job.videoUrl = progress.outputFile || undefined;
        job.status = 'done';
        job.progress = 1;
        break;
      }
    }
  } finally {
    activeRenders--;
    try {
      fs.rmSync(ttsDir, { recursive: true, force: true });
    } catch {
      /* ignore temp cleanup errors */
    }
  }
}
