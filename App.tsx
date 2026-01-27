
import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { CreatorDashboard } from './views/CreatorDashboard';
import { CourseWizard } from './views/CourseWizard';
import { VideoWizard } from './views/VideoWizard';
import { StudentPortal } from './views/StudentPortal';
import { TestGenerator } from './views/TestGenerator';
import { LoginPage } from './views/LoginPage';
import { AdminLoginPage } from './views/AdminLoginPage';
import { PromoPage } from './views/PromoPage';
import PackagesPage from './views/PackagesPage';
import { StudentManager } from './views/StudentManager';
import { CertificatesView } from './views/CertificatesView';
import { StudentAccount } from './views/StudentAccount';
import { SupportInbox } from './views/SupportInbox';
import { SettingsView } from './views/SettingsView';
import { AdminAccountView } from './views/AdminAccountView';
import { CourseBuilder } from './views/CourseBuilder';
import { CourseOutlineEditor } from './views/CourseOutlineEditor';
import { CourseDetailsModal } from './components/CourseDetailsModal';
import { Course, UserRole, User, GlobalProgressData, Certificate, CourseStatus, LessonStatus, SupportTicket } from './types';
import { MOCK_COURSE, CURRENT_USER, DEFAULT_STUDENT, DEFAULT_ELEVEN_LABS_KEY } from './constants';
import { Award, BookOpen, CheckCircle2, Shield, Key, RefreshCcw, Trash2, Video, Images, Presentation, Megaphone, MonitorPlay, Clapperboard, LifeBuoy, MessageSquare, Bug, Send, X, AlertCircle, Loader2, Menu, Briefcase, FolderOpen, PlusCircle, Eye, Edit3, Clock, ArrowLeft, Wrench } from 'lucide-react';
import { safeExportCourse, stripHeavyAssets, exportCourseAsZip, exportAllDataAsZip, saveCourseToDB, getCourseFromDB } from './utils';
import { Input, TextArea } from './components/Input';
import { Button } from './components/Button';
import { GoogleGenAI } from "@google/genai";
import { api } from './api';

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

export const App = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    // Restore session from localStorage on initial load
    const saved = localStorage.getItem('currentUser');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });
  const [currentView, setCurrentView] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [loginType, setLoginType] = useState<'student' | 'admin'>('student');
  const [showPromo, setShowPromo] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('promo') === 'true';
  });
  const [showPackages, setShowPackages] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('page') === 'packages';
  });

  // Persist session to localStorage when user changes
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('currentUser');
    }
  }, [currentUser]);
  
  // Data State
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [progressData, setProgressData] = useState<GlobalProgressData>({});
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  
  // View Specific State
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [viewingCourse, setViewingCourse] = useState<Course | null>(null);
  const [videoWizardType, setVideoWizardType] = useState<string | undefined>(undefined);
  
  // Student Dashboard Specific
  const [detailsCourse, setDetailsCourse] = useState<Course | null>(null);
  
  // Cover cache for student dashboard - persists covers that were stripped from lightweight data
  const [coverCache, setCoverCache] = useState<Record<string, string>>({});
  const coverFetchingRef = useRef<Set<string>>(new Set());
  
  // Fetch covers for courses that have hasCoverInDb but empty ecoverUrl
  useEffect(() => {
    courses.forEach(course => {
      const courseId = (course as any)._dbId || course.id;
      const hasCoverInDb = (course as any).hasCoverInDb;
      const hasEcover = course.ecoverUrl && course.ecoverUrl.length > 10;
      
      // If already cached or already has cover data, skip
      if (coverCache[courseId] || hasEcover) return;
      
      // If cover is in database and we haven't started fetching
      if (hasCoverInDb && !coverFetchingRef.current.has(courseId)) {
        coverFetchingRef.current.add(courseId);
        fetch(`/api/courses/${courseId}/cover`)
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data?.ecoverUrl) {
              setCoverCache(prev => ({ ...prev, [courseId]: data.ecoverUrl }));
            }
          })
          .catch(err => console.error('Failed to fetch cover for course', courseId, err))
          .finally(() => coverFetchingRef.current.delete(courseId));
      }
    });
  }, [courses]);
  
  // Help/Support State
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [hasEscalated, setHasEscalated] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{sender: 'user'|'ai', text: string}[]>([
      {sender: 'ai', text: "Hi! I'm your AI support assistant. How can I help you today?"}
  ]);
  const [isChatTyping, setIsChatTyping] = useState(false);

  // Load cached data first, then refresh from API
  useEffect(() => {
    const initData = async () => {
        // Load from cache immediately
        try {
            const cachedCourses = localStorage.getItem('courses_cache');
            if (cachedCourses) {
                const parsed = JSON.parse(cachedCourses);
                setCourses(parsed);
                console.log('Loaded courses from cache:', parsed.length);
            }
        } catch (e) {
            console.log('No cache available');
        }
        
        // Then fetch fresh data from API with retries
        const fetchWithRetry = async (fn: () => Promise<any>, retries = 3, delay = 1000) => {
            for (let i = 0; i < retries; i++) {
                try {
                    const result = await fn();
                    return result;
                } catch (e) {
                    console.log('Fetch attempt', i + 1, 'failed:', e);
                    if (i < retries - 1) await new Promise(r => setTimeout(r, delay * (i + 1)));
                }
            }
            console.log('All fetch retries exhausted');
            return null;
        };
        
        // Fetch courses and cache them
        console.log('Fetching courses from API...');
        const loadedCourses = await fetchWithRetry(() => api.courses.getAll());
        console.log('API returned:', loadedCourses ? loadedCourses.length : 'null', 'courses');
        if (loadedCourses && loadedCourses.length > 0) {
            console.log('Setting courses state with:', loadedCourses.length, 'courses');
            setCourses(loadedCourses);
            try {
                localStorage.setItem('courses_cache', JSON.stringify(loadedCourses));
            } catch (e) {
                console.log('Cache storage quota exceeded, skipping cache');
                localStorage.removeItem('courses_cache');
            }
        } else {
            console.log('No courses loaded from API');
        }
        
        // Load other data
        const [loadedTickets, loadedUsers, loadedProgress, loadedCerts] = await Promise.all([
            api.tickets.getAll().catch(() => []),
            api.users.getAll().catch(() => []),
            api.progress.getAll().catch(() => ({})),
            api.certificates.getAll().catch(() => []),
        ]);
        
        setTickets(loadedTickets || []);
        setStudents((loadedUsers || []).map(u => ({ ...u, role: u.role as UserRole })));
        setProgressData(loadedProgress || {});
        setCertificates(loadedCerts || []);
        setIsLoadingData(false);
    };
    initData();
  }, []);


  const handleStudentLogin = async (email: string, pass: string) => {
      try {
          const user = await api.auth.login(email, pass);
          if (user && user.role === UserRole.STUDENT) {
              setCurrentUser(user as User);
              setCurrentView('dashboard');
              // Refresh courses after login to ensure data is loaded
              const loadedCourses = await api.courses.getAll();
              console.log('Loaded courses after login:', loadedCourses.length);
              setCourses(loadedCourses);
              return true;
          }
      } catch (error) {
          console.error('Login error:', error);
      }
      return false;
  };

  const handleAdminLogin = async (email: string, pass: string) => {
      try {
          const user = await api.auth.login(email, pass);
          if (user && user.role === UserRole.CREATOR) {
              setCurrentUser(user as User);
              setCurrentView('dashboard');
              // Refresh courses after login to ensure data is loaded
              const loadedCourses = await api.courses.getAll();
              console.log('Loaded courses after login:', loadedCourses.length);
              setCourses(loadedCourses);
              return true;
          }
      } catch (error) {
          console.error('Login error:', error);
      }
      return false;
  };

  const handleRegister = async (newUser: User) => {
      try {
          const registered = await api.auth.register({
              name: newUser.name,
              email: newUser.email,
              password: newUser.password || 'password',
              role: newUser.role,
              avatarUrl: newUser.avatarUrl,
              phone: newUser.phone,
              city: newUser.city,
              state: newUser.state,
          });
          setStudents(prev => [...prev, registered as User]);
      } catch (error) {
          console.error('Registration error:', error);
      }
  };

  const handleLogout = () => {
      setCurrentUser(null);
      setCurrentView('dashboard');
  };

  const handleSwitchRole = () => {
      if (!currentUser) return;
      // Toggle between Creator and Student
      const newRole = currentUser.role === UserRole.CREATOR ? UserRole.STUDENT : UserRole.CREATOR;
      const updatedUser = { ...currentUser, role: newRole };
      
      setCurrentUser(updatedUser);
      // Also update in the main list so it persists during session
      setStudents(prev => prev.map(u => u.id === currentUser.id ? updatedUser : u));
      setCurrentView('dashboard');
  };

  const saveCourse = async (course: Course) => {
      try {
          // Only strip uploadedFiles (raw PDFs) but keep audio/visuals for playback
          const lightCourse = JSON.parse(JSON.stringify(course));
          if (lightCourse.modules) {
              lightCourse.modules = lightCourse.modules.map((m: any) => ({
                  ...m,
                  lessons: m.lessons.map((l: any) => {
                      if (l.uploadedFiles) l.uploadedFiles = [];
                      return l;
                  })
              }));
          }
          if (lightCourse.uploadedFiles) lightCourse.uploadedFiles = [];
          
          const exists = courses.find(c => c.id === course.id);
          let savedCourse: Course;
          if (exists) {
              savedCourse = await api.courses.update(course.id, lightCourse);
          } else {
              savedCourse = await api.courses.create(lightCourse);
          }
          setCourses(prev => {
              const idx = prev.findIndex(c => c.id === savedCourse.id);
              if (idx >= 0) {
                  const newCourses = [...prev];
                  newCourses[idx] = savedCourse;
                  return newCourses;
              }
              return [...prev, savedCourse];
          });
      } catch (error) {
          console.error('Failed to save course:', error);
          throw error;
      }
  };

  const deleteCourse = async (id: string) => {
      try {
          await api.courses.delete(id);
          setCourses(prev => prev.filter(c => c.id !== id));
      } catch (error) {
          console.error('Failed to delete course:', error);
      }
  };

  // Fetch full course data before editing (list shows lightweight data)
  const handleEditCourse = async (course: Course) => {
      setIsLoadingFullCourse(true);
      try {
          // Fetch the FULL course data from the API
          const fullCourse = await api.courses.get(course.id);
          setEditingCourse(fullCourse);
          if (fullCourse.type === 'video') {
              setCurrentView('create_video');
          } else {
              setCurrentView('edit_course');
          }
      } catch (error) {
          console.error('Failed to load course for editing:', error);
          alert('Failed to load course data. Please try again.');
      } finally {
          setIsLoadingFullCourse(false);
      }
  };

  const handleImportCourse = async (course: Course) => {
      // Save full course with media to database for video playback
      // Note: Large imports may take a minute due to embedded media
      await saveCourse(course);
  };

  const handleMasterImport = async (file: File) => {
      if (!window.confirm("This will overwrite all current data in the application. Are you sure you want to proceed?")) {
          return;
      }
      
      try {
          const result = await api.courses.uploadZip(file) as any;
          if (result.success) {
              // Restore settings if present in backup
              if (result.settings) {
                  if (result.settings.elevenLabsKey) {
                      localStorage.setItem('elevenLabsKey', result.settings.elevenLabsKey);
                  }
              }
              alert(`Master backup imported successfully! ${result.count || 1} course(s) imported. The application will now reload.`);
              window.location.reload();
          } else {
              throw new Error("Import failed");
          }
      } catch (e) {
          console.error("Master import failed:", e);
          alert("Failed to import master backup. The file may be corrupted or in the wrong format.");
      }
  };

  const [isLoadingFullCourse, setIsLoadingFullCourse] = useState(false);

  const handleViewCourse = async (course: Course) => {
      console.log('handleViewCourse called with:', course.id, course.title);
      // Always load full course data from API to ensure we have all media
      setIsLoadingFullCourse(true);
      try {
          console.log('Fetching full course data...');
          const fullCourse = await api.courses.get(course.id);
          console.log('Got full course:', fullCourse.title);
          setViewingCourse(fullCourse);
      } catch (error) {
          console.error('Failed to load full course:', error);
          alert('Failed to load course. Please try again.');
      } finally {
          setIsLoadingFullCourse(false);
      }
  };

  const handleToggleLessonComplete = async (lessonId: string) => {
      if (!currentUser || !viewingCourse) return;
      
      const courseId = viewingCourse.id;
      const currentCourseProgress = progressData[currentUser.id]?.[courseId] || [];
      
      let newProgress;
      if (currentCourseProgress.includes(lessonId)) {
          newProgress = currentCourseProgress.filter(id => id !== lessonId);
      } else {
          newProgress = [...currentCourseProgress, lessonId];
      }
      
      const newGlobalProgress = {
          ...progressData,
          [currentUser.id]: {
              ...(progressData[currentUser.id] || {}),
              [courseId]: newProgress
          }
      };
      
      setProgressData(newGlobalProgress);
      
      try {
          await api.progress.update(currentUser.id, courseId, newProgress);
      } catch (error) {
          console.error('Failed to save progress:', error);
      }
  };

  const handleClaimCertificate = async () => {
      if (!currentUser || !viewingCourse) return;
      
      const existing = certificates.find(c => c.courseId === viewingCourse.id && c.studentId === currentUser.id);
      if (existing) {
          alert("You already have this certificate!");
          return;
      }

      const certData = {
          courseId: viewingCourse.id,
          courseTitle: viewingCourse.title,
          courseImage: viewingCourse.ecoverUrl,
          studentId: currentUser.id,
          studentName: currentUser.name,
      };
      
      try {
          const createdCert = await api.certificates.create(certData);
          setCertificates(prev => [...prev, createdCert]);
          setViewingCourse(null);
          setCurrentView('certificates');
      } catch (error) {
          console.error('Failed to create certificate:', error);
          alert('Failed to create certificate. Please try again.');
      }
  };

  // Support System
  const submitTicket = async (type: 'question' | 'bug' | 'help_chat', message: string, subject?: string) => {
      if (!currentUser) return;
      setIsSubmittingTicket(true);
      
      const newTicket: SupportTicket = {
          id: `t-${Date.now()}`,
          type,
          studentId: currentUser.id,
          studentName: currentUser.name,
          studentEmail: currentUser.email,
          subject: subject || (type === 'bug' ? 'Bug Report' : 'General Inquiry'),
          message,
          status: 'open',
          timestamp: new Date().toISOString(),
          priority: type === 'bug' ? 'high' : 'medium'
      };
      
      await api.tickets.create(newTicket);
      setTickets(prev => [newTicket, ...prev]); // Update local state
      setIsSubmittingTicket(false);
      setTicketMessage('');
      setTicketSubject('');
      
      if (type !== 'help_chat') {
          alert("Ticket submitted successfully! We will contact you shortly.");
          setCurrentView('dashboard');
      }
  };

  const handleAiChat = async () => {
      if (!chatInput.trim()) return;
      
      const userMsg = { sender: 'user' as const, text: chatInput };
      setChatHistory(prev => [...prev, userMsg]);
      setChatInput('');
      setIsChatTyping(true);

      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const prompt = `You are a helpful support assistant for an online course platform called "Jobs On Demand".
          User Question: "${userMsg.text}"
          
          Guidelines:
          - Be polite and professional.
          - If the user asks about technical issues, suggest clearing cache or trying a different browser.
          - If they ask about course content, tell them to check the course details or ask the instructor.
          - If the issue seems complex or they are unhappy, suggest escalating to a human agent.
          - Keep answers concise.
          `;
          
          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: { parts: [{ text: prompt }] }
          });
          
          const aiText = response.text || "I'm having trouble connecting. Please try again.";
          setChatHistory(prev => [...prev, { sender: 'ai', text: aiText }]);
      } catch (e) {
          setChatHistory(prev => [...prev, { sender: 'ai', text: "Sorry, I'm offline right now. Please escalate to a human." }]);
      } finally {
          setIsChatTyping(false);
      }
  };

  const handleEscalateChat = () => {
      if (!currentUser) return;
      const transcript = JSON.stringify(chatHistory);
      submitTicket('help_chat', transcript, 'Escalated AI Chat Session');
      setHasEscalated(true);
  };

  if (!currentUser) {
      if (showPackages) {
          return <PackagesPage onBack={() => setShowPackages(false)} />;
      }
      if (showPromo) {
          return <PromoPage onBack={() => setShowPromo(false)} onShowPackages={() => setShowPackages(true)} />;
      }
      if (loginType === 'admin') {
          return <AdminLoginPage onLogin={handleAdminLogin} onSwitchToStudent={() => setLoginType('student')} />;
      }
      return <LoginPage onLogin={handleStudentLogin} onRegister={handleRegister} onSwitchToAdmin={() => setLoginType('admin')} onShowPromo={() => setShowPromo(true)} />;
  }

  // Student Portal Overlay
  if (viewingCourse) {
      return (
          <StudentPortal 
              course={viewingCourse}
              isCreator={currentUser.role === UserRole.CREATOR}
              onExit={() => setViewingCourse(null)}
              completedLessonIds={progressData[currentUser.id]?.[viewingCourse.id] || []}
              onToggleComplete={handleToggleLessonComplete}
              onClaimCertificate={handleClaimCertificate}
          />
      );
  }

  const renderStudentDashboard = (showStats: boolean = true) => {
      const studentProgress = progressData[currentUser.id] || {};
      
      // Filter courses based on student's assigned courses
      // If assignedCourseIds is empty or undefined, show no courses (must be explicitly assigned)
      const assignedIds = currentUser.assignedCourseIds || [];
      const visibleCourses = assignedIds.length > 0 
          ? courses.filter(c => assignedIds.includes(c.id))
          : [];
      
      // Sort courses by their order in assignedCourseIds (first assigned = first shown)
      visibleCourses.sort((a, b) => {
          const indexA = assignedIds.indexOf(a.id);
          const indexB = assignedIds.indexOf(b.id);
          return indexA - indexB;
      });
      
      console.log('Rendering student dashboard with courses:', visibleCourses.length, 'assigned:', assignedIds.length, 'isLoading:', isLoadingData);
      
      // Show loading state
      if (isLoadingData && visibleCourses.length === 0) {
          return (
              <div className="flex items-center justify-center h-screen">
                  <div className="text-center">
                      <Loader2 size={48} className="animate-spin text-indigo-600 mx-auto mb-4"/>
                      <p className="text-slate-500">Loading your courses...</p>
                  </div>
              </div>
          );
      }
          
      const myCerts = certificates.filter(c => c.studentId === currentUser.id);
      
      let completedCount = 0;
      let inProgressCount = 0;

      visibleCourses.forEach(c => {
          const cProg = studentProgress[c.id] || [];
          const total = c.modules.reduce((acc, m) => acc + m.lessons.length, 0);
          if (cProg.length === total && total > 0) completedCount++;
          else if (cProg.length > 0) inProgressCount++;
      });

      return (
           <div className="pt-2 px-4 lg:px-8 pb-4 lg:pb-8 max-w-7xl mx-auto space-y-8 relative">
              {detailsCourse && <CourseDetailsModal course={detailsCourse} onClose={() => setDetailsCourse(null)} />}
              
              {showStats ? (
                  <>
                    <div className="flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl px-8 py-8 shadow-md">
                        <div className="flex items-center gap-5">
                            <img src={currentUser.avatarUrl} className="w-24 h-24 rounded-full object-cover border-4 border-emerald-500 shadow-lg" alt="Profile"/>
                            <div className="flex flex-col gap-1">
                                <h1 className="text-3xl font-bold text-white">Welcome back, {currentUser.name.split(' ')[0]}</h1>
                                <p className="text-slate-400 text-base">Keep up the great work!</p>
                            </div>
                        </div>
                        <div className="hidden md:flex flex-col items-end mr-4">
                            <div className="flex items-center gap-2 text-emerald-400 text-lg font-medium">
                                <span className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse"></span>
                                Online
                            </div>
                            <p className="text-slate-400 text-sm mt-1">Last login: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Courses In Progress */}
                        <div className="bg-blue-50 p-4 rounded-xl border-2 border-blue-400 flex flex-row items-center gap-4 h-20 group hover:border-blue-600 transition-colors">
                            <div className="flex items-center justify-center">
                                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                                    <BookOpen size={24} className="text-blue-700"/>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <h3 className="text-3xl font-black leading-none text-blue-700">{inProgressCount}</h3>
                                <p className="text-blue-700 text-xl font-bold leading-tight">Courses In Progress</p>
                            </div>
                        </div>

                        {/* Completed Courses */}
                        <div className="bg-emerald-50 p-4 rounded-xl border-2 border-emerald-400 flex flex-row items-center gap-4 h-20 group hover:border-emerald-600 transition-colors">
                            <div className="flex items-center justify-center">
                                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                                    <CheckCircle2 size={24} className="text-emerald-700"/>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <h3 className="text-3xl font-black leading-none text-emerald-700">{completedCount}</h3>
                                <p className="text-emerald-700 text-xl font-bold leading-tight">Completed Courses</p>
                            </div>
                        </div>

                        {/* Certifications Earned */}
                        <button onClick={() => setCurrentView('certificates')} className="bg-orange-50 p-4 rounded-xl border-2 border-orange-400 flex flex-row items-center gap-4 h-20 group text-left transition-all hover:border-orange-600 hover:scale-[1.02]">
                            <div className="flex items-center justify-center">
                                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center group-hover:rotate-12 transition-transform duration-300 shrink-0">
                                    <Award size={24} className="text-orange-700"/>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <h3 className="text-3xl font-black leading-none text-orange-700">{myCerts.length}</h3>
                                <p className="text-orange-700 text-xl font-bold leading-tight">Certifications Earned</p>
                            </div>
                        </button>
                    </div>
                    {/* Mobile Divider */}
                    <div className="md:hidden w-full h-px bg-slate-200 my-8"></div>
                  </>
              ) : (
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                          <h1 className="text-2xl font-bold text-slate-900">My Courses</h1>
                          <p className="text-slate-500">Access all your enrolled content.</p>
                      </div>
                  </div>
              )}

               <div className="space-y-6">
                  {showStats && (
                      <div className="flex items-center justify-between">
                          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2"><BookOpen className="text-indigo-600"/> My Learning</h2>
                      </div>
                  )}
                  
                  {visibleCourses.length === 0 ? (
                      <div className="text-center py-20 bg-white rounded-xl border border-slate-200 shadow-sm">
                           <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400"><BookOpen size={24}/></div>
                           <p className="text-slate-500 mb-2">You haven't been assigned any courses yet.</p>
                           <p className="text-xs text-slate-400">Check back later or contact your instructor.</p>
                      </div>
                  ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 px-6 sm:px-0">
                         {visibleCourses.map(course => {
                             const completedIds = studentProgress[course.id] || [];
                             const total = course.modules.reduce((acc, m) => acc + m.lessons.length, 0);
                             const progressPercent = total > 0 ? Math.round((completedIds.length / total) * 100) : 0;
                             const isCompleted = progressPercent === 100;
                             
                             const courseDbId = (course as any)._dbId || course.id;
                             const displayCover = course.ecoverUrl && course.ecoverUrl.length > 10 ? course.ecoverUrl : coverCache[courseDbId];
                             
                             return (
                                 <div key={course.id} onClick={() => handleViewCourse(course)} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group flex flex-col h-full relative">
                                     <div className="aspect-[2/3] relative overflow-hidden bg-slate-900 border-b border-slate-100">
                                         {displayCover && <img src={displayCover} className="w-full h-full object-contain" alt={course.title}/>}
                                         <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                                              {isCompleted && (
                                                  <div className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg flex items-center gap-1">
                                                      <CheckCircle2 size={10} /> DONE
                                                  </div>
                                              )}
                                              {course.type === 'video' && (
                                                  <div className="bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg flex items-center gap-1">
                                                      <Video size={10} /> VIDEO
                                                  </div>
                                              )}
                                         </div>
                                     </div>
                                     <div className="p-3 md:p-4 flex-1 flex flex-col">
                                          <h3 className="font-bold text-slate-900 text-sm md:text-base leading-snug mb-1 line-clamp-2" title={course.title}>
                                              {course.title}
                                          </h3>
                                          <p className="text-xs text-slate-500 line-clamp-2 mb-2 h-8 hidden md:block">
                                              {course.description || "No description provided."}
                                          </p>
                                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mb-2">
                                              <span className="flex items-center gap-1"><Clock size={10}/> {total} Lessons</span>
                                              {getCourseDuration(course) > 0 && <span>• {formatDuration(getCourseDuration(course))}</span>}
                                          </div>
                                          <div className="mt-auto space-y-3">
                                              <div>
                                                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 mb-1">
                                                      <span>{progressPercent}% <span className="hidden md:inline">Complete</span></span>
                                                      <button 
                                                          onClick={(e) => { e.stopPropagation(); setDetailsCourse(course); }}
                                                          className="text-indigo-600 hover:underline hidden md:block"
                                                      >
                                                          Learn More
                                                      </button>
                                                  </div>
                                                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                                      <div className={`h-full rounded-full ${isCompleted ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{width: `${progressPercent}%`}}></div>
                                                  </div>
                                              </div>
                                              <button className={`w-full py-2 rounded-lg text-xs font-bold transition-colors ${isCompleted ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                                                 {isCompleted ? 'Review' : progressPercent > 0 ? 'Continue' : 'Start'}
                                             </button>
                                          </div>
                                     </div>
                                 </div>
                             );
                         })}
                      </div>
                  )}
               </div>

               {/* Mobile/Desktop Support Actions - Moved Bottom (Only on Dashboard) */}
               {showStats && (
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <button onClick={() => { setHasEscalated(false); setCurrentView('help'); }} className="bg-blue-50 p-6 md:p-8 rounded-xl border-2 border-blue-400 hover:border-blue-600 hover:shadow-lg transition-all flex items-center gap-5 group h-28 md:h-36">
                          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0">
                              <LifeBuoy size={32} />
                          </div>
                          <div className="text-left">
                              <h4 className="font-bold text-slate-900 text-xl md:text-lg">Get Help</h4>
                              <p className="text-base md:text-sm text-slate-600">Chat with support</p>
                          </div>
                      </button>
                      <button onClick={() => setCurrentView('ask')} className="bg-purple-50 p-6 md:p-8 rounded-xl border-2 border-purple-400 hover:border-purple-600 hover:shadow-lg transition-all flex items-center gap-5 group h-28 md:h-36">
                          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors shrink-0">
                              <MessageSquare size={32} />
                          </div>
                          <div className="text-left">
                              <h4 className="font-bold text-slate-900 text-xl md:text-lg">Ask Instructor</h4>
                              <p className="text-base md:text-sm text-slate-600">Message admins</p>
                          </div>
                      </button>
                      <button onClick={() => setCurrentView('bug')} className="bg-red-50 p-6 md:p-8 rounded-xl border-2 border-red-400 hover:border-red-600 hover:shadow-lg transition-all flex items-center gap-5 group h-28 md:h-36">
                          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-600 group-hover:bg-red-600 group-hover:text-white transition-colors shrink-0">
                              <Bug size={32} />
                          </div>
                          <div className="text-left">
                              <h4 className="font-bold text-slate-900 text-xl md:text-lg">Report Bug</h4>
                              <p className="text-base md:text-sm text-slate-600">Fix technical issues</p>
                          </div>
                      </button>
                  </div>
               )}
               
               {!showStats && (
                   <div className="md:hidden mt-12 pb-8 text-center">
                       <button onClick={() => setCurrentView('dashboard')} className="text-indigo-600 font-bold text-sm">
                           ← Back to Dashboard
                       </button>
                   </div>
               )}
           </div>
      );
  };

  const renderContent = () => {
      // CREATOR VIEWS
      if (currentUser.role === UserRole.CREATOR) {
          switch(currentView) {
              case 'create_course':
                  return <CourseWizard 
                      onCancel={() => setCurrentView('dashboard')} 
                      onComplete={async (course) => { await saveCourse(course); setCurrentView('dashboard'); }} 
                      initialCourse={editingCourse || undefined}
                  />;
              case 'select_video_type': // Handled via dashboard modal usually, but if routed directly:
                  return <CreatorDashboard 
                      courses={courses}
                      currentUser={currentUser}
                      onCreateNew={() => setCurrentView('create_course')} 
                      onCreateVideo={(type) => { setVideoWizardType(type); setCurrentView('create_video'); }}
                      onEdit={(c) => handleEditCourse(c)}
                      onView={(c) => handleViewCourse(c)}
                      onImport={handleImportCourse}
                      onDelete={deleteCourse}
                      onNavigate={setCurrentView}
                      showVideoModalOnMount={true}
                      isLoading={isLoadingData}
                  />;
              case 'create_video':
                  return <VideoWizard 
                      onCancel={() => { setCurrentView('dashboard'); setEditingCourse(null); }} 
                      onComplete={async (course) => { await saveCourse(course); setCurrentView('dashboard'); setEditingCourse(null); }}
                      onSave={saveCourse}
                      initialType={videoWizardType}
                      initialCourse={editingCourse || undefined}
                  />;
              case 'coursebuilder':
                  return <CourseBuilder
                      videos={courses.filter(c => c.type === 'video')}
                      onCreateCourse={async (course) => { await saveCourse(course); setCurrentView('dashboard'); }}
                      onCancel={() => setCurrentView('dashboard')}
                  />;
              case 'edit_course':
                  return editingCourse ? (
                      <CourseOutlineEditor
                          course={editingCourse}
                          availableVideos={courses.filter(c => c.type === 'video')}
                          onSave={async (course) => { 
                              await saveCourse(course); 
                              setCurrentView('dashboard'); 
                              setEditingCourse(null); 
                          }}
                          onCancel={() => { setCurrentView('dashboard'); setEditingCourse(null); }}
                      />
                  ) : <CreatorDashboard 
                      courses={courses}
                      currentUser={currentUser}
                      onCreateNew={() => setCurrentView('create_course')} 
                      onCreateVideo={(type) => { setVideoWizardType(type); setCurrentView('create_video'); }}
                      onEdit={(c) => handleEditCourse(c)}
                      onView={(c) => handleViewCourse(c)}
                      onImport={handleImportCourse}
                      onDelete={deleteCourse}
                      onNavigate={setCurrentView}
                      isLoading={isLoadingData}
                  />;
              case 'students':
                  return <StudentManager 
                      students={students} 
                      courses={courses}
                      progressData={progressData}
                      certificates={certificates}
                      tickets={tickets}
                      onAddStudent={async (u) => {
                          try {
                              await api.auth.register({
                                  ...u,
                                  password: u.password || 'password'
                              });
                              setStudents(prev => [...prev, u]);
                          } catch (e) {
                              console.error('Failed to create student:', u.email, e);
                              alert('Failed to create student. Email may already exist.');
                          }
                      }}
                      onUpdateStudent={async (u) => {
                          try {
                              await api.users.update(u.id, u);
                              setStudents(prev => prev.map(s => s.id === u.id ? u : s));
                          } catch (e) {
                              console.error('Failed to update student:', u.email, e);
                          }
                      }}
                      onDeleteStudent={async (id) => {
                          try {
                              await api.users.delete(id);
                              setStudents(prev => prev.filter(s => s.id !== id));
                          } catch (e) {
                              console.error('Failed to delete student:', id, e);
                          }
                      }}
                      onImportStudents={async (newUsers) => {
                          for (const user of newUsers) {
                              try {
                                  await api.auth.register({
                                      ...user,
                                      password: user.password || 'password'
                                  });
                              } catch (e) {
                                  console.error('Failed to save user:', user.email, e);
                              }
                          }
                          setStudents(prev => [...prev, ...newUsers]);
                      }}
                      onImportProgress={async (importedProgress) => {
                          for (const [userId, courseProgress] of Object.entries(importedProgress)) {
                              for (const [courseId, lessonIds] of Object.entries(courseProgress)) {
                                  try {
                                      await api.progress.update(userId, courseId, lessonIds as string[]);
                                  } catch (e) {
                                      console.error('Failed to save progress for user:', userId, 'course:', courseId, e);
                                  }
                              }
                          }
                          setProgressData(prev => ({ ...prev, ...importedProgress }));
                      }}
                      onImportCertificates={async (importedCerts) => {
                          const savedCerts: Certificate[] = [];
                          for (const cert of importedCerts) {
                              try {
                                  const newCert = { ...cert, id: `cert-${Date.now()}-${Math.random().toString(36).slice(2)}` };
                                  await api.certificates.create(newCert);
                                  savedCerts.push(newCert);
                              } catch (e) {
                                  console.error('Failed to save certificate:', e);
                              }
                          }
                          setCertificates(prev => [...prev, ...savedCerts]);
                      }}
                      onImportTickets={async (importedTickets) => {
                          const savedTickets: SupportTicket[] = [];
                          for (const ticket of importedTickets) {
                              try {
                                  const newTicket = { ...ticket, id: `ticket-${Date.now()}-${Math.random().toString(36).slice(2)}` };
                                  await api.tickets.create(newTicket);
                                  savedTickets.push(newTicket);
                              } catch (e) {
                                  console.error('Failed to save ticket:', e);
                              }
                          }
                          setTickets(prev => [...prev, ...savedTickets]);
                      }}
                  />;
              case 'test_lab':
                  return <TestGenerator />;
              case 'inbox':
                  return <SupportInbox />;
              case 'settings':
                  return <SettingsView 
                      onExportAll={() => exportAllDataAsZip({ courses, students, progressData, certificates, tickets })}
                      onImportAll={handleMasterImport}
                  />;
              case 'admin_account':
                  return <AdminAccountView 
                      user={currentUser}
                      onUpdateUser={(u) => { 
                          setStudents(prev => prev.map(s => s.id === u.id ? u : s)); 
                          setCurrentUser(u); 
                      }}
                  />;
              case 'all_content':
                  return (
                      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
                          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                              <div className="flex items-center justify-between mb-6">
                                  <h2 className="text-lg font-semibold flex items-center gap-2"><FolderOpen size={20} className="text-indigo-600"/> All Courses & Videos</h2>
                                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">{courses.length} Total</span>
                              </div>
                              
                              <div className="space-y-4">
                                  {courses.length === 0 ? (
                                      <div className="text-center py-12 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                                          <p className="text-slate-500 mb-4">No content yet. Start creating!</p>
                                          <div className="flex gap-3 justify-center">
                                              <Button onClick={() => setCurrentView('create_course')} icon={<PlusCircle size={16} />}>Create Course</Button>
                                              <Button variant="outline" onClick={() => setCurrentView('select_video_type')} icon={<Video size={16} />}>Create Video</Button>
                                          </div>
                                      </div>
                                  ) : (
                                      courses.map(course => (
                                          <div key={course.id} className="group relative border border-slate-100 rounded-lg p-3 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                                              <div className="w-full sm:w-20 flex-shrink-0 aspect-[2/3] overflow-hidden rounded bg-slate-900 shadow-sm relative">
                                                  <img src={course.ecoverUrl} alt="Cover" className="w-full h-full object-contain" />
                                                  {course.type === 'video' && (
                                                      <div className="absolute bottom-1 right-1 bg-black/60 p-1 rounded backdrop-blur-sm">
                                                          <Video size={12} className="text-white" />
                                                      </div>
                                                  )}
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                  <h3 className="font-bold text-slate-900 truncate text-lg">{course.title}</h3>
                                                  <p className="text-xs text-slate-500 line-clamp-2 mb-2 max-w-xl">{course.description || "No description provided."}</p>
                                                  <div className="flex items-center gap-2">
                                                      <span className={`px-2 py-0.5 text-xs font-bold uppercase rounded-full tracking-wide ${
                                                          course.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'
                                                      }`}>
                                                          {course.status}
                                                      </span>
                                                      <span className="text-xs text-slate-400 flex items-center gap-1">
                                                          <Clock size={12}/> {course.modules.reduce((acc, m) => acc + m.lessons.length, 0)} Lessons
                                                      </span>
                                                  </div>
                                              </div>
                                              <div className="flex items-center gap-1 self-end sm:self-center w-full sm:w-auto justify-end border-t sm:border-none pt-3 sm:pt-0 mt-2 sm:mt-0">
                                                  <button 
                                                      onClick={() => handleViewCourse(course)}
                                                      title="View as Student"
                                                      className="text-slate-400 hover:text-emerald-600 p-2 hover:bg-white rounded-lg transition-all"
                                                  >
                                                      <Eye size={18} />
                                                  </button>
                                                  <button 
                                                      onClick={() => handleEditCourse(course)}
                                                      title="Edit Project"
                                                      className="text-slate-400 hover:text-indigo-600 p-2 hover:bg-white rounded-lg transition-all"
                                                  >
                                                      <Edit3 size={18} />
                                                  </button>
                                                  <button 
                                                      onClick={() => { if(window.confirm('Are you sure you want to delete this project?')) deleteCourse(course.id); }}
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
                      </div>
                  );
              case 'dashboard':
              default:
                  return <CreatorDashboard 
                      courses={courses}
                      currentUser={currentUser}
                      onCreateNew={() => { setEditingCourse(null); setCurrentView('create_course'); }} 
                      onCreateVideo={(type) => { setVideoWizardType(type); setEditingCourse(null); setCurrentView('create_video'); }}
                      onEdit={(c) => handleEditCourse(c)}
                      onView={(c) => handleViewCourse(c)}
                      onImport={handleImportCourse}
                      onDelete={deleteCourse}
                      onNavigate={setCurrentView}
                      isLoading={isLoadingData}
                  />;
          }
      } 
      // STUDENT VIEWS
      else {
          switch(currentView) {
              case 'learning':
                  // Reuse Dashboard render for now or create specific list
                  return renderStudentDashboard(false); // No stats
              case 'certificates':
                  const myCerts = certificates.filter(c => c.studentId === currentUser.id);
                  return <CertificatesView certificates={myCerts} currentUser={currentUser} onBack={() => setCurrentView('dashboard')} />;
              case 'account':
                  return <StudentAccount user={currentUser} onUpdate={(u) => { 
                      setStudents(prev => prev.map(s => s.id === u.id ? u : s)); 
                      setCurrentUser(u); 
                  }} onBack={() => setCurrentView('dashboard')}/>;
              case 'resources':
                  return (
                      <div className="p-4 lg:p-8 max-w-4xl mx-auto">
                          <div className="flex items-center gap-4 mb-8">
                              <button onClick={() => setCurrentView('dashboard')} className="text-slate-500 hover:text-slate-700">
                                  <ArrowLeft size={24} />
                              </button>
                              <div>
                                  <h1 className="text-2xl font-bold text-slate-900">My Resources</h1>
                                  <p className="text-slate-500">Access your learning materials and downloads</p>
                              </div>
                          </div>
                          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                              <FolderOpen size={48} className="mx-auto text-slate-300 mb-4" />
                              <h3 className="text-lg font-semibold text-slate-700 mb-2">No Resources Yet</h3>
                              <p className="text-slate-500">Your course resources and downloadable materials will appear here.</p>
                          </div>
                      </div>
                  );
              case 'tools':
                  return (
                      <div className="p-4 lg:p-8 max-w-4xl mx-auto">
                          <div className="flex items-center gap-4 mb-8">
                              <button onClick={() => setCurrentView('dashboard')} className="text-slate-500 hover:text-slate-700">
                                  <ArrowLeft size={24} />
                              </button>
                              <div>
                                  <h1 className="text-2xl font-bold text-slate-900">My Tools</h1>
                                  <p className="text-slate-500">Access helpful tools and utilities</p>
                              </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="bg-emerald-50 p-6 rounded-xl border-2 border-emerald-400 flex items-center gap-5 group relative overflow-hidden">
                                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shrink-0">
                                      <Briefcase size={32} />
                                  </div>
                                  <div className="text-left">
                                      <h4 className="font-bold text-slate-900 text-xl">JobIntel 360</h4>
                                      <p className="text-base text-slate-600">Job market intelligence platform</p>
                                  </div>
                                  <span className="absolute top-3 right-3 bg-emerald-600 text-white text-xs font-bold px-2 py-1 rounded-full">Coming Soon</span>
                              </div>
                              <div className="bg-indigo-50 p-6 rounded-xl border-2 border-indigo-400 flex items-center gap-5 group relative overflow-hidden">
                                  <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 shrink-0">
                                      <Edit3 size={32} />
                                  </div>
                                  <div className="text-left">
                                      <h4 className="font-bold text-slate-900 text-xl">TailorWiz</h4>
                                      <p className="text-base text-slate-600">Resume tailoring assistant</p>
                                  </div>
                                  <span className="absolute top-3 right-3 bg-indigo-600 text-white text-xs font-bold px-2 py-1 rounded-full">Coming Soon</span>
                              </div>
                          </div>
                      </div>
                  );
              case 'help':
                  // AI Chat Interface
                  return (
                      <div className="p-4 lg:p-8 max-w-4xl mx-auto h-[calc(100vh-2rem)] flex flex-col">
                          <div className="flex justify-between items-center mb-6">
                              <div>
                                <h1 className="text-2xl font-bold text-slate-900">AI Help Assistant</h1>
                                <p className="text-slate-500">Get instant answers or escalate to a human.</p>
                              </div>
                              {hasEscalated ? (
                                  <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm font-bold border border-indigo-200">Escalated to Support</span>
                              ) : (
                                  <Button variant="outline" onClick={handleEscalateChat} className="text-sm">Escalate to Human</Button>
                              )}
                          </div>
                          <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
                                  {chatHistory.map((msg, i) => (
                                      <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                          <div className={`max-w-[80%] p-3 rounded-xl text-sm ${msg.sender === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm'}`}>
                                              {msg.text}
                                          </div>
                                      </div>
                                  ))}
                                  {isChatTyping && (
                                      <div className="flex justify-start">
                                          <div className="bg-white border border-slate-200 p-3 rounded-xl rounded-bl-none shadow-sm flex gap-1">
                                              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                                              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-100"></div>
                                              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-200"></div>
                                          </div>
                                      </div>
                                  )}
                              </div>
                              <div className="p-4 bg-white border-t border-slate-200 flex gap-2">
                                  <input 
                                      className="flex-1 bg-slate-100 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                                      placeholder="Type your question..." 
                                      value={chatInput} 
                                      onChange={(e) => setChatInput(e.target.value)}
                                      onKeyDown={(e) => e.key === 'Enter' && handleAiChat()}
                                  />
                                  <button onClick={handleAiChat} disabled={isChatTyping || !chatInput.trim()} className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                                      <Send size={20}/>
                                  </button>
                              </div>
                          </div>
                          <div className="md:hidden mt-8 pb-8 text-center">
                               <button onClick={() => setCurrentView('dashboard')} className="text-indigo-600 font-bold text-sm">
                                   ← Back to Dashboard
                               </button>
                           </div>
                      </div>
                  );
              case 'ask':
              case 'bug':
                  const isBug = currentView === 'bug';
                  return (
                      <div className="p-8 max-w-2xl mx-auto">
                          <h1 className="text-2xl font-bold text-slate-900 mb-2">{isBug ? 'Report a Bug' : 'Ask Instructor'}</h1>
                          <p className="text-slate-500 mb-6">{isBug ? 'Found a technical issue? Let us know.' : 'Have a question about the course content?'}</p>
                          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                              <div className="space-y-1">
                                  <label className="text-sm font-bold text-slate-700">Subject</label>
                                  <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" value={ticketSubject} onChange={(e) => setTicketSubject(e.target.value)} placeholder={isBug ? "e.g. Video not playing" : "e.g. Question about Module 3"} />
                              </div>
                              <div className="space-y-1">
                                  <label className="text-sm font-bold text-slate-700">Message</label>
                                  <TextArea rows={5} value={ticketMessage} onChange={(e) => setTicketMessage(e.target.value)} placeholder="Describe your issue or question in detail..." />
                              </div>
                              <div className="flex justify-end gap-2 pt-2">
                                  <Button variant="outline" onClick={() => setCurrentView('dashboard')}>Cancel</Button>
                                  <Button onClick={() => submitTicket(isBug ? 'bug' : 'question', ticketMessage, ticketSubject)} disabled={!ticketMessage || !ticketSubject || isSubmittingTicket} isLoading={isSubmittingTicket}>
                                      Submit Ticket
                                  </Button>
                              </div>
                          </div>
                          <div className="md:hidden mt-8 pb-8 text-center">
                               <button onClick={() => setCurrentView('dashboard')} className="text-indigo-600 font-bold text-sm">
                                   ← Back to Dashboard
                               </button>
                           </div>
                      </div>
                  );
              case 'dashboard':
              default:
                  return renderStudentDashboard(true); // With stats
          }
      }
  };

  const getPageBackground = () => {
      if (currentUser?.role === UserRole.STUDENT) {
          if (['dashboard', 'learning', 'certificates', 'account', 'help', 'ask', 'bug'].includes(currentView)) {
              return 'bg-white';
          }
      }
      return 'bg-slate-100';
  };

  return (
    <div className={`flex h-screen ${getPageBackground()} font-sans overflow-hidden`}>
        {isLoadingFullCourse && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
                <div className="bg-white rounded-xl p-8 flex flex-col items-center gap-4 shadow-2xl">
                    <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    <p className="text-lg font-semibold text-slate-700">Loading course...</p>
                </div>
            </div>
        )}
        <Sidebar 
            currentView={currentView} 
            setView={setCurrentView} 
            role={currentUser.role} 
            switchRole={handleSwitchRole}
            onLogout={handleLogout}
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
        />
        <main className={`flex-1 overflow-auto relative w-full ${currentUser.role === UserRole.CREATOR ? 'lg:ml-60 xl:ml-68 2xl:ml-72' : 'lg:ml-64 xl:ml-72 2xl:ml-80'}`}>
            {/* Mobile Header for Sidebar Toggle - Enhanced for Students */}
            {currentUser.role === UserRole.STUDENT ? (
                <div className="lg:hidden py-8 px-6 bg-slate-900 flex justify-between items-center sticky top-0 z-40">
                    <div className="flex items-center gap-5 animate-fade-in">
                      <div className="w-20 h-20 rounded-2xl flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-emerald-600 to-teal-600 border border-white/20 shadow-lg group">
                        <Briefcase className="w-10 h-10 text-white" />
                      </div>
                      <div className="flex flex-col justify-center">
                          <span className="text-2xl font-black text-white leading-none tracking-tight uppercase text-left block">Jobs On</span>
                          <span className="text-2xl font-black text-white leading-none tracking-tight uppercase text-left block mt-0.5">Demand</span>
                          <div className="flex items-center gap-2 mt-1.5">
                              <div className="h-0.5 w-6 bg-emerald-500 rounded-full"></div>
                              <span className="text-sm font-bold text-emerald-400 uppercase tracking-[0.25em]">Academy</span>
                          </div>
                      </div>
                    </div>
                    <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-400 hover:text-white rounded-xl transition-colors">
                        <Menu size={40} />
                    </button>
                </div>
            ) : (
                <div className="lg:hidden p-4 bg-slate-900 text-white flex justify-between items-center sticky top-0 z-40">
                    <span className="font-bold">Jobs On Demand</span>
                    <button onClick={() => setIsSidebarOpen(true)}><Menu size={24} /></button>
                </div>
            )}
            
            {renderContent()}
        </main>
    </div>
  );
};
