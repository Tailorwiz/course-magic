
import React, { useState, useEffect, useRef } from 'react';
import { Course, Lesson, Module, VisualAsset, CaptionStyle, CaptionPosition, CaptionSize } from '../types';
import { Button } from '../components/Button';
import { ChevronLeft, ChevronRight, PlayCircle, PauseCircle, CheckCircle2, Award, Volume2, Maximize, Minimize, SkipBack, SkipForward, ArrowLeft, Menu, X, FileText, Download, Loader2, Link as LinkIcon, BookOpen, ChevronDown, ChevronUp, Image as ImageIcon, Circle, Play, Clock, Layout, MessageCircle, Send, Sparkles, Lightbulb, CheckSquare, AlertCircle } from 'lucide-react';
import { pcmToWav, renderVideoFromLesson, downloadBlob } from '../utils';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { api } from '../api';

interface WordTiming {
    word: string;
    start: number;
    end: number;
}

interface StudentPortalProps {
    course: Course;
    isCreator: boolean;
    onExit: () => void;
    completedLessonIds: string[];
    onToggleComplete: (lessonId: string) => void;
    onClaimCertificate: () => void;
}

interface ChatMessage {
    id: string;
    sender: 'user' | 'admin';
    text: string;
    timestamp: Date;
}

export const StudentPortal: React.FC<StudentPortalProps> = ({ 
    course, 
    isCreator, 
    onExit, 
    completedLessonIds, 
    onToggleComplete,
    onClaimCertificate 
}) => {
    // Theme defaults
    const primaryColor = course.theme?.primaryColor || '#1e1b4b'; // Default Indigo-950
    const accentColor = course.theme?.accentColor || '#4f46e5';   // Default Indigo-600
    const bgColor = course.theme?.backgroundColor || '#f1f5f9';   // Default Slate-100
    const borderColor = course.theme?.borderColor || '#cbd5e1';   // Default Slate-300
    
    // New Typography Theme Settings
    const textColor = course.theme?.textColor || '#1e293b';       // Default Slate-800
    const isBoldText = course.theme?.isBoldText || false;
    const fontFamily = course.theme?.fontFamily || 'Inter, sans-serif';

    // Determine initial lesson
    const findInitialLesson = () => {
        for (let m = 0; m < course.modules.length; m++) {
            for (let l = 0; l < course.modules[m].lessons.length; l++) {
                if (!completedLessonIds.includes(course.modules[m].lessons[l].id)) {
                    return { mIdx: m, lIdx: l };
                }
            }
        }
        return { mIdx: 0, lIdx: 0 };
    };

    const initialPos = findInitialLesson();
    const [currentModuleIndex, setCurrentModuleIndex] = useState(initialPos.mIdx);
    const [currentLessonIndex, setCurrentLessonIndex] = useState(initialPos.lIdx);
    
    // Initialize with current module expanded
    const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>(() => {
        const initialModId = course.modules[initialPos.mIdx]?.id;
        return initialModId ? { [initialModId]: true } : {};
    });
    
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [videoDuration, setVideoDuration] = useState<number | null>(null);
    const [audioDuration, setAudioDuration] = useState<number | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isAudioLoading, setIsAudioLoading] = useState(false);
    const [isAudioReady, setIsAudioReady] = useState(false);
    const [wordTimings, setWordTimings] = useState<WordTiming[]>([]);
    const [sidebarOpen, setSidebarOpen] = useState(true); 
    const [isDownloadingVideo, setIsDownloadingVideo] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    
    // Automatic completion overlay state
    const [showCompletionOverlay, setShowCompletionOverlay] = useState(false);

    // Chat State
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
        { id: '1', sender: 'admin', text: 'Hi! Have a question about the course? Ask us here.', timestamp: new Date() }
    ]);
    const [chatInput, setChatInput] = useState('');

    // Lesson Analysis State (Key Takeaways / Action Items)
    const [analyzedData, setAnalyzedData] = useState<Record<string, { takeaways: string[], actions: string[] }>>({});
    const [isGeneratingTakeaways, setIsGeneratingTakeaways] = useState(false);
    
    // Content Tab State
    type ContentTab = 'content' | 'takeaways' | 'actions' | 'nextsteps';
    const [activeContentTab, setActiveContentTab] = useState<ContentTab>('content');
    
    // Persistent cover URL state - survives lightweight data refreshes
    const [coverUrl, setCoverUrl] = useState<string>(() => course.ecoverUrl || '');
    const coverFetchedRef = useRef<string | null>(null);
    
    // Fetch cover from database when hasCoverInDb is true but ecoverUrl is empty
    useEffect(() => {
        const courseId = (course as any)._dbId || course.id;
        
        // If we already have a cover URL, keep it
        if (coverUrl && coverUrl.length > 10) return;
        
        // If course has cover data directly, use it
        if (course.ecoverUrl && course.ecoverUrl.length > 10) {
            setCoverUrl(course.ecoverUrl);
            return;
        }
        
        // If cover is in database and we haven't fetched it yet
        const hasCoverInDb = (course as any).hasCoverInDb;
        if (hasCoverInDb && coverFetchedRef.current !== courseId) {
            coverFetchedRef.current = courseId;
            fetch(`/api/courses/${courseId}/cover`)
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                    if (data?.ecoverUrl) {
                        setCoverUrl(data.ecoverUrl);
                    }
                })
                .catch(err => console.error('Failed to fetch cover:', err));
        }
    }, [course.id, (course as any)._dbId, (course as any).hasCoverInDb, course.ecoverUrl, coverUrl]);

    const audioRef = useRef<HTMLAudioElement>(null);
    const bgMusicRef = useRef<HTMLAudioElement>(null);
    const hostedVideoRef = useRef<HTMLVideoElement>(null);
    const [hostedVideoFailed, setHostedVideoFailed] = useState(false);
    const [fetchedVisuals, setFetchedVisuals] = useState<Record<string, any[]>>({});
    const [imageMetadata, setImageMetadata] = useState<Record<string, Array<{visualIndex: number, prompt?: string}>>>({});
    const [loadedImages, setLoadedImages] = useState<Record<string, Record<number, string>>>({}); // lessonId -> visualIndex -> imageData
    const fetchingImagesRef = useRef<Set<string>>(new Set()); // Track in-progress fetches
    const playerContainerRef = useRef<HTMLDivElement>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);

    const currentModule = course.modules[currentModuleIndex];
    const rawLesson = currentModule?.lessons[currentLessonIndex];
    
    // Merge fetched visuals from database into current lesson
    const currentLesson = React.useMemo(() => {
        console.log(`[USEMEMO RUN] currentLesson useMemo triggered, fetchedVisuals keys:`, Object.keys(fetchedVisuals));
        if (!rawLesson) return rawLesson;
        const lessonKey = rawLesson.id;
        const dbVisuals = fetchedVisuals[lessonKey];
        
        console.log(`[StudentPortal MERGE] Lesson ${lessonKey}: dbVisuals=${dbVisuals?.length || 0}`);
        
        if (!dbVisuals || dbVisuals.length === 0) {
            console.log(`[StudentPortal MERGE] No DB visuals yet for ${lessonKey}`);
            return rawLesson;
        }
        
        // Check if we need to merge (visuals are empty or missing imageData)
        const existingVisuals = rawLesson.visuals || [];
        const visualsWithData = existingVisuals.filter(v => v.imageData && v.imageData.length > 100);
        const needsMerge = existingVisuals.length === 0 || 
            existingVisuals.some(v => !v.imageData || v.imageData.length < 100);
        
        console.log(`[StudentPortal MERGE] existingVisuals=${existingVisuals.length}, withData=${visualsWithData.length}, needsMerge=${needsMerge}`);
        
        if (!needsMerge) return rawLesson;
        
        // Sort DB images by visualIndex first - DB indices may not start at 0
        const sortedDbVisuals = [...dbVisuals].sort((a, b) => {
            const aIdx = typeof a.visualIndex === 'string' ? parseInt(a.visualIndex) : a.visualIndex;
            const bIdx = typeof b.visualIndex === 'string' ? parseInt(b.visualIndex) : b.visualIndex;
            return aIdx - bIdx;
        });
        console.log(`[StudentPortal] Sorted ${sortedDbVisuals.length} DB images for merge`);
        
        // Merge database images into visuals
        let mergedVisuals;
        if (existingVisuals.length > 0) {
            // Existing visuals have timing - use sorted position to merge imageData
            mergedVisuals = existingVisuals.map((v, idx) => {
                const dbImage = sortedDbVisuals[idx]; // Use sorted position, not visualIndex
                if (dbImage && (!v.imageData || v.imageData.length < 100)) {
                    console.log(`[StudentPortal] Visual ${idx} gets image from DB (originalIndex: ${dbImage.visualIndex})`);
                    return { ...v, imageData: dbImage.imageData };
                }
                return v;
            });
        } else {
            // No existing visuals - create from DB images with even timing distribution
            // Use lesson duration if available, otherwise estimate from image count
            const lessonDuration = (rawLesson as any).durationSeconds || dbVisuals.length * 10;
            const timePerVisual = lessonDuration / dbVisuals.length;
            
            mergedVisuals = dbVisuals
                .sort((a, b) => parseInt(a.visualIndex) - parseInt(b.visualIndex))
                .map((db, idx) => ({
                    id: `vis-${db.visualIndex}`,
                    prompt: db.prompt || '',
                    imageData: db.imageData,
                    startTime: idx * timePerVisual,
                    endTime: (idx + 1) * timePerVisual,
                    zoomDirection: idx % 2 === 0 ? 'in' : 'out'
                } as any));
            console.log(`Created ${mergedVisuals.length} visuals with even timing (${timePerVisual.toFixed(2)}s each)`);
        }
        
        return { ...rawLesson, visuals: mergedVisuals };
    }, [rawLesson, fetchedVisuals]);
    
    // Check if lesson has a streamable video URL (hosted or rendered)
    const streamableVideoUrl = currentLesson?.renderedVideoUrl || currentLesson?.videoUrl;
    const hasHostedVideo = streamableVideoUrl && streamableVideoUrl.trim() !== '' && !hostedVideoFailed;
    
    // Check if there's audio/visuals content to fall back to
    const hasAudioData = !!(currentLesson?.audioData && currentLesson.audioData.trim() !== '');
    const hasAudioInDb = !!(currentLesson as any)?.hasAudioInDb;
    const hasVisuals = !!(currentLesson?.visuals && currentLesson.visuals.length > 0);
    const hasAudioVisualContent = hasAudioData || hasVisuals || hasAudioInDb;
    const showVideoError = hostedVideoFailed && !hasAudioVisualContent;
    
    // Special case: has images but no audio - can't play properly
    // Check audioUrl state (loaded from DB) and hasAudioInDb flag (will be loaded)
    const hasVisualsButNoAudio = hasVisuals && !hasAudioData && !hasHostedVideo && !audioUrl && !hasAudioInDb;

    const totalLessons = course.modules.reduce((acc, m) => acc + m.lessons.length, 0);
    const completedCount = completedLessonIds.length;
    const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
    
    // Certificate eligibility: count only lessons with awardsCertificate=true
    // If NO lessons have this flag explicitly set (all undefined), fall back to counting all lessons (backwards compatibility)
    // If ANY lesson has the flag set (true OR false), use explicit mode - only count lessons with awardsCertificate=true
    const allLessons = course.modules.flatMap(m => m.lessons);
    const hasExplicitCertificateSettings = allLessons.some(l => l.awardsCertificate !== undefined);
    const certificateLessons = allLessons.filter(l => l.awardsCertificate === true);
    
    // In explicit mode: only count lessons marked true (could be 0 if all are false = no certificate possible)
    // In backwards-compatible mode: count all lessons
    const certificateRequiredLessons = hasExplicitCertificateSettings ? certificateLessons : allLessons;
    const certificateRequiredCount = certificateRequiredLessons.length;
    const certificateCompletedCount = certificateRequiredLessons.filter(l => completedLessonIds.includes(l.id)).length;
    
    // Course is completed only if there are required lessons AND all are completed
    // If certificateRequiredCount is 0 (all videos set to "No Certificate"), no certificate is awarded
    const isCourseCompleted = certificateRequiredCount > 0 && certificateCompletedCount === certificateRequiredCount;
    
    // Check if certificates are enabled for this course (at least one lesson awards certificate)
    const certificatesEnabled = certificateRequiredCount > 0;

    const toggleModule = (modId: string) => {
        setExpandedModules(prev => ({ ...prev, [modId]: !prev[modId] }));
    };

    const toggleFullscreen = () => {
        if (!playerContainerRef.current) return;

        if (!document.fullscreenElement) {
            playerContainerRef.current.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    };

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const calculateTimings = (text: string, duration: number): WordTiming[] => {
        const words = text.trim().split(/\s+/);
        const wordWeights = words.map(w => w.length + 2.5);
        const totalWeight = wordWeights.reduce((acc, w) => acc + w, 0);
        
        let t = 0;
        return words.map((w, i) => {
            const weight = wordWeights[i];
            const d = (weight / totalWeight) * duration;
            const res = { word: w, start: t, end: t + d };
            t += d;
            return res;
        });
    };

    // --- LESSON ANALYSIS (Use Pre-stored Data) ---
    const loadLessonAnalysis = (lesson: Lesson): void => {
        if (analyzedData[lesson.id]) return;
        
        // Check for pre-stored takeaways and action items - check both fields
        const hasTakeaways = lesson.keyTakeaways && lesson.keyTakeaways.length > 0;
        const hasActions = lesson.actionItems && lesson.actionItems.length > 0;
        
        if (hasTakeaways || hasActions) {
            setAnalyzedData(prev => ({
                ...prev,
                [lesson.id]: { 
                    takeaways: lesson.keyTakeaways || [], 
                    actions: lesson.actionItems || [] 
                }
            }));
            return;
        }
        
        // If no pre-stored data, set empty arrays (will show fallback UI)
        setAnalyzedData(prev => ({
            ...prev,
            [lesson.id]: { takeaways: [], actions: [] }
        }));
    };

    // Generate takeaways and action items on-demand using AI
    const generateTakeawaysOnDemand = async () => {
        if (!currentLesson?.sourceText || currentLesson.sourceText.trim().length < 50) {
            alert('Not enough content to generate takeaways. The lesson needs more text.');
            return;
        }
        
        setIsGeneratingTakeaways(true);
        try {
            const response = await fetch('/api/ai/generate-takeaways', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    script: currentLesson.sourceText,
                    title: currentLesson.title
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.keyTakeaways?.length > 0 || data.actionItems?.length > 0) {
                    const newTakeaways = data.keyTakeaways || [];
                    const newActions = data.actionItems || [];
                    
                    setAnalyzedData(prev => ({
                        ...prev,
                        [currentLesson.id]: {
                            takeaways: newTakeaways,
                            actions: newActions
                        }
                    }));
                    
                    // Persist to server so it's saved for future visits
                    const courseId = (course as any)._dbId || course.id;
                    fetch(`/api/courses/${courseId}/lessons/${currentLesson.id}/takeaways`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            keyTakeaways: newTakeaways,
                            actionItems: newActions
                        })
                    }).catch(err => console.error('Failed to save takeaways:', err));
                } else {
                    alert('Could not generate takeaways. Please try again.');
                }
            } else {
                alert('Failed to generate takeaways. Please check your API key settings.');
            }
        } catch (error) {
            console.error('Error generating takeaways:', error);
            alert('An error occurred while generating takeaways.');
        } finally {
            setIsGeneratingTakeaways(false);
        }
    };

    // Load Audio & Prepare Lesson & Trigger Analysis
    useEffect(() => {
        let createdBlobUrl: string | null = null;
        let isCancelled = false;
        
        setIsPlaying(false);
        setCurrentTime(0);
        setVideoDuration(null);
        setWordTimings([]);
        setHostedVideoFailed(false);
        setIsAudioReady(false);
        setIsAudioLoading(false);
        
        // Reset collapse states
        setActiveContentTab('content');
        
        if (!currentLesson) {
            setAudioUrl(null);
            return;
        }

        // Auto-scroll to top of content
        document.getElementById('lesson-content-top')?.scrollIntoView({ behavior: 'smooth' });

        // Load pre-stored takeaways and action items
        loadLessonAnalysis(currentLesson);

        // Ensure current module is visibly expanded
        if (currentModule && !expandedModules[currentModule.id]) {
            setExpandedModules(prev => ({...prev, [currentModule.id]: true}));
        }

        // Function to process audio data
        const processAudioData = (audioData: string, audioMimeType?: string) => {
            if (isCancelled) return;
            try {
                if (audioData.startsWith('/media/') || 
                    audioData.startsWith('/objects/') || 
                    audioData.startsWith('http')) {
                    setAudioUrl(audioData);
                } else if (audioData.startsWith('data:audio/pcm;base64,')) {
                    const base64 = audioData.split(',')[1];
                    const binaryString = window.atob(base64);
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
                    const blob = pcmToWav(bytes, 24000, 1);
                    const url = URL.createObjectURL(blob);
                    createdBlobUrl = url;
                    setAudioUrl(url);
                } else if (audioData.startsWith('data:')) {
                    setAudioUrl(audioData);
                } else {
                    const binaryString = window.atob(audioData);
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
                    let blob;
                    if (audioMimeType === 'audio/mpeg') {
                        blob = new Blob([bytes], { type: 'audio/mpeg' });
                    } else {
                        blob = pcmToWav(bytes, 24000, 1);
                    }
                    const url = URL.createObjectURL(blob);
                    createdBlobUrl = url;
                    setAudioUrl(url);
                }
                if (currentLesson.durationSeconds && currentLesson.sourceText) {
                    setWordTimings(calculateTimings(currentLesson.sourceText, currentLesson.durationSeconds));
                }
            } catch (e) {
                console.error("Audio setup failed", e);
            }
        };

        // Check if we need to fetch audio from database
        const lessonAny = currentLesson as any;
        const hasAudioInDb = lessonAny.hasAudioInDb === true;
        
        // Support fetching from source video (for courses built from existing videos)
        const sourceVideoId = lessonAny.sourceVideoId;
        const sourceLessonId = lessonAny.sourceLessonId;
        
        // FIXED: Try fetching audio if:
        // 1. No audioData AND hasAudioInDb flag is true (original logic), OR
        // 2. No audioData AND lesson has visuals (generated video should have audio in DB), OR
        // 3. No audioData AND has sourceVideoId (built from existing video)
        const hasVisuals = currentLesson.visuals && currentLesson.visuals.length > 0;
        const shouldTryFetch = !currentLesson.audioData && (hasAudioInDb || hasVisuals || sourceVideoId);

        if (shouldTryFetch && course.id && currentLesson.id) {
            // Fetch audio from dedicated table
            console.log(`Fetching audio from database for lesson ${currentLesson.id}`);
            setIsAudioLoading(true);
            api.lessonAudio.get(course.id, currentLesson.id)
                .then((audio) => {
                    if (audio && !isCancelled) {
                        console.log(`Audio fetched from database for lesson ${currentLesson.id}`);
                        processAudioData(audio.audioData, audio.mimeType);
                        setIsAudioLoading(false);
                        // Also use word timestamps from database if available
                        if (audio.wordTimestamps && audio.wordTimestamps.length > 0) {
                            setWordTimings(audio.wordTimestamps.map(wt => ({
                                word: wt.word,
                                start: wt.start,
                                end: wt.end
                            })));
                        }
                    } else if (!audio && sourceVideoId && sourceLessonId && !isCancelled) {
                        // Fallback: try fetching from source video's audio
                        console.log(`Audio not found, trying source video: ${sourceVideoId}/${sourceLessonId}`);
                        api.lessonAudio.get(sourceVideoId, sourceLessonId)
                            .then((sourceAudio) => {
                                if (sourceAudio && !isCancelled) {
                                    console.log(`Audio fetched from source video for lesson ${currentLesson.id}`);
                                    processAudioData(sourceAudio.audioData, sourceAudio.mimeType);
                                    if (sourceAudio.wordTimestamps && sourceAudio.wordTimestamps.length > 0) {
                                        setWordTimings(sourceAudio.wordTimestamps.map(wt => ({
                                            word: wt.word,
                                            start: wt.start,
                                            end: wt.end
                                        })));
                                    }
                                }
                                setIsAudioLoading(false);
                            })
                            .catch((err) => {
                                console.error('Failed to fetch audio from source video:', err);
                                setIsAudioLoading(false);
                            });
                    } else {
                        setIsAudioLoading(false);
                    }
                })
                .catch((err) => {
                    console.error('Failed to fetch audio from database:', err);
                    // Also try source video on error
                    if (sourceVideoId && sourceLessonId && !isCancelled) {
                        api.lessonAudio.get(sourceVideoId, sourceLessonId)
                            .then((sourceAudio) => {
                                if (sourceAudio && !isCancelled) {
                                    console.log(`Audio fetched from source video (fallback) for lesson ${currentLesson.id}`);
                                    processAudioData(sourceAudio.audioData, sourceAudio.mimeType);
                                }
                                setIsAudioLoading(false);
                            })
                            .catch(() => { setIsAudioLoading(false); });
                    } else {
                        setIsAudioLoading(false);
                    }
                });
        } else if (currentLesson.audioData) {
            try {
                // Check if it's a file URL or http URL
                if (currentLesson.audioData.startsWith('/media/') || 
                    currentLesson.audioData.startsWith('/objects/') || 
                    currentLesson.audioData.startsWith('http')) {
                    setAudioUrl(currentLesson.audioData);
                } else if (currentLesson.audioData.startsWith('data:audio/pcm;base64,')) {
                    // PCM data URL - needs conversion to WAV
                    const base64 = currentLesson.audioData.split(',')[1];
                    const binaryString = window.atob(base64);
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    const blob = pcmToWav(bytes, 24000, 1);
                    const url = URL.createObjectURL(blob);
                    createdBlobUrl = url;
                    setAudioUrl(url);
                } else if (currentLesson.audioData.startsWith('data:')) {
                    // Other data URLs (MP3, WAV, etc.) - use directly
                    setAudioUrl(currentLesson.audioData);
                } else {
                    // Legacy raw base64 handling (without data: prefix)
                    const binaryString = window.atob(currentLesson.audioData);
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }

                    let blob;
                    if (currentLesson.audioMimeType === 'audio/mpeg') {
                        blob = new Blob([bytes], { type: 'audio/mpeg' });
                    } else {
                        blob = pcmToWav(bytes, 24000, 1);
                    }
                    
                    const url = URL.createObjectURL(blob);
                    createdBlobUrl = url;
                    setAudioUrl(url);
                }

                if (currentLesson.durationSeconds && currentLesson.sourceText) {
                    setWordTimings(calculateTimings(currentLesson.sourceText, currentLesson.durationSeconds));
                }

            } catch (e) {
                console.error("Audio setup failed", e);
            }
        } else {
            setAudioUrl(null);
        }
        
        // Cleanup function: revoke blob URL when lesson changes or component unmounts
        return () => {
            isCancelled = true;
            if (createdBlobUrl) {
                URL.revokeObjectURL(createdBlobUrl);
            }
        };
    }, [currentLesson, course.id]);

    // Fetch image metadata (not actual images) when lesson loads - for lazy loading
    useEffect(() => {
        if (!rawLesson || !course.id || !rawLesson.id) return;
        
        const existingVisuals = rawLesson.visuals || [];
        const visualsMissingData = existingVisuals.length === 0 || 
            existingVisuals.some(v => !v.imageData || v.imageData.length < 100);
        
        const courseDbId = (course as any)._dbId || course.id;
        
        // Fetch metadata only if we don't have it yet
        if (visualsMissingData && !imageMetadata[rawLesson.id]) {
            console.log(`[LAZY LOAD] Fetching image metadata for lesson ${rawLesson.id}`);
            api.lessonImages.getMetadata(courseDbId, rawLesson.id)
                .then((metadata) => {
                    if (metadata && metadata.length > 0) {
                        console.log(`[LAZY LOAD] Got metadata for ${metadata.length} images`);
                        setImageMetadata(prev => ({
                            ...prev,
                            [rawLesson.id]: metadata
                        }));
                    }
                })
                .catch((err) => console.error('Failed to fetch image metadata:', err));
        }
    }, [rawLesson, course.id, imageMetadata]);

    // Preload first 3 images immediately when metadata arrives
    useEffect(() => {
        if (!rawLesson || !rawLesson.id) return;
        
        const metadata = imageMetadata[rawLesson.id];
        if (!metadata || metadata.length === 0) return;
        
        const courseDbId = (course as any)._dbId || course.id;
        
        // Sort metadata by visualIndex to get proper order
        const sortedMeta = [...metadata].sort((a, b) => a.visualIndex - b.visualIndex);
        
        // Preload first 3 images (by sorted position, not by visualIndex)
        const indicesToPreload = sortedMeta.slice(0, 3);
        
        for (let i = 0; i < indicesToPreload.length; i++) {
            const meta = indicesToPreload[i];
            // Use position as key, not visualIndex
            const fetchKey = `${rawLesson.id}-pos-${i}`;
            const alreadyLoaded = loadedImages[rawLesson.id]?.[i]; // Store by position
            const alreadyFetching = fetchingImagesRef.current.has(fetchKey);
            
            if (!alreadyLoaded && !alreadyFetching) {
                fetchingImagesRef.current.add(fetchKey);
                console.log(`[PRELOAD] Fetching position ${i} (dbIndex ${meta.visualIndex})`);
                
                api.lessonImages.getOne(courseDbId, rawLesson.id, meta.visualIndex)
                    .then((img) => {
                        if (img && img.imageData) {
                            console.log(`[PRELOAD] Got position ${i}`);
                            setLoadedImages(prev => ({
                                ...prev,
                                [rawLesson.id]: {
                                    ...(prev[rawLesson.id] || {}),
                                    [i]: img.imageData // Store by position, not visualIndex
                                }
                            }));
                        }
                        fetchingImagesRef.current.delete(fetchKey);
                    })
                    .catch(() => fetchingImagesRef.current.delete(fetchKey));
            }
        }
    }, [rawLesson, imageMetadata, course.id, loadedImages]);

    // Lazy load individual images as needed based on currentTime
    useEffect(() => {
        if (!rawLesson || !rawLesson.id || !isPlaying) return;
        
        const existingVisuals = rawLesson.visuals || [];
        const metadata = imageMetadata[rawLesson.id];
        if (!metadata || metadata.length === 0) return;
        
        const courseDbId = (course as any)._dbId || course.id;
        const duration = audioDuration || rawLesson.durationSeconds || 60;
        
        // Sort metadata by visualIndex to create position mapping
        const sortedMeta = [...metadata].sort((a, b) => a.visualIndex - b.visualIndex);
        
        // Calculate which position should be showing based on time
        let targetPosition = 0;
        const hasStoredTiming = existingVisuals.some(v => v.startTime > 0 || v.endTime > 0);
        
        if (hasStoredTiming) {
            for (let i = 0; i < existingVisuals.length; i++) {
                if (currentTime >= existingVisuals[i].startTime && currentTime < existingVisuals[i].endTime) {
                    targetPosition = i;
                    break;
                }
                if (currentTime >= existingVisuals[i].startTime) {
                    targetPosition = i;
                }
            }
        } else {
            const timePerImage = duration / Math.max(existingVisuals.length, sortedMeta.length);
            targetPosition = Math.min(Math.floor(currentTime / timePerImage), sortedMeta.length - 1);
        }
        
        // Also preload next 2 images by position
        const positionsToLoad = [targetPosition, targetPosition + 1, targetPosition + 2].filter(i => i >= 0 && i < sortedMeta.length);
        
        for (const pos of positionsToLoad) {
            const metaItem = sortedMeta[pos];
            if (!metaItem) continue;
            
            const fetchKey = `${rawLesson.id}-pos-${pos}`;
            const alreadyLoaded = loadedImages[rawLesson.id]?.[pos]; // Check by position
            const alreadyFetching = fetchingImagesRef.current.has(fetchKey);
            
            if (!alreadyLoaded && !alreadyFetching) {
                fetchingImagesRef.current.add(fetchKey);
                console.log(`[LAZY LOAD] Fetching position ${pos} (dbIndex ${metaItem.visualIndex})`);
                
                api.lessonImages.getOne(courseDbId, rawLesson.id, metaItem.visualIndex)
                    .then((img) => {
                        if (img && img.imageData) {
                            console.log(`[LAZY LOAD] Got position ${pos}, size: ${(img.imageData.length/1024).toFixed(0)}KB`);
                            setLoadedImages(prev => ({
                                ...prev,
                                [rawLesson.id]: {
                                    ...(prev[rawLesson.id] || {}),
                                    [pos]: img.imageData // Store by position
                                }
                            }));
                        }
                        fetchingImagesRef.current.delete(fetchKey);
                    })
                    .catch((err) => {
                        console.error(`Failed to fetch position ${pos}:`, err);
                        fetchingImagesRef.current.delete(fetchKey);
                    });
            }
        }
    }, [rawLesson, currentTime, isPlaying, imageMetadata, audioDuration, loadedImages, course.id]);

    useEffect(() => {
        if (bgMusicRef.current) {
            bgMusicRef.current.volume = 0.1;
            if (isPlaying) bgMusicRef.current.play().catch(() => {});
            else bgMusicRef.current.pause();
        }
    }, [isPlaying, currentLesson]);

    useEffect(() => {
        if(chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatMessages, isChatOpen]);

    const handlePlayPause = () => {
        // Use hosted video if available, otherwise use audio + images
        if (hasHostedVideo && hostedVideoRef.current) {
            if (isPlaying) {
                hostedVideoRef.current.pause();
            } else {
                hostedVideoRef.current.play().catch(() => {});
            }
            setIsPlaying(!isPlaying);
        } else if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
                bgMusicRef.current?.pause();
            } else {
                audioRef.current.play().catch(() => {});
                bgMusicRef.current?.play().catch(() => {});
            }
            setIsPlaying(!isPlaying);
        }
    };

    const handleTimeUpdate = (e: React.SyntheticEvent<HTMLAudioElement | HTMLVideoElement>) => {
        setCurrentTime(e.currentTarget.currentTime);
    };

    const handleLessonChange = (mIdx: number, lIdx: number) => {
        setCurrentModuleIndex(mIdx);
        setCurrentLessonIndex(lIdx);
        setAudioDuration(null); // Reset audio duration for new lesson
        setCurrentTime(0); // Reset playback position
        // Do NOT auto-close sidebar on large screens, only on mobile if needed
        if (window.innerWidth < 1024) setSidebarOpen(false);
    };

    const handleNext = () => {
        if (currentLessonIndex < currentModule.lessons.length - 1) {
            handleLessonChange(currentModuleIndex, currentLessonIndex + 1);
        } else if (currentModuleIndex < course.modules.length - 1) {
            handleLessonChange(currentModuleIndex + 1, 0);
        }
    };

    const handlePrevious = () => {
        if (currentLessonIndex > 0) {
            handleLessonChange(currentModuleIndex, currentLessonIndex - 1);
        } else if (currentModuleIndex > 0) {
            const prevModule = course.modules[currentModuleIndex - 1];
            handleLessonChange(currentModuleIndex - 1, prevModule.lessons.length - 1);
        }
    };

    const handleAudioEnded = () => {
        setIsPlaying(false);
        bgMusicRef.current?.pause();
        
        // Auto-mark complete if not already
        if (!completedLessonIds.includes(currentLesson.id)) {
            onToggleComplete(currentLesson.id);
        }

        // Check if this was the last uncompleted certificate-eligible lesson
        // If no certificate-required lessons exist (all set to "No Certificate"), don't show completion overlay
        const isCertLesson = hasExplicitCertificateSettings ? currentLesson.awardsCertificate === true : true;
        const canEarnCertificate = certificateRequiredCount > 0;
        const isNowComplete = canEarnCertificate && isCertLesson && (
            certificateCompletedCount === certificateRequiredCount || 
            (certificateCompletedCount === certificateRequiredCount - 1 && !completedLessonIds.includes(currentLesson.id))
        );
        
        if (isNowComplete) {
            setShowCompletionOverlay(true);
        }

        // Auto-expand extras using robust state change
        setActiveContentTab('takeaways');
    };

    const handleDownloadVideo = async () => {
        // Check for audio from lesson directly OR from database (audioUrl state)
        const hasAudio = currentLesson?.audioData || audioUrl;
        if (!currentLesson || !hasAudio) {
            alert("Video content not available. Please regenerate the lesson if audio is missing.");
            return;
        }
        setIsDownloadingVideo(true);
        setDownloadProgress(0);
        
        // Slight delay to allow UI to update to "Saving..." state before heavy render starts
        setTimeout(async () => {
            try {
                // If audio is from database, add it to the lesson object for rendering
                const lessonToRender = audioUrl && !currentLesson.audioData 
                    ? { ...currentLesson, audioData: audioUrl }
                    : currentLesson;
                    
                const blob = await renderVideoFromLesson(lessonToRender, (progress) => {
                    setDownloadProgress(progress);
                });
                if (blob) {
                    downloadBlob(blob, `${currentLesson.title.replace(/[^a-z0-9]/gi, '_')}.webm`);
                } else {
                    alert("Render failed. Please check console for details.");
                }
            } catch (e) {
                console.error(e);
                alert("Failed to download.");
            } finally {
                setIsDownloadingVideo(false);
                setDownloadProgress(0);
            }
        }, 100);
    };

    // --- Chat Logic ---
    const handleSendChat = () => {
        if (!chatInput.trim()) return;
        const newUserMsg: ChatMessage = {
            id: `msg-${Date.now()}`,
            sender: 'user',
            text: chatInput,
            timestamp: new Date()
        };
        setChatMessages(prev => [...prev, newUserMsg]);
        setChatInput('');

        // Simulate admin reply
        setTimeout(() => {
            const adminReply: ChatMessage = {
                id: `rep-${Date.now()}`,
                sender: 'admin',
                text: "Thanks for your question! An instructor has been notified and will reply to you via email shortly.",
                timestamp: new Date()
            };
            setChatMessages(prev => [...prev, adminReply]);
        }, 1500);
    };

    // --- Content Formatting Engine ---
    const renderFormattedContent = (text: string) => {
        if (!text) return <p className="italic opacity-60">No content available.</p>;

        return text.split('\n').map((line, idx) => {
            const cleanLine = line.trim();
            if (!cleanLine) return <div key={idx} className="h-4"></div>;

            // Heading Detection
            if (cleanLine.startsWith('#') || cleanLine.startsWith('Chapter') || (cleanLine.length < 60 && cleanLine === cleanLine.toUpperCase() && !cleanLine.startsWith('-'))) {
                return <h3 key={idx} className="text-xl font-bold mt-6 mb-3 border-b pb-2 opacity-90" style={{color: textColor, borderColor: borderColor}}>{cleanLine.replace(/#/g, '')}</h3>;
            }

            // Bullet Points
            if (cleanLine.startsWith('- ') || cleanLine.startsWith('• ')) {
                return (
                    <div key={idx} className="flex gap-3 mb-3 pl-2">
                        <div className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{backgroundColor: accentColor}}></div>
                        <p className="leading-relaxed text-base" style={{color: textColor}}>{processInlineFormatting(cleanLine.substring(2))}</p>
                    </div>
                );
            }

            // Standard Paragraph
            return <p key={idx} className="leading-loose mb-4 text-base opacity-90" style={{color: textColor}}>{processInlineFormatting(cleanLine)}</p>;
        });
    };

    const processInlineFormatting = (text: string) => {
        // Detect **bold**
        const parts = text.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <span key={i} className="font-bold bg-opacity-10 px-1 rounded" style={{color: accentColor, backgroundColor: accentColor + '15'}}>{part.slice(2, -2)}</span>;
            }
            return part;
        });
    };

    // VISUALS - Simple time range check: each section has startTime and endTime
    // When currentTime is in Section N's time range, show Section N's image
    const getActiveVisual = () => {
        if (!currentLesson?.visuals || currentLesson.visuals.length === 0) {
            console.log('[getActiveVisual] No visuals in currentLesson');
            return null;
        }
        const allVisuals = currentLesson.visuals;
        let visuals = allVisuals.filter(v => v.imageData && v.imageData.length > 100);
        
        // LAZY LOAD FALLBACK: Use loadedImages if course visuals don't have data
        // loadedImages is stored by POSITION (0, 1, 2...) not by database visualIndex
        const lessonLoadedImages = loadedImages[currentLesson.id];
        if (visuals.length === 0 && lessonLoadedImages && Object.keys(lessonLoadedImages).length > 0) {
            // Map loaded images to visuals by position
            visuals = allVisuals.map((v, idx) => {
                const imageData = lessonLoadedImages[idx]; // Load by position
                if (imageData) {
                    return { ...v, imageData };
                }
                return v;
            }).filter(v => v.imageData && v.imageData.length > 100);
        }
        
        // Debug: Log once per lesson what we have
        if (currentTime < 0.5) {
            console.log(`[getActiveVisual] lessonId=${currentLesson.id}, allVisuals=${allVisuals.length}, withData=${visuals.length}, lazyLoaded=${Object.keys(lessonLoadedImages || {}).length}`);
        }
        
        if (visuals.length === 0) {
            return null;
        }
        
        const duration = audioDuration || currentLesson.durationSeconds || 60;
        if (duration <= 0 || !isFinite(duration)) return visuals[0];
        
        // Check if visuals have stored timing (from re-rendered videos with sectionTimingVersion: 2)
        const hasStoredTiming = visuals.some(v => v.startTime > 0 || v.endTime > 0);
        
        if (hasStoredTiming) {
            const lastVisual = visuals[visuals.length - 1];
            const storedDuration = lastVisual.endTime || 0;
            
            if (currentTime < 0.1) {
                console.log(`[Visual Timing] Using section time ranges: ${visuals.length} sections, stored ends at ${storedDuration.toFixed(1)}s, actual duration ${duration.toFixed(1)}s`);
            }
            
            // Find which section's time range contains the currentTime
            for (let i = 0; i < visuals.length; i++) {
                if (currentTime >= visuals[i].startTime && currentTime < visuals[i].endTime) {
                    return visuals[i];
                }
            }
            
            // Past all sections - show last
            if (currentTime >= lastVisual.startTime) return lastVisual;
            return visuals[0];
        }
        
        // Fallback for legacy videos without proper timing: even distribution
        if (currentTime < 0.1) {
            console.log(`[Visual Timing] Legacy video - using even distribution: ${visuals.length} sections`);
        }
        const timePerImage = duration / visuals.length;
        const index = Math.min(Math.floor(currentTime / timePerImage), visuals.length - 1);
        return visuals[Math.max(0, index)];
    };
    const activeVisual = getActiveVisual();
    const textToDisplay = currentLesson?.captionTextSource === 'script' ? activeVisual?.scriptText : activeVisual?.overlayText;
    
    // Logic for blank screen on load
    const showBlankScreen = !isPlaying && currentTime === 0;
    const showThumbnail = !isPlaying && currentTime === 0 && currentLesson.thumbnailData;

    // CAPTION HELPERS
    const getPositionClass = (pos: CaptionPosition) => { switch(pos) { case 'Top': return 'top-[15%] bottom-auto'; case 'Center': return 'top-1/2 -translate-y-1/2 bottom-auto'; default: return 'bottom-[15%] top-auto'; } };
    const getSizeClass = (size: CaptionSize) => { switch(size) { case 'Small': return 'scale-75'; case 'Large': return 'scale-125'; default: return 'scale-100'; } };
    const getCaptionContainerClasses = (style: CaptionStyle) => {
        const base = `absolute left-0 right-0 flex justify-center transition-all duration-300 z-20 px-4 ${getPositionClass(currentLesson?.captionPosition || 'Bottom')} ${getSizeClass(currentLesson?.captionSize || 'Medium')}`;
        if (style === 'News Ticker') return `${base} bottom-0 !top-auto !transform-none bg-red-600 text-white py-2 w-full justify-start pl-4`;
        if (style === 'Cinematic') return `${base} bg-black/80 py-4 border-y border-amber-500/50 w-full`;
        return base;
    };
    const getCaptionTextClasses = (style: CaptionStyle) => {
        switch(style) {
            case 'Outline': return "text-white text-2xl font-bold tracking-tight text-center [text-shadow:-2px_-2px_0_#000,2px_-2px_0_#000,-2px_2px_0_#000,2px_2px_0_#000]";
            case 'Cinematic': return "text-amber-50 text-xl tracking-[0.2em] font-serif uppercase text-center";
            case 'Modern': return "bg-indigo-600/90 text-white text-xl font-bold px-6 py-3 rounded-2xl shadow-xl transform -rotate-1 text-center";
            case 'Karaoke': return "text-5xl md:text-6xl font-black text-yellow-400 drop-shadow-[0_4px_4px_rgba(0,0,0,1)] stroke-black text-center leading-tight";
            case 'Minimalist': return "bg-white/90 text-slate-800 text-sm font-bold px-4 py-1 rounded-full border border-slate-200 tracking-wide";
            case 'News Ticker': return "text-white font-mono uppercase tracking-widest animate-pulse";
            case 'Typewriter': return "text-slate-900 font-mono text-lg text-center";
            case 'Comic Book': return "bg-white border-4 border-black text-black font-black text-2xl uppercase px-4 py-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]";
            case 'Neon Glow': return "text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-violet-500 font-bold text-3xl drop-shadow-[0_0_10px_rgba(167,139,250,0.8)] text-center";
            case 'Subtitle': return "text-white text-lg bg-black/60 px-3 py-1.5 rounded shadow-sm leading-relaxed max-w-3xl text-center";
            case 'Handwritten': return "text-slate-100 font-serif italic text-3xl drop-shadow-md text-center";
            default: return "text-white font-bold text-xl drop-shadow-md text-center";
        }
    };
    const getCustomCaptionStyle = (): React.CSSProperties => {
        const styles: React.CSSProperties = {};
        if (currentLesson?.captionColor) styles.color = currentLesson.captionColor;
        if (currentLesson?.captionBgColor) styles.backgroundColor = currentLesson.captionBgColor;
        if (currentLesson?.captionOutlineColor) { styles.WebkitTextStroke = `1px ${currentLesson.captionOutlineColor}`; styles.textShadow = 'none'; }
        if (currentLesson?.captionBgColor) { styles.padding = '4px 12px'; styles.borderRadius = '6px'; styles.display = 'inline-block'; }
        return styles;
    };

    const renderViralCaptions = () => {
        if (wordTimings.length === 0) return null;
        const currentIndex = wordTimings.findIndex(w => currentTime >= w.start && currentTime < w.end);
        if (currentIndex === -1 && currentTime > 0 && currentTime < currentLesson.durationSeconds) return null;
        const chunkStart = Math.max(0, currentIndex - 1);
        const chunkEnd = Math.min(wordTimings.length, currentIndex + 2);
        const chunk = wordTimings.slice(chunkStart, chunkEnd);
        let containerClasses = `absolute left-0 right-0 z-30 pointer-events-none flex justify-center items-center ${getPositionClass(currentLesson.captionPosition || 'Center')} ${getSizeClass(currentLesson.captionSize || 'Medium')}`;
        return (
            <div className={containerClasses}>
                <div className="flex flex-wrap justify-center gap-3 max-w-3xl px-8" style={getCustomCaptionStyle()}>
                    {chunk.map((w, idx) => {
                        const isActive = chunkStart + idx === currentIndex;
                        const wordClass = isActive ? "text-yellow-400 scale-110 -rotate-2 drop-shadow-[0_4px_0_rgba(0,0,0,1)] z-10 font-black text-5xl transition-all" : "text-white/90 font-black text-5xl transition-all";
                        return <span key={idx} className={wordClass}>{w.word}</span>;
                    })}
                </div>
            </div>
        );
    };

    // Get current analysis data
    const lessonExtras = analyzedData[currentLesson.id];

    return (
        <div 
            className="flex flex-col h-screen overflow-hidden relative" 
            style={{ 
                backgroundColor: bgColor, 
                fontFamily: fontFamily, 
                color: textColor,
                fontWeight: isBoldText ? '600' : 'normal'
            }}
        >
            
            {/* GLOBAL COMPLETION OVERLAY */}
            {showCompletionOverlay && certificatesEnabled && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/90 backdrop-blur-md animate-fade-in p-8">
                    <div className="bg-white rounded-2xl shadow-2xl p-12 max-w-2xl w-full text-center relative overflow-hidden animate-slide-up border-4 border-yellow-400">
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-yellow-400 via-orange-500 to-yellow-400 animate-pulse"></div>
                        <div className="w-24 h-24 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner animate-bounce">
                            <Award size={48} />
                        </div>
                        <h2 className="text-4xl font-bold text-slate-900 mb-2">Congratulations!</h2>
                        <p className="text-lg text-slate-500 mb-8">You have successfully completed <span className="font-bold" style={{color: accentColor}}>{course.title}</span>.</p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Button size="lg" onClick={onClaimCertificate} className="bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black border-none font-bold shadow-xl transform hover:scale-105 transition-all text-lg px-8">
                                <Award size={24} className="mr-2"/> Claim Your Certificate
                            </Button>
                            <Button size="lg" variant="outline" onClick={() => setShowCompletionOverlay(false)}>
                                Review Course
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <header className="flex items-center justify-between px-6 py-3 border-b z-50 shadow-md flex-shrink-0 h-20 bg-white" style={{ borderColor: borderColor }}>
                <div className="flex items-center gap-6 flex-1 min-w-0">
                    <button 
                        onClick={onExit} 
                        className="flex-shrink-0 px-4 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-sm hover:shadow-md transform hover:-translate-y-0.5 duration-200 border border-transparent"
                        style={{ backgroundColor: accentColor, color: '#fff' }}
                    >
                        <ArrowLeft size={16} />
                        <span className="text-sm font-bold">Back to Dashboard</span>
                    </button>
                    
                    {/* Divider */}
                    <div className="h-8 w-px bg-slate-200 hidden md:block"></div>

                    {/* Title Block */}
                    <div className="hidden md:flex flex-col justify-center min-w-0">
                        <h1 className="text-xl font-bold leading-none truncate" style={{color: primaryColor}}>{course.title}</h1>
                        <p className="text-sm font-normal mt-1 truncate opacity-70" style={{color: textColor}}>{course.headline}</p>
                    </div>
                </div>

                <div className="flex items-center gap-4 z-10 flex-shrink-0 ml-4">
                    {/* Progress Bar */}
                    <div className="hidden sm:flex flex-col items-end">
                         <div className="flex items-center justify-between w-full text-xs font-bold mb-1 uppercase tracking-wider opacity-60" style={{color: textColor}}>
                            <span>YOUR PROGRESS</span>
                            <span className="ml-2 text-sm" style={{color: accentColor}}>{progressPercent}%</span>
                         </div>
                         <div className="w-96 h-3 bg-slate-200 rounded-full overflow-hidden shadow-inner border border-slate-300/50">
                            <div className="h-full transition-all duration-500 shadow-[0_0_10px_rgba(255,255,255,0.4)]" style={{width: `${progressPercent}%`, backgroundColor: accentColor}}></div>
                         </div>
                    </div>

                    {/* Certificate Button */}
                    {certificatesEnabled && completedCount === totalLessons && (
                        <Button size="sm" onClick={onClaimCertificate} className="bg-yellow-400 hover:bg-yellow-500 text-yellow-900 border-none shadow-sm flex items-center gap-2 animate-pulse">
                            <Award size={16} /> <span className="hidden lg:inline">Certificate</span>
                        </Button>
                    )}
                    
                    {/* Mobile Menu */}
                    <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-slate-100 rounded-lg lg:hidden" style={{color: textColor}}>
                        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden relative">
                
                {/* 1. LEFT SIDEBAR (Curriculum) */}
                <div className={`
                    absolute lg:relative 
                    inset-y-0 lg:inset-y-auto 
                    left-0 w-96 
                    lg:h-fit lg:max-h-[calc(100vh-8rem)]
                    lg:mt-10 lg:ml-10 lg:mb-10
                    lg:rounded-t-3xl lg:rounded-b-3xl
                    lg:shadow-xl
                    overflow-hidden

                    transform transition-transform duration-300 z-40 flex flex-col
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:w-0 lg:m-0 lg:border-none'}
                `}
                style={{ backgroundColor: '#ffffff', borderColor: borderColor, borderWidth: '1px', borderStyle: 'solid' }}
                >
                    <div className="p-6 text-white sticky top-0 z-10" style={{ backgroundColor: primaryColor }}>
                        <h2 className="font-bold text-base uppercase tracking-wider flex items-center gap-2"><Layout size={16}/> Course Curriculum</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                        {course.modules.map((module, mIdx) => {
                            const isExpanded = expandedModules[module.id];
                            return (
                                <div key={module.id} className="group mb-4 rounded-xl overflow-hidden bg-white shadow-md" style={{ borderColor: borderColor, borderWidth: '1px', borderStyle: 'solid' }}>
                                    {/* Module Card Header */}
                                    <button 
                                        onClick={() => toggleModule(module.id)}
                                        className={`w-full flex items-center justify-between p-4 text-white transition-all`}
                                        style={{ backgroundColor: primaryColor }}
                                    >
                                        <div className="font-medium text-base flex items-center gap-3">
                                            <span className="bg-white/20 w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono">{mIdx + 1}</span>
                                            <span className="text-left">{module.title}</span>
                                        </div>
                                        {isExpanded ? <ChevronUp size={20} className="opacity-80" /> : <ChevronDown size={20} className="opacity-80" />}
                                    </button>
                                    
                                    {/* Lessons Dropdown */}
                                    {isExpanded && (
                                        <div className="bg-white animate-slide-up">
                                            {module.lessons.map((lesson, lIdx) => {
                                                const isActive = mIdx === currentModuleIndex && lIdx === currentLessonIndex;
                                                const isCompleted = completedLessonIds.includes(lesson.id);
                                                
                                                // Dynamic active styles
                                                const activeStyle = isActive ? { backgroundColor: `${primaryColor}15`, borderLeftColor: accentColor } : { borderLeftColor: 'transparent' };
                                                const iconColor = isCompleted ? '#10b981' : isActive ? accentColor : '#cbd5e1';
                                                
                                                // Lesson text color logic
                                                const lessonTextColor = isActive ? primaryColor : isCompleted ? '#64748b' : '#334155';

                                                return (
                                                    <button 
                                                        key={lesson.id}
                                                        onClick={() => handleLessonChange(mIdx, lIdx)}
                                                        className={`w-full text-left px-5 py-4 flex items-start gap-3 transition-colors border-l-4 border-b border-slate-100 last:border-0 hover:bg-slate-50`}
                                                        style={activeStyle}
                                                    >
                                                        <div className="mt-0.5 flex-shrink-0" style={{ color: iconColor }}>
                                                            {isCompleted ? <CheckCircle2 size={18} fill="#ecfdf5"/> : isActive ? <PlayCircle size={18} fill={`${primaryColor}10`}/> : <Circle size={18}/>}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-semibold leading-snug mb-1" style={{ color: lessonTextColor }}>{lesson.title}</p>
                                                            <span className="text-[10px] text-slate-400 flex items-center gap-1"><Clock size={10}/> {lesson.duration}</span>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 2. MAIN CONTENT AREA (Split Layout) */}
                <div className="flex-1 flex flex-col relative overflow-y-auto custom-scrollbar scroll-smooth" style={{ backgroundColor: bgColor }}>
                    <div id="lesson-content-top"></div>
                    <div className="p-6 md:p-10 max-w-[1800px] mx-auto w-full">
                        
                        <div className="flex flex-col xl:flex-row gap-8 items-start">
                            
                            {/* LEFT COLUMN: Video + Content (Fluid) */}
                            <div className="flex-1 w-full min-w-0 space-y-8">
                                
                                {/* Video Player Card */}
                                <div 
                                    ref={playerContainerRef}
                                    className={`relative aspect-video bg-white rounded-2xl overflow-hidden shadow-2xl group/video border border-slate-200 z-30 ${isFullscreen ? 'fixed inset-0 z-[100] rounded-none h-screen w-screen' : ''}`}
                                >
                                    {/* ERROR STATE - Video URL failed and no fallback content */}
                                    {showVideoError ? (
                                        <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-center p-8">
                                            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
                                                <AlertCircle size={32} className="text-red-400" />
                                            </div>
                                            <h3 className="text-xl font-bold text-white mb-2">Video Unavailable</h3>
                                            <p className="text-slate-400 text-sm max-w-md">
                                                This video's source is currently unavailable. The original video URL may have expired or been removed.
                                            </p>
                                            <p className="text-slate-500 text-xs mt-4">
                                                URL: {streamableVideoUrl?.substring(0, 50)}...
                                            </p>
                                        </div>
                                    ) : hasHostedVideo ? (
                                        <video
                                            ref={hostedVideoRef}
                                            src={streamableVideoUrl}
                                            className="absolute inset-0 w-full h-full object-contain bg-black"
                                            preload="auto"
                                            onTimeUpdate={handleTimeUpdate}
                                            onEnded={handleAudioEnded}
                                            onLoadedMetadata={(e) => {
                                                const vid = e.currentTarget;
                                                if (vid.duration && !isNaN(vid.duration) && isFinite(vid.duration)) {
                                                    setVideoDuration(vid.duration);
                                                }
                                            }}
                                            onCanPlay={() => {
                                                console.log('Video can play');
                                            }}
                                            onWaiting={() => {
                                                console.log('Video waiting for data...');
                                            }}
                                            onError={(e) => {
                                                console.log('Hosted video failed to load:', e.currentTarget.error?.message);
                                                setHostedVideoFailed(true);
                                                setIsPlaying(false);
                                            }}
                                            playsInline
                                        />
                                    ) : hasVisualsButNoAudio ? (
                                        /* SPECIAL CASE: Has images but no audio - show warning */
                                        <div className="absolute inset-0 bg-black flex flex-col items-center justify-center text-center p-8">
                                            {/* Show first image as background */}
                                            {currentLesson.visuals && currentLesson.visuals[0] && (
                                                <img 
                                                    src={currentLesson.visuals[0].imageData.startsWith('/media/') || currentLesson.visuals[0].imageData.startsWith('/objects/') || currentLesson.visuals[0].imageData.startsWith('http') || currentLesson.visuals[0].imageData.startsWith('data:') ? currentLesson.visuals[0].imageData : `data:image/png;base64,${currentLesson.visuals[0].imageData}`}
                                                    className="absolute inset-0 w-full h-full object-cover opacity-30"
                                                />
                                            )}
                                            <div className="relative z-10">
                                                <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mb-4 mx-auto">
                                                    <AlertCircle size={32} className="text-amber-400" />
                                                </div>
                                                <h3 className="text-xl font-bold text-white mb-2">Audio Not Generated</h3>
                                                <p className="text-slate-400 text-sm max-w-md mb-4">
                                                    This video has {currentLesson.visuals?.length || 0} images but no audio narration. 
                                                    The audio needs to be generated before this video can play.
                                                </p>
                                                <p className="text-slate-500 text-xs">
                                                    Go to the Creator Dashboard and edit this video to generate audio.
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {/* IMAGES + AUDIO MODE - Original rendering */}
                                            <div className="absolute inset-0 bg-black flex items-center justify-center">
                                                {!showBlankScreen && (
                                                    showThumbnail ? (
                                                        <img src={currentLesson.thumbnailData?.startsWith('/media/') || currentLesson.thumbnailData?.startsWith('/objects/') || currentLesson.thumbnailData?.startsWith('http') || currentLesson.thumbnailData?.startsWith('data:') ? currentLesson.thumbnailData : `data:image/png;base64,${currentLesson.thumbnailData}`} className="w-full h-full object-contain opacity-90" />
                                                    ) : activeVisual ? (
                                                        <img 
                                                            key={activeVisual.id}
                                                            src={activeVisual.imageData.startsWith('/media/') || activeVisual.imageData.startsWith('/objects/') || activeVisual.imageData.startsWith('http') || activeVisual.imageData.startsWith('data:') ? activeVisual.imageData : `data:image/png;base64,${activeVisual.imageData}`}
                                                            className={`w-full h-full object-contain transition-transform duration-[20s] ease-linear ${activeVisual.zoomDirection === 'out' ? 'scale-[1.03]' : 'scale-100'} ${isPlaying ? (activeVisual.zoomDirection === 'out' ? 'scale-100' : 'scale-[1.03]') : ''}`}
                                                        />
                                                    ) : !hasAudioVisualContent ? (
                                                        <div className="text-center p-8">
                                                            <AlertCircle size={48} className="text-slate-500 mx-auto mb-4" />
                                                            <h3 className="text-lg font-bold text-white mb-2">No Video Content</h3>
                                                            <p className="text-slate-400 text-sm">This lesson has no playable content. The video may not have been fully generated.</p>
                                                        </div>
                                                    ) : (
                                                        <div className="text-slate-600 flex flex-col items-center"><Loader2 className="animate-spin mb-2"/><span className="text-xs">Loading Visuals...</span></div>
                                                    )
                                                )}
                                            </div>

                                            {/* Captions completely disabled */}
                                        </>
                                    )}

                                    {/* Play Overlay - Styled like completion screen */}
                                    {!isPlaying && !isCourseCompleted && (
                                        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer" onClick={isAudioLoading ? undefined : handlePlayPause}>
                                            <div className={`w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4 border-2 border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.3)] ${isAudioLoading ? 'animate-pulse' : 'hover:scale-110'} transition-transform`}>
                                                {isAudioLoading ? (
                                                    <Loader2 size={48} className="text-emerald-500 animate-spin" />
                                                ) : (
                                                    <PlayCircle size={48} className="text-emerald-500" />
                                                )}
                                            </div>
                                            <h2 className="text-3xl font-bold text-white mb-2">
                                                {isAudioLoading ? 'Loading Audio...' : 'Press Play!'}
                                            </h2>
                                            <p className="text-slate-400 text-sm">
                                                {isAudioLoading ? 'Please wait while we load the lesson' : 'Click anywhere to start the lesson'}
                                            </p>
                                        </div>
                                    )}
                                    {isPlaying && <div className="absolute inset-0 cursor-pointer" onClick={handlePlayPause}></div>}

                                    {/* Completion Overlay */}
                                    {isCourseCompleted && !isPlaying && (
                                        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm p-8 text-center">
                                            <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4 border-2 border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                                                <CheckCircle2 size={48} className="text-emerald-500" />
                                            </div>
                                            <h2 className="text-3xl font-bold text-white mb-2">Lesson Complete!</h2>
                                            <div className="flex gap-4 mt-6">
                                                <button onClick={() => {onToggleComplete(currentLesson.id); handlePlayPause();}} className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/20 transition-colors">Replay</button>
                                                <button onClick={handleNext} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-lg transition-colors flex items-center gap-2">Next Lesson <ChevronRight size={16}/></button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Controls Bar */}
                                    <div className={`bg-slate-900/90 border-t border-slate-800 p-4 absolute bottom-0 left-0 right-0 z-50 transition-opacity duration-300 ${isPlaying && !isFullscreen ? 'opacity-0 group-hover/video:opacity-100' : 'opacity-100'}`}>
                                        <div className="space-y-3">
                                            {(() => {
                                                // Use actual video duration for hosted videos, fallback to lesson duration
                                                const effectiveDuration = (hasHostedVideo && videoDuration) ? videoDuration : (currentLesson.durationSeconds || 1);
                                                const progressPercent = Math.min(100, (currentTime / effectiveDuration) * 100);
                                                return (
                                                    <div className="w-full h-1.5 bg-slate-700 rounded-full cursor-pointer relative group" onClick={(e) => {
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                                                        if (hasHostedVideo && hostedVideoRef.current) {
                                                            const duration = hostedVideoRef.current.duration || effectiveDuration;
                                                            if (isFinite(duration) && duration > 0) {
                                                                hostedVideoRef.current.currentTime = pos * duration;
                                                                setCurrentTime(hostedVideoRef.current.currentTime);
                                                            }
                                                        } else if(audioRef.current && effectiveDuration > 0) {
                                                            audioRef.current.currentTime = pos * effectiveDuration;
                                                            setCurrentTime(audioRef.current.currentTime);
                                                        }
                                                    }}>
                                                        <div className="absolute top-0 left-0 h-full bg-indigo-500 rounded-full" style={{ width: `${progressPercent}%` }}></div>
                                                        <div className="absolute top-1/2 -translate-y-1/2 h-3 w-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `${progressPercent}%` }}></div>
                                                    </div>
                                                );
                                            })()}
                                            
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <button 
                                                        onClick={handlePlayPause} 
                                                        disabled={isAudioLoading && !hasHostedVideo}
                                                        className={`text-white hover:text-indigo-400 transition-colors ${isAudioLoading && !hasHostedVideo ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                    >
                                                        {isAudioLoading && !hasHostedVideo ? (
                                                            <Loader2 size={28} className="animate-spin" />
                                                        ) : isPlaying ? (
                                                            <PauseCircle size={28} className="fill-current"/>
                                                        ) : (
                                                            <PlayCircle size={28} className="fill-current"/>
                                                        )}
                                                    </button>
                                                    <div className="text-xs font-mono text-slate-400">
                                                        {Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')} / {currentLesson.duration}
                                                    </div>
                                                    
                                                    {/* NAVIGATION BUTTONS */}
                                                    <div className="flex items-center gap-2 ml-4">
                                                        <button 
                                                            onClick={handlePrevious} 
                                                            className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 px-3 py-1.5 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                                                            disabled={currentModuleIndex === 0 && currentLessonIndex === 0}
                                                        >
                                                            <SkipBack size={14}/> Previous Lesson
                                                        </button>
                                                        <div className="h-4 w-px bg-slate-700 mx-1"></div>
                                                        <button 
                                                            onClick={handleNext} 
                                                            className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 px-3 py-1.5 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                                                            disabled={currentModuleIndex === course.modules.length - 1 && currentLessonIndex === currentModule.lessons.length - 1}
                                                        >
                                                            Next Lesson <SkipForward size={14}/>
                                                        </button>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex items-center gap-3">
                                                    <button 
                                                        onClick={handleDownloadVideo} 
                                                        disabled={isDownloadingVideo}
                                                        className="text-xs font-bold px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center gap-2 shadow-lg"
                                                    >
                                                        {isDownloadingVideo ? <Loader2 size={14} className="animate-spin"/> : <Download size={16}/>}
                                                        {isDownloadingVideo ? `Rendering ${Math.round(downloadProgress)}%` : 'Download MP4'}
                                                    </button>
                                                    <button onClick={() => onToggleComplete(currentLesson.id)} className={`text-xs font-bold px-4 py-1.5 rounded-lg transition-all flex items-center gap-2 ${completedLessonIds.includes(currentLesson.id) ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'}`}>
                                                        {completedLessonIds.includes(currentLesson.id) ? <CheckCircle2 size={14} /> : <div className="w-3.5 h-3.5 rounded-full border-2 border-current"></div>}
                                                        <span className="hidden sm:inline">{completedLessonIds.includes(currentLesson.id) ? 'Complete' : 'Mark Done'}</span>
                                                    </button>
                                                    <button onClick={toggleFullscreen} className="p-2 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors">
                                                        {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* TABBED CONTENT AREA */}
                                <div className="rounded-2xl">
                                    {/* Tab Header - Folder Style */}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setActiveContentTab('content')}
                                            className={`px-5 py-3 text-sm font-semibold uppercase tracking-wide flex items-center justify-center gap-2 transition-all rounded-t-xl border-2 ${activeContentTab === 'content' ? 'bg-blue-600 text-white shadow-lg border-blue-700 border-b-0 relative z-10 mb-[-2px]' : 'bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-400'}`}
                                        >
                                            <BookOpen size={16}/> Lesson Content
                                        </button>
                                        <button
                                            onClick={() => setActiveContentTab('takeaways')}
                                            className={`px-5 py-3 text-sm font-semibold uppercase tracking-wide flex items-center justify-center gap-2 transition-all rounded-t-xl border-2 ${activeContentTab === 'takeaways' ? 'bg-purple-600 text-white shadow-lg border-purple-700 border-b-0 relative z-10 mb-[-2px]' : 'bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-400'}`}
                                        >
                                            <Lightbulb size={16}/> Key Takeaways
                                        </button>
                                        <button
                                            onClick={() => setActiveContentTab('actions')}
                                            className={`px-5 py-3 text-sm font-semibold uppercase tracking-wide flex items-center justify-center gap-2 transition-all rounded-t-xl border-2 ${activeContentTab === 'actions' ? 'bg-emerald-600 text-white shadow-lg border-emerald-700 border-b-0 relative z-10 mb-[-2px]' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-400'}`}
                                        >
                                            <CheckSquare size={16}/> Action Items
                                        </button>
                                        <button
                                            onClick={() => setActiveContentTab('nextsteps')}
                                            className={`px-5 py-3 text-sm font-semibold uppercase tracking-wide flex items-center justify-center gap-2 transition-all rounded-t-xl border-2 ${activeContentTab === 'nextsteps' ? 'bg-amber-500 text-white shadow-lg border-amber-600 border-b-0 relative z-10 mb-[-2px]' : 'bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-400'}`}
                                        >
                                            <ArrowLeft size={16} className="rotate-180"/> Your Next Steps
                                        </button>
                                    </div>

                                    {/* Tab Content */}
                                    <div className={`p-8 md:p-12 border-2 rounded-b-2xl rounded-tr-2xl transition-colors bg-white ${activeContentTab === 'content' ? 'border-blue-700' : activeContentTab === 'takeaways' ? 'border-purple-700' : activeContentTab === 'actions' ? 'border-emerald-700' : 'border-amber-600'}`}>
                                        {/* Lesson Content Tab */}
                                        {activeContentTab === 'content' && (
                                            <div className="animate-fade-in">
                                                <div className="flex items-center justify-between mb-8 border-b border-slate-100 pb-6">
                                                    <div>
                                                        <h1 className="text-3xl font-bold mb-2" style={{color: textColor}}>{currentLesson.title}</h1>
                                                        <div className="flex items-center gap-2 text-sm text-slate-500">
                                                            <span className="font-bold" style={{color: accentColor}}>{course.title}</span>
                                                            <span className="text-slate-300">•</span>
                                                            <span>Module {currentModuleIndex + 1}</span>
                                                            <span className="text-slate-300">•</span>
                                                            <span className="flex items-center gap-1"><Clock size={14}/> {currentLesson.duration}</span>
                                                        </div>
                                                    </div>
                                                    <button 
                                                        onClick={handleDownloadVideo}
                                                        disabled={isDownloadingVideo}
                                                        className="text-xs font-bold bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm w-40 justify-center"
                                                    >
                                                        {isDownloadingVideo ? <Loader2 size={14} className="animate-spin"/> : <Download size={14}/>} {isDownloadingVideo ? `Saving ${Math.round(downloadProgress)}%` : 'Download Video'}
                                                    </button>
                                                </div>
                                                <div className="prose prose-slate prose-lg max-w-none">
                                                    {renderFormattedContent(currentLesson.sourceText)}
                                                </div>
                                            </div>
                                        )}

                                        {/* Key Takeaways Tab */}
                                        {activeContentTab === 'takeaways' && (
                                            <div className="animate-fade-in">
                                                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                                                    <div className="p-2 bg-purple-100 rounded-xl"><Lightbulb size={24} className="text-purple-600"/></div>
                                                    <div>
                                                        <h2 className="text-2xl font-bold text-slate-800">Key Takeaways</h2>
                                                        <p className="text-sm text-slate-500">The most important points from this lesson</p>
                                                    </div>
                                                </div>
                                                <div className="space-y-4">
                                                    {(lessonExtras?.takeaways?.length || 0) > 0 ? (
                                                        lessonExtras?.takeaways.map((point, idx) => (
                                                            <div key={idx} className="flex items-start gap-4 p-4 bg-purple-50 rounded-xl border border-purple-100">
                                                                <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-bold shadow-md flex-shrink-0">{idx + 1}</div>
                                                                <p className="text-base font-medium leading-relaxed pt-1" style={{ color: textColor }}>{point}</p>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="text-center py-8 px-4 bg-slate-50 rounded-xl border border-slate-200">
                                                            <Lightbulb size={32} className="text-slate-300 mx-auto mb-3"/>
                                                            <p className="text-slate-500 font-medium">Key takeaways haven't been generated for this lesson yet.</p>
                                                            <p className="text-slate-400 text-sm mt-2 mb-4">Click below to generate them using AI.</p>
                                                            <button
                                                                onClick={generateTakeawaysOnDemand}
                                                                disabled={isGeneratingTakeaways}
                                                                className="px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:bg-purple-400 flex items-center gap-2 mx-auto"
                                                            >
                                                                {isGeneratingTakeaways ? (
                                                                    <><Loader2 size={16} className="animate-spin"/> Generating...</>
                                                                ) : (
                                                                    <><Sparkles size={16}/> Generate Takeaways</>
                                                                )}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Action Items Tab */}
                                        {activeContentTab === 'actions' && (
                                            <div className="animate-fade-in">
                                                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                                                    <div className="p-2 bg-emerald-100 rounded-xl"><CheckSquare size={24} className="text-emerald-600"/></div>
                                                    <div>
                                                        <h2 className="text-2xl font-bold text-slate-800">Action Items</h2>
                                                        <p className="text-sm text-slate-500">Practical steps to apply what you've learned</p>
                                                    </div>
                                                </div>
                                                <div className="space-y-4">
                                                    {(lessonExtras?.actions?.length || 0) > 0 ? (
                                                        lessonExtras?.actions.map((action, idx) => (
                                                            <div key={idx} className="flex items-start gap-4 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                                                                <div className="flex-shrink-0 text-emerald-600 mt-0.5"><CheckCircle2 size={24}/></div>
                                                                <p className="text-base font-medium leading-relaxed pt-0.5" style={{ color: textColor }}>{action}</p>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="text-center py-8 px-4 bg-slate-50 rounded-xl border border-slate-200">
                                                            <CheckSquare size={32} className="text-slate-300 mx-auto mb-3"/>
                                                            <p className="text-slate-500 font-medium">Action items haven't been generated for this lesson yet.</p>
                                                            <p className="text-slate-400 text-sm mt-2 mb-4">Click below to generate them using AI.</p>
                                                            <button
                                                                onClick={generateTakeawaysOnDemand}
                                                                disabled={isGeneratingTakeaways}
                                                                className="px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:bg-emerald-400 flex items-center gap-2 mx-auto"
                                                            >
                                                                {isGeneratingTakeaways ? (
                                                                    <><Loader2 size={16} className="animate-spin"/> Generating...</>
                                                                ) : (
                                                                    <><Sparkles size={16}/> Generate Action Items</>
                                                                )}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Your Next Steps Tab */}
                                        {activeContentTab === 'nextsteps' && (
                                            <div className="animate-fade-in">
                                                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                                                    <div className="p-2 bg-amber-100 rounded-xl"><ArrowLeft size={24} className="text-amber-600 rotate-180"/></div>
                                                    <div>
                                                        <h2 className="text-2xl font-bold text-slate-800">Your Next Steps</h2>
                                                        <p className="text-sm text-slate-500">Continue your learning journey</p>
                                                    </div>
                                                </div>
                                                <div className="space-y-4">
                                                    {/* Progress Summary */}
                                                    <div className="p-5 bg-gradient-to-r from-slate-50 to-slate-100 rounded-xl border border-slate-200">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <span className="font-semibold text-slate-700">Course Progress</span>
                                                            <span className="text-lg font-bold" style={{ color: accentColor }}>{progressPercent}%</span>
                                                        </div>
                                                        <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                                                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progressPercent}%`, backgroundColor: accentColor }}></div>
                                                        </div>
                                                        <p className="text-sm text-slate-500 mt-2">{completedCount} of {totalLessons} lessons completed</p>
                                                    </div>

                                                    {/* Next Lesson Card */}
                                                    {currentModuleIndex < course.modules.length - 1 || currentLessonIndex < currentModule.lessons.length - 1 ? (
                                                        <div className="p-5 bg-amber-50 rounded-xl border border-amber-200">
                                                            <h3 className="font-semibold text-amber-800 mb-2 flex items-center gap-2"><PlayCircle size={18}/> Up Next</h3>
                                                            <p className="text-slate-700 font-medium">
                                                                {currentLessonIndex < currentModule.lessons.length - 1 
                                                                    ? currentModule.lessons[currentLessonIndex + 1]?.title 
                                                                    : course.modules[currentModuleIndex + 1]?.lessons[0]?.title}
                                                            </p>
                                                            <Button 
                                                                onClick={handleNext}
                                                                className="mt-4"
                                                                style={{ backgroundColor: accentColor }}
                                                            >
                                                                Continue to Next Lesson
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <div className="p-5 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
                                                            {certificatesEnabled ? (
                                                                <>
                                                                    <Award size={48} className="text-emerald-600 mx-auto mb-3"/>
                                                                    <h3 className="font-bold text-emerald-800 text-lg mb-2">Congratulations!</h3>
                                                                    <p className="text-slate-600">You've reached the final lesson. Complete it to earn your certificate!</p>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <CheckCircle2 size={48} className="text-emerald-600 mx-auto mb-3"/>
                                                                    <h3 className="font-bold text-emerald-800 text-lg mb-2">Final Lesson</h3>
                                                                    <p className="text-slate-600">You've reached the final lesson. Complete it to finish the course!</p>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Recommended Actions */}
                                                    <div className="p-5 bg-blue-50 rounded-xl border border-blue-200">
                                                        <h3 className="font-semibold text-blue-800 mb-3">Recommended Actions</h3>
                                                        <ul className="space-y-2">
                                                            <li className="flex items-center gap-2 text-slate-700"><CheckCircle2 size={16} className="text-blue-600"/> Review the Key Takeaways</li>
                                                            <li className="flex items-center gap-2 text-slate-700"><CheckCircle2 size={16} className="text-blue-600"/> Complete the Action Items</li>
                                                            <li className="flex items-center gap-2 text-slate-700"><CheckCircle2 size={16} className="text-blue-600"/> Download the lesson video for offline study</li>
                                                            <li className="flex items-center gap-2 text-slate-700"><CheckCircle2 size={16} className="text-blue-600"/> Check the Lesson Resources for additional materials</li>
                                                        </ul>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                            </div>

                            {/* RIGHT COLUMN: Ecover + Resources (Fixed) */}
                            <div className="w-full xl:w-[420px] flex-shrink-0 flex flex-col gap-6 sticky top-6">
                                
                                {/* Ecover Card */}
                                {coverUrl && (
                                    <div className="bg-transparent rounded-2xl overflow-hidden shadow-2xl transition-transform hover:scale-[1.01]">
                                         <img 
                                            src={coverUrl} 
                                            className="w-full h-auto object-contain bg-slate-900" 
                                            alt="Course Cover" 
                                        />
                                    </div>
                                )}

                                {/* Resources Card */}
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="p-4 text-white font-bold text-base uppercase tracking-wider flex items-center gap-2 bg-slate-600">
                                        <LinkIcon size={16}/> Lesson Resources
                                    </div>
                                    <div className="p-6 space-y-3 max-h-64 overflow-y-auto">
                                        {currentLesson.resources && currentLesson.resources.length > 0 ? (
                                            currentLesson.resources.map(res => {
                                                const isLink = res.type === 'link';
                                                
                                                const handleResourceClick = (e: React.MouseEvent) => {
                                                    e.preventDefault();
                                                    
                                                    if (isLink) {
                                                        // For external links, ensure URL has protocol and open in new tab
                                                        let linkUrl = res.url;
                                                        if (linkUrl) {
                                                            // Check if URL already has any protocol (http, https, mailto, ftp, tel, etc.)
                                                            const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(linkUrl);
                                                            if (!hasProtocol) {
                                                                linkUrl = 'https://' + linkUrl;
                                                            }
                                                        }
                                                        window.open(linkUrl, '_blank', 'noopener,noreferrer');
                                                    } else {
                                                        // For files (base64 or URL), trigger download
                                                        if (res.url.startsWith('data:')) {
                                                            // Handle base64 data URL
                                                            const [header, base64Data] = res.url.split(',');
                                                            const mimeMatch = header.match(/data:([^;]+)/);
                                                            const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
                                                            
                                                            const byteCharacters = atob(base64Data);
                                                            const byteNumbers = new Array(byteCharacters.length);
                                                            for (let i = 0; i < byteCharacters.length; i++) {
                                                                byteNumbers[i] = byteCharacters.charCodeAt(i);
                                                            }
                                                            const byteArray = new Uint8Array(byteNumbers);
                                                            const blob = new Blob([byteArray], { type: mimeType });
                                                            
                                                            downloadBlob(blob, res.fileName || res.title || 'download');
                                                        } else {
                                                            // Handle regular URL - fetch and download
                                                            fetch(res.url)
                                                                .then(response => response.blob())
                                                                .then(blob => {
                                                                    downloadBlob(blob, res.fileName || res.title || 'download');
                                                                })
                                                                .catch(() => {
                                                                    // Fallback: open in new tab
                                                                    window.open(res.url, '_blank');
                                                                });
                                                        }
                                                    }
                                                };
                                                
                                                return (
                                                    <button 
                                                        key={res.id} 
                                                        onClick={handleResourceClick}
                                                        className="w-full text-left flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 hover:shadow-md transition-all group cursor-pointer"
                                                    >
                                                        <div className="p-2.5 bg-white rounded-lg shadow-sm group-hover:scale-110 transition-transform" style={{ color: accentColor }}>
                                                            {isLink ? <LinkIcon size={18}/> : <FileText size={18}/>}
                                                        </div>
                                                        <div className="flex-1 min-w-0 pt-0.5">
                                                            <div className="text-sm font-bold text-slate-800 truncate group-hover:text-indigo-700 transition-colors">{res.title}</div>
                                                            <div className="text-[10px] text-slate-500 uppercase mt-0.5 font-bold tracking-wide">{isLink ? 'Link' : 'File'}</div>
                                                        </div>
                                                        <div className="self-center opacity-0 group-hover:opacity-100 transition-opacity text-slate-400">
                                                            {isLink ? <LinkIcon size={16} /> : <Download size={16} />}
                                                        </div>
                                                    </button>
                                                );
                                            })
                                        ) : (
                                            <div className="text-sm text-slate-400 text-center py-8 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                                                No resources attached.
                                            </div>
                                        )}
                                    </div>
                                </div>

                            </div>

                        </div>

                    </div>
                </div>

            </div>

            {/* Chat Widget - Floating Button */}
            <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none">
                {isChatOpen && (
                    <div className="bg-white w-80 h-96 rounded-2xl shadow-2xl border border-slate-200 mb-4 flex flex-col pointer-events-auto animate-slide-up overflow-hidden">
                        <div className="p-4 bg-indigo-900 text-white flex justify-between items-center">
                            <h3 className="font-bold flex items-center gap-2"><Sparkles size={16}/> Instructor Chat</h3>
                            <button onClick={() => setIsChatOpen(false)} className="hover:bg-white/20 p-1 rounded"><X size={16}/></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                            {chatMessages.map((msg) => (
                                <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] p-3 rounded-xl text-sm ${msg.sender === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm'}`}>
                                        {msg.text}
                                    </div>
                                </div>
                            ))}
                            <div ref={chatEndRef} />
                        </div>
                        <div className="p-3 bg-white border-t border-slate-200 flex gap-2">
                            <input 
                                className="flex-1 text-sm bg-slate-100 rounded-full px-4 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                placeholder="Type a question..."
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                            />
                            <button onClick={handleSendChat} className="bg-indigo-600 text-white p-2 rounded-full hover:bg-indigo-700 transition-colors">
                                <Send size={16}/>
                            </button>
                        </div>
                    </div>
                )}
                
                <button 
                    onClick={() => setIsChatOpen(!isChatOpen)}
                    className="pointer-events-auto bg-indigo-600 hover:bg-indigo-700 text-white rounded-full p-4 shadow-xl flex items-center gap-2 transition-transform hover:scale-105 group"
                >
                    <MessageCircle size={24} />
                    <span className="font-bold pr-2 group-hover:max-w-xs max-w-0 overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out opacity-0 group-hover:opacity-100">Ask Instructor</span>
                </button>
            </div>

            {/* Audio Elements */}
            {audioUrl && (
                <audio 
                    ref={audioRef}
                    src={audioUrl}
                    preload="auto"
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={handleAudioEnded}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onLoadedMetadata={(e) => {
                        const dur = e.currentTarget.duration;
                        if (dur && isFinite(dur) && dur > 0) {
                            console.log('Audio duration loaded:', dur);
                            setAudioDuration(dur);
                        }
                    }}
                    onError={(e) => {
                        console.error('Audio playback error:', e.currentTarget.error?.message);
                        setIsPlaying(false);
                    }}
                    onCanPlay={() => {
                        console.log('Audio ready to play');
                        setIsAudioReady(true);
                    }}
                />
            )}
            {currentLesson.backgroundMusicUrl && (
                <audio 
                    ref={bgMusicRef}
                    src={currentLesson.backgroundMusicUrl}
                    loop
                />
            )}
        </div>
    );
};
