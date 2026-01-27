
import { Course, Module, VisualAsset, Lesson, SupportTicket } from './types';

declare var JSZip: any;

export function pcmToWav(pcmData: Uint8Array, sampleRate: number = 24000, numChannels: number = 1): Blob {
    const bufferLength = pcmData.length;
    const headerLength = 44;
    const wavBuffer = new ArrayBuffer(headerLength + bufferLength);
    const view = new DataView(wavBuffer);
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + bufferLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, bufferLength, true);
    const pcmArray = new Uint8Array(wavBuffer, headerLength);
    pcmArray.set(pcmData);
    return new Blob([wavBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

export const getAudioDurationFromBlob = async (blob: Blob): Promise<number> => {
    try {
        const arrayBuffer = await blob.arrayBuffer();
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const duration = audioBuffer.duration;
        audioContext.close();
        return duration;
    } catch (e) {
        console.error("Error decoding audio duration:", e);
        return 0;
    }
};

export const createSolidColorImage = (color: string = '#4f46e5', text?: string): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1280, 720);
        if (text) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 60px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, 640, 360);
        }
    }
    return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
};

export const compressBase64Image = (base64Data: string, maxWidth: number = 800, quality: number = 0.6): Promise<string> => {
    return new Promise((resolve) => {
        if (!base64Data || base64Data.startsWith('/') || base64Data.startsWith('http')) {
            resolve(base64Data);
            return;
        }
        
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }
            
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                const compressed = canvas.toDataURL('image/jpeg', quality).split(',')[1];
                resolve(compressed);
            } else {
                resolve(base64Data);
            }
        };
        img.onerror = () => resolve(base64Data);
        
        const prefix = base64Data.includes(',') ? '' : 'data:image/png;base64,';
        img.src = prefix + base64Data;
    });
};

export const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export const convertPdfToImages = async (file: File): Promise<string[]> => {
    if (typeof (window as any).pdfjsLib === 'undefined') {
        alert("PDF library not loaded. Please refresh the page.");
        return [];
    }
    const pdfjs = (window as any).pdfjsLib;
    // Ensure worker is set
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
         pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument(arrayBuffer).promise;
        const images: string[] = [];

        // Render each page
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 }); // 1.5x scale for decent quality 1080p-ish
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;
            images.push(canvas.toDataURL('image/jpeg', 0.8));
        }
        return images;
    } catch (e) {
        console.error("PDF Conversion Error:", e);
        throw e;
    }
};

export const renderVideoFromLesson = async (lesson: Lesson, onProgress?: (progress: number) => void): Promise<Blob | null> => {
    if (!lesson.audioData) {
        console.error("No audio data found");
        return null;
    }

    try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        let audioBuffer: AudioBuffer;

        // Handle audio: URL, data URL, or raw base64
        if (lesson.audioData.startsWith('/media/') || lesson.audioData.startsWith('/objects/') || lesson.audioData.startsWith('http')) {
            const response = await fetch(lesson.audioData);
            const arrayBuffer = await response.arrayBuffer();
            audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        } else if (lesson.audioData.startsWith('data:audio/pcm;base64,')) {
            // PCM data URL - needs conversion to WAV
            const base64 = lesson.audioData.split(',')[1];
            const binaryString = window.atob(base64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
            const wavBlob = pcmToWav(bytes, 24000, 1);
            const arrayBuffer = await wavBlob.arrayBuffer();
            audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        } else if (lesson.audioData.startsWith('data:')) {
            // Other data URLs (MP3, WAV, etc.) - fetch and decode
            const response = await fetch(lesson.audioData);
            const arrayBuffer = await response.arrayBuffer();
            audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        } else {
            // Legacy raw base64 (without data: prefix)
            const binaryString = window.atob(lesson.audioData);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

            if (lesson.audioMimeType === 'audio/pcm') {
                const wavBlob = pcmToWav(bytes, 24000, 1);
                const arrayBuffer = await wavBlob.arrayBuffer();
                audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            } else {
                const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
                audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            }
        }

        const images: { img: HTMLImageElement, start: number, end: number, scriptText?: string }[] = [];
        const visuals = lesson.visuals || [];
        const audioDuration = audioBuffer.duration;
        
        // Check if timing values are valid (not all zeros)
        const hasValidTiming = visuals.some(v => v.startTime > 0 || v.endTime > 0);
        
        // Count visuals with images for even distribution
        const visualsWithImages = visuals.filter(v => v.imageData);
        const timePerImage = audioDuration / Math.max(1, visualsWithImages.length);
        let imageIndex = 0;
        
        for (let i=0; i < visuals.length; i++) {
            const v = visuals[i];
            if (v.imageData) {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                await new Promise<void>((resolve, reject) => {
                    img.onload = () => resolve();
                    img.onerror = () => reject(new Error('Image failed to load'));
                    // Handle URL, data URL, or raw base64
                    if (v.imageData.startsWith('/media/') || v.imageData.startsWith('/objects/') || v.imageData.startsWith('http') || v.imageData.startsWith('data:')) {
                        img.src = v.imageData;
                    } else {
                        img.src = `data:image/png;base64,${v.imageData}`;
                    }
                });
                
                // Use stored timing if valid, otherwise calculate even distribution
                let start: number, end: number;
                if (hasValidTiming && (v.startTime > 0 || v.endTime > 0)) {
                    start = v.startTime;
                    end = v.endTime;
                } else {
                    // Evenly distribute images across audio duration
                    start = imageIndex * timePerImage;
                    end = (imageIndex + 1) * timePerImage;
                }
                
                images.push({ img, start, end, scriptText: v.scriptText });
                imageIndex++;
            }
        }
        
        console.log('Video render timing:', { audioDuration, imageCount: images.length, hasValidTiming, timePerImage });
        console.log('Image timings:', images.map((img, i) => ({ i, start: img.start.toFixed(2), end: img.end.toFixed(2) })));

        const canvas = document.createElement('canvas');
        const videoWidth = 1920;
        const videoHeight = 1080;
        
        const captionStyle = lesson.captionStyle || 'Modern';
        const captionPosition = lesson.captionPosition || 'Bottom';
        const captionSize = lesson.captionSize || 'Medium';
        const captionMode = lesson.captionMode || 'Overlay';
        const captionColor = lesson.captionColor || '#ffffff';
        const captionBgColor = lesson.captionBgColor || '';
        const captionOutlineColor = lesson.captionOutlineColor || '';
        // Captions completely disabled
        const showCaptions = false;
        
        // Subtitle bar dimensions - bar is INSIDE the 1080 height, not extending it
        const barHeight = (captionMode === 'Subtitle Bar' && showCaptions) ? 120 : 0;
        // For Subtitle Bar mode, only Top and Bottom are valid - Center defaults to Bottom
        const effectivePosition = (captionMode === 'Subtitle Bar' && captionPosition === 'Center') ? 'Bottom' : captionPosition;
        
        // Video content area is reduced when bar is shown
        const videoContentHeight = videoHeight - barHeight;
        const barY = effectivePosition === 'Top' ? 0 : videoContentHeight;
        const videoOffsetY = (captionMode === 'Subtitle Bar' && effectivePosition === 'Top') ? barHeight : 0;
        
        // Canvas stays at standard 1080 height
        canvas.width = videoWidth; 
        canvas.height = videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("No Canvas Context");
        
        console.log('Caption settings:', { captionStyle, captionPosition, captionSize, captionMode, showCaptions, barHeight, barY, videoOffsetY, videoContentHeight, effectivePosition });
        console.log('SUBTITLE BAR DEBUG: Canvas dimensions =', canvas.width, 'x', canvas.height, '| Bar enabled:', captionMode === 'Subtitle Bar', '| showCaptions:', showCaptions);

        const fontSize = captionSize === 'Small' ? 36 : captionSize === 'Large' ? 64 : 48;
        
        // Caption Y position differs based on mode
        let captionY: number;
        if (captionMode === 'Subtitle Bar' && showCaptions) {
            // Caption centered within the bar (bar is now inside 1080 height)
            captionY = barY + barHeight / 2;
            console.log('CAPTION Y for subtitle bar:', captionY, 'barY:', barY, 'barHeight:', barHeight);
        } else {
            // Overlay mode - position relative to video
            captionY = effectivePosition === 'Top' ? 100 : effectivePosition === 'Center' ? videoHeight / 2 : videoHeight - 80;
        }

        const drawCaption = (text: string, currentTimeMs?: number) => {
            if (!text || !showCaptions) return;
            
            // Debug: Log word timestamps status
            console.log('drawCaption called - wordTimestamps:', lesson.wordTimestamps?.length || 0, 'currentTimeMs:', currentTimeMs);
            
            // Word-by-word mode: if we have word timestamps, show synced captions
            if (lesson.wordTimestamps && lesson.wordTimestamps.length > 0 && currentTimeMs !== undefined) {
                console.log('USING WORD-BY-WORD MODE with', lesson.wordTimestamps.length, 'words');
                // Find current word based on timestamp
                const currentIdx = lesson.wordTimestamps.findIndex(w => 
                    currentTimeMs >= w.start && currentTimeMs < w.end
                );
                
                // If no word is being spoken right now, check if we're between words
                let displayIdx = currentIdx;
                if (displayIdx === -1) {
                    // Find the most recent word that ended before current time
                    for (let i = lesson.wordTimestamps.length - 1; i >= 0; i--) {
                        if (lesson.wordTimestamps[i].end <= currentTimeMs) {
                            displayIdx = i;
                            break;
                        }
                    }
                }
                
                if (displayIdx === -1) return; // Before first word
                
                // Show a window of words centered on current (5-7 words for readability)
                const windowSize = 5;
                const start = Math.max(0, displayIdx - Math.floor(windowSize / 2));
                const end = Math.min(lesson.wordTimestamps.length, start + windowSize);
                const wordWindow = lesson.wordTimestamps.slice(start, end);
                
                // Build display text - highlight current word
                const displayText = wordWindow.map((w, i) => {
                    const isCurrentWord = (start + i) === displayIdx;
                    // Uppercase the current word for emphasis
                    return isCurrentWord ? w.word.toUpperCase() : w.word.toLowerCase();
                }).join(' ');
                
                // Use the word-synced text instead of scene text
                text = displayText;
            }
            
            // Common English words to detect in concatenated text
            const commonWords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'way', 'who', 'boy', 'did', 'get', 'let', 'put', 'say', 'she', 'too', 'use', 'your', 'each', 'from', 'have', 'been', 'call', 'come', 'made', 'find', 'long', 'make', 'many', 'more', 'some', 'than', 'them', 'then', 'what', 'when', 'will', 'with', 'word', 'about', 'after', 'being', 'could', 'every', 'first', 'found', 'great', 'just', 'know', 'like', 'look', 'only', 'over', 'such', 'take', 'that', 'this', 'time', 'very', 'want', 'well', 'were', 'would', 'write', 'simple', 'science', 'video', 'learn', 'today', 'start', 'step', 'guide', 'quick', 'easy', 'best', 'most', 'here', 'there', 'these', 'those', 'which', 'where', 'while', 'their', 'other', 'right', 'wrong', 'thing', 'think', 'should', 'before', 'after', 'during', 'between', 'through', 'against', 'inside', 'outside', 'without', 'within', 'around', 'behind', 'beyond', 'under', 'above', 'below', 'since', 'until', 'still', 'also', 'even', 'much', 'both', 'same', 'into', 'upon', 'already', 'always', 'another', 'because', 'become', 'before', 'between', 'business', 'company', 'different', 'during', 'either', 'enough', 'example', 'family', 'following', 'general', 'government', 'important', 'information', 'interest', 'large', 'later', 'little', 'local', 'market', 'member', 'million', 'moment', 'money', 'national', 'never', 'number', 'often', 'order', 'others', 'part', 'party', 'people', 'percent', 'place', 'point', 'political', 'possible', 'power', 'present', 'president', 'problem', 'program', 'public', 'question', 'really', 'reason', 'report', 'result', 'school', 'second', 'service', 'several', 'small', 'social', 'something', 'special', 'state', 'story', 'study', 'system', 'together', 'trying', 'understand', 'week', 'woman', 'women', 'world', 'year', 'young'];
            
            // Function to add spaces to concatenated lowercase words
            const addSpacesToConcatenated = (str: string): string => {
                // Only process if there's a long word without spaces (likely concatenated)
                const words = str.split(' ');
                return words.map(word => {
                    if (word.length > 12 && word === word.toLowerCase()) {
                        // Try to split using common words
                        let result = word;
                        for (const common of commonWords.sort((a, b) => b.length - a.length)) {
                            const regex = new RegExp(`(${common})`, 'gi');
                            result = result.replace(regex, ' $1 ');
                        }
                        return result.replace(/\s+/g, ' ').trim();
                    }
                    return word;
                }).join(' ');
            };
            
            // Normalize all types of whitespace and special characters
            let cleanText = text
                .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ') // Replace various Unicode spaces with regular space
                .replace(/[\u200C\u200D\uFEFF]/g, '') // Remove zero-width characters
                .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space between camelCase
                .replace(/([a-zA-Z])(\d)/g, '$1 $2') // Add space between letter and number
                .replace(/(\d)([a-zA-Z])/g, '$1 $2') // Add space between number and letter
                .replace(/([a-z]{2,})([A-Z][a-z])/g, '$1 $2') // Handle compound words like "videoMarketing" -> "video Marketing"
                .replace(/\s+/g, ' ') // Collapse multiple spaces
                .trim();
            
            // Apply concatenated word splitting
            cleanText = addSpacesToConcatenated(cleanText);
            cleanText = cleanText.replace(/\s+/g, ' ').trim();
            
            if (!cleanText) return;
            
            console.log('Drawing caption (raw):', JSON.stringify(text.substring(0, 50)), 'clean:', cleanText.substring(0, 50), '... size:', fontSize, 'position:', captionPosition, 'y:', captionY);
            
            const maxWidth = canvas.width - 200;
            
            ctx.save();
            ctx.textAlign = 'center';
            // In subtitle bar mode, always use middle baseline; otherwise use position-based
            ctx.textBaseline = captionMode === 'Subtitle Bar' ? 'middle' : 
                               (captionPosition === 'Top' ? 'top' : captionPosition === 'Center' ? 'middle' : 'bottom');
            
            const words = cleanText.split(' ');
            const lines: string[] = [];
            let currentLine = '';
            
            ctx.font = `bold ${fontSize}px Inter, Arial, sans-serif`;
            
            for (const word of words) {
                const testLine = currentLine ? `${currentLine} ${word}` : word;
                const metrics = ctx.measureText(testLine);
                if (metrics.width > maxWidth && currentLine) {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine = testLine;
                }
            }
            if (currentLine) lines.push(currentLine);
            
            const lineHeight = fontSize * 1.3;
            const totalHeight = lines.length * lineHeight;
            let startY = captionY;
            if (captionMode === 'Subtitle Bar') {
                // Center captions within the bar
                startY = captionY - totalHeight / 2 + lineHeight / 2;
            } else if (captionPosition === 'Center') {
                startY = captionY - totalHeight / 2 + lineHeight / 2;
            } else if (captionPosition === 'Bottom') {
                startY = captionY - totalHeight + lineHeight;
            }
            
            lines.forEach((line, idx) => {
                const lineY = startY + idx * lineHeight;
                const textWidth = ctx.measureText(line).width;
                
                // Only draw per-caption background in overlay mode (bar mode has its own background)
                if (captionBgColor && captionMode !== 'Subtitle Bar') {
                    ctx.fillStyle = captionBgColor;
                    const padding = 16;
                    const bgHeight = fontSize + padding * 2;
                    let bgY: number;
                    if (captionPosition === 'Top') {
                        bgY = lineY - padding;
                    } else if (captionPosition === 'Center') {
                        bgY = lineY - fontSize / 2 - padding;
                    } else {
                        bgY = lineY - fontSize - padding;
                    }
                    ctx.fillRect(
                        canvas.width / 2 - textWidth / 2 - padding,
                        bgY,
                        textWidth + padding * 2,
                        bgHeight
                    );
                }
                
                if (captionStyle === 'Viral (Strike)') {
                    ctx.font = `900 ${fontSize}px Inter, Arial, sans-serif`;
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 10;
                    ctx.lineJoin = 'round';
                    ctx.strokeText(line, canvas.width / 2, lineY);
                    ctx.fillStyle = captionColor;
                    ctx.fillText(line, canvas.width / 2, lineY);
                } else if (captionStyle === 'Viral (Pop)') {
                    ctx.font = `900 ${fontSize * 1.1}px Inter, Arial, sans-serif`;
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 12;
                    ctx.lineJoin = 'round';
                    ctx.strokeText(line, canvas.width / 2, lineY);
                    ctx.fillStyle = '#ffff00';
                    ctx.fillText(line, canvas.width / 2, lineY);
                } else if (captionStyle === 'Viral (Clean)') {
                    ctx.font = `700 ${fontSize}px Inter, Arial, sans-serif`;
                    ctx.shadowColor = 'rgba(0,0,0,0.9)';
                    ctx.shadowBlur = 15;
                    ctx.shadowOffsetX = 3;
                    ctx.shadowOffsetY = 3;
                    ctx.fillStyle = captionColor;
                    ctx.fillText(line, canvas.width / 2, lineY);
                    ctx.shadowBlur = 0;
                } else if (captionStyle === 'Viral (Box)') {
                    ctx.font = `700 ${fontSize}px Inter, Arial, sans-serif`;
                    const boxPadding = 20;
                    const boxWidth = textWidth + boxPadding * 2;
                    const boxHeight = fontSize + boxPadding;
                    let boxY: number;
                    if (captionPosition === 'Top') {
                        boxY = lineY - boxPadding / 2;
                    } else if (captionPosition === 'Center') {
                        boxY = lineY - fontSize / 2 - boxPadding / 2;
                    } else {
                        boxY = lineY - fontSize - boxPadding / 2;
                    }
                    ctx.fillStyle = 'rgba(0,0,0,0.85)';
                    ctx.beginPath();
                    ctx.roundRect(canvas.width / 2 - boxWidth / 2, boxY, boxWidth, boxHeight, 8);
                    ctx.fill();
                    ctx.fillStyle = captionColor;
                    ctx.fillText(line, canvas.width / 2, lineY);
                } else if (captionStyle === 'Outline' || captionOutlineColor) {
                    ctx.strokeStyle = captionOutlineColor || '#000000';
                    ctx.lineWidth = 4;
                    ctx.strokeText(line, canvas.width / 2, lineY);
                    ctx.fillStyle = captionColor;
                    ctx.fillText(line, canvas.width / 2, lineY);
                } else if (captionStyle === 'Neon Glow') {
                    ctx.shadowColor = '#00ffff';
                    ctx.shadowBlur = 20;
                    ctx.fillStyle = '#00ffff';
                    ctx.fillText(line, canvas.width / 2, lineY);
                    ctx.shadowBlur = 0;
                } else if (captionStyle === 'Cinematic') {
                    ctx.font = `${fontSize}px "Playfair Display", Georgia, serif`;
                    ctx.shadowColor = 'rgba(0,0,0,0.6)';
                    ctx.shadowBlur = 8;
                    ctx.fillStyle = captionColor;
                    ctx.fillText(line, canvas.width / 2, lineY);
                    ctx.shadowBlur = 0;
                } else if (captionStyle === 'Minimalist') {
                    ctx.font = `300 ${fontSize * 0.9}px Inter, Arial, sans-serif`;
                    ctx.fillStyle = 'rgba(255,255,255,0.9)';
                    ctx.fillText(line, canvas.width / 2, lineY);
                } else if (captionStyle === 'Typewriter') {
                    ctx.font = `${fontSize}px "Courier New", monospace`;
                    ctx.fillStyle = captionColor;
                    ctx.fillText(line, canvas.width / 2, lineY);
                } else {
                    ctx.shadowColor = 'rgba(0,0,0,0.8)';
                    ctx.shadowBlur = 6;
                    ctx.fillStyle = captionColor;
                    ctx.fillText(line, canvas.width / 2, lineY);
                    ctx.shadowBlur = 0;
                }
            });
            
            ctx.restore();
        };

        // Background music setup
        const backgroundMusicUrl = lesson.backgroundMusicUrl;
        const musicMode = lesson.musicMode || 'Continuous';
        let musicSource: AudioBufferSourceNode | null = null;
        let musicGainNode: GainNode | null = null;
        
        const dest = audioContext.createMediaStreamDestination();
        
        // Voice audio setup with gain control
        const voiceGain = audioContext.createGain();
        voiceGain.gain.value = 1.0;
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(voiceGain);
        voiceGain.connect(dest);
        
        // Load and setup background music if configured (with timeout)
        if (backgroundMusicUrl) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
                const musicResponse = await fetch(backgroundMusicUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (!musicResponse.ok) throw new Error('Music fetch failed');
                const musicArrayBuffer = await musicResponse.arrayBuffer();
                const musicBuffer = await audioContext.decodeAudioData(musicArrayBuffer);
                
                musicSource = audioContext.createBufferSource();
                musicSource.buffer = musicBuffer;
                musicSource.loop = true;
                
                musicGainNode = audioContext.createGain();
                const musicVolume = 0.15; // Background music at 15% volume
                
                // Set initial gain - IntroOutro scheduling happens when audio starts
                musicGainNode.gain.value = musicMode === 'IntroOutro' ? musicVolume : musicVolume;
                
                musicSource.connect(musicGainNode);
                musicGainNode.connect(dest);
            } catch (e) {
                console.warn('Failed to load background music:', e);
            }
        }
        
        const canvasStream = canvas.captureStream(30);
        const combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...dest.stream.getAudioTracks()
        ]);

        const recorder = new MediaRecorder(combinedStream, {
            mimeType: MediaRecorder.isTypeSupported('video/webm; codecs=vp9') ? 'video/webm; codecs=vp9' : 'video/webm'
        });

        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        
        return new Promise<Blob>((resolve, reject) => {
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                audioContext.close();
                resolve(blob);
            };

            recorder.start();
            source.start(0);
            if (musicSource) {
                musicSource.start(0);
                
                // Schedule IntroOutro gain changes NOW when audio actually starts
                if (musicMode === 'IntroOutro' && musicGainNode) {
                    const musicVolume = 0.15;
                    const introDuration = 10; // First 10 seconds with music
                    const outroDuration = 10; // Last 10 seconds with music
                    const fadeTime = 0.5; // Quick fade transition
                    const outroStart = audioBuffer.duration - outroDuration;
                    const now = audioContext.currentTime;
                    
                    // Intro: full volume for first 10 seconds, then quick fade to 0
                    musicGainNode.gain.setValueAtTime(musicVolume, now);
                    musicGainNode.gain.setValueAtTime(musicVolume, now + introDuration - fadeTime);
                    musicGainNode.gain.linearRampToValueAtTime(0, now + introDuration);
                    
                    // Middle: stay silent
                    musicGainNode.gain.setValueAtTime(0, now + introDuration);
                    
                    // Outro: quick fade in at outroStart, full volume for last 10 seconds
                    musicGainNode.gain.setValueAtTime(0, now + outroStart);
                    musicGainNode.gain.linearRampToValueAtTime(musicVolume, now + outroStart + fadeTime);
                    musicGainNode.gain.setValueAtTime(musicVolume, now + audioBuffer.duration);
                    
                    console.log(`IntroOutro: music 0-${introDuration}s, silent ${introDuration}-${outroStart}s, music ${outroStart}-${audioBuffer.duration}s`);
                }
            }
            
            const startTime = audioContext.currentTime;
            const duration = audioBuffer.duration;

            const drawFrame = () => {
                const now = audioContext.currentTime - startTime;
                if (onProgress) onProgress(Math.min(100, (now / duration) * 100));

                if (now >= duration) {
                    recorder.stop();
                    source.stop();
                    if (musicSource) try { musicSource.stop(); } catch(e) {}
                    return;
                }

                // Find current scene based on time, or calculate by index if timing fails
                let currentScene = images.find(img => now >= img.start && now < img.end);
                if (!currentScene && images.length > 0) {
                    // Fallback: calculate index based on even distribution
                    const timePerImage = duration / images.length;
                    const index = Math.min(Math.floor(now / timePerImage), images.length - 1);
                    currentScene = images[Math.max(0, index)];
                }
                
                // Clear entire canvas
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Draw subtitle bar background if in subtitle bar mode
                if (captionMode === 'Subtitle Bar' && showCaptions) {
                    const barColor = captionBgColor || '#1a1a2e'; // Dark blue-black default
                    console.log('DRAWING SUBTITLE BAR at y=' + barY + ', height=' + barHeight + ', color=' + barColor);
                    // Fill bar background
                    ctx.fillStyle = barColor;
                    ctx.fillRect(0, barY, videoWidth, barHeight);
                    // Draw a visible top border line to separate bar from video
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(0, barY);
                    ctx.lineTo(videoWidth, barY);
                    ctx.stroke();
                }
                
                if (ctx && currentScene) {
                      // Use videoContentHeight for image scaling when bar is present
                      const contentHeight = captionMode === 'Subtitle Bar' ? videoContentHeight : videoHeight;
                      const imgRatio = currentScene.img.width / currentScene.img.height;
                      const videoRatio = videoWidth / contentHeight;
                      
                      let drawW, drawH, offsetX, offsetY;
                      
                      // CONTAIN mode: fit entire image without cropping (letterbox/pillarbox as needed)
                      if (imgRatio > videoRatio) {
                          // Image is wider - fit to width, letterbox top/bottom
                          drawW = videoWidth;
                          drawH = videoWidth / imgRatio;
                          offsetX = 0;
                          offsetY = videoOffsetY + (contentHeight - drawH) / 2;
                      } else {
                          // Image is taller - fit to height, pillarbox left/right
                          drawH = contentHeight;
                          drawW = contentHeight * imgRatio;
                          offsetX = (videoWidth - drawW) / 2;
                          offsetY = videoOffsetY;
                      }

                      // Fill background with black for letterbox/pillarbox areas
                      ctx.fillStyle = '#000000';
                      ctx.fillRect(0, videoOffsetY, videoWidth, contentHeight);
                      
                      ctx.drawImage(currentScene.img, offsetX, offsetY, drawW, drawH);
                      
                      if (currentScene.scriptText) {
                          // Pass current time in milliseconds for word-synced captions
                          const currentTimeMs = now * 1000;
                          drawCaption(currentScene.scriptText, currentTimeMs);
                      }
                }
                
                requestAnimationFrame(drawFrame);
            };
            
            drawFrame();
        });

    } catch (e) {
        console.error("Render failed", e);
        return null;
    }
};

// --- INDEXED DB MANAGER (For unlimited local storage) ---

export const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('CourseMagicDB', 2); // Increased version for schema update
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('courses')) {
        db.createObjectStore('courses', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('tickets')) {
        db.createObjectStore('tickets', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const saveCourseToDB = async (course: Course) => {
  try {
      const db = await openDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('courses', 'readwrite');
        const store = tx.objectStore('courses');
        const request = store.put(course);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
  } catch (e) {
      console.error("Failed to save to IndexedDB", e);
      throw e;
  }
};

export const loadCoursesFromDB = async (): Promise<Course[]> => {
  try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('courses', 'readonly');
        const store = tx.objectStore('courses');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
  } catch (e) {
      console.error("Failed to load from IndexedDB", e);
      return [];
  }
};

export const getCourseFromDB = async (id: string): Promise<Course | undefined> => {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('courses', 'readonly');
            const store = tx.objectStore('courses');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error(`Failed to load course ${id} from DB`, e);
        return undefined;
    }
};

export const deleteCourseFromDB = async (id: string) => {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('courses', 'readwrite');
        const store = tx.objectStore('courses');
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// --- TICKET FUNCTIONS ---

export const saveTicketToDB = async (ticket: SupportTicket) => {
    try {
        const db = await openDB();
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction('tickets', 'readwrite');
            const store = tx.objectStore('tickets');
            const request = store.put(ticket);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error("Failed to save ticket", e);
        throw e;
    }
};

export const loadTicketsFromDB = async (): Promise<SupportTicket[]> => {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('tickets', 'readonly');
            const store = tx.objectStore('tickets');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error("Failed to load tickets", e);
        return [];
    }
};

export const updateTicketStatusInDB = async (id: string, status: 'open' | 'resolved') => {
    try {
        const db = await openDB();
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction('tickets', 'readwrite');
            const store = tx.objectStore('tickets');
            const getReq = store.get(id);
            getReq.onsuccess = () => {
                const ticket = getReq.result;
                if (ticket) {
                    ticket.status = status;
                    store.put(ticket);
                    resolve();
                } else {
                    reject("Ticket not found");
                }
            };
            getReq.onerror = () => reject(getReq.error);
        });
    } catch (e) {
        console.error("Failed to update ticket", e);
        throw e;
    }
};

export const importTicketsToDB = async (tickets: SupportTicket[]) => {
    try {
        const db = await openDB();
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction('tickets', 'readwrite');
            const store = tx.objectStore('tickets');
            
            // Clear existing tickets before import
            store.clear();

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);

            tickets.forEach(ticket => {
                store.put(ticket);
            });
        });
    } catch (e) {
        console.error("Failed to import tickets", e);
        throw e;
    }
};

// Helper to create lightweight version for State/LocalStorage fallback
export const stripHeavyAssets = (course: Course): Course => {
    const clone: Course = { ...course };
    // Strip uploadedFiles - these contain huge base64 PDF data
    if (clone.modules) {
        clone.modules = clone.modules.map(m => ({
            ...m,
            lessons: m.lessons.map(l => {
                const lClone = { ...l };
                delete lClone.audioData;
                delete lClone.videoUrl;
                delete lClone.thumbnailData;
                // Strip uploadedFiles from lessons
                if ((lClone as any).uploadedFiles) {
                    (lClone as any).uploadedFiles = [];
                }
                if (lClone.visuals) {
                    lClone.visuals = lClone.visuals.map(v => {
                        const vClone = { ...v };
                        vClone.imageData = ''; // Set to empty string instead of deleting
                        return vClone;
                    });
                }
                return lClone;
            })
        }));
    }
    // Also strip uploadedFiles at the course level if present
    if ((clone as any).uploadedFiles) {
        (clone as any).uploadedFiles = [];
    }
    return clone;
};

// --- ZIP EXPORT LOGIC (Module-based) ---

export const safeExportCourse = (course: Course) => {
    try {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(course, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `${course.title.replace(/[^a-z0-9]/gi, '_') || 'course'}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    } catch (e) {
        console.error("Export failed", e);
        alert("Failed to export course JSON.");
    }
};

// Helper to convert URL to base64 for export
async function urlToBase64(url: string): Promise<string | null> {
    if (!url || url.startsWith('data:')) return url; // Already base64
    if (!url.startsWith('/media/') && !url.startsWith('/objects/')) return url;
    
    try {
        console.log('Converting URL to base64:', url);
        const response = await fetch(url);
        if (!response.ok) {
            console.error('Failed to fetch URL:', url, 'Status:', response.status);
            return null;
        }
        const blob = await response.blob();
        console.log('Fetched blob size:', blob.size, 'type:', blob.type);
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                console.log('Converted to base64, length:', result?.length || 0);
                resolve(result);
            };
            reader.onerror = () => {
                console.error('FileReader error for:', url);
                resolve(null);
            };
            reader.readAsDataURL(blob);
        });
    } catch (err) {
        console.error('Error converting URL to base64:', url, err);
        return null;
    }
}

// Deep clone course and convert all media URLs to base64 for portable export
async function embedMediaAsBase64(course: Course): Promise<Course> {
    const clone = JSON.parse(JSON.stringify(course)) as Course;
    
    // Convert ecover
    if (clone.ecoverUrl && (clone.ecoverUrl.startsWith('/media/') || clone.ecoverUrl.startsWith('/objects/'))) {
        const b64 = await urlToBase64(clone.ecoverUrl);
        if (b64) clone.ecoverUrl = b64;
    }
    
    // Convert all lesson media
    for (const mod of (clone.modules || [])) {
        for (const lesson of (mod.lessons || [])) {
            const l = lesson as any;
            
            // Convert lesson image
            if (l.imageUrl && (l.imageUrl.startsWith('/media/') || l.imageUrl.startsWith('/objects/'))) {
                const b64 = await urlToBase64(l.imageUrl);
                if (b64) l.imageUrl = b64;
            }
            
            // Convert audio
            if (l.audioData && (l.audioData.startsWith('/media/') || l.audioData.startsWith('/objects/'))) {
                const b64 = await urlToBase64(l.audioData);
                if (b64) l.audioData = b64;
            }
            
            // Convert rendered video
            if (l.renderedVideoUrl && (l.renderedVideoUrl.startsWith('/media/') || l.renderedVideoUrl.startsWith('/objects/'))) {
                const b64 = await urlToBase64(l.renderedVideoUrl);
                if (b64) l.renderedVideoUrl = b64;
            }
            
            // Convert visuals
            if (l.visuals && Array.isArray(l.visuals)) {
                for (const visual of l.visuals) {
                    if (visual.imageData && (visual.imageData.startsWith('/media/') || visual.imageData.startsWith('/objects/'))) {
                        const b64 = await urlToBase64(visual.imageData);
                        if (b64) visual.imageData = b64;
                    }
                }
            }
        }
    }
    
    return clone;
}

export const exportCourseAsZip = async (course: Course) => {
    if (typeof JSZip === 'undefined') {
        alert("JSZip library not loaded. Please refresh the page.");
        return;
    }

    // Embed all media as base64 for portable export
    console.log("Preparing course export with embedded media...");
    alert("Preparing export - this may take a moment for courses with media...");
    const portableCourse = await embedMediaAsBase64(course);
    console.log("Media embedding complete, creating ZIP...");
    
    const zip = new JSZip();
    const { modules, ...courseMeta } = portableCourse;
    zip.file("course_metadata.json", JSON.stringify(courseMeta, null, 2));
    const modulesFolder = zip.folder("modules");
    if (modules && Array.isArray(modules)) {
        modules.forEach((mod, idx) => {
            modulesFolder.file(`module_${idx}_${mod.id}.json`, JSON.stringify(mod, null, 2));
        });
    }
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${course.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_complete.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log("Course export complete");
};

export const exportVideoAssetsZip = async (course: Course, specificLessonId?: string) => {
    if (typeof JSZip === 'undefined') {
        alert("JSZip library not loaded.");
        return;
    }

    const zip = new JSZip();
    const assetsFolder = zip.folder("video_assets");
    let lessonToExport = null;
    if (specificLessonId) {
        for (const m of course.modules) {
            const found = m.lessons.find(l => l.id === specificLessonId);
            if (found) { lessonToExport = found; break; }
        }
    } else {
        lessonToExport = course.modules[0]?.lessons[0];
    }

    if (!lessonToExport) {
        alert("No video content found to export.");
        return;
    }

    if (lessonToExport.sourceText) {
        assetsFolder.file("script.txt", lessonToExport.sourceText);
    }

    if (lessonToExport.audioData) {
        try {
            const binaryString = window.atob(lessonToExport.audioData);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
            const ext = lessonToExport.audioMimeType === 'audio/mpeg' ? 'mp3' : 'wav';
            assetsFolder.file(`audio_track.${ext}`, bytes);
        } catch (e) {
            console.error("Error packaging audio", e);
        }
    }

    if (lessonToExport.visuals && lessonToExport.visuals.length > 0) {
        const slidesFolder = assetsFolder.folder("slides");
        lessonToExport.visuals.forEach((vis, idx) => {
            if (vis.imageData) {
                const filename = `${(idx + 1).toString().padStart(3, '0')}_slide.jpg`;
                const cleanData = vis.imageData.replace(/^data:image\/(png|jpg|jpeg);base64,/, "");
                slidesFolder.file(filename, cleanData, {base64: true});
            }
        });
    }

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${course.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_assets.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export const importCourseFromZip = async (file: File): Promise<Course | null> => {
    if (typeof JSZip === 'undefined') {
        alert("JSZip library not loaded.");
        return null;
    }

    try {
        const zip = await JSZip.loadAsync(file);
        const metaFile = zip.file("course_metadata.json");
        if (!metaFile) throw new Error("Invalid course zip: Missing metadata");
        const metaStr = await metaFile.async("string");
        const course: Course = JSON.parse(metaStr);
        const modulesFolder = zip.folder("modules");
        const modules: Module[] = [];
        if (modulesFolder) {
            const moduleFiles: any[] = [];
            modulesFolder.forEach((relativePath, file) => {
                moduleFiles.push({ path: relativePath, file: file });
            });
            moduleFiles.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
            for (const modEntry of moduleFiles) {
                const modStr = await modEntry.file.async("string");
                const module = JSON.parse(modStr);
                modules.push(module);
            }
        }
        course.modules = modules; 
        if (!course.id || !course.title) throw new Error("Invalid course data");
        return course;
    } catch (e) {
        console.error("Zip Import Failed", e);
        alert("Failed to import course from ZIP. Ensure it is a valid CourseMagic export.");
        return null;
    }
};

// --- MASTER BACKUP FUNCTIONS ---
export const exportAllDataAsZip = async (data: { courses: Course[], students: any[], progressData: any, certificates: any[], tickets: SupportTicket[] }) => {
    if (typeof JSZip === 'undefined') {
        alert("JSZip library not loaded.");
        return;
    }
    const zip = new JSZip();
    
    // Add all data as separate JSON files
    zip.file("courses.json", JSON.stringify(data.courses, null, 2));
    zip.file("students.json", JSON.stringify(data.students, null, 2));
    zip.file("progress.json", JSON.stringify(data.progressData, null, 2));
    zip.file("certificates.json", JSON.stringify(data.certificates, null, 2));
    zip.file("tickets.json", JSON.stringify(data.tickets, null, 2));

    // Also include settings from localStorage
    const settings = {
        elevenLabsKey: localStorage.getItem('elevenLabsKey') || ''
    };
    zip.file("settings.json", JSON.stringify(settings, null, 2));

    const content = await zip.generateAsync({ type: "blob" });
    downloadBlob(content, `coursemagic_master_backup_${new Date().toISOString().split('T')[0]}.zip`);
};

export const importAllDataFromZip = async (file: File): Promise<any> => {
    if (typeof JSZip === 'undefined') {
        throw new Error("JSZip library not loaded.");
    }
    const zip = await JSZip.loadAsync(file);
    const output: any = {};
    
    const parseFile = async (fileName: string) => {
        const file = zip.file(fileName);
        if (file) {
            const content = await file.async("string");
            return JSON.parse(content);
        }
        return null;
    };
    
    output.courses = await parseFile("courses.json");
    output.students = await parseFile("students.json");
    output.progressData = await parseFile("progress.json");
    output.certificates = await parseFile("certificates.json");
    output.tickets = await parseFile("tickets.json");
    output.settings = await parseFile("settings.json");
    
    return output;
};
