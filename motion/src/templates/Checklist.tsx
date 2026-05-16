/**
 * Checklist — a title plus items that "check off" one at a time: each row's
 * box pops in, then a checkmark fades in and the text settles.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { BrandKit } from '../brand/brandKit';
import type { ChecklistScene } from '../scenes';
import { riseIn, popIn, fadeIn, growWidth, tailFade } from '../anim';

interface Props {
  scene: ChecklistScene;
  brand: BrandKit;
}

export const Checklist: React.FC<Props> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const sceneFade = tailFade(frame, scene.durationInFrames);
  const title = riseIn(frame, 0, brand);
  const underline = growWidth(frame, 8, brand, 100, 18);
  const hasTitle = !!scene.title;
  const itemGap = 20;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: brand.background,
        justifyContent: 'center',
        fontFamily: brand.bodyFont,
        opacity: sceneFade,
        padding: '0 13%',
      }}
    >
      {hasTitle && (
        <>
          <div
            style={{
              fontFamily: brand.headingFont,
              fontWeight: 900,
              fontSize: 60,
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
              width: `${underline * 0.28}%`,
              background: brand.accent,
              borderRadius: 6,
              margin: '16px 0 42px',
            }}
          />
        </>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
        {scene.items.map((item, i) => {
          const start = (hasTitle ? 18 : 6) + i * itemGap;
          const box = popIn(frame, start, brand);
          const check = fadeIn(frame, start + 8, 8);
          const text = riseIn(frame, start + 6, brand, 22, 16);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <div
                style={{
                  flexShrink: 0,
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  background: brand.primary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 32,
                  fontWeight: 900,
                  opacity: box.opacity,
                  transform: `scale(${box.scale})`,
                  boxShadow: `0 12px 22px -10px ${brand.primary}88`,
                }}
              >
                <span style={{ opacity: check }}>✓</span>
              </div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 38,
                  color: brand.ink,
                  opacity: text.opacity,
                  transform: `translateY(${text.translateY}px)`,
                }}
              >
                {item}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
