
import React, { useState, useEffect, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle2, Film, Mic, Video, Sparkles, ChevronRight, AlertCircle, Play, Image as ImageIcon, Music, Type as TypeIcon, Loader2, PauseCircle, Volume2, Square, Zap, Timer, Palette, Subtitles, AlignCenter, Layers, Edit3, Trash2, Plus, Save, RotateCcw, RefreshCw, Wand2, Gauge, PaintBucket, LayoutTemplate, Link as LinkIcon, File as FileIcon, ListMusic, MessageSquarePlus, Bot, Settings2, ZoomIn, X, WifiOff, BatteryCharging, Layout, Upload, Download, Maximize2, PlayCircle, RefreshCcw as ResetIcon, BookOpen, ArrowRight, Move, Award } from 'lucide-react';
import { Button } from '../components/Button';
import { Input, TextArea } from '../components/Input';
import { Course, CourseStatus, Module, Lesson, LessonStatus, VisualAsset, VoiceOption, CaptionStyle, GenerationMode, CaptionPosition, CaptionSize, VisualMode, Resource, ResourceType, MusicMode, CourseTheme } from '../types';
import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";
import { pcmToWav, createSolidColorImage, exportVideoAssetsZip, safeExportCourse, getAudioDurationFromBlob, renderVideoFromLesson, downloadBlob, convertPdfToImages, compressBase64Image } from '../utils';
import { MOCK_COURSE, CURRENT_USER, DEFAULT_ELEVEN_LABS_KEY } from '../constants';
import { api } from '../api';

interface CourseWizardProps {
  initialCourse?: Course;
  onCancel: () => void;
  onComplete: (course: Course) => void;
}

type WizardStep = 'upload' | 'strategy' | 'outline' | 'content' | 'rendering' | 'complete';
type ModuleCountMode = 'auto' | 'small' | 'medium' | 'large' | 'xlarge';
type LessonCountMode = 'auto' | 'short' | 'medium' | 'long';

interface ElevenLabsVoice {
    voice_id: string;
    name: string;
    preview_url?: string;
}

const MUSIC_TRACKS = [
    { name: 'Inspirational Rise', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
    { name: 'Educational Lo-Fi', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
    { name: 'Corporate Success', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
    { name: 'Deep Focus', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
    { name: 'Creative Spark', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3' },
    { name: 'Morning Light', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3' },
    { name: 'Tech Innovation', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3' },
    { name: 'Calm Learning', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' },
    { name: 'Achievement Unlocked', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3' },
    { name: 'Future Vision', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3' },
];

const VISUAL_STYLES = [
    "Minimalist Flat Vector", 
    "Photorealistic 4K", 
    "Cinematic Lighting", 
    "Hand-drawn Sketch", 
    "3D Isometric Render", 
    "Cyberpunk Neon", 
    "Watercolor Illustration", 
    "Pixar Animation Style", 
    "Abstract Geometric", 
    "Vintage Blueprint"
];

const VISUAL_STYLE_PREVIEWS: Record<string, string> = {
    "Minimalist Flat Vector": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80",
    "Photorealistic 4K": "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&q=80",
    "Cinematic Lighting": "https://images.unsplash.com/photo-1514306191717-45224512c2d2?w=400&q=80",
    "Hand-drawn Sketch": "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=400&q=80",
    "3D Isometric Render": "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=400&q=80",
    "Cyberpunk Neon": "https://images.unsplash.com/photo-1555680202-c86f0e12f086?w=400&q=80",
    "Watercolor Illustration": "https://images.unsplash.com/photo-1579783902614-a3fb39279c0f?w=400&q=80",
    "Pixar Animation Style": "https://images.unsplash.com/photo-1633511090164-b43840ea1607?w=400&q=80",
    "Abstract Geometric": "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=400&q=80",
    "Vintage Blueprint": "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=400&q=80"
};

const ECOVER_TEMPLATES: string[] = [
    "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&q=80", // Corporate Meeting
    "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&q=80", // Professional Woman
    "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=800&q=80", // Professional Man Suit
    "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&q=80"  // Business Strategy / Analytics
];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to resize images to avoid LocalStorage limits
const resizeImage = (base64Str: string, maxWidth = 800, quality = 0.7): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.crossOrigin = "Anonymous"; // Allow cross-origin for URL images
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality)); // Compress to JPEG
    };
    img.onerror = () => {
        // Fallback for CORS issues - just return original URL if it's not base64
        resolve(base64Str); 
    }
  });
};

async function withRetry<T>(fn: () => Promise<T>, retries = 3, initialDelay = 2000): Promise<T> {
    try {
        return await fn();
    } catch (error: any) {
        // Check for Rate Limit (429) or Server Overload (503/500)
        const isRateLimit = error?.status === 429 || 
                            error?.code === 429 || 
                            error?.message?.includes('429') || 
                            error?.message?.includes('quota') || 
                            error?.message?.includes('RESOURCE_EXHAUSTED');
                            
        const isServerError = error?.status >= 500 || error?.code >= 500 || error?.message?.includes('500') || error?.message?.includes('503');
        const isNetworkError = error?.message?.toLowerCase().includes('network') || error?.message?.toLowerCase().includes('failed to fetch');
        
        if (retries > 0 && (isRateLimit || isServerError || isNetworkError)) {
            const delayTime = isRateLimit ? Math.max(initialDelay, 30000) : initialDelay; 
            console.warn(`API Error (${error.message || error.status}). Retrying in ${delayTime/1000}s... (${retries} attempts left)`);
            await delay(delayTime);
            return withRetry(fn, retries - 1, delayTime * 1.5);
        }
        throw error;
    }
}

// Word timestamp interface for caption sync
interface WordTimestamp {
    word: string;
    start: number; // milliseconds
    end: number;   // milliseconds
}

const getVoiceModel = (name: VoiceOption) => {
    switch(name) {
        case 'Fenrir (Deep)': return 'Fenrir';
        case 'Puck (Tenor)': return 'Puck';
        case 'Charon (Deep)': return 'Charon';
        case 'Orion': return 'Fenrir';
        case 'Leo': return 'Puck';
        case 'Marcus': return 'Charon';
        case 'Atlas': return 'Fenrir';
        case 'Caleb': return 'Puck';
        case 'Silas': return 'Charon';
        default: return 'Fenrir';
    }
}

const calculateDurationFromText = (text: string): number => {
    const words = text.trim().split(/\s+/).length;
    // Average speaking rate: ~150 words per minute = 2.5 words per second
    const duration = Math.ceil(words / 2.5);
    return Math.max(duration, 15); // Minimum 15 seconds
};

export const CourseWizard: React.FC<CourseWizardProps> = ({ initialCourse, onCancel, onComplete }) => {
  const [step, setStep] = useState<WizardStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  
  // Theme State
  const [theme, setTheme] = useState<CourseTheme>({
      primaryColor: '#1e1b4b', // Default Indigo 950
      accentColor: '#4f46e5',  // Default Indigo 600
      backgroundColor: '#f1f5f9', // Default Slate 100
      borderColor: '#cbd5e1',   // Default Slate 300
      textColor: '#1e293b', // Default Slate 800
      isBoldText: false,
      fontFamily: 'Inter, sans-serif'
  });

  // Ecover State
  const [ecoverFile, setEcoverFile] = useState<File | null>(null);
  const [ecoverPreview, setEcoverPreview] = useState<string>('');
  const [ecoverMode, setEcoverMode] = useState<'upload' | 'generate' | 'template'>('upload');
  const [isGeneratingEcover, setIsGeneratingEcover] = useState(false);
  const [ecoverInstructions, setEcoverInstructions] = useState('');
  const [customTemplates, setCustomTemplates] = useState<string[]>([]);
  const templateInputRef = useRef<HTMLInputElement>(null);
  const libraryImportRef = useRef<HTMLInputElement>(null);

  const [courseDetails, setCourseDetails] = useState({ title: '', description: '', headline: '' });
  const [generationStrategy, setGenerationStrategy] = useState<GenerationMode>('hybrid');
  const [moduleCountMode, setModuleCountMode] = useState<ModuleCountMode>('auto');
  const [lessonCountMode, setLessonCountMode] = useState<LessonCountMode>('auto');
  const [outlineInstructions, setOutlineInstructions] = useState(''); 
  const [refineInstructions, setRefineInstructions] = useState(''); 
  
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>('Fenrir (Deep)');
  const [selectedCaptionStyle, setSelectedCaptionStyle] = useState<CaptionStyle>('Modern');
  const [selectedVisualStyle, setSelectedVisualStyle] = useState(VISUAL_STYLES[0]);
  const [visualPacing, setVisualPacing] = useState<'Normal' | 'Fast' | 'Turbo'>('Normal');
  const [visualMode, setVisualMode] = useState<VisualMode>('AI_Scene');
  const [solidColor, setSolidColor] = useState<string>('#4f46e5');
  
  // Image Provider Selection (uses user's own API keys only)
  const [selectedImageProvider, setSelectedImageProvider] = useState<'gemini' | 'openai' | 'flux' | 'flux-schnell' | 'nano-banana'>('gemini');

  // ElevenLabs State - Hardcoded Default
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState(DEFAULT_ELEVEN_LABS_KEY);
  const [elevenLabsVoices, setElevenLabsVoices] = useState<ElevenLabsVoice[]>([]);
  const [isFetchingVoices, setIsFetchingVoices] = useState(false);

  // Voice Control Settings (ElevenLabs specific)
  const [voiceSpeed, setVoiceSpeed] = useState<number>(1.0); // 0.5 to 2.0
  const [voiceStability, setVoiceStability] = useState<number>(0.5); // 0 to 1 (lower = more expressive)
  const [voiceSimilarityBoost, setVoiceSimilarityBoost] = useState<number>(0.75); // 0 to 1

  const [showSubtitles, setShowSubtitles] = useState(false);
  const [captionPosition, setCaptionPosition] = useState<CaptionPosition>('Bottom');
  const [captionSize, setCaptionSize] = useState<CaptionSize>('Medium');
  const [captionColor, setCaptionColor] = useState<string>('#ffffff');
  const [captionBgColor, setCaptionBgColor] = useState<string>(''); 
  const [captionOutlineColor, setCaptionOutlineColor] = useState<string>(''); 
  
  const [includeMusic, setIncludeMusic] = useState(true);
  const [musicMode, setMusicMode] = useState<MusicMode>('Continuous');
  const [selectedMusicTrack, setSelectedMusicTrack] = useState(MUSIC_TRACKS[0].url);

  const [isPreviewingVoice, setIsPreviewingVoice] = useState(false);
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const musicPreviewRef = useRef<HTMLAudioElement | null>(null);

  const [modules, setModules] = useState<Module[]>([]);
  const modulesRef = useRef<Module[]>([]);
  
  const [parsingProgress, setParsingProgress] = useState(0);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [renderingStatus, setRenderingStatus] = useState<string>(""); 
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [isRefining, setIsRefining] = useState(false); 
  const [generatingImageId, setGeneratingImageId] = useState<string | null>(null);
  
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);
  const [isDraftingContent, setIsDraftingContent] = useState(false);
  const [bulkGeneratingId, setBulkGeneratingId] = useState<string | null>(null); 
  
  const [isAutoGeneratingDetails, setIsAutoGeneratingDetails] = useState<'headline' | 'description' | null>(null);
  const [recoveryAvailable, setRecoveryAvailable] = useState<boolean>(false);
  
  const [isAddingResource, setIsAddingResource] = useState(false);
  const [newResource, setNewResource] = useState<Partial<Resource>>({ type: 'link', title: '' });

  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [isRegeneratingVisuals, setIsRegeneratingVisuals] = useState<string | null>(null);

  // Add New Lesson Modal State
  const [showAddLessonModal, setShowAddLessonModal] = useState(false);
  const [newLessonTitle, setNewLessonTitle] = useState('');
  const [newLessonScript, setNewLessonScript] = useState('');
  const [newLessonScriptMode, setNewLessonScriptMode] = useState<'own' | 'ai'>('own');
  const [newLessonAiPrompt, setNewLessonAiPrompt] = useState('');
  const [newLessonTargetModule, setNewLessonTargetModule] = useState<string>('');
  const [newLessonPosition, setNewLessonPosition] = useState<number>(0);
  const [newLessonType, setNewLessonType] = useState<'blank' | 'full'>('blank');
  const [isGeneratingNewLesson, setIsGeneratingNewLesson] = useState(false);

  // Module Management State
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [showMoveLesson, setShowMoveLesson] = useState<string | null>(null);

  const geminiVoices: VoiceOption[] = ['Fenrir (Deep)', 'Charon (Deep)', 'Puck (Tenor)', 'Leo', 'Orion', 'Marcus', 'Atlas', 'Caleb', 'Silas'];
  const captionStyles: CaptionStyle[] = ['Viral (Strike)', 'Viral (Clean)', 'Viral (Box)', 'Viral (Pop)', 'None', 'Modern', 'Outline', 'Cinematic', 'Karaoke', 'Minimalist', 'News Ticker', 'Typewriter', 'Comic Book', 'Neon Glow', 'Subtitle', 'Handwritten'];

  useEffect(() => {
      modulesRef.current = modules;
  }, [modules]);

  useEffect(() => {
      const key = localStorage.getItem('elevenLabsKey') || DEFAULT_ELEVEN_LABS_KEY;
      setElevenLabsApiKey(key);
      if(key) {
          fetchElevenLabsVoices(key);
      }
  }, []);

  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
        if ('wakeLock' in navigator && (navigator as any).wakeLock) {
            try {
                wakeLock = await (navigator as any).wakeLock.request('screen');
            } catch (err) {
                console.warn("Wake Lock failed", err);
            }
        }
    };
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && isWorking) {
            requestWakeLock();
        }
    };
    const isWorking = isProcessingAI || isDraftingContent || !!bulkGeneratingId || !!generatingImageId || step === 'rendering';
    if (isWorking) {
        requestWakeLock();
        document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    return () => {
        if (wakeLock) wakeLock.release();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isProcessingAI, isDraftingContent, bulkGeneratingId, generatingImageId, step]);

  useEffect(() => {
    if (step === 'upload' || step === 'complete' || recoveryAvailable) return;
    const recoveryPayload = {
        courseDetails, modules, step, ecoverPreview, selectedVoice, selectedCaptionStyle, selectedVisualStyle, visualPacing, visualMode, solidColor, includeMusic, selectedMusicTrack, musicMode, showSubtitles, captionPosition, captionSize, captionColor, captionBgColor, captionOutlineColor, theme, ts: Date.now()
    };
    try {
        localStorage.setItem('cm_recovery_data', JSON.stringify(recoveryPayload));
    } catch (e: any) {
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            try {
                const liteModules = modules.map(m => ({ ...m, lessons: m.lessons.map(l => ({ ...l, visuals: l.visuals?.map(v => ({...v, imageData: ''})), thumbnailData: '', audioData: '' })) }));
                const litePayload = { ...recoveryPayload, modules: liteModules, ecoverPreview: ecoverPreview.length > 5000 ? '' : ecoverPreview };
                localStorage.setItem('cm_recovery_data', JSON.stringify(litePayload));
            } catch (err) { console.error("Auto-save failed completely", err); }
        }
    }
  }, [courseDetails, modules, step, ecoverPreview, selectedVoice, selectedCaptionStyle, selectedVisualStyle, visualPacing, visualMode, solidColor, recoveryAvailable, includeMusic, selectedMusicTrack, musicMode, showSubtitles, captionPosition, captionSize, captionColor, captionBgColor, captionOutlineColor, theme]);

  useEffect(() => {
      const saved = localStorage.getItem('cm_custom_ecover_templates');
      if (saved) { try { const parsed = JSON.parse(saved); setCustomTemplates(parsed.length > 0 ? parsed : ECOVER_TEMPLATES); } catch(e) { setCustomTemplates(ECOVER_TEMPLATES); } } else { setCustomTemplates(ECOVER_TEMPLATES); }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('cm_recovery_data');
    if (saved && !initialCourse) {
        try { const parsed = JSON.parse(saved); if (parsed.modules && parsed.modules.length > 0 && parsed.step !== 'complete') { setRecoveryAvailable(true); } } catch(e) {}
    }
  }, [initialCourse]);

  const handleResume = () => {
    const saved = localStorage.getItem('cm_recovery_data');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            setCourseDetails(parsed.courseDetails);
            setModules(parsed.modules);
            setStep(parsed.step);
            if (parsed.ecoverPreview) setEcoverPreview(parsed.ecoverPreview);
            if (parsed.selectedVoice) setSelectedVoice(parsed.selectedVoice);
            if (parsed.selectedCaptionStyle) setSelectedCaptionStyle(parsed.selectedCaptionStyle);
            if (parsed.selectedVisualStyle) setSelectedVisualStyle(parsed.selectedVisualStyle);
            if (parsed.visualPacing) setVisualPacing(parsed.visualPacing);
            if (parsed.visualMode) setVisualMode(parsed.visualMode);
            if (parsed.solidColor) setSolidColor(parsed.solidColor);
            if (parsed.includeMusic !== undefined) setIncludeMusic(parsed.includeMusic);
            if (parsed.selectedMusicTrack) setSelectedMusicTrack(parsed.selectedMusicTrack);
            if (parsed.musicMode) setMusicMode(parsed.musicMode);
            if (parsed.showSubtitles !== undefined) setShowSubtitles(parsed.showSubtitles);
            if (parsed.captionPosition) setCaptionPosition(parsed.captionPosition);
            if (parsed.captionSize) setCaptionSize(parsed.captionSize);
            if (parsed.captionColor) setCaptionColor(parsed.captionColor);
            if (parsed.captionBgColor) setCaptionBgColor(parsed.captionBgColor);
            if (parsed.captionOutlineColor) setCaptionOutlineColor(parsed.captionOutlineColor);
            if (parsed.theme) setTheme(parsed.theme);
            setRecoveryAvailable(false);
        } catch (e) { handleDiscardRecovery(); }
    }
  };

  const handleDiscardRecovery = () => { localStorage.removeItem('cm_recovery_data'); setRecoveryAvailable(false); };
  const clearRecovery = () => { localStorage.removeItem('cm_recovery_data'); };

  useEffect(() => {
    if (initialCourse) {
      setCourseDetails({ title: initialCourse.title || '', description: initialCourse.description || '', headline: initialCourse.headline || '' });
      setEcoverPreview(initialCourse.ecoverUrl || '');
      const defaultTheme = { primaryColor: '#1e1b4b', accentColor: '#4f46e5', backgroundColor: '#f1f5f9', borderColor: '#cbd5e1', textColor: '#1e293b', isBoldText: false, fontFamily: 'Inter, sans-serif' };
      setTheme(initialCourse.theme ? { ...defaultTheme, ...initialCourse.theme } : defaultTheme);
      const cleanModules = (initialCourse.modules || []).map(m => ({ ...m, title: m.title || '', lessons: (m.lessons || []).map(l => ({ ...l, title: l.title || '', sourceText: l.sourceText || '', duration: l.duration || '0:00', visuals: (l.visuals || []).map(v => ({ ...v, prompt: v.prompt || '', overlayText: v.overlayText || '', scriptText: v.scriptText || '' })) })) }));
      setModules(cleanModules);
      const firstLesson = cleanModules[0]?.lessons[0];
      if (firstLesson) {
          if (firstLesson.voice) setSelectedVoice(firstLesson.voice);
          if (firstLesson.captionStyle) setSelectedCaptionStyle(firstLesson.captionStyle);
          if (firstLesson.visualStyle) setSelectedVisualStyle(firstLesson.visualStyle);
          if (firstLesson.visualPacing) setVisualPacing(firstLesson.visualPacing);
          if (firstLesson.visualMode) setVisualMode(firstLesson.visualMode);
          if (firstLesson.solidColor) setSolidColor(firstLesson.solidColor);
          if (firstLesson.captionPosition) setCaptionPosition(firstLesson.captionPosition);
          if (firstLesson.captionSize) setCaptionSize(firstLesson.captionSize);
          if (firstLesson.captionColor) setCaptionColor(firstLesson.captionColor);
          if (firstLesson.captionBgColor) setCaptionBgColor(firstLesson.captionBgColor);
          if (firstLesson.captionOutlineColor) setCaptionOutlineColor(firstLesson.captionOutlineColor);
          if (firstLesson.backgroundMusicUrl) { setIncludeMusic(true); setSelectedMusicTrack(firstLesson.backgroundMusicUrl); } else { setIncludeMusic(false); }
          if (firstLesson.musicMode) setMusicMode(firstLesson.musicMode);
          if (firstLesson.captionTextSource === 'script') setShowSubtitles(true);
          setExpandedLessonId(firstLesson.id);
      }
      setStep('content');
    }
  }, [initialCourse]);

  const fetchElevenLabsVoices = async (apiKey: string) => {
      setIsFetchingVoices(true);
      try {
          const response = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': apiKey } });
          if (!response.ok) throw new Error('Invalid API Key');
          const data = await response.json();
          setElevenLabsVoices(data.voices.map((v: any) => ({ voice_id: v.voice_id, name: v.name, preview_url: v.preview_url })));
          localStorage.setItem('elevenLabsKey', apiKey);
      } catch (error) { console.error(error); } finally { setIsFetchingVoices(false); }
  };

  const handleElevenLabsKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => { const key = e.target.value; setElevenLabsApiKey(key); if (key.length > 10) { fetchElevenLabsVoices(key); } };
  const updateAllLessons = (key: keyof Lesson, value: any) => { setModules(prev => prev.map(m => ({ ...m, lessons: m.lessons.map(l => ({ ...l, [key]: value })) }))); };
  const applyVoiceToAllAndReset = () => { setModules(prev => prev.map(m => ({ ...m, lessons: m.lessons.map(l => ({ ...l, voice: selectedVoice, audioData: undefined, audioMimeType: undefined, status: LessonStatus.SCRIPTING })) }))); alert(`Voice set to "${selectedVoice}" for all lessons. Existing audio cleared.`); };
  const handleGlobalVoiceChange = (v: string) => { setSelectedVoice(v); };
  const handleGlobalCaptionStyleChange = (s: CaptionStyle) => { setSelectedCaptionStyle(s); if (step === 'content') updateAllLessons('captionStyle', s); };
  const handleGlobalMusicChange = (url: string) => { setSelectedMusicTrack(url); if (step === 'content') updateAllLessons('backgroundMusicUrl', url); };
  const handleGlobalMusicModeChange = (mode: MusicMode) => { setMusicMode(mode); if (step === 'content') updateAllLessons('musicMode', mode); };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files[0]) { setFile(e.target.files[0]); setCourseDetails(prev => ({...prev, title: e.target.files![0].name.replace(/\.[^/.]+$/, "")})); } };
  const handleEcoverChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files[0]) { const imgFile = e.target.files[0]; setEcoverFile(imgFile); const reader = new FileReader(); reader.onloadend = () => { setEcoverPreview(reader.result as string); }; reader.readAsDataURL(imgFile); } };
  const saveTemplatesToStorage = (templates: string[]) => { try { localStorage.setItem('cm_custom_ecover_templates', JSON.stringify(templates)); } catch (e: any) { console.error("Storage Error", e); } }
  const handleUploadTemplate = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files[0]) { const file = e.target.files[0]; const reader = new FileReader(); reader.onloadend = async () => { const result = reader.result as string; const compressed = await resizeImage(result, 600, 0.7); const newTemplates = [compressed, ...customTemplates]; setCustomTemplates(newTemplates); saveTemplatesToStorage(newTemplates); setEcoverPreview(compressed); }; reader.readAsDataURL(file); } };
  const handleSaveCurrentToLibrary = async () => { if (ecoverPreview && ecoverPreview.startsWith('data:image')) { const compressed = await resizeImage(ecoverPreview, 600, 0.7); if (customTemplates.includes(compressed)) { alert("Already in library."); return; } const newTemplates = [compressed, ...customTemplates]; setCustomTemplates(newTemplates); saveTemplatesToStorage(newTemplates); alert("Saved!"); } };
  const deleteTemplate = (index: number) => { const newTemplates = [...customTemplates]; newTemplates.splice(index, 1); setCustomTemplates(newTemplates); saveTemplatesToStorage(newTemplates); };
  const handleSelectTemplate = async (templateUrl: string) => { if (templateUrl.startsWith('data:')) { setEcoverPreview(templateUrl); return; } try { const base64 = await resizeImage(templateUrl, 800); setEcoverPreview(base64); } catch (e) { setEcoverPreview(templateUrl); } };
  const handleExportLibrary = () => { const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(customTemplates)); const a = document.createElement('a'); a.href = dataStr; a.download = `ecover_library_backup.json`; document.body.appendChild(a); a.click(); a.remove(); };
  const handleImportLibrary = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files[0]) { const file = e.target.files[0]; const reader = new FileReader(); reader.onload = (event) => { try { const json = JSON.parse(event.target?.result as string); if (Array.isArray(json)) { const unique = Array.from(new Set([...json, ...customTemplates])); localStorage.setItem('cm_custom_ecover_templates', JSON.stringify(unique)); setCustomTemplates(unique); alert(`Imported.`); } } catch (err) { alert("Invalid file."); } }; reader.readAsText(file); } if (libraryImportRef.current) libraryImportRef.current.value = ''; };

  const generateAIECover = async () => {
      if (!courseDetails.title) { alert("Title required."); return; }
      setIsGeneratingEcover(true);
      try {
           const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
           const parts: any[] = [];
           let isEditing = false;
           if (ecoverPreview && ecoverPreview.startsWith('data:image')) { isEditing = true; const base64Data = ecoverPreview.split(',')[1]; const mimeType = ecoverPreview.split(';')[0].split(':')[1]; parts.push({ inlineData: { data: base64Data, mimeType: mimeType } }); }
           let prompt = "";
           if (isEditing) { prompt = `TASK: Edit text on image. Replace Title with: "${courseDetails.title}". Replace Subtitle with: "${courseDetails.headline || ''}". Keep background/layout. USER OVERRIDES: "${ecoverInstructions}"`; } 
           else { prompt = `Design book cover for "${courseDetails.title}". Headline: "${courseDetails.headline || ''}". STYLE: High-end corporate. USER INSTRUCTIONS: "${ecoverInstructions}"`; }
           parts.push({ text: prompt });
           const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({ model: 'gemini-2.5-flash-image', contents: { parts: parts }, config: { imageConfig: { aspectRatio: '3:4' } } }));
           if (response.candidates?.[0]?.content?.parts) { for (const part of response.candidates[0].content.parts) { if (part.inlineData && part.inlineData.data) { setEcoverPreview(`data:image/png;base64,${part.inlineData.data}`); break; } } }
      } catch (e) { alert("Generation failed."); } finally { setIsGeneratingEcover(false); }
  };

  const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onloadend = () => { const base64String = reader.result as string; const base64Data = base64String.split(',')[1]; resolve({ inlineData: { data: base64Data, mimeType: file.type } }); }; reader.onerror = reject; reader.readAsDataURL(file); }); };

  const generateMetadata = async (target: 'headline' | 'description') => {
      if (!file && !ecoverFile && !ecoverPreview) { alert("Upload file or cover first."); return; }
      setIsAutoGeneratingDetails(target);
      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const parts: any[] = [];
          if (file) parts.push(await fileToGenerativePart(file));
          if (ecoverFile) parts.push(await fileToGenerativePart(ecoverFile));
          else if (ecoverPreview && ecoverPreview.startsWith('data:') && ecoverPreview.includes('base64')) { const base64 = ecoverPreview.split(',')[1]; parts.push({ inlineData: { data: base64, mimeType: 'image/png' } }); }
          let prompt = target === 'headline' ? "Generate course headline (max 15 words). Return JSON: { \"text\": \"...\" }" : "Generate course description (50 words). Return JSON: { \"text\": \"...\" }";
          parts.push({ text: prompt });
          const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts }, config: { responseMimeType: "application/json" } }));
          const json = JSON.parse(response.text || "{}");
          if (json.text) { setCourseDetails(prev => ({ ...prev, [target]: json.text })); }
      } catch (e) { alert(`Failed to generate ${target}.`); } finally { setIsAutoGeneratingDetails(null); }
  };

  const generateAudio = async (text: string, voiceId: string): Promise<{ audioData: string, mimeType: 'audio/pcm' | 'audio/mpeg', duration: number, wordTimestamps?: { word: string; start: number; end: number }[] } | null> => {
      // Clean markdown formatting so TTS doesn't read symbols literally
      const cleanText = text
          .replace(/\*\*([^*]+)\*\*/g, '$1')  // **bold** -> bold
          .replace(/\*([^*]+)\*/g, '$1')      // *italic* -> italic
          .replace(/#{1,6}\s*/g, '')          // # headings
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [link](url) -> link
          .replace(/`([^`]+)`/g, '$1')        // `code` -> code
          .replace(/\*{2,}/g, '')             // leftover ** 
          .replace(/\*/g, '')                 // remaining single *
          .replace(/_([^_]+)_/g, '$1')        // _italic_ -> italic
          .replace(/~{2}([^~]+)~{2}/g, '$1')  // ~~strikethrough~~
          .replace(/>\s*/g, '')               // > blockquotes
          .replace(/\n{3,}/g, '\n\n')         // multiple newlines
          .trim();
      
      const isElevenLabs = voiceId.length > 15 || elevenLabsVoices.some(v => v.voice_id === voiceId);
      if (isElevenLabs && elevenLabsApiKey) {
          try {
              // Try timestamps endpoint first
              let response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`, { 
                  method: 'POST', 
                  headers: { 'xi-api-key': elevenLabsApiKey, 'Content-Type': 'application/json' }, 
                  body: JSON.stringify({ text: cleanText, model_id: "eleven_turbo_v2", voice_settings: { stability: voiceStability, similarity_boost: voiceSimilarityBoost }, speed: voiceSpeed }) 
              });
              
              let wordTimestamps: { word: string; start: number; end: number }[] = [];
              let audioBase64 = '';
              const durationEstimate = text.split(' ').length / 2.5;
              
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
                              if (currentWord.trim()) { wordTimestamps.push({ word: currentWord.trim(), start: wordStart, end: wordEnd }); }
                              currentWord = '';
                          } else {
                              if (currentWord === '') { wordStart = startTimes[i]; }
                              currentWord += char;
                              wordEnd = endTimes[i];
                          }
                      }
                      if (currentWord.trim()) { wordTimestamps.push({ word: currentWord.trim(), start: wordStart, end: wordEnd }); }
                  }
                  return { audioData: audioBase64, mimeType: 'audio/mpeg', duration: durationEstimate, wordTimestamps };
              } else {
                  // Fallback to regular endpoint
                  response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, { 
                      method: 'POST', headers: { 'xi-api-key': elevenLabsApiKey, 'Content-Type': 'application/json' }, 
                      body: JSON.stringify({ text: cleanText, model_id: "eleven_turbo_v2", voice_settings: { stability: voiceStability, similarity_boost: voiceSimilarityBoost }, speed: voiceSpeed }) 
                  });
                  if (!response.ok) throw new Error("11Labs API Error");
                  const blob = await response.blob();
                  return new Promise((resolve) => { const reader = new FileReader(); reader.onloadend = () => { const base64data = (reader.result as string).split(',')[1]; resolve({ audioData: base64data, mimeType: 'audio/mpeg', duration: durationEstimate, wordTimestamps: [] }); }; reader.readAsDataURL(blob); });
              }
          } catch (e) { console.error("ElevenLabs generation failed", e); return null; }
      } else {
          try {
             const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
             const modelName = getVoiceModel(voiceId);
             const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({ model: "gemini-2.5-flash-preview-tts", contents: [{ parts: [{ text: cleanText }] }], config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: modelName } } } }, }), 3, 5000);
             if (response.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
                 const rawData = response.candidates[0].content.parts[0].inlineData.data;
                 const duration = window.atob(rawData).length / 48000;
                 return { audioData: rawData, mimeType: 'audio/pcm', duration: duration };
             }
          } catch (e) { return null; }
      }
      return null;
  };

  const handleTestVoice = async () => { if (isPreviewingVoice) return; setIsPreviewingVoice(true); try { const audioResult = await generateAudio(`Hello! I am ${selectedVoice}.`, selectedVoice); if (audioResult) { let blob; if (audioResult.mimeType === 'audio/mpeg') { const binary = atob(audioResult.audioData); const array = new Uint8Array(binary.length); for(let i=0; i<binary.length; i++) array[i] = binary.charCodeAt(i); blob = new Blob([array], {type: 'audio/mpeg'}); } else { const binary = atob(audioResult.audioData); const array = new Uint8Array(binary.length); for(let i=0; i<binary.length; i++) array[i] = binary.charCodeAt(i); blob = pcmToWav(array, 24000, 1); } const url = URL.createObjectURL(blob); if (audioPreviewRef.current) { audioPreviewRef.current.pause(); } audioPreviewRef.current = new Audio(url); audioPreviewRef.current.onended = () => setIsPreviewingVoice(false); audioPreviewRef.current.play().catch(e => { setIsPreviewingVoice(false); }); } else { setIsPreviewingVoice(false); } } catch (e) { setIsPreviewingVoice(false); } };
  const toggleMusicPreview = () => { if (isPlayingMusic) { musicPreviewRef.current?.pause(); setIsPlayingMusic(false); } else { if (!musicPreviewRef.current || musicPreviewRef.current.src !== selectedMusicTrack) { musicPreviewRef.current = new Audio(selectedMusicTrack); musicPreviewRef.current.loop = true; } musicPreviewRef.current.play().catch(e => { setIsPlayingMusic(false); }); setIsPlayingMusic(true); } };
  const handleResourceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files[0]) { const file = e.target.files[0]; const reader = new FileReader(); reader.onloadend = () => { setNewResource(prev => ({ ...prev, url: reader.result as string, fileName: file.name, title: prev.title || file.name })); }; reader.readAsDataURL(file); } };
  const addResource = (mIdx: number, lIdx: number) => { if (!newResource.title || !newResource.url || !newResource.type) return; let normalizedUrl = newResource.url; if (newResource.type === 'link' && normalizedUrl) { const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(normalizedUrl); if (!hasProtocol) { normalizedUrl = 'https://' + normalizedUrl; } } const res: Resource = { id: `res-${Date.now()}`, title: newResource.title, type: newResource.type, url: normalizedUrl, fileName: newResource.fileName }; const newModules = [...modules]; if (!newModules[mIdx].lessons[lIdx].resources) { newModules[mIdx].lessons[lIdx].resources = []; } newModules[mIdx].lessons[lIdx].resources!.push(res); setModules(newModules); setIsAddingResource(false); setNewResource({ type: 'link', title: '', url: '' }); };
  const removeResource = (mIdx: number, lIdx: number, rIdx: number) => { const newModules = [...modules]; newModules[mIdx].lessons[lIdx].resources!.splice(rIdx, 1); setModules(newModules); };
  const addVisualScene = (mIdx: number, lIdx: number) => { const newModules = [...modules]; const lesson = newModules[mIdx].lessons[lIdx]; if (!lesson.visuals) lesson.visuals = []; const newVisual: VisualAsset = { id: `v-manual-${Date.now()}`, prompt: "Describe visual...", imageData: "", type: "illustration", overlayText: "", scriptText: "", startTime: 0, endTime: 0 }; lesson.visuals.push(newVisual); setModules(newModules); };
  const removeVisualScene = (mIdx: number, lIdx: number, vIdx: number) => { const newModules = [...modules]; const lesson = newModules[mIdx].lessons[lIdx]; if (lesson.visuals) { lesson.visuals.splice(vIdx, 1); setModules(newModules); } };

  // Add New Lesson Functions
  const openAddLessonModal = () => {
    setNewLessonTitle('');
    setNewLessonScript('');
    setNewLessonScriptMode('own');
    setNewLessonAiPrompt('');
    setNewLessonType('blank');
    setNewLessonTargetModule(modules.length > 0 ? modules[0].id : '');
    setNewLessonPosition(0);
    setShowAddLessonModal(true);
  };

  const handleAddNewLesson = async () => {
    if (!newLessonTitle.trim()) { alert('Please enter a lesson title'); return; }
    if (!newLessonTargetModule) { alert('Please select a module'); return; }
    
    setIsGeneratingNewLesson(true);
    
    try {
      let script = newLessonScript;
      let visuals: VisualAsset[] = [];
      
      // If AI script generation is selected
      if (newLessonScriptMode === 'ai' && newLessonAiPrompt.trim()) {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const prompt = `Write a professional video script for a lesson titled "${newLessonTitle}". 
          Instructions: ${newLessonAiPrompt}
          The script should be engaging, educational, and suitable for voice narration.
          Output ONLY the script text, no formatting or headers.`;
        const response = await withRetry<GenerateContentResponse>(() => 
          ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts: [{ text: prompt }] } })
        );
        script = response.text || 'Script generation failed. Please edit manually.';
      }
      
      // If full generation is selected, also generate visuals
      if (newLessonType === 'full' && script.trim()) {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const sbResponse = await withRetry<GenerateContentResponse>(() => 
          ai.models.generateContent({ 
            model: 'gemini-2.5-flash', 
            contents: { parts: [{ text: `Break this script into 3-6 distinct visual scenes. Return JSON array with segmentText, visualPrompt, visualType, overlayText for each. Script: ${script}` }] },
            config: { responseMimeType: "application/json" }
          })
        );
        const scenes = JSON.parse((sbResponse.text || "[]").replace(/```json/g, '').replace(/```/g, ''));
        visuals = (Array.isArray(scenes) ? scenes : []).map((s: any, idx: number) => ({
          id: `v-new-${Date.now()}-${idx}`,
          prompt: s.visualPrompt || '',
          imageData: '',
          type: s.visualType || 'illustration',
          overlayText: s.overlayText || '',
          scriptText: s.segmentText || '',
          startTime: 0,
          endTime: 0
        }));
      }
      
      // Create new lesson
      const newLesson: Lesson = {
        id: `l-new-${Date.now()}`,
        moduleId: newLessonTargetModule,
        title: newLessonTitle,
        sourceText: script || 'Enter your script here...',
        visuals: visuals,
        status: script.trim() ? LessonStatus.SCRIPTING : LessonStatus.PENDING,
        progress: 0,
        duration: '0:00',
        durationSeconds: 0
      };
      
      // Add lesson to the target module at the specified position
      setModules(prev => {
        const newMods = [...prev];
        const targetModIdx = newMods.findIndex(m => m.id === newLessonTargetModule);
        if (targetModIdx !== -1) {
          const lessons = [...newMods[targetModIdx].lessons];
          lessons.splice(newLessonPosition, 0, newLesson);
          newMods[targetModIdx].lessons = lessons;
        }
        return newMods;
      });
      
      setShowAddLessonModal(false);
      setExpandedLessonId(newLesson.id);
      
    } catch (e) {
      console.error('Failed to create lesson:', e);
      alert('Failed to create lesson. Please try again.');
    } finally {
      setIsGeneratingNewLesson(false);
    }
  };

  // Move lesson to different module
  const moveLessonToModule = (lessonId: string, targetModuleId: string, position: number) => {
    setModules(prev => {
      const newMods = [...prev];
      let lessonToMove: Lesson | null = null;
      
      // Find and remove lesson from current module
      for (let mIdx = 0; mIdx < newMods.length; mIdx++) {
        const lIdx = newMods[mIdx].lessons.findIndex(l => l.id === lessonId);
        if (lIdx !== -1) {
          lessonToMove = { ...newMods[mIdx].lessons[lIdx], moduleId: targetModuleId };
          newMods[mIdx].lessons.splice(lIdx, 1);
          break;
        }
      }
      
      // Add to target module at position
      if (lessonToMove) {
        const targetModIdx = newMods.findIndex(m => m.id === targetModuleId);
        if (targetModIdx !== -1) {
          newMods[targetModIdx].lessons.splice(position, 0, lessonToMove);
        }
      }
      
      return newMods;
    });
    setShowMoveLesson(null);
  };

  // Reorder lesson within module
  const reorderLesson = (mIdx: number, fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setModules(prev => {
      const newMods = [...prev];
      const lessons = [...newMods[mIdx].lessons];
      const [moved] = lessons.splice(fromIdx, 1);
      lessons.splice(toIdx, 0, moved);
      newMods[mIdx].lessons = lessons;
      return newMods;
    });
  };

  // Delete lesson
  const deleteLesson = (mIdx: number, lIdx: number) => {
    if (!confirm('Are you sure you want to delete this lesson?')) return;
    setModules(prev => {
      const newMods = [...prev];
      newMods[mIdx].lessons.splice(lIdx, 1);
      return newMods;
    });
    setExpandedLessonId(null);
  };

  // Add new module
  const addNewModule = () => {
    const newModule: Module = {
      id: `m-new-${Date.now()}`,
      courseId: 'temp',
      title: 'New Module',
      lessons: []
    };
    setModules([...modules, newModule]);
  };

  // Rename module
  const renameModule = (mIdx: number, newTitle: string) => {
    setModules(prev => {
      const newMods = [...prev];
      newMods[mIdx].title = newTitle;
      return newMods;
    });
  };

  // Delete module
  const deleteModule = (mIdx: number) => {
    if (modules[mIdx].lessons.length > 0) {
      if (!confirm(`This module has ${modules[mIdx].lessons.length} lessons. Delete anyway?`)) return;
    }
    setModules(prev => prev.filter((_, i) => i !== mIdx));
  };

  const regenerateLessonVisuals = async (mIdx: number, lIdx: number) => { const lesson = modules[mIdx].lessons[lIdx]; if (!lesson.sourceText) return; setIsRegeneratingVisuals(lesson.id); try { const ai = new GoogleGenAI({ apiKey: process.env.API_KEY }); let pacingInstruction = "Break script into 3-6 distinct scenes."; const effectivePacing = lesson.visualPacing || visualPacing; if (effectivePacing === 'Fast') pacingInstruction = "Break script into 8-12 fast-paced scenes."; if (effectivePacing === 'Turbo') pacingInstruction = "Break script into 20-30 rapid-fire scenes (every 2-3 seconds)."; const sbResponse = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts: [{ text: `${pacingInstruction} Return JSON array. Script: ${lesson.sourceText}` }] }, config: { thinkingConfig: { thinkingBudget: 1024 }, responseMimeType: "application/json", responseSchema: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { segmentText: { type: Type.STRING }, visualPrompt: { type: Type.STRING }, visualType: { type: Type.STRING }, overlayText: { type: Type.STRING } } } } } })); const scenes = JSON.parse((sbResponse.text || "[]").replace(/```json/g, '').replace(/```/g, '')); const visualAssets: VisualAsset[] = (Array.isArray(scenes) ? scenes : []).map((s: any, idx: number) => ({ id: `v-regen-${Date.now()}-${idx}`, prompt: s.visualPrompt, imageData: '', type: s.visualType, overlayText: s.overlayText, scriptText: s.segmentText, startTime: 0, endTime: 0 })); setModules(prev => { const newM = [...prev]; if(newM[mIdx] && newM[mIdx].lessons[lIdx]) { newM[mIdx].lessons[lIdx].visuals = visualAssets; newM[mIdx].lessons[lIdx].status = LessonStatus.SCRIPTING; } return newM; }); } catch (e) { alert("Failed to redo storyboard."); } finally { setIsRegeneratingVisuals(null); } };

  // Export image prompts to JSON for external AI generation
  const handleExportLessonPrompts = (mIdx: number, lIdx: number) => {
    const lesson = modules[mIdx]?.lessons[lIdx];
    if (!lesson?.visuals || lesson.visuals.length === 0) {
      alert("No visuals to export. Generate a storyboard first.");
      return;
    }
    const exportData = {
      version: "1.0",
      lessonTitle: lesson.title,
      moduleTitle: modules[mIdx].title,
      exportDate: new Date().toISOString(),
      instructions: "Generate images for each prompt below. After generating, add the base64 image data to the 'imageData' field for each item. Then import this file back.",
      prompts: lesson.visuals.map((vis, idx) => ({
        index: idx,
        id: vis.id,
        prompt: vis.prompt,
        overlayText: vis.overlayText || "",
        scriptText: vis.scriptText || "",
        imageData: "" // User fills this after generating externally
      }))
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(lesson.title || 'lesson_prompts').replace(/[^a-z0-9]/gi, '_')}_prompts.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import images from JSON (matching by index or id)
  const handleImportLessonImages = (mIdx: number, lIdx: number) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.prompts || !Array.isArray(data.prompts)) {
          alert("Invalid format. Expected a JSON file with 'prompts' array.");
          return;
        }
        const lesson = modules[mIdx]?.lessons[lIdx];
        if (!lesson?.visuals) return;
        
        const newVisuals = [...lesson.visuals];
        let imported = 0;
        for (const item of data.prompts) {
          if (item.imageData && item.imageData.length > 100) {
            const targetIndex = typeof item.index === 'number' ? item.index : newVisuals.findIndex(v => v.id === item.id);
            if (targetIndex >= 0 && targetIndex < newVisuals.length) {
              let imgData = item.imageData;
              if (!imgData.startsWith('data:') && !imgData.startsWith('/') && !imgData.startsWith('http')) {
                imgData = `data:image/png;base64,${imgData.replace(/^data:image\/\w+;base64,/, '')}`;
              }
              newVisuals[targetIndex] = { ...newVisuals[targetIndex], imageData: imgData };
              imported++;
            }
          }
        }
        setModules(prev => {
          const newMods = [...prev];
          newMods[mIdx].lessons[lIdx].visuals = newVisuals;
          return newMods;
        });
        alert(`Successfully imported ${imported} images.`);
      } catch (err) {
        console.error("Import error:", err);
        alert("Failed to parse JSON file. Please check the format.");
      }
    };
    input.click();
  };

  const generateOutline = async () => {
    if (!file && generationStrategy !== 'creative' && !initialCourse) { alert("Please upload a PDF file for Strict or Hybrid modes."); return; }
    setStep('outline'); setParsingProgress(10); setIsProcessingAI(true);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        let filePart: any = null;
        if (file && generationStrategy !== 'creative') { filePart = await fileToGenerativePart(file); }
        setParsingProgress(25);
        const jsonExample = `{ "modules": [ { "title": "Module Title", "lessons": [ { "title": "Lesson Title", "summary": "Lesson summary" } ] } ] }`;
        let countInstruction = "";
        switch(moduleCountMode) {
            case 'small': countInstruction = "Condense the material into exactly 1-2 high-impact modules."; break;
            case 'medium': countInstruction = "Organize the material into 3-5 comprehensive modules."; break;
            case 'large': countInstruction = "Expand the material into 6-10 detailed modules."; break;
            case 'xlarge': countInstruction = "Create a massive masterclass curriculum with 11+ modules."; break;
            case 'auto': 
                if (generationStrategy === 'strict') countInstruction = "Follow the exact chapter structure of the source file for modules.";
                else countInstruction = "Create a well-balanced course structure (typically 5-8 modules).";
                break;
        }
        let lessonCountInstruction = "";
        switch(lessonCountMode) {
            case 'short': lessonCountInstruction = "Ensure each module contains only 1-2 bite-sized lessons."; break;
            case 'medium': lessonCountInstruction = "Ensure each module contains 3-5 lessons."; break;
            case 'long': lessonCountInstruction = "Ensure each module contains 6-10 detailed lessons."; break;
            case 'auto': lessonCountInstruction = "Balance the number of lessons per module based on the content density."; break;
        }
        const formattingInstruction = "CRITICAL: Do NOT include words like 'Chapter', 'Section', 'Unit', 'Part' or numbers like '1.', '2.3' in the titles. Just use the descriptive topic name. Example: Instead of 'Chapter 1: Intro', use 'Introduction'.";
        let prompt = "";
        const jsonInstruction = `Return a JSON object with a 'modules' array. Each module has 'title' and 'lessons' array. Each lesson MUST have a 'title' string and 'summary' string. Follow this structure: ${jsonExample}`;
        const combinedInstructions = `${countInstruction} ${lessonCountInstruction} ${formattingInstruction} ${jsonInstruction}`;
        switch(generationStrategy) {
            case 'strict': 
                prompt = `You are an expert eBook to Course converter. Analyze the provided eBook file. 
                TASK: Extract the Table of Contents or infer the structure from headings.
                1. Map every main 'Chapter' or major section to a 'Module'.
                2. Map every 'Sub-chapter', 'Section', or distinct topic within a chapter to a 'Lesson'.
                3. For the 'summary' of each lesson, provide a detailed bulleted list of the key concepts covered in that text section.
                
                CRITICAL: 
                - Ignore front matter (Copyright, Dedication, Foreword) and back matter (Index).
                - The structure must mirror the book's table of contents exactly.
                - Do not hallucinate extra modules.
                ${combinedInstructions}`; 
                break;
            case 'hybrid': prompt = `Analyze the eBook. Create a comprehensive course outline using the file as a base, but expand it with modern examples. ${combinedInstructions}`; break;
            case 'creative': prompt = `Create a comprehensive course outline for a course titled "${courseDetails.title}". Be creative, structured, and educational. Ignore the file if provided. ${combinedInstructions}`; break;
        }
        if (outlineInstructions.trim()) { prompt += `\n\nIMPORTANT USER INSTRUCTIONS: The user has provided specific guidance for this outline. You MUST follow these notes:\n"${outlineInstructions}"\n\nApply these instructions when determining the modules and lessons.`; }
        setParsingProgress(40);
        const parts = filePart ? [filePart, { text: prompt }] : [{ text: prompt }];
        const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { role: 'user', parts: parts }, config: { thinkingConfig: { thinkingBudget: 4096 }, responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { modules: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, lessons: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, summary: { type: Type.STRING } }, required: ["title", "summary"] } } }, required: ["title", "lessons"] } } } } } }));
        setParsingProgress(80);
        const cleanJson = (response.text || "{}").replace(/```json/g, '').replace(/```/g, '').trim();
        let parsedData: any = {};
        try { parsedData = JSON.parse(cleanJson); } catch (e) { parsedData = {}; }
        let modulesArray: any[] = parsedData.modules || (Array.isArray(parsedData) ? parsedData : []);
        if (modulesArray.length === 0 && parsedData && typeof parsedData === 'object' && (parsedData.title || parsedData.lessons)) { modulesArray = [parsedData]; }
        const newModules: Module[] = modulesArray.map((mod: any, mIdx: number) => { const modId = `m-${Date.now()}-${mIdx}`; return { id: modId, courseId: 'temp', title: mod?.title || mod?.name || `Module ${mIdx + 1}`, lessons: (mod.lessons || []).map((les: any, lIdx: number) => ({ id: `l-${Date.now()}-${mIdx}-${lIdx}`, moduleId: modId, title: les.title || les.name || `Lesson ${lIdx + 1}`, sourceText: les?.summary || les?.description || '', visuals: [], status: LessonStatus.PENDING, progress: 0, duration: '0:00', durationSeconds: 0 })) }; });
        setModules(newModules.length > 0 ? newModules : [{ id: `m-fb-${Date.now()}`, courseId: 'temp', title: 'Fallback Module', lessons: [{ id: `l-fb-${Date.now()}`, moduleId: `m-fb-${Date.now()}`, title: 'Welcome', sourceText: 'Content generation failed.', visuals: [], status: LessonStatus.PENDING, progress: 0, duration: '0:00', durationSeconds: 0 }] }]);
        setParsingProgress(100); setIsProcessingAI(false);
    } catch (error) { console.error("Outline Error:", error); alert("Failed to generate outline."); setStep('strategy'); setIsProcessingAI(false); }
  };

  const handleRefineOutline = async () => {
      if (!refineInstructions.trim()) return;
      setIsRefining(true);
      try { const ai = new GoogleGenAI({ apiKey: process.env.API_KEY }); const currentStructure = modules.map(m => ({ title: m.title, lessons: m.lessons.map(l => ({ title: l.title, summary: l.sourceText })) })); const prompt = ` I have a course outline in JSON format. I need you to modify it based on my specific instructions. Current Outline: ${JSON.stringify(currentStructure, null, 2)} USER MODIFICATION REQUEST: "${refineInstructions}" Instructions: 1. Apply changes. 2. Return COMPLETE structure as JSON. 3. Schema: { modules: [...] } `; const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts: [{ text: prompt }] }, config: { responseMimeType: "application/json" } })); const cleanJson = (response.text || "{}").replace(/```json/g, '').replace(/```/g, '').trim(); const parsedData = JSON.parse(cleanJson); const modulesArray: any[] = parsedData.modules || (Array.isArray(parsedData) ? parsedData : []); const newModules: Module[] = modulesArray.map((mod: any, mIdx: number) => { const modId = `m-ref-${Date.now()}-${mIdx}`; return { id: modId, courseId: 'temp', title: mod?.title || `Module ${mIdx + 1}`, lessons: (mod.lessons || []).map((les: any, lIdx: number) => ({ id: `l-ref-${Date.now()}-${mIdx}-${lIdx}`, moduleId: modId, title: les.title || `Lesson ${lIdx + 1}`, sourceText: les?.summary || '', visuals: [], status: LessonStatus.PENDING, progress: 0, duration: '0:00', durationSeconds: 0 })) }; }); if (newModules.length > 0) { setModules(newModules); setRefineInstructions(''); } } catch (error) { alert("Failed to refine outline."); } finally { setIsRefining(false); }
  };

  const generateDraftContent = async () => {
    setStep('content'); setIsDraftingContent(true);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const initialModules = [...modules]; let completedCount = 0; const totalLessons = initialModules.reduce((acc, m) => acc + m.lessons.length, 0);
    let filePart: any = null; if (file && generationStrategy !== 'creative') { filePart = await fileToGenerativePart(file); }
    for (let mIdx = 0; mIdx < initialModules.length; mIdx++) {
        const module = initialModules[mIdx];
        for (let lIdx = 0; lIdx < module.lessons.length; lIdx++) {
            const currentLesson = module.lessons[lIdx]; const lessonId = currentLesson.id;
            const isProcessed = currentLesson.status !== LessonStatus.PENDING && currentLesson.status !== LessonStatus.DRAFT;
            if (isProcessed) { completedCount++; setParsingProgress((completedCount / totalLessons) * 100); continue; }
            try {
                if (!currentLesson.voice) currentLesson.voice = selectedVoice;
                if (!currentLesson.captionStyle) currentLesson.captionStyle = selectedCaptionStyle;
                if (!currentLesson.backgroundMusicUrl && includeMusic) currentLesson.backgroundMusicUrl = selectedMusicTrack;
                if (!currentLesson.musicMode) currentLesson.musicMode = musicMode;
                const summaryContext = currentLesson.sourceText || "";
                let promptLength = "400 words"; if (moduleCountMode === 'large' || moduleCountMode === 'xlarge') promptLength = "600-800 words";
                let scriptPrompt = "";
                if (generationStrategy === 'strict') { scriptPrompt = `You are converting a specific section of an eBook into a video lesson script. Target Section: "${currentLesson.title}" (Part of Module: "${module.title}"). Context from Outline: ${summaryContext} INSTRUCTIONS: 1. Locate the relevant section in the provided file. 2. Extract and adapt the content of that section into a clear, educational video script. 3. Maintain the original author's terminology and key points. 4. Format as spoken narration. 5. Length: ${promptLength}. Do not include scene directions, just spoken text.`; } 
                else { const contextPrompt = `Based on the topic "${currentLesson.title}". Context/Summary: ${summaryContext}`; scriptPrompt = `Write a natural, conversational video script for the lesson "${currentLesson.title}". ${contextPrompt}. Be educational and engaging. Length: ${promptLength}. Do not include scene directions, just spoken text.`; }
                const parts = filePart ? [filePart, { text: scriptPrompt }] : [{ text: scriptPrompt }];
                let script = ""; try { const scriptResponse = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts: parts }, config: { thinkingConfig: { thinkingBudget: 1024 } } })); script = scriptResponse.text || "Draft script generation failed."; } catch (e) { script = "Script generation failed."; }
                let visualAssets: VisualAsset[] = []; try { let pacingInstruction = "Break script into 4-7 distinct scenes."; if (visualPacing === 'Fast') pacingInstruction = "Break script into 10-15 fast-paced scenes."; if (visualPacing === 'Turbo') pacingInstruction = "Break script into 25-35 rapid-fire scenes (every 2-3 seconds). Create MAXIMAL visual variety."; const sbResponse = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts: [{ text: `${pacingInstruction} Return JSON array. Script: ${script}` }] }, config: { thinkingConfig: { thinkingBudget: 1024 }, responseMimeType: "application/json", responseSchema: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { segmentText: { type: Type.STRING }, visualPrompt: { type: Type.STRING }, visualType: { type: Type.STRING }, overlayText: { type: Type.STRING } } } } } })); const scenes = JSON.parse((sbResponse.text || "[]").replace(/```json/g, '').replace(/```/g, '')); visualAssets = (Array.isArray(scenes) ? scenes : []).map((s: any, idx: number) => ({ id: `draft-v-${Date.now()}-${idx}`, prompt: s.visualPrompt, imageData: '', type: s.visualType, overlayText: s.overlayText, scriptText: s.segmentText, startTime: 0, endTime: 0 })); } catch (e) { visualAssets = [{ id: `draft-fb-${Date.now()}`, prompt: `Illustration of ${currentLesson.title}`, imageData: '', type: 'illustration', overlayText: currentLesson.title, scriptText: script, startTime: 0, endTime: 0 }]; }
                setModules(prev => { return prev.map(m => { if (m.id !== module.id) return m; return { ...m, lessons: m.lessons.map(l => { if (l.id !== lessonId) return l; return { ...l, sourceText: script, visuals: visualAssets, status: LessonStatus.SCRIPTING, voice: selectedVoice, captionStyle: l.captionStyle || selectedCaptionStyle, backgroundMusicUrl: l.backgroundMusicUrl || (includeMusic ? selectedMusicTrack : undefined), musicMode: l.musicMode || musicMode }; }) }; }); });
            } catch (error) { console.error(`Error generating content for lesson ${currentLesson.title}:`, error); }
            completedCount++; setParsingProgress((completedCount / totalLessons) * 100);
        }
    }
    setIsDraftingContent(false); if (initialModules[0]?.lessons[0]) setExpandedLessonId(initialModules[0].lessons[0].id);
  };

  const generateImageForScene = async (mIdx: number, lIdx: number, vIdx: number) => {
      const module = modules[mIdx]; const lesson = module?.lessons[lIdx]; const visual = lesson?.visuals?.[vIdx]; if (!module || !lesson || !visual) return;
      const moduleId = module.id; const lessonId = lesson.id; const visualId = visual.id; setGeneratingImageId(visualId);
      let newImageData = ''; const effectiveVisualMode = lesson.visualMode || visualMode; const effectiveSolidColor = lesson.solidColor || solidColor; const effectiveVisualStyle = lesson.visualStyle || selectedVisualStyle;
      if (effectiveVisualMode === 'Solid_Color') { newImageData = createSolidColorImage(effectiveSolidColor, ""); } 
      else {
        try {
            let promptText = `Style: ${effectiveVisualStyle}. Subject: ${visual.prompt}. Aspect Ratio 16:9. No text.`;
            if (effectiveVisualMode === 'Abstract') { promptText = `Style: Abstract, ${effectiveVisualStyle}. Create an abstract artistic background based on the concept: ${visual.prompt}. Aspect Ratio 16:9. No text, no people, high quality wallpaper.`; }
            
            // Get API keys from localStorage (user's own keys)
            const replicateApiKey = localStorage.getItem('replicateApiKey') || '';
            const openaiApiKey = localStorage.getItem('openaiApiKey') || '';
            
            // Use server-side API with selected provider from toggle
            const result = await api.ai.generateImage(promptText, '16:9', {
                useFlux: selectedImageProvider === 'flux',
                useFluxSchnell: selectedImageProvider === 'flux-schnell',
                useNanoBanana: selectedImageProvider === 'nano-banana',
                useOpenAI: selectedImageProvider === 'openai',
                replicateApiKey: replicateApiKey || undefined,
                openaiApiKey: openaiApiKey || undefined,
            });
            if (result.success && result.imageData) {
                newImageData = result.imageData;
                console.log(`Image generated via ${result.provider}`);
            }
        } catch (e) { console.error("Image Generation Failed:", e); } 
      }
      setGeneratingImageId(null);
      if (newImageData) { 
        const compressedImage = await compressBase64Image(newImageData, 1280, 0.85);
        setModules(prev => { return prev.map(m => { if (m.id !== moduleId) return m; return { ...m, lessons: m.lessons.map(l => { if (l.id !== lessonId) return l; if (!l.visuals) return l; return { ...l, visuals: l.visuals.map(v => { if (v.id !== visualId) return v; return { ...v, imageData: compressedImage }; }) }; }) }; }); }); 
      }
  };

  // Handle uploading custom image to replace a visual scene
  const handleVisualImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, mIdx: number, lIdx: number, vIdx: number) => {
      if (!e.target.files || !e.target.files[0]) return;
      const file = e.target.files[0];
      
      if (!file.type.startsWith('image/')) {
          alert('Please select an image file');
          return;
      }
      
      const module = modules[mIdx];
      const lesson = module?.lessons[lIdx];
      if (!module || !lesson || !lesson.visuals?.[vIdx]) return;
      
      const moduleId = module.id;
      const lessonId = lesson.id;
      const visualId = lesson.visuals[vIdx].id;
      
      const reader = new FileReader();
      reader.onloadend = async () => {
          const dataUrl = reader.result as string;
          // Keep full resolution - no compression for user uploads
          setModules(prev => prev.map(m => {
              if (m.id !== moduleId) return m;
              return {
                  ...m,
                  lessons: m.lessons.map(l => {
                      if (l.id !== lessonId) return l;
                      if (!l.visuals) return l;
                      return {
                          ...l,
                          visuals: l.visuals.map(v => {
                              if (v.id !== visualId) return v;
                              return { ...v, imageData: dataUrl };
                          })
                      };
                  })
              };
          }));
      };
      reader.readAsDataURL(file);
      e.target.value = '';
  };

  const bulkGenerateLessonImages = async (mIdx: number, lIdx: number) => {
      const lesson = modules[mIdx]?.lessons[lIdx]; if (!lesson || !lesson.visuals) return; setBulkGeneratingId(lesson.id);
      // Check Gemini mode from settings - free accounts use 1 at a time, paid use 3
      const geminiMode = localStorage.getItem('geminiMode') || 'paid';
      const batchSize = (selectedImageProvider === 'gemini' && geminiMode === 'free') ? 1 : 3;
      for (let i = 0; i < lesson.visuals.length; i += batchSize) { const batch = lesson.visuals.slice(i, i + batchSize).map((_, offset) => i + offset); try { await Promise.all(batch.map(vIdx => { if (!lesson.visuals![vIdx].imageData) { return generateImageForScene(mIdx, lIdx, vIdx); } return Promise.resolve(); })); } catch(e) { console.error("Batch failed", e); } await delay(500); }
      setBulkGeneratingId(null);
  };
  const bulkGenerateModuleImages = async (mIdx: number) => { const module = modules[mIdx]; setBulkGeneratingId(module.id); for (let lIdx = 0; lIdx < module.lessons.length; lIdx++) { await bulkGenerateLessonImages(mIdx, lIdx); } setBulkGeneratingId(null); };
  const bulkGenerateAllImages = async () => { setBulkGeneratingId('course-all'); for (let mIdx = 0; mIdx < modules.length; mIdx++) { await bulkGenerateModuleImages(mIdx); } setBulkGeneratingId(null); };

  const renderFinalCourse = async () => {
        setStep('rendering'); setIsProcessingAI(true); setGenerationProgress(0); setRenderingStatus("Initializing Render Engine...");
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        let totalSteps = 0; let completedSteps = 0; modules.forEach(m => { m.lessons.forEach(l => { totalSteps++; if(l.visuals) totalSteps += l.visuals.length; }); });
        const initialStructure = [...modules]; let audioQuotaExceeded = false; 
        try {
            for (let mIdx = 0; mIdx < initialStructure.length; mIdx++) {
                const moduleStructure = initialStructure[mIdx];
                for (let lIdx = 0; lIdx < moduleStructure.lessons.length; lIdx++) {
                    const lesson = moduleStructure.lessons[lIdx]; if(!lesson) continue;
                    const hasAllVisuals = lesson.visuals?.every((v: VisualAsset) => !!v.imageData);
                    // Always regenerate audio to pick up script changes - don't skip based on existing audio
                    const lessonId = lesson.id; let audioData = ""; let audioMimeType: 'audio/pcm' | 'audio/mpeg' = 'audio/pcm'; let totalDurationSeconds = 0; let currentSourceText = lesson.sourceText;
                    if (!currentSourceText || currentSourceText.length < 200) {
                         setRenderingStatus(`Writing Script for: ${lesson.title}`); try { const prompt = `Write a natural, conversational video script (approx 400-600 words) for a course lesson titled "${lesson.title}". Context/Summary: ${currentSourceText || lesson.title}. Do not include scene directions like [Scene], just the spoken text.`; const scriptResp = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts: [{ text: prompt }] } })); if (scriptResp.text) { currentSourceText = scriptResp.text; } } catch(e) {}
                    }
                    let wordTimestamps: WordTimestamp[] = lesson.wordTimestamps || [];
                    if (!audioData && currentSourceText && !audioQuotaExceeded) {
                        setRenderingStatus(`Generating Audio: ${lesson.title}`); await delay(10000); const generated = await generateAudio(currentSourceText, lesson.voice || selectedVoice);
                        if (generated) { 
                            audioData = generated.audioData; audioMimeType = generated.mimeType; totalDurationSeconds = generated.duration;
                            // CRITICAL: Also update initialStructure directly so it's included when saving
                            lesson.audioData = audioData;
                            lesson.audioMimeType = audioMimeType;
                            lesson.sourceText = currentSourceText;
                        } else { console.warn("Audio generation skipped/failed."); }
                    }
                    if (totalDurationSeconds === 0 && currentSourceText) { totalDurationSeconds = calculateDurationFromText(currentSourceText); } else if (totalDurationSeconds === 0) { totalDurationSeconds = 60; }
                    // Update duration on initialStructure
                    lesson.durationSeconds = totalDurationSeconds;
                    completedSteps++; setGenerationProgress((completedSteps / totalSteps) * 100);
                    const visuals = lesson.visuals || []; const batchSize = 3;
                    for (let i = 0; i < visuals.length; i += batchSize) {
                        const batch = visuals.slice(i, i + batchSize); setRenderingStatus(`Rendering Scenes ${i + 1}-${Math.min(i + batchSize, visuals.length)} for: ${lesson.title}`);
                        await Promise.all(batch.map(async (vis: any) => { if (!vis.imageData || vis.imageData.length < 500) { const modeToUse = lesson.visualMode || visualMode; const styleToUse = lesson.visualStyle || selectedVisualStyle; const colorToUse = lesson.solidColor || solidColor; if (modeToUse === 'Solid_Color') { vis.imageData = createSolidColorImage(colorToUse, ""); } else { try { const promptText = modeToUse === 'Abstract' ? `Abstract background, ${styleToUse}, ${vis.prompt}, Aspect Ratio 16:9` : `Style: ${styleToUse}. Subject: ${vis.prompt}. Aspect Ratio 16:9`; const imgResp = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({ model: 'gemini-2.5-flash-image', contents: { parts: [{ text: promptText }] }, config: { imageConfig: { aspectRatio: '16:9' } } })); if (imgResp.candidates?.[0]?.content?.parts) { for (const p of imgResp.candidates[0].content.parts) { if (p.inlineData?.data) { vis.imageData = await compressBase64Image(p.inlineData.data, 1280, 0.85); break; } } } } catch (e) {} } } }));
                        completedSteps += batch.length; setGenerationProgress((completedSteps / totalSteps) * 100);
                    }
                    setModules(prev => prev.map(m => { if (m.id !== moduleStructure.id) return m; return { ...m, lessons: m.lessons.map(l => { if (l.id !== lessonId) return l; const updatedVisuals = [...(l.visuals || [])]; visuals.forEach((mutatedVis, idx) => { if (updatedVisuals[idx] && mutatedVis.imageData) { updatedVisuals[idx].imageData = mutatedVis.imageData; } }); let currentTimeCursor = 0; let thumbnailData = l.thumbnailData || ""; const totalChars = visuals.reduce((acc: number, v: any) => acc + (v.scriptText?.length || 20), 0) || 1; updatedVisuals.forEach((vis, i) => { if (i === 0 && !thumbnailData && vis.imageData) thumbnailData = vis.imageData; const segLen = vis.scriptText?.length || 20; const duration = (totalChars > 0 && totalDurationSeconds > 0) ? (segLen / totalChars) * totalDurationSeconds : 5; vis.startTime = currentTimeCursor; vis.endTime = currentTimeCursor + duration; vis.zoomDirection = i % 2 === 0 ? 'in' : 'out'; currentTimeCursor += duration; }); if (updatedVisuals.length > 0) updatedVisuals[updatedVisuals.length - 1].endTime = Math.max(currentTimeCursor, totalDurationSeconds + 1); return { ...l, status: LessonStatus.READY, progress: 100, audioData: audioData, audioMimeType: audioMimeType, sourceText: currentSourceText, visuals: updatedVisuals, thumbnailData: thumbnailData, duration: `${Math.floor(totalDurationSeconds / 60)}:${Math.floor(totalDurationSeconds % 60).toString().padStart(2, '0')}`, durationSeconds: totalDurationSeconds, voice: selectedVoice, captionStyle: l.captionStyle || selectedCaptionStyle, captionPosition: captionPosition, captionSize: captionSize, visualStyle: l.visualStyle || selectedVisualStyle, visualPacing: l.visualPacing || visualPacing, visualMode: visualMode, solidColor: solidColor, captionTextSource: ((l.captionStyle || selectedCaptionStyle).startsWith('Viral') || showSubtitles) ? 'script' : 'overlay', backgroundMusicUrl: (includeMusic && !l.backgroundMusicUrl) ? selectedMusicTrack : l.backgroundMusicUrl, musicMode: l.musicMode || musicMode, captionColor: captionColor, captionBgColor: captionBgColor, captionOutlineColor: captionOutlineColor, wordTimestamps: wordTimestamps.length > 0 ? wordTimestamps : l.wordTimestamps }; }) }; }));
                }
            }
            setIsProcessingAI(false); setRenderingStatus("Finalizing Course Data..."); clearRecovery();
            setTimeout(() => { let finalModules = modulesRef.current; if ((!finalModules || finalModules.length === 0) && initialStructure.length > 0) { finalModules = initialStructure; } const updatedCourse: Course = { id: initialCourse ? initialCourse.id : `c-${Date.now()}`, title: courseDetails.title || 'Untitled Course', headline: courseDetails.headline || 'Generated Course', description: courseDetails.description || 'AI Generated content.', ecoverUrl: ecoverPreview || 'https://picsum.photos/seed/new/400/600', status: CourseStatus.PUBLISHED, modules: finalModules, totalStudents: initialCourse ? initialCourse.totalStudents : 0, rating: initialCourse ? initialCourse.rating : 0, theme: theme }; onComplete(updatedCourse); }, 1000);
        } catch (e) { alert("Connection interrupted! Progress saved."); setIsProcessingAI(false); setStep('content'); }
  };
  
  const handleQuickSaveTheme = () => { const updatedCourse: Course = { id: initialCourse ? initialCourse.id : `c-${Date.now()}`, title: courseDetails.title || 'Untitled Course', headline: courseDetails.headline || 'Generated Course', description: courseDetails.description || 'AI Generated content.', ecoverUrl: ecoverPreview || 'https://picsum.photos/seed/new/400/600', status: CourseStatus.PUBLISHED, modules: modules, totalStudents: initialCourse ? initialCourse.totalStudents : 0, rating: initialCourse ? initialCourse.rating : 0, theme: theme }; onComplete(updatedCourse); alert("Theme settings saved! Returning to dashboard."); };

  const getCaptionPreviewClass = (style: CaptionStyle) => { switch(style) { case 'Outline': return "text-white text-lg font-bold tracking-tight text-center [text-shadow:-2px_-2px_0_#000,2px_-2px_0_#000,-2px_2px_0_#000,2px_2px_0_#000]"; case 'Cinematic': return "text-amber-50 text-xs tracking-[0.2em] font-serif uppercase text-center"; case 'Modern': return "text-white text-sm font-bold tracking-tight"; case 'Karaoke': return "text-xl font-black text-yellow-400 drop-shadow-[0_2px_2px_rgba(0,0,0,1)] stroke-black text-center leading-tight"; case 'Minimalist': return "text-slate-800 text-xs font-bold tracking-wide"; case 'News Ticker': return "text-white font-mono uppercase tracking-widest"; case 'Typewriter': return "text-slate-900 font-mono text-sm"; case 'Comic Book': return "text-black font-black text-lg uppercase"; case 'Neon Glow': return "text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-violet-500 font-bold text-xl drop-shadow-[0_0_10px_rgba(167,139,250,0.8)]"; case 'Subtitle': return "text-white text-sm bg-black/50 px-2 py-1 rounded inline-block"; case 'Handwritten': return "text-slate-100 font-serif italic text-2xl drop-shadow-md"; case 'Viral (Strike)': case 'Viral (Clean)': case 'Viral (Box)': case 'Viral (Pop)': return "text-white text-sm font-bold tracking-tight"; default: return "text-white text-sm font-bold tracking-tight"; } };
  const getCustomCaptionStyle = (): React.CSSProperties => { const styles: React.CSSProperties = {}; if (captionColor) styles.color = captionColor; if (captionBgColor) styles.backgroundColor = captionBgColor; if (captionOutlineColor) { styles.WebkitTextStroke = `1px ${captionOutlineColor}`; styles.textShadow = 'none'; } if (captionBgColor) { styles.padding = '4px 8px'; styles.borderRadius = '4px'; styles.display = 'inline-block'; } return styles; };

  const renderSidebarSettings = () => (
      <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 h-full overflow-y-auto custom-scrollbar space-y-6">
        <h3 className="font-bold text-slate-900 flex items-center gap-2 sticky top-0 bg-slate-50 pb-2 z-10 border-b border-slate-200"> <Sparkles size={16} className="text-indigo-600" /> Global Course Settings</h3>
        
        <div className="border-b border-slate-200 pb-4 mb-4">
            <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1"><Palette size={12}/> Branding & Theme</label>
            </div>
            <div className="space-y-3">
                <div className="flex justify-between items-center">
                    <label className="text-xs text-slate-600">Primary Color</label>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-400">{theme.primaryColor}</span>
                        <input type="color" value={theme.primaryColor} onChange={(e) => setTheme({...theme, primaryColor: e.target.value})} className="h-6 w-8 rounded border border-slate-300 cursor-pointer p-0.5" />
                    </div>
                </div>
                <div className="flex justify-between items-center">
                    <label className="text-xs text-slate-600">Accent Color</label>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-400">{theme.accentColor}</span>
                        <input type="color" value={theme.accentColor} onChange={(e) => setTheme({...theme, accentColor: e.target.value})} className="h-6 w-8 rounded border border-slate-300 cursor-pointer p-0.5" />
                    </div>
                </div>
                <div className="flex justify-between items-center">
                    <label className="text-xs text-slate-600">Background</label>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-400">{theme.backgroundColor}</span>
                        <input type="color" value={theme.backgroundColor} onChange={(e) => setTheme({...theme, backgroundColor: e.target.value})} className="h-6 w-8 rounded border border-slate-300 cursor-pointer p-0.5" />
                    </div>
                </div>
                <div className="flex justify-between items-center">
                    <label className="text-xs text-slate-600">Outline/Border</label>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-400">{theme.borderColor}</span>
                        <input type="color" value={theme.borderColor} onChange={(e) => setTheme({...theme, borderColor: e.target.value})} className="h-6 w-8 rounded border border-slate-300 cursor-pointer p-0.5" />
                    </div>
                </div>
                
                <div className="flex justify-between items-center">
                    <label className="text-xs text-slate-600">Text Color</label>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-400">{theme.textColor}</span>
                        <input type="color" value={theme.textColor} onChange={(e) => setTheme({...theme, textColor: e.target.value})} className="h-6 w-8 rounded border border-slate-300 cursor-pointer p-0.5" />
                    </div>
                </div>
                
                <div>
                    <label className="text-xs text-slate-600 block mb-1">Font Family</label>
                    <select value={theme.fontFamily} onChange={(e) => setTheme({...theme, fontFamily: e.target.value})} className="w-full text-xs border border-slate-300 rounded p-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500">
                        <option value="Inter, sans-serif">Inter (Clean)</option>
                        <option value="'Roboto', sans-serif">Roboto (Modern)</option>
                        <option value="'Open Sans', sans-serif">Open Sans (Friendly)</option>
                        <option value="'Lato', sans-serif">Lato (Neutral)</option>
                        <option value="'Montserrat', sans-serif">Montserrat (Bold)</option>
                        <option value="'Playfair Display', serif">Playfair (Elegant)</option>
                    </select>
                </div>

                <div className="flex items-center gap-2 mt-1">
                    <input type="checkbox" checked={theme.isBoldText} onChange={(e) => setTheme({...theme, isBoldText: e.target.checked})} id="boldText" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                    <label htmlFor="boldText" className="text-xs text-slate-600 cursor-pointer select-none">Increase Text Weight (Bold)</label>
                </div>

                <div className="flex gap-2 pt-2">
                    <button 
                        onClick={() => setTheme({ primaryColor: '#1e1b4b', accentColor: '#4f46e5', backgroundColor: '#f1f5f9', borderColor: '#cbd5e1', textColor: '#1e293b', isBoldText: false, fontFamily: 'Inter, sans-serif' })}
                        className="text-[10px] text-slate-400 hover:text-slate-600 hover:underline flex-1 text-left"
                    >
                        Reset Defaults
                    </button>
                    <Button size="sm" onClick={handleQuickSaveTheme} className="h-7 text-xs px-3 bg-slate-800 hover:bg-slate-900" icon={<Save size={12}/>}>Save Theme & Exit</Button>
                </div>
            </div>
        </div>

        <div><label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Narrator Voice</label>
            <div className="mb-2 bg-indigo-50 p-2 rounded border border-indigo-100">
                <label className="text-[10px] font-bold text-indigo-700 uppercase block mb-1 flex items-center gap-1">Custom Voices (11Labs) <Bot size={10} /></label>
                <Input placeholder="Enter ElevenLabs API Key" type="password" value={elevenLabsApiKey} onChange={handleElevenLabsKeyChange} className="text-xs" onBlur={() => fetchElevenLabsVoices(elevenLabsApiKey)} />
            </div>
            <div className="flex gap-2 mb-2">
                <select className="flex-1 text-sm border-slate-300 rounded-md p-2" value={selectedVoice} onChange={(e) => handleGlobalVoiceChange(e.target.value as VoiceOption)}>
                    <optgroup label="Premium AI Voices (Male)">{geminiVoices.map(s => <option key={s} value={s}>{s}</option>)}</optgroup>
                    {elevenLabsVoices.length > 0 && (<optgroup label="ElevenLabs Custom">{elevenLabsVoices.map(v => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}</optgroup>)}
                </select>
                <button onClick={handleTestVoice} disabled={isPreviewingVoice} className="w-10 h-10 flex items-center justify-center bg-indigo-100 text-indigo-600 rounded-md hover:bg-indigo-200" title="Test Voice">{isPreviewingVoice ? <Loader2 size={16} className="animate-spin" /> : <Volume2 size={16} />}</button>
            </div>
            <button onClick={applyVoiceToAllAndReset} className="w-full text-[10px] font-bold bg-slate-200 text-slate-700 hover:bg-slate-300 py-1.5 rounded flex items-center justify-center gap-1 transition-colors"><ResetIcon size={10} /> Apply to All & Reset Audio</button>
            
            {/* Voice Control Settings (ElevenLabs) */}
            {elevenLabsApiKey && (selectedVoice.length > 15 || elevenLabsVoices.some(v => v.voice_id === selectedVoice)) && (
                <div className="mt-3 p-2 bg-slate-50 rounded border border-slate-200 space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase block">Voice Settings (ElevenLabs)</label>
                    <div>
                        <div className="flex justify-between items-center mb-0.5">
                            <span className="text-[10px] text-slate-600">Speed</span>
                            <span className="text-[10px] font-mono text-slate-500">{voiceSpeed.toFixed(1)}x</span>
                        </div>
                        <input type="range" min="0.5" max="2.0" step="0.1" value={voiceSpeed} onChange={(e) => setVoiceSpeed(parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-0.5">
                            <span className="text-[10px] text-slate-600">Stability</span>
                            <span className="text-[10px] font-mono text-slate-500">{Math.round(voiceStability * 100)}%</span>
                        </div>
                        <input type="range" min="0" max="1" step="0.05" value={voiceStability} onChange={(e) => setVoiceStability(parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                        <div className="flex justify-between text-[9px] text-slate-400"><span>Expressive</span><span>Stable</span></div>
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-0.5">
                            <span className="text-[10px] text-slate-600">Clarity</span>
                            <span className="text-[10px] font-mono text-slate-500">{Math.round(voiceSimilarityBoost * 100)}%</span>
                        </div>
                        <input type="range" min="0" max="1" step="0.05" value={voiceSimilarityBoost} onChange={(e) => setVoiceSimilarityBoost(parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                        <div className="flex justify-between text-[9px] text-slate-400"><span>Natural</span><span>Clear</span></div>
                    </div>
                </div>
            )}
        </div>

        <div className="space-y-3">
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-3 rounded-lg border border-indigo-100">
              <label className="text-xs font-semibold text-slate-500 uppercase mb-2 block flex items-center gap-2">
                <ImageIcon size={14} className="text-indigo-600" /> Image Provider
              </label>
              <div className="flex bg-white/80 p-1 rounded-lg shadow-inner flex-wrap gap-0.5">
                <button onClick={() => setSelectedImageProvider('gemini')} className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all ${selectedImageProvider === 'gemini' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}>Gemini</button>
                <button onClick={() => setSelectedImageProvider('openai')} className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all ${selectedImageProvider === 'openai' ? 'bg-emerald-600 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}>OpenAI</button>
                <button onClick={() => setSelectedImageProvider('nano-banana')} className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all ${selectedImageProvider === 'nano-banana' ? 'bg-pink-500 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`} title="Nano Banana Pro">Nano</button>
                <button onClick={() => setSelectedImageProvider('flux-schnell')} className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all ${selectedImageProvider === 'flux-schnell' ? 'bg-amber-500 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`} title="~$0.003/image">Schnell</button>
                <button onClick={() => setSelectedImageProvider('flux')} className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all ${selectedImageProvider === 'flux' ? 'bg-purple-600 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`} title="~$0.04/image">Pro</button>
              </div>
              <p className="text-[9px] text-slate-500 mt-1.5 text-center">{selectedImageProvider === 'nano-banana' ? 'Nano Banana Pro: Google Gemini via Replicate' : selectedImageProvider === 'flux-schnell' ? 'FLUX Schnell: Fast & cheap ~$0.003/img' : selectedImageProvider === 'flux' ? 'FLUX Pro: Best quality ~$0.04/img' : 'Uses your API keys from Settings'}</p>
            </div>
            <div><label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Slide Count / Pacing</label>
                <div className="flex bg-slate-200/50 p-1 rounded-lg">
                    <button onClick={() => { setVisualPacing('Normal'); updateAllLessons('visualPacing', 'Normal'); }} className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all flex items-center justify-center gap-1 ${visualPacing === 'Normal' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}><Timer size={12} /> Normal</button>
                    <button onClick={() => { setVisualPacing('Fast'); updateAllLessons('visualPacing', 'Fast'); }} className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all flex items-center justify-center gap-1 ${visualPacing === 'Fast' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}><Zap size={12} /> Fast (2x)</button>
                    <button onClick={() => { setVisualPacing('Turbo'); updateAllLessons('visualPacing', 'Turbo'); }} className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all flex items-center justify-center gap-1 ${visualPacing === 'Turbo' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}><Gauge size={12} /> Turbo (Max)</button>
                </div>
            </div>
            <div>
                <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Visual Source</label>
                <select className="w-full text-sm border-slate-300 rounded-md p-2" value={visualMode} onChange={(e) => { setVisualMode(e.target.value as VisualMode); updateAllLessons('visualMode', e.target.value); }}>
                    <option value="AI_Scene">AI Scene Images (Default)</option>
                    <option value="Abstract">AI Abstract Backgrounds</option>
                    <option value="Solid_Color">Solid Colors (No Images)</option>
                </select>
            </div>
            {visualMode === 'Solid_Color' && (
                <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Background Color</label>
                    <div className="flex items-center gap-2">
                        <input type="color" value={solidColor} onChange={(e) => { setSolidColor(e.target.value); updateAllLessons('solidColor', e.target.value); }} className="h-8 w-12 rounded border border-slate-300 p-0.5" />
                        <span className="text-xs font-mono text-slate-600">{solidColor}</span>
                    </div>
                </div>
            )}
            {visualMode !== 'Solid_Color' && (
                <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Visual Style</label>
                    <select className="w-full text-sm border-slate-300 rounded-md p-2 mb-2" value={selectedVisualStyle} onChange={(e) => { setSelectedVisualStyle(e.target.value); updateAllLessons('visualStyle', e.target.value); }}>{VISUAL_STYLES.map(s => <option key={s} value={s}>{s}</option>)}</select>
                    <div className="w-full aspect-video rounded-md overflow-hidden bg-slate-200 border border-slate-300 relative group">
                        <img src={VISUAL_STYLE_PREVIEWS[selectedVisualStyle] || VISUAL_STYLE_PREVIEWS["Minimalist Flat Vector"]} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt="Style Preview" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <span className="text-white text-[10px] font-bold uppercase tracking-wider bg-black/50 px-2 py-1 rounded border border-white/20 backdrop-blur-sm">Example</span>
                        </div>
                    </div>
                </div>
            )}
        </div>

        <div><label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Caption Style</label><select className="w-full text-sm border-slate-300 rounded-md p-2 mb-2" value={selectedCaptionStyle} onChange={(e) => handleGlobalCaptionStyleChange(e.target.value as CaptionStyle)}>{captionStyles.map(s => <option key={s} value={s}>{s === 'None' ? 'No Captions' : s}</option>)}</select>
            {selectedCaptionStyle !== 'None' && (
                <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Position</label><div className="flex bg-slate-100 rounded p-0.5">{['Top', 'Center', 'Bottom'].map((pos) => (<button key={pos} onClick={() => { setCaptionPosition(pos as CaptionPosition); updateAllLessons('captionPosition', pos); }} className={`flex-1 text-[10px] py-1 rounded ${captionPosition === pos ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>{pos}</button>))}</div></div>
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Size</label><div className="flex bg-slate-100 rounded p-0.5">{['Small', 'Medium', 'Large'].map((size) => (<button key={size} onClick={() => { setCaptionSize(size as CaptionSize); updateAllLessons('captionSize', size); }} className={`flex-1 text-[10px] py-1 rounded ${captionSize === size ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>{size.charAt(0)}</button>))}</div></div>
                    </div>
                    <div className="pt-2 border-t border-slate-100">
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Customization</label>
                        <div className="grid grid-cols-3 gap-2">
                            <div><label className="text-[9px] text-slate-500 block mb-0.5">Text Color</label><div className="flex items-center gap-1"><input type="color" value={captionColor} onChange={(e) => { setCaptionColor(e.target.value); updateAllLessons('captionColor', e.target.value); }} className="w-6 h-6 rounded border-none cursor-pointer" /></div></div>
                            <div><label className="text-[9px] text-slate-500 block mb-0.5">Background</label><div className="flex items-center gap-1"><input type="color" value={captionBgColor || '#000000'} onChange={(e) => { setCaptionBgColor(e.target.value); updateAllLessons('captionBgColor', e.target.value); }} className="w-6 h-6 rounded border-none cursor-pointer" /><button onClick={() => { setCaptionBgColor(''); updateAllLessons('captionBgColor', ''); }} className="text-[9px] text-slate-400 hover:text-red-500" title="Clear Background">×</button></div></div>
                            <div><label className="text-[9px] text-slate-500 block mb-0.5">Outline</label><div className="flex items-center gap-1"><input type="color" value={captionOutlineColor || '#000000'} onChange={(e) => { setCaptionOutlineColor(e.target.value); updateAllLessons('captionOutlineColor', e.target.value); }} className="w-6 h-6 rounded border-none cursor-pointer" /><button onClick={() => { setCaptionOutlineColor(''); updateAllLessons('captionOutlineColor', ''); }} className="text-[9px] text-slate-400 hover:text-red-500" title="Clear Outline">×</button></div></div>
                        </div>
                    </div>
                </div>
            )}
            {selectedCaptionStyle !== 'None' && (
                <div className="mt-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Live Preview</label>
                    <div className="bg-slate-900 rounded p-4 h-20 flex items-center justify-center overflow-hidden relative border border-slate-700 shadow-inner">
                        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-700 via-slate-900 to-black pointer-events-none"></div>
                        <div className={getCaptionPreviewClass(selectedCaptionStyle)} style={getCustomCaptionStyle()}>
                            The quick brown fox
                        </div>
                    </div>
                </div>
            )}
        </div>

        <div className="pb-4">
            <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Background Music</label>
                <button 
                    onClick={() => { const newState = !includeMusic; setIncludeMusic(newState); if(!newState) updateAllLessons('backgroundMusicUrl', undefined); else updateAllLessons('backgroundMusicUrl', selectedMusicTrack); }} 
                    className={`w-8 h-4 rounded-full p-0.5 transition-colors ${includeMusic ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                    <div className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${includeMusic ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </button>
            </div>
            {includeMusic && (
                <div className="space-y-2">
                    <select className="w-full text-sm border-slate-300 rounded-md p-2" value={selectedMusicTrack} onChange={(e) => handleGlobalMusicChange(e.target.value)}>
                        {MUSIC_TRACKS.map(t => <option key={t.url} value={t.url}>{t.name}</option>)}
                    </select>
                    <div className="flex items-center gap-2">
                        <button onClick={toggleMusicPreview} className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium">
                            {isPlayingMusic ? <><PauseCircle size={14}/> Stop Preview</> : <><PlayCircle size={14}/> Test Listen</>}
                        </button>
                    </div>
                    <div className="flex bg-slate-200/50 p-1 rounded-lg mt-2">
                        <button onClick={() => handleGlobalMusicModeChange('Continuous')} className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all ${musicMode === 'Continuous' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Continuous</button>
                        <button onClick={() => handleGlobalMusicModeChange('IntroOutro')} className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all ${musicMode === 'IntroOutro' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Intro/Outro</button>
                    </div>
                </div>
            )}
        </div>
      </div>
  );

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-8 min-h-screen flex flex-col">
       {/* Preview Image Modal */}
       {previewImageUrl && (
            <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-8 animate-fade-in" onClick={() => setPreviewImageUrl(null)}>
                <div className="relative max-w-5xl w-full max-h-full flex items-center justify-center">
                    <button onClick={() => setPreviewImageUrl(null)} className="absolute -top-12 right-0 text-white/50 hover:text-white transition-colors">
                        <X size={32} />
                    </button>
                    <img src={previewImageUrl} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl border border-white/10" />
                </div>
            </div>
        )}
        
        {/* Bulk Generation Confirmation */}
        {bulkGeneratingId === 'course-all' && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
                 <div className="bg-white rounded-xl shadow-xl p-8 flex flex-col items-center">
                     <Loader2 size={48} className="text-indigo-600 animate-spin mb-4" />
                     <h3 className="font-bold text-lg mb-2">Generating All Visuals</h3>
                     <p className="text-slate-500 text-center max-w-xs">Creating images for every scene in the course. This may take a few minutes...</p>
                 </div>
             </div>
        )}

        <div className="flex items-center justify-between mb-8 flex-shrink-0">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                    <Wand2 className="text-indigo-600" /> AI Course Wizard
                </h1>
                <p className="text-slate-500">Create comprehensive courses in minutes.</p>
            </div>
            <div className="flex gap-2">
                {recoveryAvailable && (
                    <div className="flex items-center gap-2 mr-4 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-lg text-xs font-bold animate-pulse">
                        <AlertCircle size={14} /> Unsaved Progress Found
                        <button onClick={handleResume} className="underline hover:text-amber-900">Resume</button>
                        <span className="text-amber-300">|</span>
                        <button onClick={handleDiscardRecovery} className="hover:text-amber-900">Discard</button>
                    </div>
                )}
                <Button variant="outline" onClick={onCancel}>Cancel</Button>
            </div>
        </div>

        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            {/* Steps Indicator */}
            <div className="bg-slate-50 border-b border-slate-200 px-8 py-4 flex items-center justify-between overflow-x-auto">
                {['Upload Source', 'Strategy', 'Outline', 'Content Editor', 'Final Polish'].map((label, idx) => {
                    const stepIdx = ['upload', 'strategy', 'outline', 'content', 'rendering'].indexOf(step);
                    const isCompleted = stepIdx > idx;
                    const isCurrent = stepIdx === idx;
                    return (
                        <div key={idx} className={`flex items-center gap-2 flex-shrink-0 ${isCurrent ? 'text-indigo-600 font-bold' : isCompleted ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs border ${isCurrent ? 'border-indigo-600 bg-indigo-50' : isCompleted ? 'border-emerald-600 bg-emerald-50' : 'border-slate-300 bg-white'}`}>
                                {isCompleted ? <CheckCircle2 size={14} /> : idx + 1}
                            </div>
                            <span className="text-sm hidden sm:inline">{label}</span>
                            {idx < 4 && <ChevronRight size={14} className="text-slate-300 mx-2" />}
                        </div>
                    );
                })}
            </div>

            <div className="flex-1 overflow-hidden relative">
                 {/* STEP 1: UPLOAD */}
                 {step === 'upload' && (
                     <div className="h-full overflow-y-auto p-4 lg:p-8 animate-fade-in flex flex-col lg:flex-row gap-8">
                         <div className="flex-1 space-y-8">
                             <div className="text-center lg:text-left">
                                 <h2 className="text-2xl font-bold text-slate-900 mb-2">Let's start with your content</h2>
                                 <p className="text-slate-500">Upload a source file (PDF, TXT, MD) or start from scratch with a topic.</p>
                             </div>

                             <div className="border-2 border-dashed border-slate-300 rounded-xl p-10 hover:bg-slate-50 transition-colors relative flex items-center justify-center min-h-[200px] group">
                                <input type="file" accept=".pdf,.txt,.md" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                <div className="flex flex-col items-center gap-4 transition-transform group-hover:scale-105">
                                    <div className="bg-indigo-50 p-4 rounded-full">
                                        {file ? <CheckCircle2 size={40} className="text-emerald-500" /> : <UploadCloud size={40} className="text-indigo-400" />}
                                    </div>
                                    <div className="text-center">
                                        <span className="font-bold text-lg text-slate-700 block">{file ? file.name : "Click to Upload Source File"}</span>
                                        <span className="text-sm text-slate-500">{file ? "File ready for analysis" : "Supports Full eBooks, PDFs, TXT, MD (Max 10MB)"}</span>
                                    </div>
                                </div>
                                <div className="absolute bottom-4 right-4 z-20">
                                    <Button size="sm" variant={file || courseDetails.title ? "primary" : "secondary"} className="shadow-md" onClick={(e) => { e.stopPropagation(); generateMetadata('headline'); generateMetadata('description'); }} disabled={isAutoGeneratingDetails !== null} icon={isAutoGeneratingDetails ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>}>
                                        {isAutoGeneratingDetails ? 'Analyzing...' : 'Auto-Fill Details'}
                                    </Button>
                                </div>
                             </div>

                             <div className="space-y-4">
                                 <Input 
                                    label="Course Title" 
                                    value={courseDetails.title} 
                                    onChange={e => setCourseDetails({...courseDetails, title: e.target.value})} 
                                    placeholder="e.g. Advanced React Patterns"
                                    labelAction={<button onClick={() => generateMetadata('headline')} disabled={isAutoGeneratingDetails !== null} className="text-xs text-indigo-600 font-bold hover:bg-indigo-50 px-2 py-1 rounded flex items-center gap-1 transition-colors">{isAutoGeneratingDetails === 'headline' ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>} AI Generate</button>}
                                 />
                                 <Input label="Subtitle / Headline" value={courseDetails.headline} onChange={e => setCourseDetails({...courseDetails, headline: e.target.value})} placeholder="e.g. Master the modern web stack" />
                                 <TextArea 
                                    label="Description" 
                                    value={courseDetails.description} 
                                    onChange={e => setCourseDetails({...courseDetails, description: e.target.value})} 
                                    placeholder="What will students learn in this course?"
                                    rows={3}
                                    labelAction={<button onClick={() => generateMetadata('description')} disabled={isAutoGeneratingDetails !== null} className="text-xs text-indigo-600 font-bold hover:bg-indigo-50 px-2 py-1 rounded flex items-center gap-1 transition-colors">{isAutoGeneratingDetails === 'description' ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>} AI Draft</button>}
                                 />
                             </div>

                             <div className="flex justify-end pt-4">
                                 <Button onClick={() => setStep('strategy')} disabled={!courseDetails.title} size="lg" icon={<ChevronRight size={20} />}>Next: Strategy</Button>
                             </div>
                         </div>

                         {/* ECOVER SIDEBAR */}
                         <div className="w-full lg:w-80 space-y-6 bg-slate-50 p-6 rounded-xl border border-slate-200 h-fit">
                             <h3 className="font-bold text-slate-700 flex items-center gap-2"><ImageIcon size={18} className="text-indigo-600"/> Course Cover</h3>
                             
                             <div className="flex bg-slate-200 p-1 rounded-lg">
                                 <button onClick={() => setEcoverMode('upload')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${ecoverMode === 'upload' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Upload</button>
                                 <button onClick={() => setEcoverMode('generate')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${ecoverMode === 'generate' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>AI Gen</button>
                                 <button onClick={() => setEcoverMode('template')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${ecoverMode === 'template' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Library</button>
                             </div>

                             {ecoverMode === 'upload' && (
                                 <div className="relative border-2 border-dashed border-slate-300 rounded-lg h-48 flex items-center justify-center hover:bg-slate-100 transition-colors cursor-pointer group">
                                     <input type="file" accept="image/*" onChange={handleEcoverChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                     <div className="text-center text-slate-400 group-hover:text-indigo-500 transition-colors">
                                         <Upload size={24} className="mx-auto mb-2"/>
                                         <span className="text-xs font-medium">Click to Upload Image</span>
                                     </div>
                                 </div>
                             )}

                             {ecoverMode === 'generate' && (
                                 <div className="space-y-3">
                                     <TextArea label="Visual Instructions" placeholder="e.g. Dark corporate theme, minimalist..." className="text-xs" rows={3} value={ecoverInstructions} onChange={(e) => setEcoverInstructions(e.target.value)} />
                                     <Button size="sm" onClick={generateAIECover} isLoading={isGeneratingEcover} className="w-full" icon={<Wand2 size={14} />}>Generate Cover</Button>
                                     <p className="text-[10px] text-slate-400 leading-tight">AI will design a professional cover based on your title and style preferences.</p>
                                 </div>
                             )}
                             
                             {ecoverMode === 'template' && (
                                 <div className="space-y-3">
                                     <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                                         {customTemplates.map((t, idx) => (
                                             <div key={idx} className="relative group aspect-[3/4] cursor-pointer rounded overflow-hidden border border-slate-200 hover:border-indigo-500" onClick={() => handleSelectTemplate(t)}>
                                                  <img src={t} className="w-full h-full object-cover" />
                                                  {idx >= ECOVER_TEMPLATES.length && (
                                                      <button onClick={(e) => { e.stopPropagation(); deleteTemplate(idx); }} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><X size={10}/></button>
                                                  )}
                                             </div>
                                         ))}
                                     </div>
                                     <div className="flex gap-2">
                                         <button onClick={() => templateInputRef.current?.click()} className="flex-1 py-2 text-[10px] border border-dashed border-slate-300 rounded text-slate-500 hover:bg-slate-100 flex flex-col items-center gap-1">
                                             <Upload size={12}/> Upload Base
                                         </button>
                                         <button onClick={generateAIECover} className="flex-1 py-2 text-[10px] bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 border border-indigo-200 flex flex-col items-center gap-1 font-bold">
                                             <Sparkles size={12}/> Remix Selected
                                         </button>
                                     </div>
                                     <div className="flex gap-2 pt-2 border-t border-slate-200">
                                         <button onClick={handleExportLibrary} className="flex-1 text-[10px] text-slate-400 hover:text-indigo-600">Export Lib</button>
                                         <button onClick={() => libraryImportRef.current?.click()} className="flex-1 text-[10px] text-slate-400 hover:text-indigo-600">Import Lib</button>
                                         <input type="file" ref={templateInputRef} className="hidden" accept="image/*" onChange={handleUploadTemplate} />
                                         <input type="file" ref={libraryImportRef} className="hidden" accept=".json" onChange={handleImportLibrary} />
                                     </div>
                                 </div>
                             )}

                             {ecoverPreview && (
                                 <div className="rounded-lg overflow-hidden border border-slate-200 shadow-md relative group">
                                     <img src={ecoverPreview} className="w-full h-auto" alt="Cover Preview" />
                                     {ecoverMode !== 'template' && (
                                         <button onClick={handleSaveCurrentToLibrary} className="absolute top-2 right-2 bg-white/90 text-slate-700 text-[10px] px-2 py-1 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-indigo-50 hover:text-indigo-600 font-medium">Save to Lib</button>
                                     )}
                                 </div>
                             )}
                         </div>
                     </div>
                 )}

                 {/* STEP 2: STRATEGY */}
                 {step === 'strategy' && (
                     <div className="h-full overflow-y-auto p-4 lg:p-8 animate-fade-in flex flex-col items-center">
                         <div className="max-w-3xl w-full space-y-8">
                             <div className="text-center">
                                 <h2 className="text-2xl font-bold text-slate-900 mb-2">Curriculum Strategy</h2>
                                 <p className="text-slate-500">How should the AI structure this course?</p>
                             </div>

                             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                 {[{id: 'strict', label: 'eBook Import (Strict)', desc: 'Maps eBook chapters to Modules and sub-chapters/sections to Lessons. Preserves original text.', icon: <BookOpen size={24}/>}, {id: 'hybrid', label: 'Hybrid Enhancement', desc: 'Uses source as base, but expands with modern examples and flow.', icon: <Sparkles size={24}/>}, {id: 'creative', label: 'Creative Expansion', desc: 'Uses source as inspiration only. Maximizes engagement.', icon: <Zap size={24}/>}].map((m: any) => (
                                     <button key={m.id} onClick={() => setGenerationStrategy(m.id)} className={`p-6 rounded-xl border-2 text-left transition-all group ${generationStrategy === m.id ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200 hover:border-indigo-200 hover:bg-slate-50'}`}>
                                         <div className={`mb-4 ${generationStrategy === m.id ? 'text-indigo-600' : 'text-slate-400 group-hover:text-indigo-500'}`}>{m.icon}</div>
                                         <div className="font-bold text-slate-900 mb-1">{m.label}</div>
                                         <div className="text-xs text-slate-500 leading-relaxed">{m.desc}</div>
                                     </button>
                                 ))}
                             </div>

                             <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
                                 <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2">Structure Settings</h3>
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                     <div>
                                         <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Module Count</label>
                                         <div className="grid grid-cols-5 gap-2">
                                             {['auto', 'small', 'medium', 'large', 'xlarge'].map((opt) => (
                                                 <button key={opt} onClick={() => setModuleCountMode(opt as ModuleCountMode)} className={`py-2 rounded-lg text-xs font-medium border transition-colors ${moduleCountMode === opt ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                                                     {opt === 'xlarge' ? 'XL' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                                                 </button>
                                             ))}
                                         </div>
                                         <p className="text-[10px] text-slate-400 mt-2">Auto detects based on content density. XL creates masterclass size.</p>
                                     </div>
                                     <div>
                                         <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Lessons per Module</label>
                                         <div className="grid grid-cols-4 gap-2">
                                             {['auto', 'short', 'medium', 'long'].map((opt) => (
                                                 <button key={opt} onClick={() => setLessonCountMode(opt as LessonCountMode)} className={`py-2 rounded-lg text-xs font-medium border transition-colors ${lessonCountMode === opt ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                                                     {opt.charAt(0).toUpperCase() + opt.slice(1)}
                                                 </button>
                                             ))}
                                         </div>
                                         <p className="text-[10px] text-slate-400 mt-2">Short = ~2 mins/lesson. Long = ~10 mins/lesson.</p>
                                     </div>
                                 </div>
                                 
                                 <div>
                                     <TextArea 
                                        label="Specific Instructions (Optional)" 
                                        placeholder="e.g. Ensure there is a quiz at the end of each module, focus heavily on practical examples..." 
                                        value={outlineInstructions}
                                        onChange={(e) => setOutlineInstructions(e.target.value)}
                                        rows={2}
                                     />
                                 </div>
                             </div>

                             <div className="flex justify-between pt-4 border-t border-slate-100">
                                 <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
                                 <Button onClick={generateOutline} isLoading={isProcessingAI} size="lg" icon={<Wand2 size={20} />}>Generate Outline</Button>
                             </div>
                             
                             {isProcessingAI && (
                                 <div className="text-center">
                                     <div className="w-full bg-slate-100 rounded-full h-2 mb-2 overflow-hidden">
                                         <div className="bg-indigo-600 h-full transition-all duration-500" style={{ width: `${parsingProgress}%` }}></div>
                                     </div>
                                     <p className="text-xs text-slate-500 animate-pulse">Analyzing content architecture...</p>
                                 </div>
                             )}
                         </div>
                     </div>
                 )}

                 {/* STEP 3: OUTLINE REVIEW */}
                 {step === 'outline' && (
                     <div className="h-full overflow-y-auto p-4 lg:p-8 animate-fade-in flex flex-col lg:flex-row gap-8">
                         <div className="flex-1">
                             <div className="flex justify-between items-end mb-6">
                                 <div>
                                     <h2 className="text-2xl font-bold text-slate-900">Review Curriculum</h2>
                                     <p className="text-slate-500">Edit the structure before generating content.</p>
                                 </div>
                                 <div className="flex gap-2">
                                     <Button variant="outline" size="sm" onClick={() => { setModules([]); generateOutline(); }} icon={<RotateCcw size={14}/>}>Regenerate</Button>
                                     <Button size="sm" onClick={generateDraftContent} icon={<ChevronRight size={16}/>}>Approve & Write Script</Button>
                                 </div>
                             </div>

                             <div className="space-y-6">
                                 {modules.map((module, mIdx) => (
                                     <div key={module.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                                         <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                                             <input 
                                                className="bg-transparent font-bold text-slate-800 text-lg w-full focus:outline-none focus:ring-0" 
                                                value={module.title}
                                                onChange={(e) => {
                                                    const newMods = [...modules];
                                                    newMods[mIdx].title = e.target.value;
                                                    setModules(newMods);
                                                }}
                                             />
                                             <div className="flex items-center gap-2">
                                                 <button onClick={() => {
                                                     const newMods = [...modules];
                                                     newMods[mIdx].lessons.push({ id: `l-new-${Date.now()}`, moduleId: module.id, title: "New Lesson", sourceText: "Enter summary...", visuals: [], status: LessonStatus.PENDING, progress: 0, duration: '0:00', durationSeconds: 0 });
                                                     setModules(newMods);
                                                 }} className="p-1.5 hover:bg-slate-200 rounded text-slate-500" title="Add Lesson"><Plus size={16}/></button>
                                                 <button onClick={() => {
                                                     const newMods = modules.filter((_, i) => i !== mIdx);
                                                     setModules(newMods);
                                                 }} className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded" title="Delete Module"><Trash2 size={16}/></button>
                                             </div>
                                         </div>
                                         <div className="divide-y divide-slate-100">
                                             {module.lessons.map((lesson, lIdx) => (
                                                 <div key={lesson.id} className="px-6 py-4 hover:bg-slate-50 group transition-colors">
                                                     <div className="flex items-start gap-4">
                                                         <div className="mt-1 w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold border border-indigo-100 flex-shrink-0">{lIdx + 1}</div>
                                                         <div className="flex-1 space-y-2">
                                                             <input 
                                                                className="w-full font-semibold text-slate-800 bg-transparent focus:outline-none focus:underline" 
                                                                value={lesson.title}
                                                                onChange={(e) => {
                                                                    const newMods = [...modules];
                                                                    newMods[mIdx].lessons[lIdx].title = e.target.value;
                                                                    setModules(newMods);
                                                                }}
                                                             />
                                                             <textarea 
                                                                className="w-full text-sm text-slate-500 bg-transparent focus:outline-none resize-none"
                                                                rows={2}
                                                                value={lesson.sourceText}
                                                                onChange={(e) => {
                                                                    const newMods = [...modules];
                                                                    newMods[mIdx].lessons[lIdx].sourceText = e.target.value;
                                                                    setModules(newMods);
                                                                }}
                                                             />
                                                         </div>
                                                         <button onClick={() => {
                                                             const newMods = [...modules];
                                                             newMods[mIdx].lessons = newMods[mIdx].lessons.filter((_, i) => i !== lIdx);
                                                             setModules(newMods);
                                                         }} className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-red-500 transition-all"><Trash2 size={16}/></button>
                                                     </div>
                                                 </div>
                                             ))}
                                         </div>
                                     </div>
                                 ))}
                                 
                                 <button onClick={() => {
                                     setModules([...modules, { id: `m-new-${Date.now()}`, courseId: 'temp', title: "New Module", lessons: [] }]);
                                 }} className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:border-indigo-400 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2">
                                     <Plus size={20}/> Add Module
                                 </button>
                             </div>
                         </div>
                         
                         {/* Refinement Sidebar */}
                         <div className="w-full lg:w-80 h-fit bg-slate-50 p-6 rounded-xl border border-slate-200">
                             <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Bot size={18} className="text-indigo-600"/> AI Assistant</h3>
                             <div className="space-y-4">
                                 <p className="text-sm text-slate-600">Want to change the structure? Ask the AI to adjust it.</p>
                                 <TextArea 
                                    placeholder="e.g. Merge module 1 and 2, add a section on React Hooks..." 
                                    rows={4} 
                                    value={refineInstructions} 
                                    onChange={(e) => setRefineInstructions(e.target.value)}
                                    className="text-sm"
                                 />
                                 <Button onClick={handleRefineOutline} isLoading={isRefining} className="w-full" icon={<Sparkles size={14}/>}>Refine Structure</Button>
                             </div>
                         </div>
                     </div>
                 )}

                 {/* STEP 4: CONTENT EDITOR */}
                 {step === 'content' && (
                     <div className="flex h-full animate-fade-in flex-col md:flex-row">
                         {/* Navigation Sidebar */}
                         <div className="w-full md:w-72 bg-slate-50 border-r border-slate-200 flex flex-col h-1/3 md:h-full">
                             <div className="p-4 border-b border-slate-200">
                                 <div className="flex justify-between items-center mb-3">
                                     <span className="font-bold text-slate-700 text-sm">Course Structure</span>
                                     <button onClick={addNewModule} className="p-1.5 bg-slate-200 hover:bg-slate-300 rounded text-slate-600" title="Add Module"><Layers size={14}/></button>
                                 </div>
                                 <button onClick={openAddLessonModal} className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors">
                                     <Plus size={16}/> Add New Video
                                 </button>
                             </div>
                             <div className="flex-1 overflow-y-auto custom-scrollbar">
                                 {modules.map((module, mIdx) => (
                                     <div key={module.id} className="border-b border-slate-200">
                                         <div className="px-3 py-2 bg-slate-100 flex items-center justify-between group sticky top-0 z-10">
                                             {editingModuleId === module.id ? (
                                                 <input 
                                                     autoFocus
                                                     className="flex-1 text-xs font-bold text-slate-700 bg-white px-2 py-1 rounded border border-indigo-300 focus:outline-none"
                                                     value={module.title}
                                                     onChange={(e) => renameModule(mIdx, e.target.value)}
                                                     onBlur={() => setEditingModuleId(null)}
                                                     onKeyDown={(e) => e.key === 'Enter' && setEditingModuleId(null)}
                                                 />
                                             ) : (
                                                 <span className="text-[10px] font-bold text-slate-500 uppercase truncate flex-1">{module.title}</span>
                                             )}
                                             <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                 <button onClick={() => setEditingModuleId(module.id)} className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600" title="Rename Module"><Edit3 size={12}/></button>
                                                 <button onClick={() => deleteModule(mIdx)} className="p-1 hover:bg-red-100 rounded text-slate-400 hover:text-red-500" title="Delete Module"><Trash2 size={12}/></button>
                                             </div>
                                         </div>
                                         {module.lessons.map((lesson, lIdx) => {
                                             const isSelected = expandedLessonId === lesson.id;
                                             const hasContent = lesson.status !== LessonStatus.PENDING;
                                             return (
                                                 <div key={lesson.id} className={`relative group ${isSelected ? 'bg-white border-l-4 border-l-indigo-600 shadow-sm' : ''}`}>
                                                     <button 
                                                        onClick={() => setExpandedLessonId(lesson.id)}
                                                        className="w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-white transition-colors flex items-center justify-between"
                                                     >
                                                         <div className="min-w-0 flex-1">
                                                             <div className={`text-xs font-semibold truncate ${isSelected ? 'text-indigo-700' : 'text-slate-700'}`}>{lesson.title}</div>
                                                             <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                                                                 {hasContent ? <span className="text-emerald-500 flex items-center"><CheckCircle2 size={8} className="mr-0.5"/> Drafted</span> : <span>Pending...</span>}
                                                             </div>
                                                         </div>
                                                         <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                             <button onClick={(e) => { e.stopPropagation(); setShowMoveLesson(lesson.id); }} className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600" title="Move to Module"><ArrowRight size={12}/></button>
                                                             {lIdx > 0 && <button onClick={(e) => { e.stopPropagation(); reorderLesson(mIdx, lIdx, lIdx - 1); }} className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600" title="Move Up"><ChevronRight size={12} className="rotate-[-90deg]"/></button>}
                                                             {lIdx < module.lessons.length - 1 && <button onClick={(e) => { e.stopPropagation(); reorderLesson(mIdx, lIdx, lIdx + 1); }} className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600" title="Move Down"><ChevronRight size={12} className="rotate-90"/></button>}
                                                             <button onClick={(e) => { e.stopPropagation(); deleteLesson(mIdx, lIdx); }} className="p-1 hover:bg-red-100 rounded text-slate-400 hover:text-red-500" title="Delete"><Trash2 size={12}/></button>
                                                         </div>
                                                     </button>
                                                     {showMoveLesson === lesson.id && (
                                                         <div className="absolute left-full top-0 z-20 bg-white border border-slate-200 rounded-lg shadow-lg p-2 ml-1 min-w-[150px]">
                                                             <div className="text-[10px] font-bold text-slate-500 mb-1 px-2">Move to Module:</div>
                                                             {modules.map((m, mi) => (
                                                                 <button key={m.id} onClick={() => moveLessonToModule(lesson.id, m.id, m.lessons.length)} className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-100 ${m.id === module.id ? 'text-slate-400' : 'text-slate-700'}`} disabled={m.id === module.id}>{m.title}</button>
                                                             ))}
                                                             <button onClick={() => setShowMoveLesson(null)} className="w-full text-left px-2 py-1.5 text-xs text-slate-400 hover:text-slate-600 border-t border-slate-100 mt-1 pt-1">Cancel</button>
                                                         </div>
                                                     )}
                                                 </div>
                                             );
                                         })}
                                     </div>
                                 ))}
                             </div>
                             <div className="p-3 border-t border-slate-200 bg-white space-y-2">
                                 <Button onClick={openAddLessonModal} variant="outline" className="w-full" size="sm" icon={<Plus size={14}/>}>Add New Video</Button>
                                 <Button onClick={renderFinalCourse} className="w-full" icon={<Film size={16}/>}>Render Final Course</Button>
                             </div>
                         </div>

                         {/* Main Editor Area */}
                         <div className="flex-1 flex flex-col overflow-hidden bg-white h-2/3 md:h-full">
                             {expandedLessonId ? (
                                 (() => {
                                     // Find active lesson safely
                                     let activeMIdx = -1, activeLIdx = -1;
                                     modules.forEach((m, mI) => m.lessons.forEach((l, lI) => { if(l.id === expandedLessonId) { activeMIdx = mI; activeLIdx = lI; }}));
                                     
                                     // Ensure we have a valid lesson, if not select the first one if available
                                     if (activeMIdx === -1 && modules.length > 0 && modules[0].lessons.length > 0) {
                                         activeMIdx = 0; activeLIdx = 0;
                                     }
                                     
                                     if (activeMIdx === -1) return (
                                         <div className="flex h-full">
                                             <div className="flex-1 flex items-center justify-center text-slate-400">
                                                 <div className="text-center">
                                                     <LayoutTemplate size={48} className="mb-4 opacity-50 mx-auto"/>
                                                     <p>Select a lesson to edit content</p>
                                                 </div>
                                             </div>
                                             {/* Force sidebar visibility even if no lesson selected, to allow theme editing */}
                                             <div className="hidden lg:flex w-80 border-l border-slate-200 bg-slate-50 h-full overflow-hidden flex-col">
                                                 {renderSidebarSettings()}
                                             </div>
                                         </div>
                                     );

                                     const lesson = modules[activeMIdx].lessons[activeLIdx];

                                     return (
                                         <div className="flex h-full flex-col lg:flex-row">
                                             {/* Script & Visuals Column */}
                                             <div className="flex-1 flex flex-col overflow-hidden">
                                                 <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white z-10">
                                                     <div>
                                                         <h3 className="font-bold text-slate-800">{lesson.title}</h3>
                                                         <div className="flex items-center gap-2 text-xs text-slate-500">
                                                            <span className="flex items-center gap-1"><Mic size={10}/> {selectedVoice}</span>
                                                            <span className="flex items-center gap-1"><ImageIcon size={10}/> {selectedVisualStyle}</span>
                                                            <button 
                                                                onClick={() => {
                                                                    const newMods = [...modules];
                                                                    newMods[activeMIdx].lessons[activeLIdx].awardsCertificate = !lesson.awardsCertificate;
                                                                    setModules(newMods);
                                                                }}
                                                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full transition-colors ${lesson.awardsCertificate ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                                                title={lesson.awardsCertificate ? "Awards Certificate - Click to disable" : "No Certificate - Click to enable"}
                                                            >
                                                                <Award size={10}/> {lesson.awardsCertificate ? 'Certificate' : 'No Cert'}
                                                            </button>
                                                         </div>
                                                     </div>
                                                     <div className="flex gap-2">
                                                         <Button size="sm" variant="outline" onClick={() => setIsAddingResource(true)} icon={<LinkIcon size={14}/>}>Add Resource</Button>
                                                         <Button size="sm" variant="secondary" onClick={() => bulkGenerateLessonImages(activeMIdx, activeLIdx)} disabled={!!bulkGeneratingId} icon={bulkGeneratingId === lesson.id ? <Loader2 size={14} className="animate-spin"/> : <ImageIcon size={14}/>}>{bulkGeneratingId === lesson.id ? 'Generating...' : 'Generate All Images'}</Button>
                                                     </div>
                                                 </div>
                                                 
                                                 <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6 custom-scrollbar">
                                                     {/* Script Section */}
                                                     <div className="space-y-2">
                                                         <label className="text-xs font-bold text-slate-500 uppercase flex justify-between">
                                                             <span>Narration Script</span>
                                                             <span className="text-indigo-600 cursor-pointer hover:underline" onClick={() => {
                                                                 const newScript = prompt("Enter new script:", lesson.sourceText);
                                                                 // Fix:
                                                                 const newMods = [...modules]; newMods[activeMIdx].lessons[activeLIdx].sourceText = newScript || lesson.sourceText; setModules(newMods);
                                                             }}>Edit Text</span>
                                                         </label>
                                                         <textarea 
                                                            className="w-full p-4 rounded-xl border border-slate-200 text-slate-700 leading-relaxed text-sm focus:ring-2 focus:ring-indigo-100 outline-none resize-none h-40"
                                                            value={lesson.sourceText}
                                                            onChange={(e) => {
                                                                const newMods = [...modules];
                                                                newMods[activeMIdx].lessons[activeLIdx].sourceText = e.target.value;
                                                                setModules(newMods);
                                                            }}
                                                         />
                                                     </div>

                                                     {/* Visuals Section */}
                                                     <div>
                                                         <div className="flex justify-between items-end mb-3">
                                                             <label className="text-xs font-bold text-slate-500 uppercase">Storyboard ({lesson.visuals?.length || 0} Scenes)</label>
                                                             <div className="flex gap-2">
                                                                 <button onClick={() => handleExportLessonPrompts(activeMIdx, activeLIdx)} className="text-xs text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded flex items-center gap-1" title="Export prompts to JSON"><Download size={12}/> Export</button>
                                                                 <button onClick={() => handleImportLessonImages(activeMIdx, activeLIdx)} className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded flex items-center gap-1" title="Import images from JSON"><Upload size={12}/> Import</button>
                                                                 <button onClick={() => addVisualScene(activeMIdx, activeLIdx)} className="text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded text-slate-600 flex items-center gap-1"><Plus size={12}/> Add Scene</button>
                                                                 <button onClick={() => regenerateLessonVisuals(activeMIdx, activeLIdx)} disabled={!!isRegeneratingVisuals} className="text-xs bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded text-indigo-600 flex items-center gap-1">
                                                                     {isRegeneratingVisuals === lesson.id ? <Loader2 size={12} className="animate-spin"/> : <RefreshCw size={12}/>} Redo Storyboard
                                                                 </button>
                                                             </div>
                                                         </div>
                                                         
                                                         <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                                             {lesson.visuals?.map((vis, vIdx) => (
                                                                 <div key={vis.id} className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
                                                                     <div className="aspect-video bg-slate-100 relative group">
                                                                         {vis.imageData ? (
                                                                             <img 
                                                                                src={vis.imageData.startsWith('/media/') || vis.imageData.startsWith('/objects/') || vis.imageData.startsWith('http') || vis.imageData.startsWith('data:') ? vis.imageData : `data:image/png;base64,${vis.imageData}`} 
                                                                                className="w-full h-full object-cover cursor-pointer"
                                                                                onClick={() => setPreviewImageUrl(vis.imageData.startsWith('/media/') || vis.imageData.startsWith('/objects/') || vis.imageData.startsWith('http') || vis.imageData.startsWith('data:') ? vis.imageData : `data:image/png;base64,${vis.imageData}`)}
                                                                             />
                                                                         ) : (
                                                                             <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                                                                                 {generatingImageId === vis.id ? (
                                                                                     <>
                                                                                        <Loader2 size={24} className="mb-2 animate-spin text-indigo-500"/>
                                                                                        <span className="text-[10px] text-indigo-600 font-medium">Creating Art...</span>
                                                                                     </>
                                                                                 ) : (
                                                                                     <>
                                                                                        <ImageIcon size={24} className="mb-1 opacity-50"/>
                                                                                        <span className="text-xs">No Image</span>
                                                                                     </>
                                                                                 )}
                                                                             </div>
                                                                         )}
                                                                         
                                                                         {/* Scene Controls Overlay */}
                                                                         <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                             <button onClick={() => generateImageForScene(activeMIdx, activeLIdx, vIdx)} className="p-1.5 bg-white/90 rounded shadow text-indigo-600 hover:bg-white" title="Generate Image"><Wand2 size={12}/></button>
                                                                             <label className="p-1.5 bg-white/90 rounded shadow text-emerald-600 hover:bg-white cursor-pointer" title="Upload Image">
                                                                                 <Upload size={12}/>
                                                                                 <input type="file" accept="image/*" className="hidden" onChange={(e) => handleVisualImageUpload(e, activeMIdx, activeLIdx, vIdx)} />
                                                                             </label>
                                                                             <button onClick={() => removeVisualScene(activeMIdx, activeLIdx, vIdx)} className="p-1.5 bg-white/90 rounded shadow text-red-500 hover:bg-white" title="Remove Scene"><Trash2 size={12}/></button>
                                                                         </div>
                                                                         <div className="absolute top-2 left-2 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                                                                             Scene {vIdx + 1}
                                                                         </div>
                                                                     </div>
                                                                     <div className="p-3 space-y-2">
                                                                         <div>
                                                                             <label className="text-[9px] text-slate-400 font-bold uppercase block mb-0.5">Visual Prompt</label>
                                                                             <input 
                                                                                className="w-full text-xs border-b border-slate-200 pb-1 focus:outline-none focus:border-indigo-500 bg-transparent"
                                                                                value={vis.prompt}
                                                                                onChange={(e) => {
                                                                                    const newMods = [...modules];
                                                                                    newMods[activeMIdx].lessons[activeLIdx].visuals![vIdx].prompt = e.target.value;
                                                                                    setModules(newMods);
                                                                                }}
                                                                             />
                                                                         </div>
                                                                         <div>
                                                                             <label className="text-[9px] text-slate-400 font-bold uppercase block mb-0.5">Caption / Overlay</label>
                                                                             <input 
                                                                                className="w-full text-xs border-b border-slate-200 pb-1 focus:outline-none focus:border-indigo-500 bg-transparent text-indigo-600 font-medium"
                                                                                value={vis.overlayText}
                                                                                onChange={(e) => {
                                                                                    const newMods = [...modules];
                                                                                    newMods[activeMIdx].lessons[activeLIdx].visuals![vIdx].overlayText = e.target.value;
                                                                                    setModules(newMods);
                                                                                }}
                                                                             />
                                                                         </div>
                                                                     </div>
                                                                 </div>
                                                             ))}
                                                         </div>
                                                     </div>

                                                     {/* Hosted Video URL Section */}
                                                     <div className="mt-6 pt-6 border-t border-slate-100">
                                                         <label className="text-xs font-bold text-slate-500 uppercase mb-2 block flex items-center gap-2">
                                                             <Video size={12}/> Hosted Video URL (Optional)
                                                         </label>
                                                         <p className="text-xs text-slate-400 mb-2">Paste a URL to a hosted video (YouTube, Vimeo, S3, etc). If set, this will play instead of rendering from images.</p>
                                                         <input 
                                                            type="url"
                                                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                                                            placeholder="https://example.com/video.mp4"
                                                            value={lesson.videoUrl || ''}
                                                            onChange={(e) => {
                                                                const newMods = [...modules];
                                                                newMods[activeMIdx].lessons[activeLIdx].videoUrl = e.target.value;
                                                                setModules(newMods);
                                                            }}
                                                         />
                                                         {lesson.videoUrl && (
                                                             <div className="mt-2 flex items-center gap-2 text-xs text-emerald-600">
                                                                 <CheckCircle2 size={12}/> Video URL set - will use hosted video for playback
                                                             </div>
                                                         )}
                                                     </div>

                                                     {/* Resources List */}
                                                     {lesson.resources && lesson.resources.length > 0 && (
                                                         <div className="mt-6 pt-6 border-t border-slate-100">
                                                             <label className="text-xs font-bold text-slate-500 uppercase mb-3 block">Attached Resources</label>
                                                             <div className="space-y-2">
                                                                 {lesson.resources.map((res, rIdx) => (
                                                                     <div key={res.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                                                                         <div className="flex items-center gap-3">
                                                                             <div className="p-2 bg-white rounded border border-slate-200 text-indigo-500">
                                                                                 {res.type === 'link' ? <LinkIcon size={14}/> : <FileIcon size={14}/>}
                                                                             </div>
                                                                             <div>
                                                                                 <div className="text-sm font-medium text-slate-800">{res.title}</div>
                                                                                 <div className="text-xs text-slate-400 truncate max-w-[200px]">{res.url.substring(0, 40)}...</div>
                                                                             </div>
                                                                         </div>
                                                                         <button onClick={() => removeResource(activeMIdx, activeLIdx, rIdx)} className="text-slate-400 hover:text-red-500"><Trash2 size={14}/></button>
                                                                     </div>
                                                                 ))}
                                                             </div>
                                                         </div>
                                                     )}
                                                 </div>
                                             </div>

                                             {/* Settings Sidebar */}
                                             <div className="hidden lg:flex w-80 border-l border-slate-200 bg-slate-50 h-full overflow-hidden flex-col">
                                                 {renderSidebarSettings()}
                                             </div>
                                         </div>
                                     );
                                 })()
                             ) : (
                                 <div className="flex h-full">
                                     <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                                         <LayoutTemplate size={48} className="mb-4 opacity-50"/>
                                         <p>Select a lesson to edit content</p>
                                     </div>
                                     {/* IMPORTANT: Render sidebar here too so themes can be edited even if selection state is weird */}
                                     <div className="hidden lg:flex w-80 border-l border-slate-200 bg-slate-50 h-full overflow-hidden flex-col">
                                         {renderSidebarSettings()}
                                     </div>
                                 </div>
                             )}
                             
                             {/* Global Progress Bar for Batch Ops */}
                             {isDraftingContent && (
                                 <div className="absolute bottom-0 left-0 lg:left-64 right-0 bg-white border-t border-slate-200 p-2 shadow-lg-up flex items-center gap-4 z-50">
                                     <Loader2 size={18} className="text-indigo-600 animate-spin ml-4"/>
                                     <div className="flex-1">
                                         <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                                             <span>Drafting Content...</span>
                                             <span>{Math.round(parsingProgress)}%</span>
                                         </div>
                                         <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                             <div className="bg-indigo-600 h-full transition-all duration-300" style={{width: `${parsingProgress}%`}}></div>
                                         </div>
                                     </div>
                                 </div>
                             )}
                         </div>
                     </div>
                 )}

                 {/* STEP 5: RENDERING */}
                 {step === 'rendering' && (
                     <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-fade-in bg-white">
                         <div className="max-w-md w-full">
                             <div className="relative w-32 h-32 mx-auto mb-8">
                                 <svg className="w-full h-full" viewBox="0 0 100 100">
                                     <circle className="text-slate-100 stroke-current" strokeWidth="8" cx="50" cy="50" r="40" fill="transparent"></circle>
                                     <circle className="text-indigo-600 progress-ring__circle stroke-current transition-all duration-500 ease-out" strokeWidth="8" strokeLinecap="round" cx="50" cy="50" r="40" fill="transparent" strokeDasharray="251.2" strokeDashoffset={251.2 - (251.2 * generationProgress) / 100} transform="rotate(-90 50 50)"></circle>
                                 </svg>
                                 <div className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-indigo-900">{Math.round(generationProgress)}%</div>
                             </div>
                             <h2 className="text-2xl font-bold text-slate-900 mb-2">Rendering Course</h2>
                             <p className="text-slate-500 mb-6 font-medium animate-pulse">{renderingStatus || "Processing..."}</p>
                             
                             <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-left space-y-2 text-sm text-slate-600">
                                 <div className="flex items-center gap-3">
                                     {generationProgress > 10 ? <CheckCircle2 size={16} className="text-emerald-500"/> : <Loader2 size={16} className="animate-spin text-indigo-500"/>}
                                     <span>Analyzing Content Structure</span>
                                 </div>
                                 <div className="flex items-center gap-3">
                                     {generationProgress > 40 ? <CheckCircle2 size={16} className="text-emerald-500"/> : <span className="w-4 h-4 rounded-full border border-slate-300"/>}
                                     <span>Generating Voiceovers (High Quality)</span>
                                 </div>
                                 <div className="flex items-center gap-3">
                                     {generationProgress > 70 ? <CheckCircle2 size={16} className="text-emerald-500"/> : <span className="w-4 h-4 rounded-full border border-slate-300"/>}
                                     <span>Designing Visual Scenes</span>
                                 </div>
                                 <div className="flex items-center gap-3">
                                     {generationProgress > 90 ? <CheckCircle2 size={16} className="text-emerald-500"/> : <span className="w-4 h-4 rounded-full border border-slate-300"/>}
                                     <span>Final Assembly & Optimization</span>
                                 </div>
                             </div>
                         </div>
                     </div>
                 )}
            </div>
        </div>

        {/* Add New Lesson Modal */}
        {showAddLessonModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <h2 className="text-xl font-bold text-slate-900">Add New Video</h2>
                        <button onClick={() => setShowAddLessonModal(false)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20}/></button>
                    </div>
                    <div className="p-6 space-y-6">
                        {/* Video Title */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Video Title *</label>
                            <Input 
                                placeholder="e.g., Introduction to the Topic"
                                value={newLessonTitle}
                                onChange={(e) => setNewLessonTitle(e.target.value)}
                            />
                        </div>

                        {/* Creation Type */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Creation Type</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button 
                                    onClick={() => setNewLessonType('blank')}
                                    className={`p-4 rounded-xl border-2 text-left transition-all ${newLessonType === 'blank' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}
                                >
                                    <FileText size={24} className={`mb-2 ${newLessonType === 'blank' ? 'text-indigo-600' : 'text-slate-400'}`}/>
                                    <div className="font-semibold text-slate-800">Blank Video</div>
                                    <div className="text-xs text-slate-500 mt-1">Add placeholder, configure later</div>
                                </button>
                                <button 
                                    onClick={() => setNewLessonType('full')}
                                    className={`p-4 rounded-xl border-2 text-left transition-all ${newLessonType === 'full' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}
                                >
                                    <Sparkles size={24} className={`mb-2 ${newLessonType === 'full' ? 'text-indigo-600' : 'text-slate-400'}`}/>
                                    <div className="font-semibold text-slate-800">Full Generation</div>
                                    <div className="text-xs text-slate-500 mt-1">Generate script & storyboard</div>
                                </button>
                            </div>
                        </div>

                        {/* Script Source */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Script Source</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button 
                                    onClick={() => setNewLessonScriptMode('own')}
                                    className={`p-3 rounded-lg border-2 text-center transition-all ${newLessonScriptMode === 'own' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}
                                >
                                    <Edit3 size={18} className={`mx-auto mb-1 ${newLessonScriptMode === 'own' ? 'text-indigo-600' : 'text-slate-400'}`}/>
                                    <div className="text-sm font-medium text-slate-700">Write My Own</div>
                                </button>
                                <button 
                                    onClick={() => setNewLessonScriptMode('ai')}
                                    className={`p-3 rounded-lg border-2 text-center transition-all ${newLessonScriptMode === 'ai' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}
                                >
                                    <Bot size={18} className={`mx-auto mb-1 ${newLessonScriptMode === 'ai' ? 'text-indigo-600' : 'text-slate-400'}`}/>
                                    <div className="text-sm font-medium text-slate-700">AI Generate</div>
                                </button>
                            </div>
                        </div>

                        {/* Script Input */}
                        {newLessonScriptMode === 'own' ? (
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Your Script</label>
                                <TextArea 
                                    placeholder="Enter your video script here..."
                                    rows={4}
                                    value={newLessonScript}
                                    onChange={(e) => setNewLessonScript(e.target.value)}
                                />
                            </div>
                        ) : (
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">AI Instructions</label>
                                <TextArea 
                                    placeholder="Describe what the video should cover. e.g., 'Explain the benefits of morning routines with 3 practical tips'"
                                    rows={4}
                                    value={newLessonAiPrompt}
                                    onChange={(e) => setNewLessonAiPrompt(e.target.value)}
                                />
                            </div>
                        )}

                        {/* Target Module */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Add to Module</label>
                            <select 
                                className="w-full p-3 rounded-lg border border-slate-200 text-slate-700 focus:ring-2 focus:ring-indigo-100 outline-none"
                                value={newLessonTargetModule}
                                onChange={(e) => {
                                    setNewLessonTargetModule(e.target.value);
                                    setNewLessonPosition(0);
                                }}
                            >
                                {modules.map(m => (
                                    <option key={m.id} value={m.id}>{m.title}</option>
                                ))}
                            </select>
                        </div>

                        {/* Position */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Position in Module</label>
                            <select 
                                className="w-full p-3 rounded-lg border border-slate-200 text-slate-700 focus:ring-2 focus:ring-indigo-100 outline-none"
                                value={newLessonPosition}
                                onChange={(e) => setNewLessonPosition(parseInt(e.target.value))}
                            >
                                {(() => {
                                    const targetMod = modules.find(m => m.id === newLessonTargetModule);
                                    if (!targetMod) return <option value={0}>First position</option>;
                                    const options = [];
                                    for (let i = 0; i <= targetMod.lessons.length; i++) {
                                        if (i === 0) options.push(<option key={i} value={i}>First position</option>);
                                        else if (i === targetMod.lessons.length) options.push(<option key={i} value={i}>Last position (after "{targetMod.lessons[i-1]?.title}")</option>);
                                        else options.push(<option key={i} value={i}>After "{targetMod.lessons[i-1]?.title}"</option>);
                                    }
                                    return options;
                                })()}
                            </select>
                        </div>
                    </div>
                    <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
                        <Button variant="outline" onClick={() => setShowAddLessonModal(false)}>Cancel</Button>
                        <Button 
                            onClick={handleAddNewLesson} 
                            isLoading={isGeneratingNewLesson}
                            icon={<Plus size={16}/>}
                        >
                            {isGeneratingNewLesson ? 'Creating...' : 'Add Video'}
                        </Button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
