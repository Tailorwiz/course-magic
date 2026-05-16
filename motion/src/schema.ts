/**
 * Zod schemas for the motion video input props.
 *
 * Remotion's <Composition schema={...}> validates inputProps against this at
 * render time and in Studio. The AI Scene Director also validates its
 * generated scene lists against `sceneSchema` before rendering.
 *
 * These mirror the TypeScript types in scenes.ts and brand/brandKit.ts —
 * keep them in sync.
 */
import { z } from 'zod';

/** Hex color string, e.g. #2b3555. */
const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'must be a hex color');

export const brandKitSchema = z.object({
  name: z.string(),
  primary: hexColor,
  accent: hexColor,
  ink: hexColor,
  muted: hexColor,
  background: hexColor,
  panel: hexColor,
  danger: hexColor,
  headingFont: z.string(),
  bodyFont: z.string(),
  logoUrl: z.string().optional(),
  radius: z.number(),
  tone: z.enum(['bold', 'calm', 'corporate']),
});

/** Partial brand — the form clients actually submit; defaults fill the rest. */
export const partialBrandKitSchema = brandKitSchema.partial();

const kineticLineSchema = z.object({
  text: z.string(),
  accent: z.string().optional(),
});

/** Fields shared by every scene. */
const sceneBaseSchema = {
  durationInFrames: z.number().int().positive(),
  narration: z.string().optional(),
  audioUrl: z.string().optional(),
  transition: z.enum(['fade', 'slide', 'wipe', 'none']).optional(),
};

export const kineticTitleSceneSchema = z.object({
  ...sceneBaseSchema,
  type: z.literal('kineticTitle'),
  lines: z.array(kineticLineSchema).min(1).max(3),
  showMock: z.boolean().optional(),
  showLogo: z.boolean().optional(),
});

export const flowchartSceneSchema = z.object({
  ...sceneBaseSchema,
  type: z.literal('flowchart'),
  topTag: z.string().optional(),
  steps: z
    .array(z.object({ text: z.string(), bad: z.boolean().optional() }))
    .min(2)
    .max(5),
});

export const bulletBuildSceneSchema = z.object({
  ...sceneBaseSchema,
  type: z.literal('bulletBuild'),
  title: z.string(),
  bullets: z.array(z.string()).min(1).max(6),
});

export const statCountUpSceneSchema = z.object({
  ...sceneBaseSchema,
  type: z.literal('statCountUp'),
  value: z.number(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  label: z.string(),
  caption: z.string().optional(),
});

export const beforeAfterSceneSchema = z.object({
  ...sceneBaseSchema,
  type: z.literal('beforeAfter'),
  before: z.object({ heading: z.string(), points: z.array(z.string()).min(1).max(5) }),
  after: z.object({ heading: z.string(), points: z.array(z.string()).min(1).max(5) }),
});

export const numberedStepsSceneSchema = z.object({
  ...sceneBaseSchema,
  type: z.literal('numberedSteps'),
  title: z.string().optional(),
  steps: z
    .array(z.object({ title: z.string(), detail: z.string().optional() }))
    .min(2)
    .max(5),
});

export const quoteCardSceneSchema = z.object({
  ...sceneBaseSchema,
  type: z.literal('quoteCard'),
  quote: z.string(),
  author: z.string().optional(),
  role: z.string().optional(),
});

export const checklistSceneSchema = z.object({
  ...sceneBaseSchema,
  type: z.literal('checklist'),
  title: z.string().optional(),
  items: z.array(z.string()).min(2).max(6),
});

export const timelineSceneSchema = z.object({
  ...sceneBaseSchema,
  type: z.literal('timeline'),
  title: z.string().optional(),
  events: z
    .array(z.object({ when: z.string(), text: z.string() }))
    .min(2)
    .max(6),
});

export const ctaEndCardSceneSchema = z.object({
  ...sceneBaseSchema,
  type: z.literal('ctaEndCard'),
  headline: z.string(),
  sub: z.string().optional(),
  cta: z.string(),
  url: z.string().optional(),
  showLogo: z.boolean().optional(),
});

export const mediaSceneSchema = z.object({
  ...sceneBaseSchema,
  type: z.literal('media'),
  mediaUrl: z.string(),
  mediaType: z.enum(['image', 'video']),
  frame: z.enum(['browser', 'laptop', 'phone', 'none']),
  kenBurns: z.boolean().optional(),
  caption: z.string().optional(),
  annotations: z
    .array(
      z.object({
        x: z.number(),
        y: z.number(),
        label: z.string(),
        arrow: z.boolean().optional(),
      }),
    )
    .optional(),
});

export const sceneSchema = z.discriminatedUnion('type', [
  kineticTitleSceneSchema,
  flowchartSceneSchema,
  bulletBuildSceneSchema,
  statCountUpSceneSchema,
  beforeAfterSceneSchema,
  numberedStepsSceneSchema,
  quoteCardSceneSchema,
  checklistSceneSchema,
  timelineSceneSchema,
  ctaEndCardSceneSchema,
  mediaSceneSchema,
]);

export const videoAudioSchema = z.object({
  musicUrl: z.string().optional(),
  musicMode: z.enum(['continuous', 'introOutro', 'none']).optional(),
});

/** The full inputProps shape passed to the MotionVideoDynamic composition. */
export const motionVideoPropsSchema = z.object({
  brand: partialBrandKitSchema,
  scenes: z.array(sceneSchema).min(1),
  audio: videoAudioSchema.optional(),
});

export type MotionVideoPropsInput = z.infer<typeof motionVideoPropsSchema>;
