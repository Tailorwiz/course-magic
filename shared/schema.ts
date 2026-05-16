import { pgTable, text, timestamp, jsonb, uuid, varchar, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull().default("STUDENT"),
  avatarUrl: text("avatar_url"),
  phone: varchar("phone", { length: 50 }),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }),
  assignedCourseIds: jsonb("assigned_course_ids").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export const courses = pgTable("courses", {
  id: uuid("id").defaultRandom().primaryKey(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const progress = pgTable("progress", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").notNull(),
  completedLessons: jsonb("completed_lessons").$type<string[]>().default([]),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tickets = pgTable("tickets", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: varchar("type", { length: 50 }).notNull(),
  studentId: uuid("student_id").references(() => users.id, { onDelete: "cascade" }),
  studentName: varchar("student_name", { length: 255 }),
  studentEmail: varchar("student_email", { length: 255 }),
  subject: text("subject"),
  message: text("message"),
  status: varchar("status", { length: 50 }).notNull().default("open"),
  priority: varchar("priority", { length: 50 }),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const certificates = pgTable("certificates", {
  id: uuid("id").defaultRandom().primaryKey(),
  studentId: uuid("student_id").references(() => users.id, { onDelete: "cascade" }),
  studentName: varchar("student_name", { length: 255 }),
  courseId: uuid("course_id"),
  courseTitle: varchar("course_title", { length: 500 }),
  courseImage: text("course_image"),
  issueDate: timestamp("issue_date").defaultNow(),
});

// Separate table for large audio data to avoid payload size limits
export const lessonAudio = pgTable("lesson_audio", {
  id: uuid("id").defaultRandom().primaryKey(),
  courseId: uuid("course_id").notNull(),
  lessonId: varchar("lesson_id", { length: 255 }).notNull(),
  audioData: text("audio_data").notNull(), // base64 audio data (legacy; will be empty after Storage migration)
  mimeType: varchar("mime_type", { length: 100 }).default("audio/mpeg"),
  wordTimestamps: jsonb("word_timestamps").$type<Array<{word: string, start: number, end: number}>>(),
  // P1.1: When migrated to Supabase Storage, the bucket path lives here. Server endpoints
  // 302-redirect to the public URL so <audio src=/api/...> still works without code changes.
  bucketPath: text("bucket_path"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Separate table for lesson images to avoid payload size limits
export const lessonImages = pgTable("lesson_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  courseId: uuid("course_id").notNull(),
  lessonId: varchar("lesson_id", { length: 255 }).notNull(),
  visualIndex: varchar("visual_index", { length: 50 }).notNull(), // e.g., "0", "1", "2"
  imageData: text("image_data").notNull(), // base64 (legacy; empty after Storage migration)
  prompt: text("prompt"), // original prompt for regeneration
  // P1.1: Storage bucket path when migrated.
  bucketPath: text("bucket_path"),
  createdAt: timestamp("created_at").defaultNow(),
});

// P0.4: Separate table for rendered MP4/WebM videos. Avoids 69MB+ base64 strings
// sitting inside course JSONB.
export const lessonVideos = pgTable("lesson_videos", {
  id: uuid("id").defaultRandom().primaryKey(),
  courseId: uuid("course_id").notNull(),
  lessonId: varchar("lesson_id", { length: 255 }).notNull(),
  videoData: text("video_data").notNull(), // base64 (legacy; empty after Storage migration)
  mimeType: varchar("mime_type", { length: 100 }).default("video/webm"),
  // P1.1: Storage bucket path when migrated.
  bucketPath: text("bucket_path"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Phase 2: Motion-graphics videos built with the Remotion engine.
// Each row is one brand-aware animated video — the scene list + brand kit are
// stored as JSON so the video can be re-rendered or edited later.
export const motionVideos = pgTable("motion_videos", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  title: varchar("title", { length: 255 }),
  // The BrandKit (colors, fonts, logo, tone) the video is themed with.
  brandKit: jsonb("brand_kit"),
  // The ordered Scene[] (template + copy + narration per scene).
  scenes: jsonb("scenes"),
  // Audio config: music track + mode.
  audio: jsonb("audio"),
  // 'draft' | 'rendering' | 'done' | 'error'
  status: varchar("status", { length: 50 }).notNull().default("draft"),
  // Supabase Storage path of the rendered MP4 (when done).
  bucketPath: text("bucket_path"),
  mimeType: varchar("mime_type", { length: 100 }).default("video/mp4"),
  durationSec: text("duration_sec"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  progress: many(progress),
  tickets: many(tickets),
  certificates: many(certificates),
}));

export const progressRelations = relations(progress, ({ one }) => ({
  user: one(users, { fields: [progress.userId], references: [users.id] }),
}));

export const ticketsRelations = relations(tickets, ({ one }) => ({
  student: one(users, { fields: [tickets.studentId], references: [users.id] }),
}));

export const certificatesRelations = relations(certificates, ({ one }) => ({
  student: one(users, { fields: [certificates.studentId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Course = typeof courses.$inferSelect;
export type InsertCourse = typeof courses.$inferInsert;
export type MotionVideo = typeof motionVideos.$inferSelect;
export type InsertMotionVideo = typeof motionVideos.$inferInsert;
export type Progress = typeof progress.$inferSelect;
export type InsertProgress = typeof progress.$inferInsert;
export type Ticket = typeof tickets.$inferSelect;
export type InsertTicket = typeof tickets.$inferInsert;
export type Certificate = typeof certificates.$inferSelect;
export type InsertCertificate = typeof certificates.$inferInsert;
export type LessonAudio = typeof lessonAudio.$inferSelect;
export type InsertLessonAudio = typeof lessonAudio.$inferInsert;
export type LessonImage = typeof lessonImages.$inferSelect;
export type InsertLessonImage = typeof lessonImages.$inferInsert;
export type LessonVideo = typeof lessonVideos.$inferSelect;
export type InsertLessonVideo = typeof lessonVideos.$inferInsert;
