import React, { useRef, useState, useEffect } from 'react';
import { Course, User } from '../types';
import { Users, Clock, PlusCircle, UploadCloud, Edit3, Trash2, AlertTriangle, FileArchive, Video, Megaphone, Presentation, Clapperboard, MonitorPlay, X, Eye, Image, FlaskConical, Settings, BookOpen, Info, Images, Award, Printer, ArrowRight, HelpCircle, Loader2, Layers, Download } from 'lucide-react';
import { Button } from '../components/Button';
import { safeExportCourse, exportCourseAsZip, getCourseFromDB } from '../utils';
import { CourseDetailsModal } from '../components/CourseDetailsModal';
import { CertificateTemplate } from '../components/CertificateTemplate';
import { api } from '../api';

const formatDuration = (totalSeconds: number): string => {
  if (!totalSeconds || totalSeconds <= 0) return '';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

const getCourseDuration = (course: Course): number => {
  return course.modules.reduce((total, mod) => 
    total + (mod.lessons?.reduce((lessonTotal, lesson) => 
      lessonTotal + (lesson.durationSeconds || 0), 0) || 0), 0);
};

interface CreatorDashboardProps {
  courses: Course[];
  currentUser: User;
  onCreateNew: () => void;
  onCreateVideo: (type: string) => void;
  onEdit: (course: Course) => void;
  onView: (course: Course) => void;
  onImport: (course: Course) => Promise<void> | void;
  onDelete: (courseId: string) => void;
  onNavigate: (view: string) => void;
  showVideoModalOnMount?: boolean;
  isLoading?: boolean;
}

export const CreatorDashboard: React.FC<CreatorDashboardProps> = ({ courses, currentUser, onCreateNew, onCreateVideo, onEdit, onView, onImport, onDelete, onNavigate, showVideoModalOnMount, isLoading }) => {
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);
  const [showVideoModal, setShowVideoModal] = useState(showVideoModalOnMount || false);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [coverCache, setCoverCache] = useState<Record<string, string>>({});
  
  useEffect(() => {
    if (showVideoModalOnMount) {
      setShowVideoModal(true);
    }
  }, [showVideoModalOnMount]);
  
  // Lazy load cover images from database
  useEffect(() => {
    const loadCovers = async () => {
      for (const course of courses) {
        // Skip if already has a URL-based cover or already cached
        if (course.ecoverUrl && course.ecoverUrl.length > 0) continue;
        if (coverCache[course.id]) continue;
        // Only fetch if course has a cover in DB (hasCoverInDb flag)
        if (!(course as any).hasCoverInDb) continue;
        
        try {
          const cover = await api.courses.getCover(course.id);
          if (cover) {
            setCoverCache(prev => ({ ...prev, [course.id]: cover }));
          }
        } catch (e) {
          // Silently fail - just won't show cover
        }
      }
    };
    
    if (courses.length > 0) {
      loadCovers();
    }
  }, [courses]);
  const [detailsCourse, setDetailsCourse] = useState<Course | null>(null);
  const [previewCertCourse, setPreviewCertCourse] = useState<Course | null>(null);
  const [isLoadingCertCourse, setIsLoadingCertCourse] = useState(false);
  const [isSavingCert, setIsSavingCert] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  
  // State for Learn More Modal
  const [learnMoreType, setLearnMoreType] = useState<any | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const result = await api.courses.uploadZip(file);
      if (result.success) {
        if (result.courses && result.count) {
          alert(`Successfully imported ${result.count} course(s)! The page will refresh.`);
        } else if (result.course) {
          alert(`Course "${(result.course as any).title}" imported successfully! The page will refresh.`);
        }
        window.location.reload();
      } else {
        alert("Failed to import course. Please check the file format.");
      }
    } catch (err) {
      console.error("Import failed:", err);
      alert(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsImporting(false);
    }
    
    if (importInputRef.current) {
      importInputRef.current.value = "";
    }
  };

  const handleZipDownload = async (e: React.MouseEvent | null, course: Course) => {
    if (e) e.stopPropagation();
    setIsExporting(course.id);
    try {
        // Fetch full data from DB to ensure assets (audio/images) are included
        const fullCourse = await getCourseFromDB(course.id);
        if (fullCourse) {
            await exportCourseAsZip(fullCourse);
        } else {
            // Fallback to current state if DB fetch fails (though unlikely)
            console.warn("Could not fetch full course from DB, exporting current state.");
            await exportCourseAsZip(course);
        }
    } catch (err) {
        console.error("Export failed:", err);
        alert("Failed to export course. Please try again.");
    } finally {
        setIsExporting(null);
    }
  };

  const handleCoverDownload = (e: React.MouseEvent, course: Course) => {
      e.stopPropagation();
      if (!course.ecoverUrl) return;
      const link = document.createElement('a');
      link.href = course.ecoverUrl;
      link.download = `${course.title.replace(/[^a-z0-9]/gi, '_')}_cover.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleEditClick = (e: React.MouseEvent, course: Course) => {
      e.stopPropagation();
      onEdit(course);
  };

  const handleViewClick = (e: React.MouseEvent, course: Course) => {
      e.stopPropagation();
      onView(course);
  };

  const handleDeleteClick = (e: React.MouseEvent, course: Course) => {
      e.stopPropagation();
      setCourseToDelete(course);
  };

  const handlePreviewCertificate = async (e: React.MouseEvent, course: Course) => {
      e.stopPropagation();
      setIsLoadingCertCourse(true);
      try {
          // Fetch FULL course data to avoid overwriting with lightweight data
          const fullCourse = await api.courses.get(course.id);
          setPreviewCertCourse(fullCourse);
      } catch (err) {
          console.error('Failed to load full course data:', err);
          alert('Failed to load course data. Please try again.');
      } finally {
          setIsLoadingCertCourse(false);
      }
  };

  const confirmDelete = async (withBackup: boolean) => {
      if (courseToDelete) {
          if (withBackup) {
              await handleZipDownload(null, courseToDelete);
          }
          onDelete(courseToDelete.id);
          setCourseToDelete(null);
      }
  };

  const videoTypes = [
      { 
          id: 'Slide Deck', 
          icon: <Images size={24} className="text-orange-500"/>, 
          desc: 'Turn slide images into a narrated video.',
          fullDesc: 'A classic "presentation-style" video where the visual focus is on static slides containing text, data, or diagrams, synchronized with a voiceover. Best for converting existing PDF/PPT content into video.',
          bestFor: 'Lectures, Financial Reports, Pitch Decks'
      },
      { 
          id: 'Training', 
          icon: <Presentation size={24} className="text-emerald-500"/>, 
          desc: 'Educational content, tutorials, or SOPs.',
          fullDesc: 'Structured instructional content designed to teach a specific skill, process, or concept. The AI focuses on clarity, logical flow (Intro -> Steps -> Summary), and retention.',
          bestFor: 'Employee Onboarding, "How-To" Guides, Safety Protocols'
      },
      { 
          id: 'Sales', 
          icon: <Megaphone size={24} className="text-blue-500"/>, 
          desc: 'VSLs, product launches, and promos.',
          fullDesc: 'High-energy, persuasive content designed solely to convert a viewer into a buyer. The AI uses psychological frameworks (Hook -> Pain -> Solution) and fast-paced visuals.',
          bestFor: 'Video Sales Letters (VSL), Ads, Product Launches'
      },
      { 
          id: 'Explainer', 
          icon: <MonitorPlay size={24} className="text-indigo-500"/>, 
          desc: 'Product walkthroughs and concepts.',
          fullDesc: 'A concise overview that simplifies a complex product, service, or idea. Focuses on "What is it?" and "Why do I need it?". Uses simple language and abstract illustrations.',
          bestFor: 'SaaS Homepages, Concept Intros, Pitching Ideas'
      },
      { 
          id: 'Social Short', 
          icon: <Clapperboard size={24} className="text-pink-500"/>, 
          desc: 'Vertical video for TikTok/Reels (30s-60s).',
          fullDesc: 'Vertical (9:16) content designed for mobile feeds. Extremely fast pacing with cuts every 2-3 seconds. The AI optimizes for a strong "Hook" in the first 3 seconds.',
          bestFor: 'TikTok, Instagram Reels, YouTube Shorts'
      },
      { 
          id: 'Corporate', 
          icon: <Video size={24} className="text-slate-500"/>, 
          desc: 'Internal updates or announcements.',
          fullDesc: 'Professional updates, executive messages, or quarterly reports. The tone is formal, polished, and brand-safe. Avoids slang or excessive visual noise.',
          bestFor: 'CEO Updates, Internal Memos, Stakeholder Reports'
      },
  ];

  return (
    <div className="p-4 lg:p-8 space-y-8 max-w-7xl mx-auto relative min-h-screen">
      <input
        type="file"
        ref={importInputRef}
        onChange={handleFileImport}
        accept=".zip,application/zip"
        className="hidden"
      />
      
      {detailsCourse && <CourseDetailsModal course={detailsCourse} onClose={() => setDetailsCourse(null)} />}

      {/* Loading Modal for Certificate */}
      {isLoadingCertCourse && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl p-8 flex flex-col items-center gap-4">
                  <Loader2 className="animate-spin text-indigo-600" size={32} />
                  <p className="text-slate-600">Loading course data...</p>
              </div>
          </div>
      )}

      {/* Certificate Preview Modal */}
      {previewCertCourse && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-fade-in" onClick={() => !isSavingCert && setPreviewCertCourse(null)}>
              <div className="w-full max-w-6xl h-[90vh] bg-slate-200 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-slide-up relative" onClick={e => e.stopPropagation()}>
                  <div className="bg-white px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2"><Award size={20} className="text-yellow-500"/> Certificate Preview</h3>
                      <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
                              <span className="text-sm font-medium text-slate-600">Certificate:</span>
                              <button 
                                  disabled={isSavingCert}
                                  onClick={async () => {
                                      if (isSavingCert) return;
                                      setIsSavingCert(true);
                                      const allLessons = previewCertCourse.modules.flatMap(m => m.lessons);
                                      const currentlyEnabled = allLessons.some(l => l.awardsCertificate !== false);
                                      const updatedCourse = {
                                          ...previewCertCourse,
                                          modules: previewCertCourse.modules.map(m => ({
                                              ...m,
                                              lessons: m.lessons.map(l => ({
                                                  ...l,
                                                  awardsCertificate: !currentlyEnabled
                                              }))
                                          }))
                                      };
                                      try {
                                          await api.courses.update(previewCertCourse.id, updatedCourse);
                                          setPreviewCertCourse(updatedCourse);
                                          alert(`Certificate ${!currentlyEnabled ? 'enabled' : 'disabled'} for this course.`);
                                      } catch (e) {
                                          console.error('Failed to update certificate setting:', e);
                                          alert('Failed to update certificate setting.');
                                      } finally {
                                          setIsSavingCert(false);
                                      }
                                  }}
                                  className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                                      isSavingCert ? 'opacity-50 cursor-not-allowed' :
                                      previewCertCourse.modules.flatMap(m => m.lessons).some(l => l.awardsCertificate !== false)
                                          ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                                          : 'bg-slate-300 text-slate-600 hover:bg-slate-400'
                                  }`}
                              >
                                  {isSavingCert && <Loader2 className="animate-spin" size={14} />}
                                  {previewCertCourse.modules.flatMap(m => m.lessons).some(l => l.awardsCertificate !== false) ? 'ON' : 'OFF'}
                              </button>
                          </div>
                          <button onClick={() => !isSavingCert && setPreviewCertCourse(null)} disabled={isSavingCert} className={`text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 p-2 rounded-full ${isSavingCert ? 'opacity-50 cursor-not-allowed' : ''}`}><X size={20}/></button>
                      </div>
                  </div>
                  <div className="flex-1 overflow-auto p-8 flex items-center justify-center bg-slate-200">
                      <div className="transform scale-[0.55] md:scale-[0.8] origin-center shadow-2xl">
                          <CertificateTemplate 
                              studentName="John Doe"
                              courseTitle={previewCertCourse.title}
                              issueDate={new Date().toISOString()}
                              certificateId={`PREVIEW-${Date.now()}`}
                          />
                      </div>
                  </div>
                  <div className="bg-white px-6 py-4 border-t border-slate-200 text-center text-sm text-slate-500">
                      This is a preview of the certificate students will receive upon completion.
                  </div>
              </div>
          </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Creator Studio</h1>
          <p className="text-slate-500">Welcome back, {currentUser.name.split(' ')[0]}. What would you like to build today?</p>
        </div>
        <div className="flex gap-2">
             <Button 
               variant="outline" 
               onClick={async () => {
                 try {
                   const response = await fetch('/api/courses/export-all');
                   if (!response.ok) throw new Error('Export failed');
                   const blob = await response.blob();
                   const url = URL.createObjectURL(blob);
                   const a = document.createElement('a');
                   a.href = url;
                   a.download = `all_courses_backup_${new Date().toISOString().slice(0,10)}.zip`;
                   document.body.appendChild(a);
                   a.click();
                   document.body.removeChild(a);
                   URL.revokeObjectURL(url);
                 } catch (err) {
                   console.error("Export failed:", err);
                   alert("Failed to export courses. Please try again.");
                 }
               }}
               icon={<Download size={16}/>}
             >
                Export All
            </Button>
             <Button 
               variant="outline" 
               onClick={() => !isImporting && importInputRef.current?.click()} 
               disabled={isImporting}
               icon={isImporting ? <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"/> : <UploadCloud size={16}/>}
             >
                {isImporting ? 'Importing...' : 'Import Backup'}
            </Button>
        </div>
      </div>

      {/* Quick Actions Grid (Replaces Stats) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* Main Action: Create Course */}
          <button onClick={() => setShowCourseModal(true)} className="lg:col-span-1 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-xl p-6 text-white shadow-lg shadow-indigo-200 hover:shadow-xl hover:scale-[1.02] transition-all group flex flex-col justify-between h-48 relative overflow-hidden">
              <div className="relative z-10">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-4 group-hover:rotate-90 transition-transform duration-500">
                      <PlusCircle size={28} className="text-white"/>
                  </div>
                  <h3 className="font-bold text-lg">Create Course</h3>
                  <p className="text-indigo-100 text-xs mt-1">Convert eBooks into full courses.</p>
              </div>
              <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-colors"></div>
          </button>

          {/* Main Action: Create Video */}
          <button onClick={() => setShowVideoModal(true)} className="lg:col-span-1 bg-gradient-to-br from-emerald-600 to-teal-600 rounded-xl p-6 text-white shadow-lg shadow-emerald-200 hover:shadow-xl hover:scale-[1.02] transition-all group flex flex-col justify-between h-48 relative overflow-hidden">
              <div className="relative z-10">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-4">
                      <Video size={28} className="text-white group-hover:scale-110 transition-transform"/>
                  </div>
                  <h3 className="font-bold text-lg">Create Video</h3>
                  <p className="text-emerald-100 text-xs mt-1">Single videos, VSLs, or social shorts.</p>
              </div>
              <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-colors"></div>
          </button>

          {/* Secondary Actions Grid */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">

              <button onClick={() => onNavigate('students')} className="bg-white p-5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all flex flex-col items-center justify-center text-center gap-3 h-48 group">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                      <Users size={24} />
                  </div>
                  <div>
                      <h3 className="font-bold text-slate-800">Manage Students</h3>
                      <p className="text-xs text-slate-500 mt-1">User accounts & access</p>
                  </div>
              </button>

              <button onClick={() => onNavigate('test_lab')} className="bg-white p-5 rounded-xl border border-slate-200 hover:border-amber-300 hover:shadow-md transition-all flex flex-col items-center justify-center text-center gap-3 h-48 group">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 group-hover:bg-amber-50 group-hover:text-amber-600 transition-colors">
                      <FlaskConical size={24} />
                  </div>
                  <div>
                      <h3 className="font-bold text-slate-800">Director's Lab</h3>
                      <p className="text-xs text-slate-500 mt-1">Test voices & styles</p>
                  </div>
              </button>

              <button onClick={() => onNavigate('settings')} className="bg-white p-5 rounded-xl border border-slate-200 hover:border-slate-400 hover:shadow-md transition-all flex flex-col items-center justify-center text-center gap-3 h-48 group">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 group-hover:bg-slate-200 group-hover:text-slate-800 transition-colors">
                      <Settings size={24} />
                  </div>
                  <div>
                      <h3 className="font-bold text-slate-800">Global Settings</h3>
                      <p className="text-xs text-slate-500 mt-1">API Keys & Config</p>
                  </div>
              </button>

          </div>
      </div>

      {/* Projects List */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold flex items-center gap-2"><BookOpen size={20} className="text-indigo-600"/> Recent Projects</h2>
              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">{courses.length} Total</span>
          </div>
          
          <div className="space-y-4">
            {isLoading ? (
                <div className="text-center py-12 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                    <Loader2 size={32} className="animate-spin text-indigo-600 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">Loading your courses...</p>
                </div>
            ) : courses.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                    <p className="text-slate-500 mb-4">No projects yet. Start creating!</p>
                    <Button onClick={onCreateNew}>Create First Course</Button>
                </div>
            ) : (
                courses.map(course => (
                <div key={course.id} className="group relative border border-slate-100 rounded-lg p-3 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                    <div className="w-full sm:w-20 flex-shrink-0 aspect-[2/3] overflow-hidden rounded bg-slate-900 shadow-sm relative">
                    {(course.ecoverUrl || coverCache[course.id]) ? (
                      <img src={course.ecoverUrl || coverCache[course.id]} alt="Cover" className="w-full h-full object-contain" />
                    ) : (course as any).hasCoverInDb ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <Loader2 size={16} className="animate-spin text-slate-400" />
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Image size={16} className="text-slate-500" />
                      </div>
                    )}
                    {course.type === 'video' && (
                        <div className="absolute bottom-1 right-1 bg-black/60 p-1 rounded backdrop-blur-sm">
                            <Video size={12} className="text-white" />
                        </div>
                    )}
                    </div>
                    <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 truncate text-lg">{course.title}</h3>
                    <p className="text-xs text-slate-500 line-clamp-2 mb-2 max-w-xl">{course.description || "No description provided."}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 text-xs font-bold uppercase rounded-full tracking-wide ${
                        course.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                        {course.status}
                        </span>
                        <span className="text-xs text-slate-400 flex items-center gap-1"><Clock size={12}/> {course.modules.reduce((acc, m) => acc + m.lessons.length, 0)} Lessons{getCourseDuration(course) > 0 && ` • ${formatDuration(getCourseDuration(course))}`}</span>
                        {(course as any).updatedAt && (
                          <span className="text-xs text-slate-400">• Updated {new Date((course as any).updatedAt).toLocaleDateString()}</span>
                        )}
                        {!(course as any).updatedAt && (course as any).createdAt && (
                          <span className="text-xs text-slate-400">• Created {new Date((course as any).createdAt).toLocaleDateString()}</span>
                        )}
                    </div>
                    </div>
                    <div className="flex items-center gap-1 self-end sm:self-center w-full sm:w-auto justify-end border-t sm:border-none pt-3 sm:pt-0 mt-2 sm:mt-0">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setDetailsCourse(course); }}
                            title="Full Description"
                            className="text-slate-400 hover:text-indigo-600 p-2 hover:bg-white rounded-lg transition-all"
                        >
                        <Info size={18} />
                        </button>
                        <button 
                            onClick={(e) => handlePreviewCertificate(e, course)}
                            title="Preview Certificate"
                            className="text-slate-400 hover:text-yellow-600 p-2 hover:bg-white rounded-lg transition-all"
                        >
                        <Award size={18} />
                        </button>
                        <button 
                            onClick={(e) => handleViewClick(e, course)}
                            title="View as Student"
                            className="text-slate-400 hover:text-emerald-600 p-2 hover:bg-white rounded-lg transition-all"
                        >
                        <Eye size={18} />
                        </button>
                        <button 
                            onClick={(e) => handleEditClick(e, course)}
                            title="Edit Project"
                            className="text-slate-400 hover:text-indigo-600 p-2 hover:bg-white rounded-lg transition-all"
                        >
                        <Edit3 size={18} />
                        </button>
                        <button 
                            onClick={(e) => handleCoverDownload(e, course)}
                            title="Download Cover Art"
                            className="text-slate-400 hover:text-purple-600 p-2 hover:bg-white rounded-lg transition-all"
                        >
                        <Image size={18} />
                        </button>
                        <button 
                            onClick={(e) => handleZipDownload(e, course)} 
                            title="Export Backup (ZIP)"
                            disabled={isExporting === course.id}
                            className="text-slate-400 hover:text-blue-600 p-2 hover:bg-white rounded-lg transition-all"
                        >
                        <FileArchive size={18} />
                        </button>
                        <button 
                            onClick={(e) => handleDeleteClick(e, course)}
                            title="Delete"
                            className="text-slate-400 hover:text-red-600 p-2 hover:bg-white rounded-lg transition-all"
                        >
                        <Trash2 size={18} />
                        </button>
                    </div>
                </div>
                ))
            )}
          </div>
      </div>

      {/* Course Creation Modal */}
      {showCourseModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden animate-slide-up">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <div>
                          <h2 className="text-xl font-bold text-slate-900">Create Course</h2>
                          <p className="text-sm text-slate-500">Choose how you want to create your course.</p>
                      </div>
                      <button onClick={() => setShowCourseModal(false)} className="text-slate-400 hover:text-slate-600">
                          <X size={24} />
                      </button>
                  </div>
                  <div className="p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <button 
                              onClick={() => {
                                  onCreateNew();
                                  setShowCourseModal(false);
                              }}
                              className="flex flex-col items-center gap-4 p-6 rounded-xl border-2 border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 transition-all text-center group"
                          >
                              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                                  <PlusCircle size={32} />
                              </div>
                              <div>
                                  <h3 className="font-bold text-lg text-slate-900 group-hover:text-indigo-700">From Scratch</h3>
                                  <p className="text-sm text-slate-500 mt-1">Upload an eBook or PDF to generate a full course with AI.</p>
                              </div>
                          </button>
                          
                          <button 
                              onClick={() => {
                                  onNavigate('coursebuilder');
                                  setShowCourseModal(false);
                              }}
                              className="flex flex-col items-center gap-4 p-6 rounded-xl border-2 border-slate-200 hover:border-purple-500 hover:bg-purple-50 transition-all text-center group"
                          >
                              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform">
                                  <Layers size={32} />
                              </div>
                              <div>
                                  <h3 className="font-bold text-lg text-slate-900 group-hover:text-purple-700">From Existing Videos</h3>
                                  <p className="text-sm text-slate-500 mt-1">Combine your standalone training videos into a structured course.</p>
                              </div>
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Video Creation Modal */}
      {showVideoModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden animate-slide-up max-h-[90vh] flex flex-col">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
                      <div>
                          <h2 className="text-xl font-bold text-slate-900">Create Video Project</h2>
                          <p className="text-sm text-slate-500">Select a template to get started.</p>
                      </div>
                      <button onClick={() => setShowVideoModal(false)} className="text-slate-400 hover:text-slate-600">
                          <X size={24} />
                      </button>
                  </div>
                  <div className="p-6 overflow-y-auto">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {videoTypes.map((t) => (
                              <div key={t.id} className="relative group">
                                  <button 
                                    onClick={() => {
                                        onCreateVideo(t.id);
                                        setShowVideoModal(false);
                                    }}
                                    className="w-full flex items-start gap-4 p-4 rounded-xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 transition-all text-left bg-white shadow-sm h-full"
                                  >
                                      <div className="bg-white p-3 rounded-lg shadow-sm group-hover:scale-110 transition-transform text-indigo-600 border border-slate-100 shrink-0">
                                          {t.icon}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                          <h3 className="font-bold text-slate-900 group-hover:text-indigo-700 text-sm mb-1">{t.id}</h3>
                                          <p className="text-[11px] text-slate-500 leading-snug line-clamp-2">{t.desc}</p>
                                      </div>
                                  </button>
                                  {/* Learn More Trigger */}
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setLearnMoreType(t); }}
                                    className="absolute bottom-3 right-3 text-[10px] text-indigo-400 font-bold hover:text-indigo-700 bg-white/80 px-2 py-1 rounded backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                                  >
                                      Learn More <HelpCircle size={10}/>
                                  </button>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Learn More Modal */}
      {learnMoreType && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setLearnMoreType(null)}>
              <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-slide-up" onClick={e => e.stopPropagation()}>
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-white rounded-lg shadow-sm">{learnMoreType.icon}</div>
                          <div>
                              <h3 className="font-bold text-lg text-slate-900">{learnMoreType.id}</h3>
                              <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Video Template</span>
                          </div>
                      </div>
                      <button onClick={() => setLearnMoreType(null)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                  </div>
                  <div className="p-8 space-y-6">
                      <div>
                          <h4 className="text-sm font-bold text-slate-900 mb-2">What is it?</h4>
                          <p className="text-sm text-slate-600 leading-relaxed">{learnMoreType.fullDesc}</p>
                      </div>
                      <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                          <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider mb-2">Best For</h4>
                          <p className="text-sm text-indigo-700 font-medium">{learnMoreType.bestFor}</p>
                      </div>
                      <Button onClick={() => { onCreateVideo(learnMoreType.id); setShowVideoModal(false); setLearnMoreType(null); }} className="w-full mt-4" icon={<ArrowRight size={16}/>}>
                          Use This Template
                      </Button>
                  </div>
              </div>
          </div>
      )}

      {/* Delete Confirmation Modal */}
      {courseToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden scale-100">
                <div className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                            <AlertTriangle className="text-red-600" size={24} />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-bold text-slate-900 mb-2">Delete Project?</h3>
                            <p className="text-slate-500 text-sm mb-4">
                                Are you sure you want to delete <span className="font-bold text-slate-700">{courseToDelete.title}</span>? 
                                This action cannot be undone.
                            </p>
                            
                            <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 mb-4">
                                <p className="text-xs text-indigo-700 font-bold uppercase mb-2">Recommended Safety Step</p>
                                <button 
                                    onClick={() => confirmDelete(true)}
                                    className="w-full flex items-center justify-center gap-2 bg-white border-2 border-indigo-100 hover:border-indigo-500 hover:text-indigo-600 text-slate-700 py-2.5 rounded-lg text-sm font-medium transition-all shadow-sm group"
                                >
                                    <FileArchive size={16} className="text-indigo-500 group-hover:scale-110 transition-transform"/> Download Backup & Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
                    <Button variant="outline" onClick={() => setCourseToDelete(null)}>Cancel</Button>
                    <Button variant="danger" onClick={() => confirmDelete(false)}>Delete Forever</Button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
