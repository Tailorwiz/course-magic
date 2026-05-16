/**
 * BeforeAfter — a two-column comparison. The left ("before") column slides in
 * first in muted/danger tones; the right ("after") column follows in brand tones.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { BrandKit } from '../brand/brandKit';
import type { BeforeAfterScene } from '../scenes';
import { riseIn, popIn, tailFade } from '../anim';

interface Props {
  scene: BeforeAfterScene;
  brand: BrandKit;
}

const Column: React.FC<{
  heading: string;
  points: string[];
  brand: BrandKit;
  frame: number;
  startAt: number;
  variant: 'before' | 'after';
}> = ({ heading, points, brand, frame, startAt, variant }) => {
  const isAfter = variant === 'after';
  const accentColor = isAfter ? brand.primary : brand.danger;
  const head = riseIn(frame, startAt, brand);
  return (
    <div
      style={{
        flex: 1,
        background: brand.background,
        border: `2px solid ${accentColor}33`,
        borderRadius: brand.radius + 6,
        padding: '44px 40px',
        boxShadow: '0 24px 50px -24px rgba(20,30,70,0.3)',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
          background: `${accentColor}15`,
          color: accentColor,
          fontWeight: 800,
          fontSize: 30,
          padding: '10px 22px',
          borderRadius: 30,
          marginBottom: 30,
          opacity: head.opacity,
          transform: `translateY(${head.translateY}px)`,
        }}
      >
        <span style={{ fontSize: 26 }}>{isAfter ? '✓' : '✗'}</span>
        {heading}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {points.map((p, i) => {
          const item = popIn(frame, startAt + 12 + i * 12, brand);
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 16,
                fontFamily: brand.bodyFont,
                fontWeight: 600,
                fontSize: 32,
                color: brand.ink,
                opacity: item.opacity,
                transform: `translateY(${item.translateY}px) scale(${item.scale})`,
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: accentColor,
                  marginTop: 12,
                }}
              />
              {p}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const BeforeAfter: React.FC<Props> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const sceneFade = tailFade(frame, scene.durationInFrames);
  return (
    <AbsoluteFill
      style={{
        backgroundColor: brand.panel,
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: brand.headingFont,
        opacity: sceneFade,
        padding: '0 7%',
      }}
    >
      <div style={{ display: 'flex', gap: 44, width: '100%', alignItems: 'stretch' }}>
        <Column
          heading={scene.before.heading}
          points={scene.before.points}
          brand={brand}
          frame={frame}
          startAt={0}
          variant="before"
        />
        <Column
          heading={scene.after.heading}
          points={scene.after.points}
          brand={brand}
          frame={frame}
          startAt={18}
          variant="after"
        />
      </div>
    </AbsoluteFill>
  );
};
