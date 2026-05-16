/**
 * BulletBuild — a title with bullet points that build in one at a time.
 * Each bullet gets a brand-colored marker that pops, then the text slides in.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { BrandKit } from '../brand/brandKit';
import type { BulletBuildScene } from '../scenes';
import { riseIn, popIn, growWidth, tailFade } from '../anim';

interface Props {
  scene: BulletBuildScene;
  brand: BrandKit;
}

export const BulletBuild: React.FC<Props> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const sceneFade = tailFade(frame, scene.durationInFrames);

  const title = riseIn(frame, 0, brand);
  const underlineW = growWidth(frame, 10, brand, 100, 18);
  const bulletGap = 20; // frames between bullets

  return (
    <AbsoluteFill
      style={{
        backgroundColor: brand.background,
        justifyContent: 'center',
        fontFamily: brand.bodyFont,
        opacity: sceneFade,
        padding: '0 12%',
      }}
    >
      {/* Title */}
      <div
        style={{
          fontFamily: brand.headingFont,
          fontWeight: 900,
          fontSize: 64,
          color: brand.ink,
          letterSpacing: '-0.02em',
          opacity: title.opacity,
          transform: `translateY(${title.translateY}px)`,
        }}
      >
        {scene.title}
      </div>
      <div
        style={{
          height: 8,
          width: `${underlineW * 0.34}%`,
          background: brand.accent,
          borderRadius: 6,
          margin: '18px 0 44px',
        }}
      />

      {/* Bullets */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
        {scene.bullets.map((b, i) => {
          const start = 16 + i * bulletGap;
          const marker = popIn(frame, start, brand);
          const text = riseIn(frame, start + 4, brand, 24, 18);
          return (
            <div
              key={i}
              style={{ display: 'flex', alignItems: 'center', gap: 26 }}
            >
              <div
                style={{
                  flexShrink: 0,
                  width: 46,
                  height: 46,
                  borderRadius: 12,
                  background: brand.primary,
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 24,
                  fontFamily: brand.headingFont,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: marker.opacity,
                  transform: `scale(${marker.scale})`,
                }}
              >
                {i + 1}
              </div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 40,
                  color: brand.ink,
                  opacity: text.opacity,
                  transform: `translateY(${text.translateY}px)`,
                }}
              >
                {b}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
