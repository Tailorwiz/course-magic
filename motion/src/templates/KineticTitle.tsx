/**
 * KineticTitle — big animated headline.
 * Lines rise + fade in with a stagger; an optional accent substring is
 * painted in the brand accent color. Optionally shows a faint UI mock behind.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, staticFile, Img } from 'remotion';
import type { BrandKit } from '../brand/brandKit';
import type { KineticTitleScene, KineticLine } from '../scenes';
import { riseIn, popIn, tailFade } from '../anim';

interface Props {
  scene: KineticTitleScene;
  brand: BrandKit;
}

/** Split a line so the accent substring can be colored separately. */
const renderLine = (line: KineticLine, accentColor: string): React.ReactNode => {
  if (!line.accent || !line.text.includes(line.accent)) return line.text;
  const idx = line.text.indexOf(line.accent);
  return (
    <>
      {line.text.slice(0, idx)}
      <span style={{ color: accentColor }}>{line.accent}</span>
      {line.text.slice(idx + line.accent.length)}
    </>
  );
};

export const KineticTitle: React.FC<Props> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const sceneFade = tailFade(frame, scene.durationInFrames);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: brand.background,
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: brand.headingFont,
        opacity: sceneFade,
      }}
    >
      {scene.showMock && (
        <div
          style={{
            position: 'absolute',
            top: '9%',
            left: '10%',
            right: '10%',
            opacity: 0.14,
            color: brand.ink,
            fontSize: 26,
            fontFamily: brand.bodyFont,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 10 }}>
            Best tools for your niche (2026)
          </div>
          <div>1. Competitor A</div>
          <div>2. Competitor B</div>
          <div>3. Competitor C</div>
          <div
            style={{
              float: 'right',
              background: brand.panel,
              borderRadius: 18,
              padding: '12px 22px',
              marginTop: 16,
            }}
          >
            Which platform is best?
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', padding: '0 7%', zIndex: 2 }}>
        {scene.showLogo && brand.logoUrl && (() => {
          const { opacity, scale, translateY } = popIn(frame, 0, brand);
          return (
            <Img
              src={
                brand.logoUrl.startsWith('http') || brand.logoUrl.startsWith('data:')
                  ? brand.logoUrl
                  : staticFile(brand.logoUrl)
              }
              style={{
                display: 'block',
                height: 160,
                margin: '0 auto 56px',
                objectFit: 'contain',
                opacity,
                transform: `translateY(${translateY}px) scale(${scale})`,
              }}
            />
          );
        })()}
        {scene.lines.map((line, i) => {
          // When a logo is shown, stagger the headline lines after it.
          const baseDelay = scene.showLogo ? 12 : 0;
          const { opacity, translateY } = riseIn(frame, baseDelay + i * 14, brand);
          return (
            <div
              key={i}
              style={{
                fontWeight: 900,
                letterSpacing: '-0.02em',
                lineHeight: 1.07,
                fontSize: 96,
                color: brand.ink,
                opacity,
                transform: `translateY(${translateY}px)`,
                textShadow: '0 22px 38px rgba(0,0,0,0.10)',
              }}
            >
              {renderLine(line, brand.accent)}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
