/**
 * StatCountUp — a big headline number that counts up from zero, with a label.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { BrandKit } from '../brand/brandKit';
import type { StatCountUpScene } from '../scenes';
import { countUp, riseIn, growWidth, tailFade } from '../anim';

interface Props {
  scene: StatCountUpScene;
  brand: BrandKit;
}

/** Format a number with thousands separators, keeping up to 1 decimal. */
const fmt = (n: number): string => {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded)
    ? rounded.toLocaleString('en-US')
    : rounded.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

export const StatCountUp: React.FC<Props> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const sceneFade = tailFade(frame, scene.durationInFrames);
  const current = countUp(frame, 6, scene.value, 38);
  const label = riseIn(frame, 30, brand);
  const underline = growWidth(frame, 24, brand, 100, 20);
  const caption = riseIn(frame, 44, brand, 24, 18);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: brand.background,
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: brand.headingFont,
        opacity: sceneFade,
        padding: '0 8%',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontWeight: 900,
            fontSize: 220,
            lineHeight: 1,
            letterSpacing: '-0.03em',
            color: brand.accent,
            textShadow: '0 24px 44px rgba(0,0,0,0.12)',
          }}
        >
          {scene.prefix || ''}
          {fmt(current)}
          {scene.suffix || ''}
        </div>
        <div
          style={{
            height: 9,
            width: `${underline * 0.32}%`,
            background: brand.primary,
            borderRadius: 6,
            margin: '26px auto 30px',
          }}
        />
        <div
          style={{
            fontWeight: 800,
            fontSize: 58,
            color: brand.ink,
            letterSpacing: '-0.02em',
            opacity: label.opacity,
            transform: `translateY(${label.translateY}px)`,
          }}
        >
          {scene.label}
        </div>
        {scene.caption && (
          <div
            style={{
              fontFamily: brand.bodyFont,
              fontWeight: 500,
              fontSize: 30,
              color: brand.muted,
              marginTop: 18,
              opacity: caption.opacity,
              transform: `translateY(${caption.translateY}px)`,
            }}
          >
            {scene.caption}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
