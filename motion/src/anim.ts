/**
 * Animation helpers shared across scene templates.
 * Thin wrappers over Remotion's interpolate/spring with brand-aware easing.
 */
import { interpolate, Easing } from 'remotion';
import type { BrandKit } from './brand/brandKit';
import { toneEasing } from './brand/brandKit';

/** Rise + fade in: returns {opacity, translateY} for an element entering. */
export const riseIn = (
  frame: number,
  startAt: number,
  brand: BrandKit,
  distance = 46,
  durationInFrames = 22,
) => {
  const [a, b, c, d] = toneEasing(brand.tone);
  const t = interpolate(frame, [startAt, startAt + durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(a, b, c, d),
  });
  return { opacity: t, translateY: (1 - t) * distance };
};

/** Pop in with a slight scale — used for cards/pills. */
export const popIn = (
  frame: number,
  startAt: number,
  brand: BrandKit,
  durationInFrames = 18,
) => {
  const [a, b, c, d] = toneEasing(brand.tone);
  const t = interpolate(frame, [startAt, startAt + durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(a, b, c, d),
  });
  // bold tone overshoots scale slightly for a punchy feel
  const overshoot = brand.tone === 'bold' ? 0.06 : 0;
  const scale =
    t < 1
      ? 0.9 + t * (0.1 + overshoot)
      : 1; // settle exactly at 1 once finished
  return { opacity: Math.min(t, 1), scale, translateY: (1 - t) * 20 };
};

/** Simple fade in over a window. */
export const fadeIn = (
  frame: number,
  startAt: number,
  durationInFrames = 14,
) =>
  interpolate(frame, [startAt, startAt + durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

/** Width grow 0 -> target%, for underlines / progress accents. */
export const growWidth = (
  frame: number,
  startAt: number,
  brand: BrandKit,
  targetPct = 46,
  durationInFrames = 20,
) => {
  const [a, b, c, d] = toneEasing(brand.tone);
  return interpolate(frame, [startAt, startAt + durationInFrames], [0, targetPct], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(a, b, c, d),
  });
};

/** Count a number from 0 -> value with eased ramp (for stat callouts). */
export const countUp = (
  frame: number,
  startAt: number,
  value: number,
  durationInFrames = 34,
) => {
  const t = interpolate(frame, [startAt, startAt + durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  return value * t;
};

/** Gentle fade-out at the tail of a scene so cuts aren't hard. */
export const tailFade = (
  frame: number,
  sceneDuration: number,
  fadeFrames = 12,
) =>
  interpolate(frame, [sceneDuration - fadeFrames, sceneDuration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
