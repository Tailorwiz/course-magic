
import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, CheckCircle2, Video, Sparkles, Image as ImageIcon, Loader2, Wand2, RefreshCw, Save, Download, Video as FileVideo, ZoomIn, X, FileArchive, FileJson, Bot, Music, Upload, Scissors, Plus, Trash2, Layout, Layers, Image, Edit3, MessageSquarePlus, KeyRound, Volume2, Palette, Subtitles, AlignCenter, Type as TypeIcon, FileText, Globe, MousePointer2, Play, Pause, ChevronDown, Images, Link as LinkIcon, File as FileIcon, AlertCircle, Award } from 'lucide-react';
import { Button } from '../components/Button';
import { Input, TextArea } from '../components/Input';
import { Course, CourseStatus, LessonStatus, VisualAsset, VoiceOption, CaptionStyle, VisualMode, MusicMode, GenerationMode, CaptionPosition, CaptionSize, CaptionMode, CourseTheme, Resource } from '../types';
import { GoogleGenAI, Modality, GenerateContentResponse, Type } from "@google/genai";
import { pcmToWav, createSolidColorImage, exportVideoAssetsZip, safeExportCourse, getAudioDurationFromBlob, renderVideoFromLesson, downloadBlob, convertPdfToImages, compressBase64Image } from '../utils';
import { DEFAULT_ELEVEN_LABS_KEY } from '../constants';
import { api } from '../api';

interface VideoWizardProps {
  onCancel: () => void;
  onComplete: (course: Course) => void | Promise<void>;
  onSave?: (course: Course) => void | Promise<void>;
  initialType?: string; 
  initialCourse?: Course; 
}

type WizardStep = 'details' | 'strategy' | 'editor' | 'rendering' | 'complete';

interface VideoPart {
    id: string;
    title: string;
    script: string;
    visuals: VisualAsset[];
    // Settings Overrides
    voice?: VoiceOption;
    visualStyle?: string;
    captionStyle?: CaptionStyle;
    visualPacing?: 'Normal' | 'Fast' | 'Turbo';
    // Content Assets (Preserved for saving)
    audioData?: string;
    audioMimeType?: 'audio/pcm' | 'audio/mpeg';
    durationSeconds?: number;
    duration?: string;
    resources?: Resource[];
    // Hosted video URL (for pre-rendered videos)
    videoUrl?: string;
    // Server-saved rendered video URL (for streaming playback)
    renderedVideoUrl?: string;
    // Track which voice was used to generate existing audio (for regeneration detection)
    audioGeneratedWithVoice?: VoiceOption;
    // Word-level timestamps for caption sync (from AssemblyAI)
    wordTimestamps?: { word: string; start: number; end: number }[];
    // Certificate eligibility
    awardsCertificate?: boolean;
}

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
];

const VISUAL_STYLES = [
    "Minimalist Flat Vector", "Photorealistic 4K", "Cinematic Lighting", "Hand-drawn Sketch", 
    "3D Isometric Render", "Cyberpunk Neon", "Watercolor Illustration", "Pixar Animation Style", 
    "Abstract Geometric", "Vintage Blueprint"
];

const VISUAL_STYLE_PREVIEWS: Record<string, string> = {
    "Minimalist Flat Vector": "/style-previews/flat-vector.jpg",
    "Photorealistic 4K": "/style-previews/photorealistic.jpg",
    "Cinematic Lighting": "/style-previews/cinematic.jpg",
    "Hand-drawn Sketch": "/style-previews/sketch.jpg",
    "3D Isometric Render": "/style-previews/isometric.jpg",
    "Cyberpunk Neon": "/style-previews/cyberpunk.jpg",
    "Watercolor Illustration": "/style-previews/watercolor.jpg",
    "Pixar Animation Style": "/style-previews/pixar.jpg",
    "Abstract Geometric": "/style-previews/geometric.jpg",
    "Vintage Blueprint": "/style-previews/blueprint.jpg"
};

const VIDEO_DURATIONS = [
    { label: "30-60 Seconds (Social Short)", value: "short", words: 130 },
    { label: "1-2 Minutes (Overview)", value: "medium", words: 250 },
    { label: "3-5 Minutes (Deep Dive)", value: "long", words: 600 },
    { label: "5-10 Minutes (Tutorial)", value: "xl", words: 1200 },
    { label: "10-20 Minutes (Keynote)", value: "xxl", words: 2500 },
];

const GEMINI_VOICES = [
    'Fenrir (Deep Male)', 
    'Puck (Tenor Male)', 
    'Charon (Deep Male)', 
    'Kore (Balanced Female)', 
    'Zephyr (Bright Female)'
];

const CAPTION_STYLES: CaptionStyle[] = [
    'Viral (Strike)', 'Viral (Clean)', 'Viral (Box)', 'Viral (Pop)', 
    'Modern', 'Cinematic', 'Outline', 'Minimalist', 'Neon Glow', 'Typewriter', 'None'
];

const AI_MODELS = [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: 'Fastest, good quality' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', desc: 'Higher quality, slower' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', desc: 'Ultra-fast, high volume' },
];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to get the API key - checks localStorage first, then falls back to environment variable
const getGeminiApiKey = (): string => {
    const savedKey = localStorage.getItem('geminiApiKey');
    if (savedKey && savedKey.trim()) {
        return savedKey.trim();
    }
    return import.meta.env.VITE_GEMINI_API_KEY || process.env.API_KEY || '';
};

// Helper to get the default AI model from localStorage
const getDefaultAIModel = (): string => {
    return localStorage.getItem('defaultAIModel') || 'gemini-2.5-flash';
};

// Helper function to fix concatenated words in AI-generated text
const fixConcatenatedText = (text: string): string => {
    if (!text) return text;
    
    const commonWords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'way', 'who', 'did', 'get', 'let', 'put', 'say', 'she', 'too', 'use', 'your', 'each', 'from', 'have', 'been', 'call', 'come', 'made', 'find', 'long', 'make', 'many', 'more', 'some', 'than', 'them', 'then', 'what', 'when', 'will', 'with', 'word', 'about', 'after', 'being', 'could', 'every', 'first', 'found', 'great', 'just', 'know', 'like', 'look', 'only', 'over', 'such', 'take', 'that', 'this', 'time', 'very', 'want', 'well', 'were', 'would', 'write', 'simple', 'science', 'video', 'learn', 'today', 'start', 'step', 'guide', 'quick', 'easy', 'best', 'most', 'here', 'there', 'these', 'those', 'which', 'where', 'while', 'their', 'other', 'right', 'thing', 'think', 'should', 'before', 'during', 'between', 'through', 'inside', 'outside', 'without', 'within', 'around', 'behind', 'under', 'above', 'below', 'since', 'until', 'still', 'also', 'even', 'much', 'both', 'same', 'into', 'upon', 'already', 'always', 'another', 'because', 'become', 'business', 'company', 'different', 'either', 'enough', 'example', 'family', 'following', 'general', 'important', 'information', 'interest', 'large', 'later', 'little', 'local', 'market', 'member', 'million', 'moment', 'money', 'national', 'never', 'number', 'often', 'order', 'others', 'part', 'people', 'percent', 'place', 'point', 'possible', 'power', 'present', 'problem', 'program', 'public', 'question', 'really', 'reason', 'report', 'result', 'school', 'second', 'service', 'several', 'small', 'social', 'something', 'special', 'state', 'story', 'study', 'system', 'together', 'trying', 'understand', 'week', 'woman', 'world', 'year', 'young'];
    
    // First apply standard cleanups
    let result = text
        .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
        .replace(/[\u200C\u200D\uFEFF]/g, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([a-zA-Z])(\d)/g, '$1 $2')
        .replace(/(\d)([a-zA-Z])/g, '$1 $2');
    
    // Split into words and fix any concatenated ones
    const words = result.split(' ');
    const fixedWords = words.map(word => {
        // If word is long and all lowercase, try to split it
        if (word.length > 10 && word === word.toLowerCase()) {
            let fixed = word;
            // Sort by length descending to match longer words first
            const sorted = [...commonWords].sort((a, b) => b.length - a.length);
            for (const common of sorted) {
                if (fixed.includes(common)) {
                    fixed = fixed.replace(new RegExp(common, 'g'), ` ${common} `);
                }
            }
            return fixed.replace(/\s+/g, ' ').trim();
        }
        return word;
    });
    
    return fixedWords.join(' ').replace(/\s+/g, ' ').trim();
};

// Longer delays and more retries for handling Gemini per-minute rate limits
async function withRetry<T>(fn: () => Promise<T>, retries = 4, initialDelay = 3000): Promise<T> {
    try {
        return await fn();
    } catch (error: any) {
        const isRateLimit = error?.status === 429 || 
                            error?.code === 429 || 
                            error?.message?.includes('429') || 
                            error?.message?.includes('quota') || 
                            error?.message?.includes('RESOURCE_EXHAUSTED');
        
        const isServerError = error?.status >= 500 || error?.code >= 500 || error?.message?.includes('500');

        if (retries > 0 && (isRateLimit || isServerError)) {
            // For rate limits, wait longer (15-90 seconds) to let per-minute quota reset
            const delayTime = isRateLimit ? Math.max(initialDelay, 15000) : initialDelay;
            console.warn(`API Error (${error.message}). Retrying in ${delayTime/1000}s... (${retries} attempts left)`);
            await delay(delayTime);
            // Increase delay significantly for subsequent retries (1.5x multiplier)
            return withRetry(fn, retries - 1, Math.min(delayTime * 1.5, 90000));
        }
        throw error;
    }
}

// Throttle helper to space out API calls and avoid rate limits
let lastApiCall = 0;
const throttleApiCall = async (minGapMs: number = 1500): Promise<void> => {
    const now = Date.now();
    const timeSinceLastCall = now - lastApiCall;
    if (timeSinceLastCall < minGapMs) {
        await delay(minGapMs - timeSinceLastCall);
    }
    lastApiCall = Date.now();
};

// Word timestamp interface for caption sync
interface WordTimestamp {
    word: string;
    start: number; // milliseconds
    end: number;   // milliseconds
}

const getVoiceModel = (name: VoiceOption) => {
    if (name.includes('Fenrir')) return 'Fenrir';
    if (name.includes('Puck')) return 'Puck';
    if (name.includes('Charon')) return 'Charon';
    if (name.includes('Kore')) return 'Kore';
    if (name.includes('Zephyr')) return 'Zephyr';
    return 'Fenrir'; 
}

// Helper to determine settings based on video type
const getVideoTypeConfig = (type: string | undefined) => {
    switch (type) {
        case 'Slide Deck':
            return { scriptStyle: 'narrator', visualPacing: 'Normal', aspectRatio: '16:9', captionStyle: 'None', visualMode: 'AI_Scene' };
        case 'Training':
            return { scriptStyle: 'educational', visualPacing: 'Normal', aspectRatio: '16:9', captionStyle: 'Modern', visualMode: 'AI_Scene' };
        case 'Sales':
            return { scriptStyle: 'persuasive', visualPacing: 'Fast', aspectRatio: '16:9', captionStyle: 'Viral (Strike)', visualMode: 'AI_Scene' };
        case 'Explainer':
            return { scriptStyle: 'simple', visualPacing: 'Normal', aspectRatio: '16:9', captionStyle: 'Modern', visualMode: 'Abstract' };
        case 'Social Short':
            return { scriptStyle: 'viral', visualPacing: 'Turbo', aspectRatio: '9:16', captionStyle: 'Viral (Pop)', visualMode: 'AI_Scene' };
        case 'Corporate':
            return { scriptStyle: 'formal', visualPacing: 'Normal', aspectRatio: '16:9', captionStyle: 'Minimalist', visualMode: 'AI_Scene' };
        default:
            return { scriptStyle: 'general', visualPacing: 'Normal', aspectRatio: '16:9', captionStyle: 'Modern', visualMode: 'AI_Scene' };
    }
};

export const VideoWizard: React.FC<VideoWizardProps> = ({ onCancel, onComplete, onSave, initialType, initialCourse }) => {
  const [step, setStep] = useState<WizardStep>(initialCourse ? 'editor' : 'details');
  const [courseId, setCourseId] = useState<string>(initialCourse?.id || `v-${Date.now()}`);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const [details, setDetails] = useState({ title: initialType ? `${initialType} Video` : '', headline: '', description: '' });
  const [file, setFile] = useState<File | null>(null);
  const [isGeneratingMeta, setIsGeneratingMeta] = useState<'all' | 'title' | 'headline' | 'description' | null>(null);
  
  // Initialize defaults based on Type
  const typeConfig = getVideoTypeConfig(initialType);

  // Theme State
  const [theme, setTheme] = useState<CourseTheme>({
      primaryColor: '#1e1b4b',
      accentColor: '#4f46e5',
      backgroundColor: '#f1f5f9',
      borderColor: '#cbd5e1',
      textColor: '#1e293b',
      isBoldText: false,
      fontFamily: 'Inter, sans-serif'
  });

  // Slide Deck State
  const [slideDeckImages, setSlideDeckImages] = useState<string[]>([]);
  const [isAnalyzingSlides, setIsAnalyzingSlides] = useState(false);

  const [ecoverFile, setEcoverFile] = useState<File | null>(null);
  const [ecoverPreview, setEcoverPreview] = useState<string>('');
  const [ecoverMode, setEcoverMode] = useState<'upload' | 'generate'>('upload');
  const [isGeneratingEcover, setIsGeneratingEcover] = useState(false);
  const [ecoverInstructions, setEcoverInstructions] = useState('');
  
  const [useCoverAsThumbnail, setUseCoverAsThumbnail] = useState(false);

  const [strategy, setStrategy] = useState<GenerationMode>('hybrid');
  const [durationMode, setDurationMode] = useState<string>(initialType === 'Social Short' ? 'short' : 'medium');
  const [strategyInstructions, setStrategyInstructions] = useState('');
  const [selectedAIModel, setSelectedAIModel] = useState<string>(getDefaultAIModel());
  const [isFaithBased, setIsFaithBased] = useState(false);
  
  // Video Source Mode: 'ai_generated' (create with slides) or 'hosted' (use external video URL)
  const [videoSourceMode, setVideoSourceMode] = useState<'ai_generated' | 'own_script' | 'hosted'>('ai_generated');
  const [ownScriptText, setOwnScriptText] = useState('');
  const [hostedVideoUrl, setHostedVideoUrl] = useState<string>('');

  // Global Settings State
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>('Fenrir (Deep Male)');
  const [selectedVisualStyle, setSelectedVisualStyle] = useState(VISUAL_STYLES[0]);
  const [selectedCaptionStyle, setSelectedCaptionStyle] = useState<CaptionStyle>(typeConfig.captionStyle as CaptionStyle);
  const [visualPacing, setVisualPacing] = useState<'Normal' | 'Fast' | 'Turbo'>(typeConfig.visualPacing as any);
  
  // Image Provider Selection (uses user's own API keys only)
  const [selectedImageProvider, setSelectedImageProvider] = useState<'gemini' | 'openai' | 'flux' | 'flux-schnell' | 'nano-banana'>('gemini');
  
  // Voice Control Settings
  const [voiceSpeed, setVoiceSpeed] = useState<number>(1.0); // 0.5 to 2.0
  const [voiceStability, setVoiceStability] = useState<number>(0.5); // 0 to 1 (ElevenLabs: lower = more expressive)
  const [voiceSimilarityBoost, setVoiceSimilarityBoost] = useState<number>(0.75); // 0 to 1 (ElevenLabs)
  const [isSamplingVoice, setIsSamplingVoice] = useState(false);
  
  const [captionPosition, setCaptionPosition] = useState<CaptionPosition>('Bottom');
  const [captionSize, setCaptionSize] = useState<CaptionSize>('Medium');
  const [captionMode, setCaptionMode] = useState<CaptionMode>('Overlay');
  const [captionColor, setCaptionColor] = useState<string>('#ffffff');
  const [captionBgColor, setCaptionBgColor] = useState<string>('');
  const [captionOutlineColor, setCaptionOutlineColor] = useState<string>('');
  
  const [includeMusic, setIncludeMusic] = useState(true);
  const [selectedMusicTrack, setSelectedMusicTrack] = useState(MUSIC_TRACKS[0].url);
  const [musicMode, setMusicMode] = useState<MusicMode>('Continuous');

  const [visualMode, setVisualMode] = useState<VisualMode>(typeConfig.visualMode as VisualMode);
  const [solidColor, setSolidColor] = useState<string>('#4f46e5');
  const [showSubtitles, setShowSubtitles] = useState(initialType === 'Social Short');

  // Aspect Ratio for current project
  const targetAspectRatio = typeConfig.aspectRatio;

  // Settings Scope Logic
  const [applyScope, setApplyScope] = useState<'global' | 'current'>('global');

  // ElevenLabs State
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState(DEFAULT_ELEVEN_LABS_KEY);
  const [elevenLabsVoices, setElevenLabsVoices] = useState<ElevenLabsVoice[]>([]);
  const [isFetchingVoices, setIsFetchingVoices] = useState(false);
  
  // Voice Preview State
  const [showVoiceSelector, setShowVoiceSelector] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  const [videoParts, setVideoParts] = useState<VideoPart[]>([{ id: 'p1', title: 'Part 1', script: '', visuals: [] }]);
  const [activePartIndex, setActivePartIndex] = useState(0);
  
  const activePart = videoParts[activePartIndex] || videoParts[0];

  const updateActivePart = (changes: Partial<VideoPart>) => {
      setVideoParts(prev => {
          const newParts = [...prev];
          newParts[activePartIndex] = { ...newParts[activePartIndex], ...changes };
          return newParts;
      });
  };

  const partsRef = useRef<VideoPart[]>([]);
  useEffect(() => { partsRef.current = videoParts; }, [videoParts]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [generatingImageIds, setGeneratingImageIds] = useState<Set<string>>(new Set());

  // Timing State
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [scriptGenTime, setScriptGenTime] = useState<number | null>(null);
  const [storyboardGenTime, setStoryboardGenTime] = useState<number | null>(null);
  const [imageGenTime, setImageGenTime] = useState<number | null>(null);
  const [storyboardProgress, setStoryboardProgress] = useState<string>('');
  const [imagesGenerated, setImagesGenerated] = useState(0);
  const [totalImagesToGenerate, setTotalImagesToGenerate] = useState(0);

  // Elapsed time timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (generationStartTime) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - generationStartTime) / 1000));
      }, 1000);
    } else {
      setElapsedTime(0);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [generationStartTime]);

  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [showRegenModal, setShowRegenModal] = useState(false);
  const [regenInstructions, setRegenInstructions] = useState('');
  
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitInstructions, setSplitInstructions] = useState('');
  const [showScriptRewriteModal, setShowScriptRewriteModal] = useState(false);
  const [isRewritingScript, setIsRewritingScript] = useState(false);
  const [rewriteStatusMessage, setRewriteStatusMessage] = useState('');
  const [rewriteInstructions, setRewriteInstructions] = useState('');
  
  const [showDownloadsMenu, setShowDownloadsMenu] = useState(false);

  const [finalCourse, setFinalCourse] = useState<Course | null>(null);
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Resource State
  const [isAddingResource, setIsAddingResource] = useState(false);
  const [newResource, setNewResource] = useState<Partial<Resource>>({ type: 'link', title: '' });

  // Add New Video Modal State
  const [showAddVideoModal, setShowAddVideoModal] = useState(false);
  const [newVideoTitle, setNewVideoTitle] = useState('');
  const [newVideoType, setNewVideoType] = useState<'blank' | 'full'>('blank');
  const [newVideoScriptMode, setNewVideoScriptMode] = useState<'own' | 'ai'>('ai');
  const [newVideoScript, setNewVideoScript] = useState('');
  const [newVideoAiPrompt, setNewVideoAiPrompt] = useState('');
  const [isCreatingNewVideo, setIsCreatingNewVideo] = useState(false);

  // --- Resource Helpers ---
  const handleResourceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onloadend = () => {
              setNewResource(prev => ({ 
                  ...prev, 
                  url: reader.result as string, 
                  fileName: file.name,
                  title: prev.title || file.name 
              }));
          };
          reader.readAsDataURL(file);
      }
  };

  // Handle uploading custom image to replace a visual
  const handleVisualImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, partId: string, visualId: string) => {
      if (!e.target.files || !e.target.files[0]) return;
      const file = e.target.files[0];
      
      // Validate it's an image
      if (!file.type.startsWith('image/')) {
          alert('Please select an image file');
          return;
      }
      
      const reader = new FileReader();
      reader.onloadend = async () => {
          const dataUrl = reader.result as string;
          // Keep full resolution - no compression for user uploads
          setVideoParts(prev => prev.map(p => {
              if (p.id !== partId) return p;
              return {
                  ...p,
                  visuals: p.visuals.map(v => {
                      if (v.id !== visualId) return v;
                      return { ...v, imageData: dataUrl };
                  })
              };
          }));
      };
      reader.readAsDataURL(file);
      
      // Reset the input so the same file can be re-uploaded
      e.target.value = '';
  };

  const addResourceToActivePart = () => {
      if (!newResource.title || !newResource.url || !newResource.type) return;
      
      // Normalize URL for links - ensure it has a protocol
      let normalizedUrl = newResource.url;
      if (newResource.type === 'link' && normalizedUrl) {
          // Check if URL already has any protocol (http, https, mailto, ftp, tel, etc.)
          const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(normalizedUrl);
          if (!hasProtocol) {
              normalizedUrl = 'https://' + normalizedUrl;
          }
      }
      
      const res: Resource = {
          id: `res-${Date.now()}`,
          title: newResource.title,
          type: newResource.type,
          url: normalizedUrl,
          fileName: newResource.fileName
      };

      const currentResources = activePart.resources || [];
      updateActivePart({ resources: [...currentResources, res] });
      setIsAddingResource(false);
      setNewResource({ type: 'link', title: '', url: '' });
  };

  const removeResourceFromActivePart = (resIdx: number) => {
      if (!activePart.resources) return;
      const newResources = [...activePart.resources];
      newResources.splice(resIdx, 1);
      updateActivePart({ resources: newResources });
  };

  const fetchElevenLabsVoices = async (apiKey: string) => {
      setIsFetchingVoices(true);
      try {
          const response = await fetch('https://api.elevenlabs.io/v1/voices', {
              headers: { 'xi-api-key': apiKey }
          });
          if (!response.ok) throw new Error('Invalid API Key');
          const data = await response.json();
          setElevenLabsVoices(data.voices.map((v: any) => ({ voice_id: v.voice_id, name: v.name, preview_url: v.preview_url })));
          localStorage.setItem('elevenLabsKey', apiKey);
      } catch (error) {
          console.error(error);
      } finally {
          setIsFetchingVoices(false);
      }
  };

  const handleElevenLabsKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const key = e.target.value;
      setElevenLabsApiKey(key);
      if (key.length > 10) { 
           fetchElevenLabsVoices(key); 
      }
  };

  useEffect(() => {
      const key = localStorage.getItem('elevenLabsKey') || DEFAULT_ELEVEN_LABS_KEY;
      setElevenLabsApiKey(key);
      if(key) {
          fetchElevenLabsVoices(key);
      }
  }, []);

  useEffect(() => {
    if (initialCourse) {
        setCourseId(initialCourse.id);
        setDetails({
            title: initialCourse.title,
            headline: initialCourse.headline,
            description: initialCourse.description
        });
        setEcoverPreview(initialCourse.ecoverUrl);
        
        const defaultTheme = {
            primaryColor: '#1e1b4b',
            accentColor: '#4f46e5',
            backgroundColor: '#f1f5f9',
            borderColor: '#cbd5e1',
            textColor: '#1e293b',
            isBoldText: false,
            fontFamily: 'Inter, sans-serif'
        };
        
        const mergedTheme = initialCourse.theme ? { ...defaultTheme, ...initialCourse.theme } : defaultTheme;
        setTheme(mergedTheme);
        
        const allLessons = initialCourse.modules.flatMap(m => m.lessons);
        let loadedParts: VideoPart[] = [];
        
        if (allLessons.length > 0) {
             loadedParts = allLessons.map((l, idx) => ({
                id: l.id,
                title: l.title || `Part ${idx + 1}`,
                script: l.sourceText,
                visuals: l.visuals || [],
                voice: l.voice,
                visualStyle: l.visualStyle,
                captionStyle: l.captionStyle,
                visualPacing: l.visualPacing,
                // IMPORTANT: Load existing audio/duration/resources so they are not lost on re-save
                audioData: l.audioData,
                audioMimeType: l.audioMimeType,
                durationSeconds: l.durationSeconds,
                duration: l.duration,
                resources: l.resources || [],
                // Hosted video URL
                videoUrl: l.videoUrl,
                // IMPORTANT: Preserve rendered video URL for minor edits
                renderedVideoUrl: l.renderedVideoUrl,
                // Track which voice was used to generate existing audio
                audioGeneratedWithVoice: l.audioData ? l.voice : undefined,
                // Certificate eligibility
                awardsCertificate: l.awardsCertificate
             }));
        } else {
             loadedParts = [{ id: 'p1', title: 'Part 1', script: '', visuals: [] }];
        }
        
        // Log loaded parts for debugging
        console.log('VideoWizard init: loadedParts with renderedVideoUrl:', loadedParts.map(p => ({
          id: p.id,
          title: p.title,
          hasRenderedVideoUrl: !!p.renderedVideoUrl,
          renderedVideoUrlLength: p.renderedVideoUrl?.length || 0
        })));
        
        setVideoParts(loadedParts);
        
        // HYDRATE IMAGES: Always try to fetch images from database for all lessons
        const hydrateImages = async () => {
          console.log(`[Hydrate] Starting image hydration for ${allLessons.length} lessons`);
          
          for (const lesson of allLessons) {
            try {
              console.log(`[Hydrate] Fetching images for lesson ${lesson.id}...`);
              const images = await api.lessonImages.get(initialCourse.id, lesson.id);
              
              if (!images || images.length === 0) {
                console.log(`[Hydrate] No images found in database for lesson ${lesson.id}`);
                continue;
              }
              
              console.log(`[Hydrate] Loaded ${images.length} images for lesson ${lesson.id}`);
              console.log(`[Hydrate] Image indices:`, images.map((img: any) => img.visualIndex));
              
              setVideoParts(prev => prev.map(p => {
                if (p.id !== lesson.id) return p;
                
                // Sort DB images by visualIndex first
                const sortedImages = [...images].sort((a: any, b: any) => {
                  const aIdx = typeof a.visualIndex === 'string' ? parseInt(a.visualIndex) : a.visualIndex;
                  const bIdx = typeof b.visualIndex === 'string' ? parseInt(b.visualIndex) : b.visualIndex;
                  return aIdx - bIdx;
                });
                console.log(`[Hydrate] Sorted ${sortedImages.length} DB images, indices: ${sortedImages.map((img: any) => img.visualIndex).join(',')}`);
                
                // If we have existing visuals, merge imageData into them
                if (p.visuals && p.visuals.length > 0) {
                  console.log(`[Hydrate] Merging ${sortedImages.length} DB images into ${p.visuals.length} existing visuals`);
                  const hydratedVisuals = p.visuals.map((v, idx) => {
                    // Use sorted position - DB images may not start at 0, so use their sorted position
                    const dbImage = sortedImages[idx];
                    if (dbImage && dbImage.imageData) {
                      console.log(`[Hydrate] Visual ${idx} gets image from DB (originalIndex: ${dbImage.visualIndex})`);
                      return { ...v, imageData: dbImage.imageData };
                    }
                    return v;
                  });
                  const filledCount = hydratedVisuals.filter(v => v.imageData && v.imageData.length > 100).length;
                  console.log(`[Hydrate] Filled ${filledCount}/${hydratedVisuals.length} visuals with images`);
                  return { ...p, visuals: hydratedVisuals };
                } else {
                  // No existing visuals - create from database images with even timing
                  const duration = p.durationSeconds || images.length * 10;
                  const timePerVisual = duration / images.length;
                  const newVisuals = images
                    .sort((a: any, b: any) => {
                      const aIdx = typeof a.visualIndex === 'string' ? parseInt(a.visualIndex) : a.visualIndex;
                      const bIdx = typeof b.visualIndex === 'string' ? parseInt(b.visualIndex) : b.visualIndex;
                      return aIdx - bIdx;
                    })
                    .map((img: any, idx: number) => ({
                      id: `vis-${idx}`,
                      prompt: img.prompt || '',
                      imageData: img.imageData,
                      startTime: idx * timePerVisual,
                      endTime: (idx + 1) * timePerVisual,
                      zoomDirection: idx % 2 === 0 ? 'in' : 'out'
                    }));
                  console.log(`[Hydrate] Created ${newVisuals.length} NEW visuals from DB (${timePerVisual.toFixed(2)}s each)`);
                  return { ...p, visuals: newVisuals };
                }
              }));
            } catch (err) {
              console.error(`[Hydrate] Failed to fetch images for lesson ${lesson.id}:`, err);
            }
          }
          console.log(`[Hydrate] Image hydration complete`);
        };
        hydrateImages();
        
        // HYDRATE AUDIO: Fetch audio from database if not in course data
        const hydrateAudio = async () => {
          console.log(`[Hydrate Audio] Starting audio hydration for ${allLessons.length} lessons`);
          
          for (const lesson of allLessons) {
            try {
              // Skip if audio already exists in lesson data
              if (lesson.audioData && lesson.audioData.length > 100) {
                console.log(`[Hydrate Audio] Lesson ${lesson.id} already has audio in data`);
                continue;
              }
              
              console.log(`[Hydrate Audio] Checking database for lesson ${lesson.id}...`);
              const audioResult = await api.lessonAudio.get(initialCourse.id, lesson.id);
              
              if (!audioResult || !audioResult.audioData) {
                console.log(`[Hydrate Audio] No audio found in database for lesson ${lesson.id}`);
                continue;
              }
              
              console.log(`[Hydrate Audio] Loaded audio for lesson ${lesson.id}, size: ${(audioResult.audioData.length / 1024).toFixed(1)}KB`);
              
              setVideoParts(prev => prev.map(p => {
                if (p.id !== lesson.id) return p;
                return {
                  ...p,
                  audioData: audioResult.audioData,
                  audioMimeType: audioResult.mimeType || 'audio/mpeg',
                  wordTimestamps: audioResult.wordTimestamps || []
                };
              }));
              
            } catch (err) {
              console.error(`[Hydrate Audio] Failed to fetch audio for lesson ${lesson.id}:`, err);
            }
          }
          console.log(`[Hydrate Audio] Audio hydration complete`);
        };
        hydrateAudio();
        
        // Detect if this is a hosted video (has videoUrl but no audio/visuals)
        const lesson = allLessons[0];
        if (lesson?.videoUrl && (!lesson.audioData && (!lesson.visuals || lesson.visuals.length === 0))) {
            setVideoSourceMode('hosted');
            setHostedVideoUrl(lesson.videoUrl);
        }
        
        if (lesson) {
            if (lesson.voice) setSelectedVoice(lesson.voice);
            if (lesson.visualStyle) setSelectedVisualStyle(lesson.visualStyle);
            if (lesson.captionStyle) setSelectedCaptionStyle(lesson.captionStyle);
            if (lesson.captionPosition) setCaptionPosition(lesson.captionPosition);
            if (lesson.captionSize) setCaptionSize(lesson.captionSize);
            if (lesson.captionMode) setCaptionMode(lesson.captionMode);
            if (lesson.captionColor) setCaptionColor(lesson.captionColor);
            if (lesson.captionBgColor) setCaptionBgColor(lesson.captionBgColor);
            if (lesson.captionOutlineColor) setCaptionOutlineColor(lesson.captionOutlineColor);
            if (lesson.visualPacing) setVisualPacing(lesson.visualPacing);
            
            if (lesson.backgroundMusicUrl) {
                setIncludeMusic(true);
                setSelectedMusicTrack(lesson.backgroundMusicUrl);
            } else {
                setIncludeMusic(false);
            }
            if (lesson.musicMode) setMusicMode(lesson.musicMode);
            if (lesson.visualMode) setVisualMode(lesson.visualMode);
            if (lesson.solidColor) setSolidColor(lesson.solidColor);
            setShowSubtitles(lesson.captionTextSource === 'script');
            if (lesson.thumbnailData && initialCourse.ecoverUrl && initialCourse.ecoverUrl.includes(lesson.thumbnailData)) {
                setUseCoverAsThumbnail(true);
            }
        }
    }
  }, [initialCourse]);

  // --- Setting Helpers ---
  const getEffectiveSetting = <T,>(globalValue: T, partKey: keyof VideoPart): T => {
      if (applyScope === 'global') return globalValue;
      return (activePart[partKey] as T) || globalValue;
  };

  const handleSettingChange = (key: keyof VideoPart, value: any, setGlobal: (v: any) => void) => {
      if (applyScope === 'global') {
          setGlobal(value);
          setVideoParts(prev => prev.map(p => {
              const copy = { ...p };
              delete copy[key];
              return copy;
          }));
      } else {
          updateActivePart({ [key]: value });
      }
  };

  const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const base64Data = base64String.split(',')[1];
        resolve({ inlineData: { data: base64Data, mimeType: file.type } });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleEcoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const imgFile = e.target.files[0];
      setEcoverFile(imgFile);
      const reader = new FileReader();
      reader.onloadend = () => {
          setEcoverPreview(reader.result as string);
      };
      reader.readAsDataURL(imgFile);
    }
  };
  
  const handleDownloadCover = () => {
      if (!ecoverPreview) {
          alert("No cover image to download.");
          return;
      }
      const link = document.createElement('a');
      link.href = ecoverPreview;
      link.download = `${(details.title || 'video').replace(/[^a-z0-9]/gi, '_')}_cover.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setShowDownloadsMenu(false);
  };
  
  const handleDownloadScript = () => {
      if (!activePart.script) {
          alert("Script is empty.");
          return;
      }
      const element = document.createElement("a");
      const file = new Blob([activePart.script], {type: 'text/plain'});
      element.href = URL.createObjectURL(file);
      element.download = `${details.title.replace(/[^a-z0-9]/gi, '_')}_script.txt`;
      document.body.appendChild(element);
      element.click();
      setShowDownloadsMenu(false);
  };
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setDetails(prev => ({...prev, title: selectedFile.name.replace(/\.[^/.]+$/, "")}));
      await generateMetadata('all', selectedFile);
    }
  };

  const handleSlideUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        setIsAnalyzingSlides(true);
        const files = Array.from(e.target.files) as File[];
        const newImages: string[] = [];

        try {
            for (const file of files) {
                if (file.type === 'application/pdf') {
                    const pdfImages = await convertPdfToImages(file);
                    newImages.push(...pdfImages);
                } else {
                    const imgData = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(file);
                    });
                    newImages.push(imgData);
                }
            }
            setSlideDeckImages(prev => [...prev, ...newImages]);
        } catch (err) {
            console.error("Slide upload failed", err);
            alert("Failed to process slide files. If using PDF, ensure it is not password protected.");
        } finally {
            setIsAnalyzingSlides(false);
        }
    }
  };

  const analyzeSlidesAndGenerate = async () => {
    if(slideDeckImages.length === 0) return;
    setIsAnalyzingSlides(true);
    try {
        const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
        const parts: any[] = [];
        
        const imagesToProcess = slideDeckImages.slice(0, 30);
        for(const imgBase64 of imagesToProcess) {
             const data = imgBase64.split(',')[1];
             const mimeType = imgBase64.split(';')[0].split(':')[1];
             parts.push({ inlineData: { data, mimeType } });
        }
        
        const prompt = `I have uploaded ${imagesToProcess.length} slides from a presentation. 
        Task: Write a professional, engaging video narration script for this presentation.
        Output Format: A JSON array of objects. Each object must represent one slide in order.
        Structure: [ { "slideIndex": 0, "narration": "..." }, { "slideIndex": 1, "narration": "..." }, ... ]
        The narration should match the content of the slide. Keep it concise but informative.`;
        
        parts.push({ text: prompt });
        
        const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: selectedAIModel,
            contents: { parts },
            config: { responseMimeType: "application/json" }
        }));
        
        let jsonStr = response.text || "[]";
        jsonStr = jsonStr.replace(/,\s*\]/g, ']').replace(/,\s*\}/g, '}');
        
        const json = JSON.parse(jsonStr);
        const slidesData = Array.isArray(json) ? json : [];
        
        const newVisuals: VisualAsset[] = imagesToProcess.map((img, idx) => {
            const narration = slidesData.find((s: any) => s.slideIndex === idx)?.narration || "";
            return {
                id: `slide-${idx}`,
                prompt: `Slide ${idx+1}`,
                imageData: img, 
                type: 'photo',
                overlayText: '',
                scriptText: narration,
                startTime: 0, 
                endTime: 0
            };
        });
        
        const fullScript = newVisuals.map(v => v.scriptText).join(" ");
        
        updateActivePart({ script: fullScript, visuals: newVisuals });
        if(!details.title) setDetails(prev => ({...prev, title: "Slide Deck Video"}));
        
        if (newVisuals.length > 0 && !ecoverPreview) {
            setEcoverPreview(newVisuals[0].imageData);
        }
        
        setStep('editor');
        
    } catch(e) {
        console.error("Slide analysis failed", e);
        alert("Failed to analyze slides. Please try fewer images.");
    } finally {
        setIsAnalyzingSlides(false);
    }
  };

  const generateMetadata = async (target: 'all' | 'title' | 'headline' | 'description', overrideFile?: File) => {
      const fileToUse = overrideFile || file;
      if (!fileToUse && !details.title && !details.description && !ecoverPreview) {
          if (!overrideFile) {
             if(initialType !== 'Slide Deck') alert("Please upload a file or ecover first.");
          }
          return;
      }
      setIsGeneratingMeta(target);
      const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
      try {
          const parts: any[] = [];
          let prompt = "";
          
          // If we have an uploaded file (ebook/PDF), extract the ACTUAL title from it
          if (fileToUse) { 
              parts.push(await fileToGenerativePart(fileToUse));
              if (target === 'all') {
                  prompt = `Look at this document and EXTRACT the EXACT title and subtitle as written. Do NOT make up new titles. Return JSON: { "title": "the exact book/document title", "headline": "the exact subtitle if present, otherwise empty string", "description": "a brief factual summary of what this document is about" }. Return the ACTUAL text from the document, not creative rewrites.`;
              } else if (target === 'title') {
                  prompt = `Look at this document and EXTRACT the EXACT title as written on the title page or cover. Do NOT make up a new title. Return JSON: { "text": "the exact title" }`;
              } else if (target === 'headline') {
                  prompt = `Look at this document and EXTRACT the EXACT subtitle as written. If no subtitle exists, return the author name or a key phrase from the cover. Do NOT make up text. Return JSON: { "text": "the exact subtitle or author" }`;
              } else {
                  prompt = `Read this document and write a brief factual description of what it covers. Be direct and specific. Return JSON: { "text": "description" }`;
              }
          } 
          // If we have an ecover image, read the text from it
          else if (ecoverPreview) {
              const base64Data = ecoverPreview.split(',')[1];
              parts.push({ inlineData: { data: base64Data, mimeType: 'image/png' } });
              if (target === 'all') {
                  prompt = `Look at this book cover/ecover image and READ the EXACT text written on it. EXTRACT the title and subtitle exactly as shown. Return JSON: { "title": "the exact title text from the image", "headline": "the exact subtitle text from the image", "description": "a brief description based on what the cover shows" }. Return the ACTUAL text visible on the cover, not creative rewrites.`;
              } else if (target === 'title') {
                  prompt = `Look at this cover image and READ the EXACT title text as shown. Return JSON: { "text": "the exact title from the image" }`;
              } else if (target === 'headline') {
                  prompt = `Look at this cover image and READ the EXACT subtitle text as shown. Return JSON: { "text": "the exact subtitle from the image" }`;
              } else {
                  prompt = `Based on this cover image, write a brief factual description. Return JSON: { "text": "description" }`;
              }
          }
          // Fallback: no file, just use what user typed
          else {
              const context = details.title || details.description;
              if (target === 'description' && context) {
                  prompt = `Write a brief, direct description for a video about: "${context}". Return JSON: { "text": "description" }`;
              } else {
                  return;
              }
          }
          
          parts.push({ text: prompt });
          const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({ model: selectedAIModel, contents: { parts }, config: { responseMimeType: "application/json" } }));
          const json = JSON.parse(response.text || "{}");
          if (target === 'all') {
              if (json.title) setDetails(prev => ({ ...prev, title: json.title }));
              if (json.headline) setDetails(prev => ({ ...prev, headline: json.headline }));
              if (json.description) setDetails(prev => ({ ...prev, description: json.description }));
          } else if (target === 'title' && json.text) {
              setDetails(prev => ({ ...prev, title: json.text }));
          } else if (target === 'headline' && json.text) {
              setDetails(prev => ({ ...prev, headline: json.text }));
          } else if (target === 'description' && json.text) {
              setDetails(prev => ({ ...prev, description: json.text }));
          }
      } catch (e) {
          console.error(e);
          if(!overrideFile && initialType !== 'Slide Deck') alert("Failed to extract details. Try a different file.");
      } finally {
          setIsGeneratingMeta(null);
      }
  };

  const generateAIECover = async () => {
      if (!details.title) { alert("Please provide a Video Title first."); return; }
      setIsGeneratingEcover(true);
      try {
           let stylePrompt = "High-impact YouTube thumbnail style. Bold text, high contrast, vibrant colors.";
           if (initialType === 'Training') stylePrompt = "Clean educational style. Professional, trustworthy, with clear readable text. Think online course or masterclass thumbnail.";
           if (initialType === 'Social Short') stylePrompt = "TikTok style cover, vertical, trendy, big text.";
           if (initialType === 'Corporate') stylePrompt = "Professional, clean, corporate branding style.";
           
           let prompt = `Design a premium thumbnail/cover for a video titled "${details.title}". Headline: "${details.headline || ''}". STYLE: ${stylePrompt} USER INSTRUCTIONS: "${ecoverInstructions}"`;
           
           // Use 3:4 aspect ratio for ecovers to match course covers
           const ecoverAspectRatio = '3:4';
           
           // Get API keys from localStorage (user's own keys)
           const replicateApiKey = localStorage.getItem('replicateApiKey') || '';
           const openaiApiKey = localStorage.getItem('openaiApiKey') || '';
           
           // Use server-side API with selected provider from toggle
           const result = await api.ai.generateImage(prompt, ecoverAspectRatio, {
               useFlux: selectedImageProvider === 'flux',
               useFluxSchnell: selectedImageProvider === 'flux-schnell',
               useNanoBanana: selectedImageProvider === 'nano-banana',
               useOpenAI: selectedImageProvider === 'openai',
               replicateApiKey: replicateApiKey || undefined,
               openaiApiKey: openaiApiKey || undefined,
           });
           if (result.success && result.imageData) {
               setEcoverPreview(`data:image/png;base64,${result.imageData}`);
               console.log(`Ecover generated via ${result.provider}`);
           } else {
               throw new Error('No image data received');
           }
      } catch (e) { console.error("Ecover gen failed", e); alert("Failed to generate ecover."); } finally { setIsGeneratingEcover(false); }
  };

  // Handle saving a hosted video (no AI generation needed)
  const handleHostedVideoSave = async () => {
      if (!hostedVideoUrl) return;
      
      // Create a simple video part with just the URL
      const hostedPart: VideoPart = {
          id: `hp-${Date.now()}`,
          title: details.title || 'Video',
          script: details.description || '',
          visuals: [],
          videoUrl: hostedVideoUrl,
          durationSeconds: 0,
          duration: '0:00'
      };
      
      setVideoParts([hostedPart]);
      setStep('complete');
      
      // Auto-save if handler is available
      if (onSave) {
          try {
              const course = constructCourseObject([{
                  id: `vm-${hostedPart.id}`,
                  courseId: courseId,
                  title: 'Video Content',
                  lessons: [{
                      id: hostedPart.id,
                      moduleId: `vm-${hostedPart.id}`,
                      title: hostedPart.title,
                      sourceText: hostedPart.script,
                      visuals: [],
                      videoUrl: hostedVideoUrl,
                      audioData: undefined,
                      durationSeconds: 0,
                      duration: '0:00',
                      resources: [],
                      status: LessonStatus.READY,
                      progress: 100,
                      voice: selectedVoice,
                      captionStyle: selectedCaptionStyle,
                      thumbnailData: ecoverPreview || ''
                  }]
              }]);
              await onSave(course);
          } catch (e) {
              console.error('Auto-save failed:', e);
          }
      }
  };

  // Handle using the user's own script (no AI script generation, just visuals)
  const handleOwnScriptContinue = async () => {
      if (!ownScriptText || ownScriptText.length < 50) return;
      
      setIsProcessing(true);
      setStatusMessage("Using your script and generating visuals...");
      setScriptGenTime(null);
      setStoryboardGenTime(null);
      setImageGenTime(null);
      setStoryboardProgress('');
      setImagesGenerated(0);
      setTotalImagesToGenerate(0);
      setGenerationStartTime(Date.now());
      
      try {
          // Use the script exactly as provided
          const userScript = ownScriptText.trim();
          setScriptGenTime(0); // Script was provided, not generated
          
          // Create the video part first with the script
          const newPartId = `vp-${Date.now()}`;
          const newPart: VideoPart = {
              id: newPartId,
              title: details.title || 'My Video',
              script: userScript,
              visuals: [],
              voice: selectedVoice,
              visualStyle: selectedVisualStyle,
              captionStyle: selectedCaptionStyle,
              visualPacing: visualPacing
          };
          
          // Generate storyboard visuals FIRST, then set state with them included
          setStatusMessage("Creating visual storyboard from your script...");
          const storyboardStart = Date.now();
          const generatedVisuals = await generateStoryboardVisuals(userScript);
          setStoryboardGenTime(Math.round((Date.now() - storyboardStart) / 1000));
          
          // Now set the video parts with the generated visuals included
          const partWithVisuals = { ...newPart, visuals: generatedVisuals };
          setVideoParts([partWithVisuals]);
          setActivePartIndex(0);
          
          setStep('editor');
          
      } catch (err) {
          console.error("Error processing own script:", err);
          alert("Failed to generate visuals. Please try again.");
      } finally {
          setIsProcessing(false);
          setStatusMessage('');
          setGenerationStartTime(null);
      }
  };

  const handleGenerateScript = async () => {
      setIsProcessing(true);
      setStatusMessage("Analyzing input & generating script...");
      // Reset timing stats
      setScriptGenTime(null);
      setStoryboardGenTime(null);
      setImageGenTime(null);
      setStoryboardProgress('');
      setImagesGenerated(0);
      setTotalImagesToGenerate(0);
      setGenerationStartTime(Date.now());
      const scriptStart = Date.now();
      const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
      try {
          let filePart: any = null;
          if (file && strategy !== 'creative') { filePart = await fileToGenerativePart(file); }
          const targetWords = VIDEO_DURATIONS.find(d => d.value === durationMode)?.words || 300;
          
          let scriptPrompt = "";
          if (initialType === 'Sales') {
              scriptPrompt = `
              STYLE: High-energy Video Sales Letter (VSL).
              
              OPENING (First 2 sentences - CRITICAL):
              Immediately tell the viewer what this video will show them and what specific result/benefit they'll get.
              Example: "In the next few minutes, you're going to discover exactly how to [specific outcome]. This is the same method that [proof/result]."
              
              FRAMEWORK:
              1. HOOK (0-5s): Grab attention with a clear promise of what they'll learn/get.
              2. PROBLEM: Agitate the pain. Show why current solutions fail.
              3. SOLUTION: Introduce the product/service as the answer.
              4. PROOF: Specific benefits or results they can expect.
              5. CTA: Strong Call to Action.
              TONE: Persuasive, confident, urgent. Short, punchy sentences.
              `;
          } else if (initialType === 'Social Short') {
              scriptPrompt = `
              STYLE: Viral TikTok / Reel Script.
              FRAMEWORK:
              1. VISUAL HOOK (0-3s): Statement that stops the scroll.
              2. VALUE: Quick tip or interesting fact.
              3. PAYOFF: The result.
              TONE: Trendy, fast-paced, casual. No fluff. Max 150 words total.
              `;
          } else if (initialType === 'Training') {
              const faithContent = isFaithBased ? `
                  FAITH INTEGRATION: Weave in references to God, faith, and spiritual principles naturally throughout.
                  Connect concepts to biblical wisdom and God's design where appropriate.
                  Remind the viewer that their growth honors God and serves His purpose.
                  ` : '';
              
              if (strategy === 'strict') {
                  scriptPrompt = `
                  You are a friendly mentor teaching ONE person directly through their screen.
                  TASK: Transform the provided document into a simple, direct training video.
                  
                  CRITICAL RULES:
                  - Talk directly to "you" - one viewer watching alone
                  - Use simple words a 12-year-old could understand
                  - No fluff, no filler - get straight to the point
                  - Short sentences. Clear ideas. Easy to follow.
                  - Do NOT read like a book - speak naturally like you're helping a friend
                  - No chapters, sections, or formal structure words
                  
                  OPENING PARAGRAPH (MANDATORY - First 2-3 sentences):
                  Start by telling the viewer EXACTLY:
                  1. What this training is about (the specific topic/skill)
                  2. What they will be able to DO after watching (concrete outcome)
                  3. How this will BENEFIT them in their life/work (the real-world impact)
                  Example: "In this training, you're going to learn [specific skill]. By the end, you'll know exactly how to [concrete action]. This means you'll be able to [real benefit in their life]."
                  
                  FLOW:
                  - Opening: Clear benefit statement (as described above)
                  - Middle: Teach step by step, one idea at a time, simply
                  - End: Recap the key points and remind them of the benefit
                  
                  TONE: Warm, encouraging, simple. Like a patient friend explaining something.
                  ${faithContent}
                  Do not include scene directions, just spoken text.
                  `;
              } else {
                  scriptPrompt = `
                  You are a friendly mentor teaching ONE person directly through their screen.
                  Topic: "${details.title}"
                  ${details.description ? `Context: ${details.description}` : ''}
                  
                  CRITICAL RULES:
                  - Talk directly to "you" - one viewer watching alone
                  - Use simple words a 12-year-old could understand
                  - No fluff, no filler - get straight to the point
                  - Short sentences. Clear ideas. Easy to follow.
                  - Speak naturally like you're helping a friend learn something new
                  - No chapters, sections, or formal structure
                  
                  OPENING PARAGRAPH (MANDATORY - First 2-3 sentences):
                  Start by telling the viewer EXACTLY:
                  1. What this training is about (the specific topic/skill)
                  2. What they will be able to DO after watching (concrete outcome)
                  3. How this will BENEFIT them in their life/work (the real-world impact)
                  Example: "In this training, you're going to learn [specific skill]. By the end, you'll know exactly how to [concrete action]. This means you'll be able to [real benefit in their life]."
                  
                  FLOW:
                  - Opening: Clear benefit statement (as described above)
                  - Middle: Break it down step by step with simple examples
                  - End: Give them the key takeaways and remind them what they've gained
                  
                  TONE: Warm, encouraging, direct. Like a patient friend who knows their stuff.
                  ${faithContent}
                  Do not include scene directions, just spoken text.
                  `;
              }
          } else if (initialType === 'Explainer') {
              scriptPrompt = `
              STYLE: Product Explainer.
              
              OPENING (First 2 sentences - CRITICAL):
              Start by telling the viewer exactly what this product/concept does and how it will make their life easier.
              Example: "Let me show you how [product] works and exactly what it can do for you. By the end of this video, you'll understand how to [specific benefit]."
              
              FRAMEWORK:
              1. THE WHAT: Clear explanation of what it is and what it does for them.
              2. THE WHY: Specific benefits and how it solves their problem.
              3. THE HOW: Simple explanation of how it works.
              TONE: Friendly, simple, jargon-free.
              `;
          } else if (initialType === 'Corporate') {
              scriptPrompt = `
              STYLE: Executive Update.
              FRAMEWORK:
              1. OPENING: Professional greeting and context.
              2. UPDATE: Key metrics or news.
              3. CLOSING: Strategic outlook.
              TONE: Formal, polished, brand-safe, inspiring.
              `;
          } else {
              scriptPrompt = "Professional, engaging, and clear narration script.";
          }

          const avoidClicheInstruction = "WRITING STYLE: NEVER use cliché buzzwords like 'unlock', 'unleash', 'master', 'supercharge', 'game-changing', 'revolutionary', 'transform your life'. Write in direct, practical language. Get straight to the point.";
          let prompt = `Write a video script about "${details.title}". TARGET LENGTH: Approximately ${targetWords} spoken words. STRATEGY: ${strategy === 'strict' ? 'Strictly summarize the provided file.' : strategy === 'hybrid' ? 'Use the file as a base but add engaging examples.' : 'Be creative and expand on the topic.'} ${scriptPrompt} ${avoidClicheInstruction} FORMAT: Just the spoken text. Do not include camera directions. USER NOTES: ${strategyInstructions}`;
          
          const parts = filePart ? [filePart, { text: prompt }] : [{ text: prompt }];
          const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({ model: selectedAIModel, contents: { parts } }));
          const generatedScript = response.text || "";
          setScriptGenTime(Math.round((Date.now() - scriptStart) / 1000));
          updateActivePart({ script: generatedScript, visuals: [] });
          setStatusMessage("Script generated. Creating storyboard...");
          setStoryboardProgress('Analyzing script structure...');
          const storyboardStart = Date.now();
          await generateStoryboard(generatedScript);
          setStoryboardGenTime(Math.round((Date.now() - storyboardStart) / 1000));
          setGenerationStartTime(null);
          setStep('editor');
      } catch (e: any) { 
          console.error(e); 
          const isRateLimit = e?.status === 429 || e?.code === 429 || 
                             String(e?.message || '').includes('429') || 
                             String(e?.message || '').includes('quota') ||
                             String(e?.message || '').includes('RESOURCE_EXHAUSTED');
          if (isRateLimit) {
              alert("Gemini API quota exceeded. Please wait a few minutes before trying again, or check your Google AI billing at ai.google.dev/pricing");
          } else {
              alert("Failed to generate script. Please try again.");
          }
          setGenerationStartTime(null); 
      } finally { setIsProcessing(false); }
  };

  const handleAiRewriteScript = async () => {
      if (!rewriteInstructions) return;
      setIsRewritingScript(true);
      setRewriteStatusMessage("Analyzing your instructions...");
      try {
          const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
          setRewriteStatusMessage("AI is rewriting your script...");
          const prompt = `Rewrite the following video script. USER INSTRUCTIONS: "${rewriteInstructions}" CURRENT SCRIPT: "${activePart.script}" Output ONLY the new script text.`;
          const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({ model: selectedAIModel, contents: { parts: [{ text: prompt }] } }));
          if (response.text) {
              setRewriteStatusMessage("Applying changes...");
              updateActivePart({ script: response.text });
              setRewriteStatusMessage("Done!");
              await new Promise(r => setTimeout(r, 500));
              setShowScriptRewriteModal(false);
              setRewriteInstructions('');
          }
      } catch (e) { console.error("Rewrite failed", e); setRewriteStatusMessage("Failed to rewrite. Please try again."); } finally { setIsRewritingScript(false); setRewriteStatusMessage(''); }
  };

  // Generate storyboard visuals and return them (for use in contexts where state isn't ready yet)
  const generateStoryboardVisuals = async (currentScript: string, customInstructions: string = ''): Promise<VisualAsset[]> => {
      setStoryboardProgress('Initializing storyboard generation...');
      const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
      let pacingInstruction = "Break script into distinct visual scenes (approx 1 per 12-15s).";
      if (visualPacing === 'Fast') pacingInstruction = "Break script into double density visual scenes (approx 1 per 6-8s).";
      if (visualPacing === 'Turbo') pacingInstruction = "Break script into rapid-fire visual scenes (every 2-3 seconds).";
      
      let visualContext = "";
      if (initialType === 'Sales') visualContext = "VISUAL STYLE: High-impact, cinematic, emotional. Use metaphors for pain/gain. IMAGERY: Frustrated people for problems, happy successful people for solutions, bold text overlays.";
      if (initialType === 'Training') visualContext = "VISUAL STYLE: Clean, instructional. IMAGERY: Step-by-step diagrams, screen mockups, numbered lists, whiteboards, clear icons.";
      if (initialType === 'Social Short') visualContext = "VISUAL STYLE: Vertical 9:16 composition. IMAGERY: Trendy aesthetic, bright colors, centered subjects, shock/surprise elements.";
      if (initialType === 'Explainer') visualContext = "VISUAL STYLE: Minimalist, abstract, or isometric 3D. IMAGERY: Simple representations of complex ideas, connecting dots, flowcharts.";
      if (initialType === 'Corporate') visualContext = "VISUAL STYLE: Professional, sleek, modern office. IMAGERY: Glass buildings, diverse teams in meetings, upward trending charts, handshakes.";

      let finalPrompt = `${pacingInstruction} ${visualContext} For each scene, provide: segmentText (the exact narration text for that scene - must be properly formatted with spaces between all words), visualPrompt (CRITICAL - CREATE HIGHLY SPECIFIC, PRESENTATION-QUALITY IMAGE PROMPTS:

MANDATORY INCLUSIONS in visualPrompt:
1. SECTION/LESSON NUMBERS: If the text mentions "Section 1" or "Step 3" or "Lesson 5", include "Bold text overlay showing 'SECTION 1' or 'STEP 3'" in the prompt
2. SECTION TITLES: Include exact titles like "Section 1: Winning the Argument" or "Step 2: The Follow-Up Call" as text overlays
3. COMPANY NAMES: If text mentions Microsoft, Google, Amazon, any company - include the company name prominently
4. PRODUCT NAMES: Include specific product names, software names, tool names as text or visuals
5. WEBSITE URLs: If a website is mentioned like "LinkedIn.com" or "indeed.com", show it clearly in the image
6. STATISTICS/NUMBERS: If text mentions "87% of executives" or "$150,000 salary", include these exact numbers as large text overlays
7. CONTACT INFO: Email addresses, phone numbers, addresses should be shown as text overlays
8. LISTS/STRATEGIES: If text mentions "5 key strategies" or "3 steps to success", show a numbered list format
9. QUOTES: Important quotes should be displayed with quotation marks
10. SPECIFIC DETAILS: Job titles, certifications, degrees, awards - all should be visible text

STYLE: Professional presentation slide, corporate training visual, high-quality educational infographic. Clean typography, bold headers, organized layout.

Example: If script says "In Section 2, we cover the LinkedIn Strategy where you'll learn how 73% of recruiters use LinkedIn to find candidates"
→ visualPrompt should be: "Professional presentation slide with bold header 'SECTION 2: THE LINKEDIN STRATEGY', LinkedIn logo prominently displayed, large statistic '73% of recruiters use LinkedIn' in bold blue text, clean corporate design with recruiter silhouettes"

), visualType (illustration/photo/diagram), overlayText (text to show on screen - use direct practical language, NEVER use clichés like 'unlock', 'unleash', 'master', 'transform'). IMPORTANT: The segmentText must have normal spacing between words - do not concatenate words together. Script: ${currentScript}`;
      if (customInstructions) { finalPrompt += `\n\nIMPORTANT USER INSTRUCTIONS FOR VISUALS: "${customInstructions}".`; }
      try {
          setStoryboardProgress('Breaking script into visual scenes...');
          const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({ 
              model: selectedAIModel, 
              contents: { parts: [{ text: finalPrompt }] }, 
              config: { 
                  responseMimeType: "application/json",
                  responseSchema: { 
                      type: Type.ARRAY, 
                      items: { 
                          type: Type.OBJECT, 
                          properties: { 
                              segmentText: { type: Type.STRING }, 
                              visualPrompt: { type: Type.STRING }, 
                              visualType: { type: Type.STRING }, 
                              overlayText: { type: Type.STRING } 
                          } 
                      } 
                  }
              } 
          }));
          setStoryboardProgress('Parsing visual prompts...');
          const scenes = JSON.parse((response.text || "[]").replace(/```json/g, '').replace(/```/g, ''));
          setStoryboardProgress(`Creating ${scenes.length} scene cards...`);
          const newVisuals: VisualAsset[] = scenes.map((s: any, idx: number) => ({ id: `v-${Date.now()}-${idx}`, prompt: s.visualPrompt || '', imageData: '', type: s.visualType || 'illustration', overlayText: s.overlayText || '', scriptText: fixConcatenatedText(s.segmentText || ''), startTime: 0, endTime: 0 }));
          setStoryboardProgress(`Storyboard complete: ${scenes.length} scenes`);
          return newVisuals;
      } catch (e) { console.error("Storyboard failed", e); setStoryboardProgress('Storyboard generation failed'); return []; }
  };
  
  // Wrapper that updates state directly (for regeneration when state is already correct)
  const generateStoryboard = async (currentScript: string, customInstructions: string = '') => {
      const newVisuals = await generateStoryboardVisuals(currentScript, customInstructions);
      if (newVisuals.length > 0) {
          updateActivePart({ visuals: newVisuals });
      }
  };

  const handleTriggerRegen = async () => {
      if (!activePart.script) {
          alert("No script to generate storyboard from. Please add a script first.");
          return;
      }
      setShowRegenModal(false); 
      setIsProcessing(true); 
      setStatusMessage("Regenerating Storyboard...");
      setStoryboardProgress('Starting storyboard regeneration...');
      try {
          await generateStoryboard(activePart.script, regenInstructions);
          setStatusMessage("Storyboard regenerated successfully!");
      } catch (e) {
          console.error("Storyboard regen failed", e);
          setStatusMessage("Storyboard regeneration failed. Please try again.");
      } finally {
          setIsProcessing(false); 
          setRegenInstructions('');
      }
  };

  const handleSplitPart = async (numParts: number) => {
      if (!activePart.script) return;
      if (splitInstructions.trim()) {
          setIsProcessing(true); setStatusMessage("Splitting script with AI...");
          try {
               const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
               const prompt = `Split the following script into exactly ${numParts} distinct parts/episodes. USER INSTRUCTIONS: "${splitInstructions}" SCRIPT: "${activePart.script}" Return a JSON object: { "parts": ["script for part 1", "script for part 2", ...] }`;
               const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({ model: selectedAIModel, contents: { parts: [{ text: prompt }] }, config: { responseMimeType: "application/json" } }));
               const json = JSON.parse(response.text || "{}");
               if (json.parts && Array.isArray(json.parts)) {
                   const newParts: VideoPart[] = [];
                   json.parts.forEach((partScript: string, i: number) => { newParts.push({ id: `p-split-${Date.now()}-${i}`, title: `${activePart.title} - Part ${i + 1}`, script: partScript, visuals: [] }); });
                   setVideoParts(prev => { const arr = [...prev]; arr.splice(activePartIndex, 1, ...newParts); return arr; });
                   setShowSplitModal(false); setSplitInstructions(''); alert(`Successfully split into ${json.parts.length} parts using AI! Please regenerate storyboards for the new parts.`); setIsProcessing(false); return;
               }
          } catch (e) { console.error("AI Split failed", e); alert("AI Split failed. Falling back to numeric split."); } finally { setIsProcessing(false); }
      }
      const sentences = activePart.script.match(/[^\.!\?]+[\.!\?]+/g) || [activePart.script];
      const totalSentences = sentences.length;
      const sentencesPerPart = Math.ceil(totalSentences / numParts);
      const newParts: VideoPart[] = [];
      const currentVisuals = activePart.visuals || [];
      const totalVisuals = currentVisuals.length;
      const visualsPerPart = Math.ceil(totalVisuals / numParts);
      for (let i = 0; i < numParts; i++) {
          const startIdx = i * sentencesPerPart;
          const endIdx = startIdx + sentencesPerPart;
          const partScript = sentences.slice(startIdx, endIdx).join(" ").trim();
          const vStart = i * visualsPerPart;
          const vEnd = vStart + visualsPerPart;
          const partVisuals = currentVisuals.slice(vStart, vEnd).map(v => ({...v, id: `split-${v.id}-${i}`})); 
          newParts.push({ id: `p-${Date.now()}-${i}`, title: `${activePart.title} - Part ${i + 1}`, script: partScript || "(No script content)", visuals: partVisuals });
      }
      setVideoParts(prev => { const arr = [...prev]; arr.splice(activePartIndex, 1, ...newParts); return arr; });
      setShowSplitModal(false); setSplitInstructions(''); alert(`Successfully split into ${numParts} parts!`);
  };

  const runConcurrentTasks = async <T,>(tasks: T[], fn: (item: T) => Promise<void>, limit: number) => {
      const results = [];
      const executing: Promise<void>[] = [];
      for (const item of tasks) {
          const p = Promise.resolve().then(() => fn(item));
          results.push(p);
          const e: Promise<void> = p.then(() => { executing.splice(executing.indexOf(e), 1); });
          executing.push(e);
          if (executing.length >= limit) { await Promise.race(executing); }
      }
      return Promise.all(results);
  };

  const generateImageForVisual = async (partId: string, visualId: string) => {
      const currentParts = partsRef.current;
      const part = currentParts.find(p => p.id === partId);
      const visualToGen = part?.visuals.find(v => v.id === visualId);
      if (!part || !visualToGen) return;
      setGeneratingImageIds(prev => new Set(prev).add(visualId));
      let imageData = '';
      if (visualMode === 'Solid_Color') { imageData = createSolidColorImage(solidColor, visualToGen.overlayText); } else {
           try {
              // Throttle API calls to avoid per-minute rate limits
              await throttleApiCall(2000);
              
              const effectiveStyle = part.visualStyle || selectedVisualStyle;
              
              let promptText = "";
              if (visualMode === 'Abstract') {
                  promptText = `Abstract background, ${effectiveStyle}, ${visualToGen.prompt}. No text.`;
              } else {
                  // Inject Video Type Context into Image Prompt
                  let styleContext = "";
                  if (initialType === 'Sales') styleContext = "Style: Cinematic, High-impact, Advertising quality.";
                  else if (initialType === 'Social Short') styleContext = "Style: Trendy, Viral, Bright colors.";
                  else if (initialType === 'Corporate') styleContext = "Style: Professional, Corporate, Clean.";
                  else styleContext = `Style: ${effectiveStyle}.`;

                  promptText = `${styleContext} Subject: ${visualToGen.prompt}. IMPORTANT: If any company names, brand logos, product names, websites, universities, or specific entities are mentioned, visually represent them accurately (show recognizable imagery associated with those brands/entities). Aspect Ratio ${targetAspectRatio}. No text.`;
              }

              // Get API keys from localStorage (user's own keys)
              const replicateApiKey = localStorage.getItem('replicateApiKey') || '';
              const openaiApiKey = localStorage.getItem('openaiApiKey') || '';
              
              // Use server-side API with selected provider from toggle
              const result = await api.ai.generateImage(promptText, targetAspectRatio, {
                  useFlux: selectedImageProvider === 'flux',
                  useFluxSchnell: selectedImageProvider === 'flux-schnell',
                  useNanoBanana: selectedImageProvider === 'nano-banana',
                  useOpenAI: selectedImageProvider === 'openai',
                  replicateApiKey: replicateApiKey || undefined,
                  openaiApiKey: openaiApiKey || undefined,
              });
              if (result.success && result.imageData) {
                  imageData = result.imageData;
                  console.log(`Image generated via ${result.provider} for ${visualId}`);
              }
           } catch (e) { console.error(`Image gen failed for ID ${visualId}`, e); }
      }
      if (!imageData) { imageData = createSolidColorImage('#334155', "Generation Failed"); }
      
      // Compress image to reduce payload size for database storage
      const compressedImage = await compressBase64Image(imageData, 1280, 0.85);
      
      setGeneratingImageIds(prev => { const next = new Set(prev); next.delete(visualId); return next; });
      setVideoParts(prev => { return prev.map(p => { if (p.id !== partId) return p; return { ...p, visuals: p.visuals.map(v => { if (v.id !== visualId) return v; return { ...v, imageData: compressedImage }; }) }; }); });
  };

  const handleBulkGenerateImages = async () => {
      const currentPart = videoParts[activePartIndex];
      if (!currentPart) return;
      const tasks = currentPart.visuals.map(v => ({ partId: currentPart.id, visualId: v.id }));
      setTotalImagesToGenerate(tasks.length);
      setImagesGenerated(0);
      setImageGenTime(null);
      const imageStart = Date.now();
      setGenerationStartTime(Date.now());
      let completedCount = 0;
      // Check Gemini mode from settings - free accounts use 1 at a time, paid use 3
      const geminiMode = localStorage.getItem('geminiMode') || 'paid';
      const concurrencyLimit = (selectedImageProvider === 'gemini' && geminiMode === 'free') ? 1 : 3;
      await runConcurrentTasks(tasks, async (task: { partId: string, visualId: string }) => {
          await generateImageForVisual(task.partId, task.visualId);
          completedCount++;
          setImagesGenerated(completedCount);
      }, concurrencyLimit);
      setImageGenTime(Math.round((Date.now() - imageStart) / 1000));
      setGenerationStartTime(null);
  };

  const [lastAudioError, setLastAudioError] = useState<string>('');
  
  // Generate key takeaways and action items from script using AI
  const generateTakeawaysAndActions = async (script: string, title: string): Promise<{ keyTakeaways: string[], actionItems: string[] }> => {
      const apiKey = getGeminiApiKey();
      if (!apiKey || !script || script.trim().length < 50) {
          return { keyTakeaways: [], actionItems: [] };
      }
      
      try {
          await throttleApiCall(1500);
          const ai = new GoogleGenAI({ apiKey });
          const prompt = `Analyze this video script and extract key information.

VIDEO TITLE: ${title}

SCRIPT:
${script.substring(0, 4000)}

Generate exactly:
1. 3-5 KEY TAKEAWAYS: The most important concepts or insights from this content
2. 2-4 ACTION ITEMS: Specific, actionable steps the viewer can take after watching

Respond in this exact JSON format:
{
  "keyTakeaways": ["takeaway 1", "takeaway 2", "takeaway 3"],
  "actionItems": ["action 1", "action 2"]
}

Keep each item concise (under 100 characters). Focus on practical value.`;

          const response = await withRetry<GenerateContentResponse>(() => 
              ai.models.generateContent({ 
                  model: selectedAIModel, 
                  contents: [{ parts: [{ text: prompt }] }],
                  config: { 
                      responseMimeType: 'application/json',
                      responseSchema: {
                          type: Type.OBJECT,
                          properties: {
                              keyTakeaways: { type: Type.ARRAY, items: { type: Type.STRING } },
                              actionItems: { type: Type.ARRAY, items: { type: Type.STRING } }
                          },
                          required: ['keyTakeaways', 'actionItems']
                      }
                  }
              }), 3, 5000);
          
          const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
              const parsed = JSON.parse(text);
              return {
                  keyTakeaways: parsed.keyTakeaways || [],
                  actionItems: parsed.actionItems || []
              };
          }
      } catch (e) {
          console.error('Failed to generate takeaways/actions:', e);
      }
      return { keyTakeaways: [], actionItems: [] };
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
        
        const isElevenLabs = voiceId.length > 20 || elevenLabsVoices.some(v => v.voice_id === voiceId);
        
        // Use ElevenLabs via backend proxy
        if (isElevenLabs && elevenLabsApiKey) {
            try {
                console.log(`Generating audio with ElevenLabs via backend: voiceId=${voiceId}`);
                const response = await fetch('/api/tts/elevenlabs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: cleanText,
                        voiceId,
                        apiKey: elevenLabsApiKey,
                        stability: voiceStability,
                        similarityBoost: voiceSimilarityBoost,
                        speed: voiceSpeed
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: response.statusText }));
                    console.error("ElevenLabs API Error:", response.status, errorData);
                    setLastAudioError(`ElevenLabs Error: ${response.status} - ${errorData.error || 'Unknown error'}`);
                    return null;
                }
                
                const data = await response.json();
                
                // Calculate duration from audio
                const binaryString = atob(data.audioData);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
                const blob = new Blob([bytes], { type: 'audio/mpeg' });
                const exactDuration = await getAudioDurationFromBlob(blob);
                
                console.log(`ElevenLabs audio generated: duration=${exactDuration}s, timestamps=${data.wordTimestamps?.length || 0}`);
                return { 
                    audioData: data.audioData, 
                    mimeType: 'audio/mpeg', 
                    duration: exactDuration, 
                    wordTimestamps: data.wordTimestamps || [] 
                };
            } catch (e: any) { 
                console.error("ElevenLabs generation failed", e); 
                setLastAudioError(`ElevenLabs failed: ${e.message || 'Unknown error'}`);
                return null; 
            }
        }
        
        // Use Gemini TTS via backend proxy (keeps API key secure)
        try {
            await throttleApiCall(2000);
            console.log(`Generating audio with Gemini TTS via backend: voice=${voiceId}, text length=${cleanText.length}`);
            setStatusMessage('Generating voice audio...');
            
            const response = await withRetry(async () => {
                const res = await fetch('/api/tts/gemini', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: cleanText, voiceId })
                });
                
                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({ error: res.statusText }));
                    throw new Error(errorData.error || `HTTP ${res.status}`);
                }
                
                return res.json();
            }, 4, 10000);
            
            if (response.audioData) {
                let exactDuration = 0;
                try { 
                    const binaryString = window.atob(response.audioData); 
                    const bytes = new Uint8Array(binaryString.length); 
                    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i); 
                    const wavBlob = pcmToWav(bytes, 24000, 1); 
                    exactDuration = await getAudioDurationFromBlob(wavBlob); 
                } catch(err) { 
                    console.warn("Could not decode Gemini audio duration", err); 
                }
                const durationFallback = window.atob(response.audioData).length / 48000;
                console.log(`Gemini audio generated successfully: duration=${exactDuration > 0 ? exactDuration : durationFallback}s`);
                return { audioData: response.audioData, mimeType: 'audio/pcm', duration: exactDuration > 0 ? exactDuration : durationFallback };
            } else {
                setLastAudioError('Gemini returned empty audio data. The script may be too short or contain unsupported content.');
                console.error("Gemini TTS returned no audio data in response");
            }
        } catch (e: any) { 
            const errorMsg = e.message || 'Unknown error';
            console.error("Gemini audio failed:", errorMsg, e); 
            if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('Rate limit')) {
                setLastAudioError('Rate limit reached. Please wait a few minutes and try again.');
            } else if (errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.includes('API key')) {
                setLastAudioError('API key issue. Please check that GEMINI_API_KEY is configured on the server.');
            } else if (errorMsg.includes('TTS service not configured') || errorMsg.includes('not configured')) {
                setLastAudioError('Voice generation service is not configured. Please ensure GEMINI_API_KEY is set in the server environment.');
            } else {
                setLastAudioError(`Voice generation error: ${errorMsg}`);
            }
            return null; 
        }
        return null;
    };

  const handleVoicePreview = async (voiceId: string, previewUrl?: string) => {
      if (audioPreviewRef.current) {
          audioPreviewRef.current.pause();
          audioPreviewRef.current = null;
      }
      if (playingVoiceId === voiceId) {
          setPlayingVoiceId(null);
          return;
      }
      setPlayingVoiceId(voiceId);
      if (previewUrl) {
          const audio = new Audio(previewUrl);
          audioPreviewRef.current = audio;
          audio.play().catch(e => { console.warn("Playback interrupted", e); setPlayingVoiceId(null); });
          audio.onended = () => setPlayingVoiceId(null);
          return;
      }
      const isElevenLabs = voiceId.length > 20 || elevenLabsVoices.some(v => v.voice_id === voiceId);
      const text = "Hello! I am ready to narrate your video.";
      try {
          const result = await generateAudio(text, voiceId);
          if (result) {
                let blob;
                if (result.mimeType === 'audio/mpeg') {
                    const binary = atob(result.audioData);
                    const array = new Uint8Array(binary.length);
                    for(let i=0; i<binary.length; i++) array[i] = binary.charCodeAt(i);
                    blob = new Blob([array], {type: 'audio/mpeg'});
                } else {
                    const binary = atob(result.audioData);
                    const array = new Uint8Array(binary.length);
                    for(let i=0; i<binary.length; i++) array[i] = binary.charCodeAt(i);
                    blob = pcmToWav(array, 24000, 1);
                }
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);
                audioPreviewRef.current = audio;
                audio.play().catch(e => { console.warn("Playback interrupted", e); setPlayingVoiceId(null); });
                audio.onended = () => setPlayingVoiceId(null);
          } else {
              setPlayingVoiceId(null);
          }
      } catch (e) {
          console.error("Preview failed", e);
          setPlayingVoiceId(null);
      }
  };

  const constructCourseObject = (modulesList?: any[]): Course => {
      let thumbnailData = "";
      if (useCoverAsThumbnail && ecoverPreview) { thumbnailData = ecoverPreview; }
      
      const finalModules = modulesList || videoParts.map((part, idx) => ({ 
          id: `vm-${part.id}`, 
          courseId: courseId, 
          title: videoParts.length > 1 ? `Video Part ${idx + 1}` : 'Video Content', 
          lessons: [{ 
              id: part.id, 
              moduleId: `vm-${part.id}`, 
              title: part.title, 
              sourceText: part.script, 
              visuals: part.visuals, 
              // IMPORTANT: Use existing or default audio data to prevent 0:00 duration bug on quick save
              audioData: part.audioData,
              audioMimeType: part.audioMimeType,
              durationSeconds: part.durationSeconds || 0,
              duration: part.duration || "0:00",
              resources: part.resources || [],
              // Hosted video URL for pre-rendered videos
              videoUrl: part.videoUrl,
              // IMPORTANT: Preserve rendered video URL so minor edits don't break playback
              renderedVideoUrl: part.renderedVideoUrl,
              // Certificate eligibility
              awardsCertificate: part.awardsCertificate,
              
              status: part.audioData ? LessonStatus.READY : LessonStatus.SCRIPTING,  
              progress: part.audioData ? 100 : 0, 
              
              voice: part.voice || selectedVoice, 
              captionStyle: part.captionStyle || selectedCaptionStyle, 
              visualStyle: part.visualStyle || selectedVisualStyle, 
              musicMode: musicMode, 
              backgroundMusicUrl: includeMusic ? selectedMusicTrack : undefined, 
              captionTextSource: showSubtitles ? 'script' : 'overlay', 
              visualPacing: part.visualPacing || visualPacing, 
              visualMode: visualMode, 
              solidColor: solidColor, 
              thumbnailData: thumbnailData, 
              captionPosition, 
              captionSize, 
              captionColor, 
              captionBgColor, 
              captionOutlineColor 
          }] 
      }));
      
      return { 
          id: courseId, 
          type: 'video', 
          title: details.title || 'Untitled Video', 
          headline: details.headline || 'AI Generated Video', 
          description: details.description, 
          ecoverUrl: ecoverPreview || 'https://picsum.photos/seed/video/400/600', 
          status: CourseStatus.PUBLISHED, 
          totalStudents: initialCourse ? initialCourse.totalStudents : 0, 
          rating: initialCourse ? initialCourse.rating : 0, 
          modules: finalModules,
          theme: theme // Add theme to final object
      };
  };
  
  const handleSaveProgress = async () => { 
    if (!onSave) return; 
    setIsSaving(true); 
    setSaveMessage(null);
    try {
      // Log videoParts state before constructing course object
      console.log('handleSaveProgress: videoParts state:', videoParts.map(p => ({
        id: p.id,
        title: p.title,
        hasRenderedVideoUrl: !!p.renderedVideoUrl,
        renderedVideoUrlLength: p.renderedVideoUrl?.length || 0,
        hasAudioData: !!p.audioData
      })));
      
      const course = constructCourseObject(); 
      
      // Log the course object to verify renderedVideoUrl is included
      for (const mod of course.modules) {
        for (const lesson of mod.lessons) {
          if (lesson.renderedVideoUrl) {
            console.log(`handleSaveProgress: Course lesson ${lesson.id} has renderedVideoUrl, length=${lesson.renderedVideoUrl.length}`);
          }
        }
      }
      
      await onSave(course); 
      setSaveMessage({ type: 'success', text: 'Video saved successfully!' });
      setTimeout(() => setSaveMessage(null), 4000);
    } catch (error: any) {
      console.error('Save failed:', error);
      setSaveMessage({ type: 'error', text: `Save failed: ${error?.message || 'Unknown error'}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinalSave = async () => {
    if (!finalCourse) return;
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await onComplete(finalCourse);
      setSaveMessage({ type: 'success', text: 'Video saved successfully! Redirecting...' });
    } catch (error: any) {
      console.error('Final save failed:', error);
      setSaveMessage({ type: 'error', text: `Save failed: ${error?.message || 'Unknown error'}. Please try again.` });
      setIsSaving(false);
    }
  };

  // Add New Video Part Handler
  const handleAddNewVideo = async () => {
    if (!newVideoTitle.trim()) { alert('Please enter a video title'); return; }
    setIsCreatingNewVideo(true);
    
    try {
      const newPartId = `p-${Date.now()}`;
      let script = '';
      
      if (newVideoType === 'full') {
        // Generate script with AI
        const scriptSource = newVideoScriptMode === 'own' ? newVideoScript : newVideoAiPrompt;
        if (scriptSource.trim()) {
          const apiKey = getGeminiApiKey();
          if (apiKey && newVideoScriptMode === 'ai') {
            try {
              const ai = new GoogleGenAI({ apiKey });
              const prompt = `Write a compelling video script about: ${scriptSource}\n\nMake it engaging and conversational, suitable for video narration. About 150-200 words.`;
              
              const response = await ai.models.generateContent({ 
                model: 'gemini-2.5-flash', 
                contents: [{ role: 'user', parts: [{ text: prompt }] }] 
              });
              script = response.text || scriptSource;
            } catch (aiError) {
              console.error('AI script generation failed:', aiError);
              script = scriptSource; // Fallback to the prompt as script
            }
          } else {
            script = scriptSource;
          }
        }
      } else if (newVideoScriptMode === 'own' && newVideoScript.trim()) {
        script = newVideoScript;
      }
      
      // Create new part with proper defaults matching existing parts
      const newPart: VideoPart = {
        id: newPartId,
        title: newVideoTitle,
        script: script,
        visuals: [],
        voice: selectedVoice,
        visualStyle: selectedVisualStyle,
        captionStyle: selectedCaptionStyle,
        visualPacing: visualPacing
      };
      
      // Use functional state update to get correct index
      setVideoParts(prev => {
        const newParts = [...prev, newPart];
        // Set active index after state updates
        setTimeout(() => setActivePartIndex(newParts.length - 1), 0);
        return newParts;
      });
      
      // Reset modal
      setShowAddVideoModal(false);
      setNewVideoTitle('');
      setNewVideoScript('');
      setNewVideoAiPrompt('');
      setNewVideoType('blank');
      setNewVideoScriptMode('ai');
      
    } catch (err) {
      console.error('Error creating new video:', err);
      alert('Failed to create new video. Please try again.');
    } finally {
      setIsCreatingNewVideo(false);
    }
  };
  
  // NEW FUNCTION: Save Theme Quick Exit
  const handleQuickSaveTheme = () => {
    // Uses the robust constructCourseObject which now includes preserving audio data from videoParts
    const updatedCourse = constructCourseObject();
    onComplete(updatedCourse); // Triggers save in parent
    alert("Theme & Content settings saved! Returning to dashboard.");
  };

  // NEW FUNCTION: Generate Audio Only for current part (bypasses script regeneration)
  const [isGeneratingAudioOnly, setIsGeneratingAudioOnly] = useState(false);
  const handleGenerateAudioOnly = async () => {
    if (!activePart.script || activePart.script.trim().length === 0) {
      alert("No script found. Please add a script first.");
      return;
    }
    
    const partVoice = activePart.voice || selectedVoice;
    const isElevenLabs = partVoice.length > 20 || elevenLabsVoices.some(v => v.voice_id === partVoice);
    
    if (!isElevenLabs && !elevenLabsApiKey) {
      // Check if Gemini might be rate limited
      const warnUser = confirm("Gemini TTS may be rate limited. For reliable audio generation, consider using ElevenLabs voices (configure in Settings sidebar). Continue anyway?");
      if (!warnUser) return;
    }
    
    setIsGeneratingAudioOnly(true);
    setStatusMessage("Generating audio for this video...");
    
    try {
      const generated = await generateAudio(activePart.script, partVoice);
      
      if (generated) {
        // Update the active part with audio data
        updateActivePart({
          audioData: generated.audioData,
          audioMimeType: generated.mimeType,
          durationSeconds: generated.duration,
          duration: `${Math.floor(generated.duration / 60)}:${Math.round(generated.duration % 60).toString().padStart(2, '0')}`,
          audioGeneratedWithVoice: partVoice
        });
        
        // Save audio directly to database if we have a courseId
        if (courseId && activePart.id) {
          setStatusMessage("Saving audio to database...");
          try {
            await api.lessonAudio.save(courseId, activePart.id, generated.audioData, generated.mimeType, generated.wordTimestamps || []);
            console.log(`Audio saved directly to database for lesson ${activePart.id}`);
          } catch (audioSaveErr) {
            console.error('Failed to save audio to database:', audioSaveErr);
          }
        }
        
        setStatusMessage("Audio generated successfully!");
        setTimeout(() => setStatusMessage(""), 2000);
      } else {
        if (lastAudioError) {
          alert(`Audio generation failed: ${lastAudioError}`);
        } else {
          alert("Audio generation failed. Please check your voice settings or try again later.");
        }
        setStatusMessage("");
      }
    } catch (err: any) {
      console.error("Audio generation error:", err);
      const isRateLimit = err?.status === 429 || String(err?.message || '').includes('429') || String(err?.message || '').includes('quota');
      if (isRateLimit) {
        alert("Rate limit exceeded. Try using an ElevenLabs voice instead (configure API key in Settings sidebar).");
      } else {
        alert(`Audio generation failed: ${err?.message || 'Unknown error'}`);
      }
      setStatusMessage("");
    } finally {
      setIsGeneratingAudioOnly(false);
    }
  };

  const handleRender = async () => {
      setStep('rendering'); setIsProcessing(true); setGenerationProgress(0); setStatusMessage("Initializing Multi-Part Renderer...");
      const finishedModules = []; const totalSteps = videoParts.length * 3; let completedSteps = 0;
      for (let i = 0; i < videoParts.length; i++) {
          const part = videoParts[i]; setStatusMessage(`Processing Part ${i+1}/${videoParts.length}: ${part.title}`);
          const partVoice = part.voice || selectedVoice; const partCaptionStyle = part.captionStyle || selectedCaptionStyle; const partVisualStyle = part.visualStyle || selectedVisualStyle; const partPacing = part.visualPacing || visualPacing;
          
          // PER-SECTION AUDIO: Generate audio for EACH section separately to get accurate timing
          let audioMimeType: 'audio/pcm' | 'audio/mpeg' = 'audio/mpeg';
          let wordTimestamps: { word: string; start: number; end: number }[] = [];
          
          const finalVisuals = [...part.visuals];
          for (let v = 0; v < finalVisuals.length; v++) {
            if (!finalVisuals[v].imageData) {
              finalVisuals[v].imageData = createSolidColorImage(solidColor, finalVisuals[v].overlayText);
            }
          }
          
          // Generate audio for each section IN PARALLEL (3 at a time) for speed
          const sectionAudioData: { base64: string; duration: number }[] = new Array(finalVisuals.length);
          
          console.log(`=== PER-SECTION AUDIO GENERATION (PARALLEL) ===`);
          console.log(`Generating audio for ${finalVisuals.length} sections (3 at a time)`);
          
          // Store word timestamps per section for later offset adjustment
          const sectionWordTimestamps: Array<{ word: string; start: number; end: number }[]> = new Array(finalVisuals.length).fill([]);
          
          const BATCH_SIZE = 3;
          for (let batchStart = 0; batchStart < finalVisuals.length; batchStart += BATCH_SIZE) {
            const batchEnd = Math.min(batchStart + BATCH_SIZE, finalVisuals.length);
            setStatusMessage(`Generating audio for sections ${batchStart + 1}-${batchEnd}/${finalVisuals.length}...`);
            
            const batchPromises = [];
            for (let sIdx = batchStart; sIdx < batchEnd; sIdx++) {
              const section = finalVisuals[sIdx];
              const sectionText = (section.scriptText || '').trim();
              
              if (!sectionText) {
                batchPromises.push(Promise.resolve({ sIdx, base64: '', duration: 0.5, empty: true, timestamps: [] }));
              } else {
                batchPromises.push(
                  generateAudio(sectionText, partVoice).then(generated => {
                    if (generated && generated.audioData) {
                      audioMimeType = generated.mimeType;
                      return { sIdx, base64: generated.audioData, duration: generated.duration || 5, timestamps: generated.wordTimestamps || [] };
                    } else {
                      return { sIdx, base64: '', duration: sectionText.length / 15, failed: true, timestamps: [] };
                    }
                  }).catch(() => ({ sIdx, base64: '', duration: sectionText.length / 15, failed: true, timestamps: [] }))
                );
              }
            }
            
            const results = await Promise.all(batchPromises);
            for (const result of results) {
              sectionAudioData[result.sIdx] = { base64: result.base64, duration: result.duration };
              sectionWordTimestamps[result.sIdx] = result.timestamps || [];
              console.log(`Section ${result.sIdx}: ${result.duration.toFixed(2)}s, ${(result.timestamps || []).length} timestamps${result.empty ? ' (empty)' : result.failed ? ' (failed)' : ''}`);
            }
          }
          
          // Now set timing based on actual durations AND combine word timestamps with offsets
          let cumulativeTime = 0;
          for (let sIdx = 0; sIdx < finalVisuals.length; sIdx++) {
            const section = finalVisuals[sIdx];
            const dur = sectionAudioData[sIdx]?.duration || 2;
            section.startTime = cumulativeTime;
            section.endTime = cumulativeTime + dur;
            section.sectionIndex = sIdx;
            section.zoomDirection = sIdx % 2 === 0 ? 'in' : 'out';
            
            // Add this section's word timestamps with time offset
            const sectionTimestamps = sectionWordTimestamps[sIdx] || [];
            for (const ts of sectionTimestamps) {
              wordTimestamps.push({
                word: ts.word,
                start: ts.start + cumulativeTime,
                end: ts.end + cumulativeTime
              });
            }
            
            cumulativeTime += dur;
            console.log(`Section ${sIdx} timing: ${section.startTime.toFixed(2)}s - ${section.endTime.toFixed(2)}s, ${sectionTimestamps.length} words`);
          }
          console.log(`Total word timestamps collected: ${wordTimestamps.length}`);
          
          const durationSeconds = cumulativeTime;
          console.log(`Total duration: ${durationSeconds.toFixed(2)}s from ${finalVisuals.length} sections`);
          console.log(`=== END PER-SECTION AUDIO ===`);
          
          // Concatenate all section audio into one (FAST method)
          setStatusMessage(`Combining ${sectionAudioData.length} audio sections...`);
          let audioData = '';
          
          // Just concatenate the base64 strings after decoding to binary
          const audioChunks = sectionAudioData.filter(s => s.base64).map(s => s.base64);
          if (audioChunks.length > 0) {
            console.log(`Combining ${audioChunks.length} audio chunks...`);
            // Use Blob for fast binary concatenation
            const blobs = audioChunks.map(b64 => {
              const binary = atob(b64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              return new Blob([bytes], { type: 'audio/mpeg' });
            });
            const combinedBlob = new Blob(blobs, { type: 'audio/mpeg' });
            
            // CRITICAL: Measure actual combined duration and adjust section timings if needed
            const actualCombinedDuration = await getAudioDurationFromBlob(combinedBlob);
            console.log(`Combined audio actual duration: ${actualCombinedDuration.toFixed(2)}s vs calculated: ${durationSeconds.toFixed(2)}s`);
            
            // If actual duration differs significantly (>5%), scale all section timings
            if (actualCombinedDuration > 0 && Math.abs(actualCombinedDuration - durationSeconds) > durationSeconds * 0.05) {
              const scaleFactor = actualCombinedDuration / durationSeconds;
              console.log(`Adjusting section timings by factor ${scaleFactor.toFixed(3)}`);
              for (const section of finalVisuals) {
                section.startTime = section.startTime * scaleFactor;
                section.endTime = section.endTime * scaleFactor;
              }
              // Update durationSeconds to actual
              cumulativeTime = actualCombinedDuration;
            }
            
            // Convert blob to base64 using FileReader (fast)
            audioData = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const result = reader.result as string;
                resolve(result.split(',')[1] || '');
              };
              reader.readAsDataURL(combinedBlob);
            });
            console.log(`Combined audio: ${audioChunks.length} chunks, ${(combinedBlob.size / 1024).toFixed(1)}KB, final duration: ${cumulativeTime.toFixed(2)}s`);
          }
          
          // Use adjusted duration
          const finalDurationSeconds = cumulativeTime;
          
          // Update tracking
          setVideoParts(prev => prev.map((p, idx) => idx === i ? { ...p, audioGeneratedWithVoice: partVoice } : p));
          
          // Save combined audio to database
          if (courseId && part.id && audioData) {
            setStatusMessage(`Saving combined audio to database...`);
            try {
              await api.lessonAudio.save(courseId, part.id, audioData, audioMimeType, wordTimestamps);
              console.log(`Combined audio saved to database for lesson ${part.id}`);
            } catch (audioSaveErr) {
              console.error('Failed to save audio to database:', audioSaveErr);
            }
          }
          
          completedSteps++; setGenerationProgress((completedSteps / totalSteps) * 100);
          completedSteps++; setGenerationProgress((completedSteps / totalSteps) * 100);
          let thumbnailData = ""; if (useCoverAsThumbnail && ecoverPreview) { thumbnailData = ecoverPreview; } else if (finalVisuals.length > 0 && finalVisuals[0].imageData) { thumbnailData = finalVisuals[0].imageData; }
          
          // CRITICAL: Save images to database (bypasses HTTP payload limits)
          if (courseId && part.id && finalVisuals.length > 0) {
            setStatusMessage(`Saving images to database for Part ${i+1}...`);
            try {
              const imagesToSave = finalVisuals.map((v, idx) => ({
                visualIndex: idx,
                imageData: v.imageData || '',
                prompt: v.prompt || ''
              })).filter(img => img.imageData && img.imageData.length > 100);
              
              if (imagesToSave.length > 0) {
                await api.lessonImages.save(courseId, part.id, imagesToSave);
                console.log(`Saved ${imagesToSave.length} images to database for lesson ${part.id}`);
              }
            } catch (imgSaveErr) {
              console.error('Failed to save images to database:', imgSaveErr);
            }
          }
          
          // Generate key takeaways and action items
          setStatusMessage(`Generating key takeaways for Part ${i+1}...`);
          const { keyTakeaways, actionItems } = await generateTakeawaysAndActions(part.script, part.title);
          
          finishedModules.push({ id: `vm-${part.id}`, courseId: courseId, title: videoParts.length > 1 ? `Part ${i+1}: ${part.title}` : 'Video Content', lessons: [{ id: part.id, moduleId: `vm-${part.id}`, title: part.title, sourceText: part.script, visuals: finalVisuals, audioData: audioData, audioMimeType: audioMimeType, duration: `${Math.floor(finalDurationSeconds/60)}:${Math.floor(finalDurationSeconds%60).toString().padStart(2,'0')}`, durationSeconds: finalDurationSeconds, status: LessonStatus.READY, progress: 100, voice: partVoice, captionStyle: partCaptionStyle, visualStyle: partVisualStyle, visualPacing: partPacing, musicMode: musicMode, backgroundMusicUrl: includeMusic ? selectedMusicTrack : undefined, captionTextSource: showSubtitles ? 'script' : 'overlay', visualMode: visualMode, solidColor: solidColor, thumbnailData: thumbnailData, captionPosition, captionSize, captionMode, captionColor, captionBgColor, captionOutlineColor, resources: part.resources || [], wordTimestamps: wordTimestamps, keyTakeaways, actionItems, hasImagesInDb: true, sectionTimingVersion: 2 }] });
          completedSteps++; setGenerationProgress((completedSteps / totalSteps) * 100);
      }
      setGenerationProgress(100); 
      const videoCourse: Course = { 
          id: courseId, 
          type: 'video', 
          title: details.title || 'Untitled Video', 
          headline: details.headline || 'AI Generated Video', 
          description: details.description, 
          ecoverUrl: ecoverPreview || 'https://picsum.photos/seed/video/400/600', 
          status: CourseStatus.PUBLISHED, 
          totalStudents: 0, 
          rating: 0, 
          modules: finishedModules,
          theme: theme // Ensure theme is saved
      };
      setFinalCourse(videoCourse); await delay(1000); setStep('complete');
  };
  
  const handleDownloadAssets = (partIndex?: number) => { if(finalCourse) { if (partIndex !== undefined) { const lessonId = finalCourse.modules[partIndex].lessons[0].id; exportVideoAssetsZip(finalCourse, lessonId); } else { exportVideoAssetsZip(finalCourse); } } };
  const handleDownloadProject = () => { if(finalCourse) safeExportCourse(finalCourse); };
  const exportVideo = async (partIndex: number = 0, saveToServer: boolean = false) => { 
    console.log('EXPORT VIDEO STARTED - captionMode:', captionMode, 'showSubtitles:', showSubtitles, 'saveToServer:', saveToServer);
    if (!finalCourse) return; 
    const lesson = { ...finalCourse.modules[partIndex].lessons[0] };
    if (!lesson.audioData) { alert("No audio data found. Cannot render video."); return; }
    
    lesson.captionStyle = selectedCaptionStyle;
    lesson.captionPosition = captionPosition;
    lesson.captionSize = captionSize;
    lesson.captionColor = captionColor;
    lesson.captionBgColor = captionBgColor;
    lesson.captionOutlineColor = captionOutlineColor;
    lesson.captionMode = captionMode;
    lesson.captionTextSource = showSubtitles ? 'script' : 'overlay';
    console.log('LESSON SETTINGS FOR EXPORT:', { captionMode: lesson.captionMode, captionTextSource: lesson.captionTextSource, captionStyle: lesson.captionStyle, wordTimestamps: lesson.wordTimestamps?.length || 0 });
    lesson.voice = selectedVoice;
    lesson.visualStyle = selectedVisualStyle;
    lesson.visualPacing = visualPacing;
    lesson.backgroundMusicUrl = includeMusic ? selectedMusicTrack : undefined;
    lesson.musicMode = musicMode;
    
    setIsExportingVideo(true); setExportProgress(0); 
    try { 
      const blob = await renderVideoFromLesson(lesson, (p) => setExportProgress(Math.floor(p * (saveToServer ? 0.7 : 1)))); 
      if (blob) { 
        // Always offer download
        downloadBlob(blob, `${finalCourse.title.replace(/[^a-z0-9]/gi, '_')}_Part${partIndex+1}.webm`); 
        
        // If saveToServer, upload to server and update course
        if (saveToServer) {
          setExportProgress(75);
          setStatusMessage('Uploading video to server...');
          
          // Convert blob to base64
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve) => {
            reader.onloadend = () => {
              const base64 = reader.result as string;
              resolve(base64.split(',')[1] || base64);
            };
            reader.readAsDataURL(blob);
          });
          const base64Data = await base64Promise;
          
          // Upload to server
          const uploadResponse = await fetch('/api/media/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'video', data: base64Data, mimeType: 'video/webm' })
          });
          
          if (uploadResponse.ok) {
            const { url } = await uploadResponse.json();
            console.log('Video uploaded to server:', url);
            
            // Update the course with the video URL
            const updatedCourse = { ...finalCourse };
            updatedCourse.modules[partIndex].lessons[0].renderedVideoUrl = url;
            setFinalCourse(updatedCourse);
            
            // IMPORTANT: Also update videoParts so renderedVideoUrl is preserved on future saves
            setVideoParts(prev => prev.map((p, idx) => 
              idx === partIndex ? { ...p, renderedVideoUrl: url } : p
            ));
            
            // Auto-save if handler available
            if (onSave) {
              setExportProgress(90);
              setStatusMessage('Saving course...');
              await onSave(updatedCourse);
            }
            
            setExportProgress(100);
            setStatusMessage('Video saved! It will now stream in the Student Portal.');
          } else {
            console.error('Failed to upload video:', await uploadResponse.text());
            alert('Video downloaded but failed to save to server.');
          }
        }
      } 
      else { alert("Export failed."); } 
    } catch (e) { console.error("Export failed", e); alert("Video export failed."); } 
    finally { setIsExportingVideo(false); setStatusMessage(''); } 
  };
  
  // Export image prompts to JSON for external AI generation
  const handleExportPrompts = () => {
    if (!activePart?.visuals || activePart.visuals.length === 0) {
      alert("No visuals to export. Generate a storyboard first.");
      return;
    }
    const exportData = {
      version: "1.0",
      title: activePart.title || newVideoTitle,
      exportDate: new Date().toISOString(),
      instructions: "Generate images for each prompt below. After generating, add the base64 image data to the 'imageData' field for each item. Then import this file back.",
      prompts: activePart.visuals.map((vis, idx) => ({
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
    a.download = `${(activePart.title || newVideoTitle || 'prompts').replace(/[^a-z0-9]/gi, '_')}_prompts.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import images from JSON (matching by index or id)
  const handleImportImages = () => {
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
        const newVisuals = [...activePart.visuals];
        let imported = 0;
        for (const item of data.prompts) {
          if (item.imageData && item.imageData.length > 100) {
            // Match by index first, then by id
            const targetIndex = typeof item.index === 'number' ? item.index : newVisuals.findIndex(v => v.id === item.id);
            if (targetIndex >= 0 && targetIndex < newVisuals.length) {
              // Clean up the imageData - ensure it's proper base64
              let imgData = item.imageData;
              if (!imgData.startsWith('data:') && !imgData.startsWith('/') && !imgData.startsWith('http')) {
                imgData = `data:image/png;base64,${imgData.replace(/^data:image\/\w+;base64,/, '')}`;
              }
              newVisuals[targetIndex] = { ...newVisuals[targetIndex], imageData: imgData };
              imported++;
            }
          }
        }
        updateActivePart({ visuals: newVisuals });
        alert(`Successfully imported ${imported} images.`);
      } catch (err) {
        console.error("Import error:", err);
        alert("Failed to parse JSON file. Please check the format.");
      }
    };
    input.click();
  };

  const getCaptionPreviewClass = (style: CaptionStyle) => { 
    switch(style) { 
      case 'Viral (Strike)': return "text-white text-xl font-black uppercase tracking-wide [text-shadow:-3px_-3px_0_#000,3px_-3px_0_#000,-3px_3px_0_#000,3px_3px_0_#000,0_0_20px_rgba(255,255,255,0.5)]"; 
      case 'Viral (Clean)': return "text-white text-xl font-bold drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)]"; 
      case 'Viral (Box)': return "text-white text-lg font-bold bg-black/80 px-4 py-2 rounded-lg"; 
      case 'Viral (Pop)': return "text-yellow-400 text-xl font-black uppercase [text-shadow:-2px_-2px_0_#000,2px_-2px_0_#000,-2px_2px_0_#000,2px_2px_0_#000] animate-pulse"; 
      case 'Outline': return "text-white text-lg font-bold tracking-tight text-center [text-shadow:-2px_-2px_0_#000,2px_-2px_0_#000,-2px_2px_0_#000,2px_2px_0_#000]"; 
      case 'Cinematic': return "text-amber-100 text-sm tracking-[0.3em] font-serif uppercase text-center drop-shadow-lg"; 
      case 'Modern': return "text-white text-lg font-semibold tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"; 
      case 'Minimalist': return "text-white/90 text-sm font-light tracking-widest"; 
      case 'Neon Glow': return "text-cyan-400 text-xl font-bold drop-shadow-[0_0_10px_#00ffff,0_0_20px_#00ffff,0_0_30px_#00ffff]"; 
      case 'Typewriter': return "text-green-400 font-mono text-sm bg-black/70 px-3 py-1 border border-green-500/50"; 
      case 'Karaoke': return "text-xl font-black text-yellow-400 drop-shadow-[0_2px_2px_rgba(0,0,0,1)] text-center"; 
      case 'News Ticker': return "text-white font-mono uppercase tracking-widest bg-red-600 px-3 py-1"; 
      case 'Comic Book': return "text-black font-black text-lg uppercase bg-yellow-300 px-3 py-1 rotate-[-2deg] border-2 border-black"; 
      case 'Subtitle': return "text-white text-sm bg-black/70 px-3 py-1.5 rounded"; 
      case 'Handwritten': return "text-white font-serif italic text-xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"; 
      default: return "text-white text-sm font-bold tracking-tight drop-shadow-lg"; 
    } 
  };
  const getCustomCaptionStyle = (): React.CSSProperties => { const styles: React.CSSProperties = {}; if (captionColor) styles.color = captionColor; if (captionBgColor) styles.backgroundColor = captionBgColor; if (captionOutlineColor) { styles.WebkitTextStroke = `1px ${captionOutlineColor}`; styles.textShadow = 'none'; } if (captionBgColor) { styles.padding = '4px 8px'; styles.borderRadius = '4px'; styles.display = 'inline-block'; } return styles; };

  const renderSidebar = () => {
      const currentVoice = getEffectiveSetting(selectedVoice, 'voice');
      const geminiMatch = GEMINI_VOICES.find(v => v === currentVoice);
      const elevenMatch = elevenLabsVoices.find(v => v.voice_id === currentVoice);
      const voiceDisplay = geminiMatch || elevenMatch?.name || currentVoice;

      return (
      <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 h-full overflow-y-auto space-y-6 custom-scrollbar flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Sparkles size={16} className="text-indigo-600"/> Settings</h3>
              <div className="flex bg-slate-200 p-0.5 rounded-lg text-[10px] font-bold">
                  <button onClick={() => setApplyScope('global')} className={`px-2 py-1 rounded-md transition-all flex items-center gap-1 ${applyScope === 'global' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}><Globe size={10} /> Global</button>
                  <button onClick={() => setApplyScope('current')} className={`px-2 py-1 rounded-md transition-all flex items-center gap-1 ${applyScope === 'current' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}><MousePointer2 size={10} /> Part {activePartIndex + 1}</button>
              </div>
          </div>
          
          {/* BRANDING & THEME - ADDED */}
          <div className="border-b border-slate-200 pb-4">
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
                
                {/* NEW TYPOGRAPHY CONTROLS */}
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

          {/* VOICE */}
          <div><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Voice Actor</label>
            <div className="mb-2 bg-indigo-50 p-2 rounded border border-indigo-100">
                <label className="text-[10px] font-bold text-indigo-700 uppercase block mb-1 flex items-center gap-1">Custom Voices (11Labs) <Bot size={10} /></label>
                <Input placeholder="Enter ElevenLabs API Key" type="password" value={elevenLabsApiKey} onChange={handleElevenLabsKeyChange} className="text-xs" onBlur={() => fetchElevenLabsVoices(elevenLabsApiKey)} />
                {elevenLabsVoices.length > 0 && <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1"><CheckCircle2 size={10}/> {elevenLabsVoices.length} voices active</p>}
            </div>
            <button onClick={() => setShowVoiceSelector(true)} className="w-full text-left bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm flex items-center justify-between hover:border-indigo-500 transition-all shadow-sm"><span className="truncate">{voiceDisplay}</span><ChevronDown size={16} className="text-slate-400" /></button>
            
            {/* Voice Control Settings */}
            <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Voice Controls</p>
              
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] text-slate-600">Speed</label>
                  <span className="text-[10px] font-mono text-slate-500">{voiceSpeed.toFixed(1)}x</span>
                </div>
                <input type="range" min="0.5" max="2.0" step="0.1" value={voiceSpeed} onChange={(e) => setVoiceSpeed(parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                <div className="flex justify-between text-[8px] text-slate-400 mt-0.5"><span>Slow</span><span>Fast</span></div>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] text-slate-600">Stability</label>
                  <span className="text-[10px] font-mono text-slate-500">{Math.round(voiceStability * 100)}%</span>
                </div>
                <input type="range" min="0" max="1" step="0.05" value={voiceStability} onChange={(e) => setVoiceStability(parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                <div className="flex justify-between text-[8px] text-slate-400 mt-0.5"><span>Expressive</span><span>Stable</span></div>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] text-slate-600">Clarity</label>
                  <span className="text-[10px] font-mono text-slate-500">{Math.round(voiceSimilarityBoost * 100)}%</span>
                </div>
                <input type="range" min="0" max="1" step="0.05" value={voiceSimilarityBoost} onChange={(e) => setVoiceSimilarityBoost(parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                <div className="flex justify-between text-[8px] text-slate-400 mt-0.5"><span>Natural</span><span>Clear</span></div>
              </div>
              
              <button 
                onClick={async () => {
                  setIsSamplingVoice(true);
                  try {
                    const sampleText = "Hello! This is a sample of how I will sound in your video with these settings.";
                    const audio = await generateAudio(sampleText, selectedVoice);
                    if (audio) {
                      const binary = atob(audio.audioData);
                      const array = new Uint8Array(binary.length);
                      for(let i=0; i<binary.length; i++) array[i] = binary.charCodeAt(i);
                      let blob: Blob;
                      if (audio.mimeType === 'audio/mpeg') {
                        blob = new Blob([array], {type: 'audio/mpeg'});
                      } else {
                        blob = pcmToWav(array, 24000, 1);
                      }
                      const url = URL.createObjectURL(blob);
                      if (audioPreviewRef.current) audioPreviewRef.current.pause();
                      audioPreviewRef.current = new Audio(url);
                      audioPreviewRef.current.play();
                      audioPreviewRef.current.onended = () => URL.revokeObjectURL(url);
                    }
                  } catch(e) { console.error("Sample failed", e); }
                  setIsSamplingVoice(false);
                }}
                disabled={isSamplingVoice}
                className="w-full py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-md flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
              >
                {isSamplingVoice ? <><Loader2 size={14} className="animate-spin" /> Generating...</> : <><Volume2 size={14} /> Sample Voice</>}
              </button>
              <p className="text-[8px] text-slate-400 text-center">Test current voice with these settings</p>
            </div>
          </div>

          {/* VISUALS */}
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-3 rounded-lg border border-indigo-100">
            <label className="text-xs font-bold text-slate-500 uppercase mb-2 block flex items-center gap-2">
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
          
          <div><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Visual Density</label>
            <div className="flex bg-slate-200 p-1 rounded-lg">
                <button onClick={() => handleSettingChange('visualPacing', 'Normal', setVisualPacing)} className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all ${getEffectiveSetting(visualPacing, 'visualPacing') === 'Normal' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Normal</button>
                <button onClick={() => handleSettingChange('visualPacing', 'Fast', setVisualPacing)} className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all ${getEffectiveSetting(visualPacing, 'visualPacing') === 'Fast' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Fast</button>
                <button onClick={() => handleSettingChange('visualPacing', 'Turbo', setVisualPacing)} className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all ${getEffectiveSetting(visualPacing, 'visualPacing') === 'Turbo' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Max</button>
            </div>
          </div>
          
          <div><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Visual Style</label><select className="w-full text-sm p-2 border rounded mb-2" value={getEffectiveSetting(selectedVisualStyle, 'visualStyle')} onChange={e => handleSettingChange('visualStyle', e.target.value, setSelectedVisualStyle)}>{VISUAL_STYLES.map(v => <option key={v} value={v}>{v}</option>)}</select><div className="w-full aspect-video rounded-md overflow-hidden bg-slate-200 border border-slate-300 relative group"><img src={VISUAL_STYLE_PREVIEWS[getEffectiveSetting(selectedVisualStyle, 'visualStyle')] || VISUAL_STYLE_PREVIEWS["Minimalist Flat Vector"]} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt="Style Preview" /><div className="absolute inset-0 bg-black/40 flex items-center justify-center"><span className="text-white text-[10px] font-bold uppercase tracking-wider bg-black/50 px-2 py-1 rounded border border-white/20 backdrop-blur-sm">Example</span></div></div></div>

          {/* CAPTIONS */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Captions</label>
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-lg mb-3">
              <div className="flex items-center gap-2">
                <Subtitles size={18} className="text-indigo-600" />
                <div>
                  <span className="text-sm font-semibold text-slate-700">Show Captions in Video</span>
                  <p className="text-[10px] text-slate-500">Burn subtitles into exported video</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={showSubtitles} onChange={e => setShowSubtitles(e.target.checked)} className="sr-only peer" />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
            {showSubtitles && (<>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Caption Style</label>
            <select className="w-full text-sm p-2 border rounded mb-2" value={getEffectiveSetting(selectedCaptionStyle, 'captionStyle')} onChange={e => handleSettingChange('captionStyle', e.target.value as CaptionStyle, setSelectedCaptionStyle)}>{CAPTION_STYLES.filter(s => s !== 'None').map(v => <option key={v} value={v}>{v}</option>)}</select>
            <div className="space-y-3 p-3 bg-white border border-slate-200 rounded-lg">
              <div className="bg-slate-900 rounded p-4 h-20 flex items-center justify-center overflow-hidden relative border border-slate-700 shadow-inner">
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-700 via-slate-900 to-black pointer-events-none"></div>
                <div className={getCaptionPreviewClass(getEffectiveSetting(selectedCaptionStyle, 'captionStyle'))} style={getCustomCaptionStyle()}>The quick brown fox</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Position</label>
                  <div className="flex bg-slate-100 rounded p-0.5">
                    {['Top', 'Center', 'Bottom'].map((pos) => (<button key={pos} onClick={() => setCaptionPosition(pos as CaptionPosition)} className={`flex-1 text-[9px] py-1 rounded ${captionPosition === pos ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>{pos}</button>))}
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Size</label>
                  <div className="flex bg-slate-100 rounded p-0.5">
                    {['Small', 'Medium', 'Large'].map((size) => (<button key={size} onClick={() => setCaptionSize(size as CaptionSize)} className={`flex-1 text-[9px] py-1 rounded ${captionSize === size ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>{size.charAt(0)}</button>))}
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100">
                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Mode</label>
                <div className="flex bg-slate-100 rounded p-0.5">
                  {['Overlay', 'Subtitle Bar'].map((mode) => (<button key={mode} onClick={() => setCaptionMode(mode as CaptionMode)} className={`flex-1 text-[9px] py-1 rounded ${captionMode === mode ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>{mode}</button>))}
                </div>
                <p className="text-[8px] text-slate-400 mt-1">{captionMode === 'Overlay' ? 'Captions display over video' : 'Captions in dedicated bar area'}</p>
              </div>
              <div className="pt-2 border-t border-slate-100">
                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Colors</label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[8px] text-slate-500 block mb-0.5">Text</label>
                    <div className="flex items-center gap-1"><input type="color" value={captionColor} onChange={(e) => setCaptionColor(e.target.value)} className="w-5 h-5 rounded border-none cursor-pointer" /></div>
                  </div>
                  <div>
                    <label className="text-[8px] text-slate-500 block mb-0.5">Background</label>
                    <div className="flex items-center gap-1"><input type="color" value={captionBgColor || '#000000'} onChange={(e) => setCaptionBgColor(e.target.value)} className="w-5 h-5 rounded border-none cursor-pointer" /><button onClick={() => setCaptionBgColor('')} className="text-[8px] text-slate-400 hover:text-red-500" title="Clear">×</button></div>
                  </div>
                  <div>
                    <label className="text-[8px] text-slate-500 block mb-0.5">Outline</label>
                    <div className="flex items-center gap-1"><input type="color" value={captionOutlineColor || '#000000'} onChange={(e) => setCaptionOutlineColor(e.target.value)} className="w-5 h-5 rounded border-none cursor-pointer" /><button onClick={() => setCaptionOutlineColor('')} className="text-[8px] text-slate-400 hover:text-red-500" title="Clear">×</button></div>
                  </div>
                </div>
              </div>
            </div>
            </>)}
          </div>

          {/* MUSIC */}
          <div><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Music</label><div className="flex items-center justify-between mb-2"><span className="text-sm">Background Music</span><input type="checkbox" checked={includeMusic} onChange={e => setIncludeMusic(e.target.checked)} /></div>{includeMusic && (<div className="space-y-2"><select className="w-full text-sm p-2 border rounded" value={selectedMusicTrack} onChange={e => setSelectedMusicTrack(e.target.value)}>{MUSIC_TRACKS.map(t => <option key={t.url} value={t.url}>{t.name}</option>)}</select><div className="flex bg-slate-200 p-1 rounded-lg"><button onClick={() => setMusicMode('Continuous')} className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all ${musicMode === 'Continuous' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Continuous</button><button onClick={() => setMusicMode('IntroOutro')} className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all ${musicMode === 'IntroOutro' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Intro/Outro (10s)</button></div></div>)}</div>
      </div>
      );
  };

  return (
    <div className="max-w-7xl mx-auto p-8 h-screen flex flex-col">
        {/* VOICE SELECTOR MODAL */}
        {showVoiceSelector && (
            <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowVoiceSelector(false)}>
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2"><Volume2 size={18} className="text-indigo-600"/> Select Narrator</h3>
                        <button onClick={() => { setShowVoiceSelector(false); if(audioPreviewRef.current) audioPreviewRef.current.pause(); }} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-4 custom-scrollbar">
                        {/* Gemini Voices */}
                        <div>
                            <div className="px-3 py-2 text-xs font-bold text-slate-500 uppercase">Premium AI (Gemini)</div>
                            <div className="space-y-1">
                                {GEMINI_VOICES.map(voice => (
                                    <div key={voice} className={`flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors ${getEffectiveSetting(selectedVoice, 'voice') === voice ? 'bg-indigo-50 border border-indigo-100' : ''}`}>
                                        <div className="flex items-center gap-3">
                                            <button onClick={() => handleVoicePreview(voice)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${playingVoiceId === voice ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>{playingVoiceId === voice ? <Pause size={14} fill="currentColor"/> : <Play size={14} fill="currentColor" className="ml-0.5"/>}</button>
                                            <span className={`text-sm font-medium ${getEffectiveSetting(selectedVoice, 'voice') === voice ? 'text-indigo-700' : 'text-slate-700'}`}>{voice}</span>
                                        </div>
                                        <button onClick={() => { handleSettingChange('voice', voice as VoiceOption, setSelectedVoice); setShowVoiceSelector(false); if(audioPreviewRef.current) audioPreviewRef.current.pause(); }} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${getEffectiveSetting(selectedVoice, 'voice') === voice ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'}`}>{getEffectiveSetting(selectedVoice, 'voice') === voice ? 'Selected' : 'Select'}</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {/* ElevenLabs Voices */}
                        {elevenLabsVoices.length > 0 && (
                            <div>
                                <div className="px-3 py-2 text-xs font-bold text-slate-500 uppercase flex items-center gap-2">Custom Voices (ElevenLabs) <Bot size={12}/></div>
                                <div className="space-y-1">
                                    {elevenLabsVoices.map(voice => (
                                        <div key={voice.voice_id} className={`flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors ${getEffectiveSetting(selectedVoice, 'voice') === voice.voice_id ? 'bg-indigo-50 border border-indigo-100' : ''}`}>
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => handleVoicePreview(voice.voice_id, voice.preview_url)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${playingVoiceId === voice.voice_id ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>{playingVoiceId === voice.voice_id ? <Pause size={14} fill="currentColor"/> : <Play size={14} fill="currentColor" className="ml-0.5"/>}</button>
                                                <div className="flex flex-col"><span className={`text-sm font-medium ${getEffectiveSetting(selectedVoice, 'voice') === voice.voice_id ? 'text-indigo-700' : 'text-slate-700'}`}>{voice.name}</span><span className="text-[10px] text-slate-400 font-mono">{voice.voice_id.slice(0, 8)}...</span></div>
                                            </div>
                                            <button onClick={() => { handleSettingChange('voice', voice.voice_id as VoiceOption, setSelectedVoice); setShowVoiceSelector(false); if(audioPreviewRef.current) audioPreviewRef.current.pause(); }} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${getEffectiveSetting(selectedVoice, 'voice') === voice.voice_id ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'}`}>{getEffectiveSetting(selectedVoice, 'voice') === voice.voice_id ? 'Selected' : 'Select'}</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {elevenLabsVoices.length === 0 && elevenLabsApiKey && !isFetchingVoices && <div className="p-4 text-center text-xs text-slate-400 italic">No custom voices found or API Key invalid.</div>}
                    </div>
                </div>
            </div>
        )}

        {/* Lightbox Modal */}
        {previewImageUrl && (<div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex items-center justify-center p-8 animate-fade-in" onClick={() => setPreviewImageUrl(null)}><div className="relative max-w-5xl w-full max-h-full flex items-center justify-center"><button onClick={() => setPreviewImageUrl(null)} className="absolute -top-12 right-0 text-white/50 hover:text-white transition-colors"><X size={32} /></button><img src={previewImageUrl} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl border border-white/10" /></div></div>)}

        {/* Other Modals */}
        {showRegenModal && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in"><div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden scale-100"><div className="p-6 border-b border-slate-100 flex justify-between items-center"><h3 className="font-bold text-slate-900 flex items-center gap-2"><RefreshCw size={18} className="text-indigo-600"/> Regenerate Storyboard</h3><button onClick={() => setShowRegenModal(false)}><X size={20} className="text-slate-400 hover:text-slate-600"/></button></div><div className="p-6 space-y-4"><p className="text-sm text-slate-600">Give the AI specific instructions for the new visuals.</p><TextArea placeholder="e.g. Make all scenes look like a futuristic sci-fi movie, dark lighting..." rows={3} value={regenInstructions} onChange={(e) => setRegenInstructions(e.target.value)}/></div><div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2"><Button variant="outline" onClick={() => setShowRegenModal(false)}>Cancel</Button><Button onClick={handleTriggerRegen} icon={<Wand2 size={14}/>}>Regenerate Visuals</Button></div></div></div>)}
        {showSplitModal && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in"><div className="bg-white rounded-xl shadow-xl max-w-sm w-full overflow-hidden scale-100"><div className="p-6 text-center"><div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4"><Scissors size={24}/></div><h3 className="font-bold text-xl text-slate-900 mb-2">Split Video to Series</h3><p className="text-sm text-slate-500 mb-4">Break long scripts into multiple parts.</p><TextArea className="text-xs mb-4" placeholder="Optional AI Instructions (e.g. 'Split by topic')" rows={2} value={splitInstructions} onChange={(e) => setSplitInstructions(e.target.value)} /><div className="grid grid-cols-2 gap-3 mb-2">{[2, 3, 4, 5].map(n => (<button key={n} onClick={() => handleSplitPart(n)} className="p-3 border rounded-lg hover:bg-indigo-50 hover:border-indigo-500 transition-all font-bold text-slate-700 flex flex-col items-center justify-center"><span className="text-lg">{n}</span><span className="text-[10px] uppercase font-bold text-slate-400">Parts</span></button>))}</div></div><div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-center"><Button variant="outline" onClick={() => setShowSplitModal(false)}>Cancel</Button></div></div></div>)}
        {showScriptRewriteModal && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in"><div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden scale-100"><div className="p-6 border-b border-slate-100 flex justify-between items-center"><h3 className="font-bold text-slate-900 flex items-center gap-2">{isRewritingScript ? <Loader2 size={18} className="text-indigo-600 animate-spin"/> : <Wand2 size={18} className="text-indigo-600"/>} Magic Rewrite</h3>{!isRewritingScript && <button onClick={() => setShowScriptRewriteModal(false)}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>}</div><div className="p-6 space-y-4">{isRewritingScript ? (<div className="flex flex-col items-center justify-center py-6"><div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4"><Loader2 size={32} className="text-indigo-600 animate-spin"/></div><p className="text-sm font-medium text-slate-700 text-center">{rewriteStatusMessage || "Processing..."}</p><p className="text-xs text-slate-400 mt-2">This may take a few seconds</p></div>) : (<><p className="text-sm text-slate-600">How should the AI edit this script?</p><TextArea placeholder="e.g. Make it funnier, simplify the language, or translate to Spanish..." rows={3} value={rewriteInstructions} onChange={(e) => setRewriteInstructions(e.target.value)}/></>)}</div><div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">{!isRewritingScript && <Button variant="outline" onClick={() => setShowScriptRewriteModal(false)}>Cancel</Button>}<Button onClick={handleAiRewriteScript} disabled={isRewritingScript || !rewriteInstructions} icon={isRewritingScript ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>}>{isRewritingScript ? 'Rewriting...' : 'Rewrite'}</Button></div></div></div>)}

        {/* Resource Modal - Added to VideoWizard */}
        {isAddingResource && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-bold text-slate-900">Add Resource</h3>
                        <button onClick={() => setIsAddingResource(false)}><X size={20} className="text-slate-400"/></button>
                    </div>
                    <div className="p-4 space-y-4">
                        <Input label="Resource Title" placeholder="e.g. Cheat Sheet PDF" value={newResource.title} onChange={e => setNewResource({...newResource, title: e.target.value})} />
                        
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Resource Type</label>
                            <div className="flex bg-slate-100 p-1 rounded-lg">
                                <button onClick={() => setNewResource({...newResource, type: 'link'})} className={`flex-1 py-1.5 text-xs font-medium rounded ${newResource.type === 'link' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>External Link</button>
                                <button onClick={() => setNewResource({...newResource, type: 'pdf'})} className={`flex-1 py-1.5 text-xs font-medium rounded ${newResource.type === 'pdf' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Upload File</button>
                            </div>
                        </div>

                        {newResource.type === 'link' ? (
                            <Input label="External URL" placeholder="https://..." value={newResource.url} onChange={e => setNewResource({...newResource, url: e.target.value})} />
                        ) : (
                            <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 transition-colors relative">
                                <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={handleResourceFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                <UploadCloud className="text-slate-400 mb-2" size={24} />
                                <span className="text-sm font-medium text-slate-700">{newResource.fileName || "Click to upload file"}</span>
                                <span className="text-xs text-slate-500">PDF, DOC, TXT</span>
                            </div>
                        )}
                        <Button 
                            onClick={addResourceToActivePart} 
                            disabled={!newResource.title || !newResource.url} 
                            className="w-full"
                        >
                            Add Resource
                        </Button>
                    </div>
                </div>
            </div>
        )}

        <div className="flex items-center justify-between mb-8 flex-shrink-0">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Video className="text-indigo-600"/> {initialType || 'Video'} Generator</h1>
                <p className="text-slate-500">Create single, high-impact videos with AI.</p>
            </div>
            <div className="flex gap-2">
                <div className="relative">
                    <Button variant="outline" onClick={() => setShowDownloadsMenu(!showDownloadsMenu)} icon={<Download size={16}/>}>Downloads</Button>
                    {showDownloadsMenu && (
                        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden flex flex-col py-1 animate-fade-in">
                            <button onClick={handleDownloadCover} className="text-left px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-indigo-600 flex items-center gap-2"><Image size={14}/> Download Cover Art</button>
                            <button onClick={handleDownloadScript} className="text-left px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-indigo-600 flex items-center gap-2"><FileText size={14}/> Download Script</button>
                        </div>
                    )}
                </div>
                {step !== 'complete' && onSave && (<Button variant="outline" onClick={handleSaveProgress} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Progress'}</Button>)}
                <Button variant="outline" onClick={onCancel}>Exit</Button>
            </div>
        </div>

        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            {step === 'details' && (
                <div className="p-8 w-full h-full overflow-y-auto animate-fade-in flex flex-col lg:flex-row gap-8">
                    {/* ... (Details Step Content Unchanged) ... */}
                    <div className="flex-1 space-y-6">
                        <div className="text-left mb-6"><h2 className="text-xl font-bold">Project Details</h2><p className="text-slate-500">Name your video and upload source material.</p></div>
                        {initialType === 'Slide Deck' ? (
                            <div className="border-2 border-dashed border-orange-300 bg-orange-50 rounded-xl p-6 hover:bg-orange-100 transition-colors relative flex flex-col items-center justify-center min-h-[200px]">
                                <input type="file" accept="image/*,application/pdf" multiple onChange={handleSlideUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                <div className="flex flex-col items-center gap-3">
                                    <div className="bg-orange-100 p-3 rounded-full text-orange-600"><Images size={32} /></div>
                                    <div className="text-center">
                                        <span className="font-bold text-slate-800 block">{slideDeckImages.length > 0 ? `${slideDeckImages.length} Slides Selected` : "Upload Slides (Images or PDF)"}</span>
                                        <span className="text-xs text-slate-500">Select multiple Images or a single PDF file</span>
                                    </div>
                                </div>
                                {slideDeckImages.length > 0 && (
                                    <div className="mt-4 flex gap-2 overflow-x-auto max-w-full p-2 bg-white/50 rounded-lg">
                                        {slideDeckImages.slice(0, 5).map((img, i) => (
                                            <img key={i} src={img} className="h-10 w-auto rounded shadow-sm" alt="slide"/>
                                        ))}
                                        {slideDeckImages.length > 5 && <div className="h-10 w-10 bg-slate-200 rounded flex items-center justify-center text-xs font-bold">+{slideDeckImages.length - 5}</div>}
                                    </div>
                                )}
                                <div className="absolute bottom-4 right-4 z-20">
                                    <Button size="sm" onClick={(e) => { e.stopPropagation(); analyzeSlidesAndGenerate(); }} disabled={slideDeckImages.length === 0 || isAnalyzingSlides} icon={isAnalyzingSlides ? <Loader2 size={14} className="animate-spin"/> : <Wand2 size={14}/>}>
                                        {isAnalyzingSlides ? 'Analyzing...' : 'Generate from Slides'}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 hover:bg-slate-50 transition-colors relative flex items-center justify-center min-h-[160px]"><input type="file" accept=".pdf,.txt,.md" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" /><div className="flex flex-col items-center gap-3"><div className="bg-indigo-50 p-3 rounded-full">{file ? <CheckCircle2 size={32} className="text-emerald-500" /> : <UploadCloud size={32} className="text-indigo-400" />}</div><div className="text-center"><span className="font-bold text-slate-700 block">{file ? file.name : "Upload Source Document"}</span><span className="text-xs text-slate-500">{file ? "File ready for analysis" : "Supports PDF, TXT, MD (Optional)"}</span></div></div><div className="absolute bottom-4 right-4 z-20"><Button size="sm" variant={file || details.title ? "primary" : "secondary"} className="shadow-md" onClick={(e) => { e.stopPropagation(); generateMetadata('all'); }} disabled={isGeneratingMeta !== null} icon={isGeneratingMeta === 'all' ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>}>{isGeneratingMeta === 'all' ? 'Drafting...' : 'Auto-Fill Details'}</Button></div></div>
                        )}
                        <Input label="Video Title" value={details.title} onChange={e => setDetails({...details, title: e.target.value})} placeholder="e.g. Product Launch Teaser" labelAction={<button onClick={() => generateMetadata('title')} disabled={isGeneratingMeta !== null} className="text-xs text-indigo-600 font-bold hover:bg-indigo-50 px-2 py-1 rounded flex items-center gap-1 transition-colors">{isGeneratingMeta === 'title' ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>} AI Rewrite</button>} />
                        <Input label="Subtitle / Headline" value={details.headline} onChange={e => setDetails({...details, headline: e.target.value})} placeholder="e.g. Master the basics in 5 minutes" labelAction={<button onClick={() => generateMetadata('headline')} disabled={isGeneratingMeta !== null} className="text-xs text-indigo-600 font-bold hover:bg-indigo-50 px-2 py-1 rounded flex items-center gap-1 transition-colors">{isGeneratingMeta === 'headline' ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>} AI Generate</button>} />
                        <TextArea label="Description / Context" value={details.description} onChange={e => setDetails({...details, description: e.target.value})} placeholder="What is this video about?" labelAction={<button onClick={() => generateMetadata('description')} disabled={isGeneratingMeta !== null} className="text-xs text-indigo-600 font-bold hover:bg-indigo-50 px-2 py-1 rounded flex items-center gap-1 transition-colors">{isGeneratingMeta === 'description' ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>} AI Draft</button>} />
                        <div className="flex items-center gap-2 pt-2 pb-2"><input type="checkbox" id="useCoverAsThumb" checked={useCoverAsThumbnail} onChange={(e) => setUseCoverAsThumbnail(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" /><label htmlFor="useCoverAsThumb" className="text-sm text-slate-600 font-medium cursor-pointer">Use Cover Image as Video Thumbnail / Player Poster</label></div>
                        <div className="flex justify-end pt-4 gap-2">{onSave && <Button variant="secondary" onClick={handleSaveProgress} disabled={isSaving}>Save Changes</Button>}<Button onClick={() => setStep('strategy')} disabled={!details.title}>Next: Strategy</Button></div>
                    </div>
                    <div className="w-full lg:w-80 space-y-6 bg-slate-50 p-6 rounded-xl border border-slate-200">
                         <h3 className="font-bold text-slate-700">Video Thumbnail / Cover</h3>
                         <div className="flex bg-slate-200 p-1 rounded-lg"><button onClick={() => setEcoverMode('upload')} className={`flex-1 py-1.5 text-xs font-medium rounded-md ${ecoverMode === 'upload' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Upload</button><button onClick={() => setEcoverMode('generate')} className={`flex-1 py-1.5 text-xs font-medium rounded-md ${ecoverMode === 'generate' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>AI Gen</button></div>
                         {ecoverMode === 'upload' && (<div className="relative border-2 border-dashed border-slate-300 rounded-lg h-40 flex items-center justify-center hover:bg-slate-100 transition-colors"><input type="file" accept="image/*" onChange={handleEcoverChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" /><div className="text-center text-slate-400"><Upload size={20} className="mx-auto mb-2"/><span className="text-xs">Click to Upload</span></div></div>)}
                         {ecoverMode === 'generate' && (<div className="space-y-3"><TextArea label="AI Instructions" placeholder="e.g. Bold text, red background" className="text-xs" value={ecoverInstructions} onChange={(e) => setEcoverInstructions(e.target.value)} /><Button size="sm" onClick={generateAIECover} isLoading={isGeneratingEcover} className="w-full" icon={<Wand2 size={14} />}>Generate</Button></div>)}
                         {ecoverPreview && (<div className="rounded-lg overflow-hidden border border-slate-200 shadow-md"><img src={ecoverPreview} className="w-full h-auto" alt="Preview" /></div>)}
                    </div>
                </div>
            )}

            {step === 'strategy' && (
                 <div className="p-8 max-w-3xl mx-auto w-full h-full overflow-y-auto animate-fade-in space-y-8 relative">
                     {/* Loading Overlay with Timing Stats */}
                     {isProcessing && (
                         <div className="absolute inset-0 bg-white/95 z-50 flex flex-col items-center justify-center p-8">
                             <Loader2 size={48} className="animate-spin text-indigo-600 mb-4" />
                             <h3 className="text-xl font-bold text-slate-900 mb-2">{statusMessage}</h3>
                             {storyboardProgress && <p className="text-sm text-indigo-600 mb-4">{storyboardProgress}</p>}
                             <div className="bg-slate-100 rounded-xl p-6 w-full max-w-md space-y-3">
                                 <div className="flex justify-between items-center">
                                     <span className="text-sm text-slate-600">Elapsed Time</span>
                                     <span className="text-lg font-mono font-bold text-indigo-600">{Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')}</span>
                                 </div>
                                 {scriptGenTime !== null && (
                                     <div className="flex justify-between items-center text-emerald-600">
                                         <span className="text-sm flex items-center gap-2"><CheckCircle2 size={14}/> Script Generated</span>
                                         <span className="font-mono">{scriptGenTime}s</span>
                                     </div>
                                 )}
                                 {storyboardGenTime !== null && (
                                     <div className="flex justify-between items-center text-emerald-600">
                                         <span className="text-sm flex items-center gap-2"><CheckCircle2 size={14}/> Storyboard Created</span>
                                         <span className="font-mono">{storyboardGenTime}s</span>
                                     </div>
                                 )}
                             </div>
                         </div>
                     )}
                     <div className="text-center"><h2 className="text-xl font-bold">Video Strategy</h2><p className="text-slate-500">Choose how to create your video.</p></div>
                     
                     {/* VIDEO SOURCE MODE CHOICE */}
                     <div className="space-y-3">
                         <label className="block text-sm font-bold text-slate-700">How would you like to create your video?</label>
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                             <button 
                                 onClick={() => setVideoSourceMode('ai_generated')} 
                                 className={`p-5 rounded-xl border-2 text-left transition-all ${videoSourceMode === 'ai_generated' ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-indigo-300'}`}
                             >
                                 <div className="flex items-center gap-3 mb-2">
                                     <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${videoSourceMode === 'ai_generated' ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300'}`}>
                                         {videoSourceMode === 'ai_generated' && <div className="w-2 h-2 rounded-full bg-white"/>}
                                     </div>
                                     <Wand2 size={20} className={videoSourceMode === 'ai_generated' ? 'text-indigo-600' : 'text-slate-400'}/>
                                 </div>
                                 <div className="font-bold text-slate-900">AI from eBook</div>
                                 <div className="text-xs text-slate-500 mt-1">Upload a PDF and let AI write the script</div>
                             </button>
                             <button 
                                 onClick={() => setVideoSourceMode('own_script')} 
                                 className={`p-5 rounded-xl border-2 text-left transition-all ${videoSourceMode === 'own_script' ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300'}`}
                             >
                                 <div className="flex items-center gap-3 mb-2">
                                     <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${videoSourceMode === 'own_script' ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`}>
                                         {videoSourceMode === 'own_script' && <div className="w-2 h-2 rounded-full bg-white"/>}
                                     </div>
                                     <FileText size={20} className={videoSourceMode === 'own_script' ? 'text-blue-600' : 'text-slate-400'}/>
                                 </div>
                                 <div className="font-bold text-slate-900">Use My Script</div>
                                 <div className="text-xs text-slate-500 mt-1">Paste your own script word-for-word</div>
                             </button>
                             <button 
                                 onClick={() => setVideoSourceMode('hosted')} 
                                 className={`p-5 rounded-xl border-2 text-left transition-all ${videoSourceMode === 'hosted' ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-emerald-300'}`}
                             >
                                 <div className="flex items-center gap-3 mb-2">
                                     <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${videoSourceMode === 'hosted' ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'}`}>
                                         {videoSourceMode === 'hosted' && <div className="w-2 h-2 rounded-full bg-white"/>}
                                     </div>
                                     <LinkIcon size={20} className={videoSourceMode === 'hosted' ? 'text-emerald-600' : 'text-slate-400'}/>
                                 </div>
                                 <div className="font-bold text-slate-900">Hosted Video</div>
                                 <div className="text-xs text-slate-500 mt-1">Paste a URL to an existing video</div>
                             </button>
                         </div>
                     </div>

                     {/* OWN SCRIPT INPUT */}
                     {videoSourceMode === 'own_script' && (
                         <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 space-y-4">
                             <div>
                                 <label className="block text-sm font-bold text-blue-800 mb-2">Your Script (Word for Word)</label>
                                 <textarea 
                                     className="w-full h-64 px-4 py-3 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white resize-none font-mono"
                                     placeholder="Paste your complete script here. This text will be used exactly as written for the voiceover..."
                                     value={ownScriptText}
                                     onChange={(e) => setOwnScriptText(e.target.value)}
                                 />
                                 <p className="text-xs text-blue-600 mt-2">This script will be used word-for-word. AI will only generate visuals to match your words.</p>
                             </div>
                             {ownScriptText.length > 50 && (
                                 <div className="flex items-center justify-between text-sm text-blue-700 bg-blue-100 p-3 rounded-lg">
                                     <div className="flex items-center gap-2">
                                         <CheckCircle2 size={16}/> Script ready ({ownScriptText.split(/\s+/).length} words)
                                     </div>
                                     <span className="text-xs text-blue-500">~{Math.ceil(ownScriptText.split(/\s+/).length / 150)} min video</span>
                                 </div>
                             )}
                         </div>
                     )}

                     {/* HOSTED VIDEO URL INPUT */}
                     {videoSourceMode === 'hosted' && (
                         <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 space-y-4">
                             <div>
                                 <label className="block text-sm font-bold text-emerald-800 mb-2">Video URL</label>
                                 <input 
                                     type="url"
                                     className="w-full px-4 py-3 text-sm border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                                     placeholder="https://example.com/your-video.mp4"
                                     value={hostedVideoUrl}
                                     onChange={(e) => setHostedVideoUrl(e.target.value)}
                                 />
                                 <p className="text-xs text-emerald-600 mt-2">Paste a direct link to your video file (MP4, WebM, etc.)</p>
                             </div>
                             {hostedVideoUrl && (
                                 <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-100 p-3 rounded-lg">
                                     <CheckCircle2 size={16}/> Video URL ready - click Continue to save
                                 </div>
                             )}
                         </div>
                     )}

                     {/* AI GENERATION OPTIONS - Only show when ai_generated mode */}
                     {videoSourceMode === 'ai_generated' && (
                         <>
                             <div className="grid grid-cols-3 gap-4">{[{id: 'strict', label: 'Strict Adaptation', desc: 'Stick to source text.'}, {id: 'hybrid', label: 'Hybrid Enhancement', desc: 'Add examples & flow.'}, {id: 'creative', label: 'Creative Expansion', desc: 'Use source as inspo.'}].map((m: any) => (<button key={m.id} onClick={() => setStrategy(m.id)} className={`p-4 rounded-xl border text-left transition-all ${strategy === m.id ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200 hover:border-indigo-200'}`}><div className="font-bold text-slate-900">{m.label}</div><div className="text-xs text-slate-500 mt-1">{m.desc}</div></button>))}</div>
                             <div><label className="block text-sm font-bold text-slate-700 mb-2">Target Duration</label><div className="grid grid-cols-1 md:grid-cols-2 gap-3">{VIDEO_DURATIONS.map(d => (<button key={d.value} onClick={() => setDurationMode(d.value)} className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${durationMode === d.value ? 'bg-emerald-50 border-emerald-500 text-emerald-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}><div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${durationMode === d.value ? 'border-emerald-500' : 'border-slate-300'}`}>{durationMode === d.value && <div className="w-2 h-2 rounded-full bg-emerald-50"/>}</div><span className="text-sm font-medium">{d.label}</span></button>))}</div></div>
                             <TextArea label="Specific Instructions" value={strategyInstructions} onChange={e => setStrategyInstructions(e.target.value)} placeholder="e.g. Use a humorous tone, focus on the second paragraph..." />
                             <div><label className="block text-sm font-bold text-slate-700 mb-2">AI Model</label><div className="grid grid-cols-3 gap-3">{AI_MODELS.map(m => (<button key={m.id} onClick={() => setSelectedAIModel(m.id)} className={`p-3 rounded-lg border text-left transition-all ${selectedAIModel === m.id ? 'bg-purple-50 border-purple-500 ring-1 ring-purple-500' : 'border-slate-200 hover:border-purple-200'}`}><div className="font-bold text-sm text-slate-900">{m.label}</div><div className="text-xs text-slate-500 mt-1">{m.desc}</div></button>))}</div></div>
                             {initialType === 'Training' && (<label className="flex items-center gap-3 p-4 border border-slate-200 rounded-xl cursor-pointer hover:bg-amber-50 hover:border-amber-300 transition-all"><input type="checkbox" checked={isFaithBased} onChange={e => setIsFaithBased(e.target.checked)} className="w-5 h-5 rounded text-amber-600 focus:ring-amber-500" /><div><span className="font-bold text-slate-900">Faith-Based Script</span><span className="text-xs text-slate-500 block mt-0.5">Include references to God and faith throughout the training</span></div></label>)}
                         </>
                     )}

                     <div className="flex justify-between pt-4 border-t border-slate-100">
                         <Button variant="outline" onClick={() => setStep('details')}>Back</Button>
                         <div className="flex gap-2">
                             {onSave && <Button variant="secondary" onClick={handleSaveProgress} disabled={isSaving}>Save Changes</Button>}
                             {videoSourceMode === 'ai_generated' && (
                                 <Button onClick={handleGenerateScript} isLoading={isProcessing} icon={<Wand2 size={16}/>}>Generate Script</Button>
                             )}
                             {videoSourceMode === 'own_script' && (
                                 <Button onClick={handleOwnScriptContinue} disabled={ownScriptText.length < 50} isLoading={isProcessing} icon={<Video size={16}/>}>Generate Visuals</Button>
                             )}
                             {videoSourceMode === 'hosted' && (
                                 <Button onClick={handleHostedVideoSave} disabled={!hostedVideoUrl} icon={<CheckCircle2 size={16}/>}>Continue</Button>
                             )}
                         </div>
                     </div>
                 </div>
            )}

            {step === 'editor' && (
                <div className="flex flex-col h-full animate-fade-in relative">
                    {/* Loading Overlay for Editor (Redo All, etc.) */}
                    {isProcessing && (
                        <div className="absolute inset-0 bg-white/95 z-50 flex flex-col items-center justify-center p-8">
                            <Loader2 size={48} className="animate-spin text-indigo-600 mb-4" />
                            <h3 className="text-xl font-bold text-slate-900 mb-2">{statusMessage || "Processing..."}</h3>
                            {storyboardProgress && <p className="text-sm text-indigo-600 mb-4">{storyboardProgress}</p>}
                            <div className="bg-slate-100 rounded-xl p-6 w-full max-w-md space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-600">Please wait...</span>
                                    <Loader2 size={16} className="animate-spin text-indigo-400"/>
                                </div>
                            </div>
                        </div>
                    )}
                    {/* Top Bar for Part Switcher */}
                    <div className="px-6 py-2 border-b border-slate-200 bg-slate-50 flex items-center gap-2 overflow-x-auto">
                        {videoParts.map((part, idx) => (
                            <button key={part.id} onClick={() => setActivePartIndex(idx)} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-colors ${activePartIndex === idx ? 'bg-white border border-slate-200 text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>{part.title || `Part ${idx + 1}`}</button>
                        ))}
                        <button onClick={() => setShowAddVideoModal(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors">
                            <Plus size={14}/> Add New Video
                        </button>
                    </div>
                    
                    <div className="flex-1 flex overflow-hidden">
                        {/* Main Editor */}
                        <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
                            <div className="flex justify-between items-center bg-white z-10 sticky top-0 pb-4">
                                <div className="flex-1 flex items-center gap-3">
                                    <Input value={activePart.title} onChange={e => updateActivePart({ title: e.target.value })} className="font-bold text-lg border-none p-0 focus:ring-0" placeholder="Part Title" />
                                    <button
                                        onClick={() => updateActivePart({ awardsCertificate: !activePart.awardsCertificate })}
                                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                            activePart.awardsCertificate 
                                                ? 'bg-amber-100 text-amber-700 border border-amber-300' 
                                                : 'bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-200'
                                        }`}
                                        title={activePart.awardsCertificate ? "This video counts toward certificate" : "Click to make this video count toward certificate"}
                                    >
                                        <Award size={14} className={activePart.awardsCertificate ? 'text-amber-500' : ''} />
                                        {activePart.awardsCertificate ? 'Certificate' : 'No Certificate'}
                                    </button>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setIsAddingResource(true)} icon={<LinkIcon size={14}/>}>Add Resource</Button>
                                    <Button variant="outline" size="sm" onClick={() => setShowSplitModal(true)} icon={<Scissors size={14}/>}>Split</Button>
                                    <Button variant="outline" size="sm" onClick={() => setShowScriptRewriteModal(true)} icon={<Wand2 size={14}/>}>Magic Rewrite</Button>
                                    <Button variant="secondary" size="sm" onClick={handleBulkGenerateImages} disabled={generatingImageIds.size > 0} icon={generatingImageIds.size > 0 ? <Loader2 size={14} className="animate-spin"/> : <ImageIcon size={14}/>}>Generate Images</Button>
                                    <Button 
                                        variant="secondary" 
                                        size="sm" 
                                        onClick={handleGenerateAudioOnly} 
                                        disabled={isGeneratingAudioOnly || !activePart.script}
                                        icon={isGeneratingAudioOnly ? <Loader2 size={14} className="animate-spin"/> : <Volume2 size={14}/>}
                                        className={activePart.audioData ? "bg-emerald-100 text-emerald-700 border-emerald-300" : ""}
                                    >
                                        {activePart.audioData ? "Regenerate Audio" : "Generate Audio"}
                                    </Button>
                                </div>
                            </div>

                            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Script Editor */}
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase flex justify-between items-center">
                                        <span>Script / Narration</span>
                                        <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500">{(activePart.script || "").split(' ').length} words</span>
                                    </label>
                                    <textarea className="w-full h-[500px] p-4 rounded-xl border border-slate-200 text-slate-700 leading-relaxed text-sm focus:ring-2 focus:ring-indigo-100 outline-none resize-none font-mono" value={activePart.script} onChange={e => updateActivePart({ script: e.target.value })} placeholder="Enter video script here..." />
                                </div>

                                {/* Visuals Editor */}
                                <div className="space-y-4">
                                    <div className="flex justify-between items-end">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Storyboard Scenes</label>
                                        <div className="flex gap-2">
                                            <button onClick={async () => {
                                                if (!initialCourse?.id) return alert('No course ID');
                                                try {
                                                    setStatusMessage('Checking database for images...');
                                                    setIsProcessing(true);
                                                    
                                                    // First get metadata (small request - just indices)
                                                    const metadata = await api.lessonImages.getMetadata(initialCourse.id, activePart.id);
                                                    if (!metadata || metadata.length === 0) {
                                                        alert('No images found in database for this lesson.\n\nCourse ID: ' + initialCourse.id + '\nLesson ID: ' + activePart.id);
                                                        return;
                                                    }
                                                    
                                                    console.log(`Found ${metadata.length} images in database, loading one at a time...`);
                                                    
                                                    // Sort metadata by visualIndex
                                                    const sortedMeta = [...metadata].sort((a, b) => a.visualIndex - b.visualIndex);
                                                    
                                                    // Load images one at a time to avoid timeout
                                                    const loadedImages: Array<{visualIndex: number, imageData: string, prompt?: string}> = [];
                                                    for (let i = 0; i < sortedMeta.length; i++) {
                                                        setStatusMessage(`Loading image ${i + 1} of ${sortedMeta.length}...`);
                                                        const img = await api.lessonImages.getOne(initialCourse.id, activePart.id, sortedMeta[i].visualIndex);
                                                        if (img) {
                                                            loadedImages.push(img);
                                                        }
                                                    }
                                                    
                                                    if (loadedImages.length === 0) {
                                                        alert('Failed to load any images from database');
                                                        return;
                                                    }
                                                    
                                                    console.log(`Successfully loaded ${loadedImages.length} images`);
                                                    
                                                    // Create new visuals from loaded images
                                                    const duration = activePart.durationSeconds || loadedImages.length * 10;
                                                    const timePerVisual = duration / loadedImages.length;
                                                    const newVisuals = loadedImages.map((img, idx) => ({
                                                        id: `vis-db-${idx}`,
                                                        type: 'illustration' as const,
                                                        prompt: img.prompt || activePart.visuals[idx]?.prompt || '',
                                                        imageData: img.imageData,
                                                        startTime: idx * timePerVisual,
                                                        endTime: (idx + 1) * timePerVisual,
                                                        zoomDirection: (idx % 2 === 0 ? 'in' : 'out') as 'in' | 'out',
                                                        overlayText: activePart.visuals[idx]?.overlayText || '',
                                                        scriptText: activePart.visuals[idx]?.scriptText || ''
                                                    }));
                                                    updateActivePart({ visuals: newVisuals });
                                                    alert(`Loaded ${newVisuals.length} images from database`);
                                                } catch (err: any) {
                                                    console.error('Failed to load images:', err);
                                                    alert('Failed to load images from database:\n' + (err.message || err));
                                                } finally {
                                                    setIsProcessing(false);
                                                    setStatusMessage('');
                                                }
                                            }} className="text-xs text-orange-600 hover:bg-orange-50 px-2 py-1 rounded flex items-center gap-1" title="Load images from database"><Download size={12}/> Load from DB</button>
                                            <button onClick={handleExportPrompts} className="text-xs text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded flex items-center gap-1" title="Export prompts to JSON for external AI"><Download size={12}/> Export Prompts</button>
                                            <button onClick={handleImportImages} className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded flex items-center gap-1" title="Import images from JSON"><Upload size={12}/> Import Images</button>
                                            <button onClick={() => setShowRegenModal(true)} className="text-xs text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded flex items-center gap-1"><RefreshCw size={12}/> Redo All</button>
                                            <button onClick={() => updateActivePart({ visuals: [...activePart.visuals, { id: `v-new-${Date.now()}`, prompt: "New Scene", imageData: "", type: "illustration", overlayText: "", scriptText: "", startTime: 0, endTime: 0 }] })} className="text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded flex items-center gap-1"><Plus size={12}/> Add Scene</button>
                                        </div>
                                    </div>
                                    {/* Image Generation Progress */}
                                    {(generatingImageIds.size > 0 || imageGenTime !== null) && (
                                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-sm font-medium text-indigo-800">
                                                    {generatingImageIds.size > 0 ? (
                                                        <span className="flex items-center gap-2">
                                                            <Loader2 size={14} className="animate-spin"/>
                                                            Generating Images: {imagesGenerated}/{totalImagesToGenerate}
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-2 text-emerald-700">
                                                            <CheckCircle2 size={14}/>
                                                            Images Complete
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="text-xs font-mono text-indigo-600">
                                                    {generatingImageIds.size > 0 ? `${Math.floor(elapsedTime / 60)}:${(elapsedTime % 60).toString().padStart(2, '0')}` : `${imageGenTime}s`}
                                                </span>
                                            </div>
                                            {totalImagesToGenerate > 0 && (
                                                <div className="w-full bg-indigo-100 rounded-full h-2">
                                                    <div 
                                                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300" 
                                                        style={{ width: `${(imagesGenerated / totalImagesToGenerate) * 100}%` }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                        {activePart.visuals.length === 0 && (
                                            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg text-slate-400">
                                                <p>No visuals yet.</p>
                                                <Button size="sm" variant="outline" className="mt-2" onClick={() => generateStoryboard(activePart.script)}>Auto-Generate Storyboard</Button>
                                            </div>
                                        )}
                                        {activePart.visuals.map((vis, idx) => (
                                            <div key={vis.id} className="flex gap-4 p-3 border border-slate-200 rounded-lg bg-white hover:shadow-sm transition-shadow group">
                                                <div className={`w-32 bg-slate-100 rounded-md overflow-hidden flex-shrink-0 relative group/img cursor-pointer border border-slate-100 ${targetAspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-video'}`}>
                                                    {vis.imageData ? (
                                                        <>
                                                            {/* Container for image + subtitle bar preview */}
                                                            <div className="w-full h-full flex flex-col" onClick={() => setPreviewImageUrl(vis.imageData.startsWith('/media/') || vis.imageData.startsWith('/objects/') || vis.imageData.startsWith('http') || vis.imageData.startsWith('data:') ? vis.imageData : `data:image/png;base64,${vis.imageData}`)}>
                                                                {/* Video content area - reduced when subtitle bar is enabled */}
                                                                <div className={`${captionMode === 'Subtitle Bar' && showSubtitles && getEffectiveSetting(selectedCaptionStyle, 'captionStyle') !== 'None' ? 'flex-[88.89]' : 'flex-1'} relative overflow-hidden`}>
                                                                    <img src={vis.imageData.startsWith('/media/') || vis.imageData.startsWith('/objects/') || vis.imageData.startsWith('http') || vis.imageData.startsWith('data:') ? vis.imageData : `data:image/png;base64,${vis.imageData}`} className="w-full h-full object-contain" />
                                                                </div>
                                                                {/* Subtitle bar - 11.11% of height (120/1080 ≈ 11.11%) */}
                                                                {captionMode === 'Subtitle Bar' && showSubtitles && getEffectiveSetting(selectedCaptionStyle, 'captionStyle') !== 'None' && (
                                                                    <div 
                                                                        className="flex-[11.11] relative border-t border-white/30"
                                                                        style={{ backgroundColor: captionBgColor || '#1a1a2e' }}
                                                                    >
                                                                        {vis.scriptText && (
                                                                            <div className="absolute inset-0 flex items-center justify-center px-1">
                                                                                <span className="text-white text-[6px] font-medium text-center line-clamp-2 leading-tight" style={{ color: captionColor }}>
                                                                                    {vis.scriptText.substring(0, 50)}{vis.scriptText.length > 50 ? '...' : ''}
                                                                                </span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="absolute top-1 right-1 flex gap-1">
                                                                <button onClick={(e) => { e.stopPropagation(); generateImageForVisual(activePart.id, vis.id); }} className="bg-indigo-600 text-white p-1.5 rounded hover:bg-indigo-700 shadow-sm" title="Regenerate Image"><RefreshCw size={12}/></button>
                                                                <label className="bg-slate-700 text-white p-1.5 rounded hover:bg-slate-800 cursor-pointer shadow-sm" title="Upload Image">
                                                                    <Upload size={12}/>
                                                                    <input type="file" accept="image/*" className="hidden" onClick={(e) => e.stopPropagation()} onChange={(e) => handleVisualImageUpload(e, activePart.id, vis.id)} />
                                                                </label>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 relative">
                                                            {generatingImageIds.has(vis.id) ? <Loader2 size={20} className="animate-spin text-indigo-500"/> : <ImageIcon size={20} className="opacity-50"/>}
                                                            {/* Action buttons for empty images */}
                                                            <div className="absolute top-1 right-1 flex gap-1">
                                                                <button onClick={(e) => { e.stopPropagation(); generateImageForVisual(activePart.id, vis.id); }} className="bg-indigo-600 text-white p-1.5 rounded hover:bg-indigo-700 shadow-sm" title="Generate Image"><RefreshCw size={12}/></button>
                                                                <label className="bg-slate-700 text-white p-1.5 rounded hover:bg-slate-800 cursor-pointer shadow-sm" title="Upload Image">
                                                                    <Upload size={12}/>
                                                                    <input type="file" accept="image/*" className="hidden" onClick={(e) => e.stopPropagation()} onChange={(e) => handleVisualImageUpload(e, activePart.id, vis.id)} />
                                                                </label>
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="absolute top-1 left-1 bg-black/50 text-white text-[9px] px-1 rounded">{idx + 1}</div>
                                                </div>
                                                <div className="flex-1 space-y-2 min-w-0">
                                                    <input className="w-full text-xs font-medium border-b border-transparent focus:border-indigo-300 outline-none bg-transparent" value={vis.prompt} onChange={e => { const newVisuals = [...activePart.visuals]; newVisuals[idx].prompt = e.target.value; updateActivePart({ visuals: newVisuals }); }} placeholder="Visual Description..." />
                                                    <input className="w-full text-xs text-indigo-600 border-b border-transparent focus:border-indigo-300 outline-none bg-transparent font-bold" value={vis.overlayText} onChange={e => { const newVisuals = [...activePart.visuals]; newVisuals[idx].overlayText = e.target.value; updateActivePart({ visuals: newVisuals }); }} placeholder="Overlay Text..." />
                                                    <textarea className="w-full text-[10px] text-slate-500 resize-none bg-slate-50 p-1 rounded border-none focus:ring-0" rows={2} value={vis.scriptText} onChange={e => { const newVisuals = [...activePart.visuals]; newVisuals[idx].scriptText = e.target.value; updateActivePart({ visuals: newVisuals }); }} placeholder="Spoken text for this scene..." />
                                                </div>
                                                <button onClick={() => { const newVisuals = activePart.visuals.filter((_, i) => i !== idx); updateActivePart({ visuals: newVisuals }); }} className="text-slate-300 hover:text-red-500 self-start opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14}/></button>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    {/* Resources Section - NEW */}
                                    {activePart.resources && activePart.resources.length > 0 && (
                                        <div className="mt-6 pt-6 border-t border-slate-100">
                                            <label className="text-xs font-bold text-slate-500 uppercase mb-3 block">Attached Resources</label>
                                            <div className="space-y-2">
                                                {activePart.resources.map((res, rIdx) => (
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
                                                        <button onClick={() => removeResourceFromActivePart(rIdx)} className="text-slate-400 hover:text-red-500"><Trash2 size={14}/></button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Sidebar */}
                        <div className="w-80 border-l border-slate-200 flex-shrink-0">
                            {renderSidebar()}
                        </div>
                    </div>
                    
                    <div className="p-4 border-t border-slate-200 bg-white flex justify-end gap-3">
                        <Button variant="outline" onClick={() => setStep('strategy')}>Back</Button>
                        <Button onClick={handleRender} icon={<Video size={16}/>}>Render Final Video</Button>
                    </div>
                </div>
            )}

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
                        <h2 className="text-2xl font-bold text-slate-900 mb-2">Rendering Video</h2>
                        <p className="text-slate-500 mb-6 font-medium animate-pulse">{statusMessage || "Processing..."}</p>
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-left space-y-2 text-sm text-slate-600">
                            <div className="flex items-center gap-3">{generationProgress > 10 ? <CheckCircle2 size={16} className="text-emerald-500"/> : <Loader2 size={16} className="animate-spin text-indigo-500"/>}<span>Generating Voiceovers (Multi-Part)</span></div>
                            <div className="flex items-center gap-3">{generationProgress > 40 ? <CheckCircle2 size={16} className="text-emerald-500"/> : <span className="w-4 h-4 rounded-full border border-slate-300"/>}<span>Rendering Visual Scenes</span></div>
                            <div className="flex items-center gap-3">{generationProgress > 80 ? <CheckCircle2 size={16} className="text-emerald-500"/> : <span className="w-4 h-4 rounded-full border border-slate-300"/>}<span>Final Assembly</span></div>
                        </div>
                    </div>
                </div>
            )}

            {step === 'complete' && (
                <div className="flex-1 flex flex-col items-center p-8 animate-fade-in bg-slate-50 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-xl p-8 max-w-4xl w-full text-center my-auto">
                        <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6"><CheckCircle2 size={40}/></div>
                        <h2 className="text-3xl font-bold text-slate-900 mb-2">Video Generation Complete!</h2>
                        <p className="text-slate-500 mb-8">Your video is ready. You can download the MP4s below or save the project.</p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-left">
                            {/* Project Backup */}
                            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 hover:border-indigo-300 transition-all group">
                                <FileJson className="text-indigo-500 mb-4" size={32}/>
                                <h3 className="font-bold text-slate-900 mb-1">Project Data</h3>
                                <p className="text-xs text-slate-500 mb-4">Editable JSON project file.</p>
                                <Button size="sm" variant="outline" className="w-full" onClick={handleDownloadProject}>Download JSON</Button>
                            </div>

                            {/* Source Assets */}
                            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 hover:border-blue-300 transition-all group">
                                <FileArchive className="text-blue-500 mb-4" size={32}/>
                                <h3 className="font-bold text-slate-900 mb-1">Source Assets</h3>
                                <p className="text-xs text-slate-500 mb-4">ZIP with Images & Audio.</p>
                                <Button size="sm" variant="outline" className="w-full" onClick={() => handleDownloadAssets()}>Download ZIP</Button>
                            </div>

                            {/* Cover Art */}
                            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 hover:border-purple-300 transition-all group">
                                <Image className="text-purple-500 mb-4" size={32}/>
                                <h3 className="font-bold text-slate-900 mb-1">Cover Art</h3>
                                <p className="text-xs text-slate-500 mb-4">High-res Thumbnail.</p>
                                <Button size="sm" variant="outline" className="w-full" onClick={handleDownloadCover}>Download PNG</Button>
                            </div>

                            {/* Full Video - Render on Demand */}
                            <div className="bg-emerald-50 p-6 rounded-xl border border-emerald-200 hover:border-emerald-400 transition-all group shadow-sm md:col-span-1">
                                <FileVideo className="text-emerald-600 mb-4" size={32}/>
                                <h3 className="font-bold text-slate-900 mb-1">Full Video</h3>
                                <p className="text-xs text-emerald-800 mb-4">Render & save for streaming</p>
                                
                                {finalCourse?.modules.map((m, i) => (
                                    <div key={m.id} className="space-y-2 mb-3">
                                        {/* Primary action: Render & Save */}
                                        <Button 
                                            size="sm" 
                                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white border-none" 
                                            onClick={() => exportVideo(i, true)}
                                            disabled={isExportingVideo}
                                            icon={isExportingVideo ? <Loader2 size={14} className="animate-spin"/> : <Video size={14}/>}
                                        >
                                            {isExportingVideo ? `${statusMessage || 'Rendering'} ${Math.round(exportProgress)}%` : finalCourse.modules.length > 1 ? `Render Part ${i+1}` : `Render & Save`}
                                        </Button>
                                        {/* Secondary: Download only */}
                                        <Button 
                                            size="sm" 
                                            variant="outline"
                                            className="w-full text-xs" 
                                            onClick={() => exportVideo(i, false)}
                                            disabled={isExportingVideo}
                                            icon={<Download size={12}/>}
                                        >
                                            {finalCourse.modules.length > 1 ? `Download Only (Part ${i+1})` : `Download Only`}
                                        </Button>
                                        {/* Show saved status */}
                                        {m.lessons[0]?.renderedVideoUrl && (
                                            <div className="text-xs text-emerald-700 flex items-center gap-1 justify-center">
                                                <CheckCircle2 size={12}/> Saved & ready to stream
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Key Takeaways & Action Items Section */}
                        {finalCourse?.modules.some(m => m.lessons[0]?.keyTakeaways?.length || m.lessons[0]?.actionItems?.length) && (
                            <div className="mt-8 text-left">
                                <h3 className="text-xl font-bold text-slate-900 mb-4 text-center">Key Takeaways & Action Items</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {finalCourse.modules.map((m, idx) => {
                                        const lesson = m.lessons[0];
                                        if (!lesson?.keyTakeaways?.length && !lesson?.actionItems?.length) return null;
                                        return (
                                            <div key={m.id} className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                                                {finalCourse.modules.length > 1 && (
                                                    <h4 className="font-semibold text-indigo-600 mb-3">Part {idx + 1}: {lesson.title}</h4>
                                                )}
                                                {lesson.keyTakeaways && lesson.keyTakeaways.length > 0 && (
                                                    <div className="mb-4">
                                                        <h5 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                                                            <Sparkles size={16} className="text-amber-500"/>
                                                            Key Takeaways
                                                        </h5>
                                                        <ul className="space-y-1">
                                                            {lesson.keyTakeaways.map((t, i) => (
                                                                <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                                                                    <span className="text-emerald-500 mt-0.5">•</span>
                                                                    {t}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                                {lesson.actionItems && lesson.actionItems.length > 0 && (
                                                    <div>
                                                        <h5 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                                                            <CheckCircle2 size={16} className="text-blue-500"/>
                                                            Action Items
                                                        </h5>
                                                        <ul className="space-y-1">
                                                            {lesson.actionItems.map((a, i) => (
                                                                <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                                                                    <span className="text-blue-500 mt-0.5">→</span>
                                                                    {a}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {saveMessage && (
                            <div className={`mt-8 p-4 rounded-xl flex items-center justify-center gap-3 ${
                                saveMessage.type === 'success' 
                                    ? 'bg-emerald-50 border-2 border-emerald-200 text-emerald-700' 
                                    : 'bg-red-50 border-2 border-red-200 text-red-700'
                            }`}>
                                {saveMessage.type === 'success' ? (
                                    <CheckCircle2 size={20} className="text-emerald-500" />
                                ) : (
                                    <AlertCircle size={20} className="text-red-500" />
                                )}
                                <span className="font-medium">{saveMessage.text}</span>
                            </div>
                        )}

                        <div className="mt-8 flex justify-center gap-4">
                            <Button variant="outline" onClick={onCancel} disabled={isSaving}>Back to Dashboard</Button>
                            <Button onClick={handleFinalSave} disabled={isSaving}>
                                {isSaving ? (
                                    <><Loader2 size={16} className="animate-spin mr-2" /> Saving...</>
                                ) : (
                                    'Save & Finish'
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* Add New Video Modal */}
        {showAddVideoModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <h2 className="text-xl font-bold text-slate-900">Add New Video</h2>
                        <button onClick={() => setShowAddVideoModal(false)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20}/></button>
                    </div>
                    <div className="p-6 space-y-6">
                        {/* Video Title */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Video Title *</label>
                            <Input 
                                placeholder="e.g., Part 2: Advanced Techniques"
                                value={newVideoTitle}
                                onChange={(e) => setNewVideoTitle(e.target.value)}
                            />
                        </div>

                        {/* Creation Type */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Creation Type</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button 
                                    onClick={() => setNewVideoType('blank')}
                                    className={`p-4 rounded-xl border-2 text-left transition-all ${newVideoType === 'blank' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}
                                >
                                    <FileText size={24} className={`mb-2 ${newVideoType === 'blank' ? 'text-indigo-600' : 'text-slate-400'}`}/>
                                    <div className="font-semibold text-slate-800">Blank Video</div>
                                    <div className="text-xs text-slate-500 mt-1">Add placeholder, write script later</div>
                                </button>
                                <button 
                                    onClick={() => setNewVideoType('full')}
                                    className={`p-4 rounded-xl border-2 text-left transition-all ${newVideoType === 'full' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}
                                >
                                    <Sparkles size={24} className={`mb-2 ${newVideoType === 'full' ? 'text-indigo-600' : 'text-slate-400'}`}/>
                                    <div className="font-semibold text-slate-800">With Script</div>
                                    <div className="text-xs text-slate-500 mt-1">Start with script content</div>
                                </button>
                            </div>
                        </div>

                        {/* Script Source - only show if not blank */}
                        {newVideoType === 'full' && (
                            <>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Script Source</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button 
                                            onClick={() => setNewVideoScriptMode('own')}
                                            className={`p-3 rounded-lg border-2 text-center transition-all ${newVideoScriptMode === 'own' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}
                                        >
                                            <Edit3 size={18} className={`mx-auto mb-1 ${newVideoScriptMode === 'own' ? 'text-indigo-600' : 'text-slate-400'}`}/>
                                            <div className="text-sm font-medium text-slate-700">Write My Own</div>
                                        </button>
                                        <button 
                                            onClick={() => setNewVideoScriptMode('ai')}
                                            className={`p-3 rounded-lg border-2 text-center transition-all ${newVideoScriptMode === 'ai' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}
                                        >
                                            <Bot size={18} className={`mx-auto mb-1 ${newVideoScriptMode === 'ai' ? 'text-indigo-600' : 'text-slate-400'}`}/>
                                            <div className="text-sm font-medium text-slate-700">AI Generate</div>
                                        </button>
                                    </div>
                                </div>

                                {/* Script Input */}
                                {newVideoScriptMode === 'own' ? (
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Your Script</label>
                                        <TextArea 
                                            placeholder="Enter your video script here..."
                                            rows={4}
                                            value={newVideoScript}
                                            onChange={(e) => setNewVideoScript(e.target.value)}
                                        />
                                    </div>
                                ) : (
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">AI Instructions</label>
                                        <TextArea 
                                            placeholder="Describe what the video should cover. e.g., 'Explain advanced networking strategies with 3 examples'"
                                            rows={4}
                                            value={newVideoAiPrompt}
                                            onChange={(e) => setNewVideoAiPrompt(e.target.value)}
                                        />
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
                        <Button variant="outline" onClick={() => setShowAddVideoModal(false)}>Cancel</Button>
                        <Button 
                            onClick={handleAddNewVideo} 
                            isLoading={isCreatingNewVideo}
                            icon={<Plus size={16}/>}
                        >
                            {isCreatingNewVideo ? 'Creating...' : 'Add Video'}
                        </Button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
