import React, { useState, useRef } from 'react';
import { User, Course, UserRole, GlobalProgressData, Certificate, SupportTicket } from '../types';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Plus, Search, Trash2, Mail, Lock, User as UserIcon, Phone, MapPin, UploadCloud, Edit3, CheckSquare, Square, RefreshCcw, Download, ChevronUp, ChevronDown, BookOpen, FileText, Wand2, Loader2 } from 'lucide-react';

interface StudentExportData {
    user: User;
    progress: Record<string, string[]>;
    certificates: Certificate[];
    tickets: SupportTicket[];
}

interface StudentManagerProps {
    students: User[];
    courses: Course[];
    progressData: GlobalProgressData;
    certificates: Certificate[];
    tickets: SupportTicket[];
    onAddStudent: (user: User) => void;
    onUpdateStudent: (user: User) => void;
    onDeleteStudent: (userId: string) => void;
    onImportStudents: (users: User[]) => void;
    onImportProgress?: (progress: GlobalProgressData) => void;
    onImportCertificates?: (certs: Certificate[]) => void;
    onImportTickets?: (tickets: SupportTicket[]) => void;
}

export const StudentManager: React.FC<StudentManagerProps> = ({ 
    students, 
    courses, 
    progressData, 
    certificates, 
    tickets, 
    onAddStudent, 
    onUpdateStudent, 
    onDeleteStudent, 
    onImportStudents,
    onImportProgress,
    onImportCertificates,
    onImportTickets
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Form State
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [phone, setPhone] = useState('');
    const [city, setCity] = useState('');
    const [state, setState] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);

    // Resume parsing state
    const [addMode, setAddMode] = useState<'resume' | 'manual'>('resume');
    const [resumeText, setResumeText] = useState('');
    const [isParsing, setIsParsing] = useState(false);
    const [parseError, setParseError] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const importInputRef = useRef<HTMLInputElement>(null);
    const resumeFileInputRef = useRef<HTMLInputElement>(null);

    const resetForm = () => {
        setName(''); setEmail(''); setPassword(''); setPhone(''); setCity(''); setState(''); setAvatarUrl('');
        setSelectedCourseIds([]);
        setEditMode(false);
        setCurrentUserId(null);
        setResumeText('');
        setParseError('');
        setAddMode('resume');
    };

    const handleResumeFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                setResumeText(reader.result as string);
            };
            reader.readAsText(file);
        }
    };

    const handleParseResume = async () => {
        if (!resumeText.trim()) {
            setParseError('Please paste or upload a resume first');
            return;
        }
        
        setIsParsing(true);
        setParseError('');
        
        try {
            const response = await fetch('/api/ai/parse-resume', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ resumeText: resumeText.trim() })
            });
            
            if (!response.ok) {
                throw new Error('Failed to parse resume');
            }
            
            const data = await response.json();
            
            // Populate the form fields
            setName(`${data.firstName || ''} ${data.lastName || ''}`.trim());
            setEmail(data.email || '');
            setPhone(data.phone || '');
            setCity(data.city || '');
            setState(data.state || '');
            setPassword(data.generatedPassword || '');
            
            // Switch to manual mode to show the filled form
            setAddMode('manual');
        } catch (error: any) {
            setParseError(error.message || 'Failed to parse resume. Please try again or enter manually.');
        } finally {
            setIsParsing(false);
        }
    };

    const handleOpenAdd = () => {
        resetForm();
        setIsModalOpen(true);
    };

    const handleOpenEdit = (user: User) => {
        setEditMode(true);
        setCurrentUserId(user.id);
        setName(user.name);
        setEmail(user.email);
        setPassword(user.password || '');
        setPhone(user.phone || '');
        setCity(user.city || '');
        setState(user.state || '');
        setAvatarUrl(user.avatarUrl);
        setSelectedCourseIds(user.assignedCourseIds || []);
        setIsModalOpen(true);
    };

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                setAvatarUrl(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        const userData: User = {
            id: editMode && currentUserId ? currentUserId : `u-${Date.now()}`,
            name,
            email,
            password,
            phone,
            city,
            state,
            role: UserRole.STUDENT,
            avatarUrl: avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
            assignedCourseIds: selectedCourseIds
        };

        if (editMode) {
            onUpdateStudent(userData);
        } else {
            onAddStudent(userData);
        }
        
        setIsModalOpen(false);
        resetForm();
    };
    
    const toggleCourseInForm = (courseId: string) => {
        setSelectedCourseIds(prev => 
            prev.includes(courseId) 
                ? prev.filter(id => id !== courseId)
                : [...prev, courseId]
        );
    };

    const toggleCourseAssignment = (student: User, courseId: string) => {
        const currentAssignments = student.assignedCourseIds || [];
        let newAssignments;
        
        if (currentAssignments.includes(courseId)) {
            newAssignments = currentAssignments.filter(id => id !== courseId);
        } else {
            newAssignments = [...currentAssignments, courseId];
        }

        onUpdateStudent({ ...student, assignedCourseIds: newAssignments });
    };

    const moveCourseUp = (student: User, courseId: string) => {
        const currentAssignments = [...(student.assignedCourseIds || [])];
        const index = currentAssignments.indexOf(courseId);
        if (index > 0) {
            [currentAssignments[index - 1], currentAssignments[index]] = [currentAssignments[index], currentAssignments[index - 1]];
            onUpdateStudent({ ...student, assignedCourseIds: currentAssignments });
        }
    };

    const moveCourseDown = (student: User, courseId: string) => {
        const currentAssignments = [...(student.assignedCourseIds || [])];
        const index = currentAssignments.indexOf(courseId);
        if (index < currentAssignments.length - 1) {
            [currentAssignments[index], currentAssignments[index + 1]] = [currentAssignments[index + 1], currentAssignments[index]];
            onUpdateStudent({ ...student, assignedCourseIds: currentAssignments });
        }
    };

    // --- Export Logic ---
    const downloadJSON = (data: any, filename: string) => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", filename);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const handleExportAll = () => {
        const studentList = students.filter(s => s.role === UserRole.STUDENT);
        
        const fullExportData = {
            exportVersion: '2.0',
            exportDate: new Date().toISOString(),
            students: studentList.map(student => ({
                user: student,
                progress: progressData[student.id] || {},
                certificates: certificates.filter(c => c.studentId === student.id),
                tickets: tickets.filter(t => t.studentId === student.id)
            })),
            summary: {
                totalStudents: studentList.length,
                totalCertificates: certificates.filter(c => studentList.some(s => s.id === c.studentId)).length,
                totalTickets: tickets.filter(t => studentList.some(s => s.id === t.studentId)).length
            }
        };
        
        downloadJSON(fullExportData, `all_students_full_backup_${new Date().toISOString().split('T')[0]}.json`);
    };

    const handleExportSingle = (student: User) => {
        const studentExport: StudentExportData = {
            user: student,
            progress: progressData[student.id] || {},
            certificates: certificates.filter(c => c.studentId === student.id),
            tickets: tickets.filter(t => t.studentId === student.id)
        };
        downloadJSON(studentExport, `student_${student.name.replace(/\s+/g, '_').toLowerCase()}_full.json`);
    };

    // --- Import Logic ---
    const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const json = JSON.parse(event.target?.result as string);
                    
                    // Check if it's the new full export format (v2.0)
                    if (json.exportVersion === '2.0' && json.students) {
                        const importedUsers: User[] = [];
                        const importedProgress: GlobalProgressData = {};
                        const importedCerts: Certificate[] = [];
                        const importedTickets: SupportTicket[] = [];
                        
                        json.students.forEach((studentData: StudentExportData) => {
                            if (studentData.user && studentData.user.name && studentData.user.email) {
                                importedUsers.push(studentData.user);
                                if (studentData.progress && Object.keys(studentData.progress).length > 0) {
                                    importedProgress[studentData.user.id] = studentData.progress;
                                }
                                if (studentData.certificates?.length > 0) {
                                    importedCerts.push(...studentData.certificates);
                                }
                                if (studentData.tickets?.length > 0) {
                                    importedTickets.push(...studentData.tickets);
                                }
                            }
                        });
                        
                        if (importedUsers.length > 0) {
                            onImportStudents(importedUsers);
                            if (onImportProgress && Object.keys(importedProgress).length > 0) {
                                onImportProgress(importedProgress);
                            }
                            if (onImportCertificates && importedCerts.length > 0) {
                                onImportCertificates(importedCerts);
                            }
                            if (onImportTickets && importedTickets.length > 0) {
                                onImportTickets(importedTickets);
                            }
                            alert(`Imported ${importedUsers.length} students with their progress, ${importedCerts.length} certificates, and ${importedTickets.length} support tickets.`);
                        } else {
                            alert("No valid student data found in the file.");
                        }
                    } 
                    // Check if it's a single student full export
                    else if (json.user && json.user.name && json.user.email) {
                        onImportStudents([json.user]);
                        if (onImportProgress && json.progress && Object.keys(json.progress).length > 0) {
                            onImportProgress({ [json.user.id]: json.progress });
                        }
                        if (onImportCertificates && json.certificates?.length > 0) {
                            onImportCertificates(json.certificates);
                        }
                        if (onImportTickets && json.tickets?.length > 0) {
                            onImportTickets(json.tickets);
                        }
                        alert(`Imported student "${json.user.name}" with all their data.`);
                    }
                    // Legacy format: array of users or single user object
                    else {
                        const userArray = Array.isArray(json) ? json : [json];
                        const validUsers = userArray.filter((u: any) => u.name && u.email);
                        
                        if (validUsers.length > 0) {
                            onImportStudents(validUsers);
                            alert(`Imported ${validUsers.length} students (legacy format - no progress/certificates included).`);
                        } else {
                            alert("Invalid file format. No valid student data found.");
                        }
                    }
                } catch (err) {
                    console.error(err);
                    alert("Failed to parse JSON file.");
                }
            };
            reader.readAsText(file);
        }
        // Reset input
        if (importInputRef.current) importInputRef.current.value = '';
    };

    const filteredStudents = students.filter(s => 
        s.role === UserRole.STUDENT && 
        (s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.email.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Student Management</h1>
                    <p className="text-slate-500">Create accounts, assign access, and manage profiles.</p>
                </div>
                <div className="flex gap-3">
                    <input 
                        type="file" 
                        accept=".json" 
                        ref={importInputRef} 
                        className="hidden" 
                        onChange={handleImportFile}
                    />
                    <Button variant="outline" onClick={() => importInputRef.current?.click()} icon={<UploadCloud size={16}/>}>
                        Import
                    </Button>
                    <Button variant="outline" onClick={handleExportAll} icon={<Download size={16} />}>
                        Export All
                    </Button>
                    <Button onClick={handleOpenAdd} icon={<Plus size={16} />}>
                        Add Student
                    </Button>
                </div>
            </div>

            {/* Modal for Add/Edit Student */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-slate-900">{editMode ? 'Edit Student Profile' : 'Create New Student Account'}</h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">×</button>
                        </div>

                        {/* Tabs for Add Mode (only show when not editing) */}
                        {!editMode && (
                            <div className="flex border-b border-slate-200">
                                <button
                                    type="button"
                                    onClick={() => setAddMode('resume')}
                                    className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                                        addMode === 'resume'
                                            ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50'
                                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                                    }`}
                                >
                                    <FileText size={16} />
                                    From Resume
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAddMode('manual')}
                                    className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                                        addMode === 'manual'
                                            ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50'
                                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                                    }`}
                                >
                                    <Edit3 size={16} />
                                    Manual Entry
                                </button>
                            </div>
                        )}

                        {/* Resume Parsing Tab */}
                        {!editMode && addMode === 'resume' && (
                            <div className="p-6 space-y-4">
                                <div className="text-center mb-4">
                                    <p className="text-sm text-slate-600">
                                        Paste resume text below or upload a text file. AI will extract student information automatically.
                                    </p>
                                </div>
                                
                                <div className="space-y-3">
                                    <textarea
                                        value={resumeText}
                                        onChange={(e) => setResumeText(e.target.value)}
                                        placeholder="Paste resume content here...

Example:
John Smith
john.smith@email.com
(555) 123-4567
New York, NY

EXPERIENCE
Senior Software Engineer..."
                                        className="w-full h-48 p-4 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    />
                                    
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="file"
                                            ref={resumeFileInputRef}
                                            accept=".txt,.doc,.docx,.pdf"
                                            className="hidden"
                                            onChange={handleResumeFileUpload}
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => resumeFileInputRef.current?.click()}
                                            icon={<UploadCloud size={16} />}
                                        >
                                            Upload File
                                        </Button>
                                        <span className="text-xs text-slate-400">Supports .txt files</span>
                                    </div>
                                </div>
                                
                                {parseError && (
                                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                                        {parseError}
                                    </div>
                                )}
                                
                                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                    <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                                    <Button
                                        type="button"
                                        onClick={handleParseResume}
                                        disabled={isParsing || !resumeText.trim()}
                                        icon={isParsing ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                                    >
                                        {isParsing ? 'Parsing...' : 'Extract Info & Continue'}
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Manual Entry Form (or Resume tab after parsing) */}
                        {(editMode || addMode === 'manual') && (
                        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
                            
                            <div className="flex flex-col sm:flex-row gap-6">
                                {/* Photo Section */}
                                <div className="flex-shrink-0 flex flex-col items-center gap-3">
                                    <div 
                                        className="w-32 h-32 rounded-full bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center relative overflow-hidden group cursor-pointer hover:border-indigo-400 transition-colors"
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        {avatarUrl ? (
                                            <img src={avatarUrl} className="w-full h-full object-cover" alt="Avatar" />
                                        ) : (
                                            <div className="text-center p-2">
                                                <UploadCloud size={24} className="mx-auto text-slate-400 mb-1" />
                                                <span className="text-[10px] text-slate-500">Upload Photo</span>
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="text-xs text-white font-medium">Change</span>
                                        </div>
                                        <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleAvatarChange} />
                                    </div>
                                    <span className="text-xs text-slate-400">Allowed: JPG, PNG</span>
                                </div>

                                {/* Main Fields */}
                                <div className="flex-1 space-y-4">
                                    <Input 
                                        label="Full Name" 
                                        placeholder="e.g. John Doe" 
                                        value={name} 
                                        onChange={e => setName(e.target.value)}
                                        required 
                                        icon={<UserIcon size={16} />}
                                    />
                                    <div className="grid grid-cols-2 gap-4">
                                        <Input 
                                            label="Email Address" 
                                            type="email" 
                                            placeholder="john@example.com" 
                                            value={email} 
                                            onChange={e => setEmail(e.target.value)}
                                            required
                                            icon={<Mail size={16} />}
                                        />
                                        <Input 
                                            label="Phone Number" 
                                            type="tel" 
                                            placeholder="(555) 123-4567" 
                                            value={phone} 
                                            onChange={e => setPhone(e.target.value)}
                                            icon={<Phone size={16} />}
                                        />
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                         <div className="col-span-2">
                                            <Input 
                                                label="City" 
                                                placeholder="New York" 
                                                value={city} 
                                                onChange={e => setCity(e.target.value)}
                                                icon={<MapPin size={16} />}
                                            />
                                         </div>
                                         <Input 
                                            label="State" 
                                            placeholder="NY" 
                                            value={state} 
                                            onChange={e => setState(e.target.value)}
                                            maxLength={2}
                                         />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                    <Lock size={14} /> Login Credentials
                                </h3>
                                <div className="flex items-end gap-3">
                                    <div className="flex-1">
                                         <Input 
                                            label={editMode ? "Reset Password" : "Password"} 
                                            type="text" 
                                            placeholder="Set password" 
                                            value={password} 
                                            onChange={e => setPassword(e.target.value)}
                                            required={!editMode}
                                        />
                                    </div>
                                    {editMode && (
                                        <button type="button" onClick={() => setPassword(Math.random().toString(36).slice(-8))} className="mb-0.5 px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm flex items-center gap-2" title="Generate Random">
                                            <RefreshCcw size={14} /> Generate
                                        </button>
                                    )}
                                </div>
                                {editMode && <p className="text-xs text-slate-500 mt-2">Leave blank to keep existing password.</p>}
                            </div>

                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                    <BookOpen size={14} /> Assign Courses
                                </h3>
                                {courses.length === 0 ? (
                                    <p className="text-sm text-slate-500 italic">No courses available. Create courses first.</p>
                                ) : (
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {courses.map(course => (
                                            <label 
                                                key={course.id} 
                                                className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                                                    selectedCourseIds.includes(course.id) 
                                                        ? 'bg-indigo-50 border border-indigo-200' 
                                                        : 'bg-white border border-slate-200 hover:bg-slate-50'
                                                }`}
                                            >
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedCourseIds.includes(course.id)}
                                                    onChange={() => toggleCourseInForm(course.id)}
                                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium text-slate-900 truncate">{course.title}</div>
                                                    <div className="text-xs text-slate-500">{course.type === 'video' ? 'Training Video' : 'Course'}</div>
                                                </div>
                                                {selectedCourseIds.includes(course.id) && (
                                                    <CheckSquare size={16} className="text-indigo-600 flex-shrink-0" />
                                                )}
                                            </label>
                                        ))}
                                    </div>
                                )}
                                <p className="text-xs text-slate-500 mt-2">
                                    {selectedCourseIds.length === 0 
                                        ? 'No courses selected. Student will have no access until courses are assigned.' 
                                        : `${selectedCourseIds.length} course${selectedCourseIds.length > 1 ? 's' : ''} selected`}
                                </p>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                                <Button type="submit">{editMode ? 'Save Changes' : 'Create Account'}</Button>
                            </div>
                        </form>
                        )}
                    </div>
                </div>
            )}

            {/* Search Bar */}
            <div className="relative mb-6">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input 
                    type="text" 
                    placeholder="Search students by name or email..." 
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
            </div>

            {/* Student List */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Student Profile</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contact Info</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Course Access</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredStudents.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                                        No students found. Click "Add New Student" to get started.
                                    </td>
                                </tr>
                            ) : (
                                filteredStudents.map(student => (
                                    <tr key={student.id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <img src={student.avatarUrl} alt={student.name} className="w-10 h-10 rounded-full bg-slate-200 object-cover" />
                                                <div>
                                                    <div className="font-bold text-slate-900">{student.name}</div>
                                                    <div className="text-xs text-slate-500 flex items-center gap-1">
                                                        <MapPin size={10} /> {student.city && student.state ? `${student.city}, ${student.state}` : 'Location unknown'}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                             <div className="space-y-1">
                                                <div className="text-sm text-slate-600 flex items-center gap-2"><Mail size={12} className="text-slate-400"/> {student.email}</div>
                                                <div className="text-sm text-slate-600 flex items-center gap-2"><Phone size={12} className="text-slate-400"/> {student.phone || "N/A"}</div>
                                             </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="space-y-2">
                                                {/* Assigned Courses (ordered) */}
                                                {(student.assignedCourseIds || []).length > 0 && (
                                                    <div className="space-y-1">
                                                        <div className="text-[10px] font-bold text-slate-400 uppercase">Assigned (in order)</div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {(student.assignedCourseIds || []).map((courseId, idx) => {
                                                                const course = courses.find(c => c.id === courseId);
                                                                if (!course) return null;
                                                                const isFirst = idx === 0;
                                                                const isLast = idx === (student.assignedCourseIds || []).length - 1;
                                                                return (
                                                                    <div key={course.id} className="flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-medium overflow-hidden">
                                                                        <span className="bg-indigo-100 text-indigo-500 px-1.5 py-1 text-[10px] font-bold">{idx + 1}</span>
                                                                        <button 
                                                                            onClick={() => toggleCourseAssignment(student, course.id)}
                                                                            className="px-2 py-1 hover:bg-indigo-100 transition-colors flex items-center gap-1"
                                                                            title="Click to unassign"
                                                                        >
                                                                            <CheckSquare size={12} />
                                                                            {course.title}
                                                                        </button>
                                                                        <div className="flex flex-col border-l border-indigo-200">
                                                                            <button 
                                                                                onClick={() => moveCourseUp(student, course.id)}
                                                                                disabled={isFirst}
                                                                                className={`p-0.5 hover:bg-indigo-100 transition-colors ${isFirst ? 'text-indigo-300 cursor-not-allowed' : 'text-indigo-600'}`}
                                                                                title="Move up"
                                                                            >
                                                                                <ChevronUp size={12} />
                                                                            </button>
                                                                            <button 
                                                                                onClick={() => moveCourseDown(student, course.id)}
                                                                                disabled={isLast}
                                                                                className={`p-0.5 hover:bg-indigo-100 transition-colors ${isLast ? 'text-indigo-300 cursor-not-allowed' : 'text-indigo-600'}`}
                                                                                title="Move down"
                                                                            >
                                                                                <ChevronDown size={12} />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                                {/* Unassigned Courses */}
                                                {courses.filter(c => !(student.assignedCourseIds || []).includes(c.id)).length > 0 && (
                                                    <div className="flex flex-wrap gap-2">
                                                        {courses.filter(c => !(student.assignedCourseIds || []).includes(c.id)).map(course => (
                                                            <button 
                                                                key={course.id}
                                                                onClick={() => toggleCourseAssignment(student, course.id)}
                                                                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border bg-white border-slate-200 text-slate-400 hover:border-slate-300 transition-all"
                                                            >
                                                                <Square size={12} />
                                                                {course.title}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                {courses.length === 0 && <span className="text-xs text-slate-400 italic">No courses available</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button 
                                                    onClick={() => handleExportSingle(student)}
                                                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                    title="Export Student Data"
                                                >
                                                    <Download size={18} />
                                                </button>
                                                <button 
                                                    onClick={() => handleOpenEdit(student)}
                                                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                    title="Edit Profile"
                                                >
                                                    <Edit3 size={18} />
                                                </button>
                                                <button 
                                                    onClick={() => onDeleteStudent(student.id)}
                                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Delete Student"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};