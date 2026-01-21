export enum UserRole {
  CREATOR = 'CREATOR',
  STUDENT = 'STUDENT'
}

export enum CourseStatus {
  DRAFT = 'DRAFT',
  PROCESSING = 'PROCESSING',
  PUBLISHED = 'PUBLISHED'
}

export enum LessonStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  SCRIPTING = 'SCRIPTING',
  VOICING = 'VOICING',
  RENDERING = 'RENDERING',
  READY = 'READY'
}

// Changed from string union to string to support dynamic ElevenLabs IDs
export type VoiceOption = string;

export type CaptionStyle = 'None' | 'Viral (Strike)' | 'Viral (Clean)' | 'Viral (Box)' | 'Viral (Pop)' | 'Outline' | 'Cinematic' | 'Modern' | 'Karaoke' | 'Minimalist' | 'News Ticker' | 'Typewriter' | 'Comic Book' | 'Neon Glow' | 'Subtitle' | 'Handwritten';

export type CaptionPosition = 'Top' | 'Center' | 'Bottom';
export type CaptionSize = 'Small' | 'Medium' | 'Large';
export type CaptionMode = 'Overlay' | 'Subtitle Bar';

export type VisualMode = 'AI_Scene' | 'Abstract' | 'Solid_Color';

export type GenerationMode = 'strict' | 'hybrid' | 'creative';

export type ResourceType = 'link' | 'pdf' | 'doc' | 'image' | 'video_link';

export type MusicMode = 'Continuous' | 'IntroOutro';

export interface Resource {
  id: string;
  title: string;
  type: ResourceType;
  url: string; // URL for links, or Base64 data URI for files
  fileName?: string; // Original filename for downloads
}

export interface VisualAsset {
  id: string;
  prompt: string;
  imageData: string;
  type: 'illustration' | 'chart' | 'graph' | 'photo';
  overlayText?: string;
  scriptText?: string;
  startTime: number;
  endTime: number;
  zoomDirection?: 'in' | 'out';
}

export interface Lesson {
  id: string;
  moduleId: string;
  title: string;
  sourceText: string;
  videoUrl?: string;
  renderedVideoUrl?: string; // URL to server-saved rendered video (for streaming playback)
  audioData?: string;
  audioMimeType?: 'audio/pcm' | 'audio/mpeg'; // New field to support MP3 from ElevenLabs
  visuals?: VisualAsset[];
  resources?: Resource[];
  keyTakeaways?: string[]; // New: List of key points
  actionItems?: string[]; // New: List of actionable steps
  voice?: VoiceOption;
  captionStyle?: CaptionStyle;
  captionTextSource?: 'overlay' | 'script';
  captionPosition?: CaptionPosition; 
  captionSize?: CaptionSize;
  captionMode?: CaptionMode;
  captionColor?: string;       
  captionBgColor?: string;     
  captionOutlineColor?: string; 
  visualStyle?: string;
  visualPacing?: 'Normal' | 'Fast' | 'Turbo'; 
  visualMode?: VisualMode;
  solidColor?: string;
  backgroundMusicUrl?: string;
  musicMode?: MusicMode;
  thumbnailData?: string;
  duration: string;
  durationSeconds: number;
  status: LessonStatus;
  wordTimestamps?: { word: string; start: number; end: number }[];
  progress: number;
  isCompleted?: boolean; // Deprecated for students, used for preview only
  awardsCertificate?: boolean; // If true, completing this lesson counts toward certificate eligibility
  sourceVideoId?: string; // ID of the standalone video this lesson was copied from
}

export interface Module {
  id: string;
  courseId: string;
  title: string;
  lessons: Lesson[];
}

export interface CourseTheme {
  primaryColor: string;    // Main branding color (Headers, Sidebar Blocks)
  accentColor: string;     // Active states, Progress bars
  backgroundColor: string; // Main page background
  borderColor: string;     // Outlines for modules/sidebar
  textColor: string;       // Main body text color
  isBoldText: boolean;     // Toggle for heavier font weight
  fontFamily: string;      // Font family string
}

export interface Course {
  id: string;
  type?: 'course' | 'video'; // New field to distinguish full courses from single videos
  title: string;
  headline: string;
  description: string;
  ecoverUrl: string;
  status: CourseStatus;
  modules: Module[];
  totalStudents: number;
  rating: number;
  theme?: CourseTheme; // Optional custom branding
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string; // Simple auth for demo
  role: UserRole;
  avatarUrl: string;
  phone?: string;
  city?: string;
  state?: string;
  assignedCourseIds?: string[]; // For students
}

export interface Certificate {
  id: string;
  studentId: string;
  studentName: string;
  courseId: string;
  courseTitle: string;
  courseImage: string;
  issueDate: string; // ISO Date String
}

export interface SupportTicket {
  id: string;
  type: 'question' | 'bug' | 'help_chat';
  studentId: string;
  studentName: string;
  studentEmail: string;
  subject?: string;
  message: string; // Or JSON string for chat logs
  status: 'open' | 'resolved';
  priority?: 'low' | 'medium' | 'high';
  timestamp: string;
}

// Map of CourseID -> Array of Completed LessonIDs
export type StudentProgress = Record<string, string[]>;

// Map of UserID -> StudentProgress
export type GlobalProgressData = Record<string, StudentProgress>;
