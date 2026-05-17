/**
 * server/sceneDirector.ts — the AI Scene Director.
 *
 * This is a TWO-STAGE pipeline. Source content never becomes scenes directly:
 *
 *  Stage 1 — SCRIPTWRITER (buildScriptPrompt):
 *    Reads ALL of the source content (a document, a crawled website, or a
 *    topic brief) and writes the COMPLETE spoken narration script — start to
 *    finish — before any scene exists. The user reviews/edits this script.
 *
 *  Stage 2 — DIRECTOR (buildDirectorPrompt):
 *    Takes the FINISHED, approved script and segments it into ordered beats.
 *    Each beat's narration is a verbatim slice of the script. For each beat it
 *    picks the scene template that genuinely FITS that content (fit over
 *    variety — repeating a template is fine) and writes the short on-screen
 *    copy.
 *
 * Exports:
 *  - buildScriptPrompt()   — Stage 1 LLM prompt (write the full script)
 *  - buildDirectorPrompt() — Stage 2 LLM prompt (segment script -> scenes)
 *  - sanitizeScenes()      — JS-level validation/repair of the model's JSON
 *
 * The endpoints in server/index.ts run each prompt through the standard
 * Gemini -> OpenAI fallback. Full Zod validation happens later at Lambda
 * render time (the composition's schema); this sanitizer just guarantees the
 * scenes are structurally sane so the render does not fail.
 */

/** Text scene types the director picks freely. `media` is handled separately
 *  in sanitizeScenes — it is only allowed with a real, provided image URL. */
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
SCENE TEMPLATES (pick the one that best FITS each beat):

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

export interface ScriptPromptOptions {
  /** Approximate spoken length to target, in minutes. Omit for a tight default. */
  targetMinutes?: number;
  /** True when the "source" is only a topic brief (the AI-writes-it mode),
   *  rather than real source content the script must stay faithful to. */
  fromTopic?: boolean;
}

/**
 * Stage 1 — the SCRIPTWRITER prompt.
 *
 * Tells the model to read the whole source and write the complete spoken
 * narration script. No scenes, no templates, no visuals at this stage.
 */
export function buildScriptPrompt(
  sourceText: string,
  focusInstructions: string | undefined,
  brandName: string | undefined,
  options: ScriptPromptOptions = {},
): string {
  const { targetMinutes, fromTopic } = options;

  const focus = focusInstructions?.trim()
    ? `\nFOCUS INSTRUCTIONS FROM THE USER (these OVERRIDE the default — obey them exactly; they say what to emphasize, skip, or how to angle the video):\n"${focusInstructions.trim()}"\n`
    : '\n(No focus instructions — cover the source content as a whole, fairly and completely.)\n';
  const brand = brandName?.trim() ? ` for the brand "${brandName.trim()}"` : '';

  // Narration runs ~150 spoken words per minute.
  let lengthGuidance: string;
  if (targetMinutes && targetMinutes > 0) {
    const words = Math.round(targetMinutes * 150);
    lengthGuidance = `TARGET LENGTH: about ${targetMinutes} minute(s) of spoken narration — roughly ${words} words. Write enough real, substantive content to fill that honestly; do NOT pad with filler or repeat yourself just to hit the count.`;
  } else {
    lengthGuidance = `TARGET LENGTH: a tight, punchy explainer — about 90 to 160 seconds of narration (roughly 220-400 words). Every sentence must earn its place.`;
  }

  // Faithfulness rules differ for "AI writes it from a topic" vs real source.
  const fidelity = fromTopic
    ? `The SOURCE below is a TOPIC BRIEF, not finished content. Write an accurate,
well-informed explainer about it using reliable general knowledge. Stay
truthful — do NOT invent fake statistics, fake quotes, fake testimonials, or
specific claims you cannot stand behind.`
    : `Be genuinely ACCURATE to the source. Use its real facts, real product names,
real numbers, real details. NEVER invent statistics, features, testimonials, or
claims that the source content does not support. If the source is thin or
vague, keep the script proportionally short — do NOT fabricate detail to fill
space.`;

  return `You are an expert explainer-video scriptwriter${brand}.

YOUR JOB IN THIS STEP: read the SOURCE CONTENT below COMPLETELY and write the
FULL spoken narration script for an explainer video. This is step 1 of 2 — you
are ONLY writing the script now. Do NOT think about scenes, visuals, layouts,
or templates yet. Just write what the voiceover will actually say, start to
finish.

HOW TO WORK:
1. Read ALL of the source content carefully. Understand what it actually says —
   the product or topic, who it is for, the real problems it solves, and the
   concrete facts, numbers, names, and specific details.
2. ${fidelity}
3. Structure it naturally: a strong hook that names the problem or the promise,
   a clear middle that explains the substance, and a closing call to action.
4. Write in a confident, clear, spoken voice — short sentences, plain words,
   the way a great narrator actually talks. No headings, no bullet points, no
   stage directions, no "[Scene 1]" labels, no markdown. Just the flowing
   spoken words, in paragraphs.
5. ${lengthGuidance}
${focus}
Return ONLY the script text itself — plain text, no JSON, no markdown, no
preamble like "Here is the script". Just the words the narrator will speak.

SOURCE CONTENT:
${sourceText.slice(0, 60000)}`;
}

/** An image the director may place into a `media` scene. */
export interface DirectorImage {
  url: string;
  alt: string;
}

/**
 * Stage 2 — the DIRECTOR prompt.
 *
 * Takes a FINISHED, approved script and turns it into a scene list: segment
 * into beats, fit-match each beat to a template, write the on-screen copy.
 * When `images` are supplied (scraped from the source website) the director
 * may also place `media` scenes that show those real images.
 */
export function buildDirectorPrompt(
  script: string,
  focusInstructions: string | undefined,
  brandName: string | undefined,
  images: DirectorImage[] = [],
): string {
  const focus = focusInstructions?.trim()
    ? `\nFOCUS INSTRUCTIONS FROM THE USER (keep these in mind when choosing emphasis and on-screen wording):\n"${focusInstructions.trim()}"\n`
    : '';
  const brand = brandName?.trim() ? ` for "${brandName.trim()}"` : '';

  // When real images are available, offer the `media` template plus the
  // catalog of usable image URLs.
  const imageSection = images.length
    ? `

11. media — show a REAL image (a screenshot or photo pulled from the source
    website). JSON: { "type":"media", "mediaUrl":"<one EXACT url from the list
    below>", "frame":"browser" (for app/website screenshots) or "none" (for
    photos), "caption":"optional short caption", "narration":"..." }

AVAILABLE IMAGES — for a media scene you may use ONLY these exact URLs:
${images.map((im, i) => `[${i + 1}] ${im.url}${im.alt ? `  — ${im.alt}` : ''}`).join('\n')}

USE THESE IMAGES — a video with real visuals is far stronger than text alone.
Place a media scene wherever seeing the real product, screenshot, or photo
helps the viewer, and when several images genuinely fit, use several media
scenes — do not settle for just one. But only use an image where its subject
genuinely matches that beat's narration; skip anything that looks like a logo,
icon, or decorative graphic. Never invent or alter a URL; copy one exactly
from the list above.`
    : '';

  return `You are a motion-graphics video director${brand}. The SCRIPT below is
ALREADY WRITTEN and APPROVED. This is step 2 of 2: turn the finished script into
an animated scene list. You must NOT rewrite, summarize, shorten, lengthen, or
add to the script — your job is to stage it, not to write it.

${TEMPLATE_CATALOG}${imageSection}

YOUR JOB:
1. SEGMENT the script into ordered beats. A beat is a short contiguous slice of
   the script — usually one to three sentences — that belongs together as a
   single on-screen moment.
2. CRITICAL: every scene's "narration" field MUST be the EXACT, VERBATIM text of
   its beat, copied straight from the script. Concatenating every scene's
   "narration" in order, with a single space between each, MUST reproduce the
   ENTIRE script word-for-word. Do not drop, reorder, reword, paraphrase, or add
   a single sentence. The narration IS the script.
3. For EACH beat, choose the ONE scene template that genuinely FITS what that
   beat says — the template whose layout best carries that specific content.
4. Write the on-screen copy for the chosen template: short, punchy text fields
   derived from the beat. On-screen text is NOT the narration repeated — it is
   the few key words or phrases that should appear on screen while that
   narration is spoken.

CHOOSING TEMPLATES — FIT OVER VARIETY (this is important):
- Pick each template by FIT, never for the sake of variety. If five beats in a
  row are all best served by the same template, use that template five times in
  a row. That is correct and expected.
- Equally, never force the same template everywhere — use whatever each beat
  genuinely needs.
- Do NOT bend a beat to fit a template. Only use:
  - statCountUp when the beat genuinely centers on a real number from the script.
  - flowchart for an actual problem/consequence chain.
  - timeline for actual events ordered in time.
  - beforeAfter for a real contrast between two states.
  - quoteCard ONLY for an actual word-for-word quotation from a named or
    implied speaker — never for a normal narration sentence.
- If a beat is a single short sentence or a connective line that fits no
  specialized template, use kineticTitle (a punchy on-screen line) or
  bulletBuild. Never force such a beat into quoteCard, statCountUp, flowchart,
  timeline, or beforeAfter.

REQUIRED STRUCTURE:
- The FIRST scene MUST be a kineticTitle — the opening hook.
- The LAST scene MUST be a ctaEndCard. Find the closing call-to-action in the
  script (the part telling the viewer what to do next or where to go) and make
  that ONE ctaEndCard scene. Group the entire closing call-to-action into it —
  do not split the ending across kineticTitle/quoteCard/bulletBuild scenes. Its
  "narration" is that closing slice of the script; its "headline", "cta", and
  "url" fields are drawn from that same closing content.
- Everything between the first and last scene: fit each beat freely.

OTHER RULES:
- Keep all on-screen text short. The long-form wording lives only in narration.
- Optionally give each scene a "transition" — one of: fade, slide, wipe, flip,
  clockWipe — for visual flow.
- Return ONLY JSON, no prose, in exactly this shape:
  { "scenes": [ { ...scene... }, ... ] }
${focus}
THE APPROVED SCRIPT (segment this — do NOT change its words):
${script.slice(0, 40000)}`;
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
export function sanitizeScenes(raw: any, allowedImageUrls: string[] = []): AnyScene[] {
  const list: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.scenes)
      ? raw.scenes
      : [];
  const out: AnyScene[] = [];

  for (const s of list) {
    if (!s || typeof s !== 'object') continue;
    const type = String(s.type || '');
    // `media` is allowed too, but only with an image URL we actually provided.
    if (type !== 'media' && !DIRECTOR_TYPES.includes(type as any)) continue;

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
      case 'media': {
        // Only honour a media scene whose image is one we actually provided —
        // this stops the model inventing or hallucinating image URLs.
        const url = typeof s.mediaUrl === 'string' ? s.mediaUrl : '';
        if (url && allowedImageUrls.includes(url)) {
          const frame = ['browser', 'laptop', 'phone', 'none'].includes(s.frame)
            ? s.frame
            : 'none';
          scene = {
            ...base,
            mediaUrl: url,
            mediaType: 'image',
            frame,
            kenBurns: s.kenBurns !== false,
            caption: typeof s.caption === 'string' && s.caption ? s.caption : undefined,
          };
        }
        break;
      }
    }
    if (scene) out.push(scene);
  }
  return out;
}
