/**
 * MediaScene — embeds an uploaded product screenshot or screen recording
 * inside a device frame (browser / laptop / phone / none), with an optional
 * Ken Burns zoom and annotation markers.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, staticFile, Img, OffthreadVideo } from 'remotion';
import type { BrandKit } from '../brand/brandKit';
import type { MediaScene as MediaSceneType } from '../scenes';
import { riseIn, popIn, kenBurns, tailFade } from '../anim';

interface Props {
  scene: MediaSceneType;
  brand: BrandKit;
}

const resolveSrc = (url: string): string =>
  url.startsWith('http') || url.startsWith('data:') ? url : staticFile(url);

export const MediaScene: React.FC<Props> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const sceneFade = tailFade(frame, scene.durationInFrames);
  const frameIn = riseIn(frame, 0, brand, 50, 22);
  const caption = riseIn(frame, 20, brand, 24, 16);

  // The media element, with optional Ken Burns drift.
  const mediaTransform = scene.kenBurns
    ? kenBurns(frame, scene.durationInFrames)
    : 'none';
  const media =
    scene.mediaType === 'video' ? (
      <OffthreadVideo
        src={resolveSrc(scene.mediaUrl)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: mediaTransform }}
      />
    ) : (
      <Img
        src={resolveSrc(scene.mediaUrl)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: mediaTransform }}
      />
    );

  // Device chrome wrapper.
  const renderFramed = (): React.ReactNode => {
    if (scene.frame === 'browser') {
      return (
        <div
          style={{
            borderRadius: 16,
            overflow: 'hidden',
            boxShadow: '0 40px 90px -30px rgba(20,30,70,0.55)',
            background: '#fff',
            width: '78%',
          }}
        >
          <div
            style={{
              height: 52,
              background: brand.panel,
              display: 'flex',
              alignItems: 'center',
              padding: '0 22px',
              gap: 10,
            }}
          >
            <span style={{ width: 15, height: 15, borderRadius: '50%', background: '#ff5f57' }} />
            <span style={{ width: 15, height: 15, borderRadius: '50%', background: '#febc2e' }} />
            <span style={{ width: 15, height: 15, borderRadius: '50%', background: '#28c840' }} />
            <div
              style={{
                marginLeft: 18,
                flex: 1,
                height: 30,
                background: brand.background,
                borderRadius: 15,
              }}
            />
          </div>
          <div style={{ aspectRatio: '16 / 9', overflow: 'hidden' }}>{media}</div>
        </div>
      );
    }
    if (scene.frame === 'phone') {
      return (
        <div
          style={{
            width: 360,
            height: 740,
            background: brand.ink,
            borderRadius: 54,
            padding: 14,
            boxShadow: '0 40px 90px -28px rgba(20,30,70,0.6)',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 14,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 130,
              height: 26,
              background: brand.ink,
              borderRadius: '0 0 16px 16px',
              zIndex: 2,
            }}
          />
          <div style={{ width: '100%', height: '100%', borderRadius: 42, overflow: 'hidden' }}>
            {media}
          </div>
        </div>
      );
    }
    if (scene.frame === 'laptop') {
      return (
        <div style={{ width: '76%' }}>
          <div
            style={{
              background: brand.ink,
              borderRadius: '18px 18px 0 0',
              padding: 14,
              boxShadow: '0 40px 80px -34px rgba(20,30,70,0.55)',
            }}
          >
            <div style={{ aspectRatio: '16 / 10', borderRadius: 8, overflow: 'hidden' }}>
              {media}
            </div>
          </div>
          <div
            style={{
              height: 26,
              background: brand.muted,
              borderRadius: '0 0 22px 22px',
              margin: '0 -7%',
            }}
          />
        </div>
      );
    }
    // none
    return (
      <div
        style={{
          width: '80%',
          aspectRatio: '16 / 9',
          borderRadius: brand.radius + 8,
          overflow: 'hidden',
          boxShadow: '0 40px 90px -30px rgba(20,30,70,0.5)',
        }}
      >
        {media}
      </div>
    );
  };

  return (
    <AbsoluteFill
      style={{
        backgroundColor: brand.panel,
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: brand.bodyFont,
        opacity: sceneFade,
        flexDirection: 'column',
        gap: 36,
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          justifyContent: 'center',
          width: '100%',
          opacity: frameIn.opacity,
          transform: `translateY(${frameIn.translateY}px)`,
        }}
      >
        {renderFramed()}

        {/* Annotation markers, positioned over the whole stage. */}
        {(scene.annotations || []).map((a, i) => {
          const mark = popIn(frame, 24 + i * 10, brand);
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${a.x * 100}%`,
                top: `${a.y * 100}%`,
                transform: `translate(-50%, -50%) scale(${mark.scale})`,
                opacity: mark.opacity,
              }}
            >
              <div
                style={{
                  background: brand.accent,
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 24,
                  padding: '10px 20px',
                  borderRadius: 30,
                  whiteSpace: 'nowrap',
                  boxShadow: `0 12px 24px -8px ${brand.accent}cc`,
                }}
              >
                {a.label}
              </div>
            </div>
          );
        })}
      </div>

      {scene.caption && (
        <div
          style={{
            fontFamily: brand.headingFont,
            fontWeight: 800,
            fontSize: 40,
            color: brand.ink,
            textAlign: 'center',
            padding: '0 8%',
            opacity: caption.opacity,
            transform: `translateY(${caption.translateY}px)`,
          }}
        >
          {scene.caption}
        </div>
      )}
    </AbsoluteFill>
  );
};
