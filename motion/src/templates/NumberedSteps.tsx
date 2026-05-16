/**
 * NumberedSteps — a sequence of numbered steps that build in one at a time,
 * each with a big brand-colored number chip and an optional detail line.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { BrandKit } from '../brand/brandKit';
import type { NumberedStepsScene } from '../scenes';
import { riseIn, popIn, growWidth, tailFade } from '../anim';

interface Props {
  scene: NumberedStepsScene;
  brand: BrandKit;
}

export const NumberedSteps: React.FC<Props> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const sceneFade = tailFade(frame, scene.durationInFrames);
  const title = riseIn(frame, 0, brand);
  const underline = growWidth(frame, 8, brand, 100, 18);
  const hasTitle = !!scene.title;
  const stepGap = 22;

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
      {hasTitle && (
        <>
          <div
            style={{
              fontFamily: brand.headingFont,
              fontWeight: 900,
              fontSize: 62,
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
              width: `${underline * 0.3}%`,
              background: brand.accent,
              borderRadius: 6,
              margin: '16px 0 40px',
            }}
          />
        </>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {scene.steps.map((step, i) => {
          const start = (hasTitle ? 18 : 6) + i * stepGap;
          const chip = popIn(frame, start, brand);
          const text = riseIn(frame, start + 5, brand, 26, 18);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
              <div
                style={{
                  flexShrink: 0,
                  width: 76,
                  height: 76,
                  borderRadius: brand.radius,
                  background: brand.primary,
                  color: '#fff',
                  fontFamily: brand.headingFont,
                  fontWeight: 900,
                  fontSize: 40,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: chip.opacity,
                  transform: `scale(${chip.scale})`,
                  boxShadow: `0 14px 26px -10px ${brand.primary}88`,
                }}
              >
                {i + 1}
              </div>
              <div
                style={{
                  opacity: text.opacity,
                  transform: `translateY(${text.translateY}px)`,
                }}
              >
                <div
                  style={{
                    fontFamily: brand.headingFont,
                    fontWeight: 800,
                    fontSize: 40,
                    color: brand.ink,
                  }}
                >
                  {step.title}
                </div>
                {step.detail && (
                  <div style={{ fontWeight: 500, fontSize: 28, color: brand.muted, marginTop: 4 }}>
                    {step.detail}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
