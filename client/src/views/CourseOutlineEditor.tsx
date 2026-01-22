import React, { useState, useRef, useEffect } from 'react';
import { Course, Module, Lesson } from '../types';
import { Button } from '../components/Button';
import { Input, TextArea } from '../components/Input';
import { 
    Save, X, ArrowLeft, ChevronUp, ChevronDown, Trash2, 
    Edit3, Check, FolderPlus, Plus, Image as ImageIcon,
    Sparkles, Loader2, GripVertical, Upload, Video
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
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

interface CourseOutlineEditorProps {
    course: Course;
    availableVideos?: Course[];
    onSave: (course: Course) => Promise<void>;
    onCancel: () => void;
}

export const CourseOutlineEditor: React.FC<CourseOutlineEditorProps> = ({ 
    course: initialCourse,
    availableVideos = [],
    onSave, 
    onCancel 
}) => {
    // Don't initialize with any data until we fetch full course
    const [course, setCourse] = useState<Course | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isGeneratingCover, setIsGeneratingCover] = useState(false);
    const [coverInstructions, setCoverInstructions] = useState('');
    
    const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
    const [editingModuleTitle, setEditingModuleTitle] = useState('');
    const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
    const [editingLessonTitle, setEditingLessonTitle] = useState('');
    
    // Video picker modal state
    const [showVideoPicker, setShowVideoPicker] = useState(false);
    const [targetModuleId, setTargetModuleId] = useState<string | null>(null);
    const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);
    const [isAddingVideos, setIsAddingVideos] = useState(false);
    
    const coverInputRef = useRef<HTMLInputElement>(null);
    
    // Fetch full course data on mount to ensure we have all media URLs
    // Only set course state AFTER fetch completes to prevent editing lightweight data
    useEffect(() => {
        const fetchFullCourse = async () => {
            try {
                console.log('CourseOutlineEditor: Fetching full course data for', initialCourse.id);
                const fullCourse = await api.courses.get(initialCourse.id);
                console.log('CourseOutlineEditor: Got full course data with', 
                    fullCourse.modules?.reduce((acc: number, m: any) => acc + (m.lessons?.length || 0), 0), 'lessons');
                setCourse(fullCourse);
                setLoadError(null);
            } catch (e: any) {
                console.error('CourseOutlineEditor: Failed to fetch full course:', e);
                setLoadError(e.message || 'Failed to load course data');
                // Do NOT set course state - keep it null to prevent editing
            } finally {
                setIsLoading(false);
            }
        };
        fetchFullCourse();
    }, [initialCourse.id]);

    const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                setCourse(prev => prev ? { ...prev, ecoverUrl: reader.result as string } : prev);
            };
            reader.readAsDataURL(file);
        }
    };

    const generateAICover = async () => {
        if (!course || !course.title) {
            alert('Please enter a course title first.');
            return;
        }
        
        const apiKey = getGeminiApiKey();
        if (!apiKey) {
            alert('Gemini API key not configured. Please add it in Settings.');
            return;
        }
        
        setIsGeneratingCover(true);
        try {
            const ai = new GoogleGenAI({ apiKey });
            const prompt = `Create a professional, modern course cover image for a course titled "${course.title}". ${coverInstructions || 'Use a clean, professional design with relevant imagery. Make it visually appealing and suitable for an online learning platform.'}`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.0-flash-exp',
                contents: prompt,
                config: {
                    responseModalities: ['IMAGE', 'TEXT'],
                }
            });
            
            if (response.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData?.mimeType?.startsWith('image/')) {
                        const base64 = part.inlineData.data;
                        const dataUrl = `data:${part.inlineData.mimeType};base64,${base64}`;
                        setCourse(prev => prev ? { ...prev, ecoverUrl: dataUrl } : prev);
                        break;
                    }
                }
            }
        } catch (error) {
            console.error('Failed to generate cover:', error);
            alert('Failed to generate cover image. Please try again.');
        } finally {
            setIsGeneratingCover(false);
        }
    };

    const handleSave = async () => {
        if (!course || !course.title.trim()) {
            alert('Please enter a course title.');
            return;
        }
        
        setIsSaving(true);
        try {
            await onSave(course);
        } catch (error) {
            console.error('Failed to save course:', error);
            alert('Failed to save course. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    // Module operations
    const addModule = () => {
        if (!course) return;
        const newModule: Module = {
            id: `module-${Date.now()}`,
            courseId: course.id,
            title: `Module ${course.modules.length + 1}`,
            lessons: []
        };
        setCourse(prev => prev ? {
            ...prev,
            modules: [...prev.modules, newModule]
        } : prev);
    };

    const updateModuleTitle = (moduleId: string, title: string) => {
        setCourse(prev => prev ? {
            ...prev,
            modules: prev.modules.map(m => 
                m.id === moduleId ? { ...m, title } : m
            )
        } : prev);
    };

    const deleteModule = (moduleId: string) => {
        if (!course) return;
        if (course.modules.length <= 1) {
            alert('Cannot delete the last module.');
            return;
        }
        if (!confirm('Delete this module and all its lessons?')) return;
        setCourse(prev => prev ? {
            ...prev,
            modules: prev.modules.filter(m => m.id !== moduleId)
        } : prev);
    };

    const moveModule = (moduleId: string, direction: 'up' | 'down') => {
        if (!course) return;
        const idx = course.modules.findIndex(m => m.id === moduleId);
        if (idx === -1) return;
        if (direction === 'up' && idx === 0) return;
        if (direction === 'down' && idx === course.modules.length - 1) return;
        
        const newModules = [...course.modules];
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        [newModules[idx], newModules[targetIdx]] = [newModules[targetIdx], newModules[idx]];
        setCourse(prev => prev ? { ...prev, modules: newModules } : prev);
    };

    // Lesson operations
    const updateLessonTitle = (moduleId: string, lessonId: string, title: string) => {
        setCourse(prev => prev ? {
            ...prev,
            modules: prev.modules.map(m => 
                m.id === moduleId 
                    ? { ...m, lessons: m.lessons.map(l => l.id === lessonId ? { ...l, title } : l) }
                    : m
            )
        } : prev);
    };

    const deleteLesson = (moduleId: string, lessonId: string) => {
        if (!confirm('Delete this lesson? The video content will be removed from this course.')) return;
        setCourse(prev => prev ? {
            ...prev,
            modules: prev.modules.map(m => 
                m.id === moduleId 
                    ? { ...m, lessons: m.lessons.filter(l => l.id !== lessonId) }
                    : m
            )
        } : prev);
    };

    const moveLesson = (moduleId: string, lessonId: string, direction: 'up' | 'down') => {
        if (!course) return;
        const module = course.modules.find(m => m.id === moduleId);
        if (!module) return;
        
        const idx = module.lessons.findIndex(l => l.id === lessonId);
        if (idx === -1) return;
        if (direction === 'up' && idx === 0) return;
        if (direction === 'down' && idx === module.lessons.length - 1) return;
        
        const newLessons = [...module.lessons];
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        [newLessons[idx], newLessons[targetIdx]] = [newLessons[targetIdx], newLessons[idx]];
        
        setCourse(prev => prev ? {
            ...prev,
            modules: prev.modules.map(m => 
                m.id === moduleId ? { ...m, lessons: newLessons } : m
            )
        } : prev);
    };

    const moveLessonToModule = (fromModuleId: string, lessonId: string, toModuleId: string) => {
        if (!course) return;
        const fromModule = course.modules.find(m => m.id === fromModuleId);
        if (!fromModule) return;
        
        const lesson = fromModule.lessons.find(l => l.id === lessonId);
        if (!lesson) return;
        
        setCourse(prev => prev ? {
            ...prev,
            modules: prev.modules.map(m => {
                if (m.id === fromModuleId) {
                    return { ...m, lessons: m.lessons.filter(l => l.id !== lessonId) };
                }
                if (m.id === toModuleId) {
                    return { ...m, lessons: [...m.lessons, { ...lesson, moduleId: toModuleId }] };
                }
                return m;
            })
        } : prev);
    };

    // Video picker functions
    const openVideoPicker = (moduleId: string) => {
        setTargetModuleId(moduleId);
        setSelectedVideoIds([]);
        setShowVideoPicker(true);
    };

    const toggleVideoSelection = (videoId: string) => {
        setSelectedVideoIds(prev => 
            prev.includes(videoId) 
                ? prev.filter(id => id !== videoId)
                : [...prev, videoId]
        );
    };

    const addSelectedVideos = async () => {
        if (!course || !targetModuleId || selectedVideoIds.length === 0) return;
        
        setIsAddingVideos(true);
        try {
            // Fetch full video data for each selected video
            const fullVideos = await Promise.all(
                selectedVideoIds.map(id => api.courses.get(id))
            );
            
            // Create lessons from the videos, including sourceVideoId to track origin
            // Only process videos that have actual lesson content
            const newLessons: Lesson[] = fullVideos
                .filter(video => video.modules[0]?.lessons[0]) // Skip videos without content
                .map(video => {
                    const originalLesson = video.modules[0].lessons[0];
                    return {
                        ...originalLesson,
                        id: `lesson-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        moduleId: targetModuleId,
                        title: originalLesson.title || video.title,
                        sourceVideoId: video.id
                    };
                });
            
            setCourse(prev => prev ? {
                ...prev,
                modules: prev.modules.map(m => 
                    m.id === targetModuleId 
                        ? { ...m, lessons: [...m.lessons, ...newLessons] }
                        : m
                )
            } : prev);
            
            setShowVideoPicker(false);
            setSelectedVideoIds([]);
            setTargetModuleId(null);
        } catch (error) {
            console.error('Failed to add videos:', error);
            alert('Failed to add videos. Please try again.');
        } finally {
            setIsAddingVideos(false);
        }
    };

    // Get videos that are not already in the course
    const getAvailableVideosForPicker = () => {
        if (!course) return [];
        
        // Collect all source video IDs and titles from existing lessons
        const existingVideoIds = new Set<string>();
        const existingLessonTitles = new Set<string>();
        
        course.modules.forEach(m => {
            m.lessons.forEach(l => {
                // Check if there's a source video ID we can match
                if (l.sourceVideoId) {
                    existingVideoIds.add(l.sourceVideoId);
                }
                // Also track titles for fallback matching
                if (l.title) {
                    existingLessonTitles.add(l.title.toLowerCase().trim());
                }
            });
        });
        
        // Filter out videos that are already in the course by ID or by title match
        return availableVideos.filter(v => {
            if (existingVideoIds.has(v.id)) return false;
            // Also check by title as a fallback for legacy lessons
            const videoTitle = v.title?.toLowerCase().trim() || '';
            if (videoTitle && existingLessonTitles.has(videoTitle)) return false;
            return true;
        });
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 size={48} className="animate-spin text-indigo-600 mx-auto mb-4" />
                    <p className="text-slate-600">Loading course data...</p>
                </div>
            </div>
        );
    }
    
    if (loadError || !course) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center">
                <div className="text-center max-w-md bg-white rounded-xl p-8 shadow-lg border border-red-200">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <X size={32} className="text-red-600" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 mb-2">Failed to Load Course</h2>
                    <p className="text-slate-600 mb-6">{loadError || 'Could not load course data. Please try again.'}</p>
                    <Button onClick={onCancel}>Go Back</Button>
                </div>
            </div>
        );
    }
    
    return (
        <div className="min-h-screen bg-slate-100 p-6">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={onCancel}
                            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                            <ArrowLeft size={24} className="text-slate-600" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800">Edit Course</h1>
                            <p className="text-slate-500 text-sm">Modify course structure and details</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleSave} 
                            disabled={isSaving}
                            icon={isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column: Course Details */}
                    <div className="lg:col-span-1 space-y-6">
                        {/* Cover Image */}
                        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                                <ImageIcon size={18} className="text-indigo-600" />
                                Cover Image
                            </h3>
                            
                            <input 
                                type="file" 
                                ref={coverInputRef} 
                                onChange={handleCoverUpload} 
                                accept="image/*" 
                                className="hidden" 
                            />
                            
                            {course.ecoverUrl ? (
                                <div className="relative group">
                                    <img 
                                        src={course.ecoverUrl} 
                                        alt="Course cover" 
                                        className="w-full aspect-[3/4] object-cover rounded-lg border border-slate-200"
                                    />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                                        <button 
                                            onClick={() => coverInputRef.current?.click()}
                                            className="p-2 bg-white rounded-lg hover:bg-slate-100"
                                        >
                                            <Upload size={20} className="text-slate-700" />
                                        </button>
                                        <button 
                                            onClick={() => setCourse(prev => prev ? { ...prev, ecoverUrl: '' } : prev)}
                                            className="p-2 bg-white rounded-lg hover:bg-slate-100"
                                        >
                                            <Trash2 size={20} className="text-red-600" />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div 
                                    onClick={() => coverInputRef.current?.click()}
                                    className="w-full aspect-[3/4] bg-slate-100 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                                >
                                    <ImageIcon size={32} className="text-slate-400 mb-2" />
                                    <span className="text-sm text-slate-500">Click to upload</span>
                                </div>
                            )}
                            
                            <div className="mt-4 space-y-2">
                                <Input
                                    placeholder="AI instructions (optional)"
                                    value={coverInstructions}
                                    onChange={(e) => setCoverInstructions(e.target.value)}
                                />
                                <Button 
                                    variant="outline" 
                                    onClick={generateAICover}
                                    disabled={isGeneratingCover}
                                    className="w-full"
                                    icon={isGeneratingCover ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                >
                                    {isGeneratingCover ? 'Generating...' : 'Generate with AI'}
                                </Button>
                            </div>
                        </div>

                        {/* Course Info */}
                        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                            <h3 className="font-semibold text-slate-800 mb-4">Course Details</h3>
                            <div className="space-y-4">
                                <Input
                                    label="Course Title"
                                    value={course.title}
                                    onChange={(e) => setCourse(prev => prev ? { ...prev, title: e.target.value } : prev)}
                                    placeholder="Enter course title"
                                />
                                <Input
                                    label="Headline"
                                    value={course.headline || ''}
                                    onChange={(e) => setCourse(prev => prev ? { ...prev, headline: e.target.value } : prev)}
                                    placeholder="Short catchy headline"
                                />
                                <TextArea
                                    label="Description"
                                    value={course.description || ''}
                                    onChange={(e) => setCourse(prev => prev ? { ...prev, description: e.target.value } : prev)}
                                    placeholder="Describe what students will learn"
                                    rows={4}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Modules & Lessons */}
                    <div className="lg:col-span-2">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                                <h3 className="font-semibold text-slate-800">Course Structure</h3>
                                <Button size="sm" onClick={addModule} icon={<FolderPlus size={14} />}>
                                    Add Module
                                </Button>
                            </div>

                            <div className="divide-y divide-slate-100">
                                {course.modules.map((module, moduleIdx) => (
                                    <div key={module.id} className="bg-white">
                                        {/* Module Header */}
                                        <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center gap-3">
                                            <GripVertical size={16} className="text-slate-400" />
                                            
                                            <div className="flex items-center gap-1">
                                                <button 
                                                    onClick={() => moveModule(module.id, 'up')}
                                                    disabled={moduleIdx === 0}
                                                    className="p-1 hover:bg-slate-200 rounded disabled:opacity-30"
                                                >
                                                    <ChevronUp size={16} className="text-slate-600" />
                                                </button>
                                                <button 
                                                    onClick={() => moveModule(module.id, 'down')}
                                                    disabled={moduleIdx === course.modules.length - 1}
                                                    className="p-1 hover:bg-slate-200 rounded disabled:opacity-30"
                                                >
                                                    <ChevronDown size={16} className="text-slate-600" />
                                                </button>
                                            </div>
                                            
                                            {editingModuleId === module.id ? (
                                                <div className="flex-1 flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={editingModuleTitle}
                                                        onChange={(e) => setEditingModuleTitle(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                updateModuleTitle(module.id, editingModuleTitle);
                                                                setEditingModuleId(null);
                                                            }
                                                            if (e.key === 'Escape') setEditingModuleId(null);
                                                        }}
                                                        className="flex-1 px-2 py-1 border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        autoFocus
                                                    />
                                                    <button 
                                                        onClick={() => {
                                                            updateModuleTitle(module.id, editingModuleTitle);
                                                            setEditingModuleId(null);
                                                        }}
                                                        className="p-1 bg-indigo-100 hover:bg-indigo-200 rounded"
                                                    >
                                                        <Check size={14} className="text-indigo-600" />
                                                    </button>
                                                    <button 
                                                        onClick={() => setEditingModuleId(null)}
                                                        className="p-1 bg-slate-100 hover:bg-slate-200 rounded"
                                                    >
                                                        <X size={14} className="text-slate-600" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div 
                                                    className="flex-1 font-semibold text-slate-800 cursor-pointer hover:text-indigo-600 flex items-center gap-2"
                                                    onClick={() => {
                                                        setEditingModuleId(module.id);
                                                        setEditingModuleTitle(module.title);
                                                    }}
                                                >
                                                    {module.title}
                                                    <Edit3 size={12} className="text-slate-400" />
                                                </div>
                                            )}
                                            
                                            <span className="text-xs text-slate-500 bg-slate-200 px-2 py-1 rounded">
                                                {module.lessons.length} lesson{module.lessons.length !== 1 ? 's' : ''}
                                            </span>
                                            
                                            {availableVideos.length > 0 && (
                                                <button 
                                                    onClick={() => openVideoPicker(module.id)}
                                                    className="p-1.5 hover:bg-indigo-100 rounded text-slate-400 hover:text-indigo-600 flex items-center gap-1"
                                                    title="Add existing videos"
                                                >
                                                    <Video size={14} />
                                                    <Plus size={10} />
                                                </button>
                                            )}
                                            
                                            <button 
                                                onClick={() => deleteModule(module.id)}
                                                className="p-1.5 hover:bg-red-100 rounded text-slate-400 hover:text-red-600"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>

                                        {/* Lessons */}
                                        <div className="divide-y divide-slate-50">
                                            {module.lessons.map((lesson, lessonIdx) => (
                                                <div key={lesson.id} className="p-3 pl-12 flex items-center gap-3 hover:bg-slate-50">
                                                    <GripVertical size={14} className="text-slate-300" />
                                                    
                                                    <div className="flex items-center gap-1">
                                                        <button 
                                                            onClick={() => moveLesson(module.id, lesson.id, 'up')}
                                                            disabled={lessonIdx === 0}
                                                            className="p-0.5 hover:bg-slate-200 rounded disabled:opacity-30"
                                                        >
                                                            <ChevronUp size={14} className="text-slate-500" />
                                                        </button>
                                                        <button 
                                                            onClick={() => moveLesson(module.id, lesson.id, 'down')}
                                                            disabled={lessonIdx === module.lessons.length - 1}
                                                            className="p-0.5 hover:bg-slate-200 rounded disabled:opacity-30"
                                                        >
                                                            <ChevronDown size={14} className="text-slate-500" />
                                                        </button>
                                                    </div>
                                                    
                                                    {editingLessonId === lesson.id ? (
                                                        <div className="flex-1 flex items-center gap-2">
                                                            <input
                                                                type="text"
                                                                value={editingLessonTitle}
                                                                onChange={(e) => setEditingLessonTitle(e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                        updateLessonTitle(module.id, lesson.id, editingLessonTitle);
                                                                        setEditingLessonId(null);
                                                                    }
                                                                    if (e.key === 'Escape') setEditingLessonId(null);
                                                                }}
                                                                className="flex-1 px-2 py-1 text-sm border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                autoFocus
                                                            />
                                                            <button 
                                                                onClick={() => {
                                                                    updateLessonTitle(module.id, lesson.id, editingLessonTitle);
                                                                    setEditingLessonId(null);
                                                                }}
                                                                className="p-1 bg-indigo-100 hover:bg-indigo-200 rounded"
                                                            >
                                                                <Check size={12} className="text-indigo-600" />
                                                            </button>
                                                            <button 
                                                                onClick={() => setEditingLessonId(null)}
                                                                className="p-1 bg-slate-100 hover:bg-slate-200 rounded"
                                                            >
                                                                <X size={12} className="text-slate-600" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div 
                                                            className="flex-1 text-sm text-slate-700 cursor-pointer hover:text-indigo-600 flex items-center gap-2"
                                                            onClick={() => {
                                                                setEditingLessonId(lesson.id);
                                                                setEditingLessonTitle(lesson.title);
                                                            }}
                                                        >
                                                            {lesson.title}
                                                            <Edit3 size={10} className="text-slate-400" />
                                                        </div>
                                                    )}
                                                    
                                                    {/* Move to Module dropdown */}
                                                    {course.modules.length > 1 && (
                                                        <select
                                                            value={module.id}
                                                            onChange={(e) => moveLessonToModule(module.id, lesson.id, e.target.value)}
                                                            className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
                                                        >
                                                            {course.modules.map(m => (
                                                                <option key={m.id} value={m.id}>
                                                                    {m.title}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    )}
                                                    
                                                    <button 
                                                        onClick={() => deleteLesson(module.id, lesson.id)}
                                                        className="p-1 hover:bg-red-100 rounded text-slate-400 hover:text-red-600"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                            
                                            {module.lessons.length === 0 && (
                                                <div className="p-4 pl-12 text-sm text-slate-400 italic">
                                                    No lessons in this module
                                                    {availableVideos.length > 0 && (
                                                        <button
                                                            onClick={() => openVideoPicker(module.id)}
                                                            className="ml-2 text-indigo-500 hover:text-indigo-700 underline"
                                                        >
                                                            Add videos
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Video Picker Modal */}
            {showVideoPicker && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80vh] flex flex-col">
                        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">Add Existing Videos</h2>
                                <p className="text-sm text-slate-500">Select videos to add to this module</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="bg-indigo-50 px-4 py-2 rounded-lg">
                                    <span className="text-indigo-700 font-bold">{selectedVideoIds.length}</span>
                                    <span className="text-indigo-600 text-sm ml-1">selected</span>
                                </div>
                                <button 
                                    onClick={() => setShowVideoPicker(false)}
                                    className="p-2 hover:bg-slate-100 rounded-lg"
                                >
                                    <X size={20} className="text-slate-500" />
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6">
                            {getAvailableVideosForPicker().length === 0 ? (
                                <div className="text-center py-12">
                                    <Video size={48} className="text-slate-300 mx-auto mb-4" />
                                    <p className="text-slate-500">No videos available to add.</p>
                                    <p className="text-slate-400 text-sm mt-1">All your videos are already in this course.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {getAvailableVideosForPicker().map(video => {
                                        const isSelected = selectedVideoIds.includes(video.id);
                                        const lesson = video.modules[0]?.lessons[0];
                                        const duration = lesson?.duration || '0:00';
                                        const hasPlayableContent = !!(
                                            lesson?.renderedVideoUrl || 
                                            lesson?.videoUrl || 
                                            lesson?.audioData || 
                                            (lesson?.visuals && lesson.visuals.length > 0)
                                        );
                                        
                                        return (
                                            <div 
                                                key={video.id}
                                                onClick={() => toggleVideoSelection(video.id)}
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
                                    })}
                                </div>
                            )}
                        </div>
                        
                        <div className="p-4 border-t border-slate-200 flex justify-end gap-3">
                            <Button variant="outline" onClick={() => setShowVideoPicker(false)}>
                                Cancel
                            </Button>
                            <Button 
                                onClick={addSelectedVideos}
                                disabled={selectedVideoIds.length === 0 || isAddingVideos}
                                icon={isAddingVideos ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                            >
                                {isAddingVideos ? 'Adding...' : `Add ${selectedVideoIds.length} Video${selectedVideoIds.length !== 1 ? 's' : ''}`}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
