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
import { db } from "./db";
import { users, courses, progress, tickets, certificates, lessonAudio, lessonImages } from "../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { ObjectStorageService, ObjectNotFoundError, objectStorageClient } from "./objectStorage";
import { GoogleGenAI, Modality } from "@google/genai";

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
app.post("/api/tts/gemini", async (req, res) => {
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
app.post("/api/tts/elevenlabs", async (req, res) => {
  try {
    const { text, voiceId, apiKey, stability, similarityBoost, speed } = req.body;
    
    if (!text || !voiceId || !apiKey) {
      return res.status(400).json({ error: "Missing text, voiceId, or apiKey" });
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

// ============ STAGED MEDIA UPLOAD ROUTES ============

app.post("/api/media/upload", async (req, res) => {
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

app.post("/api/media/upload-batch", async (req, res) => {
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
app.put("/api/courses/:courseId/lessons/:lessonId/takeaways", async (req, res) => {
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
app.put("/api/courses/:courseId/lessons/:lessonId/audio", async (req, res) => {
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

// Get audio for a specific lesson
app.get("/api/courses/:courseId/lessons/:lessonId/audio", async (req, res) => {
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

// Check if lesson has audio stored (for UI indicators)
app.get("/api/courses/:courseId/lessons/:lessonId/audio/exists", async (req, res) => {
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
app.post("/api/courses/:courseId/lessons/:lessonId/images", async (req, res) => {
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
app.get("/api/courses/:courseId/lessons/:lessonId/images", async (req, res) => {
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
app.get("/api/courses/:courseId/lessons/:lessonId/images/metadata", async (req, res) => {
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
app.get("/api/courses/:courseId/lessons/:lessonId/images/exists", async (req, res) => {
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
app.get("/api/courses/:courseId/lessons/:lessonId/images/:visualIndex", async (req, res) => {
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

// ============ ADMIN/MAINTENANCE ROUTES ============

// Recalculate visual timing from word timestamps
app.post("/api/admin/fix-lesson-timing", async (req, res) => {
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
app.post("/api/admin/fix-lesson-images", async (req, res) => {
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
    res.json(userWithoutPassword);
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
      role: "STUDENT",
      avatarUrl: avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
      phone,
      city,
      state,
      assignedCourseIds: [],
    }).returning();
    
    const { password: _, ...userWithoutPassword } = newUser;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// ============ USERS ROUTES ============

app.get("/api/users", async (req, res) => {
  try {
    const allUsers = await db.select().from(users);
    const usersWithoutPasswords = allUsers.map(({ password, ...rest }) => rest);
    res.json(usersWithoutPasswords);
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ error: "Failed to get users" });
  }
});

app.get("/api/users/:id", async (req, res) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.params.id));
    if (!user) return res.status(404).json({ error: "User not found" });
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    res.status(500).json({ error: "Failed to get user" });
  }
});

app.put("/api/users/:id", async (req, res) => {
  try {
    const { name, email, password, avatarUrl, phone, city, state, assignedCourseIds } = req.body;
    const updateData: any = { name, email, avatarUrl, phone, city, state, assignedCourseIds };
    
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

app.delete("/api/users/:id", async (req, res) => {
  try {
    await db.delete(users).where(eq(users.id, req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// ============ COURSES ROUTES ============

app.get("/api/courses", async (req, res) => {
  // Prevent caching - always return fresh data
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  console.log("GET /api/courses - Starting request");
  
  try {
    // Use raw SQL to extract ONLY essential fields from JSONB
    // This avoids loading 8MB+ per course into Node.js memory
    const result = await db.execute(sql`
      SELECT 
        id,
        created_at,
        data->>'id' as course_id,
        data->>'title' as title,
        data->>'status' as status
      FROM courses
      ORDER BY created_at DESC
    `);
    
    const coursesData = result.rows.map((row: any) => ({
      id: row.course_id || row.id,
      _dbId: row.id,
      title: row.title || 'Untitled Course',
      headline: row.headline || '',
      description: row.description || '',
      status: row.status || 'DRAFT',
      type: row.course_type || 'course',
      ecoverUrl: row.ecover_url || '',
      hasCoverInDb: row.has_cover_in_db === true,
      moduleCount: parseInt(row.module_count) || 0,
      modules: [], // Empty - load on demand via /api/courses/:id
      totalStudents: 0,
      rating: 0,
      _hasFullData: false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
    
    console.log("Returning", coursesData.length, "lightweight course summaries");
    return res.json(coursesData);
  } catch (error: any) {
    console.error("Get courses failed:", error?.message || error);
    return res.status(500).json({ error: "Failed to get courses" });
  }
});

// Old retry logic removed - using simpler approach
app.get("/api/courses/:id", async (req, res) => {
  // Keep existing single-course endpoint
  
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
app.get("/api/courses/:id/cover", async (req, res) => {
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

app.post("/api/courses", async (req, res) => {
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
    console.log("Course created successfully:", newCourse.id);
    res.json({ ...newCourse.data as object, _dbId: newCourse.id });
  } catch (error: any) {
    console.error("Create course error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to create course" });
  }
});

app.put("/api/courses/:id", async (req, res) => {
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
    console.log(`PUT /api/courses/${req.params.id} - Update successful`);
    res.json({ ...updated.data as object, _dbId: updated.id });
  } catch (error: any) {
    console.error(`PUT /api/courses/${req.params.id} - Error:`, error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to update course" });
  }
});

app.delete("/api/courses/:id", async (req, res) => {
  try {
    await db.delete(courses).where(eq(courses.id, req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete course" });
  }
});

// ============ SERVER-SIDE EXPORT (Reliable ZIP creation) ============

app.get("/api/courses/export-all", async (req, res) => {
  try {
    console.log("Starting server-side export of all courses...");
    const allCourses = await db.select().from(courses);
    
    if (allCourses.length === 0) {
      return res.status(404).json({ error: "No courses to export" });
    }
    
    const zip = new JSZip();
    
    // Export all courses
    const coursesData = allCourses.map(c => c.data);
    zip.file("courses.json", JSON.stringify(coursesData, null, 2));
    
    // Add individual course files for easier browsing
    const coursesFolder = zip.folder("individual_courses");
    if (coursesFolder) {
      for (const course of allCourses) {
        const courseData = course.data as any;
        const safeTitle = (courseData.title || 'course').replace(/[^a-z0-9]/gi, '_');
        coursesFolder.file(`${safeTitle}.json`, JSON.stringify(courseData, null, 2));
      }
    }
    
    console.log(`Exporting ${allCourses.length} courses...`);
    
    const content = await zip.generateAsync({ 
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });
    
    const filename = `all_courses_backup_${new Date().toISOString().slice(0,10)}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', content.length);
    res.send(content);
    
    console.log(`Export complete: ${allCourses.length} courses, ${content.length} bytes`);
  } catch (error: any) {
    console.error("Export error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to export courses" });
  }
});

app.get("/api/courses/:id/export", async (req, res) => {
  try {
    const [course] = await db.select().from(courses).where(eq(courses.id, req.params.id));
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }
    
    const courseData = course.data as any;
    const zip = new JSZip();
    
    // Add course metadata
    const { modules, ...metadata } = courseData;
    zip.file("course_metadata.json", JSON.stringify(metadata, null, 2));
    
    // Add modules
    const modulesFolder = zip.folder("modules");
    if (modules && Array.isArray(modules) && modulesFolder) {
      modules.forEach((mod: any, idx: number) => {
        modulesFolder.file(`module_${idx}_${mod.id || idx}.json`, JSON.stringify(mod, null, 2));
      });
    }
    
    const content = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });
    
    const safeTitle = (courseData.title || 'course').replace(/[^a-z0-9]/gi, '_');
    const filename = `${safeTitle}_export.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', content.length);
    res.send(content);
    
    console.log(`Exported course: ${courseData.title}`);
  } catch (error: any) {
    console.error("Export error:", error?.message || error);
    res.status(500).json({ error: error?.message || "Failed to export course" });
  }
});

// ============ COURSE UPLOAD (Server-side ZIP processing) ============

app.post("/api/courses/upload", upload.single("file"), async (req, res) => {
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

app.post("/api/courses/import-url", async (req, res) => {
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

app.get("/api/progress", async (req, res) => {
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

app.get("/api/progress/:userId", async (req, res) => {
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

app.put("/api/progress/:userId/:courseId", async (req, res) => {
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

app.get("/api/tickets", async (req, res) => {
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

app.post("/api/tickets", async (req, res) => {
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

app.put("/api/tickets/:id/status", async (req, res) => {
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

app.get("/api/certificates", async (req, res) => {
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

app.post("/api/certificates", async (req, res) => {
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

app.post("/api/migrate-media", async (req, res) => {
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
app.post("/api/migrate-media/:id", async (req, res) => {
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
app.get("/api/migrate-media/pending", async (req, res) => {
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

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

app.post("/api/ai/generate-image", async (req, res) => {
  const { prompt, aspectRatio = "16:9" } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }
  
  // ONLY use direct Gemini API with GEMINI_API_KEY - NO Replicate, NO OpenAI
  const geminiKey = process.env.GEMINI_API_KEY;
  
  if (!geminiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is required for image generation.' });
  }
  
  try {
    console.log('Generating image with Gemini 3 Pro (gemini-3-pro-image-preview)...');
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts: [{ text: prompt }] },
      config: { 
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: aspectRatio
        }
      }
    });
    
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          console.log('Gemini image generated successfully');
          return res.json({ 
            imageData: part.inlineData.data, 
            provider: 'gemini',
            success: true 
          });
        }
      }
    }
    throw new Error('No image data in Gemini response');
  } catch (geminiError: any) {
    console.error('Gemini image generation failed:', geminiError?.message);
    return res.status(500).json({ 
      error: 'Gemini image generation failed', 
      details: geminiError?.message 
    });
  }
});


// AI Cover Generation endpoint - generates book covers with Gemini
app.post("/api/ai/generate-cover", async (req, res) => {
  const { title, headline, instructions, existingImage } = req.body;
  
  if (!title) {
    return res.status(400).json({ error: "Title is required" });
  }
  
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is required for cover generation.' });
  }
  
  try {
    console.log('Generating AI cover with Gemini...');
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    
    const parts: any[] = [];
    let isEditing = false;
    
    // If existing image provided, add it for editing
    if (existingImage && existingImage.startsWith('data:image')) {
      isEditing = true;
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
          console.log('AI cover generated successfully');
          return res.json({ 
            imageData: `data:image/png;base64,${part.inlineData.data}`,
            success: true 
          });
        }
      }
    }
    throw new Error('No image data in Gemini response');
  } catch (error: any) {
    console.error('Cover generation failed:', error?.message);
    return res.status(500).json({ 
      error: 'Cover generation failed', 
      details: error?.message 
    });
  }
});

// AI Metadata Generation endpoint - generates headlines/descriptions from files
app.post("/api/ai/generate-metadata", async (req, res) => {
  const { target, fileData, fileMimeType, coverData } = req.body;
  
  if (!target || (target !== 'headline' && target !== 'description')) {
    return res.status(400).json({ error: "Target must be 'headline' or 'description'" });
  }
  
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is required.' });
  }
  
  try {
    console.log(`Generating ${target} with Gemini...`);
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    
    const parts: any[] = [];
    
    // Add file if provided
    if (fileData && fileMimeType) {
      parts.push({ inlineData: { data: fileData, mimeType: fileMimeType } });
    }
    
    // Add cover if provided
    if (coverData) {
      const base64 = coverData.includes(',') ? coverData.split(',')[1] : coverData;
      parts.push({ inlineData: { data: base64, mimeType: 'image/png' } });
    }
    
    if (parts.length === 0) {
      return res.status(400).json({ error: "No file or cover data provided" });
    }
    
    const prompt = target === 'headline' 
      ? "Generate course headline (max 15 words). Return JSON: { \"text\": \"...\" }" 
      : "Generate course description (50 words). Return JSON: { \"text\": \"...\" }";
    parts.push({ text: prompt });
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
      config: { responseMimeType: "application/json" }
    });
    
    const json = JSON.parse(response.text || "{}");
    console.log(`${target} generated successfully`);
    return res.json({ text: json.text, success: true });
  } catch (error: any) {
    console.error(`Metadata generation failed:`, error?.message);
    return res.status(500).json({ 
      error: 'Metadata generation failed', 
      details: error?.message 
    });
  }
});

// Simple FLUX test endpoint - generates just 1 test image
app.post("/api/test-flux", async (req, res) => {
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
app.post("/api/ai/generate-text", async (req, res) => {
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

// ============ TAKEAWAYS GENERATION ============

app.post("/api/ai/generate-takeaways", async (req, res) => {
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

app.post("/api/ai/parse-resume", async (req, res) => {
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
app.get("/api/db-info", async (req, res) => {
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
app.get("/api/debug/smtp-status", async (req, res) => {
  const resendKey = process.env.RESEND_API_KEY;
  res.json({
    resend_api_key_set: !!resendKey,
    resend_api_key_prefix: resendKey ? resendKey.substring(0, 10) + '***' : null,
  });
});

// Test email endpoint using Resend
app.get("/api/debug/test-email", async (req, res) => {
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

// Debug endpoint to test sending to any email
app.get("/api/debug/test-send/:email", async (req, res) => {
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


// Debug endpoint to test sending credentials to a specific student ID
app.get("/api/debug/test-student/:id", async (req, res) => {
  try {
    const studentId = req.params.id;
    console.log('[DEBUG] Testing student ID:', studentId);
    
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return res.status(500).json({ error: "RESEND_API_KEY not set" });
    }
    
    // Look up student
    const [student] = await db.select().from(users).where(eq(users.id, studentId));
    
    if (!student) {
      return res.json({ error: "Student not found", studentId });
    }
    
    if (!student.email) {
      return res.json({ error: "Student has no email", studentId, student: { id: student.id, name: student.name } });
    }
    
    // Try to send
    const loginUrl = 'https://www.jobsondemandacademy.com/login';
    const emailHtml = `<p>Test credentials email for ${student.name || 'Student'}</p><p>Email: ${student.email}</p>`;
    
    const result = await sendEmailWithResend(student.email, 'Test Credentials Email', emailHtml);
    
    res.json({ 
      success: true, 
      message: "Email sent!", 
      id: result.id,
      student: { id: student.id, name: student.name, email: student.email }
    });
    
  } catch (error: any) {
    console.error('[DEBUG] Error:', error);
    res.json({ error: error?.message || 'Unknown error', stack: error?.stack });
  }
});

// Send credentials endpoint
app.post("/api/students/send-credentials", async (req, res) => {
  console.log('[SEND-CREDENTIALS] Request received:', JSON.stringify(req.body));
  try {
    const { studentId, studentIds } = req.body;
    console.log('[SEND-CREDENTIALS] studentId:', studentId, 'studentIds:', studentIds);
    
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
        console.log('[SEND-CREDENTIALS] Looking up student ID:', id);
        const [student] = await db.select().from(users).where(eq(users.id, id));
        console.log('[SEND-CREDENTIALS] Found student:', student ? student.email : 'NOT FOUND');
        
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
        console.error('[EMAIL] Error sending to student', id, ':', emailError?.message, emailError?.stack);
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
const PORT = isProduction ? 5000 : 3001;

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
});
