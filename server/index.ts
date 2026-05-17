// Load .env BEFORE any other imports so DB and AI clients see the values
import "dotenv/config";

// Force GEMINI_API_KEY: Always delete GOOGLE_API_KEY to avoid SDK confusion
// The SDK prints "Both GOOGLE_API_KEY and GEMINI_API_KEY are set" and uses the wrong one
if (process.env.GOOGLE_API_KEY) {
  console.log("Deleting GOOGLE_API_KEY from environment to force SDK to use GEMINI_API_KEY only");
  delete process.env.GOOGLE_API_KEY;
}

import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import JSZip from "jszip";
import { db, getRawSql } from "./db";
import { users, courses, progress, tickets, certificates, lessonAudio, lessonImages, lessonVideos } from "../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { ObjectStorageService, ObjectNotFoundError, objectStorageClient } from "./objectStorage";
import { GoogleGenAI, Modality } from "@google/genai";
import { signToken, requireAuth, requireAuthMedia, requireRole, requireSelfOrRole } from "./auth";
import { enqueueMotionRender, getMotionJob, isRenderBusy } from "./motion";
import { buildDirectorPrompt, sanitizeScenes } from "./sceneDirector";
import archiver from "archiver";
import os from "os";
import { spawn } from "child_process";
// @ts-ignore — ffmpeg-static exports the binary path string
import ffmpegPath from "ffmpeg-static";
import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

// P1.1: lazy-init Supabase Storage client; only when both env vars are set.
let _supabaseClient: SupabaseClient | null = null;
function getSupabaseStorage(): SupabaseClient | null {
  if (_supabaseClient) return _supabaseClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _supabaseClient = createSupabaseClient(url, key);
  return _supabaseClient;
}
const STORAGE_BUCKET = "lesson-media";
const STORAGE_FILE_LIMIT = 50 * 1024 * 1024; // free-tier per-file limit

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

import fs from "fs";
import crypto from "crypto";
import nodemailer from "nodemailer";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "500mb" }));

// Serve media files statically
const mediaPath = path.join(__dirname, "..", "public", "media");
app.use("/media", express.static(mediaPath, {
  maxAge: '1y',
  immutable: true
}));

// Serve objects from Replit Object Storage (handles paths like /objects/videos/abc.mp4)
app.get(/^\/objects\/(.+)$/, async (req, res) => {
  try {
    const objectStorageService = new ObjectStorageService();
    const objectFile = await objectStorageService.getObjectEntityFile(req.path);
    objectStorageService.downloadObject(objectFile, res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      return res.sendStatus(404);
    }
    console.error("Error serving object:", error);
    return res.sendStatus(500);
  }
});

// ============ MEDIA HELPERS ============

function ensureMediaDirs() {
  const dirs = ['images', 'audio', 'video'];
  for (const dir of dirs) {
    const fullPath = path.join(mediaPath, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }
}
ensureMediaDirs();

function isBase64Data(data: string): boolean {
  if (!data || data.length < 100) return false;
  if (data.startsWith('/media/') || data.startsWith('http')) return false;
  if (data === '[IMAGE]' || data === '[AUDIO]' || data === '[VIDEO]') return false;
  // Check if it looks like base64 (data URL or raw base64)
  if (data.startsWith('data:')) return true;
  // Raw base64 - check if it's mostly valid base64 chars and long enough
  if (/^[A-Za-z0-9+/=]+$/.test(data.slice(0, 100)) && data.length > 1000) return true;
  return false;
}

function saveBase64ToFile(base64Data: string, type: 'images' | 'audio' | 'video', extension: string): string | null {
  if (!isBase64Data(base64Data)) {
    return null;
  }
  
  // Skip if already a URL
  if (base64Data.startsWith('/media/') || base64Data.startsWith('http')) {
    return base64Data;
  }
  
  try {
    // Extract base64 content from data URL if present
    let cleanBase64 = base64Data;
    if (base64Data.includes(',')) {
      cleanBase64 = base64Data.split(',')[1];
    }
    
    const buffer = Buffer.from(cleanBase64, 'base64');
    const hash = crypto.createHash('md5').update(buffer).digest('hex').slice(0, 12);
    const filename = `${hash}.${extension}`;
    const filePath = path.join(mediaPath, type, filename);
    
    // Only write if file doesn't exist (deduplication)
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, buffer);
    }
    
    return `/media/${type}/${filename}`;
  } catch (err) {
    console.error('Failed to save media file:', err);
    return null;
  }
}

let objectStorageWorking: boolean | null = null;

async function isObjectStorageConfigured(): Promise<boolean> {
  // DISABLED: Only use Supabase database for all storage
  // Object Storage is not used - all media goes to lesson_audio and lesson_images tables
  return false;
  
  if (!process.env.PRIVATE_OBJECT_DIR) return false;
  
  // Cache the result after first check
  if (objectStorageWorking !== null) return objectStorageWorking;
  
  // Test if Object Storage actually works by trying to list bucket
  try {
    const objectStorageService = new ObjectStorageService();
    const privateDir = objectStorageService.getPrivateObjectDir();
    console.log('Object Storage: Testing with PRIVATE_OBJECT_DIR =', privateDir);
    const { bucketName, objectName } = parseObjectPath(privateDir);
    console.log('Object Storage: Parsed bucket =', bucketName, ', path =', objectName);
    
    // Try to access the bucket to verify permissions
    const bucket = objectStorageClient.bucket(bucketName);
    await bucket.getMetadata();
    
    objectStorageWorking = true;
    console.log('Object Storage status: WORKING (bucket accessible)');
  } catch (err: any) {
    objectStorageWorking = false;
    console.log('Object Storage error details:', JSON.stringify({
      message: err.message,
      code: err.code,
      name: err.name,
      status: err.status,
      errors: err.errors
    }, null, 2));
    if (err.message?.includes('no allowed resources')) {
      console.log('Object Storage status: NOT CONFIGURED (bucket not in allowed resources)');
      console.log('HINT: Add the bucket to allowed resources in the Object Storage panel');
    } else {
      console.log('Object Storage status: NOT AVAILABLE -', err.message || String(err));
    }
  }
  
  return objectStorageWorking;
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 2) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");
  return { bucketName, objectName };
}

async function saveVideoToObjectStorage(base64Data: string): Promise<string | null> {
  if (!isBase64Data(base64Data)) return null;
  if (base64Data.startsWith('/objects/') || base64Data.startsWith('/media/') || base64Data.startsWith('http')) {
    return base64Data;
  }
  
  try {
    const objectStorageService = new ObjectStorageService();
    const url = await objectStorageService.uploadVideoFromBase64(base64Data, 'video.mp4');
    console.log('Video uploaded to Object Storage:', url);
    return url;
  } catch (err) {
    console.error('Failed to upload video to Object Storage:', err);
    return null;
  }
}

async function saveImageToObjectStorage(base64Data: string, extension: string = 'png'): Promise<string | null> {
  if (!isBase64Data(base64Data)) return null;
  if (base64Data.startsWith('/objects/') || base64Data.startsWith('/media/') || base64Data.startsWith('http')) {
    return base64Data;
  }
  
  try {
    const objectStorageService = new ObjectStorageService();
    const url = await objectStorageService.uploadImageFromBase64(base64Data, `image.${extension}`);
    console.log('Image uploaded to Object Storage:', url);
    return url;
  } catch (err) {
    console.error('Failed to upload image to Object Storage:', err);
    return null;
  }
}

async function saveAudioToObjectStorage(base64Data: string): Promise<string | null> {
  if (!isBase64Data(base64Data)) return null;
  if (base64Data.startsWith('/objects/') || base64Data.startsWith('/media/') || base64Data.startsWith('http')) {
    return base64Data;
  }
  
  try {
    const objectStorageService = new ObjectStorageService();
    const url = await objectStorageService.uploadAudioFromBase64(base64Data, 'audio.mp3');
    console.log('Audio uploaded to Object Storage:', url);
    return url;
  } catch (err) {
    console.error('Failed to upload audio to Object Storage:', err);
    return null;
  }
}

async function extractMediaFromCourse(course: any): Promise<any> {
  const updated = { ...course };
  const useObjectStorage = await isObjectStorageConfigured();
  
  // If Object Storage is not working, keep ALL media as base64 in Supabase database
  // NEVER use local disk storage - it's ephemeral on Replit
  if (!useObjectStorage) {
    console.log('Object Storage not available - storing all media as base64 in Supabase database');
    return updated;
  }
  
  // Process ecover - use Object Storage if available (already handled above with local disk)
  if (isBase64Data(updated.ecoverUrl)) {
    const url = await saveImageToObjectStorage(updated.ecoverUrl, 'jpg');
    if (url) updated.ecoverUrl = url;
  }
  
  // Process modules
  if (updated.modules) {
    const processedModules = [];
    
    for (const mod of updated.modules) {
      const processedLessons = [];
      
      for (const lesson of (mod.lessons || [])) {
        const updatedLesson = { ...lesson };
        
        // Process lesson image
        if (isBase64Data(updatedLesson.imageUrl)) {
          const url = await saveImageToObjectStorage(updatedLesson.imageUrl, 'jpg');
          if (url) updatedLesson.imageUrl = url;
        }
        
        // Process audio
        if (isBase64Data(updatedLesson.audioData)) {
          const url = await saveAudioToObjectStorage(updatedLesson.audioData);
          if (url) updatedLesson.audioData = url;
        }
        
        // Process rendered video
        if (isBase64Data(updatedLesson.renderedVideoUrl)) {
          const url = await saveVideoToObjectStorage(updatedLesson.renderedVideoUrl);
          if (url) updatedLesson.renderedVideoUrl = url;
        }
        
        // Process visuals array
        if (updatedLesson.visuals && Array.isArray(updatedLesson.visuals)) {
          const processedVisuals = [];
          for (const visual of updatedLesson.visuals) {
            const updatedVisual = { ...visual };
            if (isBase64Data(updatedVisual.imageData)) {
              const url = await saveImageToObjectStorage(updatedVisual.imageData, 'png');
              if (url) updatedVisual.imageData = url;
            }
            processedVisuals.push(updatedVisual);
          }
          updatedLesson.visuals = processedVisuals;
        }
        
        processedLessons.push(updatedLesson);
      }
      
      processedModules.push({
        ...mod,
        lessons: processedLessons
      });
    }
    
    updated.modules = processedModules;
  }
  
  return updated;
}

// ============ TTS API ROUTES ============

const GEMINI_VOICE_MAP: Record<string, string> = {
  'Fenrir (Deep Male)': 'Fenrir',
  'Puck (Tenor Male)': 'Puck',
  'Charon (Deep Male)': 'Charon',
  'Kore (Balanced Female)': 'Kore',
  'Zephyr (Bright Female)': 'Zephyr'
};

// Gemini TTS endpoint - proxies requests to keep API key secure
app.post("/api/tts/gemini", requireAuth, async (req, res) => {
  try {
    const { text, voiceId } = req.body;
    
    if (!text || !voiceId) {
      return res.status(400).json({ error: "Missing text or voiceId" });
    }
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY not configured on server");
      return res.status(500).json({ error: "TTS service not configured" });
    }
    
    const ai = new GoogleGenAI({ apiKey });
    const modelName = GEMINI_VOICE_MAP[voiceId] || 'Kore';
    
    console.log(`Gemini TTS request: voice=${modelName}, text length=${text.length}`);
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: modelName }
          }
        }
      }
    });
    
    if (response.candidates?.[0]?.content?.parts) {
      let audioData = '';
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          audioData = part.inlineData.data;
          break;
        }
      }
      
      if (audioData) {
        console.log(`Gemini TTS success: audio data length=${audioData.length}`);
        return res.json({ 
          audioData, 
          mimeType: 'audio/pcm',
          success: true 
        });
      }
    }
    
    console.error("Gemini TTS returned no audio data");
    return res.status(500).json({ error: "TTS returned no audio data" });
    
  } catch (error: any) {
    console.error("Gemini TTS error:", error.message || error);
    
    if (error.message?.includes('429') || error.message?.includes('quota')) {
      return res.status(429).json({ error: "Rate limit reached. Please wait and try again." });
    }
    if (error.message?.includes('401') || error.message?.includes('403')) {
      return res.status(401).json({ error: "API key issue. Please check server configuration." });
    }
    
    return res.status(500).json({ error: error.message || "TTS generation failed" });
  }
});

// ElevenLabs TTS endpoint - proxies requests to keep API key secure
app.post("/api/tts/elevenlabs", requireAuth, async (req, res) => {
  try {
    const { text, voiceId, stability, similarityBoost, speed } = req.body;
    // Prefer server-side env key. Fall back to client-supplied key for backward compat.
    const apiKey = process.env.ELEVENLABS_API_KEY || req.body.apiKey;

    if (!text || !voiceId) {
      return res.status(400).json({ error: "Missing text or voiceId" });
    }
    if (!apiKey) {
      return res.status(500).json({ error: "ElevenLabs API key not configured on server" });
    }
    
    console.log(`ElevenLabs TTS request: voiceId=${voiceId}, text length=${text.length}`);
    
    // Try timestamps endpoint first
    let response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2",
        voice_settings: { 
          stability: stability || 0.5, 
          similarity_boost: similarityBoost || 0.75 
        },
        speed: speed || 1.0
      })
    });
    
    let wordTimestamps: { word: string; start: number; end: number }[] = [];
    let audioBase64 = '';
    
    if (response.ok) {
      const data = await response.json();
      audioBase64 = data.audio_base64;
      const alignmentData = data.alignment || data.normalized_alignment;
      
      if (alignmentData?.characters && alignmentData?.character_start_times_seconds && alignmentData?.character_end_times_seconds) {
        const chars = alignmentData.characters;
        const startTimes = alignmentData.character_start_times_seconds;
        const endTimes = alignmentData.character_end_times_seconds;
        let currentWord = '', wordStart = 0, wordEnd = 0;
        
        for (let i = 0; i < chars.length; i++) {
          const char = chars[i];
          if (char === ' ' || char === '\n' || char === '\t') {
            if (currentWord.trim()) {
              wordTimestamps.push({ word: currentWord.trim(), start: wordStart, end: wordEnd });
            }
            currentWord = '';
          } else {
            if (currentWord === '') { wordStart = startTimes[i]; }
            currentWord += char;
            wordEnd = endTimes[i];
          }
        }
        if (currentWord.trim()) {
          wordTimestamps.push({ word: currentWord.trim(), start: wordStart, end: wordEnd });
        }
      }
      
      console.log(`ElevenLabs TTS success: ${wordTimestamps.length} word timestamps`);
      return res.json({
        audioData: audioBase64,
        mimeType: 'audio/mpeg',
        wordTimestamps,
        success: true
      });
    }
    
    // Fallback to regular endpoint
    console.log("Timestamps endpoint failed, trying regular endpoint");
    response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2",
        voice_settings: { 
          stability: stability || 0.5, 
          similarity_boost: similarityBoost || 0.75 
        },
        speed: speed || 1.0
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs API Error:", response.status, errorText);
      return res.status(response.status).json({ error: errorText });
    }
    
    const audioBuffer = await response.arrayBuffer();
    audioBase64 = Buffer.from(audioBuffer).toString('base64');
    
    console.log(`ElevenLabs TTS success (no timestamps): audio length=${audioBase64.length}`);
    return res.json({
      audioData: audioBase64,
      mimeType: 'audio/mpeg',
      wordTimestamps: [],
      success: true
    });
    
  } catch (error: any) {
    console.error("ElevenLabs TTS error:", error.message || error);
    return res.status(500).json({ error: error.message || "ElevenLabs TTS failed" });
  }
});

// ============ MOTION VIDEO (Remotion) ============
// Phase 2a: render a brand-aware motion-graphics video. The render runs in a
// subprocess (motion/render-worker.ts); this endpoint returns a jobId the
// client polls. Per-scene narration TTS + duration derivation happen inside
// enqueueMotionRender (server/motion.ts).
app.post("/api/motion/render", requireRole("CREATOR"), async (req, res) => {
  try {
    const { scenes, brand, voiceId, music, voiceOpts } = req.body;

    if (!Array.isArray(scenes) || scenes.length === 0) {
      return res.status(400).json({ error: "scenes must be a non-empty array" });
    }
    if (!voiceId) {
      return res.status(400).json({ error: "voiceId is required" });
    }
    if (isRenderBusy()) {
      return res.status(429).json({ error: "A render is already in progress. Try again shortly." });
    }

    const userId = (req as any).auth?.userId || "anonymous";
    const jobId = enqueueMotionRender({
      userId,
      scenes,
      brand: brand || {},
      voiceId,
      music,
      voiceOpts,
    });

    return res.status(202).json({ jobId });
  } catch (error: any) {
    console.error("Motion render error:", error?.message || error);
    return res.status(500).json({ error: error?.message || "Motion render failed to start" });
  }
});

// Poll a motion render job's status.
app.get("/api/motion/render/:jobId", requireAuth, async (req, res) => {
  const job = getMotionJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Render job not found" });
  return res.json({
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    videoUrl: job.videoUrl,
    durationSec: job.durationSec,
    error: job.error,
  });
});

// Upload a motion-video asset (logo, product screenshot, etc.) to Supabase
// Storage and return its public URL. Used by the Motion Video builder so
// users can upload a logo file instead of pasting a URL.
app.post("/api/motion/upload-asset", requireRole("CREATOR"), upload.single("file"), async (req, res) => {
  try {
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });
    const storage = getSupabaseStorage();
    if (!storage) return res.status(500).json({ error: "Storage not configured" });

    const ext = (file.originalname?.split(".").pop() || "bin").toLowerCase().slice(0, 8);
    const userId = (req as any).auth?.userId || "anon";
    const objectPath = `motion/assets/${userId}/${crypto.randomUUID()}.${ext}`;

    const { error } = await storage.storage
      .from(STORAGE_BUCKET)
      .upload(objectPath, file.buffer, {
        contentType: file.mimetype || "application/octet-stream",
        upsert: true,
        cacheControl: "86400",
      });
    if (error) throw new Error(error.message);

    const url = bucketPublicUrl(objectPath);
    return res.json({ url });
  } catch (e: any) {
    console.error("Motion asset upload error:", e?.message || e);
    return res.status(500).json({ error: e?.message || "Upload failed" });
  }
});

// Capture a screenshot of a webpage for use as a motion-video media scene.
// The Railway container has no Chromium (rendering is on Lambda), so this uses
// a free, no-key screenshot service, then stores the image in Supabase.
app.post("/api/motion/capture-url", requireRole("CREATOR"), async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "url is required" });
    }
    let parsed: URL;
    try {
      parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    } catch {
      return res.status(400).json({ error: "Invalid URL" });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return res.status(400).json({ error: "URL must be http or https" });
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".internal") ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return res.status(400).json({ error: "That URL is not allowed" });
    }

    // thum.io renders the page on demand and returns the image directly.
    const shotUrl = `https://image.thum.io/get/width/1280/crop/720/${parsed.toString()}`;
    const shotResp = await fetch(shotUrl, { signal: AbortSignal.timeout(30000) });
    if (!shotResp.ok) {
      return res.status(502).json({ error: `Screenshot service error (HTTP ${shotResp.status})` });
    }
    const buf = Buffer.from(await shotResp.arrayBuffer());
    if (buf.length < 1000) {
      return res.status(502).json({ error: "Screenshot came back empty — try again" });
    }

    const storage = getSupabaseStorage();
    if (!storage) return res.status(500).json({ error: "Storage not configured" });
    const userId = (req as any).auth?.userId || "anon";
    const objectPath = `motion/assets/${userId}/${crypto.randomUUID()}.jpg`;
    const { error } = await storage.storage
      .from(STORAGE_BUCKET)
      .upload(objectPath, buf, { contentType: "image/jpeg", upsert: true, cacheControl: "86400" });
    if (error) throw new Error(error.message);

    return res.json({ url: bucketPublicUrl(objectPath) });
  } catch (e: any) {
    console.error("Motion capture-url error:", e?.message || e);
    return res.status(500).json({ error: e?.message || "URL capture failed" });
  }
});

// Search the web for images to use in a motion-video scene. Uses Openverse
// (700M+ images, free, no key) and — when PEXELS_API_KEY is set — Pexels
// stock photos. Returns a list of { url, thumb, source } for the user (or the
// AI Scene Director) to pick from.
app.post("/api/motion/find-image", requireRole("CREATOR"), async (req, res) => {
  try {
    const { query, count } = req.body;
    if (!query || typeof query !== "string" || !query.trim()) {
      return res.status(400).json({ error: "query is required" });
    }
    const q = query.trim();
    const n = Math.min(Math.max(Number(count) || 12, 1), 30);
    const results: { url: string; thumb: string; source: string }[] = [];

    // Pexels — pro stock photography (only if a key is configured).
    if (process.env.PEXELS_API_KEY) {
      try {
        const r = await fetch(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${n}`,
          { headers: { Authorization: process.env.PEXELS_API_KEY }, signal: AbortSignal.timeout(12000) },
        );
        if (r.ok) {
          const d: any = await r.json();
          for (const p of d.photos || []) {
            if (p?.src?.large) {
              results.push({ url: p.src.large2x || p.src.large, thumb: p.src.medium || p.src.large, source: "pexels" });
            }
          }
        }
      } catch (e: any) {
        console.warn("find-image: Pexels failed:", String(e?.message || e).slice(0, 120));
      }
    }

    // Openverse — broad web image search, free, no key.
    try {
      const r = await fetch(
        `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=${n}`,
        { headers: { "User-Agent": "CourseMagic" }, signal: AbortSignal.timeout(12000) },
      );
      if (r.ok) {
        const d: any = await r.json();
        for (const p of d.results || []) {
          if (p?.url) {
            results.push({ url: p.url, thumb: p.thumbnail || p.url, source: "openverse" });
          }
        }
      }
    } catch (e: any) {
      console.warn("find-image: Openverse failed:", String(e?.message || e).slice(0, 120));
    }

    if (results.length === 0) {
      return res.status(502).json({ error: "No images found — try a different search term" });
    }
    return res.json({ images: results.slice(0, n), success: true });
  } catch (e: any) {
    console.error("Motion find-image error:", e?.message || e);
    return res.status(500).json({ error: e?.message || "Image search failed" });
  }
});

// ============ STAGED MEDIA UPLOAD ROUTES ============

app.post("/api/media/upload", requireRole("CREATOR"), async (req, res) => {
  try {
    const { type, data, filename, mimeType: clientMimeType } = req.body;
    
    if (!type || !data) {
      return res.status(400).json({ error: "Missing type or data" });
    }
    
    if (!['image', 'audio', 'video'].includes(type)) {
      return res.status(400).json({ error: "Invalid type. Must be image, audio, or video" });
    }
    
    const dataSize = data.length;
    console.log(`Media upload: type=${type}, mimeType=${clientMimeType || 'auto'}, size=${(dataSize/1024).toFixed(1)}KB`);
    
    const useObjectStorage = await isObjectStorageConfigured();
    let url: string | null = null;
    let storage: 'object' | 'db' = 'db';
    
    if (useObjectStorage) {
      if (type === 'image') {
        url = await saveImageToObjectStorage(data, 'png');
      } else if (type === 'audio') {
        url = await saveAudioToObjectStorage(data);
      } else if (type === 'video') {
        url = await saveVideoToObjectStorage(data);
      }
      if (url) storage = 'object';
    }
    
    if (!url) {
      // ALWAYS store all media as base64 in Supabase database - local disk is ephemeral
      let cleanBase64 = data;
      let mimeType = clientMimeType || (type === 'image' ? 'image/png' : type === 'audio' ? 'audio/mpeg' : 'video/mp4');
      
      if (data.startsWith('data:')) {
        const match = data.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          cleanBase64 = match[2];
        }
      } else if (data.includes(',')) {
        cleanBase64 = data.split(',')[1];
      }
      
      url = `data:${mimeType};base64,${cleanBase64}`;
      storage = 'db';
      console.log(`${type} stored as base64 in Supabase database`);
    }
    
    console.log(`Media uploaded: storage=${storage}, url=${url?.substring(0, 50)}...`);
    
    return res.json({
      success: true,
      url,
      storage,
      size: dataSize
    });
    
  } catch (error: any) {
    console.error("Media upload error:", error.message || error);
    return res.status(500).json({ error: error.message || "Media upload failed" });
  }
});

app.post("/api/media/upload-batch", requireRole("CREATOR"), async (req, res) => {
  try {
    const { items } = req.body;
    
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: "Missing items array" });
    }
    
    console.log(`Batch media upload: ${items.length} items`);
    
    const useObjectStorage = await isObjectStorageConfigured();
    const results: Array<{ index: number; success: boolean; url?: string; error?: string }> = [];
    
    for (let i = 0; i < items.length; i++) {
      const { type, data } = items[i];
      
      if (!type || !data) {
        results.push({ index: i, success: false, error: "Missing type or data" });
        continue;
      }
      
      try {
        let url: string | null = null;
        
        if (useObjectStorage) {
          if (type === 'image') {
            url = await saveImageToObjectStorage(data, 'png');
          } else if (type === 'audio') {
            url = await saveAudioToObjectStorage(data);
          } else if (type === 'video') {
            url = await saveVideoToObjectStorage(data);
          }
        }
        
        if (!url) {
          // ALWAYS store all media as base64 in Supabase database - local disk is ephemeral
          let cleanBase64 = data;
          let mimeType = type === 'image' ? 'image/png' : type === 'audio' ? 'audio/mpeg' : 'video/mp4';
          
          if (data.startsWith('data:')) {
            const match = data.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              mimeType = match[1];
              cleanBase64 = match[2];
            }
          } else if (data.includes(',')) {
            cleanBase64 = data.split(',')[1];
          }
          
          url = `data:${mimeType};base64,${cleanBase64}`;
        }
        
        results.push({ index: i, success: true, url });
      } catch (err: any) {
        results.push({ index: i, success: false, error: err.message });
      }
    }
    
    console.log(`Batch upload complete: ${results.filter(r => r.success).length}/${items.length} succeeded`);
    
    return res.json({ success: true, results });
    
  } catch (error: any) {
    console.error("Batch media upload error:", error.message || error);
    return res.status(500).json({ error: error.message || "Batch upload failed" });
  }
});

// ============ LESSON TAKEAWAYS STORAGE ============

// Save takeaways for a specific lesson
app.put("/api/courses/:courseId/lessons/:lessonId/takeaways", requireRole("CREATOR"), async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    const { keyTakeaways, actionItems } = req.body;
    
    console.log(`Saving takeaways for course=${courseId}, lesson=${lessonId}`);
    
    // Get the course from database
    const courseRows = await db.select().from(courses).where(eq(courses.id, courseId));
    if (courseRows.length === 0) {
      return res.status(404).json({ error: "Course not found" });
    }
    
    const courseData = courseRows[0].data as any;
    if (!courseData?.modules) {
      return res.status(404).json({ error: "Course has no modules" });
    }
    
    // Find and update the lesson
    let updated = false;
    for (const mod of courseData.modules) {
      for (const lesson of mod.lessons || []) {
        if (lesson.id === lessonId) {
          lesson.keyTakeaways = keyTakeaways || [];
          lesson.actionItems = actionItems || [];
          updated = true;
          break;
        }
      }
      if (updated) break;
    }
    
    if (!updated) {
      return res.status(404).json({ error: "Lesson not found" });
    }
    
    // Save back to database
    await db.update(courses)
      .set({ data: courseData, updatedAt: new Date() })
      .where(eq(courses.id, courseId));
    
    console.log(`Saved takeaways for lesson ${lessonId}`);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Save takeaways error:", error.message || error);
    res.status(500).json({ error: error.message || "Failed to save takeaways" });
  }
});

// ============ LESSON AUDIO STORAGE (Separate from course payload) ============

// Save audio for a specific lesson - bypasses HTTP payload limits
app.put("/api/courses/:courseId/lessons/:lessonId/audio", requireRole("CREATOR"), async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    const { audioData, mimeType, wordTimestamps } = req.body;
    
    if (!audioData) {
      return res.status(400).json({ error: "Missing audioData" });
    }
    
    console.log(`Saving audio for course=${courseId}, lesson=${lessonId}, size=${(audioData.length / 1024).toFixed(1)}KB`);
    
    // Clean up the audio data (ensure proper format)
    let cleanAudioData = audioData;
    if (audioData.startsWith('data:')) {
      const match = audioData.match(/^data:[^;]+;base64,(.+)$/);
      if (match) {
        cleanAudioData = match[1];
      }
    }
    
    // Check for existing audio for this lesson
    console.log(`[Audio Save] Checking for existing audio...`);
    const existing = await db.select()
      .from(lessonAudio)
      .where(and(
        eq(lessonAudio.courseId, courseId),
        eq(lessonAudio.lessonId, lessonId)
      ));
    
    console.log(`[Audio Save] Found ${existing.length} existing records`);
    
    if (existing.length > 0) {
      // Update existing
      const updateResult = await db.update(lessonAudio)
        .set({
          audioData: cleanAudioData,
          mimeType: mimeType || 'audio/mpeg',
          wordTimestamps: wordTimestamps || null,
          updatedAt: new Date()
        })
        .where(and(
          eq(lessonAudio.courseId, courseId),
          eq(lessonAudio.lessonId, lessonId)
        ))
        .returning({ id: lessonAudio.id });
      console.log(`[Audio Save] Updated audio for lesson ${lessonId}, result: ${JSON.stringify(updateResult)}`);
    } else {
      // Insert new
      const insertResult = await db.insert(lessonAudio).values({
        courseId,
        lessonId,
        audioData: cleanAudioData,
        mimeType: mimeType || 'audio/mpeg',
        wordTimestamps: wordTimestamps || null
      }).returning({ id: lessonAudio.id });
      console.log(`[Audio Save] Inserted new audio for lesson ${lessonId}, result: ${JSON.stringify(insertResult)}`);
    }
    
    // Verify the save
    const verifyCount = await db.select({ id: lessonAudio.id }).from(lessonAudio);
    console.log(`[Audio Save] Total records in lesson_audio table: ${verifyCount.length}`);
    
    res.json({ success: true, lessonId });
  } catch (error: any) {
    console.error("Save lesson audio error:", error.message || error);
    res.status(500).json({ error: error.message || "Failed to save audio" });
  }
});

// Get audio for a specific lesson — JSON form, kept for backward compat.
// New code should prefer /audio/stream (binary) + /audio/timestamps (small JSON).
app.get("/api/courses/:courseId/lessons/:lessonId/audio", requireAuth, async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;

    const [audio] = await db.select()
      .from(lessonAudio)
      .where(and(
        eq(lessonAudio.courseId, courseId),
        eq(lessonAudio.lessonId, lessonId)
      ));

    if (!audio) {
      return res.status(404).json({ error: "Audio not found" });
    }

    // Return as data URL
    const dataUrl = `data:${audio.mimeType || 'audio/mpeg'};base64,${audio.audioData}`;

    res.json({
      audioData: dataUrl,
      mimeType: audio.mimeType,
      wordTimestamps: audio.wordTimestamps || []
    });
  } catch (error: any) {
    console.error("Get lesson audio error:", error.message || error);
    res.status(500).json({ error: error.message || "Failed to get audio" });
  }
});

// P1.1 (fallback): ETag conditional GET for media streams. If the client sends
// If-None-Match matching our ETag, return 304 with no body — the browser uses its
// cached copy. Combined with Cache-Control:max-age, this means repeat lesson
// visits skip the download entirely.
function makeETag(parts: Array<string | number | Date | null | undefined>): string {
  const s = parts.map(p => {
    if (p === null || p === undefined) return '';
    if (p instanceof Date) return String(p.getTime());
    return String(p);
  }).join('|');
  // Quick non-cryptographic 32-bit hash → hex
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `W/"${(h >>> 0).toString(16)}-${s.length}"`;
}
function maybeNotModified(req: import('express').Request, res: import('express').Response, etag: string): boolean {
  res.setHeader('ETag', etag);
  const inm = req.headers['if-none-match'];
  if (typeof inm === 'string' && inm === etag) {
    res.status(304).end();
    return true;
  }
  return false;
}

// P1.1: Public Supabase Storage URL builder. We don't 100% redirect — for migrated
// rows we send a 302 to the bucket URL so existing <audio src=/api/...> bindings
// keep working without code changes.
const SUPABASE_PUBLIC_BASE = process.env.SUPABASE_URL
  ? `${process.env.SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/lesson-media`
  : null;
function bucketPublicUrl(path: string): string | null {
  if (!SUPABASE_PUBLIC_BASE || !path) return null;
  return `${SUPABASE_PUBLIC_BASE}/${path}`;
}

// Wrap raw PCM audio in a WAV container so browsers can play it directly.
// Mirrors pcmToWav() in utils.ts for the server side.
function pcmToWavBuffer(pcm: Buffer, sampleRate = 24000, numChannels = 1): Buffer {
  const headerLength = 44;
  const out = Buffer.alloc(headerLength + pcm.length);
  out.write('RIFF', 0, 'ascii');
  out.writeUInt32LE(36 + pcm.length, 4);
  out.write('WAVE', 8, 'ascii');
  out.write('fmt ', 12, 'ascii');
  out.writeUInt32LE(16, 16);             // PCM chunk size
  out.writeUInt16LE(1, 20);              // PCM format
  out.writeUInt16LE(numChannels, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * numChannels * 2, 28); // byte rate
  out.writeUInt16LE(numChannels * 2, 32); // block align
  out.writeUInt16LE(16, 34);             // bits per sample
  out.write('data', 36, 'ascii');
  out.writeUInt32LE(pcm.length, 40);
  pcm.copy(out, headerLength);
  return out;
}

// P0.1: Stream audio as raw binary so the browser can decode it off-thread.
// The <audio> element points its src at this URL with ?token=... for auth.
app.get("/api/courses/:courseId/lessons/:lessonId/audio/stream", requireAuthMedia, async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;

    const [audio] = await db.select()
      .from(lessonAudio)
      .where(and(
        eq(lessonAudio.courseId, courseId),
        eq(lessonAudio.lessonId, lessonId)
      ));

    if (!audio) {
      return res.status(404).send("Audio not found");
    }

    // P1.1: If migrated to Storage, 302 to the public bucket URL.
    if ((audio as any).bucketPath) {
      const url = bucketPublicUrl((audio as any).bucketPath);
      if (url) {
        res.setHeader('Cache-Control', 'private, max-age=86400');
        return res.redirect(302, url);
      }
    }

    // P1.1: ETag short-circuit (legacy DB-stored data path).
    const etag = makeETag(['audio', courseId, lessonId, audio.mimeType, audio.audioData.length, audio.updatedAt]);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    if (maybeNotModified(req, res, etag)) return;

    // Decode base64 -> Buffer once on the server. The browser handles the binary
    // natively from here on (no main-thread atob).
    let buffer = Buffer.from(audio.audioData, 'base64');
    let outMime = audio.mimeType || 'audio/mpeg';

    // Raw PCM isn't playable in <audio>. Wrap it in a WAV container.
    if (outMime === 'audio/pcm') {
      buffer = pcmToWavBuffer(buffer, 24000, 1);
      outMime = 'audio/wav';
    }

    res.setHeader('Content-Type', outMime);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Accept-Ranges', 'bytes');

    // Honor Range requests for seeking
    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : buffer.length - 1;
        if (start < buffer.length && end >= start && end < buffer.length) {
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${buffer.length}`);
          res.setHeader('Content-Length', String(end - start + 1));
          return res.end(buffer.subarray(start, end + 1));
        }
      }
    }

    res.end(buffer);
  } catch (error: any) {
    console.error("Stream lesson audio error:", error.message || error);
    res.status(500).send("Failed to stream audio");
  }
});

// P2.3: Force-align an existing lesson's audio against OpenAI Whisper to backfill
// word-level timestamps. Used for lessons created with Gemini TTS (no native timestamps)
// or any lesson where wordTimestamps is empty.
app.post("/api/courses/:courseId/lessons/:lessonId/audio/align", requireRole("CREATOR"), async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OpenAI API key not configured" });
    }

    const [audio] = await db.select()
      .from(lessonAudio)
      .where(and(
        eq(lessonAudio.courseId, courseId),
        eq(lessonAudio.lessonId, lessonId)
      ));

    if (!audio) {
      return res.status(404).json({ error: "Audio not found" });
    }

    const t0 = Date.now();
    let buffer: Buffer;
    let outMime = audio.mimeType || 'audio/mpeg';
    // P1.1: pull from bucket if migrated, else from inline base64.
    if ((audio as any).bucketPath) {
      const url = bucketPublicUrl((audio as any).bucketPath);
      if (!url) return res.status(500).json({ error: "Cannot resolve bucket URL" });
      const resp = await fetch(url);
      if (!resp.ok) return res.status(502).json({ error: `Bucket fetch ${resp.status}` });
      buffer = Buffer.from(await resp.arrayBuffer());
    } else {
      buffer = Buffer.from(audio.audioData, 'base64');
    }
    let extension = outMime === 'audio/mpeg' ? 'mp3' : outMime === 'audio/wav' ? 'wav' : 'audio';

    // Whisper handles PCM only via WAV wrapper.
    if (outMime === 'audio/pcm') {
      buffer = pcmToWavBuffer(buffer, 24000, 1);
      outMime = 'audio/wav';
      extension = 'wav';
    }

    // OpenAI Whisper limit: 25MB. Bail clearly if oversized.
    if (buffer.length > 25 * 1024 * 1024) {
      return res.status(413).json({
        error: `Audio is ${(buffer.length / 1024 / 1024).toFixed(1)}MB; OpenAI Whisper max is 25MB. Split or downsample first.`,
      });
    }

    console.log(`[Align] Sending ${(buffer.length / 1024 / 1024).toFixed(2)}MB ${outMime} to Whisper for ${lessonId}`);

    const form = new FormData();
    form.append('file', new Blob([buffer], { type: outMime }), `lesson.${extension}`);
    form.append('model', 'whisper-1');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: form,
    });

    if (!whisperRes.ok) {
      const errBody = await whisperRes.text().catch(() => '');
      console.error(`[Align] Whisper ${whisperRes.status}: ${errBody.substring(0, 300)}`);
      return res.status(502).json({ error: `Whisper API ${whisperRes.status}`, details: errBody.substring(0, 500) });
    }

    const transcription = await whisperRes.json() as any;
    const words: Array<{ word: string; start: number; end: number }> =
      Array.isArray(transcription.words)
        ? transcription.words.map((w: any) => ({ word: w.word, start: w.start, end: w.end }))
        : [];

    const elapsed = Date.now() - t0;
    console.log(`[Align] ${words.length} words from Whisper in ${elapsed}ms`);

    // Persist
    await db.update(lessonAudio)
      .set({ wordTimestamps: words, updatedAt: new Date() })
      .where(and(
        eq(lessonAudio.courseId, courseId),
        eq(lessonAudio.lessonId, lessonId)
      ));

    res.json({
      success: true,
      wordCount: words.length,
      elapsedMs: elapsed,
      audioMB: +(buffer.length / 1024 / 1024).toFixed(2),
      transcriptPreview: typeof transcription.text === 'string'
        ? transcription.text.slice(0, 200)
        : null,
    });
  } catch (error: any) {
    console.error("[Align] Error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to align audio" });
  }
});

// P0.1: Lightweight metadata + word timestamps for captions, without the audio bytes.
app.get("/api/courses/:courseId/lessons/:lessonId/audio/timestamps", requireAuth, async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;

    const [audio] = await db.select({
      mimeType: lessonAudio.mimeType,
      wordTimestamps: lessonAudio.wordTimestamps,
    })
      .from(lessonAudio)
      .where(and(
        eq(lessonAudio.courseId, courseId),
        eq(lessonAudio.lessonId, lessonId)
      ));

    if (!audio) {
      return res.status(404).json({ error: "Audio not found" });
    }

    res.json({
      mimeType: audio.mimeType || 'audio/mpeg',
      wordTimestamps: audio.wordTimestamps || []
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to get timestamps" });
  }
});

// Check if lesson has audio stored (for UI indicators)
app.get("/api/courses/:courseId/lessons/:lessonId/audio/exists", requireAuth, async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    
    const [audio] = await db.select({ id: lessonAudio.id })
      .from(lessonAudio)
      .where(and(
        eq(lessonAudio.courseId, courseId),
        eq(lessonAudio.lessonId, lessonId)
      ));
    
    res.json({ exists: !!audio });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to check audio" });
  }
});

// ============ LESSON IMAGES ROUTES ============

// Save images for a lesson (multiple visuals)
app.post("/api/courses/:courseId/lessons/:lessonId/images", requireRole("CREATOR"), async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    const { images } = req.body; // Array of { visualIndex, imageData, prompt }
    
    if (!images || !Array.isArray(images)) {
      return res.status(400).json({ error: "Images array required" });
    }
    
    console.log(`Saving ${images.length} images for course=${courseId}, lesson=${lessonId}`);
    
    for (const img of images) {
      const { visualIndex, imageData, prompt } = img;
      
      // Clean image data (strip data URL prefix if present)
      let cleanImageData = imageData;
      if (imageData.startsWith('data:')) {
        const parts = imageData.split(',');
        cleanImageData = parts.length > 1 ? parts[1] : imageData;
      }
      
      // Check for existing image at this index
      const existing = await db.select()
        .from(lessonImages)
        .where(and(
          eq(lessonImages.courseId, courseId),
          eq(lessonImages.lessonId, lessonId),
          eq(lessonImages.visualIndex, String(visualIndex))
        ));
      
      if (existing.length > 0) {
        await db.update(lessonImages)
          .set({ imageData: cleanImageData, prompt: prompt || null })
          .where(and(
            eq(lessonImages.courseId, courseId),
            eq(lessonImages.lessonId, lessonId),
            eq(lessonImages.visualIndex, String(visualIndex))
          ));
      } else {
        await db.insert(lessonImages).values({
          courseId,
          lessonId,
          visualIndex: String(visualIndex),
          imageData: cleanImageData,
          prompt: prompt || null
        });
      }
    }
    
    console.log(`Saved ${images.length} images for lesson ${lessonId}`);
    res.json({ success: true, count: images.length });
  } catch (error: any) {
    console.error("Save lesson images error:", error.message || error);
    res.status(500).json({ error: error.message || "Failed to save images" });
  }
});

// Get all images for a lesson
app.get("/api/courses/:courseId/lessons/:lessonId/images", requireAuth, async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    
    console.log(`[Get Images] Fetching images for course=${courseId}, lesson=${lessonId}`);
    
    const images = await db.select()
      .from(lessonImages)
      .where(and(
        eq(lessonImages.courseId, courseId),
        eq(lessonImages.lessonId, lessonId)
      ));
    
    console.log(`[Get Images] Found ${images.length} images in database`);
    
    // Convert to array format with data URL prefix (only if not already present)
    const result = images.map(img => {
      let imageData = img.imageData;
      // Only add prefix if not already present
      if (!imageData.startsWith('data:')) {
        imageData = `data:image/png;base64,${imageData}`;
      }
      return {
        visualIndex: parseInt(img.visualIndex),
        imageData,
        prompt: img.prompt
      };
    });
    
    // Calculate response size for debugging
    const jsonStr = JSON.stringify(result);
    const sizeMB = (jsonStr.length / (1024 * 1024)).toFixed(2);
    console.log(`[Get Images] Returning ${result.length} images, first visualIndex: ${result[0]?.visualIndex}, response size: ${sizeMB}MB`);
    
    res.json(result);
  } catch (error: any) {
    console.error("Get lesson images error:", error.message || error);
    res.status(500).json({ error: error.message || "Failed to get images" });
  }
});

// Get image metadata (indices only, no data) for lazy loading - MUST be before /:visualIndex
app.get("/api/courses/:courseId/lessons/:lessonId/images/metadata", requireAuth, async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    console.log(`[Get Metadata] Fetching for course=${courseId}, lesson=${lessonId}`);
    
    const images = await db.select({
      visualIndex: lessonImages.visualIndex,
      prompt: lessonImages.prompt
    })
      .from(lessonImages)
      .where(and(
        eq(lessonImages.courseId, courseId),
        eq(lessonImages.lessonId, lessonId)
      ));
    
    const result = images.map(img => ({
      visualIndex: parseInt(img.visualIndex),
      prompt: img.prompt
    }));
    
    console.log(`[Get Metadata] Found ${result.length} images`);
    res.json(result);
  } catch (error: any) {
    console.error("Get image metadata error:", error.message || error);
    res.status(500).json({ error: error.message || "Failed to get image metadata" });
  }
});

// Check if lesson has images stored - MUST be before /:visualIndex
app.get("/api/courses/:courseId/lessons/:lessonId/images/exists", requireAuth, async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    
    const images = await db.select({ id: lessonImages.id })
      .from(lessonImages)
      .where(and(
        eq(lessonImages.courseId, courseId),
        eq(lessonImages.lessonId, lessonId)
      ));
    
    res.json({ exists: images.length > 0, count: images.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to check images" });
  }
});

// Get a single image by visualIndex (for lazy loading) - MUST be after /metadata and /exists
app.get("/api/courses/:courseId/lessons/:lessonId/images/:visualIndex", requireAuth, async (req, res) => {
  try {
    const { courseId, lessonId, visualIndex } = req.params;
    console.log(`[Get Single Image] Fetching index ${visualIndex} for lesson ${lessonId}`);

    const images = await db.select()
      .from(lessonImages)
      .where(and(
        eq(lessonImages.courseId, courseId),
        eq(lessonImages.lessonId, lessonId),
        eq(lessonImages.visualIndex, visualIndex)
      ))
      .limit(1);

    if (images.length === 0) {
      return res.status(404).json({ error: "Image not found" });
    }

    let imageData = images[0].imageData;
    if (!imageData.startsWith('data:')) {
      imageData = `data:image/png;base64,${imageData}`;
    }

    console.log(`[Get Single Image] Found image, size: ${(imageData.length/1024).toFixed(0)}KB`);
    res.json({
      visualIndex: parseInt(images[0].visualIndex),
      imageData,
      prompt: images[0].prompt
    });
  } catch (error: any) {
    console.error("Get single image error:", error.message || error);
    res.status(500).json({ error: error.message || "Failed to get image" });
  }
});

// P2.2: Render a lesson's audio+image timeline into a single MP4 server-side using
// the bundled ffmpeg binary. Output goes straight into the lesson_videos table so
// students can stream a real <video> instead of running the live audio+image sync.
async function renderLessonToMp4(
  courseId: string,
  lessonId: string,
  opts: {
    sourceAudioCourseId?: string;
    sourceAudioLessonId?: string;
    sourceImagesCourseId?: string;
    sourceImagesLessonId?: string;
    visuals?: Array<{ visualIndex: number | string; startTime?: number; endTime?: number }>;
    durationSec?: number;
    width?: number;
    height?: number;
  } = {}
): Promise<{ mp4Buffer: Buffer; durationSec: number; imageCount: number }> {
  const audioCourse = opts.sourceAudioCourseId || courseId;
  const audioLesson = opts.sourceAudioLessonId || lessonId;
  const imagesCourse = opts.sourceImagesCourseId || courseId;
  const imagesLesson = opts.sourceImagesLessonId || lessonId;
  const width = opts.width || 1280;
  const height = opts.height || 720;

  const [audio] = await db.select()
    .from(lessonAudio)
    .where(and(eq(lessonAudio.courseId, audioCourse), eq(lessonAudio.lessonId, audioLesson)));
  if (!audio) throw new Error(`No audio for ${audioCourse}/${audioLesson}`);

  // P1.1: fetch from bucket if migrated, else decode inline base64.
  let audioBuf: Buffer;
  if ((audio as any).bucketPath) {
    const url = bucketPublicUrl((audio as any).bucketPath);
    if (!url) throw new Error('Cannot resolve audio bucket URL');
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Bucket fetch ${resp.status}`);
    audioBuf = Buffer.from(await resp.arrayBuffer());
  } else {
    audioBuf = Buffer.from(audio.audioData, 'base64');
  }
  let audioExt = audio.mimeType === 'audio/mpeg' ? 'mp3' : 'wav';
  if (audio.mimeType === 'audio/pcm') {
    audioBuf = pcmToWavBuffer(audioBuf, 24000, 1);
    audioExt = 'wav';
  }

  const imageRows = await db.select()
    .from(lessonImages)
    .where(and(eq(lessonImages.courseId, imagesCourse), eq(lessonImages.lessonId, imagesLesson)));
  if (imageRows.length === 0) throw new Error(`No images for ${imagesCourse}/${imagesLesson}`);

  imageRows.sort((a, b) => parseInt(a.visualIndex) - parseInt(b.visualIndex));

  const work = path.join(os.tmpdir(), `cm-render-${courseId.slice(0, 8)}-${Date.now()}`);
  fs.mkdirSync(work, { recursive: true });

  try {
    const audioPath = path.join(work, `audio.${audioExt}`);
    fs.writeFileSync(audioPath, audioBuf);

    const imageFiles: { path: string }[] = [];
    for (let i = 0; i < imageRows.length; i++) {
      const img = imageRows[i];
      let buf: Buffer;
      if ((img as any).bucketPath) {
        const url = bucketPublicUrl((img as any).bucketPath);
        if (!url) throw new Error('Cannot resolve image bucket URL');
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Bucket image fetch ${resp.status} for ${(img as any).bucketPath}`);
        buf = Buffer.from(await resp.arrayBuffer());
      } else {
        let raw = img.imageData;
        if (raw.startsWith('data:')) {
          const m = /^data:([^;]+);base64,(.+)$/.exec(raw);
          if (m) raw = m[2];
        }
        buf = Buffer.from(raw, 'base64');
      }
      let ext = 'png';
      if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) ext = 'jpg';
      const p = path.join(work, `img-${String(i).padStart(4, '0')}.${ext}`);
      fs.writeFileSync(p, buf);
      imageFiles.push({ path: p });
    }

    const visualTimings: Array<{ start: number; end: number }> = [];
    if (opts.visuals && opts.visuals.length > 0) {
      const sorted = [...opts.visuals].sort((a, b) =>
        parseInt(String(a.visualIndex)) - parseInt(String(b.visualIndex))
      );
      for (let i = 0; i < imageRows.length; i++) {
        const t = sorted[i] || sorted[sorted.length - 1];
        const start = typeof t.startTime === 'number' ? t.startTime : i * (opts.durationSec || 60) / imageRows.length;
        const end = typeof t.endTime === 'number' ? t.endTime : start + 5;
        visualTimings.push({ start, end });
      }
    } else {
      const total = opts.durationSec || imageRows.length * 5;
      const per = total / imageRows.length;
      for (let i = 0; i < imageRows.length; i++) {
        visualTimings.push({ start: i * per, end: (i + 1) * per });
      }
    }

    const concatLines: string[] = [];
    for (let i = 0; i < imageFiles.length; i++) {
      const t = visualTimings[i];
      const dur = Math.max(0.1, t.end - t.start);
      const escaped = imageFiles[i].path.replace(/\\/g, '/').replace(/'/g, "'\\''");
      concatLines.push(`file '${escaped}'`);
      concatLines.push(`duration ${dur.toFixed(3)}`);
    }
    {
      const escaped = imageFiles[imageFiles.length - 1].path.replace(/\\/g, '/').replace(/'/g, "'\\''");
      concatLines.push(`file '${escaped}'`);
    }
    const concatPath = path.join(work, 'concat.txt');
    fs.writeFileSync(concatPath, concatLines.join('\n'));

    const outPath = path.join(work, 'output.mp4');
    const ffmpegBin = (ffmpegPath as unknown as string) || 'ffmpeg';
    // P2.2 v2 — ultrafast preset + slightly higher CRF makes encoding ~3-5× faster
    // at the cost of ~30% larger files. Source images are static between transitions
    // so the encoder has very little real motion to compress; ultrafast still produces
    // an excellent visual result. r=15 caps frame rate (slideshows don't need 30fps).
    const args = [
      '-y',
      '-f', 'concat', '-safe', '0', '-i', concatPath,
      '-i', audioPath,
      '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`,
      '-r', '15',                    // 15 fps is plenty for a slideshow with held frames
      '-c:v', 'libx264',
      '-preset', 'ultrafast',        // was 'fast' — 3-5× faster encode
      '-tune', 'stillimage',         // optimize for static frames between transitions
      '-crf', '26',                  // was 23; 26 still looks great for slideshows
      '-c:a', 'aac',
      '-b:a', '96k',                 // was 128k; voice content fine at 96k
      '-shortest',
      '-movflags', '+faststart',     // critical: header at front so playback starts before download done
      outPath,
    ];

    console.log(`[Render MP4] Spawning ffmpeg for ${courseId}/${lessonId}: ${imageRows.length} images, ${(audioBuf.length / 1024 / 1024).toFixed(2)}MB audio`);
    const t0 = Date.now();
    await new Promise<void>((resolve, reject) => {
      const child = spawn(ffmpegBin, args, { windowsHide: true });
      let stderr = '';
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-1500)}`));
      });
    });

    const elapsed = Date.now() - t0;
    const mp4Buffer = fs.readFileSync(outPath);
    console.log(`[Render MP4] Done in ${elapsed}ms; ${(mp4Buffer.length / 1024 / 1024).toFixed(2)}MB`);

    const finalDur = visualTimings[visualTimings.length - 1]?.end || 0;
    return { mp4Buffer, durationSec: finalDur, imageCount: imageRows.length };
  } finally {
    try {
      const files = fs.readdirSync(work);
      for (const f of files) fs.unlinkSync(path.join(work, f));
      fs.rmdirSync(work);
    } catch (e) { console.warn('cleanup failed:', e); }
  }
}

app.post("/api/courses/:courseId/lessons/:lessonId/render-mp4", requireRole("CREATOR"), async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    let {
      visuals,
      durationSec,
      sourceAudioCourseId,
      sourceAudioLessonId,
      sourceImagesCourseId,
      sourceImagesLessonId,
      width,
      height,
    } = req.body || {};

    // If the client didn't send visual timings, look them up from courses.data so the
    // resulting MP4 honors the real audio-driven timing.
    if (!visuals || !Array.isArray(visuals) || visuals.length === 0) {
      const [courseRow] = await db.select().from(courses).where(eq(courses.id, courseId));
      const data: any = courseRow?.data;
      if (data?.modules) {
        outer: for (const m of data.modules) {
          for (const l of (m.lessons || [])) {
            if (l?.id === lessonId) {
              const arr = (l.visuals || []) as any[];
              visuals = arr.map((v, i) => ({
                visualIndex: i,
                startTime: typeof v.startTime === 'number' ? v.startTime : 0,
                endTime: typeof v.endTime === 'number' ? v.endTime : 0,
              }));
              if (typeof l.durationSeconds === 'number' && !durationSec) durationSec = l.durationSeconds;
              // Source overrides for composite lessons
              if (!sourceAudioCourseId && l.sourceVideoId) sourceAudioCourseId = l.sourceVideoId;
              if (!sourceAudioLessonId && l.sourceLessonId) sourceAudioLessonId = l.sourceLessonId;
              if (!sourceImagesCourseId && l.sourceVideoId) sourceImagesCourseId = l.sourceVideoId;
              if (!sourceImagesLessonId && l.sourceLessonId) sourceImagesLessonId = l.sourceLessonId;
              break outer;
            }
          }
        }
      }
    }

    const result = await renderLessonToMp4(courseId, lessonId, {
      visuals, durationSec,
      sourceAudioCourseId, sourceAudioLessonId,
      sourceImagesCourseId, sourceImagesLessonId,
      width, height,
    });

    // Try to upload directly to Supabase Storage. If it fits and succeeds, store
    // bucket_path and skip the giant base64 in lesson_videos.video_data.
    let bucketPath: string | null = null;
    let storedAsBase64 = false;
    const sbStorage = getSupabaseStorage();
    if (sbStorage && result.mp4Buffer.length <= STORAGE_FILE_LIMIT) {
      const path = `${courseId}/${lessonId}/video.mp4`;
      const { error: uerr } = await sbStorage.storage
        .from(STORAGE_BUCKET)
        .upload(path, result.mp4Buffer, { contentType: 'video/mp4', upsert: true, cacheControl: '86400' });
      if (uerr) {
        console.warn("[Render MP4] Bucket upload failed; falling back to inline base64:", uerr.message);
      } else {
        bucketPath = path;
        console.log(`[Render MP4] Uploaded to bucket: ${path}`);
      }
    }

    const base64 = bucketPath ? '' : result.mp4Buffer.toString('base64');
    if (!bucketPath) storedAsBase64 = true;

    const existing = await db.select({ id: lessonVideos.id })
      .from(lessonVideos)
      .where(and(eq(lessonVideos.courseId, courseId), eq(lessonVideos.lessonId, lessonId)));
    if (existing.length > 0) {
      await db.update(lessonVideos)
        .set({ videoData: base64, bucketPath, mimeType: 'video/mp4', updatedAt: new Date() })
        .where(eq(lessonVideos.id, existing[0].id));
    } else {
      await db.insert(lessonVideos).values({
        courseId, lessonId, videoData: base64, bucketPath, mimeType: 'video/mp4',
      });
    }

    // Mark hasRenderedVideoInDb on the lesson inside courses.data so the list endpoint
    // surfaces it and the player switches to <video src=>.
    const [courseRow] = await db.select().from(courses).where(eq(courses.id, courseId));
    if (courseRow?.data) {
      const data: any = courseRow.data;
      let touched = false;
      for (const m of (data.modules || [])) {
        for (const l of (m.lessons || [])) {
          if (l?.id === lessonId) {
            l.hasRenderedVideoInDb = true;
            // Clear any stale inline renderedVideoUrl to avoid bloat
            if (l.renderedVideoUrl && l.renderedVideoUrl.startsWith('data:')) l.renderedVideoUrl = '';
            touched = true;
          }
        }
      }
      if (touched) {
        await db.update(courses)
          .set({ data, updatedAt: new Date() })
          .where(eq(courses.id, courseId));
      }
    }

    invalidateCourseListCache();

    res.json({
      success: true,
      mp4Bytes: result.mp4Buffer.length,
      mp4MB: +(result.mp4Buffer.length / 1024 / 1024).toFixed(2),
      durationSec: result.durationSec,
      imageCount: result.imageCount,
      storedTo: bucketPath ? 'bucket' : 'database',
      bucketPath,
    });
  } catch (error: any) {
    console.error("[Render MP4] Error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to render MP4" });
  }
});

// ============ LESSON VIDEO (P0.4) ============

// Save rendered video (base64) to its own table — keeps course JSON small.
app.put("/api/courses/:courseId/lessons/:lessonId/video", requireRole("CREATOR"), async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    const { videoData, mimeType } = req.body;
    if (!videoData) return res.status(400).json({ error: "videoData required" });

    // If client sent a data URL, strip the prefix so we store pure base64 + mime separately
    let cleanBase64 = videoData;
    let detectedMime = mimeType || 'video/webm';
    if (videoData.startsWith('data:')) {
      const m = /^data:([^;]+);base64,(.+)$/.exec(videoData);
      if (m) {
        detectedMime = mimeType || m[1];
        cleanBase64 = m[2];
      }
    }

    const [existing] = await db.select({ id: lessonVideos.id })
      .from(lessonVideos)
      .where(and(eq(lessonVideos.courseId, courseId), eq(lessonVideos.lessonId, lessonId)));

    if (existing) {
      await db.update(lessonVideos)
        .set({ videoData: cleanBase64, mimeType: detectedMime, updatedAt: new Date() })
        .where(eq(lessonVideos.id, existing.id));
    } else {
      await db.insert(lessonVideos).values({
        courseId, lessonId, videoData: cleanBase64, mimeType: detectedMime,
      });
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error("Save lesson video error:", error.message || error);
    res.status(500).json({ error: error.message || "Failed to save video" });
  }
});

// Stream rendered video as raw bytes for <video src=...>
app.get("/api/courses/:courseId/lessons/:lessonId/video/stream", requireAuthMedia, async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    const [video] = await db.select()
      .from(lessonVideos)
      .where(and(eq(lessonVideos.courseId, courseId), eq(lessonVideos.lessonId, lessonId)));

    if (!video) return res.status(404).send("Video not found");

    // P1.1: redirect to bucket if migrated.
    if ((video as any).bucketPath) {
      const url = bucketPublicUrl((video as any).bucketPath);
      if (url) {
        res.setHeader('Cache-Control', 'private, max-age=86400');
        return res.redirect(302, url);
      }
    }

    // P1.1 ETag — keyed by row id + size + updatedAt.
    const etag = makeETag(['video', video.id, video.videoData.length, video.updatedAt]);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    if (maybeNotModified(req, res, etag)) return;

    const buffer = Buffer.from(video.videoData, 'base64');
    const mimeType = video.mimeType || 'video/webm';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=3600');

    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : buffer.length - 1;
        if (start < buffer.length && end >= start && end < buffer.length) {
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${buffer.length}`);
          res.setHeader('Content-Length', String(end - start + 1));
          return res.end(buffer.subarray(start, end + 1));
        }
      }
    }
    res.end(buffer);
  } catch (error: any) {
    console.error("Stream lesson video error:", error.message || error);
    res.status(500).send("Failed to stream video");
  }
});

app.get("/api/courses/:courseId/lessons/:lessonId/video/exists", requireAuth, async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    const [video] = await db.select({ id: lessonVideos.id })
      .from(lessonVideos)
      .where(and(eq(lessonVideos.courseId, courseId), eq(lessonVideos.lessonId, lessonId)));
    res.json({ exists: !!video });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to check video" });
  }
});

// P0.2: Stream a single image as raw PNG/JPG bytes so <img src=...> can load it
// natively, off-thread, with browser-managed cache. Must be after /metadata and /exists.
app.get("/api/courses/:courseId/lessons/:lessonId/images/:visualIndex/stream", requireAuthMedia, async (req, res) => {
  try {
    const { courseId, lessonId, visualIndex } = req.params;

    const images = await db.select()
      .from(lessonImages)
      .where(and(
        eq(lessonImages.courseId, courseId),
        eq(lessonImages.lessonId, lessonId),
        eq(lessonImages.visualIndex, visualIndex)
      ))
      .limit(1);

    if (images.length === 0) {
      return res.status(404).send("Image not found");
    }

    // P1.1: redirect to bucket if migrated.
    if ((images[0] as any).bucketPath) {
      const url = bucketPublicUrl((images[0] as any).bucketPath);
      if (url) {
        res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
        return res.redirect(302, url);
      }
    }

    // P1.1 ETag — image content is keyed by its row id (immutable per visualIndex).
    const etag = makeETag(['img', images[0].id, images[0].imageData.length]);
    res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    if (maybeNotModified(req, res, etag)) return;

    let raw = images[0].imageData;
    let mimeType: string | null = null;
    // If stored as full data URL, peel off the prefix and remember the type.
    if (raw.startsWith('data:')) {
      const m = /^data:([^;]+);base64,(.+)$/.exec(raw);
      if (m) {
        mimeType = m[1];
        raw = m[2];
      } else {
        const comma = raw.indexOf(',');
        if (comma > 0) raw = raw.slice(comma + 1);
      }
    }

    const buffer = Buffer.from(raw, 'base64');

    // Sniff the magic bytes if we don't have an explicit mime type.
    if (!mimeType) {
      if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        mimeType = 'image/png';
      } else if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        mimeType = 'image/jpeg';
      } else if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
        mimeType = 'image/webp';
      } else if (buffer.length >= 6 && buffer.toString('ascii', 0, 6).startsWith('GIF8')) {
        mimeType = 'image/gif';
      } else {
        mimeType = 'image/png'; // safe default
      }
    }
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(buffer.length));
    // Aggressive cache — image bytes never change for a given (course, lesson, visualIndex).
    res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    res.end(buffer);
  } catch (error: any) {
    console.error("Stream single image error:", error.message || error);
    res.status(500).send("Failed to stream image");
  }
});

// ============ ADMIN/MAINTENANCE ROUTES ============

// Recalculate visual timing from word timestamps
app.post("/api/admin/fix-lesson-timing", requireRole("CREATOR"), async (req, res) => {
  try {
    const { courseId, lessonId } = req.body;
    
    if (!courseId || !lessonId) {
      return res.status(400).json({ error: "Missing courseId or lessonId" });
    }
    
    console.log(`[Fix Timing] Starting for course=${courseId}, lesson=${lessonId}`);
    
    // Step 1: Get the audio with word timestamps
    const audioRows = await db.select()
      .from(lessonAudio)
      .where(and(
        eq(lessonAudio.courseId, courseId),
        eq(lessonAudio.lessonId, lessonId)
      ));
    
    if (audioRows.length === 0) {
      return res.status(404).json({ error: "No audio found for this lesson" });
    }
    
    const audio = audioRows[0];
    const wordTimestamps = audio.wordTimestamps || [];
    
    console.log(`[Fix Timing] Found ${wordTimestamps.length} word timestamps`);
    
    // Step 2: Get the course to access lesson visuals
    const courseRows = await db.select().from(courses).where(eq(courses.id, courseId));
    if (courseRows.length === 0) {
      return res.status(404).json({ error: "Course not found" });
    }
    
    const course = courseRows[0].data as any;
    
    // Find the lesson
    let lesson: any = null;
    let moduleIdx = -1;
    let lessonIdx = -1;
    
    for (let m = 0; m < course.modules.length; m++) {
      for (let l = 0; l < course.modules[m].lessons.length; l++) {
        if (course.modules[m].lessons[l].id === lessonId) {
          lesson = course.modules[m].lessons[l];
          moduleIdx = m;
          lessonIdx = l;
          break;
        }
      }
      if (lesson) break;
    }
    
    if (!lesson || !lesson.visuals || lesson.visuals.length === 0) {
      return res.status(404).json({ error: "Lesson or visuals not found" });
    }
    
    console.log(`[Fix Timing] Found lesson with ${lesson.visuals.length} visuals`);
    
    // Step 3: Calculate timing for each visual based on word timestamps
    // Strategy: Each visual has scriptText - find matching words and use their timestamps
    const updatedVisuals = [];
    let lastEndTime = 0;
    
    for (let i = 0; i < lesson.visuals.length; i++) {
      const visual = lesson.visuals[i];
      const scriptText = (visual.scriptText || "").toLowerCase().trim();
      
      if (!scriptText) {
        // No script - give it a fair share of remaining time
        const remainingTime = (wordTimestamps[wordTimestamps.length - 1]?.end || 60) - lastEndTime;
        const remainingVisuals = lesson.visuals.length - i;
        const duration = remainingTime / remainingVisuals;
        
        updatedVisuals.push({
          ...visual,
          startTime: lastEndTime,
          endTime: lastEndTime + duration
        });
        lastEndTime = lastEndTime + duration;
        continue;
      }
      
      // Find the first word of this visual's script in the word timestamps
      const scriptWords = scriptText.split(/\s+/).filter(w => w.length > 2);
      const firstScriptWord = scriptWords[0]?.toLowerCase();
      const lastScriptWord = scriptWords[scriptWords.length - 1]?.toLowerCase();
      
      // Find start time - look for first word match after lastEndTime
      let startTime = lastEndTime;
      let endTime = lastEndTime + 10; // Default 10 seconds if no match
      
      for (let w = 0; w < wordTimestamps.length; w++) {
        const wt = wordTimestamps[w];
        if (wt.start < lastEndTime) continue; // Skip words we've already passed
        
        const wordLower = wt.word.toLowerCase().replace(/[^a-z]/g, '');
        if (wordLower === firstScriptWord || scriptText.includes(wordLower)) {
          startTime = wt.start;
          break;
        }
      }
      
      // Find end time - look for last word of this section
      for (let w = wordTimestamps.length - 1; w >= 0; w--) {
        const wt = wordTimestamps[w];
        if (wt.end <= startTime) continue; // Skip words before start
        
        const wordLower = wt.word.toLowerCase().replace(/[^a-z]/g, '');
        // Check if this word is in the script OR if we're at the next visual's script
        if (wordLower === lastScriptWord) {
          endTime = wt.end;
          break;
        }
        
        // If this is the last visual, use the last word timestamp
        if (i === lesson.visuals.length - 1) {
          endTime = wordTimestamps[wordTimestamps.length - 1].end;
          break;
        }
        
        // Look ahead to see if the next visual's script starts
        if (i + 1 < lesson.visuals.length) {
          const nextScript = (lesson.visuals[i + 1].scriptText || "").toLowerCase();
          const nextFirstWord = nextScript.split(/\s+/).filter(w => w.length > 2)[0]?.toLowerCase();
          if (nextFirstWord && wt.word.toLowerCase().replace(/[^a-z]/g, '') === nextFirstWord) {
            // Found the start of next section - use the previous word's end
            if (w > 0) {
              endTime = wordTimestamps[w - 1].end;
            }
            break;
          }
        }
      }
      
      // Make sure we don't go backwards
      if (startTime < lastEndTime) startTime = lastEndTime;
      if (endTime <= startTime) endTime = startTime + 5;
      
      updatedVisuals.push({
        ...visual,
        startTime,
        endTime
      });
      
      lastEndTime = endTime;
      console.log(`[Fix Timing] Visual ${i}: ${startTime.toFixed(1)}s - ${endTime.toFixed(1)}s`);
    }
    
    // Step 4: Update the course with new timing
    course.modules[moduleIdx].lessons[lessonIdx].visuals = updatedVisuals;
    
    await db.update(courses)
      .set({ data: course })
      .where(eq(courses.id, courseId));
    
    console.log(`[Fix Timing] Complete! Updated ${updatedVisuals.length} visuals`);
    
    res.json({ 
      success: true, 
      visualsUpdated: updatedVisuals.length,
      timing: updatedVisuals.map((v, i) => ({ index: i, start: v.startTime, end: v.endTime }))
    });
  } catch (error: any) {
    console.error("[Fix Timing] Error:", error.message || error);
    res.status(500).json({ error: error.message || "Failed to fix timing" });
  }
});

// Fix lesson images - delete extras and renumber to 0-based indices
app.post("/api/admin/fix-lesson-images", requireRole("CREATOR"), async (req, res) => {
  try {
    const { courseId, lessonId, keepCount } = req.body;
    
    if (!courseId || !lessonId || !keepCount) {
      return res.status(400).json({ error: "Missing courseId, lessonId, or keepCount" });
    }
    
    console.log(`[Fix Images] Starting fix for course=${courseId}, lesson=${lessonId}, keeping ${keepCount} images`);
    
    // Step 1: Get all images sorted by visualIndex
    const allImages = await db.select()
      .from(lessonImages)
      .where(and(
        eq(lessonImages.courseId, courseId),
        eq(lessonImages.lessonId, lessonId)
      ));
    
    console.log(`[Fix Images] Found ${allImages.length} total images`);
    
    // Sort by visualIndex numerically
    const sortedImages = [...allImages].sort((a, b) => {
      const aIdx = parseInt(a.visualIndex) || 0;
      const bIdx = parseInt(b.visualIndex) || 0;
      return aIdx - bIdx;
    });
    
    // Step 2: Identify images to keep (first N) and delete (rest)
    const imagesToKeep = sortedImages.slice(0, keepCount);
    const imagesToDelete = sortedImages.slice(keepCount);
    
    console.log(`[Fix Images] Keeping ${imagesToKeep.length} images, deleting ${imagesToDelete.length}`);
    
    // Step 3: Delete the extra images
    for (const img of imagesToDelete) {
      await db.delete(lessonImages).where(eq(lessonImages.id, img.id));
      console.log(`[Fix Images] Deleted image with visualIndex ${img.visualIndex}`);
    }
    
    // Step 4: Renumber the remaining images to 0-based indices
    for (let i = 0; i < imagesToKeep.length; i++) {
      const img = imagesToKeep[i];
      const oldIndex = img.visualIndex;
      const newIndex = i.toString();
      
      if (oldIndex !== newIndex) {
        await db.update(lessonImages)
          .set({ visualIndex: newIndex })
          .where(eq(lessonImages.id, img.id));
        console.log(`[Fix Images] Renumbered ${oldIndex} -> ${newIndex}`);
      }
    }
    
    console.log(`[Fix Images] Complete! Now have ${imagesToKeep.length} images numbered 0-${imagesToKeep.length - 1}`);
    
    res.json({ 
      success: true, 
      deleted: imagesToDelete.length,
      kept: imagesToKeep.length,
      message: `Fixed images: deleted ${imagesToDelete.length}, kept and renumbered ${imagesToKeep.length}`
    });
  } catch (error: any) {
    console.error("[Fix Images] Error:", error.message || error);
    res.status(500).json({ error: error.message || "Failed to fix images" });
  }
});

// ============ AUTH ROUTES ============

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const [user] = await db.select().from(users).where(eq(users.email, email));

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const { password: _, ...userWithoutPassword } = user;
    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    res.json({ user: userWithoutPassword, token });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, avatarUrl, phone, city, state } = req.body;

    const existing = await db.select().from(users).where(eq(users.email, email));
    if (existing.length > 0) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [newUser] = await db.insert(users).values({
      name,
      email,
      password: hashedPassword,
      role: "STUDENT", // Public registration always creates STUDENT — never trust client-supplied role
      avatarUrl: avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
      phone,
      city,
      state,
      assignedCourseIds: [],
    }).returning();

    const { password: _, ...userWithoutPassword } = newUser;
    const token = signToken({ userId: newUser.id, email: newUser.email, role: newUser.role });
    res.json({ user: userWithoutPassword, token });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Lookup current user from token — useful for client to validate session on reload
app.get("/api/auth/me", requireAuth, async (req, res) => {
  const auth = (req as any).auth;
  const [user] = await db.select().from(users).where(eq(users.id, auth.userId));
  if (!user) return res.status(404).json({ error: "User not found" });
  const { password: _, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
});

// ============ USERS ROUTES ============

app.get("/api/users", requireRole("CREATOR"), async (req, res) => {
  try {
    const allUsers = await db.select().from(users);
    const usersWithoutPasswords = allUsers.map(({ password, ...rest }) => rest);
    res.json(usersWithoutPasswords);
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ error: "Failed to get users" });
  }
});

app.get("/api/users/:id", requireSelfOrRole("id", "CREATOR"), async (req, res) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.params.id));
    if (!user) return res.status(404).json({ error: "User not found" });
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    res.status(500).json({ error: "Failed to get user" });
  }
});

app.put("/api/users/:id", requireSelfOrRole("id", "CREATOR"), async (req, res) => {
  try {
    const auth = (req as any).auth;
    const isCreator = auth.role === "CREATOR";
    const { name, email, password, avatarUrl, phone, city, state, assignedCourseIds } = req.body;

    // Self-edits cannot change role or course assignments — only CREATORs can
    const updateData: any = { name, email, avatarUrl, phone, city, state };
    if (isCreator && assignedCourseIds !== undefined) {
      updateData.assignedCourseIds = assignedCourseIds;
    }

    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const [updated] = await db.update(users)
      .set(updateData)
      .where(eq(users.id, req.params.id))
      .returning();

    if (!updated) return res.status(404).json({ error: "User not found" });
    const { password: _, ...userWithoutPassword } = updated;
    res.json(userWithoutPassword);
  } catch (error) {
    res.status(500).json({ error: "Failed to update user" });
  }
});

app.delete("/api/users/:id", requireRole("CREATOR"), async (req, res) => {
  try {
    await db.delete(users).where(eq(users.id, req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// ============ COURSES ROUTES ============

// In-memory cache for the lightweight course list. Course mutations bust this on save.
// TTL is short enough (30s) that stale data is rare; long enough to absorb dashboard refreshes.
let courseListCache: { payload: any[]; expiresAt: number } | null = null;
const COURSE_LIST_TTL_MS = 30_000;

function invalidateCourseListCache() {
  courseListCache = null;
}

app.get("/api/courses", requireAuth, async (req, res) => {
  // Don't let intermediaries cache (auth-bound). The browser may use it briefly via the
  // ETag-style flow if we add one later; for now, the server-side cache below is the win.
  res.setHeader('Cache-Control', 'private, max-age=10');

  // Server-side cache hit — short-circuit DB entirely.
  const now = Date.now();
  if (courseListCache && courseListCache.expiresAt > now) {
    const ageMs = COURSE_LIST_TTL_MS - (courseListCache.expiresAt - now);
    res.setHeader('X-Cache', `HIT age=${ageMs}ms`);
    return res.json(courseListCache.payload);
  }

  console.log("GET /api/courses - Cache miss, querying DB...");
  
  const isConnectionError = (error: any): boolean => {
    const msg = error?.message || '';
    const code = error?.code || '';
    const causeMsg = error?.cause?.message || '';
    const causeCode = error?.cause?.code || '';
    return msg.includes('CONNECTION') || code.includes('CONNECTION') || 
           causeMsg.includes('CONNECTION') || causeCode.includes('CONNECTION') ||
           msg.includes('57P02') || code === '57P02';
  };
  
  const fetchCourses = async (attempt = 1): Promise<any[]> => {
    try {
      const tStart = Date.now();
      // Bypass drizzle's execute() and go straight through postgres-js — the same path
      // benchmarked at 246ms vs ~1.7s through drizzle.execute. SQL builds the lightweight
      // modules array server-side; we never ship inline base64 audio/image bytes.
      const sqlClient = getRawSql();
      const rows = await sqlClient`
        SELECT
          id,
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          data->>'id'                     AS d_id,
          data->>'type'                   AS d_type,
          data->>'title'                  AS d_title,
          data->>'headline'               AS d_headline,
          LEFT(data->>'description', 500) AS d_description,
          data->>'ecoverUrl'              AS d_ecover_url,
          data->>'status'                 AS d_status,
          (data->>'totalStudents')::int   AS d_total_students,
          (data->>'rating')::float        AS d_rating,
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', m->>'id',
                'title', m->>'title',
                'lessons', (
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id', l->>'id',
                      'title', l->>'title',
                      'status', l->>'status',
                      'voice', l->>'voice',
                      'duration', l->>'duration',
                      'hostedVideoUrl', l->>'hostedVideoUrl',
                      'videoUrl', l->>'videoUrl',
                      'countsTowardCertificate', COALESCE((l->>'countsTowardCertificate')::boolean, false),
                      'visualCount', jsonb_array_length(COALESCE(l->'visuals', '[]'::jsonb)),
                      'hasAudio', (l->>'audioData' IS NOT NULL AND length(l->>'audioData') > 100),
                      'hasAudioInDb', COALESCE((l->>'hasAudioInDb')::boolean, false),
                      'hasImagesInDb', COALESCE((l->>'hasImagesInDb')::boolean, false),
                      'hasRenderedVideo', ((l->>'renderedVideoUrl' IS NOT NULL AND length(l->>'renderedVideoUrl') > 0)
                                          OR COALESCE((l->>'hasRenderedVideoInDb')::boolean, false)),
                      'hasRenderedVideoInDb', COALESCE((l->>'hasRenderedVideoInDb')::boolean, false)
                    )
                  )
                  FROM jsonb_array_elements(COALESCE(m->'lessons', '[]'::jsonb)) l
                )
              )
            )
            FROM jsonb_array_elements(COALESCE(data->'modules', '[]'::jsonb)) m
          )                               AS d_modules
        FROM courses
      `;
      console.log(`Courses lightweight SELECT: ${Date.now() - tStart}ms (${rows.length} rows)`);
      return rows as any[];
    } catch (error: any) {
      console.error(`Get courses error (attempt ${attempt}):`, error?.message || error);
      if (attempt < 4 && isConnectionError(error)) {
        console.log("Connection error detected, reconnecting to database...");
        const { reconnectDb } = await import('./db');
        await reconnectDb();
        await new Promise(r => setTimeout(r, 1000 * attempt));
        return fetchCourses(attempt + 1);
      }
      throw error;
    }
  };

  try {
    const tBegin = Date.now();
    const rows = await fetchCourses();

    const coursesData = rows.map((c: any) => {
      // c.d_modules is already the lightweight shape (built by SQL).
      const lightModules = Array.isArray(c.d_modules) ? c.d_modules : [];

      const coverUrl = c.d_ecover_url || '';
      const hasCoverInDb = coverUrl.startsWith('data:') || coverUrl.length > 1000;
      const safeEcoverUrl = hasCoverInDb ? '' : coverUrl;

      return {
        id: c.d_id || c.id,
        type: c.d_type || 'course',
        title: c.d_title || 'Untitled',
        headline: c.d_headline || '',
        description: c.d_description || '',
        ecoverUrl: safeEcoverUrl,
        hasCover: hasCoverInDb || !!safeEcoverUrl,
        hasCoverInDb,
        status: c.d_status || 'DRAFT',
        totalStudents: c.d_total_students || 0,
        rating: c.d_rating || 0,
        modules: lightModules,
        _dbId: c.id,
        _hasFullData: false,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });

    const responseSize = JSON.stringify(coursesData).length;
    console.log(`GET /api/courses total: ${Date.now() - tBegin}ms, ${coursesData.length} courses, ${(responseSize / 1024).toFixed(1)}KB`);

    // Populate cache for subsequent requests within the TTL window.
    courseListCache = { payload: coursesData, expiresAt: Date.now() + COURSE_LIST_TTL_MS };
    res.setHeader('X-Cache', 'MISS');
    res.json(coursesData);
  } catch (error: any) {
    console.error("Get courses failed after retries:", error?.message || error);
    res.status(500).json({ error: "Failed to get courses" });
  }
});

// IMPORTANT: literal-path routes must come BEFORE /api/courses/:id, otherwise Express
// matches `:id` to "export-all" and the request hits the wrong handler.
// P1.3: Streaming ZIP exports via archiver — TTFB drops from "wait for full buffer"
// to <100ms; supports arbitrarily large exports without buffering in memory.
app.get("/api/courses/export-all", requireRole("CREATOR"), async (req, res) => {
  try {
    console.log("Starting streaming export of all courses...");
    const allCourses = await db.select().from(courses);

    if (allCourses.length === 0) {
      return res.status(404).json({ error: "No courses to export" });
    }

    const filename = `all_courses_backup_${new Date().toISOString().slice(0, 10)}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', (err) => console.warn('archiver warning:', err));
    archive.on('error', (err) => {
      console.error('archiver error:', err);
      try { res.status(500).end(); } catch { /* already sent */ }
    });
    archive.pipe(res);

    const coursesData = allCourses.map(c => c.data);
    archive.append(JSON.stringify(coursesData, null, 2), { name: 'courses.json' });

    for (const course of allCourses) {
      const courseData = course.data as any;
      const safeTitle = (courseData.title || 'course').replace(/[^a-z0-9]/gi, '_');
      archive.append(
        JSON.stringify(courseData, null, 2),
        { name: `individual_courses/${safeTitle}.json` }
      );
    }

    await archive.finalize();
    console.log(`Streaming export finalized: ${allCourses.length} courses`);
  } catch (error: any) {
    console.error("Export error:", error?.message || error);
    if (!res.headersSent) {
      res.status(500).json({ error: error?.message || "Failed to export courses" });
    } else {
      res.end();
    }
  }
});

app.get("/api/courses/:id/export", requireRole("CREATOR"), async (req, res) => {
  try {
    const [course] = await db.select().from(courses).where(eq(courses.id, req.params.id));
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    const courseData = course.data as any;
    const safeTitle = (courseData.title || 'course').replace(/[^a-z0-9]/gi, '_');
    const filename = `${safeTitle}_export.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', (err) => console.warn('archiver warning:', err));
    archive.on('error', (err) => {
      console.error('archiver error:', err);
      try { res.status(500).end(); } catch { /* already sent */ }
    });
    archive.pipe(res);

    const { modules, ...metadata } = courseData;
    archive.append(JSON.stringify(metadata, null, 2), { name: 'course_metadata.json' });

    if (modules && Array.isArray(modules)) {
      modules.forEach((mod: any, idx: number) => {
        archive.append(
          JSON.stringify(mod, null, 2),
          { name: `modules/module_${idx}_${mod.id || idx}.json` }
        );
      });
    }

    await archive.finalize();
    console.log(`Streaming export finalized: ${courseData.title}`);
  } catch (error: any) {
    console.error("Export error:", error?.message || error);
    if (!res.headersSent) {
      res.status(500).json({ error: error?.message || "Failed to export course" });
    } else {
      res.end();
    }
  }
});

app.get("/api/courses/:id", requireAuth, async (req, res) => {
  try {
    const [course] = await db.select().from(courses).where(eq(courses.id, req.params.id));
    if (!course) return res.status(404).json({ error: "Course not found" });
    res.json({ ...course.data as any, _dbId: course.id });
  } catch (error: any) {
    console.error("Get course error:", error.message || error);
    res.status(500).json({ error: "Failed to get course" });
  }
});

// Endpoint to fetch cover image on demand (avoids bloating course list)
app.get("/api/courses/:id/cover", requireAuth, async (req, res) => {
  try {
    const [course] = await db.select().from(courses).where(eq(courses.id, req.params.id));
    if (!course) return res.status(404).json({ error: "Course not found" });
    
    const data = course.data as any;
    const ecoverUrl = data?.ecoverUrl || '';
    
    if (!ecoverUrl) {
      return res.status(404).json({ error: "No cover image" });
    }
    
    res.json({ ecoverUrl });
  } catch (error) {
    res.status(500).json({ error: "Failed to get cover" });
  }
});

app.post("/api/courses", requireRole("CREATOR"), async (req, res) => {
  try {
    const courseData = req.body;
    console.log("Creating course with data:", { id: courseData.id, title: courseData.title });
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isValidUUID = courseData.id && uuidRegex.test(courseData.id);
    const dbId = isValidUUID ? courseData.id : crypto.randomUUID();
    console.log("Using UUID:", dbId, "Original was valid:", isValidUUID);
    
    // Extract media to files before storing
    const extractedData = await extractMediaFromCourse({ ...courseData, id: dbId });
    
    const [newCourse] = await db.insert(courses).values({
      id: dbId,
      data: extractedData,
    }).returning();
    invalidateCourseListCache();
    console.log("Course created successfully:", newCourse.id);
    res.json({ ...newCourse.data as object, _dbId: newCourse.id });
  } catch (error: any) {
    console.error("Create course error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to create course" });
  }
});

app.put("/api/courses/:id", requireRole("CREATOR"), async (req, res) => {
  try {
    const courseData = req.body;
    console.log(`PUT /api/courses/${req.params.id} - Starting update`);
    
    // Extract media to files before storing
    const extractedData = await extractMediaFromCourse(courseData);
    console.log(`PUT /api/courses/${req.params.id} - Media extraction complete`);
    
    const [updated] = await db.update(courses)
      .set({ data: extractedData, updatedAt: new Date() })
      .where(eq(courses.id, req.params.id))
      .returning();
    
    if (!updated) {
      console.log(`PUT /api/courses/${req.params.id} - Course not found`);
      return res.status(404).json({ error: "Course not found" });
    }
    invalidateCourseListCache();
    console.log(`PUT /api/courses/${req.params.id} - Update successful`);
    res.json({ ...updated.data as object, _dbId: updated.id });
  } catch (error: any) {
    console.error(`PUT /api/courses/${req.params.id} - Error:`, error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to update course" });
  }
});

app.delete("/api/courses/:id", requireRole("CREATOR"), async (req, res) => {
  try {
    await db.delete(courses).where(eq(courses.id, req.params.id));
    invalidateCourseListCache();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete course" });
  }
});

// ============ COURSE UPLOAD (Server-side ZIP processing) ============

app.post("/api/courses/upload", requireRole("CREATOR"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    console.log("Processing uploaded course ZIP:", req.file.originalname, "Size:", req.file.size);

    const zip = await JSZip.loadAsync(req.file.buffer);
    
    // Check if it's a single course or master backup
    const coursesFile = zip.file("courses.json");
    
    if (coursesFile) {
      // Master backup format
      console.log("Detected master backup format");
      const coursesContent = await coursesFile.async("string");
      const coursesData = JSON.parse(coursesContent);
      
      const savedCourses = [];
      for (const courseData of coursesData) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const isValidUUID = courseData.id && uuidRegex.test(courseData.id);
        const dbId = isValidUUID ? courseData.id : crypto.randomUUID();
        
        // Extract media to files before storing
        const extractedData = await extractMediaFromCourse({ ...courseData, id: dbId });
        
        // Upsert - delete existing then insert
        await db.delete(courses).where(eq(courses.id, dbId));
        const [newCourse] = await db.insert(courses).values({
          id: dbId,
          data: extractedData,
        }).returning();
        
        savedCourses.push({ ...newCourse.data as object, _dbId: newCourse.id });
        console.log("Saved course:", courseData.title);
      }
      
      // Also extract settings if present
      let settings = null;
      const settingsFile = zip.file("settings.json");
      if (settingsFile) {
        const settingsContent = await settingsFile.async("string");
        settings = JSON.parse(settingsContent);
        console.log("Settings extracted from backup");
      }
      
      return res.json({ success: true, courses: savedCourses, count: savedCourses.length, settings });
    }
    
    // Single course format (course_metadata.json + modules folder)
    const metaFile = zip.file("course_metadata.json");
    if (!metaFile) {
      return res.status(400).json({ error: "Invalid course ZIP: Missing course_metadata.json" });
    }
    
    console.log("Detected single course format");
    const metaStr = await metaFile.async("string");
    const course = JSON.parse(metaStr);
    
    // Load modules
    const modulesFolder = zip.folder("modules");
    const modules: any[] = [];
    
    if (modulesFolder) {
      const moduleFiles: { path: string; file: any }[] = [];
      modulesFolder.forEach((relativePath, file) => {
        if (relativePath.endsWith(".json")) {
          moduleFiles.push({ path: relativePath, file });
        }
      });
      
      moduleFiles.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
      
      for (const modEntry of moduleFiles) {
        const modStr = await modEntry.file.async("string");
        const module = JSON.parse(modStr);
        modules.push(module);
      }
    }
    
    course.modules = modules;
    
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isValidUUID = course.id && uuidRegex.test(course.id);
    const dbId = isValidUUID ? course.id : crypto.randomUUID();
    const dataToStore = { ...course, id: dbId };
    
    // Extract media to Object Storage before storing
    const extractedData = await extractMediaFromCourse(dataToStore);
    
    // Upsert - delete existing then insert
    await db.delete(courses).where(eq(courses.id, dbId));
    const [newCourse] = await db.insert(courses).values({
      id: dbId,
      data: extractedData,
    }).returning();
    
    console.log("Course saved successfully:", course.title);
    res.json({ success: true, course: { ...newCourse.data as object, _dbId: newCourse.id } });
    
  } catch (error: any) {
    console.error("Course upload error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to process course upload" });
  }
});

// ============ COURSE IMPORT FROM URL (for large files) ============

app.post("/api/courses/import-url", requireRole("CREATOR"), async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }
    
    console.log("Importing course from URL:", url);
    
    // Fetch the file from URL
    const response = await fetch(url);
    
    if (!response.ok) {
      return res.status(400).json({ error: `Failed to fetch file: ${response.status} ${response.statusText}` });
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log("Downloaded file size:", buffer.length, "bytes");
    
    const zip = await JSZip.loadAsync(buffer);
    
    // Check if it's a single course or master backup
    const coursesFile = zip.file("courses.json");
    
    if (coursesFile) {
      // Master backup format
      console.log("Detected master backup format");
      const coursesContent = await coursesFile.async("string");
      const coursesData = JSON.parse(coursesContent);
      
      const savedCourses = [];
      for (const courseData of coursesData) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const isValidUUID = courseData.id && uuidRegex.test(courseData.id);
        const dbId = isValidUUID ? courseData.id : crypto.randomUUID();
        
        // Extract media to files before storing
        const extractedData = await extractMediaFromCourse({ ...courseData, id: dbId });
        
        // Upsert - delete existing then insert
        await db.delete(courses).where(eq(courses.id, dbId));
        const [newCourse] = await db.insert(courses).values({
          id: dbId,
          data: extractedData,
        }).returning();
        
        savedCourses.push({ ...newCourse.data as object, _dbId: newCourse.id });
        console.log("Saved course:", courseData.title);
      }
      
      // Also extract settings if present
      let settings = null;
      const settingsFile = zip.file("settings.json");
      if (settingsFile) {
        const settingsContent = await settingsFile.async("string");
        settings = JSON.parse(settingsContent);
        console.log("Settings extracted from backup");
      }
      
      return res.json({ success: true, courses: savedCourses, count: savedCourses.length, settings });
    }
    
    // Single course format (course_metadata.json + modules folder)
    const metaFile = zip.file("course_metadata.json");
    if (!metaFile) {
      return res.status(400).json({ error: "Invalid course ZIP: Missing course_metadata.json or courses.json" });
    }
    
    console.log("Detected single course format");
    const metaStr = await metaFile.async("string");
    const course = JSON.parse(metaStr);
    
    // Load modules
    const modulesFolder = zip.folder("modules");
    const modules: any[] = [];
    
    if (modulesFolder) {
      const moduleFiles: { path: string; file: any }[] = [];
      modulesFolder.forEach((relativePath, file) => {
        if (relativePath.endsWith(".json")) {
          moduleFiles.push({ path: relativePath, file });
        }
      });
      
      moduleFiles.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
      
      for (const modEntry of moduleFiles) {
        const modStr = await modEntry.file.async("string");
        const module = JSON.parse(modStr);
        modules.push(module);
      }
    }
    
    course.modules = modules;
    
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isValidUUID = course.id && uuidRegex.test(course.id);
    const dbId = isValidUUID ? course.id : crypto.randomUUID();
    const dataToStore = { ...course, id: dbId };
    
    // Extract media to Object Storage before storing
    const extractedData = await extractMediaFromCourse(dataToStore);
    
    // Upsert - delete existing then insert
    await db.delete(courses).where(eq(courses.id, dbId));
    const [newCourse] = await db.insert(courses).values({
      id: dbId,
      data: extractedData,
    }).returning();
    
    console.log("Course saved successfully:", course.title);
    res.json({ success: true, course: { ...newCourse.data as object, _dbId: newCourse.id } });
    
  } catch (error: any) {
    console.error("URL import error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to import from URL" });
  }
});

// ============ PROGRESS ROUTES ============

app.get("/api/progress", requireRole("CREATOR"), async (req, res) => {
  try {
    const allProgress = await db.select().from(progress);
    const progressMap: Record<string, Record<string, string[]>> = {};
    
    allProgress.forEach(p => {
      if (!progressMap[p.userId]) progressMap[p.userId] = {};
      progressMap[p.userId][p.courseId] = p.completedLessons || [];
    });
    
    res.json(progressMap);
  } catch (error) {
    res.status(500).json({ error: "Failed to get progress" });
  }
});

app.get("/api/progress/:userId", requireSelfOrRole("userId", "CREATOR"), async (req, res) => {
  try {
    const userProgress = await db.select().from(progress).where(eq(progress.userId, req.params.userId));
    const progressMap: Record<string, string[]> = {};
    
    userProgress.forEach(p => {
      progressMap[p.courseId] = p.completedLessons || [];
    });
    
    res.json(progressMap);
  } catch (error) {
    res.status(500).json({ error: "Failed to get progress" });
  }
});

app.put("/api/progress/:userId/:courseId", requireSelfOrRole("userId", "CREATOR"), async (req, res) => {
  try {
    const { completedLessons } = req.body;
    const { userId, courseId } = req.params;
    
    const existing = await db.select().from(progress)
      .where(and(eq(progress.userId, userId), eq(progress.courseId, courseId)));
    
    if (existing.length > 0) {
      await db.update(progress)
        .set({ completedLessons, updatedAt: new Date() })
        .where(and(eq(progress.userId, userId), eq(progress.courseId, courseId)));
    } else {
      await db.insert(progress).values({
        userId,
        courseId,
        completedLessons,
      });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update progress" });
  }
});

// ============ TICKETS ROUTES ============

app.get("/api/tickets", requireRole("CREATOR"), async (req, res) => {
  try {
    const allTickets = await db.select().from(tickets);
    res.json(allTickets.map(t => ({
      ...t,
      timestamp: t.timestamp?.toISOString(),
    })));
  } catch (error) {
    res.status(500).json({ error: "Failed to get tickets" });
  }
});

app.post("/api/tickets", requireAuth, async (req, res) => {
  try {
    const ticketData = req.body;
    const [newTicket] = await db.insert(tickets).values({
      id: ticketData.id,
      type: ticketData.type,
      studentId: ticketData.studentId,
      studentName: ticketData.studentName,
      studentEmail: ticketData.studentEmail,
      subject: ticketData.subject,
      message: ticketData.message,
      status: ticketData.status || "open",
      priority: ticketData.priority,
    }).returning();
    res.json({ ...newTicket, timestamp: newTicket.timestamp?.toISOString() });
  } catch (error) {
    console.error("Create ticket error:", error);
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

app.put("/api/tickets/:id/status", requireRole("CREATOR"), async (req, res) => {
  try {
    const { status } = req.body;
    const [updated] = await db.update(tickets)
      .set({ status })
      .where(eq(tickets.id, req.params.id))
      .returning();
    
    if (!updated) return res.status(404).json({ error: "Ticket not found" });
    res.json({ ...updated, timestamp: updated.timestamp?.toISOString() });
  } catch (error) {
    res.status(500).json({ error: "Failed to update ticket" });
  }
});

// ============ CERTIFICATES ROUTES ============

app.get("/api/certificates", requireAuth, async (req, res) => {
  try {
    const allCerts = await db.select().from(certificates);
    res.json(allCerts.map(c => ({
      ...c,
      issueDate: c.issueDate?.toISOString(),
    })));
  } catch (error) {
    res.status(500).json({ error: "Failed to get certificates" });
  }
});

app.post("/api/certificates", requireAuth, async (req, res) => {
  try {
    const certData = req.body;
    const [newCert] = await db.insert(certificates).values({
      id: certData.id,
      studentId: certData.studentId,
      studentName: certData.studentName,
      courseId: certData.courseId,
      courseTitle: certData.courseTitle,
      courseImage: certData.courseImage,
    }).returning();
    res.json({ ...newCert, issueDate: newCert.issueDate?.toISOString() });
  } catch (error) {
    console.error("Create certificate error:", error);
    res.status(500).json({ error: "Failed to create certificate" });
  }
});

// ============ MIGRATION: Extract embedded media to files ============

app.post("/api/migrate-media", requireRole("CREATOR"), async (req, res) => {
  const countFiles = (dir: string) => {
    try {
      return fs.readdirSync(path.join(mediaPath, dir)).length;
    } catch { return 0; }
  };
  
  try {
    console.log("Starting media migration...");
    const allCourses = await db.select().from(courses);
    let migratedCount = 0;
    let errorCount = 0;
    const results: any[] = [];
    
    for (const course of allCourses) {
      const data = course.data as any;
      if (!data) continue;
      
      // Check if any media needs extraction
      let needsMigration = false;
      
      if (data.ecoverUrl?.startsWith('data:')) needsMigration = true;
      if (data.modules) {
        for (const mod of data.modules) {
          for (const lesson of mod.lessons || []) {
            if (lesson.imageUrl?.startsWith('data:')) needsMigration = true;
            if (lesson.audioData?.startsWith('data:')) needsMigration = true;
            if (lesson.renderedVideoUrl?.startsWith('data:')) needsMigration = true;
            // Check visuals array for imageData
            if (lesson.visuals && Array.isArray(lesson.visuals)) {
              for (const visual of lesson.visuals) {
                if (visual.imageData?.startsWith('data:')) needsMigration = true;
              }
            }
          }
        }
      }
      
      if (needsMigration) {
        try {
          console.log(`Migrating course: ${data.title || course.id}`);
          const extracted = await extractMediaFromCourse(data);
          
          await db.update(courses)
            .set({ data: extracted, updatedAt: new Date() })
            .where(eq(courses.id, course.id));
          
          migratedCount++;
          results.push({ id: course.id, title: data.title, status: 'success' });
        } catch (err: any) {
          console.error(`Failed to migrate course ${course.id}:`, err?.message);
          errorCount++;
          results.push({ id: course.id, title: data.title, status: 'failed', error: err?.message });
        }
      }
    }
    
    const filesCreated = countFiles('images') + countFiles('audio') + countFiles('video');
    
    console.log(`Migration complete: ${migratedCount} courses updated, ${errorCount} failed, ${filesCreated} media files total`);
    res.json({ 
      success: errorCount === 0, 
      coursesUpdated: migratedCount,
      coursesFailed: errorCount,
      totalCourses: allCourses.length,
      mediaFiles: filesCreated,
      results
    });
  } catch (error: any) {
    console.error("Migration error:", error);
    res.status(500).json({ error: error?.message || "Migration failed" });
  }
});

// Migrate a single course by ID
app.post("/api/migrate-media/:id", requireRole("CREATOR"), async (req, res) => {
  try {
    const courseId = req.params.id;
    console.log(`Migrating single course: ${courseId}`);
    
    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }
    
    const data = course.data as any;
    const extracted = await extractMediaFromCourse(data);
    
    await db.update(courses)
      .set({ data: extracted, updatedAt: new Date() })
      .where(eq(courses.id, courseId));
    
    console.log(`Successfully migrated course: ${data.title || courseId}`);
    res.json({ success: true, courseId, title: data.title });
  } catch (error: any) {
    console.error("Migration error:", error);
    res.status(500).json({ error: error?.message || "Migration failed" });
  }
});

// List courses that need migration
app.get("/api/migrate-media/pending", requireRole("CREATOR"), async (req, res) => {
  try {
    const allCourses = await db.select().from(courses);
    const pending: any[] = [];
    
    for (const course of allCourses) {
      const data = course.data as any;
      if (!data) continue;
      
      let needsMigration = false;
      let mediaCount = 0;
      
      if (isBase64Data(data.ecoverUrl)) { needsMigration = true; mediaCount++; }
      if (data.modules) {
        for (const mod of data.modules) {
          for (const lesson of mod.lessons || []) {
            if (isBase64Data(lesson.imageUrl)) { needsMigration = true; mediaCount++; }
            if (isBase64Data(lesson.audioData)) { needsMigration = true; mediaCount++; }
            if (isBase64Data(lesson.renderedVideoUrl)) { needsMigration = true; mediaCount++; }
            // Check visuals array for imageData
            if (lesson.visuals && Array.isArray(lesson.visuals)) {
              for (const visual of lesson.visuals) {
                if (isBase64Data(visual.imageData)) { needsMigration = true; mediaCount++; }
              }
            }
          }
        }
      }
      
      if (needsMigration) {
        pending.push({ id: course.id, title: data.title, mediaCount });
      }
    }
    
    res.json({ pending, count: pending.length });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

// ============ AI IMAGE GENERATION WITH FALLBACK ============

import OpenAI from "openai";
import Replicate from "replicate";

// Normalize the OpenAI base URL — OpenAI SDK requires the `/v1` suffix. Some env
// values are set to just `https://api.openai.com` (missing `/v1`), which would
// produce 404s on every call. Auto-append it when needed.
function normalizeOpenAIBaseURL(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.replace(/\/+$/, '');
  if (/\/v\d+$/.test(trimmed)) return trimmed; // already ends in /v1, /v2, etc.
  // Standard OpenAI host without a version segment → append /v1
  if (trimmed === 'https://api.openai.com' || trimmed.endsWith('.openai.com')) {
    return trimmed + '/v1';
  }
  // Other hosts (proxies, gateways): trust what was passed
  return trimmed;
}

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: normalizeOpenAIBaseURL(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) || undefined,
});

// Fallback image generator via OpenAI. Tries gpt-image-1 first (newer, photoreal,
// closer to Gemini's look), falls back to DALL-E 3 if the org isn't verified for
// gpt-image-1. Returns base64 (no data: prefix) so callers can stay compatible
// with the existing Gemini response shape.
async function generateImageOpenAI(prompt: string, aspectRatio: string = '16:9'): Promise<{ b64: string; model: string }> {
  // gpt-image-1 supports: 1024x1024, 1024x1536, 1536x1024
  let gptSize: '1024x1024' | '1024x1536' | '1536x1024' = '1024x1024';
  if (aspectRatio === '16:9' || aspectRatio === '4:3') gptSize = '1536x1024';
  else if (aspectRatio === '9:16' || aspectRatio === '3:4' || aspectRatio === '2:3') gptSize = '1024x1536';

  // dall-e-3 supports: 1024x1024, 1024x1792, 1792x1024
  let dalleSize: '1024x1024' | '1024x1792' | '1792x1024' = '1024x1024';
  if (aspectRatio === '16:9' || aspectRatio === '4:3') dalleSize = '1792x1024';
  else if (aspectRatio === '9:16' || aspectRatio === '3:4' || aspectRatio === '2:3') dalleSize = '1024x1792';

  // Attempt 1: gpt-image-1 at HIGH quality. Without an explicit quality the API
  // defaults to 'auto' which usually renders low/medium — visibly soft, flat
  // images. 'high' gives sharp, detailed, photoreal output (closest to Gemini).
  try {
    const resp = await (openai.images as any).generate({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: gptSize,
      quality: 'high',
    });
    const b64 = resp?.data?.[0]?.b64_json;
    if (b64) return { b64, model: 'gpt-image-1' };
    throw new Error('gpt-image-1 returned no b64_json');
  } catch (err: any) {
    console.warn('gpt-image-1 (high) failed, trying dall-e-3:', String(err?.message || err).slice(0, 200));
  }

  // Attempt 2: dall-e-3 at HD quality (was 'standard' — noticeably softer).
  const resp = await (openai.images as any).generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: dalleSize,
    response_format: 'b64_json',
    quality: 'hd',
  });
  const b64 = resp?.data?.[0]?.b64_json;
  if (!b64) throw new Error('dall-e-3 returned no b64_json');
  return { b64, model: 'dall-e-3' };
}

app.post("/api/ai/generate-image", requireRole("CREATOR"), async (req, res) => {
  const { prompt, aspectRatio = "16:9" } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is required for image generation.' });
  }

  // Try the premium Gemini 3 Pro Image model first (best quality, lowest daily quota).
  // On rate-limit (429 / RESOURCE_EXHAUSTED), automatically fall back to the higher-quota
  // Gemini 2.5 Flash Image model — same Gemini family, same provider, just more headroom.
  const tryModel = async (model: string, label: string) => {
    console.log(`Generating image with ${label} (${model})...`);
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const response = await ai.models.generateContent({
      model,
      contents: { parts: [{ text: prompt }] },
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: aspectRatio },
      },
    });
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          return part.inlineData.data;
        }
      }
    }
    throw new Error(`No image data in ${label} response`);
  };

  let firstError: any = null;
  try {
    const data = await tryModel('gemini-3-pro-image-preview', 'Gemini 3 Pro');
    console.log('Gemini 3 Pro image generated successfully');
    return res.json({ imageData: data, provider: 'gemini-3-pro', success: true });
  } catch (err: any) {
    firstError = err;
    const msg = String(err?.message || err);
    const isRate = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('exceeded');
    console.warn(`Gemini 3 Pro failed${isRate ? ' (rate-limited)' : ''}, trying Gemini 2.5 Flash Image:`, msg.slice(0, 200));
  }

  let secondError: any = null;
  try {
    const data = await tryModel('gemini-2.5-flash-image', 'Gemini 2.5 Flash Image');
    console.log('Gemini 2.5 Flash Image generated successfully (fallback)');
    return res.json({ imageData: data, provider: 'gemini-2.5-flash', success: true, fellBackFrom: 'gemini-3-pro' });
  } catch (err: any) {
    secondError = err;
    console.warn('Gemini 2.5 Flash also failed, trying OpenAI image gen:', String(err?.message || err).slice(0, 200));
  }

  // Both Gemini models failed → OpenAI image gen as last resort.
  if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY) {
    try {
      const { b64, model } = await generateImageOpenAI(prompt, aspectRatio);
      console.log(`OpenAI image generated successfully via ${model} (fallback from Gemini)`);
      return res.json({ imageData: b64, provider: `openai-${model}`, success: true, fellBackFrom: 'gemini' });
    } catch (err: any) {
      console.error('OpenAI image gen also failed:', String(err?.message || err).slice(0, 300));
      return res.status(500).json({
        error: 'Image generation failed across all providers.',
        gemini3ProError: String(firstError?.message || firstError).slice(0, 300),
        gemini25FlashError: String(secondError?.message || secondError).slice(0, 300),
        openaiError: String(err?.message || err).slice(0, 300),
      });
    }
  }

  return res.status(500).json({
    error: 'Image generation failed — both Gemini models exhausted, no OpenAI key configured.',
    gemini3ProError: String(firstError?.message || firstError).slice(0, 300),
    gemini25FlashError: String(secondError?.message || secondError).slice(0, 300),
  });
});


// AI Cover Generation endpoint - generates book covers with Gemini
app.post("/api/ai/generate-cover", requireRole("CREATOR"), async (req, res) => {
  const { title, headline, instructions, existingImage } = req.body;

  if (!title) {
    return res.status(400).json({ error: "Title is required" });
  }

  // Hoisted so the OpenAI fallback in catch() can read it.
  const isEditing = !!(existingImage && existingImage.startsWith('data:image'));

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is required for cover generation.' });
  }

  try {
    console.log('Generating AI cover with Gemini...');
    const ai = new GoogleGenAI({ apiKey: geminiKey });

    const parts: any[] = [];

    // If existing image provided, add it for editing
    if (isEditing) {
      const base64Data = existingImage.split(',')[1];
      const mimeType = existingImage.split(';')[0].split(':')[1];
      parts.push({ inlineData: { data: base64Data, mimeType: mimeType } });
    }

    // Build prompt
    let prompt = "";
    if (isEditing) {
      prompt = `TASK: Edit text on image. Replace Title with: "${title}". Replace Subtitle with: "${headline || ''}". Keep background/layout. USER OVERRIDES: "${instructions || ''}"`;
    } else {
      prompt = `Design book cover for "${title}". Headline: "${headline || ''}". STYLE: High-end corporate. USER INSTRUCTIONS: "${instructions || ''}"`;
    }
    parts.push({ text: prompt });
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: parts },
      config: { 
        responseModalities: ['TEXT', 'IMAGE'], 
        imageConfig: { aspectRatio: '2:3', imageSize: '1K' } 
      }
    });
    
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          console.log('AI cover generated successfully via Gemini');
          return res.json({
            imageData: `data:image/png;base64,${part.inlineData.data}`,
            provider: 'gemini',
            success: true
          });
        }
      }
    }
    throw new Error('No image data in Gemini response');
  } catch (geminiError: any) {
    console.warn('Gemini cover gen failed, trying OpenAI fallback:', String(geminiError?.message || geminiError).slice(0, 200));

    if (!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY)) {
      return res.status(500).json({ error: 'Cover generation failed', details: geminiError?.message });
    }

    try {
      // 2:3 portrait for book covers; OpenAI image gen handles that aspect.
      const coverPrompt = isEditing
        ? `Book cover design. Title: "${title}". Subtitle/headline: "${headline || ''}". STYLE: High-end corporate, premium, photoreal. ${instructions || ''}`
        : `Design a high-end corporate book cover. Title: "${title}". Subtitle/headline: "${headline || ''}". Premium, photoreal, polished. ${instructions || ''}`;
      const { b64, model } = await generateImageOpenAI(coverPrompt, '2:3');
      console.log(`AI cover generated successfully via OpenAI ${model} (fallback from Gemini)`);
      return res.json({
        imageData: `data:image/png;base64,${b64}`,
        provider: `openai-${model}`,
        success: true,
        fellBackFrom: 'gemini',
      });
    } catch (openaiError: any) {
      console.error('OpenAI cover gen also failed:', String(openaiError?.message || openaiError).slice(0, 300));
      return res.status(500).json({
        error: 'Cover generation failed across all providers',
        geminiError: String(geminiError?.message || geminiError).slice(0, 300),
        openaiError: String(openaiError?.message || openaiError).slice(0, 300),
      });
    }
  }
});

// AI Metadata Generation endpoint - generates headlines/descriptions from files
// Extract plain text from a DOCX buffer using mammoth. Word's modern .docx
// format is a zipped XML bundle; mammoth pulls out the readable text. The
// older .doc binary format isn't supported by mammoth — we degrade gracefully
// in that case and ask the user to re-export.
async function extractDocxText(buffer: Buffer, maxChars = 60000): Promise<string> {
  try {
    const mod: any = await import('mammoth');
    const mammoth = mod.default || mod;
    const result = await mammoth.extractRawText({ buffer });
    return (result?.value || '').slice(0, maxChars).trim();
  } catch (e: any) {
    console.warn('mammoth (docx) failed:', String(e?.message || e).slice(0, 200));
    return '';
  }
}

// Extract plain text from a PDF buffer using pdf-parse v2's PDFParse class.
// Used so OpenAI (which cannot directly read PDF binaries in chat.completions)
// still has something to work with when Gemini is down.
async function extractPdfText(buffer: Buffer, maxChars = 8000): Promise<string> {
  try {
    const mod: any = await import('pdf-parse');
    const PDFParse = mod.PDFParse || mod.default?.PDFParse;
    if (!PDFParse) {
      // Fallback: maybe an older default-function export shape.
      const fn = mod.default || mod;
      if (typeof fn === 'function') {
        const result = await fn(buffer);
        return (result?.text || '').slice(0, maxChars).trim();
      }
      console.warn('pdf-parse: no PDFParse class or callable default export');
      return '';
    }
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return (result?.text || '').slice(0, maxChars).trim();
  } catch (e: any) {
    console.warn('pdf-parse failed:', String(e?.message || e).slice(0, 200));
    return '';
  }
}

app.post("/api/ai/generate-metadata", requireRole("CREATOR"), async (req, res) => {
  const { target, fileData, fileMimeType, coverData, mode: rawMode, context } = req.body;

  const validTargets = ['title', 'headline', 'description', 'all'];
  if (!target || !validTargets.includes(target)) {
    return res.status(400).json({ error: `Target must be one of: ${validTargets.join(', ')}` });
  }

  // Default: when a source file is given, EXTRACT exact text (book title, etc.);
  // otherwise GENERATE creatively. Clients can override by passing `mode`.
  const mode: 'extract' | 'generate' = rawMode === 'extract' || rawMode === 'generate'
    ? rawMode
    : (fileData ? 'extract' : 'generate');

  const buildPrompt = (): string => {
    if (mode === 'extract') {
      if (target === 'all') return 'Look at this document/cover and EXTRACT the EXACT text as written. Do NOT make up new text. Return JSON: { "title": "exact title", "headline": "exact subtitle or empty string", "description": "brief factual summary of what this is about" }';
      if (target === 'title') return 'Look at this document/cover and EXTRACT the EXACT title as written. Do NOT make up a new title. Return JSON: { "text": "the exact title" }';
      if (target === 'headline') return 'Look at this document/cover and EXTRACT the EXACT subtitle as written. If no subtitle exists, return the author name or a key phrase. Do NOT make up text. Return JSON: { "text": "the exact subtitle" }';
      return 'Read this document/cover and write a brief factual description of what it covers. Be direct and specific. Return JSON: { "text": "description" }';
    }
    // generate mode — append client-supplied context (e.g. typed title) so the
    // model has something to anchor on when no file/cover was provided.
    const ctx = typeof context === 'string' && context.trim() ? `\nContext: ${context.trim().slice(0, 500)}` : '';
    if (target === 'all') return `Generate course metadata. Return JSON: { "title": "engaging title under 60 chars", "headline": "headline under 15 words", "description": "description around 50 words" }${ctx}`;
    if (target === 'title') return `Generate an engaging course title (under 60 chars). Return JSON: { "text": "..." }${ctx}`;
    if (target === 'headline') return `Generate course headline (max 15 words). Return JSON: { "text": "..." }${ctx}`;
    return `Generate course description (50 words). Return JSON: { "text": "..." }${ctx}`;
  };

  const promptInstr = buildPrompt();

  // Normalize the parsed model output to the response shape clients expect.
  const shapeResponse = (parsed: any) => {
    if (target === 'all') {
      return { title: parsed.title ?? '', headline: parsed.headline ?? '', description: parsed.description ?? '' };
    }
    return { text: parsed.text ?? '' };
  };

  // Try Gemini (which supports inline file + image in one call)
  let geminiError: any = null;
  if (process.env.GEMINI_API_KEY) {
    try {
      console.log(`Generating ${target} (${mode}) with Gemini...`);
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const parts: any[] = [];
      if (fileData && fileMimeType) parts.push({ inlineData: { data: fileData, mimeType: fileMimeType } });
      if (coverData) {
        const base64 = coverData.includes(',') ? coverData.split(',')[1] : coverData;
        parts.push({ inlineData: { data: base64, mimeType: 'image/png' } });
      }
      if (parts.length === 0 && mode === 'extract') {
        return res.status(400).json({ error: "No file or cover data provided" });
      }
      parts.push({ text: promptInstr });

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts },
        config: { responseMimeType: "application/json" }
      });

      const json = JSON.parse(response.text || "{}");
      console.log(`${target} generated successfully via Gemini`);
      return res.json({ ...shapeResponse(json), provider: 'gemini', success: true });
    } catch (err: any) {
      geminiError = err;
      console.warn(`Gemini ${target} gen failed, trying OpenAI:`, String(err?.message || err).slice(0, 200));
    }
  }

  // OpenAI fallback. Chat-completions vision accepts images directly; for PDFs
  // we run pdf-parse server-side and pass the extracted text as plain context.
  if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY) {
    try {
      const content: any[] = [{ type: 'text', text: promptInstr }];

      // Cover image — vision-capable models read it directly.
      if (coverData) {
        const dataUrl = coverData.startsWith('data:') ? coverData : `data:image/png;base64,${coverData}`;
        content.push({ type: 'image_url', image_url: { url: dataUrl } });
      }

      // Source file: images go in as image_url; PDFs and DOCX get text-extracted
      // server-side first; text-like files get pasted directly.
      if (fileData && fileMimeType) {
        if (fileMimeType.startsWith('image/')) {
          content.push({ type: 'image_url', image_url: { url: `data:${fileMimeType};base64,${fileData}` } });
        } else if (fileMimeType === 'application/pdf' || /pdf$/i.test(fileMimeType)) {
          const buf = Buffer.from(fileData, 'base64');
          const text = await extractPdfText(buf);
          if (text) {
            content.push({ type: 'text', text: `Source PDF text (first 8000 chars):\n\n${text}` });
          } else {
            content.unshift({ type: 'text', text: 'The user uploaded a PDF but text could not be extracted. Use the cover image (if any) and filename as context.' });
          }
        } else if (fileMimeType.includes('wordprocessingml') || /docx$/i.test(fileMimeType)) {
          const buf = Buffer.from(fileData, 'base64');
          const text = await extractDocxText(buf, 8000);
          if (text) {
            content.push({ type: 'text', text: `Source DOCX text:\n\n${text}` });
          } else {
            content.unshift({ type: 'text', text: 'The user uploaded a Word document but text could not be extracted.' });
          }
        } else if (fileMimeType === 'application/msword') {
          content.unshift({ type: 'text', text: 'A legacy .doc (Word 97-2003) was uploaded. The fallback cannot read this format. Please ask the user to re-save as .docx, PDF, or TXT.' });
        } else if (fileMimeType.startsWith('text/') || /(markdown|plain)/i.test(fileMimeType)) {
          // For TXT/MD: decode base64 to UTF-8 string.
          try {
            const decoded = Buffer.from(fileData, 'base64').toString('utf-8').slice(0, 8000);
            content.push({ type: 'text', text: `Source file content:\n\n${decoded}` });
          } catch {
            // ignore
          }
        } else {
          content.unshift({ type: 'text', text: `A file of type ${fileMimeType} was provided but cannot be read directly. Use any cover image and filename as context.` });
        }
      }

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content }],
        response_format: { type: 'json_object' },
        max_completion_tokens: target === 'all' ? 512 : 256,
      });

      const text = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(text);
      console.log(`${target} generated successfully via OpenAI (fallback)`);
      return res.json({ ...shapeResponse(parsed), provider: 'openai', success: true, fellBackFrom: 'gemini' });
    } catch (err: any) {
      console.error(`OpenAI ${target} gen failed:`, String(err?.message || err).slice(0, 300));
      return res.status(500).json({
        error: 'Metadata generation failed across all providers',
        geminiError: geminiError ? String(geminiError?.message || geminiError).slice(0, 300) : undefined,
        openaiError: String(err?.message || err).slice(0, 300),
      });
    }
  }

  return res.status(500).json({ error: 'Metadata generation failed', details: String(geminiError?.message || geminiError) });
});

// Simple FLUX test endpoint - generates just 1 test image
app.post("/api/test-flux", requireRole("CREATOR"), async (req, res) => {
  const { replicateApiKey } = req.body;
  
  if (!replicateApiKey) {
    return res.status(400).json({ error: "Replicate API key is required" });
  }
  
  try {
    const replicate = new Replicate({ auth: replicateApiKey });
    console.log('Testing FLUX with predictions API...');
    
    const prediction = await replicate.predictions.create({
      model: "black-forest-labs/flux-1.1-pro",
      input: {
        prompt: "A beautiful sunset over mountains, photorealistic, high quality",
        aspect_ratio: "16:9",
        output_format: "png",
        output_quality: 80,
      }
    });
    
    console.log('FLUX test prediction created:', prediction.id, 'status:', prediction.status);
    
    let result = prediction;
    let attempts = 0;
    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < 60) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      result = await replicate.predictions.get(prediction.id);
      attempts++;
      console.log('FLUX test waiting... status:', result.status, 'attempt:', attempts);
    }
    
    console.log('FLUX test final status:', result.status);
    console.log('FLUX test output:', result.output);
    
    if (result.status === 'failed') {
      return res.status(500).json({ 
        error: 'FLUX test failed', 
        details: result.error,
        status: result.status
      });
    }
    
    if (result.status === 'succeeded' && result.output) {
      const imageUrl = result.output;
      if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
        const imageResponse = await fetch(imageUrl);
        const imageBuffer = await imageResponse.arrayBuffer();
        const base64 = Buffer.from(imageBuffer).toString('base64');
        return res.json({ 
          success: true,
          message: 'FLUX is working!',
          imageData: base64,
          imageUrl: imageUrl,
          predictionId: prediction.id
        });
      }
    }
    
    return res.status(500).json({ 
      error: 'Unexpected FLUX response', 
      status: result.status,
      output: result.output
    });
  } catch (error: any) {
    console.error('FLUX test error:', error?.message);
    return res.status(500).json({ 
      error: 'FLUX test failed', 
      details: error?.message 
    });
  }
});

// AI Text Generation with fallback
app.post("/api/ai/generate-text", requireRole("CREATOR"), async (req, res) => {
  const { prompt, jsonMode = false, useOpenAI = false } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }
  
  // Try Gemini first
  if (!useOpenAI && process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const config: any = {};
      if (jsonMode) {
        config.responseMimeType = 'application/json';
      }
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ parts: [{ text: prompt }] }],
        config
      });
      
      const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return res.json({ text, provider: 'gemini', success: true });
      }
      throw new Error('No text in Gemini response');
    } catch (geminiError: any) {
      console.log('Gemini text gen failed, trying OpenAI fallback:', geminiError?.message);
    }
  }
  
  // OpenAI fallback
  if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: jsonMode ? { type: "json_object" } : undefined,
        max_completion_tokens: 4096,
      });
      
      const text = response.choices[0]?.message?.content;
      if (text) {
        return res.json({ text, provider: 'openai', success: true });
      }
      throw new Error('No text in OpenAI response');
    } catch (openaiError: any) {
      console.error('OpenAI text gen failed:', openaiError?.message);
      return res.status(500).json({ 
        error: 'Both Gemini and OpenAI text generation failed', 
        details: openaiError?.message 
      });
    }
  }
  
  return res.status(500).json({ error: 'No AI provider available for text generation' });
});

// ============ MOTION VIDEO — AI SCENE DIRECTOR ============
// Turns source content (a script / extracted document / webpage text) into a
// motion-video scene list. Gemini -> OpenAI fallback; sanitizeScenes() repairs
// the model's JSON so the render won't fail.
app.post("/api/ai/generate-scenes", requireRole("CREATOR"), async (req, res) => {
  const { sourceText, focusInstructions, brandName } = req.body;
  if (!sourceText || String(sourceText).trim().length < 20) {
    return res.status(400).json({ error: "sourceText is required (at least 20 characters)" });
  }

  const prompt = buildDirectorPrompt(String(sourceText), focusInstructions, brandName);

  const parseScenes = (text: string): any[] => {
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    return sanitizeScenes(JSON.parse(cleaned));
  };

  // Try Gemini first.
  let geminiErr = '';
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ parts: [{ text: prompt }] }],
        config: { responseMimeType: 'application/json' },
      });
      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || response.text;
      const scenes = parseScenes(text || '{}');
      if (scenes.length > 0) {
        return res.json({ scenes, provider: 'gemini', success: true });
      }
      throw new Error('No usable scenes from Gemini');
    } catch (e: any) {
      geminiErr = String(e?.message || e).slice(0, 200);
      console.warn('Scene director: Gemini failed, trying OpenAI:', geminiErr);
    }
  }

  // OpenAI fallback — gpt-4o (the strong model) for thorough content analysis.
  if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_completion_tokens: 6000,
      });
      const scenes = parseScenes(response.choices[0]?.message?.content || '{}');
      if (scenes.length === 0) throw new Error('No usable scenes from OpenAI');
      return res.json({ scenes, provider: 'openai', success: true, fellBackFrom: 'gemini' });
    } catch (e: any) {
      console.error('Scene director: OpenAI failed:', String(e?.message || e).slice(0, 300));
      return res.status(500).json({
        error: 'Scene generation failed across all providers',
        geminiError: geminiErr || undefined,
        openaiError: String(e?.message || e).slice(0, 300),
      });
    }
  }

  return res.status(500).json({ error: 'No AI provider available', details: geminiErr });
});

// ============ MOTION VIDEO — URL CONTENT EXTRACTION ============
// Reads a website for the AI Scene Director. Uses Jina AI Reader
// (https://r.jina.ai) — free, no key — which RENDERS JavaScript and returns
// clean markdown, so modern JS-built sites are read properly (a raw fetch
// would only see an empty shell). Crawls the entry page plus a few key pages
// (about, pricing, product…) so "review my website" covers the whole business.

const URL_EXTRACT_MAX_CHARS = 45000;
const KEY_PAGE_KEYWORDS =
  /(about|pricing|price|plans?|product|features?|services?|solutions?|how-?it-?works|what-we-do|benefits?|overview)/i;

/** Fetch one page's clean, JS-rendered content via Jina AI Reader. */
async function fetchViaJina(pageUrl: string): Promise<string> {
  const r = await fetch(`https://r.jina.ai/${pageUrl}`, {
    headers: { 'User-Agent': 'CourseMagic', 'X-Return-Format': 'markdown' },
    signal: AbortSignal.timeout(35000),
  });
  if (!r.ok) throw new Error(`Reader returned HTTP ${r.status}`);
  return (await r.text()).trim();
}

app.post("/api/ai/extract-url", requireRole("CREATOR"), async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: "url is required" });
    }
    let parsed: URL;
    try {
      parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    } catch {
      return res.status(400).json({ error: "Invalid URL" });
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).json({ error: "URL must be http or https" });
    }
    // SSRF guard — reject private / loopback hosts.
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.internal') ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host === '::1' ||
      host === '[::1]'
    ) {
      return res.status(400).json({ error: "That URL is not allowed" });
    }

    const entryUrl = parsed.toString();

    // 1. Read the entry page (JS-rendered).
    let entryContent: string;
    try {
      entryContent = await fetchViaJina(entryUrl);
    } catch (e: any) {
      return res.status(502).json({
        error: `Could not read that page: ${String(e?.message || e).slice(0, 120)}`,
      });
    }

    // 2. Discover up to 4 same-domain key pages from the entry page's links.
    const linkRe = /\]\((https?:\/\/[^)\s]+)\)/g;
    const seen = new Set<string>([entryUrl.replace(/\/$/, '')]);
    const keyPages: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(entryContent)) !== null && keyPages.length < 4) {
      try {
        const lu = new URL(m[1]);
        if (lu.hostname.toLowerCase() !== host) continue;
        const norm = `${lu.origin}${lu.pathname}`.replace(/\/$/, '');
        if (seen.has(norm) || !KEY_PAGE_KEYWORDS.test(lu.pathname)) continue;
        seen.add(norm);
        keyPages.push(norm);
      } catch {
        /* skip malformed links */
      }
    }

    // 3. Read the key pages in parallel; skip any that fail.
    const extra = await Promise.all(
      keyPages.map(async (p) => {
        try {
          return { url: p, content: await fetchViaJina(p) };
        } catch {
          return null;
        }
      }),
    );

    // 4. Combine into one labelled document.
    const pagesRead = [entryUrl, ...extra.filter(Boolean).map((x) => x!.url)];
    let combined = `=== PAGE: ${entryUrl} ===\n${entryContent}`;
    for (const x of extra) {
      if (x) combined += `\n\n=== PAGE: ${x.url} ===\n${x.content}`;
    }

    // 5. Collect images found on the crawled pages (Jina markdown ![..](url)).
    const allContent = combined;
    const imgRe = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;
    const imageSet = new Set<string>();
    let im: RegExpExecArray | null;
    while ((im = imgRe.exec(allContent)) !== null && imageSet.size < 40) {
      const u = im[1];
      // Skip vector/icon/data assets — keep real photographs.
      if (/\.(svg|ico)(\?|$)/i.test(u) || u.startsWith('data:')) continue;
      imageSet.add(u);
    }
    const images = [...imageSet];

    combined = combined.slice(0, URL_EXTRACT_MAX_CHARS).trim();
    if (combined.replace(/=== PAGE:[^\n]*\n/g, '').trim().length < 60) {
      return res.status(422).json({ error: "Couldn't extract readable content from that site" });
    }
    return res.json({ text: combined, pagesRead, images, success: true });
  } catch (e: any) {
    console.error('extract-url error:', e?.message || e);
    return res.status(500).json({ error: e?.message || 'URL extraction failed' });
  }
});

// ============ FILE-BEARING GENERATION (PDF/DOCX/TXT outlines + scripts) ============
// Single endpoint used by CourseWizard's outline + script generators. Tries
// Gemini (which can natively read PDF/DOCX), falls back to OpenAI with text
// extracted server-side via pdf-parse (PDF) or direct base64 decode (TXT/MD).
app.post("/api/ai/generate-from-file", requireRole("CREATOR"), async (req, res) => {
  const { prompt, fileData, fileMimeType, jsonMode = false, maxTokens } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: "Prompt is required" });
  }

  // Try Gemini with the inline file first (it reads PDF/DOCX/TXT/MD natively).
  let geminiError: any = null;
  if (process.env.GEMINI_API_KEY) {
    try {
      console.log(`generate-from-file: trying Gemini${fileMimeType ? ` (file: ${fileMimeType})` : ''}...`);
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const parts: any[] = [];
      if (fileData && fileMimeType) {
        parts.push({ inlineData: { data: fileData, mimeType: fileMimeType } });
      }
      parts.push({ text: prompt });

      const config: any = {};
      if (jsonMode) config.responseMimeType = 'application/json';

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { role: 'user', parts },
        config,
      });

      const text = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        console.log('generate-from-file: Gemini success');
        return res.json({ text, provider: 'gemini', success: true });
      }
      throw new Error('No text in Gemini response');
    } catch (err: any) {
      geminiError = err;
      console.warn('generate-from-file: Gemini failed, trying OpenAI:', String(err?.message || err).slice(0, 200));
    }
  }

  // OpenAI fallback. Chat-completions vision doesn't accept PDF/DOCX binaries;
  // we extract text first and embed it in the prompt.
  if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY) {
    try {
      let augmentedPrompt = prompt;

      if (fileData && fileMimeType) {
        if (fileMimeType === 'application/pdf' || /pdf$/i.test(fileMimeType)) {
          const buf = Buffer.from(fileData, 'base64');
          // For full-document tasks (outline, script generation) we want more text
          // than the metadata path uses. 60k chars ≈ 12-15k tokens, leaving room
          // for the prompt + JSON response within gpt-4o-mini's 128k context.
          const extracted = await extractPdfText(buf, 60000);
          if (extracted) {
            augmentedPrompt = `${prompt}\n\n---\nSOURCE PDF CONTENT (extracted text, may be truncated):\n${extracted}`;
          } else {
            augmentedPrompt = `${prompt}\n\n---\nNote: A PDF was provided but text extraction failed (possibly scanned/image-only PDF). Proceed using the prompt context alone.`;
          }
        } else if (fileMimeType.startsWith('text/') || /(markdown|plain)/i.test(fileMimeType)) {
          try {
            const decoded = Buffer.from(fileData, 'base64').toString('utf-8').slice(0, 60000);
            augmentedPrompt = `${prompt}\n\n---\nSOURCE FILE CONTENT:\n${decoded}`;
          } catch {
            augmentedPrompt = `${prompt}\n\n---\nNote: A text file was provided but could not be decoded.`;
          }
        } else if (fileMimeType.includes('wordprocessingml') || /docx$/i.test(fileMimeType) || fileMimeType === 'application/msword') {
          // Modern .docx is extractable via mammoth. Older .doc (binary, pre-2007)
          // is not supported by mammoth — note the limitation.
          if (fileMimeType === 'application/msword') {
            augmentedPrompt = `${prompt}\n\n---\nNote: A legacy .doc (Word 97-2003) file was provided. Please re-save as .docx, PDF, or TXT for full text extraction support.`;
          } else {
            const buf = Buffer.from(fileData, 'base64');
            const extracted = await extractDocxText(buf, 60000);
            if (extracted) {
              augmentedPrompt = `${prompt}\n\n---\nSOURCE DOCX CONTENT (extracted text, may be truncated):\n${extracted}`;
            } else {
              augmentedPrompt = `${prompt}\n\n---\nNote: A Word document was provided but text extraction failed. Proceed using the prompt context alone.`;
            }
          }
        } else if (fileMimeType.startsWith('image/')) {
          // For images, we'd want to use vision — but outline/script use cases here
          // are text-based. Note it and proceed without.
          augmentedPrompt = `${prompt}\n\n---\nNote: An image was provided. Proceed using the prompt context.`;
        } else {
          augmentedPrompt = `${prompt}\n\n---\nNote: A file of type ${fileMimeType} was provided but cannot be read by the fallback provider.`;
        }
      }

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: augmentedPrompt }],
        response_format: jsonMode ? { type: 'json_object' } : undefined,
        max_completion_tokens: maxTokens || 4096,
      });

      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error('No text in OpenAI response');
      console.log('generate-from-file: OpenAI fallback success');
      return res.json({ text, provider: 'openai', success: true, fellBackFrom: 'gemini' });
    } catch (err: any) {
      console.error('generate-from-file: OpenAI failed:', String(err?.message || err).slice(0, 300));
      return res.status(500).json({
        error: 'File-bearing generation failed across all providers',
        geminiError: geminiError ? String(geminiError?.message || geminiError).slice(0, 300) : undefined,
        openaiError: String(err?.message || err).slice(0, 300),
      });
    }
  }

  return res.status(500).json({ error: 'No AI provider available', details: String(geminiError?.message || geminiError) });
});

// ============ TAKEAWAYS GENERATION ============

app.post("/api/ai/generate-takeaways", requireRole("CREATOR"), async (req, res) => {
  const { script, title } = req.body;
  
  if (!script || script.trim().length < 50) {
    return res.status(400).json({ error: "Script is required and must be at least 50 characters" });
  }
  
  const prompt = `Analyze this training lesson and extract:
1. 3-5 key takeaways (the most important concepts or insights)
2. 2-3 actionable items (specific things the learner should do)

Lesson Title: ${title || 'Training Lesson'}

Lesson Content:
${script.substring(0, 8000)}

Respond in this exact JSON format:
{
  "keyTakeaways": ["takeaway 1", "takeaway 2", "takeaway 3"],
  "actionItems": ["action 1", "action 2"]
}

Keep each item concise (under 100 characters). Focus on practical value.`;

  // Try Gemini first
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ parts: [{ text: prompt }] }],
        config: { responseMimeType: 'application/json' }
      });
      
      const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        try {
          const parsed = JSON.parse(text);
          return res.json({
            keyTakeaways: parsed.keyTakeaways || [],
            actionItems: parsed.actionItems || [],
            provider: 'gemini',
            success: true
          });
        } catch (parseError) {
          console.error('Failed to parse Gemini takeaways response:', text);
        }
      }
    } catch (geminiError: any) {
      console.log('Gemini takeaways failed, trying OpenAI:', geminiError?.message);
    }
  }
  
  // OpenAI fallback
  if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 1024,
      });
      
      const text = response.choices[0]?.message?.content;
      if (text) {
        const parsed = JSON.parse(text);
        return res.json({
          keyTakeaways: parsed.keyTakeaways || [],
          actionItems: parsed.actionItems || [],
          provider: 'openai',
          success: true
        });
      }
    } catch (openaiError: any) {
      console.error('OpenAI takeaways failed:', openaiError?.message);
    }
  }
  
  return res.status(500).json({ error: 'Failed to generate takeaways - no AI provider available' });
});

// ============ RESUME PARSING ============

app.post("/api/ai/parse-resume", requireRole("CREATOR"), async (req, res) => {
  const { resumeText } = req.body;
  
  if (!resumeText) {
    return res.status(400).json({ error: "Resume text is required" });
  }
  
  const prompt = `Extract the following information from this resume/CV text and return it as JSON. If a field cannot be found, use an empty string.

Required fields:
- firstName: The person's first name
- lastName: The person's last name  
- email: Email address
- phone: Phone number (digits only, no formatting)
- city: City name
- state: State/Province (abbreviation preferred, e.g., "CA", "NY")

Resume text:
${resumeText}

Return ONLY valid JSON in this exact format, no other text:
{"firstName": "", "lastName": "", "email": "", "phone": "", "city": "", "state": ""}`;

  // Try Gemini first
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ parts: [{ text: prompt }] }],
        config: { responseMimeType: 'application/json' }
      });
      
      const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        try {
          const parsed = JSON.parse(text);
          // Generate password: lastName + last 4 digits of phone
          const phoneDigits = (parsed.phone || '').replace(/\D/g, '');
          const last4 = phoneDigits.slice(-4) || '1234';
          const lastName = parsed.lastName || 'Student';
          parsed.generatedPassword = lastName.toLowerCase() + last4;
          
          return res.json({ ...parsed, provider: 'gemini', success: true });
        } catch (parseError) {
          console.log('Failed to parse Gemini JSON response:', text);
          throw new Error('Invalid JSON from Gemini');
        }
      }
      throw new Error('No text in Gemini response');
    } catch (geminiError: any) {
      console.log('Gemini resume parsing failed, trying OpenAI fallback:', geminiError?.message);
    }
  }
  
  // OpenAI fallback
  if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 1024,
      });
      
      const text = response.choices[0]?.message?.content;
      if (text) {
        try {
          const parsed = JSON.parse(text);
          // Generate password: lastName + last 4 digits of phone
          const phoneDigits = (parsed.phone || '').replace(/\D/g, '');
          const last4 = phoneDigits.slice(-4) || '1234';
          const lastName = parsed.lastName || 'Student';
          parsed.generatedPassword = lastName.toLowerCase() + last4;
          
          return res.json({ ...parsed, provider: 'openai', success: true });
        } catch (parseError) {
          throw new Error('Invalid JSON from OpenAI');
        }
      }
      throw new Error('No text in OpenAI response');
    } catch (openaiError: any) {
      console.error('OpenAI resume parsing failed:', openaiError?.message);
      return res.status(500).json({ 
        error: 'Both Gemini and OpenAI resume parsing failed', 
        details: openaiError?.message 
      });
    }
  }
  
  return res.status(500).json({ error: 'No AI provider available for resume parsing' });
});

// ============ HEALTH CHECK ============

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Database diagnostic endpoint
app.get("/api/db-info", requireRole("CREATOR"), async (req, res) => {
  try {
    const result = await db.select().from(courses);
    const dbType = process.env.SUPABASE_DATABASE_URL ? 'Supabase' : 'Replit';
    const hasSupabaseUrl = !!process.env.SUPABASE_DATABASE_URL;
    const hasReplitUrl = !!process.env.DATABASE_URL;
    
    // Also check lesson_images table
    const imageStats = await db.select({
      courseId: lessonImages.courseId,
      lessonId: lessonImages.lessonId,
    }).from(lessonImages).limit(100);
    
    // Group by course/lesson
    const imageCounts: Record<string, number> = {};
    imageStats.forEach(row => {
      const key = `${row.courseId}/${row.lessonId}`;
      imageCounts[key] = (imageCounts[key] || 0) + 1;
    });
    
    res.json({ 
      database: dbType,
      courseCount: result.length,
      hasSupabaseUrl,
      hasReplitUrl,
      env: process.env.NODE_ENV || 'development',
      imageSamples: Object.keys(imageCounts).slice(0, 10),
      imageCountsTotal: Object.keys(imageCounts).length
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message, database: 'error' });
  }
});


// ============ EMAIL CREDENTIALS ============

// Send email via Resend API (HTTP-based, works on Railway)
const sendEmailWithResend = async (to: string, subject: string, html: string) => {
  const resendKey = process.env.RESEND_API_KEY;
  
  console.log('[EMAIL] RESEND_API_KEY configured:', !!resendKey);
  
  if (!resendKey) {
    throw new Error("RESEND_API_KEY not configured");
  }
  
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + resendKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "Jobs on Demand Academy <onboarding@resend.dev>",
      to: [to],
      subject: subject,
      html: html
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    console.error('[EMAIL] Resend error:', error);
    throw new Error(error.message || "Failed to send email");
  }
  
  const result = await response.json();
  console.log('[EMAIL] Sent successfully:', result.id);
  return result;
};

// Debug endpoint to check SMTP configuration
app.get("/api/debug/smtp-status", requireRole("CREATOR"), async (req, res) => {
  const resendKey = process.env.RESEND_API_KEY;
  res.json({
    resend_api_key_set: !!resendKey,
    resend_api_key_prefix: resendKey ? resendKey.substring(0, 10) + '***' : null,
  });
});

// Test email endpoint using Resend
app.get("/api/debug/test-email", requireRole("CREATOR"), async (req, res) => {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return res.json({ success: false, error: "RESEND_API_KEY not set" });
  }
  
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev",
        to: "marcushall2023@gmail.com",
        subject: "Test Email from Jobs on Demand Academy",
        html: "<h1>Email is working!</h1><p>This test email was sent via Resend API.</p>"
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      res.json({ success: true, message: "Test email sent!", id: data.id });
    } else {
      res.json({ success: false, error: data.message || "Unknown error", details: data });
    }
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});





// Debug endpoint to list ALL users
app.get("/api/debug/list-all-users", requireRole("CREATOR"), async (req, res) => {
  try {
    const allUsers = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role
    }).from(users).limit(20);
    
    res.json({ count: allUsers.length, users: allUsers });
  } catch (error: any) {
    res.json({ error: error?.message });
  }
});

// Debug endpoint to list students
app.get("/api/debug/list-students", requireRole("CREATOR"), async (req, res) => {
  try {
    const students = await db.select({
      id: users.id,
      name: users.name,
      email: users.email
    }).from(users).where(eq(users.role, 'student')).limit(10);
    
    res.json({ count: students.length, students });
  } catch (error: any) {
    res.json({ error: error?.message });
  }
});

// Debug endpoint to test sending to any email
app.get("/api/debug/test-send/:email", requireRole("CREATOR"), async (req, res) => {
  const resendKey = process.env.RESEND_API_KEY;
  const toEmail = req.params.email;
  
  if (!resendKey) {
    return res.json({ success: false, error: "RESEND_API_KEY not set" });
  }
  
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Jobs on Demand Academy <onboarding@resend.dev>",
        to: [toEmail],
        subject: "Test Email from Jobs on Demand Academy",
        html: "<h1>Email is working!</h1><p>This test email was sent to: " + toEmail + "</p>"
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      res.json({ success: true, message: "Email sent to " + toEmail, id: data.id });
    } else {
      res.json({ success: false, error: data.message || "Unknown error", details: data });
    }
  } catch (error: any) {
    res.json({ success: false, error: error.message });
  }
});

// Send login credentials to a student
app.post("/api/students/send-credentials", requireRole("CREATOR"), async (req, res) => {
  try {
    const { studentId, studentIds } = req.body;
    
    // Handle both single and bulk requests
    const idsToProcess = studentIds || (studentId ? [studentId] : []);
    
    if (idsToProcess.length === 0) {
      return res.status(400).json({ error: "No student IDs provided" });
    }
    
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return res.status(500).json({ error: "Email not configured. Please set RESEND_API_KEY environment variable." });
    }
    
    // Get student info from database
    const results: { studentId: string; email: string; success: boolean; error?: string }[] = [];
    
    for (const id of idsToProcess) {
      try {
        const [student] = await db.select().from(users).where(eq(users.id, id));
        
        if (!student) {
          results.push({ studentId: id, email: '', success: false, error: 'Student not found' });
          continue;
        }
        
        if (!student.email) {
          results.push({ studentId: id, email: '', success: false, error: 'No email address' });
          continue;
        }
        
        // Send email
        const loginUrl = process.env.NODE_ENV === 'production' 
          ? 'https://www.jobsondemandacademy.com/login'
          : 'http://localhost:5173/login';
        
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">Jobs on Demand Academy</h1>
                <p style="color: rgba(255,255,255,0.9); margin-top: 8px;">Your Executive Career Training Portal</p>
              </div>
              
              <div style="background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; border-top: none;">
                <h2 style="color: #1e293b; margin-top: 0;">Welcome, ${student.name || 'Student'}!</h2>
                <p style="color: #475569; line-height: 1.6;">
                  Your account has been created. Here are your login credentials:
                </p>
                
                <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
                  <p style="margin: 8px 0; color: #334155;"><strong>Email:</strong> ${student.email}</p>
                  <p style="margin: 8px 0; color: #334155;"><strong>Password:</strong> ${student.password || '(Set by administrator)'}</p>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${loginUrl}" 
                     style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                    Login to Your Account
                  </a>
                </div>
                
                <p style="color: #64748b; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                  If you have any questions, please contact support.
                </p>
              </div>
              
              <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
                © ${new Date().getFullYear()} Jobs on Demand Academy. All rights reserved.
              </div>
            </div>
          `;
        
        await sendEmailWithResend(student.email, 'Your Jobs on Demand Academy Login Credentials', emailHtml);
        results.push({ studentId: id, email: student.email, success: true });
        
      } catch (emailError: any) {
        console.error('[EMAIL] Error sending to student', id, ':', emailError);
        results.push({ studentId: id, email: '', success: false, error: emailError?.message || 'Failed to send' });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    res.json({ 
      success: failCount === 0,
      message: `Sent ${successCount} of ${idsToProcess.length} emails`,
      results 
    });
    
  } catch (error: any) {
    console.error("Error sending credentials:", error);
    res.status(500).json({ error: error?.message || "Failed to send credentials" });
  }
});

// ============ STATIC FILES (Production) ============

const isProduction = process.env.NODE_ENV === "production";
// Honor PORT env var first (Railway/Vercel/Heroku all set this). Fall back to defaults.
const PORT = parseInt(process.env.PORT || (isProduction ? '5000' : '3001'), 10);

if (isProduction) {
  const distPath = path.join(__dirname, "..", "dist");
  app.use(express.static(distPath));
  
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api")) {
      res.sendFile(path.join(distPath, "index.html"));
    } else {
      next();
    }
  });
}

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`API server running on port ${PORT}`);

  // Check Object Storage status at startup
  const storageAvailable = await isObjectStorageConfigured();
  if (storageAvailable) {
    console.log('Media storage: Object Storage (cloud)');
  } else {
    console.log('Media storage: Database (base64) - Object Storage not available');
  }

  // Prewarm DB connection so the first user-facing request doesn't pay the
  // SCRAM/TLS handshake cost. Fire-and-forget — failure is non-fatal.
  try {
    const t0 = Date.now();
    await getRawSql()`SELECT 1`;
    console.log(`DB prewarm: ${Date.now() - t0}ms`);
  } catch (err) {
    console.warn('DB prewarm failed:', err);
  }
});
