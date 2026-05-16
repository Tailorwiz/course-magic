/**
 * Flowchart — vertical problem/consequence chain.
 * An optional red tag, then pill cards connected by down-arrows that pop in
 * one at a time. A "bad" pill slams in with a red fill (the payoff beat).
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { BrandKit } from '../brand/brandKit';
import type { FlowchartScene } from '../scenes';
import { popIn, fadeIn, tailFade } from '../anim';

interface Props {
  scene: FlowchartScene;
  brand: BrandKit;
}

/** Faint dotted grid background, masked to a soft vignette. */
const GridBg: React.FC<{ brand: BrandKit }> = ({ brand }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      backgroundImage: `
        linear-gradient(${brand.primary}22 1px, transparent 1px),
        linear-gradient(90deg, ${brand.primary}22 1px, transparent 1px)`,
      backgroundSize: '52px 52px',
      WebkitMaskImage:
        'radial-gradient(ellipse 70% 66% at 50% 50%, #000 32%, transparent 80%)',
      maskImage:
        'radial-gradient(ellipse 70% 66% at 50% 50%, #000 32%, transparent 80%)',
    }}
  />
);

export const Flowchart: React.FC<Props> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const sceneFade = tailFade(frame, scene.durationInFrames);

  // Stagger: tag at 0, then each (arrow + pill) pair spaced out.
  const tagAt = 0;
  const stepGap = 26; // frames between consecutive steps

  return (
    <AbsoluteFill
      style={{
        backgroundColor: brand.panel,
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: brand.bodyFont,
        opacity: sceneFade,
      }}
    >
      <GridBg brand={brand} />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          zIndex: 2,
        }}
      >
        {scene.topTag && (() => {
          const { opacity, scale, translateY } = popIn(frame, tagAt, brand);
          return (
            <div
              style={{
                background: brand.background,
                border: `2px solid ${brand.danger}`,
                color: brand.danger,
                fontWeight: 800,
                fontSize: 30,
                padding: '14px 28px',
                borderRadius: 40,
                marginBottom: 22,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                boxShadow: `0 14px 30px -10px ${brand.danger}66`,
                opacity,
                transform: `translateY(${translateY}px) scale(${scale})`,
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  border: `3px solid ${brand.danger}`,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                }}
              >
                !
              </span>
              {scene.topTag}
            </div>
          );
        })()}

        {scene.steps.map((step, i) => {
          const stepStart = (scene.topTag ? 18 : 0) + i * stepGap;
          const arrowOpacity = i === 0 ? 1 : fadeIn(frame, stepStart - 8);
          const { opacity, scale, translateY } = popIn(frame, stepStart, brand);
          return (
            <React.Fragment key={i}>
              {i > 0 && (
                <div
                  style={{
                    fontSize: 34,
                    color: brand.muted,
                    fontWeight: 800,
                    margin: '8px 0',
                    opacity: arrowOpacity,
                  }}
                >
                  &#8595;
                </div>
              )}
              <div
                style={{
                  background: step.bad ? brand.danger : brand.background,
                  color: step.bad ? '#fff' : brand.ink,
                  fontWeight: 700,
                  fontSize: 32,
                  padding: '16px 42px',
                  borderRadius: brand.radius,
                  boxShadow: step.bad
                    ? `0 20px 38px -12px ${brand.danger}99`
                    : '0 16px 32px -16px rgba(20,30,70,0.4)',
                  opacity,
                  transform: `translateY(${translateY}px) scale(${scale})`,
                }}
              >
                {step.text}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
