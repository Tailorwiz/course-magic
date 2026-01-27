
import React from 'react';
import { Course } from '../types';
import { X, Layers, FileText, Users, Clock } from 'lucide-react';

interface CourseDetailsModalProps {
  course: Course;
  onClose: () => void;
}

export const CourseDetailsModal: React.FC<CourseDetailsModalProps> = ({ course, onClose }) => {
  const totalLessons = course.modules.reduce((acc, m) => acc + m.lessons.length, 0);
  
  // Calculate total duration in seconds across all lessons
  const totalSeconds = course.modules.reduce((acc, m) => 
    acc + m.lessons.reduce((lAcc, l) => lAcc + (l.durationSeconds || 0), 0), 0
  );

  // Format duration nicely
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const durationString = hours > 0 
    ? `${hours}h ${minutes}m` 
    : `${minutes}m`;

  const isGenericHeadline = !course.headline || course.headline === 'AI Generated Video' || course.headline === 'Generated Course';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row relative animate-slide-up" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors">
            <X size={20} />
        </button>

        {/* Image Section - Redesigned to fit full cover without cropping */}
        <div className="w-full md:w-2/5 bg-slate-900 relative min-h-[200px] md:min-h-full overflow-hidden flex items-center justify-center">
            {/* Blurred Background Layer for ambiance */}
            <div 
                className="absolute inset-0 opacity-50 blur-xl scale-110" 
                style={{ backgroundImage: `url(${course.ecoverUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
            ></div>
            
            {/* Main Image Layer - Contained to show full aspect ratio */}
            <img src={course.ecoverUrl} className="w-full h-full object-contain relative z-10 shadow-2xl p-4" alt={course.title} />
            
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent z-20 pointer-events-none"></div>
            
            <div className="absolute bottom-0 left-0 right-0 p-6 text-white z-30">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-2 text-indigo-400">
                    <span className="bg-indigo-500/20 px-2 py-1 rounded border border-indigo-500/30 backdrop-blur-md">
                        {course.type === 'video' ? 'Video Series' : 'Professional Course'}
                    </span>
                </div>
                <h2 className="text-2xl font-bold leading-tight mb-2 text-shadow-strong">{course.title}</h2>
                {!isGenericHeadline && (
                    <p className="text-sm text-slate-300 line-clamp-3 font-medium">{course.headline}</p>
                )}
            </div>
        </div>

        {/* Content Section */}
        <div className="flex-1 overflow-y-auto p-8 bg-white custom-scrollbar">
            
            {/* Stats Row */}
            <div className="flex flex-wrap gap-4 mb-8 pb-8 border-b border-slate-100">
                <div className="flex items-center gap-3 text-slate-600">
                    <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl"><Layers size={20} /></div>
                    <div>
                        <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Modules</div>
                        <div className="font-bold text-slate-900">{course.modules.length}</div>
                    </div>
                </div>
                <div className="flex items-center gap-3 text-slate-600">
                    <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl"><FileText size={20} /></div>
                    <div>
                        <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Lessons</div>
                        <div className="font-bold text-slate-900">{totalLessons}</div>
                    </div>
                </div>
                {/* Total Duration Stat */}
                <div className="flex items-center gap-3 text-slate-600">
                    <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl"><Clock size={20} /></div>
                    <div>
                        <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Duration</div>
                        <div className="font-bold text-slate-900">{durationString}</div>
                    </div>
                </div>
                {course.totalStudents > 0 && (
                    <div className="flex items-center gap-3 text-slate-600">
                        <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl"><Users size={20} /></div>
                        <div>
                            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Students</div>
                            <div className="font-bold text-slate-900">{course.totalStudents.toLocaleString()}</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Description */}
            <div className="mb-8">
                <h3 className="text-lg font-bold text-slate-900 mb-3">About this Course</h3>
                <p className="text-slate-600 leading-relaxed text-sm whitespace-pre-wrap">
                    {course.description || "No description provided."}
                </p>
            </div>

            {/* Curriculum Preview */}
            <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4">Curriculum Preview</h3>
                <div className="space-y-3">
                    {course.modules.length === 0 ? (
                        <div className="text-sm text-slate-400 italic">No content details available.</div>
                    ) : (
                        course.modules.map((mod, idx) => (
                            <div key={mod.id} className="border border-slate-100 rounded-xl overflow-hidden">
                                <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                                    <div className="font-semibold text-slate-700 text-sm flex items-center gap-2">
                                        <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 text-[10px] font-bold flex items-center justify-center">{idx + 1}</span>
                                        {mod.title}
                                    </div>
                                    <span className="text-xs text-slate-400 font-medium">{mod.lessons.length} lessons</span>
                                </div>
                                <div className="bg-white px-4 py-3">
                                    <ul className="space-y-2">
                                        {mod.lessons.slice(0, 3).map((l, i) => (
                                            <li key={l.id} className="text-xs text-slate-500 flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-200 flex-shrink-0"></div>
                                                <span className="truncate">{l.title}</span>
                                            </li>
                                        ))}
                                        {mod.lessons.length > 3 && (
                                            <li className="text-xs text-indigo-500 font-medium pl-3.5 pt-1">+ {mod.lessons.length - 3} more lessons</li>
                                        )}
                                        {mod.lessons.length === 0 && (
                                            <li className="text-xs text-slate-400 italic pl-3.5">Content coming soon...</li>
                                        )}
                                    </ul>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

        </div>
      </div>
    </div>
  );
};
