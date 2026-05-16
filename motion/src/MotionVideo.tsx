/**
 * MotionVideo — the top-level composition.
 * Plays a list of Scenes back-to-back via Remotion's <Series>. Each scene's
 * template is selected by its `type`. The whole video is themed by one
 * BrandKit so it renders on-brand for any client.
 *
 * Audio: a single <MusicTrack> spans the whole video; each scene's narration
 * MP3 is played by a <SceneAudio> inside that scene's Sequence. Remotion
 * mixes all audio into the MP4 at render time.
 */
import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import type { BrandKit } from './brand/brandKit';
import { resolveBrand } from './brand/brandKit';
import type { Scene, VideoAudio } from './scenes';
import { KineticTitle } from './templates/KineticTitle';
import { Flowchart } from './templates/Flowchart';
import { BulletBuild } from './templates/BulletBuild';
import { SceneAudio } from './audio/SceneAudio';
import { MusicTrack } from './audio/MusicTrack';

export type MotionVideoProps = {
  scenes: Scene[];
  brand: Partial<BrandKit>;
  audio?: VideoAudio;
};

/** Map a scene to its template component. */
const SceneRenderer: React.FC<{ scene: Scene; brand: BrandKit }> = ({
  scene,
  brand,
}) => {
  switch (scene.type) {
    case 'kineticTitle':
      return <KineticTitle scene={scene} brand={brand} />;
    case 'flowchart':
      return <Flowchart scene={scene} brand={brand} />;
    case 'bulletBuild':
      return <BulletBuild scene={scene} brand={brand} />;
    default:
      return null;
  }
};

export const MotionVideo: React.FC<MotionVideoProps> = ({
  scenes,
  brand,
  audio,
}) => {
  const resolved = resolveBrand(brand);
  return (
    <AbsoluteFill style={{ backgroundColor: resolved.background }}>
      {/* Background music spans the whole video. */}
      <MusicTrack src={audio?.musicUrl} mode={audio?.musicMode} />

      <Series>
        {scenes.map((scene, i) => (
          <Series.Sequence key={i} durationInFrames={scene.durationInFrames}>
            <SceneRenderer scene={scene} brand={resolved} />
            <SceneAudio src={scene.audioUrl} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
