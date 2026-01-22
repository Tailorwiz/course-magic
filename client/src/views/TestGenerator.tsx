import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../components/Button';
import { TextArea } from '../components/Input';
import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";
import { Loader2, PlayCircle, PauseCircle, Film, Timer, Zap, Gauge, Volume2, Music, Subtitles, AlignCenter } from 'lucide-react';
import { VisualAsset, VoiceOption, CaptionStyle, CaptionPosition, CaptionSize, VisualMode } from '../types';
import { pcmToWav, createSolidColorImage } from '../utils';

// Helper for Rate Limiting
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function withRetry<T>(fn: () => Promise<T>, retries = 5, initialDelay = 2000): Promise<T> {
    try {
        return await fn();
    } catch (error: any) {
        // Retry on 429 (Rate Limit), 5xx (Server Errors), or generic fetch/network errors
        const isRateLimit = error?.status === 429 || error?.code === 429 || error?.message?.includes('429') || error?.message?.toLowerCase().includes('quota');
        const isServerError = error?.status >= 500 || error?.code >= 500 || error?.message?.includes('500') || error?.message?.includes('503');
        const isNetworkError = error?.message?.toLowerCase().includes('network') || error?.message?.toLowerCase().includes('failed to fetch');
        
        if (retries > 0 && (isRateLimit || isServerError || isNetworkError)) {
            console.warn(`API Error (${error.message}). Retrying in ${initialDelay}ms...`);
            await delay(initialDelay);
            return withRetry(fn, retries - 1, initialDelay * 2);
        }
        throw error;
    }
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

const getVoiceModel = (name: VoiceOption) => {
    switch(name) {
        case 'Orion': return 'Fenrir'; 
        case 'Leo': return 'Puck';     
        case 'Marcus': return 'Charon'; 
        case 'Atlas': return 'Fenrir'; 
        case 'Caleb': return 'Puck';
        case 'Silas': return 'Charon';
        case 'Felix': return 'Puck';
        case 'Arthur': return 'Fenrir';
        case 'Magnus': return 'Charon';
        case 'Thorne': return 'Fenrir';
        case 'Odin': return 'Charon';
        case 'Kore': return 'Kore';
        case 'Zephyr': return 'Zephyr';
        default: return 'Puck';
    }
}

interface WordTiming {
    word: string;
    start: number;
    end: number;
}

export const TestGenerator = () => {
    const [inputContent, setInputContent] = useState('');
    const [selectedStyle, setSelectedStyle] = useState('Minimalist Flat Vector');
    const [voice, setVoice] = useState<VoiceOption>('Leo'); 
    const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('Viral (Strike)');
    const [captionPosition, setCaptionPosition] = useState<CaptionPosition>('Bottom');
    const [captionSize, setCaptionSize] = useState<CaptionSize>('Medium');
    const [captionColor, setCaptionColor] = useState<string>('#ffffff');
    const [captionBgColor, setCaptionBgColor] = useState<string>('');
    const [captionOutlineColor, setCaptionOutlineColor] = useState<string>('');

    const [useMusic, setUseMusic] = useState(true);
    const [selectedMusicTrack, setSelectedMusicTrack] = useState(MUSIC_TRACKS[0].url);
    const [showSubtitles, setShowSubtitles] = useState(false);
    const [visualPacing, setVisualPacing] = useState<'Normal' | 'Fast' | 'Turbo'>('Normal');
    
    // New Visual Mode State
    const [visualMode, setVisualMode] = useState<VisualMode>('AI_Scene');
    const [solidColor, setSolidColor] = useState<string>('#4f46e5');

    const [isGenerating, setIsGenerating] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    
    const [isPreviewingVoice, setIsPreviewingVoice] = useState(false);
    const [isPlayingMusicPreview, setIsPlayingMusicPreview] = useState(false);
    const voicePreviewRef = useRef<HTMLAudioElement | null>(null);
    const musicPreviewRef = useRef<HTMLAudioElement | null>(null);

    const [generatedScript, setGeneratedScript] = useState('');
    const [generatedVisuals, setGeneratedVisuals] = useState<VisualAsset[]>([]);
    const [wordTimings, setWordTimings] = useState<WordTiming[]>([]);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [durationSeconds, setDurationSeconds] = useState(0);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [activeVisual, setActiveVisual] = useState<VisualAsset | null>(null);
    const [previousVisual, setPreviousVisual] = useState<VisualAsset | null>(null);

    const audioRef = useRef<HTMLAudioElement>(null);
    const bgMusicRef = useRef<HTMLAudioElement>(null);

    const visualStyles = [
        "Minimalist Flat Vector", "Photorealistic 4K", "Cinematic Lighting", "Hand-drawn Sketch", 
        "3D Isometric Render", "Cyberpunk Neon", "Watercolor Illustration", "Pixar Animation Style",
        "Abstract Geometric", "Vintage Blueprint"
    ];
    const voices: VoiceOption[] = ['Leo', 'Orion', 'Marcus', 'Atlas', 'Caleb', 'Silas', 'Felix', 'Arthur', 'Magnus', 'Thorne', 'Odin', 'Kore', 'Zephyr'];
    const captionStyles: CaptionStyle[] = ['Viral (Strike)', 'Viral (Clean)', 'Viral (Box)', 'Viral (Pop)', 'None', 'Modern', 'Outline', 'Cinematic', 'Karaoke', 'Minimalist', 'News Ticker', 'Typewriter', 'Comic Book', 'Neon Glow', 'Subtitle', 'Handwritten'];

    useEffect(() => {
        if (bgMusicRef.current) { bgMusicRef.current.volume = 0.15; }
    }, [useMusic, audioUrl, isPlaying]);

    const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

    const calculateWordTimings = (fullScript: string, totalDuration: number): WordTiming[] => {
        const words = fullScript.trim().split(/\s+/);
        const totalChars = words.reduce((acc, w) => acc + w.length, 0);
        let currentTime = 0;
        return words.map(word => {
            const duration = (word.length / totalChars) * totalDuration;
            const t = { word, start: currentTime, end: currentTime + duration };
            currentTime += duration;
            return t;
        });
    };

    const handleTestVoice = async () => {
        if (isPreviewingVoice) return;
        setIsPreviewingVoice(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
              model: "gemini-2.5-flash-preview-tts",
              contents: [{ parts: [{ text: `Hello! I am ${voice}.` }] }],
              config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: getVoiceModel(voice) } } } },
           }));
           if (response.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
               const binaryString = window.atob(response.candidates[0].content.parts[0].inlineData.data);
               const bytes = new Uint8Array(binaryString.length);
               for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
               const blob = pcmToWav(bytes, 24000, 1);
               const url = URL.createObjectURL(blob);
               if (voicePreviewRef.current) voicePreviewRef.current.pause();
               voicePreviewRef.current = new Audio(url);
               voicePreviewRef.current.onended = () => setIsPreviewingVoice(false);
               voicePreviewRef.current.play();
           } else { setIsPreviewingVoice(false); }
        } catch (e) { console.error(e); setIsPreviewingVoice(false); }
    };
  
    const toggleMusicPreview = () => {
        if (isPlayingMusicPreview) { musicPreviewRef.current?.pause(); setIsPlayingMusicPreview(false); } else {
            if (!musicPreviewRef.current || musicPreviewRef.current.src !== selectedMusicTrack) { musicPreviewRef.current = new Audio(selectedMusicTrack); }
            musicPreviewRef.current.play(); setIsPlayingMusicPreview(true);
        }
    };

    const getPositionClass = (pos: CaptionPosition) => { switch(pos) { case 'Top': return 'top-[15%] bottom-auto'; case 'Center': return 'top-1/2 -translate-y-1/2 bottom-auto'; default: return 'bottom-[15%] top-auto'; } };
    const getSizeClass = (size: CaptionSize) => { switch(size) { case 'Small': return 'scale-75'; case 'Large': return 'scale-125'; default: return 'scale-100'; } };

    const getCaptionContainerClasses = (style: CaptionStyle) => {
        const base = `absolute left-0 right-0 flex justify-center transition-all duration-300 z-20 px-4 ${getPositionClass(captionPosition)} ${getSizeClass(captionSize)}`;
        if (style === 'News Ticker') return `${base} bottom-0 !top-auto !transform-none bg-red-600 text-white py-2 w-full justify-start pl-4`;
        if (style === 'Cinematic') return `${base} bg-black/80 py-4 border-y border-amber-500/50 w-full`;
        if (style === 'Typewriter') return `${base} bg-white/90 border-2 border-slate-900 px-4 py-2 rounded-lg max-w-lg mx-auto`;
        if (style === 'Comic Book') return `${base} rotate-[-2deg]`;
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

    const handleGenerate = async () => {
        if (!inputContent) return;
        setIsGenerating(true); setLogs([]); setGeneratedScript(''); setGeneratedVisuals([]); setWordTimings([]); setAudioUrl(null); setIsPlaying(false); setCurrentTime(0); setActiveVisual(null); setPreviousVisual(null);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            addLog("Step 1/4: Writing script...");
            const scriptResponse = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [{ text: `Rewrite into conversational video script (approx 1 min). Input:\n${inputContent}` }] },
                config: { thinkingConfig: { thinkingBudget: 2048 } }
            }));
            const script = scriptResponse.text || "Script generation failed.";
            setGeneratedScript(script);

            let pacingPrompt = "Break script into distinct visual scenes.";
            if (visualPacing === 'Fast') pacingPrompt = "Break script into 8-12 fast-paced scenes.";
            if (visualPacing === 'Turbo') pacingPrompt = "Break script into 15-25 rapid-fire scenes (every 2-3s).";

            addLog("Step 2/4: Designing storyboard...");
            let scenes: any[] = [];
            try {
                const storyboardResponse = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: { parts: [{ text: `${pacingPrompt} (JSON). Script: ${script}` }] },
                    config: { thinkingConfig: { thinkingBudget: 2048 }, responseMimeType: "application/json", responseSchema: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { segmentText: { type: Type.STRING }, visualPrompt: { type: Type.STRING }, visualType: { type: Type.STRING }, overlayText: { type: Type.STRING } } } } }
                }));
                scenes = JSON.parse((storyboardResponse.text || "[]").replace(/```json/g, '').replace(/```/g, ''));
            } catch (e) { scenes = [{ segmentText: script, visualPrompt: "Concept art", visualType: "illustration", overlayText: "Topic" }]; }

            addLog(`Step 3/4: Voiceover (${voice})...`);
            let finalDuration = 60;
            try {
                 const audioResponse = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
                    model: "gemini-2.5-flash-preview-tts",
                    contents: [{ parts: [{ text: script }] }],
                    config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: getVoiceModel(voice) } } } },
                 }));
                 if (audioResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
                     const binaryString = window.atob(audioResponse.candidates[0].content.parts[0].inlineData.data);
                     const bytes = new Uint8Array(binaryString.length);
                     for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
                     const blob = pcmToWav(bytes, 24000, 1);
                     setAudioUrl(URL.createObjectURL(blob));
                     finalDuration = bytes.length / 48000;
                     setDurationSeconds(finalDuration);
                     setWordTimings(calculateWordTimings(script, finalDuration));
                 }
            } catch (e) { addLog(`Audio failed: ${e}`); }

            addLog(`Step 4/4: Rendering ${scenes.length} scenes (${visualMode})...`);
            const totalChars = scenes.reduce((acc, s) => acc + (s.segmentText?.length || 0), 0) || 1;
            let currentTimeCursor = 0;
            const visuals: VisualAsset[] = [];

            for (let i = 0; i < scenes.length; i++) {
                 await delay(1000); 
                 const scene = scenes[i];
                 let imageData = "";

                 if (visualMode === 'Solid_Color') {
                     imageData = createSolidColorImage(solidColor, "");
                 } else {
                    try {
                        const promptText = visualMode === 'Abstract' ? `Abstract background, ${selectedStyle}, ${scene.visualPrompt}` : `Style: ${selectedStyle}. Subject: ${scene.visualPrompt}`;
                        const imageResponse = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
                            model: 'gemini-2.5-flash-image', 
                            contents: { parts: [{ text: promptText }] },
                            config: { imageConfig: { aspectRatio: '16:9' } }
                        }));
                        if (imageResponse.candidates?.[0]?.content?.parts) {
                            for (const p of imageResponse.candidates[0].content.parts) {
                                if (p.inlineData?.data) { imageData = p.inlineData.data; break; }
                            }
                        }
                    } catch (e) { imageData = createSolidColorImage('#ef4444', "Error"); }
                 }

                 const ratio = (scene.segmentText?.length || 1) / totalChars;
                 const duration = ratio * finalDuration;
                 visuals.push({
                     id: `v-${i}`, prompt: scene.visualPrompt, imageData: imageData, type: scene.visualType as any, overlayText: scene.overlayText, scriptText: scene.segmentText, 
                     startTime: currentTimeCursor, endTime: i === scenes.length - 1 ? finalDuration + 1 : currentTimeCursor + duration, zoomDirection: i % 2 === 0 ? 'in' : 'out'
                 });
                 currentTimeCursor += duration;
             }

            setGeneratedVisuals(visuals); setActiveVisual(visuals[0]); addLog("Done!");

        } catch (error) { addLog(`Error: ${String(error)}`); } finally { setIsGenerating(false); }
    };

    const handleTimeUpdate = (e: React.SyntheticEvent<HTMLAudioElement>) => {
        const t = e.currentTarget.currentTime;
        setCurrentTime(t);
        const vis = generatedVisuals.find(v => t >= v.startTime && t < v.endTime);
        if (vis && vis.id !== activeVisual?.id) {
            setPreviousVisual(activeVisual);
            setActiveVisual(vis);
        }
        if (bgMusicRef.current && Math.abs(bgMusicRef.current.currentTime - t) > 0.5) {
            bgMusicRef.current.currentTime = t;
        }
    };

    const togglePlay = () => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
                bgMusicRef.current?.pause();
                setIsPlaying(false);
            } else {
                audioRef.current.play();
                bgMusicRef.current?.play();
                setIsPlaying(true);
            }
        }
    };

    const textToDisplay = showSubtitles ? activeVisual?.scriptText : activeVisual?.overlayText;

    const getCustomCaptionStyle = (): React.CSSProperties => {
        const styles: React.CSSProperties = {};
        if (captionColor) styles.color = captionColor;
        if (captionBgColor) styles.backgroundColor = captionBgColor;
        if (captionOutlineColor) {
            styles.WebkitTextStroke = `1px ${captionOutlineColor}`;
            styles.textShadow = 'none';
        }
        if (captionBgColor) {
            styles.padding = '4px 12px';
            styles.borderRadius = '6px';
            styles.display = 'inline-block'; 
        }
        return styles;
    };

    const renderViralCaptions = () => {
        if (wordTimings.length === 0) return null;
        
        const currentIndex = wordTimings.findIndex(w => currentTime >= w.start && currentTime < w.end);
        if (currentIndex === -1 && currentTime > 0 && currentTime < durationSeconds) return null;
        
        const chunkStart = Math.max(0, currentIndex - 1);
        const chunkEnd = Math.min(wordTimings.length, currentIndex + 2);
        const chunk = wordTimings.slice(chunkStart, chunkEnd);

        let containerClasses = `absolute left-0 right-0 z-30 pointer-events-none flex justify-center items-center ${getPositionClass(captionPosition)} ${getSizeClass(captionSize)}`;
        let innerClasses = "flex flex-wrap justify-center gap-3 max-w-2xl px-4";
        if (captionStyle === 'Viral (Clean)') innerClasses = "flex flex-wrap justify-center gap-2 max-w-xl px-4";
        else if (captionStyle === 'Viral (Pop)') innerClasses = "flex flex-wrap justify-center gap-3 max-w-2xl px-4 items-center";
        
        const containerStyle: React.CSSProperties = captionBgColor ? { backgroundColor: captionBgColor, padding: '10px', borderRadius: '8px' } : {};

        return (
            <div className={containerClasses}>
                <div className={innerClasses} style={containerStyle}>
                    {chunk.map((w, idx) => {
                        const actualIndex = chunkStart + idx;
                        const isActive = actualIndex === currentIndex;
                        let wordClass = "";
                        
                        if (captionStyle === 'Viral (Strike)') {
                            wordClass = `text-4xl md:text-5xl font-black uppercase tracking-wide leading-relaxed transition-all duration-100 ease-out ${isActive ? "text-yellow-400 scale-110 -rotate-2 drop-shadow-[0_4px_0_rgba(0,0,0,1)] z-10" : "text-white/90 drop-shadow-[0_2px_0_rgba(0,0,0,0.8)]"} [text-shadow:2px_2px_0_#000,-2px_-2px_0_#000,2px_-2px_0_#000,-2px_2px_0_#000]`;
                        } else if (captionStyle === 'Viral (Clean)') {
                            wordClass = `text-2xl md:text-3xl font-bold tracking-tight transition-all duration-200 ${isActive ? "text-yellow-300 scale-105" : "text-slate-100 opacity-80"} drop-shadow-md`;
                        } else if (captionStyle === 'Viral (Box)') {
                            wordClass = `text-2xl md:text-3xl font-black uppercase tracking-wide px-2 py-0.5 rounded transition-all duration-150 ${isActive ? "bg-indigo-600 text-white transform scale-105 shadow-lg rotate-1" : "text-white drop-shadow-md"}`;
                        } else if (captionStyle === 'Viral (Pop)') {
                            wordClass = `font-black tracking-tight transition-all duration-150 ${isActive ? "text-emerald-400 text-4xl md:text-5xl scale-125 z-10 drop-shadow-[0_4px_0_rgba(0,0,0,0.8)]" : "text-white text-3xl md:text-4xl opacity-70 scale-95"}`;
                        } else {
                            // Fallback
                            wordClass = `text-2xl font-bold ${isActive ? 'text-yellow-400' : 'text-white'}`;
                        }

                        const wordStyle: React.CSSProperties = {};
                        if (captionColor) wordStyle.color = captionColor;
                        if (captionOutlineColor) {
                             wordStyle.WebkitTextStroke = `1px ${captionOutlineColor}`;
                             wordStyle.textShadow = 'none';
                        }

                        return <span key={actualIndex} className={wordClass} style={wordStyle}>{w.word}</span>;
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <h1 className="text-3xl font-bold text-slate-900 mb-2 flex items-center gap-2"><Film className="text-indigo-600" /> Director's Test Lab</h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
                {/* SETTINGS COLUMN */}
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
                        <h3 className="font-bold text-slate-700 border-b pb-2">Settings</h3>
                        
                        {/* STYLE */}
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Visual Style</label>
                            <select className="w-full text-sm p-2 border rounded" value={selectedStyle} onChange={e => setSelectedStyle(e.target.value)}>
                                {visualStyles.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        
                        {/* VOICE */}
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Voice Actor</label>
                            <div className="flex gap-2">
                                <select className="flex-1 text-sm p-2 border rounded" value={voice} onChange={e => setVoice(e.target.value as VoiceOption)}>
                                    {voices.map(s => <option key={s} value={s}>{s} {['Orion', 'Leo', 'Marcus', 'Atlas', 'Caleb', 'Silas', 'Felix', 'Arthur', 'Magnus', 'Thorne', 'Odin'].includes(s) ? '(M)' : '(F)'}</option>)}
                                </select>
                                <button onClick={handleTestVoice} disabled={isPreviewingVoice} className="bg-indigo-50 text-indigo-600 p-2 rounded hover:bg-indigo-100" title="Audition Voice">
                                    {isPreviewingVoice ? <Loader2 size={18} className="animate-spin"/> : <Volume2 size={18}/>}
                                </button>
                            </div>
                        </div>

                        {/* PACING CONTROL - NEW */}
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Slide Count / Pacing</label>
                            <div className="flex bg-slate-100 p-1 rounded-lg">
                                <button onClick={() => setVisualPacing('Normal')} className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all flex items-center justify-center gap-1 ${visualPacing === 'Normal' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}><Timer size={12} /> Normal</button>
                                <button onClick={() => setVisualPacing('Fast')} className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all flex items-center justify-center gap-1 ${visualPacing === 'Fast' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}><Zap size={12} /> Fast (2x)</button>
                                <button onClick={() => setVisualPacing('Turbo')} className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all flex items-center justify-center gap-1 ${visualPacing === 'Turbo' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}><Gauge size={12} /> Turbo (Max)</button>
                            </div>
                        </div>

                        {/* VISUAL MODE */}
                         <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Visual Source</label>
                            <select className="w-full text-sm border-slate-300 rounded-md p-2" value={visualMode} onChange={(e) => setVisualMode(e.target.value as VisualMode)}>
                                <option value="AI_Scene">AI Scene Images</option>
                                <option value="Abstract">AI Abstract Backgrounds</option>
                                <option value="Solid_Color">Solid Colors</option>
                            </select>
                        </div>
                        {visualMode === 'Solid_Color' && (
                             <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Color</label>
                                <div className="flex items-center gap-2"><input type="color" value={solidColor} onChange={(e) => setSolidColor(e.target.value)} className="h-8 w-12 rounded border p-0.5" /></div>
                             </div>
                        )}

                        {/* CAPTIONS */}
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Caption Style</label>
                            <select className="w-full text-sm p-2 border rounded mb-2" value={captionStyle} onChange={e => setCaptionStyle(e.target.value as CaptionStyle)}>
                                {captionStyles.map(s => <option key={s} value={s}>{s === 'None' ? 'No Captions' : s}</option>)}
                            </select>
                            
                            {captionStyle !== 'None' && (
                                <div className="space-y-2">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Position</label><div className="flex bg-slate-100 rounded p-0.5">{['Top', 'Center', 'Bottom'].map((pos) => (<button key={pos} onClick={() => setCaptionPosition(pos as CaptionPosition)} className={`flex-1 text-[10px] py-1 rounded ${captionPosition === pos ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>{pos}</button>))}</div></div>
                                        <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Size</label><div className="flex bg-slate-100 rounded p-0.5">{['Small', 'Medium', 'Large'].map((size) => (<button key={size} onClick={() => setCaptionSize(size as CaptionSize)} className={`flex-1 text-[10px] py-1 rounded ${captionSize === size ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>{size.charAt(0)}</button>))}</div></div>
                                    </div>
                                    
                                    {/* CAPTION CUSTOMIZATION CONTROLS */}
                                    <div className="pt-2 border-t border-slate-100">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Customization</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            <div>
                                                <label className="text-[9px] text-slate-500 block mb-0.5">Text Color</label>
                                                <div className="flex items-center gap-1">
                                                    <input type="color" value={captionColor} onChange={(e) => setCaptionColor(e.target.value)} className="w-6 h-6 rounded border-none cursor-pointer" />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-[9px] text-slate-500 block mb-0.5">Background</label>
                                                <div className="flex items-center gap-1">
                                                    <input type="color" value={captionBgColor || '#000000'} onChange={(e) => setCaptionBgColor(e.target.value)} className="w-6 h-6 rounded border-none cursor-pointer" />
                                                    <button onClick={() => setCaptionBgColor('')} className="text-[9px] text-slate-400 hover:text-red-500" title="Clear Background">×</button>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-[9px] text-slate-500 block mb-0.5">Outline</label>
                                                <div className="flex items-center gap-1">
                                                    <input type="color" value={captionOutlineColor || '#000000'} onChange={(e) => setCaptionOutlineColor(e.target.value)} className="w-6 h-6 rounded border-none cursor-pointer" />
                                                    <button onClick={() => setCaptionOutlineColor('')} className="text-[9px] text-slate-400 hover:text-red-500" title="Clear Outline">×</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Caption Mode Toggle */}
                            {captionStyle !== 'None' && !captionStyle.startsWith('Viral') && (
                                <div className="flex items-center justify-between bg-slate-100 p-2 rounded-lg mt-2">
                                    <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                                        {showSubtitles ? <Subtitles size={14} /> : <AlignCenter size={14} />} 
                                        {showSubtitles ? "Subtitles" : "Headlines"}
                                    </span>
                                    <button 
                                        onClick={() => setShowSubtitles(!showSubtitles)}
                                        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none ${showSubtitles ? 'bg-indigo-600' : 'bg-slate-300'}`}
                                    >
                                        <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${showSubtitles ? 'translate-x-4.5' : 'translate-x-1'}`} />
                                    </button>
                                </div>
                            )}
                        </div>

                         {/* MUSIC */}
                         <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase">Background Music</label>
                                <button onClick={() => setUseMusic(!useMusic)} className={`w-8 h-4 rounded-full p-0.5 transition-colors ${useMusic ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                                    <div className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${useMusic ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                </button>
                            </div>
                            {useMusic && (
                                <div className="space-y-2">
                                    <select className="w-full text-sm border-slate-300 rounded-md p-2" value={selectedMusicTrack} onChange={(e) => { setSelectedMusicTrack(e.target.value); setIsPlayingMusicPreview(false); if(musicPreviewRef.current) musicPreviewRef.current.pause(); }}>
                                        {MUSIC_TRACKS.map(t => <option key={t.url} value={t.url}>{t.name}</option>)}
                                    </select>
                                    <button onClick={toggleMusicPreview} className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium">
                                        {isPlayingMusicPreview ? <><PauseCircle size={14}/> Stop Preview</> : <><PlayCircle size={14}/> Test Listen</>}
                                    </button>
                                </div>
                            )}
                        </div>

                    </div>
                </div>

                {/* MAIN CONTENT COLUMN */}
                <div className="lg:col-span-2 space-y-6">
                    {/* INPUT CARD */}
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-700 mb-2">Input Content</h3>
                        <TextArea 
                            placeholder="Paste a paragraph, topic, or rough notes here..." 
                            rows={4}
                            value={inputContent}
                            onChange={(e) => setInputContent(e.target.value)}
                        />
                        <div className="flex justify-end mt-4">
                            <Button onClick={handleGenerate} disabled={isGenerating || !inputContent} isLoading={isGenerating}>
                                {isGenerating ? 'Generating Assets...' : 'Generate Test Scene'}
                            </Button>
                        </div>
                    </div>

                    {/* PREVIEW PLAYER */}
                    {generatedVisuals.length > 0 ? (
                         <div className="bg-black rounded-xl overflow-hidden shadow-2xl relative aspect-video group">
                            
                            {/* Visual Layer */}
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                                {activeVisual ? (
                                    <img 
                                        key={activeVisual.id}
                                        src={`data:image/png;base64,${activeVisual.imageData}`}
                                        className={`w-full h-full object-cover transition-opacity duration-500 ${activeVisual.zoomDirection === 'out' ? 'animate-kenburns-out' : 'animate-kenburns-in'}`}
                                    />
                                ) : <Loader2 className="text-slate-700 animate-spin" size={40} />}
                            </div>

                            {/* Caption Layer - Viral */}
                            {captionStyle.startsWith('Viral') && renderViralCaptions()}

                            {/* Caption Layer - Standard */}
                            {textToDisplay && !captionStyle.startsWith('Viral') && captionStyle !== 'None' && (
                                <div className={getCaptionContainerClasses(captionStyle)}>
                                     <div className="animate-slide-up">
                                         <h2 className={getCaptionTextClasses(captionStyle)} style={getCustomCaptionStyle()}>
                                             {textToDisplay}
                                         </h2>
                                     </div>
                                </div>
                            )}

                            {/* Controls Overlay */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                {!isPlaying && (
                                    <button onClick={togglePlay} className="pointer-events-auto w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:scale-110 transition-transform cursor-pointer border-2 border-white/50 shadow-lg text-white">
                                        <PlayCircle size={40} fill="currentColor" />
                                    </button>
                                )}
                            </div>

                            {/* Progress Bar */}
                             <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                                <div className="h-full bg-indigo-500" style={{ width: `${(currentTime / (durationSeconds || 1)) * 100}%` }} />
                            </div>

                            {/* Hidden Audio Elements */}
                            {audioUrl && (
                                <audio 
                                    ref={audioRef} 
                                    src={audioUrl} 
                                    onTimeUpdate={handleTimeUpdate} 
                                    onEnded={() => setIsPlaying(false)}
                                    onPause={() => setIsPlaying(false)}
                                    onPlay={() => setIsPlaying(true)}
                                />
                            )}
                            {useMusic && <audio ref={bgMusicRef} src={selectedMusicTrack} loop />}
                         </div>
                    ) : (
                        <div className="bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center h-80 text-slate-400">
                            <div className="text-center">
                                <Film size={40} className="mx-auto mb-2 opacity-50" />
                                <p>Preview will appear here</p>
                            </div>
                        </div>
                    )}

                    {/* LOGS */}
                    <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs text-green-400 h-40 overflow-y-auto border border-slate-700">
                        <div className="text-slate-500 mb-2 uppercase font-bold tracking-wider">System Logs</div>
                        {logs.length === 0 && <span className="text-slate-600 italic">Ready for input...</span>}
                        {logs.map((log, i) => (
                            <div key={i} className="mb-1 border-l-2 border-green-800 pl-2">{log}</div>
                        ))}
                    </div>

                </div>
            </div>
        </div>
    );
};
