
import { Course, CourseStatus, LessonStatus, User, UserRole, VisualAsset } from './types';
import { createSolidColorImage } from './utils';

export const DEFAULT_ELEVEN_LABS_KEY = 'sk_50f18ecb4c9094e03136ddb8f9f11ac28081da1e0c2e5258';

export const CURRENT_USER: User = {
  id: 'u1',
  name: 'Marcus Hall',
  email: 'marcus@tailorwiz.com',
  password: 'admin123',
  role: UserRole.CREATOR,
  avatarUrl: 'https://ui-avatars.com/api/?name=Marcus+Hall&background=0D9488&color=fff'
};

export const DEFAULT_STUDENT: User = {
  id: 's1',
  name: 'John Doe',
  email: 'john@example.com',
  password: 'password',
  role: UserRole.STUDENT,
  avatarUrl: 'https://ui-avatars.com/api/?name=John+Doe&background=random',
  assignedCourseIds: ['c1']
};

// Helper to generate consistent mock visuals
const getMockVisuals = (lessonTitle: string): VisualAsset[] => {
  return [
    {
      id: `v-${lessonTitle}-1`,
      prompt: 'Introduction',
      imageData: createSolidColorImage('#4f46e5', lessonTitle),
      type: 'illustration',
      overlayText: lessonTitle,
      startTime: 0,
      endTime: 5,
      zoomDirection: 'in'
    },
    {
      id: `v-${lessonTitle}-2`,
      prompt: 'Key Concept',
      imageData: createSolidColorImage('#0f172a', 'Key Concept'),
      type: 'illustration',
      overlayText: 'Core Principles',
      startTime: 5,
      endTime: 10,
      zoomDirection: 'out'
    },
    {
      id: `v-${lessonTitle}-3`,
      prompt: 'Summary',
      imageData: createSolidColorImage('#059669', 'Summary'),
      type: 'illustration',
      overlayText: 'Takeaways',
      startTime: 10,
      endTime: 15,
      zoomDirection: 'in'
    }
  ];
};

export const MOCK_COURSE: Course = {
  id: 'c1',
  title: 'The Architectural Blueprint of SaaS',
  headline: 'Master backend scalability from Day 1',
  description: 'A comprehensive guide to building scalable Software as a Service platforms using Python, Redis, and React. Learn the patterns that power million-dollar apps.',
  ecoverUrl: 'https://picsum.photos/seed/saas/400/600',
  status: CourseStatus.PUBLISHED,
  totalStudents: 1240,
  rating: 4.8,
  theme: {
      primaryColor: '#1e1b4b', // Default Indigo-950
      accentColor: '#4f46e5',  // Default Indigo-600
      backgroundColor: '#f1f5f9', // Default Slate-100
      borderColor: '#cbd5e1',   // Default Slate-300
      textColor: '#1e293b',
      isBoldText: false,
      fontFamily: 'Inter, sans-serif'
  },
  modules: [
    {
      id: 'm1',
      courseId: 'c1',
      title: 'Module 1: High Level Architecture',
      lessons: [
        {
          id: 'l1',
          moduleId: 'm1',
          title: 'The Service Mesh',
          sourceText: 'The service mesh is a dedicated infrastructure layer...',
          visuals: getMockVisuals('The Service Mesh'),
          duration: '0:15',
          durationSeconds: 15,
          status: LessonStatus.READY,
          progress: 100,
          isCompleted: true,
          resources: [
            { id: 'r1', title: 'Service Mesh Diagram (PDF)', type: 'pdf', url: '#', fileName: 'mesh-diagram.pdf' },
            { id: 'r2', title: 'Official Istio Documentation', type: 'link', url: 'https://istio.io', fileName: '' }
          ]
        },
        {
          id: 'l2',
          moduleId: 'm1',
          title: 'Database Sharding Strategies',
          sourceText: 'Sharding is a method of splitting and storing a single logical dataset...',
          visuals: getMockVisuals('DB Sharding'),
          duration: '0:15',
          durationSeconds: 15,
          status: LessonStatus.READY,
          progress: 0,
          isCompleted: false,
          resources: [
             { id: 'r3', title: 'Sharding Cheatsheet', type: 'image', url: 'https://picsum.photos/seed/sharding/800/600', fileName: 'cheatsheet.jpg' }
          ]
        }
      ]
    },
    {
      id: 'm2',
      courseId: 'c1',
      title: 'Module 2: AI Pipelines',
      lessons: [
        {
          id: 'l3',
          moduleId: 'm2',
          title: 'Celery & Redis Workers',
          sourceText: 'Distributed task queues are essential for AI workloads...',
          visuals: getMockVisuals('Async Workers'),
          duration: '0:15',
          durationSeconds: 15,
          status: LessonStatus.READY,
          progress: 0,
          isCompleted: false
        }
      ]
    }
  ]
};