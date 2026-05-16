/**
 * Remotion root — registers the compositions.
 *
 * `MotionVideoDynamic` is the composition the server renders: it takes
 * inputProps validated by the Zod schema, and derives its total duration
 * from the per-scene durations (minus transition overlaps) via calculateMetadata.
 *
 * The sample compositions are kept for Studio preview / visual QA.
 */
import React from 'react';
import { Composition } from 'remotion';
import { MotionVideo } from './MotionVideo';
import {
  SAMPLE_SCENES,
  BRAND_JOBA,
  BRAND_ALT,
  BRAND_JOBINTEL,
  SCENES_JOBINTEL,
  SHOWCASE_SCENES,
} from './sample';
import { totalDurationWithTransitions } from './scenes';
import { motionVideoPropsSchema } from './schema';

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* The composition the server renders — duration derived from inputProps. */}
      <Composition
        id="MotionVideoDynamic"
        component={MotionVideo}
        schema={motionVideoPropsSchema}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          scenes: SHOWCASE_SCENES,
          brand: BRAND_JOBA,
          audio: { musicMode: 'continuous' as const },
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: totalDurationWithTransitions(props.scenes),
        })}
      />

      {/* Showcase — one of every scene type + transitions, for visual QA. */}
      <Composition
        id="Showcase"
        component={MotionVideo}
        durationInFrames={totalDurationWithTransitions(SHOWCASE_SCENES)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ scenes: SHOWCASE_SCENES, brand: BRAND_JOBA }}
      />

      {/* Static sample compositions for Studio preview. */}
      <Composition
        id="MotionVideo"
        component={MotionVideo}
        durationInFrames={totalDurationWithTransitions(SAMPLE_SCENES)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ scenes: SAMPLE_SCENES, brand: BRAND_JOBA }}
      />
      <Composition
        id="MotionVideoAltBrand"
        component={MotionVideo}
        durationInFrames={totalDurationWithTransitions(SAMPLE_SCENES)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ scenes: SAMPLE_SCENES, brand: BRAND_ALT }}
      />
      <Composition
        id="JobIntel360"
        component={MotionVideo}
        durationInFrames={totalDurationWithTransitions(SCENES_JOBINTEL)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ scenes: SCENES_JOBINTEL, brand: BRAND_JOBINTEL }}
      />
    </>
  );
};
