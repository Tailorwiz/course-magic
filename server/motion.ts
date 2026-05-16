/**
 * server/motion.ts — orchestration for the Remotion motion-video pipeline.
 *
 * Responsibilities:
 *  - synthesizeSpeech(): TTS one narration line via ElevenLabs (reused by the
 *    /api/tts/elevenlabs route and the render pipeline).
 *  - enqueueMotionRender(): for a scene list, generate per-scene narration,
 *    derive each scene's duration from the audio, upload assets to Supabase,
 *    then spawn the Remotion render worker as a subprocess.
 *  - An in-memory job map so the client can poll render status.
 *
 * The actual render runs in motion/render-worker.ts (a separate process), so
 * the Express event loop is never blocked.
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';

const FPS = 30;
const TAIL_PAD_SEC = 0.6; // silence held after the last spoken word
const MIN_SCENE_SEC = 1.6; // floor for scenes with no narration
const STORAGE_BUCKET = 'lesson-media';

// ----- Supabase storage (own client; mirrors server/index.ts helpers) -------

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

  // Timestamps endpoint first.
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

export type MotionJobStatus = 'queued' | 'tts' | 'rendering' | 'uploading' | 'done' | 'error';

export interface MotionJob {
  id: string;
  status: MotionJobStatus;
  progress: number; // 0..1 during the render stage
  stage?: string;
  videoUrl?: string;
  bucketPath?: string;
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
  scenes: any[]; // validated Scene[] from the client / scene director
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
  // Fire and forget — runRender updates the job map as it progresses.
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
    // 1. Per-scene TTS — generate narration, derive durations, upload MP3s.
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
        // No narration — keep authored duration, or apply the floor.
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

    // 3. Write the job spec + spawn the render worker.
    job.status = 'rendering';
    const tmpDir = path.join(os.tmpdir(), 'motion-render', id);
    fs.mkdirSync(tmpDir, { recursive: true });
    const outputPath = path.join(tmpDir, 'video.mp4');
    const specPath = path.join(tmpDir, 'job.json');
    const cwd = process.cwd();
    fs.writeFileSync(
      specPath,
      JSON.stringify({
        entryPoint: path.resolve(cwd, 'motion/src/index.ts'),
        compositionId: 'MotionVideoDynamic',
        inputProps,
        outputPath,
      }),
    );

    await runWorker(id, specPath);

    // 4. Upload the finished MP4.
    job.status = 'uploading';
    const mp4 = fs.readFileSync(outputPath);
    const videoPath = `motion/${reqData.userId}/${id}/video.mp4`;
    job.videoUrl = await uploadToBucket(videoPath, mp4, 'video/mp4');
    job.bucketPath = videoPath;
    job.status = 'done';
    job.progress = 1;

    // Clean temp files.
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  } finally {
    activeRenders--;
  }
}

/** Spawn motion/render-worker.ts and stream its newline-JSON progress. */
function runWorker(id: string, specPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const job = jobs.get(id)!;
    const workerPath = path.resolve(process.cwd(), 'motion/render-worker.ts');
    const child = spawn('npx', ['tsx', workerPath, specPath], {
      cwd: process.cwd(),
      shell: true,
      env: process.env,
    });

    let stderr = '';
    let buffer = '';

    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('{')) continue;
        try {
          const msg = JSON.parse(trimmed);
          if (msg.type === 'progress') {
            job.progress = msg.value;
          } else if (msg.type === 'status') {
            job.stage = msg.stage;
          } else if (msg.type === 'error') {
            stderr += msg.message;
          }
        } catch {
          /* ignore non-JSON lines */
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Render worker exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}
