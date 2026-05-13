// P2.1: Off-thread render loop for renderVideoFromLesson.
// Receives an OffscreenCanvas + image bitmaps + timing data, draws frames at 30 fps.
// Main thread keeps the captureStream + MediaRecorder; the worker just paints pixels.
//
// Why a worker: the original main-thread loop spent 60 fps × duration drawing on the
// UI thread, freezing the page during a "Download Video" of a 5-15 min lesson.

type SceneData = {
  bitmap: ImageBitmap;
  start: number;
  end: number;
};

type StartMessage = {
  type: 'start';
  canvas: OffscreenCanvas;
  scenes: SceneData[];
  durationSec: number;
  videoWidth: number;
  videoHeight: number;
  fps: number;
};

type StopMessage = { type: 'stop' };

let cancelled = false;

self.addEventListener('message', (ev: MessageEvent<StartMessage | StopMessage>) => {
  const msg = ev.data;
  if (msg.type === 'stop') {
    cancelled = true;
    return;
  }
  if (msg.type === 'start') {
    runRender(msg).catch(err => {
      // @ts-ignore
      self.postMessage({ type: 'error', error: String(err?.message || err) });
    });
  }
});

async function runRender(opts: StartMessage) {
  const { canvas, scenes, durationSec, videoWidth, videoHeight, fps } = opts;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // @ts-ignore
    self.postMessage({ type: 'error', error: 'no 2d context' });
    return;
  }

  const startedAt = performance.now();
  const frameInterval = 1000 / fps;
  let nextFrameAt = startedAt;
  let lastReportedPct = -1;

  const drawFrame = (elapsedSec: number) => {
    // black bg
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, videoWidth, videoHeight);

    // pick the scene whose [start, end) contains elapsedSec; fall back to even split
    let scene = scenes.find(s => elapsedSec >= s.start && elapsedSec < s.end);
    if (!scene && scenes.length > 0) {
      const timePerImage = durationSec / scenes.length;
      const idx = Math.min(Math.floor(elapsedSec / timePerImage), scenes.length - 1);
      scene = scenes[Math.max(0, idx)];
    }
    if (!scene) return;

    const bitmap = scene.bitmap;
    const imgRatio = bitmap.width / bitmap.height;
    const videoRatio = videoWidth / videoHeight;

    let drawW: number, drawH: number, offsetX: number, offsetY: number;
    if (imgRatio > videoRatio) {
      drawW = videoWidth;
      drawH = videoWidth / imgRatio;
      offsetX = 0;
      offsetY = (videoHeight - drawH) / 2;
    } else {
      drawH = videoHeight;
      drawW = videoHeight * imgRatio;
      offsetX = (videoWidth - drawW) / 2;
      offsetY = 0;
    }
    ctx.drawImage(bitmap, offsetX, offsetY, drawW, drawH);
  };

  // Draw frame 0 immediately so MediaRecorder has something to capture from t=0
  drawFrame(0);
  // Tell the main thread we've drawn — main thread waits for this before starting recorder.
  // @ts-ignore
  self.postMessage({ type: 'first-frame-drawn' });

  // Then drive frames. We use setTimeout in worker land because requestAnimationFrame
  // is throttled when the page tab is hidden — this loop is real-time-bound.
  return new Promise<void>((resolve) => {
    const tick = () => {
      if (cancelled) {
        // @ts-ignore
        self.postMessage({ type: 'cancelled' });
        return resolve();
      }
      const now = performance.now();
      const elapsedSec = (now - startedAt) / 1000;

      if (elapsedSec >= durationSec) {
        drawFrame(durationSec - 0.001); // last frame
        // @ts-ignore
        self.postMessage({ type: 'done' });
        return resolve();
      }

      drawFrame(elapsedSec);

      // Progress reporting (throttled to whole percent)
      const pct = Math.floor((elapsedSec / durationSec) * 100);
      if (pct !== lastReportedPct) {
        lastReportedPct = pct;
        // @ts-ignore
        self.postMessage({ type: 'progress', pct });
      }

      // Schedule next frame
      nextFrameAt += frameInterval;
      const delay = Math.max(0, nextFrameAt - performance.now());
      setTimeout(tick, delay);
    };
    setTimeout(tick, frameInterval);
  });
}

export {}; // make TS treat as module
