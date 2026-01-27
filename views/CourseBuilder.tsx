import React, { useState, useRef } from 'react';
import { Course, Module, Lesson, CourseStatus, LessonStatus } from '../types';
import { Button } from '../components/Button';
import { Input, TextArea } from '../components/Input';
import { 
    Video, Plus, Trash2, ChevronUp, ChevronDown, GripVertical, 
    FolderPlus, Check, X, ArrowLeft, Sparkles, Image as ImageIcon,
    CheckSquare, Square, Layers, Save, Upload, Loader2
} from 'lucide-react';
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { api } from '../api';

const getGeminiApiKey = (): string => {
    if (typeof window !== 'undefined' && (window as any).GEMINI_API_KEY) {
        return (window as any).GEMINI_API_KEY;
    }
    try {
        const stored = localStorage.getItem('geminiApiKey');
        if (stored) return stored;
    } catch (e) {}
    return '';
};

interface CourseBuilderProps {
    videos: Course[]; // All standalone videos (type: 'video')
    onCreateCourse: (course: Course) => Promise<void>;
    onCancel: () => void;
}

interface SelectedVideo {
    id: string;
    originalTitle: string;
    customTitle: string;
    moduleId: string;
    video: Course;
}

interface BuilderModule {
    id: string;
    title: string;
}

export const CourseBuilder: React.FC<CourseBuilderProps> = ({ videos, onCreateCourse, onCancel }) => {
    const [step, setStep] = useState<'select' | 'organize' | 'details'>('select');
    
    const [selectedVideos, setSelectedVideos] = useState<SelectedVideo[]>([]);
    const [modules, setModules] = useState<BuilderModule[]>([{ id: 'm1', title: 'Module 1' }]);
    
    const [courseTitle, setCourseTitle] = useState('');
    const [courseHeadline, setCourseHeadline] = useState('');
    const [courseDescription, setCourseDescription] = useState('');
    const [courseCover, setCourseCover] = useState('');
    
    const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
    const [editingModuleTitle, setEditingModuleTitle] = useState('');
    
    const [isGeneratingCover, setIsGeneratingCover] = useState(false);
    const [coverInstructions, setCoverInstructions] = useState('');
    const coverInputRef = useRef<HTMLInputElement>(null);
    const [isCreating, setIsCreating] = useState(false);
    
    const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                setCourseCover(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };
    
    const generateAICover = async () => {
        if (!courseTitle) {
            alert("Please enter a course title first.");
            return;
        }
        const apiKey = getGeminiApiKey();
        if (!apiKey) {
            alert("Gemini API key not configured. Please set it in Global Settings.");
            return;
        }
        
        setIsGeneratingCover(true);
        try {
            const ai = new GoogleGenAI({ apiKey });
            const prompt = `Design a premium course cover image for a professional online course titled "${courseTitle}". ${courseHeadline ? `Subtitle: "${courseHeadline}".` : ''} Style: Clean, modern, professional, high-end education platform aesthetic. Think masterclass or executive training program. ${coverInstructions ? `Additional instructions: ${coverInstructions}` : ''} Do NOT include any text in the image - just beautiful visual design.`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [{ text: prompt }] },
                config: { imageConfig: { aspectRatio: '3:4' as any } }
            }) as GenerateContentResponse;
            
            if (response.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData && part.inlineData.data) {
                        setCourseCover(`data:image/png;base64,${part.inlineData.data}`);
                        break;
                    }
                }
            }
        } catch (error) {
            console.error("Cover generation failed:", error);
            alert("Failed to generate cover image. Please try again.");
        } finally {
            setIsGeneratingCover(false);
        }
    };

    const toggleVideoSelection = (video: Course) => {
        const isSelected = selectedVideos.some(sv => sv.id === video.id);
        if (isSelected) {
            setSelectedVideos(prev => prev.filter(sv => sv.id !== video.id));
        } else {
            const lesson = video.modules[0]?.lessons[0];
            setSelectedVideos(prev => [...prev, {
                id: video.id,
                originalTitle: video.title,
                customTitle: video.title,
                moduleId: modules[0]?.id || 'm1',
                video
            }]);
        }
    };

    const updateVideoTitle = (videoId: string, newTitle: string) => {
        setSelectedVideos(prev => prev.map(sv => 
            sv.id === videoId ? { ...sv, customTitle: newTitle } : sv
        ));
    };

    const updateVideoModule = (videoId: string, moduleId: string) => {
        setSelectedVideos(prev => prev.map(sv => 
            sv.id === videoId ? { ...sv, moduleId } : sv
        ));
    };

    const moveVideoUp = (videoId: string) => {
        const index = selectedVideos.findIndex(sv => sv.id === videoId);
        if (index > 0) {
            const newList = [...selectedVideos];
            [newList[index - 1], newList[index]] = [newList[index], newList[index - 1]];
            setSelectedVideos(newList);
        }
    };

    const moveVideoDown = (videoId: string) => {
        const index = selectedVideos.findIndex(sv => sv.id === videoId);
        if (index < selectedVideos.length - 1) {
            const newList = [...selectedVideos];
            [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
            setSelectedVideos(newList);
        }
    };

    const addModule = () => {
        const newId = `m${Date.now()}`;
        setModules(prev => [...prev, { id: newId, title: `Module ${prev.length + 1}` }]);
    };

    const removeModule = (moduleId: string) => {
        if (modules.length <= 1) return;
        const remainingModules = modules.filter(m => m.id !== moduleId);
        const fallbackModuleId = remainingModules[0]?.id || 'm1';
        setModules(remainingModules);
        setSelectedVideos(prev => prev.map(sv => 
            sv.moduleId === moduleId ? { ...sv, moduleId: fallbackModuleId } : sv
        ));
    };

    const startEditingModule = (module: BuilderModule) => {
        setEditingModuleId(module.id);
        setEditingModuleTitle(module.title);
    };

    const saveModuleEdit = () => {
        if (editingModuleId) {
            setModules(prev => prev.map(m => 
                m.id === editingModuleId ? { ...m, title: editingModuleTitle } : m
            ));
            setEditingModuleId(null);
        }
    };

    const handleCreateCourse = async () => {
        setIsCreating(true);
        
        try {
            const courseId = `course-${Date.now()}`;
            
            // Fetch full video data for each selected video IN PARALLEL
            // The videos from getAll() have lightweight data with placeholders
            const fullVideos: Map<string, Course> = new Map();
            const fetchPromises = selectedVideos.map(async (sv) => {
                try {
                    console.log(`Fetching full data for video: ${sv.id}`);
                    const fullVideo = await api.courses.get(sv.id);
                    return { id: sv.id, video: fullVideo };
                } catch (e) {
                    console.warn(`Failed to fetch full video data for ${sv.id}, using cached data:`, e);
                    return { id: sv.id, video: sv.video };
                }
            });
            
            const fetchedVideos = await Promise.all(fetchPromises);
            for (const { id, video } of fetchedVideos) {
                fullVideos.set(id, video);
            }
            
            const courseModules: Module[] = modules.map(mod => {
                const moduleVideos = selectedVideos.filter(sv => sv.moduleId === mod.id);
                
                const lessons: Lesson[] = moduleVideos.map((sv, idx) => {
                    // Use full video data instead of lightweight cached data
                    const fullVideo = fullVideos.get(sv.id) || sv.video;
                    const originalLesson = fullVideo.modules[0]?.lessons[0];
                    if (!originalLesson) return null;
                    
                    // Store source IDs so StudentPortal can fetch audio/images from original video
                    const sourceVideoId = sv.id;
                    const sourceLessonId = originalLesson.id;
                    
                    console.log('CourseBuilder: Copying lesson', {
                        title: originalLesson.title,
                        sourceVideoId,
                        sourceLessonId,
                        hasAudioData: !!originalLesson.audioData,
                        audioDataLength: originalLesson.audioData?.length || 0,
                        audioDataStart: originalLesson.audioData?.substring(0, 50),
                        hasVisuals: !!(originalLesson.visuals && originalLesson.visuals.length > 0),
                        hasRenderedVideoUrl: !!originalLesson.renderedVideoUrl,
                        hasVideoUrl: !!originalLesson.videoUrl,
                        visualsCount: originalLesson.visuals?.length || 0
                    });
                    
                    return {
                        ...originalLesson,
                        id: `lesson-${sv.id}-${Date.now()}-${idx}`,
                        moduleId: mod.id,
                        title: sv.customTitle,
                        // Track source video/lesson for fetching audio/images from original location
                        sourceVideoId,
                        sourceLessonId,
                    };
                }).filter(Boolean) as Lesson[];

                return {
                    id: mod.id,
                    courseId,
                    title: mod.title,
                    lessons
                };
            }).filter(m => m.lessons.length > 0);

            const newCourse: Course = {
                id: courseId,
                type: 'course',
                title: courseTitle || 'Untitled Course',
                headline: courseHeadline || 'Created from existing videos',
                description: courseDescription,
                ecoverUrl: courseCover || selectedVideos[0]?.video.ecoverUrl || 'https://picsum.photos/seed/course/400/600',
                status: CourseStatus.PUBLISHED,
                modules: courseModules,
                totalStudents: 0,
                rating: 0
            };

            await onCreateCourse(newCourse);
            
            // After creating course, duplicate audio/images from source videos to new course
            console.log('CourseBuilder: Duplicating media from source videos...');
            const mediaCopyPromises: Promise<void>[] = [];
            
            for (const mod of courseModules) {
                for (const lesson of mod.lessons) {
                    const lessonAny = lesson as any;
                    const sourceVideoId = lessonAny.sourceVideoId;
                    const sourceLessonId = lessonAny.sourceLessonId;
                    
                    if (sourceVideoId && sourceLessonId) {
                        // Copy audio from source video to new course
                        mediaCopyPromises.push(
                            (async () => {
                                try {
                                    const audio = await api.lessonAudio.get(sourceVideoId, sourceLessonId);
                                    if (audio && audio.audioData) {
                                        console.log(`Copying audio from ${sourceVideoId}/${sourceLessonId} to ${courseId}/${lesson.id}`);
                                        await api.lessonAudio.save(courseId, lesson.id, audio.audioData, audio.mimeType, audio.wordTimestamps);
                                    }
                                } catch (e) {
                                    console.warn(`Failed to copy audio for lesson ${lesson.id}:`, e);
                                }
                            })()
                        );
                        
                        // Copy images from source video to new course
                        mediaCopyPromises.push(
                            (async () => {
                                try {
                                    const images = await api.lessonImages.get(sourceVideoId, sourceLessonId);
                                    if (images && images.length > 0) {
                                        console.log(`Copying ${images.length} images from ${sourceVideoId}/${sourceLessonId} to ${courseId}/${lesson.id}`);
                                        await api.lessonImages.save(courseId, lesson.id, images);
                                    }
                                } catch (e) {
                                    console.warn(`Failed to copy images for lesson ${lesson.id}:`, e);
                                }
                            })()
                        );
                    }
                }
            }
            
            // Wait for all media copies to complete
            await Promise.all(mediaCopyPromises);
            console.log('CourseBuilder: Media duplication complete');
        } catch (error) {
            console.error('Failed to create course:', error);
            alert('Failed to create course. Please try again.');
        } finally {
            setIsCreating(false);
        }
    };

    const renderVideoCard = (video: Course) => {
        const isSelected = selectedVideos.some(sv => sv.id === video.id);
        const lesson = video.modules[0]?.lessons[0];
        const duration = lesson?.duration || '0:00';
        
        const lessonAny = lesson as any;
        const hasPlayableContent = !!(
            lesson?.renderedVideoUrl || 
            lessonAny?.hasRenderedVideo ||
            lesson?.videoUrl || 
            lessonAny?.hostedVideoUrl ||
            lesson?.audioData || 
            lessonAny?.hasAudio ||
            lessonAny?.hasAudioInDb ||
            (lesson?.visuals && lesson.visuals.length > 0) ||
            lessonAny?.visualCount > 0 ||
            lessonAny?.hasImagesInDb
        );
        
        return (
            <div 
                key={video.id}
                onClick={() => toggleVideoSelection(video)}
                className={`relative cursor-pointer rounded-xl border-2 overflow-hidden transition-all hover:shadow-lg ${
                    isSelected 
                        ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' 
                        : hasPlayableContent 
                            ? 'border-slate-200 bg-white hover:border-slate-300'
                            : 'border-amber-300 bg-amber-50 hover:border-amber-400'
                }`}
            >
                <div className="aspect-video bg-slate-100 relative">
                    {video.ecoverUrl ? (
                        <img src={video.ecoverUrl} alt={video.title} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <Video size={32} className="text-slate-300" />
                        </div>
                    )}
                    <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded">
                        {duration}
                    </div>
                    {!hasPlayableContent && (
                        <div className="absolute top-2 left-2 bg-amber-500 text-white text-[10px] px-2 py-1 rounded font-bold">
                            No Video Content
                        </div>
                    )}
                    {isSelected && (
                        <div className="absolute top-2 right-2 bg-indigo-600 text-white rounded-full p-1">
                            <Check size={16} />
                        </div>
                    )}
                </div>
                <div className="p-3">
                    <h4 className="font-bold text-slate-900 text-sm truncate">{video.title}</h4>
                    <p className="text-xs text-slate-500 truncate">{video.headline}</p>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <button onClick={onCancel} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
                            <ArrowLeft size={24} className="text-slate-600" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">Course Builder</h1>
                            <p className="text-slate-500">Create a course from existing videos</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {['select', 'organize', 'details'].map((s, idx) => (
                            <div key={s} className="flex items-center">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                    step === s 
                                        ? 'bg-indigo-600 text-white' 
                                        : idx < ['select', 'organize', 'details'].indexOf(step)
                                            ? 'bg-emerald-500 text-white'
                                            : 'bg-slate-200 text-slate-500'
                                }`}>
                                    {idx + 1}
                                </div>
                                {idx < 2 && <div className="w-8 h-0.5 bg-slate-200" />}
                            </div>
                        ))}
                    </div>
                </div>

                {step === 'select' && (
                    <div className="animate-fade-in">
                        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900">Select Videos</h2>
                                    <p className="text-sm text-slate-500">Choose the videos you want to include in your course</p>
                                </div>
                                <div className="bg-indigo-50 px-4 py-2 rounded-lg">
                                    <span className="text-indigo-700 font-bold">{selectedVideos.length}</span>
                                    <span className="text-indigo-600 text-sm ml-1">selected</span>
                                </div>
                            </div>
                            
                            {videos.length === 0 ? (
                                <div className="text-center py-12">
                                    <Video size={48} className="text-slate-300 mx-auto mb-4" />
                                    <p className="text-slate-500">No videos available. Create some training videos first!</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {videos.map(video => renderVideoCard(video))}
                                </div>
                            )}
                        </div>
                        
                        <div className="flex justify-end gap-3">
                            <Button variant="outline" onClick={onCancel}>Cancel</Button>
                            <Button 
                                onClick={() => setStep('organize')} 
                                disabled={selectedVideos.length === 0}
                                icon={<Layers size={16} />}
                            >
                                Next: Organize ({selectedVideos.length} videos)
                            </Button>
                        </div>
                    </div>
                )}

                {step === 'organize' && (
                    <div className="animate-fade-in">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-lg font-bold text-slate-900">Arrange Videos</h2>
                                    <p className="text-sm text-slate-500">Drag to reorder, rename as needed</p>
                                </div>
                                
                                <div className="space-y-3">
                                    {selectedVideos.map((sv, idx) => (
                                        <div key={sv.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 group">
                                            <div className="flex flex-col">
                                                <button 
                                                    onClick={() => moveVideoUp(sv.id)}
                                                    disabled={idx === 0}
                                                    className={`p-0.5 ${idx === 0 ? 'text-slate-300' : 'text-slate-500 hover:text-indigo-600'}`}
                                                >
                                                    <ChevronUp size={16} />
                                                </button>
                                                <button 
                                                    onClick={() => moveVideoDown(sv.id)}
                                                    disabled={idx === selectedVideos.length - 1}
                                                    className={`p-0.5 ${idx === selectedVideos.length - 1 ? 'text-slate-300' : 'text-slate-500 hover:text-indigo-600'}`}
                                                >
                                                    <ChevronDown size={16} />
                                                </button>
                                            </div>
                                            
                                            <div className="bg-indigo-100 text-indigo-600 px-2 py-1 rounded text-xs font-bold">
                                                {idx + 1}
                                            </div>
                                            
                                            <div className="w-16 h-10 bg-slate-200 rounded overflow-hidden flex-shrink-0">
                                                {sv.video.ecoverUrl && (
                                                    <img src={sv.video.ecoverUrl} className="w-full h-full object-cover" />
                                                )}
                                            </div>
                                            
                                            <div className="flex-1">
                                                <input
                                                    type="text"
                                                    value={sv.customTitle}
                                                    onChange={e => updateVideoTitle(sv.id, e.target.value)}
                                                    className="w-full text-sm font-medium bg-transparent border-b border-transparent focus:border-indigo-300 outline-none"
                                                    placeholder="Video title"
                                                />
                                                {sv.customTitle !== sv.originalTitle && (
                                                    <p className="text-[10px] text-slate-400">Original: {sv.originalTitle}</p>
                                                )}
                                            </div>
                                            
                                            <select
                                                value={sv.moduleId}
                                                onChange={e => updateVideoModule(sv.id, e.target.value)}
                                                className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
                                            >
                                                {modules.map(m => (
                                                    <option key={m.id} value={m.id}>{m.title}</option>
                                                ))}
                                            </select>
                                            
                                            <button 
                                                onClick={() => setSelectedVideos(prev => prev.filter(v => v.id !== sv.id))}
                                                className="p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="bg-white rounded-xl border border-slate-200 p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-lg font-bold text-slate-900">Modules</h2>
                                    <button 
                                        onClick={addModule}
                                        className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100"
                                    >
                                        <Plus size={16} />
                                    </button>
                                </div>
                                
                                <div className="space-y-2">
                                    {modules.map((mod, idx) => (
                                        <div key={mod.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                                            <div className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-xs font-bold">
                                                {idx + 1}
                                            </div>
                                            
                                            {editingModuleId === mod.id ? (
                                                <input
                                                    type="text"
                                                    value={editingModuleTitle}
                                                    onChange={e => setEditingModuleTitle(e.target.value)}
                                                    onBlur={saveModuleEdit}
                                                    onKeyDown={e => e.key === 'Enter' && saveModuleEdit()}
                                                    className="flex-1 text-sm font-medium border border-indigo-300 rounded px-2 py-0.5 outline-none"
                                                    autoFocus
                                                />
                                            ) : (
                                                <span 
                                                    onClick={() => startEditingModule(mod)}
                                                    className="flex-1 text-sm font-medium cursor-pointer hover:text-indigo-600"
                                                >
                                                    {mod.title}
                                                </span>
                                            )}
                                            
                                            <span className="text-xs text-slate-400">
                                                {selectedVideos.filter(sv => sv.moduleId === mod.id).length} videos
                                            </span>
                                            
                                            {modules.length > 1 && (
                                                <button 
                                                    onClick={() => removeModule(mod.id)}
                                                    className="p-1 text-slate-400 hover:text-red-500"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                
                                <p className="text-xs text-slate-400 mt-4">
                                    Click module names to rename. Assign videos to modules using the dropdown.
                                </p>
                            </div>
                        </div>
                        
                        <div className="flex justify-between gap-3">
                            <Button variant="outline" onClick={() => setStep('select')}>
                                <ArrowLeft size={16} className="mr-2" /> Back
                            </Button>
                            <Button onClick={() => setStep('details')} icon={<Sparkles size={16} />}>
                                Next: Course Details
                            </Button>
                        </div>
                    </div>
                )}

                {step === 'details' && (
                    <div className="animate-fade-in">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                            <div className="bg-white rounded-xl border border-slate-200 p-6">
                                <h2 className="text-lg font-bold text-slate-900 mb-4">Course Information</h2>
                                
                                <div className="space-y-4">
                                    <Input 
                                        label="Course Title"
                                        value={courseTitle}
                                        onChange={e => setCourseTitle(e.target.value)}
                                        placeholder="e.g., Complete Job Search Mastery"
                                    />
                                    
                                    <Input 
                                        label="Headline"
                                        value={courseHeadline}
                                        onChange={e => setCourseHeadline(e.target.value)}
                                        placeholder="e.g., Land your dream executive role in 90 days"
                                    />
                                    
                                    <TextArea 
                                        label="Description"
                                        value={courseDescription}
                                        onChange={e => setCourseDescription(e.target.value)}
                                        placeholder="Describe what students will learn..."
                                        rows={4}
                                    />
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">Cover Image</label>
                                        <div className="space-y-3">
                                            <input 
                                                type="file" 
                                                ref={coverInputRef}
                                                accept="image/*" 
                                                onChange={handleCoverUpload}
                                                className="hidden" 
                                            />
                                            <div className="flex gap-2">
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    onClick={() => coverInputRef.current?.click()}
                                                    icon={<Upload size={14} />}
                                                    className="flex-1"
                                                >
                                                    Upload Image
                                                </Button>
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    onClick={generateAICover}
                                                    disabled={isGeneratingCover}
                                                    icon={isGeneratingCover ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                                    className="flex-1"
                                                >
                                                    {isGeneratingCover ? 'Generating...' : 'Generate with AI'}
                                                </Button>
                                            </div>
                                            <Input 
                                                value={coverInstructions}
                                                onChange={e => setCoverInstructions(e.target.value)}
                                                placeholder="Optional: Describe your ideal cover..."
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="bg-white rounded-xl border border-slate-200 p-6">
                                <h2 className="text-lg font-bold text-slate-900 mb-4">Cover Preview</h2>
                                
                                <div className="border border-slate-200 rounded-xl overflow-hidden max-w-xs mx-auto">
                                    <div className="aspect-[3/4] bg-slate-100">
                                        {(courseCover || selectedVideos[0]?.video.ecoverUrl) ? (
                                            <img 
                                                src={courseCover || selectedVideos[0]?.video.ecoverUrl} 
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center flex-col gap-2">
                                                <ImageIcon size={48} className="text-slate-300" />
                                                <span className="text-xs text-slate-400">Upload or generate a cover</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-4">
                                        <h3 className="font-bold text-slate-900">{courseTitle || 'Untitled Course'}</h3>
                                        <p className="text-sm text-slate-500">{courseHeadline || 'Add a headline...'}</p>
                                        <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                                            <span>{modules.length} modules</span>
                                            <span>{selectedVideos.length} videos</span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="mt-4 p-3 bg-slate-50 rounded-lg">
                                    <h4 className="text-sm font-bold text-slate-700 mb-2">Course Structure</h4>
                                    {modules.map(mod => {
                                        const modVideos = selectedVideos.filter(sv => sv.moduleId === mod.id);
                                        if (modVideos.length === 0) return null;
                                        return (
                                            <div key={mod.id} className="mb-2">
                                                <p className="text-xs font-bold text-slate-600">{mod.title}</p>
                                                <ul className="ml-4">
                                                    {modVideos.map(sv => (
                                                        <li key={sv.id} className="text-xs text-slate-500">• {sv.customTitle}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex justify-between gap-3">
                            <Button variant="outline" onClick={() => setStep('organize')} disabled={isCreating}>
                                <ArrowLeft size={16} className="mr-2" /> Back
                            </Button>
                            <Button onClick={handleCreateCourse} disabled={isCreating} icon={isCreating ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}>
                                {isCreating ? 'Creating Course...' : 'Create Course'}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
