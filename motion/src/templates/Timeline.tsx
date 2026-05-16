/**
 * Timeline — a horizontal timeline. A spine line draws across, then each
 * event's node pops in and its label rises.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { BrandKit } from '../brand/brandKit';
import type { TimelineScene } from '../scenes';
import { riseIn, popIn, growWidth, tailFade } from '../anim';

interface Props {
  scene: TimelineScene;
  brand: BrandKit;
}

export const Timeline: React.FC<Props> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const sceneFade = tailFade(frame, scene.durationInFrames);
  const title = riseIn(frame, 0, brand);
  const spine = growWidth(frame, 14, brand, 100, 26);
  const hasTitle = !!scene.title;
  const eventGap = 16;
  const n = scene.events.length;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: brand.panel,
        justifyContent: 'center',
        fontFamily: brand.bodyFont,
        opacity: sceneFade,
        padding: '0 8%',
      }}
    >
      {hasTitle && (
        <div
          style={{
            fontFamily: brand.headingFont,
            fontWeight: 900,
            fontSize: 58,
            color: brand.ink,
            letterSpacing: '-0.02em',
            textAlign: 'center',
            marginBottom: 70,
            opacity: title.opacity,
            transform: `translateY(${title.translateY}px)`,
          }}
        >
          {scene.title}
        </div>
      )}

      <div style={{ position: 'relative', padding: '0 3%' }}>
        {/* Spine */}
        <div
          style={{
            position: 'absolute',
            top: 22,
            left: '3%',
            height: 6,
            width: `${spine * 0.94}%`,
            background: brand.primary,
            borderRadius: 4,
          }}
        />
        {/* Events */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {scene.events.map((ev, i) => {
            const start = 20 + i * eventGap;
            const node = popIn(frame, start, brand);
            const label = riseIn(frame, start + 6, brand, 24, 16);
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  padding: '0 12px',
                }}
              >
                <div
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: '50%',
                    background: brand.accent,
                    border: `5px solid ${brand.background}`,
                    boxShadow: `0 0 0 3px ${brand.accent}`,
                    opacity: node.opacity,
                    transform: `scale(${node.scale})`,
                  }}
                />
                <div
                  style={{
                    marginTop: 26,
                    opacity: label.opacity,
                    transform: `translateY(${label.translateY}px)`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: brand.headingFont,
                      fontWeight: 900,
                      fontSize: 30,
                      color: brand.accent,
                    }}
                  >
                    {ev.when}
                  </div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 26,
                      color: brand.ink,
                      marginTop: 8,
                      lineHeight: 1.3,
                    }}
                  >
                    {ev.text}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
