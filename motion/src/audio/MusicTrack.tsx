/**
 * MusicTrack — background music for the whole video.
 *
 * Rendered once at the composition root so it spans every scene. Volume is a
 * frame-varying function so music ducks under the narration:
 *  - continuous : low constant bed (~0.16) the whole way through
 *  - introOutro : louder during the first/last few seconds, ducked in the
 *                 middle where narration is densest
 *  - none       : not rendered
 *
 * The track loops if it is shorter than the video.
 */
import React from 'react';
import { Audio, interpolate, useVideoConfig } from 'remotion';
import type { MusicMode } from '../scenes';

interface Props {
  src?: string;
  mode?: MusicMode;
}

const BED = 0.16; // ducked level under narration
const PEAK = 0.5; // intro/outro level

export const MusicTrack: React.FC<Props> = ({ src, mode = 'continuous' }) => {
  const { durationInFrames, fps } = useVideoConfig();

  if (!src || mode === 'none') return null;

  if (mode === 'continuous') {
    return <Audio src={src} volume={BED} loop />;
  }

  // introOutro: ramp up at the head and tail, duck through the middle.
  const ramp = Math.min(fps * 2.5, durationInFrames / 3); // ~2.5s ramps
  const volume = (frame: number) =>
    interpolate(
      frame,
      [0, ramp, durationInFrames - ramp, durationInFrames],
      [PEAK, BED, BED, PEAK],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
    );

  return <Audio src={src} volume={volume} loop />;
};
