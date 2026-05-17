/**
 * Scene data model.
 *
 * A motion video is an ordered list of Scenes. Each Scene carries a `type`
 * (which template renders it) and the copy for that scene. The AI Scene
 * Director produces this structure from a script / document / URL.
 *
 * Durations are in FRAMES. At 30fps, 90 frames = 3 seconds.
 *
 * Audio: each scene may carry a `narration` string. The server runs TTS on it,
 * sets `audioUrl`, and derives `durationInFrames` from the measured audio.
 */

/** How a scene transitions in from the previous scene. */
export type SceneTransition = 'fade' | 'slide' | 'wipe' | 'flip' | 'clockWipe' | 'none';

/** Fields shared by every scene. */
export interface SceneBase {
  /** Length of the scene in frames (server-derived from narration when present). */
  durationInFrames: number;
  /** Spoken line for this scene. Drives TTS + duration when set. */
  narration?: string;
  /** Public URL of the generated narration audio (set server-side after TTS). */
  audioUrl?: string;
  /** Transition INTO this scene from the previous one. Default 'fade'. */
  transition?: SceneTransition;
}

export interface KineticLine {
  text: string;
  /** If set, this substring inside `text` is painted in the accent color. */
  accent?: string;
}

/** Big animated headline — one or two lines, optional accent word. */
export interface KineticTitleScene extends SceneBase {
  type: 'kineticTitle';
  lines: KineticLine[];
  showMock?: boolean;
  showLogo?: boolean;
}

/** Vertical problem/consequence chain — pills connected by arrows. */
export interface FlowchartScene extends SceneBase {
  type: 'flowchart';
  topTag?: string;
  steps: { text: string; bad?: boolean }[];
}

/** Title + bullets that build in one at a time. */
export interface BulletBuildScene extends SceneBase {
  type: 'bulletBuild';
  title: string;
  bullets: string[];
}

/** A big number that counts up, with a label. */
export interface StatCountUpScene extends SceneBase {
  type: 'statCountUp';
  value: number;
  prefix?: string;
  suffix?: string;
  label: string;
  caption?: string;
}

/** Two-column before/after comparison. */
export interface BeforeAfterScene extends SceneBase {
  type: 'beforeAfter';
  before: { heading: string; points: string[] };
  after: { heading: string; points: string[] };
}

/** Numbered step sequence. */
export interface NumberedStepsScene extends SceneBase {
  type: 'numberedSteps';
  title?: string;
  steps: { title: string; detail?: string }[];
}

/** A pulled quote with attribution. */
export interface QuoteCardScene extends SceneBase {
  type: 'quoteCard';
  quote: string;
  author?: string;
  role?: string;
}

/** A checklist whose items check off one by one. */
export interface ChecklistScene extends SceneBase {
  type: 'checklist';
  title?: string;
  items: string[];
}

/** A horizontal timeline of events. */
export interface TimelineScene extends SceneBase {
  type: 'timeline';
  title?: string;
  events: { when: string; text: string }[];
}

/** Closing call-to-action card. */
export interface CtaEndCardScene extends SceneBase {
  type: 'ctaEndCard';
  headline: string;
  sub?: string;
  cta: string;
  url?: string;
  showLogo?: boolean;
}

/** An annotation marker placed over a media asset (coords are 0..1 fractions). */
export interface MediaAnnotation {
  x: number;
  y: number;
  label: string;
  arrow?: boolean;
}

/** Embeds an uploaded screenshot / screen recording in a device frame. */
export interface MediaScene extends SceneBase {
  type: 'media';
  mediaUrl: string;
  mediaType: 'image' | 'video';
  /** Device chrome to wrap the media in. */
  frame: 'browser' | 'laptop' | 'phone' | 'none';
  kenBurns?: boolean;
  caption?: string;
  annotations?: MediaAnnotation[];
}

export type Scene =
  | KineticTitleScene
  | FlowchartScene
  | BulletBuildScene
  | StatCountUpScene
  | BeforeAfterScene
  | NumberedStepsScene
  | QuoteCardScene
  | ChecklistScene
  | TimelineScene
  | CtaEndCardScene
  | MediaScene;

/** Background music modes. */
export type MusicMode = 'continuous' | 'introOutro' | 'none';

/** Audio attached to a whole video. */
export interface VideoAudio {
  musicUrl?: string;
  musicMode?: MusicMode;
}

export interface MotionVideoData {
  scenes: Scene[];
  fps: number;
  width: number;
  height: number;
}

/** Number of frames a scene-to-scene transition overlaps. */
export const TRANSITION_FRAMES = 15;

/** Raw total duration of a video in frames (sum of scene durations). */
export const totalDuration = (scenes: Scene[]): number =>
  scenes.reduce((sum, s) => sum + s.durationInFrames, 0);

/**
 * Effective total duration once transitions are applied. A transition between
 * two scenes OVERLAPS them, so it shortens the timeline by TRANSITION_FRAMES
 * for every scene boundary that has a transition (anything but 'none').
 */
export const totalDurationWithTransitions = (
  scenes: Scene[],
  transitionFrames = TRANSITION_FRAMES,
): number => {
  let total = totalDuration(scenes);
  for (let i = 1; i < scenes.length; i++) {
    if ((scenes[i].transition ?? 'fade') !== 'none') {
      total -= transitionFrames;
    }
  }
  return Math.max(total, 1);
};
