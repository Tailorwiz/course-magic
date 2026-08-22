import { Course, User, SupportTicket, Certificate, GlobalProgressData, StudentProgress } from './types';

const API_BASE = '/api';
const TOKEN_KEY = 'authToken';

// ===== Auth token storage =====
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore quota errors */
  }
}

export function clearToken(): void {
  setToken(null);
}

// Wrapper around fetch that auto-attaches Authorization header and dispatches
// `auth:unauthorized` on 401 so the app can log the user out from a single place.
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  }
  return res;
}

interface MediaUploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

async function uploadMediaAsset(type: 'image' | 'audio' | 'video', data: string, mimeType?: string): Promise<MediaUploadResult> {
  if (!data || data.length < 100) return { success: true, url: data };
  if (data.startsWith('/objects/') || data.startsWith('/media/') || data.startsWith('http')) {
    return { success: true, url: data };
  }
  if (data.startsWith('data:')) {
    return { success: true, url: data };
  }
  if (data === '[IMAGE]' || data === '[AUDIO]' || data === '[VIDEO]') {
    return { success: true, url: data };
  }
  
  try {
    const res = await apiFetch(`${API_BASE}/media/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data, mimeType }),
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err.error || 'Upload failed' };
    }
    
    const result = await res.json();
    return { success: true, url: result.url };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function prepareCourseWithStagedUploads(
  course: Course, 
  onProgress?: (current: number, total: number, message: string) => void
): Promise<Course> {
  const prepared = JSON.parse(JSON.stringify(course));
  
  const mediaItems: Array<{
    type: 'image' | 'audio';
    data: string;
    mimeType?: string;
    path: { moduleIdx: number; lessonIdx: number; field: string; visualIdx?: number };
  }> = [];
  
  if (prepared.modules) {
    for (let m = 0; m < prepared.modules.length; m++) {
      const mod = prepared.modules[m];
      for (let l = 0; l < (mod.lessons || []).length; l++) {
        const lesson = mod.lessons[l];
        
        if (lesson.audioData && lesson.audioData.length > 1000 && 
            !lesson.audioData.startsWith('/') && !lesson.audioData.startsWith('http') &&
            !lesson.audioData.startsWith('data:')) {
          mediaItems.push({
            type: 'audio',
            data: lesson.audioData,
            mimeType: lesson.audioMimeType || 'audio/pcm',
            path: { moduleIdx: m, lessonIdx: l, field: 'audioData' }
          });
        }
        
        if (lesson.visuals) {
          for (let v = 0; v < lesson.visuals.length; v++) {
            const visual = lesson.visuals[v];
            if (visual.imageData && visual.imageData.length > 1000 &&
                !visual.imageData.startsWith('/') && !visual.imageData.startsWith('http') &&
                !visual.imageData.startsWith('data:')) {
              mediaItems.push({
                type: 'image',
                data: visual.imageData,
                mimeType: 'image/png',
                path: { moduleIdx: m, lessonIdx: l, field: 'visuals', visualIdx: v }
              });
            }
          }
        }
      }
    }
  }
  
  // P0.4: Externalize large base64 renderedVideoUrl to lesson_videos table
  // (only runs on update where we have a course id; for create, we can't
  // call lessonVideo.save without an id, so leave the base64 inline and the
  // post-create code in VideoWizard can move it).
  const courseId = (prepared as any)._dbId || prepared.id;
  if (courseId && prepared.modules) {
    for (let m = 0; m < prepared.modules.length; m++) {
      const mod = prepared.modules[m];
      for (let l = 0; l < (mod.lessons || []).length; l++) {
        const lesson = mod.lessons[l];
        const rv: string | undefined = lesson.renderedVideoUrl;
        if (rv && rv.startsWith('data:') && rv.length > 1_000_000) {
          try {
            const sizeMB = (rv.length / 1024 / 1024).toFixed(1);
            console.log(`[P0.4] Externalizing ${sizeMB}MB renderedVideoUrl for lesson ${lesson.id}`);
            const m1 = /^data:([^;]+);base64,/.exec(rv);
            const mimeType = m1?.[1] || 'video/webm';
            await api.lessonVideo.save(courseId, lesson.id, rv, mimeType);
            lesson.renderedVideoUrl = '';
            lesson.hasRenderedVideoInDb = true;
            console.log(`[P0.4] Externalized renderedVideoUrl for lesson ${lesson.id} (${sizeMB}MB removed from JSON)`);
          } catch (err) {
            console.warn(`[P0.4] Failed to externalize renderedVideoUrl for lesson ${lesson.id}:`, err);
          }
        }
      }
    }
  }

  if (mediaItems.length === 0) {
    console.log('No media to upload - saving directly');
    return prepared;
  }

  console.log(`Uploading ${mediaItems.length} media assets...`);
  
  for (let i = 0; i < mediaItems.length; i++) {
    const item = mediaItems[i];
    const pct = Math.round((i / mediaItems.length) * 100);
    
    if (onProgress) {
      onProgress(i + 1, mediaItems.length, `Uploading ${item.type} ${i + 1}/${mediaItems.length}...`);
    }
    
    const result = await uploadMediaAsset(item.type, item.data, item.mimeType);
    
    if (result.success && result.url) {
      const { moduleIdx, lessonIdx, field, visualIdx } = item.path;
      const lesson = prepared.modules[moduleIdx].lessons[lessonIdx];
      
      if (field === 'audioData') {
        lesson.audioData = result.url;
      } else if (field === 'visuals' && visualIdx !== undefined) {
        lesson.visuals[visualIdx].imageData = result.url;
      }
      
      console.log(`[${pct}%] Uploaded ${item.type}: ${result.url?.substring(0, 40)}...`);
    } else {
      console.warn(`Failed to upload ${item.type}: ${result.error}`);
    }
  }
  
  const finalSize = JSON.stringify(prepared).length;
  console.log(`All media uploaded. Final payload: ${(finalSize / 1024 / 1024).toFixed(2)}MB`);
  
  return prepared;
}

function prepareCourseForSave(course: Course): Course {
  const prepared = JSON.parse(JSON.stringify(course));
  
  const initialSize = JSON.stringify(prepared).length;
  const initialMB = initialSize / 1024 / 1024;
  console.log(`Initial course payload: ${initialMB.toFixed(2)}MB`);
  
  // Log renderedVideoUrl status for debugging
  if (prepared.modules) {
    for (const mod of prepared.modules) {
      for (const lesson of (mod.lessons || [])) {
        if (lesson.renderedVideoUrl) {
          const urlLength = lesson.renderedVideoUrl.length;
          const isBase64 = lesson.renderedVideoUrl.startsWith('data:');
          console.log(`Lesson ${lesson.id} renderedVideoUrl: ${isBase64 ? 'base64' : 'url'}, length=${urlLength}`);
        }
      }
    }
  }
  
  if (initialMB > 4 && prepared.modules) {
    console.log(`Payload exceeds 4MB limit - optimizing...`);
    
    for (const mod of prepared.modules) {
      for (const lesson of (mod.lessons || [])) {
        if (lesson.audioData && lesson.audioData.length > 100000) {
          // Mark that audio exists in database (was saved separately)
          lesson.hasAudioInDb = true;
          lesson.audioData = '';
          lesson.audioMimeType = undefined;
        }
        if (lesson.thumbnailData) {
          lesson.thumbnailData = '';
        }
        // P0.4: If renderedVideoUrl wasn't externalized in prepareCourseWithStagedUploads
        // (e.g. course had no id at the time), clear it now to prevent payload bloat.
        // The student player falls back to live audio+images automatically.
        if (lesson.renderedVideoUrl && lesson.renderedVideoUrl.startsWith('data:') &&
            lesson.renderedVideoUrl.length > 1_000_000) {
          console.warn(`[P0.4] Stripping ${(lesson.renderedVideoUrl.length / 1024 / 1024).toFixed(2)}MB inline renderedVideoUrl from lesson ${lesson.id} (was not externalized — re-render to restore)`);
          lesson.renderedVideoUrl = '';
        }
      }
    }
    
    let currentSize = JSON.stringify(prepared).length;
    let currentMB = currentSize / 1024 / 1024;
    console.log(`After stripping audio: ${currentMB.toFixed(2)}MB`);
    
    if (currentMB > 6) {
      console.log(`Still too large - stripping images (prompts preserved for regeneration)...`);
      for (const mod of prepared.modules) {
        for (const lesson of (mod.lessons || [])) {
          if (lesson.visuals) {
            let hasValidImages = false;
            for (const visual of lesson.visuals) {
              if (visual.imageData && visual.imageData.length > 1000) {
                hasValidImages = true;
                visual.imageData = '';
              }
            }
            // Mark that images were stripped and should be fetched from database
            if (hasValidImages) {
              lesson.hasImagesInDb = true;
            }
          }
        }
      }
      currentSize = JSON.stringify(prepared).length;
      currentMB = currentSize / 1024 / 1024;
      console.log(`After stripping images: ${currentMB.toFixed(2)}MB`);
    }
    
    console.log(`Final optimized payload: ${currentMB.toFixed(2)}MB (saved ${(initialMB - currentMB).toFixed(2)}MB)`);
  }
  
  return prepared;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  auth: {
    async login(email: string, password: string): Promise<User | null> {
      try {
        const res = await apiFetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) return null;
        const data = await res.json() as { user: User; token: string };
        if (data.token) setToken(data.token);
        return data.user;
      } catch {
        return null;
      }
    },
    async register(user: Partial<User> & { password: string }): Promise<User> {
      const res = await apiFetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      });
      const data = await handleResponse<{ user: User; token: string }>(res);
      if (data.token) setToken(data.token);
      return data.user;
    },
    async me(): Promise<User | null> {
      try {
        const res = await apiFetch(`${API_BASE}/auth/me`);
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    logout(): void {
      clearToken();
    },
  },

  users: {
    async getAll(): Promise<User[]> {
      const res = await apiFetch(`${API_BASE}/users`);
      return handleResponse<User[]>(res);
    },
    async get(id: string): Promise<User> {
      const res = await apiFetch(`${API_BASE}/users/${id}`);
      return handleResponse<User>(res);
    },
    async update(id: string, data: Partial<User>): Promise<User> {
      const res = await apiFetch(`${API_BASE}/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return handleResponse<User>(res);
    },
    async delete(id: string): Promise<void> {
      await apiFetch(`${API_BASE}/users/${id}`, { method: 'DELETE' });
    },
  },

  courses: {
    async getAll(): Promise<Course[]> {
      const res = await apiFetch(`${API_BASE}/courses`);
      return handleResponse<Course[]>(res);
    },
    async get(id: string): Promise<Course> {
      const res = await apiFetch(`${API_BASE}/courses/${id}`);
      return handleResponse<Course>(res);
    },
    async getCover(id: string): Promise<string | null> {
      try {
        const res = await apiFetch(`${API_BASE}/courses/${id}/cover`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.ecoverUrl || null;
      } catch {
        return null;
      }
    },
    async create(course: Course, onProgress?: (current: number, total: number, message: string) => void): Promise<Course> {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000);
      
      try {
        console.log('Starting staged upload for new course...');
        const uploadedCourse = await prepareCourseWithStagedUploads(course, onProgress);
        
        const bodyStr = JSON.stringify(uploadedCourse);
        const sizeMB = bodyStr.length / 1024 / 1024;
        console.log(`Creating course, final payload size: ${sizeMB.toFixed(2)} MB`);
        
        if (sizeMB > 8) {
          console.log('Payload still too large after staged uploads, applying fallback optimization...');
          const fallbackCourse = prepareCourseForSave(uploadedCourse);
          const fallbackBody = JSON.stringify(fallbackCourse);
          console.log(`Fallback payload size: ${(fallbackBody.length / 1024 / 1024).toFixed(2)} MB`);
          
          const res = await apiFetch(`${API_BASE}/courses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: fallbackBody,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          return handleResponse<Course>(res);
        }
        
        const res = await apiFetch(`${API_BASE}/courses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: bodyStr,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return handleResponse<Course>(res);
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          throw new Error('Save timed out - course data may be too large');
        }
        throw err;
      }
    },
    async update(id: string, course: Course, onProgress?: (current: number, total: number, message: string) => void): Promise<Course> {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000);
      
      try {
        console.log(`Starting staged upload for course ${id}...`);
        const uploadedCourse = await prepareCourseWithStagedUploads(course, onProgress);
        
        const bodyStr = JSON.stringify(uploadedCourse);
        const sizeMB = bodyStr.length / 1024 / 1024;
        console.log(`Saving course ${id}, final payload size: ${sizeMB.toFixed(2)} MB`);
        
        if (sizeMB > 8) {
          console.log('Payload still too large after staged uploads, applying fallback optimization...');
          const fallbackCourse = prepareCourseForSave(uploadedCourse);
          const fallbackBody = JSON.stringify(fallbackCourse);
          console.log(`Fallback payload size: ${(fallbackBody.length / 1024 / 1024).toFixed(2)} MB`);
          
          const res = await apiFetch(`${API_BASE}/courses/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: fallbackBody,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          return handleResponse<Course>(res);
        }
        
        const res = await apiFetch(`${API_BASE}/courses/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: bodyStr,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return handleResponse<Course>(res);
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          throw new Error('Save timed out - course data may be too large');
        }
        throw err;
      }
    },
    async delete(id: string): Promise<void> {
      await apiFetch(`${API_BASE}/courses/${id}`, { method: 'DELETE' });
    },
    async uploadZip(file: File, onProgress?: (progress: number) => void): Promise<{ success: boolean; courses?: Course[]; course?: Course; count?: number }> {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await apiFetch(`${API_BASE}/courses/upload`, {
        method: 'POST',
        body: formData,
      });
      
      return handleResponse<{ success: boolean; courses?: Course[]; course?: Course; count?: number }>(res);
    },
  },

  progress: {
    async getAll(): Promise<GlobalProgressData> {
      const res = await apiFetch(`${API_BASE}/progress`);
      return handleResponse<GlobalProgressData>(res);
    },
    async getForUser(userId: string): Promise<StudentProgress> {
      const res = await apiFetch(`${API_BASE}/progress/${userId}`);
      return handleResponse<StudentProgress>(res);
    },
    async update(userId: string, courseId: string, completedLessons: string[]): Promise<void> {
      await apiFetch(`${API_BASE}/progress/${userId}/${courseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completedLessons }),
      });
    },
  },

  tickets: {
    async getAll(): Promise<SupportTicket[]> {
      const res = await apiFetch(`${API_BASE}/tickets`);
      return handleResponse<SupportTicket[]>(res);
    },
    async create(ticket: SupportTicket): Promise<SupportTicket> {
      const res = await apiFetch(`${API_BASE}/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticket),
      });
      return handleResponse<SupportTicket>(res);
    },
    async updateStatus(id: string, status: 'open' | 'resolved'): Promise<void> {
      await apiFetch(`${API_BASE}/tickets/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    },
  },

  certificates: {
    async getAll(): Promise<Certificate[]> {
      const res = await apiFetch(`${API_BASE}/certificates`);
      return handleResponse<Certificate[]>(res);
    },
    async create(cert: Omit<Certificate, 'id' | 'issueDate'>): Promise<Certificate> {
      const res = await apiFetch(`${API_BASE}/certificates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cert),
      });
      return handleResponse<Certificate>(res);
    },
  },

  lessonAudio: {
    async save(courseId: string, lessonId: string, audioData: string, mimeType?: string, wordTimestamps?: Array<{word: string, start: number, end: number}>): Promise<{ success: boolean }> {
      console.log(`Saving audio directly to database: courseId=${courseId}, lessonId=${lessonId}, size=${(audioData.length / 1024 / 1024).toFixed(2)}MB`);
      const res = await apiFetch(`${API_BASE}/courses/${courseId}/lessons/${lessonId}/audio`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioData, mimeType, wordTimestamps }),
      });
      return handleResponse<{ success: boolean }>(res);
    },
    async get(courseId: string, lessonId: string): Promise<{ audioData: string; mimeType: string; wordTimestamps: Array<{word: string, start: number, end: number}> } | null> {
      try {
        const res = await apiFetch(`${API_BASE}/courses/${courseId}/lessons/${lessonId}/audio`);
        if (res.status === 404) return null;
        return handleResponse<{ audioData: string; mimeType: string; wordTimestamps: Array<{word: string, start: number, end: number}> }>(res);
      } catch {
        return null;
      }
    },
    async exists(courseId: string, lessonId: string): Promise<boolean> {
      try {
        const res = await apiFetch(`${API_BASE}/courses/${courseId}/lessons/${lessonId}/audio/exists`);
        const data = await res.json();
        return data.exists || false;
      } catch {
        return false;
      }
    },
    // P0.1: Build a streaming URL the <audio> tag can use directly.
    // The token is in the query string because <audio> can't set headers.
    streamUrl(courseId: string, lessonId: string): string {
      const t = getToken();
      const tokenParam = t ? `?token=${encodeURIComponent(t)}` : '';
      return `${API_BASE}/courses/${courseId}/lessons/${lessonId}/audio/stream${tokenParam}`;
    },
    async getTimestamps(courseId: string, lessonId: string): Promise<{ mimeType: string; wordTimestamps: Array<{word: string, start: number, end: number}> } | null> {
      try {
        const res = await apiFetch(`${API_BASE}/courses/${courseId}/lessons/${lessonId}/audio/timestamps`);
        if (res.status === 404) return null;
        return handleResponse<{ mimeType: string; wordTimestamps: Array<{word: string, start: number, end: number}> }>(res);
      } catch {
        return null;
      }
    },
    // P2.3: Backfill word-level timestamps via OpenAI Whisper for lessons whose audio
    // came from a TTS provider that didn't return them (e.g. Gemini).
    async align(courseId: string, lessonId: string): Promise<{ success: boolean; wordCount: number; elapsedMs: number; audioMB: number; transcriptPreview?: string } | null> {
      try {
        const res = await apiFetch(`${API_BASE}/courses/${courseId}/lessons/${lessonId}/audio/align`, {
          method: 'POST',
        });
        return handleResponse<any>(res);
      } catch (e) {
        return null;
      }
    },
  },

  lessonImages: {
    async save(courseId: string, lessonId: string, images: Array<{visualIndex: number, imageData: string, prompt?: string}>): Promise<{ success: boolean; count: number }> {
      console.log(`Saving ${images.length} images to database: courseId=${courseId}, lessonId=${lessonId}`);
      const res = await apiFetch(`${API_BASE}/courses/${courseId}/lessons/${lessonId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images }),
      });
      return handleResponse<{ success: boolean; count: number }>(res);
    },
    async get(courseId: string, lessonId: string): Promise<Array<{visualIndex: number, imageData: string, prompt?: string}>> {
      try {
        console.log(`[API lessonImages.get] Fetching from: ${API_BASE}/courses/${courseId}/lessons/${lessonId}/images`);
        const res = await apiFetch(`${API_BASE}/courses/${courseId}/lessons/${lessonId}/images`);
        console.log(`[API lessonImages.get] Response status: ${res.status}`);
        if (res.status === 404) return [];
        const data = await handleResponse<Array<{visualIndex: number, imageData: string, prompt?: string}>>(res);
        console.log(`[API lessonImages.get] Received ${data?.length || 0} images`);
        return data;
      } catch (err) {
        console.error('[API lessonImages.get] Error:', err);
        return [];
      }
    },
    async exists(courseId: string, lessonId: string): Promise<{ exists: boolean; count: number }> {
      try {
        const res = await apiFetch(`${API_BASE}/courses/${courseId}/lessons/${lessonId}/images/exists`);
        const data = await res.json();
        return { exists: data.exists || false, count: data.count || 0 };
      } catch {
        return { exists: false, count: 0 };
      }
    },
    async getOne(courseId: string, lessonId: string, visualIndex: number): Promise<{visualIndex: number, imageData: string, prompt?: string} | null> {
      try {
        const res = await apiFetch(`${API_BASE}/courses/${courseId}/lessons/${lessonId}/images/${visualIndex}`);
        if (res.status === 404) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    async getMetadata(courseId: string, lessonId: string): Promise<Array<{visualIndex: number, prompt?: string}>> {
      try {
        const res = await apiFetch(`${API_BASE}/courses/${courseId}/lessons/${lessonId}/images/metadata`);
        if (res.status === 404) return [];
        return res.json();
      } catch {
        return [];
      }
    },
    // P0.2: Build a streaming URL for an <img> tag. Token in query because <img> can't set headers.
    streamUrl(courseId: string, lessonId: string, visualIndex: number | string): string {
      const t = getToken();
      const tokenParam = t ? `?token=${encodeURIComponent(t)}` : '';
      return `${API_BASE}/courses/${courseId}/lessons/${lessonId}/images/${visualIndex}/stream${tokenParam}`;
    },
  },

  // P0.4: Rendered MP4/WebM videos stored separately from course JSON.
  lessonVideo: {
    async save(courseId: string, lessonId: string, videoData: string, mimeType?: string): Promise<{ success: boolean }> {
      const res = await apiFetch(`${API_BASE}/courses/${courseId}/lessons/${lessonId}/video`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoData, mimeType }),
      });
      return handleResponse<{ success: boolean }>(res);
    },
    streamUrl(courseId: string, lessonId: string): string {
      const t = getToken();
      const tokenParam = t ? `?token=${encodeURIComponent(t)}` : '';
      return `${API_BASE}/courses/${courseId}/lessons/${lessonId}/video/stream${tokenParam}`;
    },
    async exists(courseId: string, lessonId: string): Promise<boolean> {
      try {
        const res = await apiFetch(`${API_BASE}/courses/${courseId}/lessons/${lessonId}/video/exists`);
        const data = await res.json();
        return data.exists || false;
      } catch {
        return false;
      }
    },
  },

  ai: {
    // Image generation — GPT Image 2 on the server. No provider options.
    async generateImage(
      prompt: string,
      aspectRatio: string = "16:9",
    ): Promise<{ imageData: string; provider: string; success: boolean }> {
      const res = await apiFetch(`${API_BASE}/ai/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, aspectRatio }),
      });
      return handleResponse<{ imageData: string; provider: string; success: boolean }>(res);
    },
    // Text generation — Claude on the server.
    async generateText(prompt: string, jsonMode: boolean = false, maxTokens?: number): Promise<{ text: string; provider: string; success: boolean }> {
      const res = await apiFetch(`${API_BASE}/ai/generate-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, jsonMode, maxTokens }),
      });
      return handleResponse<{ text: string; provider: string; success: boolean }>(res);
    },
  },
};
