/**
 * QuoteCard — a large pulled quote with a brand-colored quotation glyph and
 * an attribution line.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { BrandKit } from '../brand/brandKit';
import type { QuoteCardScene } from '../scenes';
import { riseIn, popIn, fadeIn, tailFade } from '../anim';

interface Props {
  scene: QuoteCardScene;
  brand: BrandKit;
}

export const QuoteCard: React.FC<Props> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const sceneFade = tailFade(frame, scene.durationInFrames);
  const mark = popIn(frame, 0, brand);
  const quote = riseIn(frame, 8, brand, 40, 24);
  const attribution = fadeIn(frame, 28, 16);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: brand.panel,
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: brand.headingFont,
        opacity: sceneFade,
        padding: '0 11%',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 1400 }}>
        <div
          style={{
            fontSize: 200,
            lineHeight: 0.6,
            fontWeight: 900,
            color: brand.accent,
            height: 110,
            opacity: mark.opacity,
            transform: `scale(${mark.scale})`,
          }}
        >
          &ldquo;
        </div>
        <div
          style={{
            fontWeight: 800,
            fontSize: 64,
            lineHeight: 1.25,
            letterSpacing: '-0.02em',
            color: brand.ink,
            opacity: quote.opacity,
            transform: `translateY(${quote.translateY}px)`,
          }}
        >
          {scene.quote}
        </div>
        {(scene.author || scene.role) && (
          <div style={{ marginTop: 40, opacity: attribution }}>
            <div
              style={{
                width: 56,
                height: 5,
                background: brand.accent,
                borderRadius: 4,
                margin: '0 auto 18px',
              }}
            />
            {scene.author && (
              <div style={{ fontWeight: 800, fontSize: 34, color: brand.ink }}>
                {scene.author}
              </div>
            )}
            {scene.role && (
              <div
                style={{
                  fontFamily: brand.bodyFont,
                  fontWeight: 500,
                  fontSize: 27,
                  color: brand.muted,
                  marginTop: 4,
                }}
              >
                {scene.role}
              </div>
            )}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
