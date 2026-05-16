/**
 * CtaEndCard — closing call-to-action card. Optional logo, headline, subline,
 * a brand-colored CTA button, and an optional URL.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, staticFile, Img } from 'remotion';
import type { BrandKit } from '../brand/brandKit';
import type { CtaEndCardScene } from '../scenes';
import { riseIn, popIn, fadeIn, tailFade } from '../anim';

interface Props {
  scene: CtaEndCardScene;
  brand: BrandKit;
}

export const CtaEndCard: React.FC<Props> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const sceneFade = tailFade(frame, scene.durationInFrames);
  const logo = popIn(frame, 0, brand);
  const headline = riseIn(frame, scene.showLogo ? 12 : 0, brand);
  const sub = riseIn(frame, 22, brand, 28, 18);
  const button = popIn(frame, 34, brand);
  const url = fadeIn(frame, 46, 16);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: brand.background,
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: brand.headingFont,
        opacity: sceneFade,
        padding: '0 9%',
      }}
    >
      {/* Soft accent glow behind everything */}
      <div
        style={{
          position: 'absolute',
          width: '130%',
          height: '130%',
          background: `radial-gradient(circle at 50% 52%, ${brand.accent}1f, transparent 46%)`,
        }}
      />
      <div style={{ textAlign: 'center', zIndex: 2 }}>
        {scene.showLogo && brand.logoUrl && (
          <Img
            src={
              brand.logoUrl.startsWith('http') || brand.logoUrl.startsWith('data:')
                ? brand.logoUrl
                : staticFile(brand.logoUrl)
            }
            style={{
              display: 'block',
              height: 120,
              margin: '0 auto 40px',
              objectFit: 'contain',
              opacity: logo.opacity,
              transform: `translateY(${logo.translateY}px) scale(${logo.scale})`,
            }}
          />
        )}
        <div
          style={{
            fontWeight: 900,
            fontSize: 88,
            lineHeight: 1.08,
            letterSpacing: '-0.025em',
            color: brand.ink,
            opacity: headline.opacity,
            transform: `translateY(${headline.translateY}px)`,
            textShadow: '0 20px 36px rgba(0,0,0,0.10)',
          }}
        >
          {scene.headline}
        </div>
        {scene.sub && (
          <div
            style={{
              fontFamily: brand.bodyFont,
              fontWeight: 500,
              fontSize: 34,
              color: brand.muted,
              marginTop: 20,
              opacity: sub.opacity,
              transform: `translateY(${sub.translateY}px)`,
            }}
          >
            {scene.sub}
          </div>
        )}
        <div
          style={{
            display: 'inline-block',
            marginTop: 44,
            background: brand.accent,
            color: '#fff',
            fontWeight: 800,
            fontSize: 38,
            padding: '22px 52px',
            borderRadius: brand.radius + 6,
            boxShadow: `0 20px 40px -14px ${brand.accent}aa`,
            opacity: button.opacity,
            transform: `translateY(${button.translateY}px) scale(${button.scale})`,
          }}
        >
          {scene.cta}
        </div>
        {scene.url && (
          <div
            style={{
              fontFamily: brand.bodyFont,
              fontWeight: 600,
              fontSize: 28,
              color: brand.primary,
              marginTop: 26,
              opacity: url,
            }}
          >
            {scene.url}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
