/**
 * server/sceneDirector.ts — the AI Scene Director.
 *
 * Turns source content (a script, an extracted document, or a webpage's text)
 * into a motion-video scene list: it picks a template per beat, writes the
 * on-screen copy and the spoken `narration`.
 *
 * Exports:
 *  - buildDirectorPrompt() — the LLM prompt (template catalog + rules)
 *  - sanitizeScenes()      — JS-level validation/repair of the model's JSON
 *
 * The endpoint in server/index.ts runs the prompt through the standard
 * Gemini -> OpenAI fallback. Full Zod validation happens later at Lambda
 * render time (the composition's schema); this sanitizer just guarantees the
 * scenes are structurally sane so the render does not fail.
 */

/** Scene types the director may emit (every type except `media`, which needs
 *  an uploaded asset and is added by the user, not the AI). */
const DIRECTOR_TYPES = [
  'kineticTitle',
  'flowchart',
  'bulletBuild',
  'statCountUp',
  'beforeAfter',
  'numberedSteps',
  'quoteCard',
  'checklist',
  'timeline',
  'ctaEndCard',
] as const;

/** Human-readable catalog given to the model. */
const TEMPLATE_CATALOG = `
SCENE TEMPLATES (pick the one that best fits each beat):

1. kineticTitle — a big animated headline. Best for the opening hook and
   section breaks. JSON: { "type":"kineticTitle", "lines":[{"text":"first line"},{"text":"second line","accent":"a word"}], "narration":"spoken line" }
   1-2 lines, each under ~6 words. The optional "accent" must be an EXACT word
   or phrase copied from that same line's "text" — it gets colored. Omit
   "accent" entirely if you don't want a highlight. Never invent placeholder text.

2. flowchart — a problem/consequence chain. Best for showing how a problem
   cascades. JSON: { "type":"flowchart", "topTag":"short warning label",
   "steps":[{"text":"...","bad":true for the final/worst step}], "narration":"..." }
   2-5 steps, each 1-4 words.

3. bulletBuild — a title with bullet points. Best for listing benefits/features.
   JSON: { "type":"bulletBuild", "title":"...", "bullets":["...","..."], "narration":"..." }
   1-6 bullets, each under ~8 words.

4. statCountUp — a big number that counts up. Best for a striking statistic.
   JSON: { "type":"statCountUp", "value":73, "suffix":"%", "prefix":"$ optional",
   "label":"what the number means", "caption":"optional source", "narration":"..." }

5. beforeAfter — a two-column comparison. JSON: { "type":"beforeAfter",
   "before":{"heading":"Before","points":["...","..."]},
   "after":{"heading":"After","points":["...","..."]}, "narration":"..." }
   1-5 points per side.

6. numberedSteps — a numbered how-to sequence. JSON: { "type":"numberedSteps",
   "title":"optional", "steps":[{"title":"step name","detail":"optional short detail"}], "narration":"..." }
   2-5 steps.

7. quoteCard — a pulled quote. JSON: { "type":"quoteCard", "quote":"...",
   "author":"optional", "role":"optional", "narration":"..." }

8. checklist — items that check off. JSON: { "type":"checklist",
   "title":"optional", "items":["...","..."], "narration":"..." }
   2-6 items.

9. timeline — a horizontal timeline. JSON: { "type":"timeline",
   "title":"optional", "events":[{"when":"Day 1","text":"..."}], "narration":"..." }
   2-6 events.

10. ctaEndCard — the closing call-to-action. ALWAYS use this as the last scene.
    JSON: { "type":"ctaEndCard", "headline":"...", "sub":"optional", "cta":"button text",
    "url":"optional", "narration":"..." }
`.trim();

/** Build the LLM prompt for the Scene Director. */
export function buildDirectorPrompt(
  sourceText: string,
  focusInstructions: string | undefined,
  brandName: string | undefined,
): string {
  const focus = focusInstructions?.trim()
    ? `\nFOCUS INSTRUCTIONS FROM THE USER (obey these — they say what to emphasize or skip):\n"${focusInstructions.trim()}"\n`
    : '';
  const brand = brandName?.trim() ? ` for "${brandName.trim()}"` : '';
  return `You are a motion-graphics video director${brand}. Turn the SOURCE CONTENT below
into a punchy animated explainer video — a list of 5 to 9 scenes.

${TEMPLATE_CATALOG}

RULES:
- Open with a kineticTitle hook. Close with a ctaEndCard.
- Vary the templates — do not use the same type twice in a row.
- Every scene MUST have a "narration" field: one or two natural spoken
  sentences for that scene. The narration is what the voiceover says; the
  on-screen copy fields are short and punchy, NOT the same as the narration.
- Keep all on-screen text short. Long sentences belong only in narration.
- Use statCountUp only when the source has a real number worth featuring.
- Return ONLY JSON, no prose, in exactly this shape:
  { "scenes": [ { ...scene... }, ... ] }
${focus}
SOURCE CONTENT:
${sourceText.slice(0, 40000)}`;
}

type AnyScene = Record<string, any>;

/** Clamp an array to a length range, returning undefined if too short. */
const clampArray = <T>(arr: T[] | undefined, min: number, max: number): T[] | null => {
  if (!Array.isArray(arr) || arr.length < min) return null;
  return arr.slice(0, max);
};

/**
 * JS-level validation/repair. Drops scenes that can't be salvaged, fills a
 * default `durationInFrames` (the render pipeline overrides it from narration),
 * and clamps oversized arrays. Returns a clean scene array.
 */
export function sanitizeScenes(raw: any): AnyScene[] {
  const list: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.scenes)
      ? raw.scenes
      : [];
  const out: AnyScene[] = [];

  for (const s of list) {
    if (!s || typeof s !== 'object') continue;
    const type = String(s.type || '');
    if (!DIRECTOR_TYPES.includes(type as any)) continue;

    const base: AnyScene = {
      type,
      durationInFrames: 90, // placeholder; server derives the real value from narration
      narration: typeof s.narration === 'string' ? s.narration : '',
    };
    if (typeof s.transition === 'string') base.transition = s.transition;

    let scene: AnyScene | null = null;
    switch (type) {
      case 'kineticTitle': {
        const lines = clampArray(s.lines, 1, 3);
        if (lines) {
          // Keep `accent` only when it's a real substring of the line's text —
          // the model sometimes copies the prompt's placeholder text.
          const cleanLines = lines.map((ln: any) => {
            const text = String(ln?.text || '');
            const accent =
              typeof ln?.accent === 'string' && ln.accent && text.includes(ln.accent)
                ? ln.accent
                : undefined;
            return accent ? { text, accent } : { text };
          });
          scene = { ...base, lines: cleanLines };
        }
        break;
      }
      case 'flowchart': {
        const steps = clampArray(s.steps, 2, 5);
        if (steps) scene = { ...base, topTag: s.topTag, steps };
        break;
      }
      case 'bulletBuild': {
        const bullets = clampArray(s.bullets, 1, 6);
        if (bullets && s.title) scene = { ...base, title: String(s.title), bullets };
        break;
      }
      case 'statCountUp': {
        if (typeof s.value === 'number' && s.label) {
          scene = {
            ...base,
            value: s.value,
            prefix: s.prefix,
            suffix: s.suffix,
            label: String(s.label),
            caption: s.caption,
          };
        }
        break;
      }
      case 'beforeAfter': {
        const bp = clampArray(s.before?.points, 1, 5);
        const ap = clampArray(s.after?.points, 1, 5);
        if (bp && ap) {
          scene = {
            ...base,
            before: { heading: String(s.before?.heading || 'Before'), points: bp },
            after: { heading: String(s.after?.heading || 'After'), points: ap },
          };
        }
        break;
      }
      case 'numberedSteps': {
        const steps = clampArray(s.steps, 2, 5);
        if (steps) scene = { ...base, title: s.title, steps };
        break;
      }
      case 'quoteCard': {
        if (s.quote) scene = { ...base, quote: String(s.quote), author: s.author, role: s.role };
        break;
      }
      case 'checklist': {
        const items = clampArray(s.items, 2, 6);
        if (items) scene = { ...base, title: s.title, items };
        break;
      }
      case 'timeline': {
        const events = clampArray(s.events, 2, 6);
        if (events) scene = { ...base, title: s.title, events };
        break;
      }
      case 'ctaEndCard': {
        if (s.headline && s.cta) {
          scene = {
            ...base,
            headline: String(s.headline),
            sub: s.sub,
            cta: String(s.cta),
            url: s.url,
          };
        }
        break;
      }
    }
    if (scene) out.push(scene);
  }
  return out;
}
