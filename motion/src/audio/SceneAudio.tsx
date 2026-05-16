/**
 * SceneAudio — plays a scene's narration MP3.
 *
 * Dropped inside a scene's <Series.Sequence>, so Remotion automatically
 * offsets it to start when the scene starts. Remotion mixes every <Audio>
 * in the tree into the final MP4 at render time — no ffmpeg mux needed.
 */
import React from 'react';
import { Audio } from 'remotion';

interface Props {
  /** Public URL or data URL of the narration MP3. */
  src?: string;
  /** Narration volume (0..1). Full volume by default. */
  volume?: number;
}

export const SceneAudio: React.FC<Props> = ({ src, volume = 1 }) => {
  if (!src) return null;
  return <Audio src={src} volume={volume} />;
};
