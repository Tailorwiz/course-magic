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
// framesPerLambda kept high so a render uses few parallel functions — a fresh
// AWS account caps Lambda concurrency at 10. Raise the quota in the AWS
// console for faster renders, then this can be lowered.
const FRAMES_PER_LAMBDA = 300;

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

// ----- TTS ------------------------------------------------------------------

export interface SpeechResult {
  audioBase64: string;
  mimeType: string;
  wordTimestamps: { word: string; start: number; end: number }[];
  /** Measured duration in seconds (from the last word timestamp). */
  durationSec: number;
}

/**
 * Synthesize one line of narration via ElevenLabs (with word timestamps).
 * Shared by the TTS route and the motion render pipeline.
 */
export async function synthesizeSpeech(
  text: string,
  voiceId: string,
  opts: { stability?: number; similarityBoost?: number; speed?: number; apiKey?: string } = {},
): Promise<SpeechResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY || opts.apiKey;
  if (!apiKey) throw new Error('ElevenLabs API key not configured');
  if (!text || !voiceId) throw new Error('Missing text or voiceId');

  const body = JSON.stringify({
    text,
    model_id: 'eleven_turbo_v2',
    voice_settings: {
      stability: opts.stability ?? 0.5,
      similarity_boost: opts.similarityBoost ?? 0.75,
    },
    speed: opts.speed ?? 1.0,
  });

  const tsResp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    { method: 'POST', headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' }, body },
  );

  const wordTimestamps: { word: string; start: number; end: number }[] = [];

  if (tsResp.ok) {
    const data: any = await tsResp.json();
    const alignment = data.alignment || data.normalized_alignment;
    if (
      alignment?.characters &&
      alignment?.character_start_times_seconds &&
      alignment?.character_end_times_seconds
    ) {
      const chars: string[] = alignment.characters;
      const starts: number[] = alignment.character_start_times_seconds;
      const ends: number[] = alignment.character_end_times_seconds;
      let word = '';
      let wStart = 0;
      let wEnd = 0;
      for (let i = 0; i < chars.length; i++) {
        const c = chars[i];
        if (c === ' ' || c === '\n' || c === '\t') {
          if (word.trim()) wordTimestamps.push({ word: word.trim(), start: wStart, end: wEnd });
          word = '';
        } else {
          if (word === '') wStart = starts[i];
          word += c;
          wEnd = ends[i];
        }
      }
      if (word.trim()) wordTimestamps.push({ word: word.trim(), start: wStart, end: wEnd });
    }
    const durationSec =
      wordTimestamps.length > 0
        ? wordTimestamps[wordTimestamps.length - 1].end
        : estimateDuration(text);
    return { audioBase64: data.audio_base64, mimeType: 'audio/mpeg', wordTimestamps, durationSec };
  }

  // Fallback: plain endpoint, no timestamps — estimate duration from word count.
  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body,
  });
  if (!resp.ok) throw new Error(`ElevenLabs error ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  return {
    audioBase64: buf.toString('base64'),
    mimeType: 'audio/mpeg',
    wordTimestamps: [],
    durationSec: estimateDuration(text),
  };
}

/** Rough duration estimate (~2.6 words/sec) when no timestamps are available. */
function estimateDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(words / 2.6, 1.2);
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
  try {
    // 1. Per-scene TTS — narration, durations, upload MP3s to Supabase.
    job.status = 'tts';
    const scenes = JSON.parse(JSON.stringify(reqData.scenes)) as any[];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      if (scene.narration && String(scene.narration).trim()) {
        const speech = await synthesizeSpeech(scene.narration, reqData.voiceId, reqData.voiceOpts);
        const mp3 = Buffer.from(speech.audioBase64, 'base64');
        const audioPath = `motion/${reqData.userId}/${id}/scene-${i}.mp3`;
        scene.audioUrl = await uploadToBucket(audioPath, mp3, 'audio/mpeg');
        scene.durationInFrames = Math.ceil((speech.durationSec + TAIL_PAD_SEC) * FPS);
      } else {
        scene.durationInFrames =
          scene.durationInFrames || Math.ceil(MIN_SCENE_SEC * FPS);
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
    const { renderId, bucketName } = await renderMediaOnLambda({
      region: LAMBDA_REGION,
      functionName,
      serveUrl: LAMBDA_SERVE_URL,
      composition: LAMBDA_COMPOSITION,
      inputProps,
      codec: 'h264',
      framesPerLambda: FRAMES_PER_LAMBDA,
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
  }
}
