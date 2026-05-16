/**
 * Motion render worker — runs a Remotion render in its own process.
 *
 * Lives inside motion/ so it resolves the @remotion/* packages from
 * motion/node_modules. The course-magic server spawns it with:
 *
 *   npx tsx motion/render-worker.ts <jobSpecPath>
 *
 * The job spec is a JSON file: { entryPoint, compositionId, inputProps, outputPath }.
 *
 * Progress + result are emitted as newline-delimited JSON on stdout so the
 * parent server can stream status without an IPC channel:
 *   {"type":"status","stage":"bundle"}
 *   {"type":"progress","value":0.42}
 *   {"type":"done","outputPath":"..."}
 *   {"type":"error","message":"..."}
 *
 * Rendering is CPU-heavy and long-running; keeping it in a subprocess means
 * the Express event loop is never blocked.
 */
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia, ensureBrowser } from '@remotion/renderer';
import * as fs from 'fs';

interface JobSpec {
  /** Absolute path to motion/src/index.ts (the Remotion entry). */
  entryPoint: string;
  /** Composition id to render (MotionVideoDynamic). */
  compositionId: string;
  /** Validated inputProps for the composition. */
  inputProps: Record<string, unknown>;
  /** Absolute path the MP4 should be written to. */
  outputPath: string;
}

const emit = (msg: Record<string, unknown>): void => {
  process.stdout.write(JSON.stringify(msg) + '\n');
};

async function main(): Promise<void> {
  const specPath = process.argv[2];
  if (!specPath) throw new Error('No job spec path provided');
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf-8')) as JobSpec;

  // 1. Ensure a headless browser is available (downloads on first run).
  emit({ type: 'status', stage: 'browser' });
  await ensureBrowser();

  // 2. Bundle the Remotion project.
  emit({ type: 'status', stage: 'bundle' });
  const serveUrl = await bundle({
    entryPoint: spec.entryPoint,
    // Keep webpack output quiet; progress is coarse-grained here.
    onProgress: () => undefined,
  });

  // 3. Select the composition — calculateMetadata derives the duration
  //    from the per-scene durations in inputProps.
  emit({ type: 'status', stage: 'composition' });
  const composition = await selectComposition({
    serveUrl,
    id: spec.compositionId,
    inputProps: spec.inputProps,
  });

  // 4. Render.
  emit({ type: 'status', stage: 'render', durationInFrames: composition.durationInFrames });
  let lastReported = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: spec.outputPath,
    inputProps: spec.inputProps,
    // 1080p tuned for reasonable file size (Supabase 50MB bucket limit).
    crf: 23,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 100);
      if (pct !== lastReported) {
        lastReported = pct;
        emit({ type: 'progress', value: progress });
      }
    },
  });

  emit({ type: 'done', outputPath: spec.outputPath });
}

main().catch((err: unknown) => {
  emit({
    type: 'error',
    message: String((err as Error)?.message || err).slice(0, 500),
  });
  process.exit(1);
});
