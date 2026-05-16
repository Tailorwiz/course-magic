/**
 * Scene data model.
 *
 * A motion video is an ordered list of Scenes. Each Scene carries a `type`
 * (which template renders it) and the copy for that scene. The AI Scene
 * Director (Phase 2c) produces this structure from a script.
 *
 * Durations are in FRAMES. At 30fps, 90 frames = 3 seconds.
 *
 * Audio: each scene may carry a `narration` string (the spoken line). The
 * server runs TTS on it, sets `audioUrl` to the generated MP3, and derives
 * `durationInFrames` from the measured audio length. When there is no
 * narration the scene keeps its authored `durationInFrames`.
 */

/** Fields shared by every scene. */
export interface SceneBase {
  /** Length of the scene in frames (server-derived from narration when present). */
  durationInFrames: number;
  /** Spoken line for this scene. Drives TTS + duration when set. */
  narration?: string;
  /** Public URL of the generated narration MP3 (set server-side after TTS). */
  audioUrl?: string;
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
  /** Optional faint background mock (chat/list) like the babylovegrowth intro. */
  showMock?: boolean;
  /** When true, the brand logo animates in above the headline. */
  showLogo?: boolean;
}

/** Vertical problem/consequence chain — pills connected by arrows. */
export interface FlowchartScene extends SceneBase {
  type: 'flowchart';
  /** Optional red-bordered tag above the chain. */
  topTag?: string;
  steps: { text: string; bad?: boolean }[];
}

/** Title + bullets that build in one at a time. */
export interface BulletBuildScene extends SceneBase {
  type: 'bulletBuild';
  title: string;
  bullets: string[];
}

export type Scene = KineticTitleScene | FlowchartScene | BulletBuildScene;

/** Background music modes. */
export type MusicMode = 'continuous' | 'introOutro' | 'none';

/** Audio attached to a whole video. */
export interface VideoAudio {
  /** Music track URL (optional). */
  musicUrl?: string;
  /** How the music plays under the narration. */
  musicMode?: MusicMode;
}

export interface MotionVideoData {
  scenes: Scene[];
  fps: number;
  width: number;
  height: number;
}

/** Total duration of a video in frames. */
export const totalDuration = (scenes: Scene[]): number =>
  scenes.reduce((sum, s) => sum + s.durationInFrames, 0);
