/**
 * MotionVideo — the top-level composition.
 *
 * Plays a list of Scenes back-to-back via Remotion's <TransitionSeries>, with
 * a fade/slide/wipe transition between scenes (per-scene `transition` field;
 * 'none' = hard cut). Each scene's template is selected by its `type`.
 *
 * Audio: a single <MusicTrack> spans the whole video; each scene's narration
 * is played by a <SceneAudio> inside that scene's sequence.
 */
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import type { BrandKit } from './brand/brandKit';
import { resolveBrand } from './brand/brandKit';
import type { Scene, SceneTransition, VideoAudio } from './scenes';
import { TRANSITION_FRAMES } from './scenes';
import { KineticTitle } from './templates/KineticTitle';
import { Flowchart } from './templates/Flowchart';
import { BulletBuild } from './templates/BulletBuild';
import { StatCountUp } from './templates/StatCountUp';
import { BeforeAfter } from './templates/BeforeAfter';
import { NumberedSteps } from './templates/NumberedSteps';
import { QuoteCard } from './templates/QuoteCard';
import { Checklist } from './templates/Checklist';
import { Timeline } from './templates/Timeline';
import { CtaEndCard } from './templates/CtaEndCard';
import { MediaScene } from './templates/MediaScene';
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
    case 'statCountUp':
      return <StatCountUp scene={scene} brand={brand} />;
    case 'beforeAfter':
      return <BeforeAfter scene={scene} brand={brand} />;
    case 'numberedSteps':
      return <NumberedSteps scene={scene} brand={brand} />;
    case 'quoteCard':
      return <QuoteCard scene={scene} brand={brand} />;
    case 'checklist':
      return <Checklist scene={scene} brand={brand} />;
    case 'timeline':
      return <Timeline scene={scene} brand={brand} />;
    case 'ctaEndCard':
      return <CtaEndCard scene={scene} brand={brand} />;
    case 'media':
      return <MediaScene scene={scene} brand={brand} />;
    default:
      return null;
  }
};

/**
 * The transition presentation for a given transition kind. Return type is
 * `any` because slide/wipe/fade produce different `TransitionPresentation<T>`
 * generics that TS can't unify in a single union.
 */
const presentationFor = (t: SceneTransition): any => {
  switch (t) {
    case 'slide':
      return slide();
    case 'wipe':
      return wipe();
    case 'fade':
    default:
      return fade();
  }
};

export const MotionVideo: React.FC<MotionVideoProps> = ({
  scenes,
  brand,
  audio,
}) => {
  const resolved = resolveBrand(brand);

  // Build the TransitionSeries children: a Sequence per scene, with an
  // optional Transition before each scene after the first.
  const children: React.ReactNode[] = [];
  scenes.forEach((scene, i) => {
    if (i > 0) {
      const t: SceneTransition = scene.transition ?? 'fade';
      if (t !== 'none') {
        children.push(
          <TransitionSeries.Transition
            key={`t-${i}`}
            timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
            presentation={presentationFor(t)}
          />,
        );
      }
    }
    children.push(
      <TransitionSeries.Sequence key={`s-${i}`} durationInFrames={scene.durationInFrames}>
        <SceneRenderer scene={scene} brand={resolved} />
        <SceneAudio src={scene.audioUrl} />
      </TransitionSeries.Sequence>,
    );
  });

  return (
    <AbsoluteFill style={{ backgroundColor: resolved.background }}>
      {/* Background music spans the whole video. */}
      <MusicTrack src={audio?.musicUrl} mode={audio?.musicMode} />

      <TransitionSeries>{children}</TransitionSeries>
    </AbsoluteFill>
  );
};
